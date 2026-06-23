import { attachCompanyOwnership, canEditProject, canViewProject, filterProjectsForUser, resolveAccessContext } from '@/lib/accessControl';

const BACKUP_PREFIX = 'solarplan:project-backup:';
const SERVER_FIELDS = new Set([
  'name','customer_name','customer_email','customer_phone','street_address','postal_code','postal_city','address','status',
  'latitude','longitude','snow_load_kn_m2','wind_load_ms','climate_load_source','climate_load_updated_at','climate_load_status',
  'roof_width_m','roof_height_m','roof_image_url','panel_layout_data','solar_roof_planner_data','existing_installation_image_url',
  'string_layout_data','battery_image_url','battery_layout_data','mounting_data','solar_data','selected_products','total_cost','notes',
  'company_id','companyId','organization_id','organizationId','tenant_id','tenantId','owner_company_id','ownerCompanyId',
  'owner_email','owner_role','created_by_email','employee_can_edit','wholesaler_emails','allowed_wholesaler_emails','guest_emails',
]);
const JSON_FIELDS = new Set(['panel_layout_data','solar_roof_planner_data','string_layout_data','battery_layout_data','mounting_data','solar_data']);

async function currentUser(base44) {
  try {
    if (base44?.auth?.me) return await base44.auth.me();
    if (base44?.auth?.currentUser) return await base44.auth.currentUser();
  } catch {}
  return null;
}

