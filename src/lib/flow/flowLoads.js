import { FLOW, FLOW_CP } from './flowConstants.js';
// Ateranvand qp fran den befintliga motorn - EXPORTERA peakVelocityPressurePa
// fran nordmountValidated.js och importera den har (en sanning for qp).
import { peakVelocityPressurePa } from '@/lib/mountingEngines/nordmountValidated.js';

const ZONE_KEYS = ['roofEdge_panelEdge', 'roofMid_panelEdge', 'roofEdge_panelMid', 'roofMid_panelMid'];

// Sno pa Flow: lodrat snolast styrs av TAKvinkeln (5 deg), inte panellutningen (10 deg).
export function flowSnowPa({ groundSnowKnM2, roofAngleDeg }) {
  const mu1 = roofAngleDeg <= 30 ? 0.8 : Math.max(0, 0.8 * (60 - roofAngleDeg) / 30);
  const g = FLOW.snowGByRoofAngle[roofAngleDeg];
  const preliminary = g == null;            // gFlow bara validerat vid 5 deg
  const gUsed = g ?? 1.24;                  // fallback, flaggas preliminar
  return {
    snowPa: Math.round((Number(groundSnowKnM2) || 0) * 1000 * mu1 * gUsed),
    mu1,
    gFlow: gUsed,
    preliminary,
  };
}

// Panelvindtryck per zon [Pa] for parallel|eastwest
export function flowPanelWind({ orientation, referenceWindMs, ridgeHeightM, terrainCategory }) {
  const { peakPressurePa: qp } = peakVelocityPressurePa(referenceWindMs, ridgeHeightM, terrainCategory);
  const cp = FLOW_CP[orientation];
  if (!cp) throw new Error(`Okand Flow-orientering: ${orientation}`);
  const out = {};
  for (const k of ZONE_KEYS) out[k] = Math.round(qp * cp[k]); // negativt = sug
  return { qpPa: Math.round(qp), perZonePa: out };
}
