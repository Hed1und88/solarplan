import { attachCompanyOwnership, canEditProject, canViewProject, filterProjectsForUser, resolveAccessContext } from '@/lib/accessControl';

const PROJECT_BACKUP_PREFIX = 'solarplan:project-backup:';

const PROJECT_SERVER_FIELDS = new Set([
  'name', 'customer_name', 'address', 'status', 'roof_width_m', 'roof_height_m', 'roof_image_url',
  'panel_layout_data', 'solar_roof_planner_data', 'existing_installation_image_url', 'string_layout_data',
  'battery_image_url', 'battery_layout_data', 'mounting_data', 'solar_data', 'selected_products', 'total_cost', 'notes',
  'company_id', 'companyId', 'organization_id', 'organizationId', 'tenant_id', 'tenantId', 'owner_company_id', 'ownerCompanyId',
  'owner_email', 'owner_role', 'created_by_email', 'employee_can_edit', 'wholesaler_emails', 'allowed_wholesaler_emails', 'guest_emails',
]);

const JSON_STRING_FIELDS = new Set(['panel_layout_data', 'solar_roof_planner_data', 'string_layout_data', 'battery_layout_data', 'mounting_data', 'solar_data']);

async function currentUserSafe(base44) {
  try {
    if (base44?.auth?.me) return await base44.auth.me();
    if (base44?.auth?.currentUser) return await base44.auth.currentUser();
  } catch {}
  return null;
}

function safeParseJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function readLocalJson(key) {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeJsonStringField(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return value;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function normalizeProjectPatchForServer(patch = {}) {
  const normalized = { ...(patch || {}) };
  if (normalized.solar_roof_planner_data !== undefined && normalized.panel_layout_data === undefined) normalized.panel_layout_data = normalized.solar_roof_planner_data;
  const serverPatch = {};
  Object.entries(normalized).forEach(([key, value]) => {
    if (!PROJECT_SERVER_FIELDS.has(key) || value === undefined) return;
    serverPatch[key] = JSON_STRING_FIELDS.has(key) ? normalizeJsonStringField(value) : value;
  });
  return serverPatch;
}

function countPanelsInSolarRoof(raw) {
  const data = typeof raw === 'string' ? safeParseJson(raw, null) : raw;
  if (!data || !Array.isArray(data.roofs)) return 0;
  return data.roofs.reduce((sum, roof) => sum + (roof.panelGroups || []).reduce((groupSum, group) => {
    const rows = Number(group.rows || 0) || 0;
    const cols = Number(group.cols || 0) || 0;
    return groupSum + Math.max(0, Math.round(rows * cols));
  }, 0), 0);
}

function countRoofs(raw) {
  const data = typeof raw === 'string' ? safeParseJson(raw, null) : raw;
  return Array.isArray(data?.roofs) ? data.roofs.length : 0;
}

function panelPlannerScore(raw) {
  const data = typeof raw === 'string' ? safeParseJson(raw, null) : raw;
  if (!data || !Array.isArray(data.roofs)) return -1;
  const roofs = countRoofs(data);
  const panels = countPanelsInSolarRoof(data);
  const movedPanels = data.roofs.reduce((sum, roof) => sum + (roof.panelGroups || []).reduce((groupSum, group) => groupSum + Object.keys(group.panelOverrides || {}).length, 0), 0);
  const time = new Date(data.savedAt || data.updatedAt || data._local_panel_backup_at || 0).getTime() || 0;
  return panels * 100000 + roofs * 1000 + movedPanels * 10 + Math.floor(time / 1000000000);
}

function countPanelsFromString(item) {
  const nodeCount = Array.isArray(item?.nodes) ? new Set(item.nodes.map(node => node.panelId)).size : 0;
  return nodeCount || Number(item?.panel_count || 0) || 0;
}

function stringHasRealData(item) {
  return Boolean(item?.panelGroupId || item?.pvInput || item?.inverterConfigId || item?.panelProductId || countPanelsFromString(item) > 0 || (Array.isArray(item?.nodes) && item.nodes.length > 0));
}

function stringLayoutScore(raw) {
  const data = typeof raw === 'string' ? safeParseJson(raw, null) : raw;
  if (!data || !Array.isArray(data.strings)) return -1;
  const stringsWithData = data.strings.filter(stringHasRealData);
  const panels = stringsWithData.reduce((sum, item) => sum + countPanelsFromString(item), 0);
  const inverters = Array.isArray(data.inverterConfigs) ? data.inverterConfigs.filter(cfg => cfg.productId).length : 0;
  const hasNodes = stringsWithData.reduce((sum, item) => sum + (Array.isArray(item.nodes) && item.nodes.length ? 1 : 0), 0);
  const time = new Date(data.savedAt || data._local_string_backup_at || 0).getTime() || 0;
  return panels * 100000 + stringsWithData.length * 1000 + inverters * 100 + hasNodes * 10 + Math.floor(time / 1000000000);
}

function chooseBestRaw(candidates, scorer) {
  const scored = candidates.filter(value => value !== undefined && value !== null && value !== '').map(value => ({ value, score: scorer(value) })).filter(item => item.score >= 0).sort((a, b) => b.score - a.score);
  return scored[0]?.value;
}

export function projectBackupKey(projectId) {
  return `${PROJECT_BACKUP_PREFIX}${projectId}`;
}

export function readProjectBackup(projectId) {
  if (typeof window === 'undefined' || !projectId) return null;
  try {
    const raw = window.localStorage.getItem(projectBackupKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeProjectBackup(project) {
  if (typeof window === 'undefined' || !project?.id) return;
  try {
    const key = projectBackupKey(project.id);
    const existing = readLocalJson(key);
    const next = { ...project, _local_backup_at: new Date().toISOString() };
    const existingPanelScore = panelPlannerScore(existing?.solar_roof_planner_data || existing?.panel_layout_data);
    const nextPanelScore = panelPlannerScore(next?.solar_roof_planner_data || next?.panel_layout_data);
    if (existingPanelScore > nextPanelScore) {
      next.solar_roof_planner_data = existing.solar_roof_planner_data || existing.panel_layout_data;
      next.panel_layout_data = existing.panel_layout_data || existing.solar_roof_planner_data;
    }
    const existingStringScore = stringLayoutScore(existing?.string_layout_data);
    const nextStringScore = stringLayoutScore(next?.string_layout_data);
    if (existingStringScore > nextStringScore) next.string_layout_data = existing.string_layout_data;
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

export function mergeProjectWithBackup(project) {
  if (!project?.id) return project || null;
  const backup = readProjectBackup(project.id);
  const standalonePanelBackup = readLocalJson(`solarplan:project:${project.id}:solar_roof_planner_data`);
  const standaloneStringBackup = readLocalJson(`solarplan:project:${project.id}:string_layout_data`);
  if (!backup && !standalonePanelBackup && !standaloneStringBackup) return project;
  const projectTime = new Date(project.updated_date || project.updated_at || project.modified_date || 0).getTime() || 0;
  const backupTime = new Date(backup?._local_backup_at || backup?.updated_date || backup?.updated_at || 0).getTime() || 0;
  const merged = backupTime > projectTime ? { ...project, ...(backup || {}), id: project.id } : { ...(backup || {}), ...project, id: project.id };
  const bestPanel = chooseBestRaw([project.solar_roof_planner_data, backup?.solar_roof_planner_data, standalonePanelBackup, project.panel_layout_data, backup?.panel_layout_data], panelPlannerScore);
  if (bestPanel) {
    const panelString = typeof bestPanel === 'string' ? bestPanel : JSON.stringify(bestPanel);
    merged.solar_roof_planner_data = panelString;
    merged.panel_layout_data = panelString;
  }
  const bestString = chooseBestRaw([project.string_layout_data, backup?.string_layout_data, standaloneStringBackup], stringLayoutScore);
  if (bestString) merged.string_layout_data = typeof bestString === 'string' ? bestString : JSON.stringify(bestString);
  return merged;
}

export async function fetchProjectById(base44, projectId) {
  if (!projectId) return null;
  const user = await currentUserSafe(base44);
  let project = null;
  if (base44?.entities?.Project?.get) {
    try {
      const fetched = await base44.entities.Project.get(projectId);
      if (fetched?.id) project = fetched;
    } catch {}
  }
  if (!project) {
    const rows = await base44.entities.Project.list('-updated_date');
    project = (filterProjectsForUser(rows || [], user || {}).find(item => item.id === projectId)) || null;
  }
  if (!project) return null;
  if (!canViewProject(user || {}, project)) throw new Error('Åtkomst nekad. Din roll får inte se detta projekt.');
  return project;
}

export async function saveProjectPatch(base44, currentProject, patch) {
  if (!currentProject?.id) throw new Error('Projekt-id saknas. Kan inte spara.');
  const user = await currentUserSafe(base44);
  const access = resolveAccessContext(user || {});
  if (!canEditProject(user || {}, currentProject)) throw new Error(`Åtkomst nekad. Rollen ${access.role} får inte ändra detta projekt.`);
  const ownedPatch = attachCompanyOwnership(patch || {}, user || {});
  const serverPatch = normalizeProjectPatchForServer(ownedPatch);
  const optimisticProject = { ...currentProject, ...(patch || {}), ...serverPatch, updated_date: new Date().toISOString() };
  writeProjectBackup(optimisticProject);
  let updated = null;
  if (Object.keys(serverPatch).length > 0) updated = await base44.entities.Project.update(currentProject.id, serverPatch);
  const fresh = await fetchProjectById(base44, currentProject.id).catch(() => null);
  const merged = mergeProjectWithBackup({ ...optimisticProject, ...(updated || {}), ...(fresh || {}), ...(patch || {}), ...serverPatch, id: currentProject.id, _last_save_ok_at: new Date().toISOString() });
  writeProjectBackup(merged);
  return merged;
}
