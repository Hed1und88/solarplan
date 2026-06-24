import { resolveProductClampZone } from '@/lib/productDocuments';
import { selectDockPosition, checkRailOverhang, parallelSideGapMm } from './flowParallelGeometry.js';
import { panelWidthMode, eastWestFieldHeightMm, eastWestGaps } from './flowEastWestGeometry.js';
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
export function calculateFlowGeometry(input = {}, systemVariant = '') {
  if (systemVariant.includes('parallel')) {
    const zone = resolveProductClampZone(input.panelProduct || {});
    const dock = selectDockPosition({ minMm: zone.minMm, maxMm: zone.maxMm });
    return { geometry: { dock, sideGapMm: parallelSideGapMm() }, errors: dock.ok ? [] : [dock.reason], warnings: [] };
  }
  return { input, systemVariant };
}
