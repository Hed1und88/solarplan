import { FLOW } from './flowConstants.js';

export const CF_STAB = {
  parallel: 2.04,
  eastwest: 2.37,
};
export const DEFAULT_BALLAST_STEP_KG = 2;

const G = 9.81;
const STONES_KG = [14, 7, 4.5];
const round = (value, decimals = 2) => Math.round(Number(value || 0) * 10 ** decimals) / 10 ** decimals;
const priorityRank = value => value === 'roof_edge' ? 0 : value === 'obstacle' ? 1 : 2;

function ceilStep(value, step) {
  return Math.ceil(Math.max(0, value) / step) * step;
}

function cfFor(input) {
  if (Number.isFinite(Number(input.cfStab))) return Number(input.cfStab);
  const orientation = input.orientation === 'eastwest' ? 'eastwest' : 'parallel';
  return CF_STAB[orientation];
}

function stoneRound(kg) {
  let rest = Math.ceil(Math.max(0, Number(kg) || 0));
  const breakdown = {};
  for (const stone of STONES_KG) {
    const count = Math.floor(rest / stone);
    if (count > 0) {
      breakdown[stone] = count;
      rest -= count * stone;
    }
  }
  if (rest > 0) {
    const last = STONES_KG[STONES_KG.length - 1];
    breakdown[last] = (breakdown[last] || 0) + 1;
  }
  const total = Object.entries(breakdown).reduce((sum, [stone, count]) => sum + Number(stone) * count, 0);
  return { kg: round(total, 1), breakdown };
}

// Ballastmodell: uplift + glidning med Flow Strip mu 0,6, kantbias och stenavrundning.
export function calculateFlowBallast(input = {}) {
  const positions = input.positions || [];
  const mu = Number(input.frictionCoefficient) || FLOW.frictionCoefficient;
  const step = Math.max(0.1, Number(input.ballastStepKg) || DEFAULT_BALLAST_STEP_KG);
  const cfStab = cfFor(input);
  const tiltRad = Number(input.tiltDeg ?? FLOW.tiltDeg) * Math.PI / 180;

  const placements = positions.map((position, index) => {
    const areaM2 = Math.max(0, Number(position.areaM2) || 0);
    const windPa = Math.abs(Number(position.windPa) || 0);
    const ownWeightKg = Math.max(0, Number(position.ownWeightKg) || 0);
    const upliftKg = Math.max(0, windPa * areaM2 * cfStab / G - ownWeightKg);
    const slidingKg = Math.max(0, windPa * areaM2 * Math.sin(tiltRad) * cfStab / (mu * G) - ownWeightKg);
    const edgeBias = position.priority === 'roof_edge' ? 1.15 : position.priority === 'obstacle' ? 1.08 : 1;
    const ballastKg = ceilStep(Math.max(upliftKg, slidingKg) * edgeBias, step);
    return {
      id: position.id || `flow-b-${index + 1}`,
      priority: position.priority || 'field',
      upliftKg: round(upliftKg),
      slidingKg: round(slidingKg),
      edgeBias,
      ballastKg,
    };
  }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  const totalBallastKg = placements.reduce((sum, item) => sum + item.ballastKg, 0);
  const stones = stoneRound(totalBallastKg);
  return {
    preliminary: true,
    cfStab,
    frictionCoefficient: mu,
    ballastStepKg: step,
    totalBallastKg: round(totalBallastKg),
    ballastActualKg: stones.kg,
    stones: stones.breakdown,
    placements,
    priorityOrder: ['roof_edge', 'obstacle', 'field'],
  };
}
