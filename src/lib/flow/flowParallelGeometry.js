import { FLOW } from './flowConstants.js';
export function selectDockPosition(panelClampZone) {
  const { minMm, maxMm } = panelClampZone || {};
  if (minMm == null || maxMm == null) return { ok:false, reason:'Panelens klämzon saknas.' };
  const candidates = FLOW.parallelDockPositionsMm.filter(p => p >= minMm && p <= maxMm);
  if (!candidates.length) return { ok:false, reason:'Ingen Flow Dock-position (730/980/1110) ryms i panelens klämzon.' };
  return { ok:true, dockPositionMm:Math.max(...candidates) };
}
export function checkRailOverhang({ overhangMm, usesEndCap }) {
  const issues = [];
  if (overhangMm > FLOW.parallelMaxRailOverhangMm) issues.push(`Skenutstick ${overhangMm} mm > max ${FLOW.parallelMaxRailOverhangMm} mm.`);
  if (usesEndCap && (overhangMm < FLOW.parallelEndCapOverhangMinMm || overhangMm > FLOW.parallelEndCapOverhangMaxMm)) issues.push(`Ändlock kräver utstick ${FLOW.parallelEndCapOverhangMinMm}–${FLOW.parallelEndCapOverhangMaxMm} mm (är ${overhangMm} mm).`);
  return issues;
}
export const parallelSideGapMm = () => FLOW.sideGapMm;
