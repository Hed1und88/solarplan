import { FLOW } from './flowConstants.js';

export const isFlowVariant = (v = '') => String(v).startsWith('flow_');

// Mellanrum i meter, harlett ur montagesystemet.
export function flowSpacingM(variant = '', rowsCount = 0) {
  const v = String(variant);
  const side = FLOW.sideGapMm / 1000;

  if (v.includes('east_west') || v.includes('south')) {
    const nock = FLOW.eastWestNockGapMm / 1000;
    const valley = FLOW.eastWestValleyGapMm / 1000;
    const rowGaps = [];
    for (let r = 0; r < Math.max(0, rowsCount - 1); r += 1) {
      rowGaps.push(r % 2 === 0 ? nock : valley);
    }
    return { colGapM: side, rowGaps, uniformRowGapM: null };
  }

  return { colGapM: side, rowGaps: null, uniformRowGapM: side };
}

export function rowOffsetsM({ rows, panelHeightM, spacing }) {
  const offsets = [];
  let y = 0;

  for (let r = 0; r < rows; r += 1) {
    offsets.push(y);
    const gap = spacing.rowGaps ? (spacing.rowGaps[r] ?? 0) : (spacing.uniformRowGapM ?? 0);
    y += panelHeightM + gap;
  }

  return offsets;
}
