import { FLOW } from './flowConstants.js';

// Valj Flow Dock-lage ur panelens klamzon (avstand mellan klamzoner).
// panelClampZone: { minMm, maxMm } fran paneldata.
export function selectDockPosition(panelClampZone) {
  const { minMm, maxMm } = panelClampZone || {};
  if (minMm == null || maxMm == null) {
    return { ok: false, reason: 'Panelens klamzon saknas.' };
  }
  const candidates = FLOW.parallelDockPositionsMm.filter(p => p >= minMm && p <= maxMm);
  if (!candidates.length) {
    return { ok: false, reason: 'Ingen Flow Dock-position (730/980/1110) ryms i panelens klamzon.' };
  }
  return { ok: true, dockPositionMm: Math.max(...candidates) };
}

// Guards for skenutstick. Returnerar lista av varningar/blockeringar.
export function checkRailOverhang({ overhangMm, usesEndCap }) {
  const issues = [];
  if (overhangMm > FLOW.parallelMaxRailOverhangMm) {
    issues.push(`Skenutstick ${overhangMm} mm > max ${FLOW.parallelMaxRailOverhangMm} mm.`);
  }
  if (
    usesEndCap
    && (overhangMm < FLOW.parallelEndCapOverhangMinMm || overhangMm > FLOW.parallelEndCapOverhangMaxMm)
  ) {
    issues.push(`Andlock kraver utstick ${FLOW.parallelEndCapOverhangMinMm}-${FLOW.parallelEndCapOverhangMaxMm} mm (ar ${overhangMm} mm).`);
  }
  return issues;
}

export const parallelSideGapMm = () => FLOW.sideGapMm; // 20 mm
