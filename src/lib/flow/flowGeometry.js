import { resolveProductClampZone } from '@/lib/productDocuments';
import { selectDockPosition, checkRailOverhang, parallelSideGapMm } from './flowParallelGeometry.js';
import { panelWidthMode, eastWestFieldHeightMm, eastWestGaps } from './flowEastWestGeometry.js';
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
export function calculateFlowGeometry(input = {}, systemVariant = '') {
  return { input, systemVariant, sideGapMm: parallelSideGapMm() };
}
