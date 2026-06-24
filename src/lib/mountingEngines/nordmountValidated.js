export { calculateNordmountRoof, calculateNordmountSnowLoad, calculateNordmountWindLoad, isNordmountProduct } from './nordmountValidatedParallel.js';
export function peakVelocityPressurePa(referenceWindMs, ridgeHeightM) {
  const meanWindMs = Number(referenceWindMs) || 0;
  return { z: Number(ridgeHeightM) || 2, cr: 1, meanWindMs, turbulenceIntensity: 0, peakPressurePa: 0.625 * meanWindMs * meanWindMs };
}
