import { FLOW } from './flowConstants.js';
export function selectDockPosition(panelClampZone) {
  const { minMm, maxMm } = panelClampZone || {};
  if (minMm == null || maxMm == null) return { ok:false, reason:'Panelens klämzon saknas.' };
  const candidates = FLOW.parallelDockPositionsMm.filter(p => p >= minMm && p <= maxMm);
  if (!candidates.length) return { ok:false, reason:'Ingen Flow Dock-position (730/980/1110) ryms i panelens klämzon.' };
  return { ok:true, dockPositionMm:Math.max(...candidates) };
}
