import { calculateNordmountRoof, isNordmountProduct } from '@/lib/mountingEngines/nordmount';

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
      status: 'blocked',
      errors: ['Det valda montagesystemet saknar en färdig systemmotor.'],
      warnings: [],
    };
  }
  return engine.calculateRoof(input);
}
