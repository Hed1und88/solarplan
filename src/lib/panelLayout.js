import { isFlowVariant, flowSpacingM, rowOffsetsM } from '@/lib/flow/flowPanelSpacing.js';

const DEFAULT_GAP_M = 0.02;

// panelSize = { w, h } i meter.
export function panelPositions({ group, panelSize, variant, gapFallbackM = DEFAULT_GAP_M }) {
  const rows = Math.max(0, Math.round(Number(group?.rows) || 0));
  const cols = Math.max(0, Math.round(Number(group?.cols) || 0));
  const flow = isFlowVariant(variant);
  const spacing = flow ? flowSpacingM(variant, rows) : null;
  const colGap = flow ? spacing.colGapM : gapFallbackM;
  const yOffsets = flow
    ? rowOffsetsM({ rows, panelHeightM: panelSize.h, spacing })
    : Array.from({ length: rows }, (_, r) => r * (panelSize.h + gapFallbackM));
  const x0 = Number(group?.xM) || 0;
  const y0 = Number(group?.yM) || 0;
  const out = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const override = group?.panelOverrides?.[`${r}-${c}`];
      out.push({
        row: r,
        col: c,
        xM: override ? Number(override.xM) || 0 : x0 + c * (panelSize.w + colGap),
        yM: override ? Number(override.yM) || 0 : y0 + yOffsets[r],
        wM: panelSize.w,
        hM: panelSize.h,
      });
    }
  }

  return out;
}

export function groupSizeM({ group, panelSize, variant, gapFallbackM = DEFAULT_GAP_M }) {
  const pos = panelPositions({ group, panelSize, variant, gapFallbackM });
  if (!pos.length) return { w: 0, h: 0 };
  const x0 = Number(group?.xM) || 0;
  const y0 = Number(group?.yM) || 0;

  return {
    w: Math.max(...pos.map(p => p.xM + p.wM)) - x0,
    h: Math.max(...pos.map(p => p.yM + p.hM)) - y0,
  };
}
