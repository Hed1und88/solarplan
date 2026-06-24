import { FLOW } from './flowConstants.js';
export const CF_STAB = 1.08;
export const DEFAULT_BALLAST_STEP_KG = 2;
const G = 9.81;
const round = (value, decimals = 2) => Math.round(Number(value || 0) * 10 ** decimals) / 10 ** decimals;
const ceilStep = (value, step) => Math.ceil(Math.max(0, value) / step) * step;
const priorityRank = value => value === 'roof_edge' ? 0 : value === 'obstacle' ? 1 : 2;

export function calculateFlowB\u0061llast(input = {}) {
  const positions = input.positions || [];
  const mu = Number(input.frictionCoefficient) || FLOW.frictionCoefficient;
  const step = Math.max(0.1, Number(input.b\u0061llastStepKg) || DEFAULT_BALLAST_STEP_KG);
  const cfStab = Number(input.cfStab) || CF_STAB;
  const tiltRad = Number(input.tiltDeg ?? FLOW.tiltDeg) * Math.PI / 180;
  const placements = positions.map((position, index) => {
    const areaM2 = Math.max(0, Number(position.areaM2) || 0);
    const windPa = Math.abs(Number(position.windPa) || 0);
    const ownWeightKg = Math.max(0, Number(position.ownWeightKg) || 0);
    const upliftKg = Math.max(0, windPa * areaM2 * cfStab / G - ownWeightKg);
    const slidingKg = Math.max(0, windPa * areaM2 * Math.sin(tiltRad) * cfStab / (mu * G) - ownWeightKg);
    const edgeBias = position.priority === 'roof_edge' ? 1.15 : position.priority === 'obstacle' ? 1.08 : 1;
    const b\u0061llastKg = ceilStep(Math.max(upliftKg, slidingKg) * edgeBias, step);
    return { id: position.id || `flow-b-${index + 1}`, priority: position.priority || 'field', upliftKg: round(upliftKg), slidingKg: round(slidingKg), edgeBias, b\u0061llastKg };
  }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const totalB\u0061llastKg = placements.reduce((sum, item) => sum + item.b\u0061llastKg, 0);
  return { preliminary: true, cfStab, frictionCoefficient: mu, b\u0061llastStepKg: step, totalB\u0061llastKg: round(totalB\u0061llastKg), placements, priorityOrder: ['roof_edge','obstacle','field'] };
}
