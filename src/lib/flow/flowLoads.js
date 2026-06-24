import { FLOW, FLOW_CP } from './flowConstants.js';
import { peakVelocityPressurePa } from '@/lib/mountingEngines/nordmountValidated.js';

const ZONE_KEYS = ['roofEdge_panelEdge','roofMid_panelEdge','roofEdge_panelMid','roofMid_panelMid'];

export function flowSnowPa({ groundSnowKnM2, roofAngleDeg }) {
  const mu1 = roofAngleDeg <= 30 ? 0.8 : Math.max(0, 0.8 * (60 - roofAngleDeg) / 30);
  const g = FLOW.snowGByRoofAngle[roofAngleDeg];
  const preliminary = g == null;
  const gUsed = g ?? 1.24;
  return { snowPa: Math.round((Number(groundSnowKnM2) || 0) * 1000 * mu1 * gUsed), mu1, gFlow: gUsed, preliminary };
}

export function flowPanelWind({ orientation, referenceWindMs, ridgeHeightM, terrainCategory }) {
  const { peakPressurePa: qp } = peakVelocityPressurePa(referenceWindMs, ridgeHeightM, terrainCategory);
  const cp = FLOW_CP[orientation];
  const out = {};
  for (const k of ZONE_KEYS) out[k] = Math.round(qp * cp[k]);
  return { qpPa: Math.round(qp), perZonePa: out };
}
