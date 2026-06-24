import { resolveProductClampZone } from '@/lib/productDocuments';
import { selectDockPosition, checkRailOverhang, parallelSideGapMm } from './flowParallelGeometry.js';
import { panelWidthMode, eastWestFieldHeightMm, eastWestGaps } from './flowEastWestGeometry.js';
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
export function calculateFlowGeometry(input = {}, systemVariant = '') {
  if (systemVariant.includes('parallel')) {
    const zone = resolveProductClampZone(input.panelProduct || {});
    const dock = selectDockPosition({ minMm: zone.minMm, maxMm: zone.maxMm });
    const issues = checkRailOverhang({ overhangMm: num(input.config?.railOverhangMm), usesEndCap: Boolean(input.config?.usesEndCap) });
    return { geometry: { dock, sideGapMm: parallelSideGapMm(), overhangIssues: issues }, errors: [...(dock.ok ? [] : [dock.reason]), ...issues], warnings: [] };
  }
  return { input, systemVariant };
}
