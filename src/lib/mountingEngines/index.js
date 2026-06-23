import { calculateNordmountRoof, isNordmountProduct } from '@/lib/mountingEngines/nordmountValidated';

export function resolveMountingEngine(mountingProduct = {}) {
  if (isNordmountProduct(mountingProduct)) {
    return {
      id: 'nordmount',
      label: 'Nordmount',
      calculateRoof: calculateNordmountRoof,
    };
  }
  return null;
}

export function calculateMountingRoof(input = {}) {
  const engine = resolveMountingEngine(input.mountingProduct || {});
  if (!engine) {
    return {
      engineId: null,
      state: 'blocked',
      status: {
        loadsValidated: false,
        preliminaryAngle: false,
        capacityValidated: false,
      },
      errors: ['Det valda montagesystemet saknar en färdig systemmotor.'],
      warnings: [],
      materials: null,
    };
  }
  return engine.calculateRoof(input);
}
