import {
  calculateNordmountRoof as calculateParallelRoof,
  calculateNordmountSnowLoad,
  calculateNordmountWindLoad,
  isNordmountProduct,
} from './nordmountValidatedParallel.js';
import { FLOW_BRANCHES, FLOW_PRODUCTS } from '@/lib/flow/flowConstants.js';
import { calculateFlowRoof } from '@/lib/flow/flowEngine.js';

export { calculateNordmountSnowLoad, calculateNordmountWindLoad, isNordmountProduct };

export function peakVelocityPressurePa(referenceWindMs, ridgeHeightM) {
  const meanWindMs = Number(referenceWindMs) || 0;
  return { z: Number(ridgeHeightM) || 2, cr: 1, meanWindMs, turbulenceIntensity: 0, peakPressurePa: 0.625 * meanWindMs * meanWindMs };
}
