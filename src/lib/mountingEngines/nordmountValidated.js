import {
  calculateNordmountRoof as calculateParallelRoof,
  calculateNordmountSnowLoad,
  calculateNordmountWindLoad,
  isNordmountProduct,
} from './nordmountValidatedParallel.js';
import { FLOW_BRANCHES } from '@/lib/flow/flowConstants.js';
import { calculateFlowRoof } from '@/lib/flow/flowEngine.js';

export { calculateNordmountSnowLoad, calculateNordmountWindLoad, isNordmountProduct };

const AIR_DENSITY = 1.25;
const TERRAIN = {
  '0': { z0: 0.003, zmin: 1 },
  I: { z0: 0.01, zmin: 1 },
  II: { z0: 0.05, zmin: 2 },
  III: { z0: 0.3, zmin: 5 },
  IV: { z0: 1, zmin: 10 },
};
const normalize = value => String(value || '').trim().toLowerCase();

export function peakVelocityPressurePa(referenceWindMs, ridgeHeightM, terrainType) {
  const terrain = TERRAIN[String(terrainType)] || TERRAIN.II;
  const z = Math.max(Number(ridgeHeightM) || terrain.zmin, terrain.zmin);
  const kr = 0.19 * Math.pow(terrain.z0 / 0.05, 0.07);
  const logarithm = Math.log(z / terrain.z0);
  const cr = kr * logarithm;
  const meanWindMs = cr * (Number(referenceWindMs) || 0);
  const turbulenceIntensity = 1 / logarithm;
  return {
    z,
    cr,
    meanWindMs,
    turbulenceIntensity,
    peakPressurePa: (1 + 7 * turbulenceIntensity) * 0.5 * AIR_DENSITY * meanWindMs * meanWindMs,
  };
}

function blockedResult(input, message, loads = null, branchStatus = 'blocked') {
  return {
    engineId: 'nordmount',
    engineVersion: '3.0.0-flow',
    systemVariant: normalize(input.config?.systemVariant || input.roof?.mountingSystemVariant || 'parallel'),
    state: 'blocked',
    status: { loadsValidated: false, preliminaryAngle: Boolean(loads?.snow?.preliminary), capacityValidated: false, branchStatus },
    errors: [message],
    warnings: [],
    loads,
    railLines: [],
    materials: null,
    calculatedAt: new Date().toISOString(),
  };
}

export function calculateNordmountRoof(input = {}) {
  const variant = normalize(input.config?.systemVariant || input.roof?.mountingSystemVariant || 'parallel');
  if (variant === 'parallel') return calculateParallelRoof(input);
  if (!FLOW_BRANCHES[variant]) return blockedResult(input, 'Kräver Nordmounts Cross-data');

  const value = calculateFlowRoof(input, variant);
  if (variant === 'flow_south_ballasted') return blockedResult(input, 'Kräver Planner-validering för syd', value.loads, FLOW_BRANCHES[variant].status);
  if (variant === 'flow_welded_hybrid') return blockedResult(input, 'Kräver infästnings-/tätskiktsmodell', null, FLOW_BRANCHES[variant].status);

  return {
    engineId: 'nordmount',
    engineVersion: '3.0.0-flow',
    systemVariant: variant,
    state: value.errors?.length ? 'blocked' : 'calculated',
    status: {
      loadsValidated: !value.loads?.snow?.preliminary,
      preliminaryAngle: Boolean(value.loads?.snow?.preliminary),
      capacityValidated: false,
      branchStatus: FLOW_BRANCHES[variant].status,
      preliminaryBallast: true,
    },
    errors: value.errors || [],
    warnings: value.warnings || [],
    loads: value.loads,
    geometry: value.geometry || null,
    ballast: value.ballast || null,
    materials: value.materials || null,
    railLines: [],
    calculatedAt: new Date().toISOString(),
  };
}
