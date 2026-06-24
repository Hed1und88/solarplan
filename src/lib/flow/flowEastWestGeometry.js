import { FLOW, FLOW_PANEL_WIDTH_RANGES } from './flowConstants.js';

// Tillaten panelbredd for Tower/Wing
export function panelWidthMode(panelWidthMm) {
  const r = FLOW_PANEL_WIDTH_RANGES.find(x => panelWidthMm >= x.minMm && panelWidthMm <= x.maxMm);
  return r ? { ok: true, mode: r.mode } : {
    ok: false,
    reason: `Panelbredd ${panelWidthMm} mm utanfor Tower/Wing (984-1040 eller 1118-1174 mm).`,
  };
}

// Faltets hojd for N panelrader (ost/vast, taltstruktur).
// rader grupperas i block om 2 (ost+vast). nock per block, valley mellan block.
export function eastWestFieldHeightMm({ rows, panelLengthMm }) {
  const proj = panelLengthMm * Math.cos(FLOW.tiltDeg * Math.PI / 180);
  const blocks = Math.floor(rows / 2);
  const nockGaps = blocks;
  const valleyGaps = Math.max(0, blocks - 1);
  return rows * proj + nockGaps * FLOW.eastWestNockGapMm + valleyGaps * FLOW.eastWestValleyGapMm;
}

export const eastWestGaps = () => ({
  sideGapMm: FLOW.sideGapMm,
  valleyGapMm: FLOW.eastWestValleyGapMm,
  nockGapMm: FLOW.eastWestNockGapMm,
});
