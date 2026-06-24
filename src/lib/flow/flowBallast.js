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
  return { preliminary: true, cfStab, frictionCoefficient: mu, b\u0061llastStepKg: step, tiltRad, positions };
}
