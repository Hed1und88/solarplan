const STRING_BACKUP_PREFIX = 'solarplan:project:';

export function stringLayoutBackupKey(projectId) {
  return `${STRING_BACKUP_PREFIX}${projectId}:string_layout_data`;
}

export function safeParseJson(raw, fallback = null) {
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

export function readStringLayoutBackup(projectId) {
  return readLocalJson(stringLayoutBackupKey(projectId));
}

function countPanelsFromString(item) {
  const nodeCount = Array.isArray(item?.nodes) ? new Set(item.nodes.map(node => node.panelId)).size : 0;
  return nodeCount || Number(item?.panel_count || 0) || 0;
}

function stringHasRealData(item) {
  return Boolean(
    item?.panelGroupId ||
    item?.pvInput ||
    item?.inverterConfigId ||
    item?.panelProductId ||
    countPanelsFromString(item) > 0 ||
    (Array.isArray(item?.nodes) && item.nodes.length > 0)
  );
}

export function scoreStringLayout(layout) {
  if (!layout || !Array.isArray(layout.strings)) return { score: -1, stringCount: 0, panelCount: 0, time: 0, hasNodes: 0, inverterCount: 0 };
  const stringsWithData = layout.strings.filter(stringHasRealData);
  const panelCount = stringsWithData.reduce((sum, item) => sum + countPanelsFromString(item), 0);
  const hasNodes = stringsWithData.reduce((sum, item) => sum + (Array.isArray(item.nodes) && item.nodes.length ? 1 : 0), 0);
  const inverterCount = Array.isArray(layout.inverterConfigs) ? layout.inverterConfigs.filter(cfg => cfg.productId).length : 0;
  const time = new Date(layout._local_string_backup_at || layout.savedAt || layout.updated_date || 0).getTime() || 0;
  return {
    score: panelCount * 100000 + stringsWithData.length * 1000 + inverterCount * 100 + hasNodes * 10 + Math.floor(time / 1000000000),
    stringCount: stringsWithData.length,
    panelCount,
    hasNodes,
    inverterCount,
    time,
  };
}

function sortLayoutsByContent(candidates) {
  return candidates
    .filter(layout => layout && Array.isArray(layout.strings))
    .sort((a, b) => {
      const sa = scoreStringLayout(a);
      const sb = scoreStringLayout(b);
      if (sb.panelCount !== sa.panelCount) return sb.panelCount - sa.panelCount;
      if (sb.stringCount !== sa.stringCount) return sb.stringCount - sa.stringCount;
      if (sb.inverterCount !== sa.inverterCount) return sb.inverterCount - sa.inverterCount;
      if (sb.hasNodes !== sa.hasNodes) return sb.hasNodes - sa.hasNodes;
      return sb.time - sa.time;
    });
}

export function writeStringLayoutBackup(projectId, payload) {
  if (typeof window === 'undefined' || !projectId || !payload) return;
  try {
    const key = stringLayoutBackupKey(projectId);
    const existing = readLocalJson(key);
    const next = { ...payload, _local_string_backup_at: new Date().toISOString() };
    const existingScore = scoreStringLayout(existing);
    const nextScore = scoreStringLayout(next);

    // Never overwrite a richer local sling-backup with an empty/poorer layout.
    if (existingScore.score > nextScore.score && existingScore.panelCount > nextScore.panelCount) return;

    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

export function readBestStringLayout(project) {
  const server = safeParseJson(project?.string_layout_data, null);
  const standalone = readStringLayoutBackup(project?.id);
  let projectBackup = null;

  if (typeof window !== 'undefined' && project?.id) {
    try {
      const raw = window.localStorage.getItem(`solarplan:project-backup:${project.id}`);
      const backupProject = raw ? JSON.parse(raw) : null;
      projectBackup = safeParseJson(backupProject?.string_layout_data, null);
    } catch {}
  }

  const candidates = [server, projectBackup, standalone].filter(layout => layout && Array.isArray(layout.strings));
  if (!candidates.length) return server || standalone || projectBackup || null;

  return sortLayoutsByContent(candidates)[0];
}

function compactProductSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    name: snapshot.name,
    brand: snapshot.brand,
    model: snapshot.model,
    power_watts: snapshot.power_watts,
    voc_v: snapshot.voc_v,
    vmp_v: snapshot.vmp_v,
    isc_a: snapshot.isc_a,
    imp_a: snapshot.imp_a,
    width_mm: snapshot.width_mm,
    height_mm: snapshot.height_mm,
    noct_c: snapshot.noct_c,
    temp_coeff_pmax_percent_c: snapshot.temp_coeff_pmax_percent_c,
    temp_coeff_voc_percent_c: snapshot.temp_coeff_voc_percent_c,
    temp_coeff_isc_percent_c: snapshot.temp_coeff_isc_percent_c,
  };
}

export function compactStringLayoutForServer(layout) {
  if (!layout || !Array.isArray(layout.strings)) return layout || {};
  return {
    version: layout.version || 10,
    source: layout.source || null,
    panelProductMode: layout.panelProductMode || 'per_roof_panel_group',
    stringCount: layout.stringCount || layout.strings.length,
    panelProductId: layout.panelProductId || '',
    inverterProductId: layout.inverterProductId || '',
    inverterConfigs: Array.isArray(layout.inverterConfigs) ? layout.inverterConfigs.map(cfg => ({
      id: cfg.id,
      name: cfg.name,
      productId: cfg.productId,
    })) : [],
    selectedInverterConfigId: layout.selectedInverterConfigId || '',
    selectedMppt: layout.selectedMppt || 1,
    selectedPv: layout.selectedPv || 1,
    settings: layout.settings || {},
    savedAt: new Date().toISOString(),
    autosave: true,
    compact: true,
    strings: layout.strings.map(item => {
      const compact = {
        id: item.id,
        name: item.name,
        color: item.color,
        panel_count: countPanelsFromString(item),
        panelGroupId: item.panelGroupId || '',
        panelProductId: item.panelProductId || '',
        panelProductSnapshot: compactProductSnapshot(item.panelProductSnapshot),
        inverterConfigId: item.inverterConfigId || '',
        inverterProductId: item.inverterProductId || '',
        mppt: item.mppt || 1,
        pvInput: item.pvInput || '',
      };

      if (!item.panelGroupId && Array.isArray(item.nodes) && item.nodes.length) compact.nodes = item.nodes;
      return compact;
    }),
  };
}
