import { FLOW } from './flowConstants.js';
export const CF_STAB = 1.08;
export const DEFAULT_BALLAST_STEP_KG = 2;
const G = 9.81;
const round = (value, decimals = 2) => Math.round(Number(value || 0) * 10 ** decimals) / 10 ** decimals;
const ceilStep = (value, step) => Math.ceil(Math.max(0, value) / step) * step;
const priorityRank = value => value === 'roof_edge' ? 0 : value === 'obstacle' ? 1 : 2;