const parse = (raw, fallback = null) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const localJson = key => {
  if (typeof window === 'undefined' || !key) return null;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const jsonValue = value => value === undefined ? undefined : value === null || value === '' || typeof value === 'string' ? value : JSON.stringify(value);

function serverPatch(patch = {}) {
  const normalized = { ...patch };
  if (normalized.solar_roof_planner_data !== undefined && normalized.panel_layout_data === undefined) normalized.panel_layout_data = normalized.solar_roof_planner_data;
  return Object.fromEntries(Object.entries(normalized)
    .filter(([key, value]) => SERVER_FIELDS.has(key) && value !== undefined)
    .map(([key, value]) => [key, JSON_FIELDS.has(key) ? jsonValue(value) : value]));
}

function roofData(raw) { const data = typeof raw === 'string' ? parse(raw) : raw; return Array.isArray(data?.roofs) ? data : null; }
function panelScore(raw) {
  const data = roofData(raw); if (!data) return -1;
  let panels = 0; let moved = 0;
  data.roofs.forEach(roof => (roof.panelGroups || []).forEach(group => {
    panels += Math.max(0, Math.round((Number(group.rows) || 0) * (Number(group.cols) || 0)));
    moved += Object.keys(group.panelOverrides || {}).length;
  }));
  const time = new Date(data.savedAt || data.updatedAt || data._local_panel_backup_at || 0).getTime() || 0;
  return panels * 100000 + data.roofs.length * 1000 + moved * 10 + Math.floor(time / 1000000000);
}
function stringScore(raw) {
  const data = typeof raw === 'string' ? parse(raw) : raw;
  if (!Array.isArray(data?.strings)) return -1;
  const useful = data.strings.filter(item => item?.panelGroupId || item?.pvInput || item?.inverterConfigId || item?.panelProductId || (item?.nodes || []).length || Number(item?.panel_count || 0));
  const panels = useful.reduce((sum, item) => sum + ((item?.nodes || []).length ? new Set(item.nodes.map(node => node.panelId)).size : Number(item?.panel_count || 0)), 0);
  const inverters = Array.isArray(data.inverterConfigs) ? data.inverterConfigs.filter(item => item.productId).length : 0;
  const time = new Date(data.savedAt || data._local_string_backup_at || 0).getTime() || 0;
  return panels * 100000 + useful.length * 1000 + inverters * 100 + Math.floor(time / 1000000000);
}
function batteryScore(raw) {
  const data = typeof raw === 'string' ? parse(raw) : raw;
  if (!data || typeof data !== 'object') return -1;
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  const walls = rooms.reduce((sum, room) => sum + (Array.isArray(room.walls) ? room.walls.length : 0), Array.isArray(data.walls) ? data.walls.length : 0);
  const doors = rooms.reduce((sum, room) => sum + (Array.isArray(room.doors) ? room.doors.length : 0), Array.isArray(data.doors) ? data.doors.length : 0);
  const devices = Array.isArray(data.devices) ? data.devices.length : 0;
  const obstacles = Array.isArray(data.obstacles) ? data.obstacles.length : 0;
  const photos = Array.isArray(data.photoItems) ? data.photoItems.length : 0;
  const time = new Date(data.savedAt || data.updatedAt || data._local_battery_backup_at || 0).getTime() || 0;
  return devices * 1000000 + rooms.length * 100000 + walls * 1000 + doors * 100 + obstacles * 10 + photos + Math.floor(time / 1000000000);
}
function best(candidates, scorer) {
  return candidates.filter(value => value !== undefined && value !== null && value !== '')
    .map(value => ({ value, score: scorer(value) })).filter(item => item.score >= 0).sort((a,b) => b.score - a.score)[0]?.value;
}

export const projectBackupKey = projectId => `${BACKUP_PREFIX}${projectId}`;
export function readProjectBackup(projectId) { return projectId ? localJson(projectBackupKey(projectId)) : null; }

export function writeProjectBackup(project) {
  if (typeof window === 'undefined' || !project?.id) return;
  try {
    const key = projectBackupKey(project.id);
    const existing = localJson(key);
    const next = { ...project, _local_backup_at: new Date().toISOString() };
    if (panelScore(existing?.solar_roof_planner_data || existing?.panel_layout_data) > panelScore(next.solar_roof_planner_data || next.panel_layout_data)) {
      next.solar_roof_planner_data = existing.solar_roof_planner_data || existing.panel_layout_data;
      next.panel_layout_data = existing.panel_layout_data || existing.solar_roof_planner_data;
    }
    if (stringScore(existing?.string_layout_data) > stringScore(next.string_layout_data)) next.string_layout_data = existing.string_layout_data;
    if (batteryScore(existing?.battery_layout_data) > batteryScore(next.battery_layout_data)) next.battery_layout_data = existing.battery_layout_data;
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

export function mergeProjectWithBackup(project) {
  if (!project?.id) return project || null;
  const backup = readProjectBackup(project.id);
  const panelLocal = localJson(`solarplan:project:${project.id}:solar_roof_planner_data`);
  const stringLocal = localJson(`solarplan:project:${project.id}:string_layout_data`);
  const batteryLocal = localJson(`solarplan:project:${project.id}:battery_layout_data`);
  if (!backup && !panelLocal && !stringLocal && !batteryLocal) return project;
  const projectTime = new Date(project.updated_date || project.updated_at || project.modified_date || 0).getTime() || 0;
  const backupTime = new Date(backup?._local_backup_at || backup?.updated_date || backup?.updated_at || 0).getTime() || 0;
  const merged = backupTime > projectTime ? { ...project, ...(backup || {}), id: project.id } : { ...(backup || {}), ...project, id: project.id };
  const panel = best([project.solar_roof_planner_data,backup?.solar_roof_planner_data,panelLocal,project.panel_layout_data,backup?.panel_layout_data], panelScore);
  if (panel) merged.solar_roof_planner_data = merged.panel_layout_data = typeof panel === 'string' ? panel : JSON.stringify(panel);
  const strings = best([project.string_layout_data,backup?.string_layout_data,stringLocal], stringScore);
  if (strings) merged.string_layout_data = typeof strings === 'string' ? strings : JSON.stringify(strings);
  const battery = best([project.battery_layout_data, backup?.battery_layout_data, batteryLocal], batteryScore);
  if (battery) merged.battery_layout_data = typeof battery === 'string' ? battery : JSON.stringify(battery);
  return merged;
}

export async function fetchProjectById(base44, projectId) {
  if (!projectId) return null;
  const user = await currentUser(base44);
  let project = null;
  try { project = await base44?.entities?.Project?.get?.(projectId); } catch {}
  if (!project?.id) {
    const rows = await base44.entities.Project.list('-updated_date');
    project = filterProjectsForUser(rows || [], user || {}).find(item => item.id === projectId) || null;
  }
  if (!project) return null;
  if (!canViewProject(user || {}, project)) throw new Error('Åtkomst nekad. Din roll får inte se detta projekt.');
  return project;
}

export async function saveProjectPatch(base44, currentProject, patch) {
  if (!currentProject?.id) throw new Error('Projekt-id saknas. Kan inte spara.');
  const user = await currentUser(base44);
  const access = resolveAccessContext(user || {});
  if (!canEditProject(user || {}, currentProject)) throw new Error(`Åtkomst nekad. Rollen ${access.role} får inte ändra detta projekt.`);
  const filtered = serverPatch(attachCompanyOwnership(patch || {}, user || {}));
  const optimistic = { ...currentProject, ...patch, ...filtered, updated_date: new Date().toISOString() };
  writeProjectBackup(optimistic);
  const updated = Object.keys(filtered).length ? await base44.entities.Project.update(currentProject.id, filtered) : null;
  const fresh = await fetchProjectById(base44, currentProject.id).catch(() => null);
  const merged = mergeProjectWithBackup({ ...optimistic, ...(updated || {}), ...(fresh || {}), ...patch, ...filtered, id: currentProject.id, _last_save_ok_at: new Date().toISOString() });
  writeProjectBackup(merged);
  return merged;
}
