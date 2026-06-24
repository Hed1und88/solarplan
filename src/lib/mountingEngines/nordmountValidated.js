import {
  calculateNordmountRoof as calculateParallelRoof,
  calculateNordmountSnowLoad,
  calculateNordmountWindLoad,
  isNordmountProduct,
} from './nordmountValidatedParallel.js';
import { FLOW_BRANCHES } from '@/lib/flow/flowConstants.js';
import { calculateFlowRoof } from '@/lib/flow/flowEngine.js';

export { calculateNordmountSnowLoad, calculateNordmountWindLoad, isNordmountProduct };

const normalize = value => String(value || '').trim().toLowerCase();

export function peakVelocityPressurePa(referenceWindMs, ridgeHeightM) {
  const meanWindMs = Number(referenceWindMs) || 0;
  return { z: Number(ridgeHeightM) || 2, cr: 1, meanWindMs, turbulenceIntensity: 0, peakPressurePa: 0.625 * meanWindMs * meanWindMs };
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
