import { FLOW, FLOW_PRODUCTS } from './flowConstants.js';
import { calculateFlowBallast } from './flowBallast.js';

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 2) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const normalize = value => String(value || '').trim().toLowerCase();

export function calculateFlowAssembly() { return null; }
