import React, { useMemo } from 'react';
import { resolveProductClampZone } from '@/lib/productDocuments';
import { panelPositions } from '@/lib/panelLayout.js';
import { FLOW } from '@/lib/flow/flowConstants.js';
import { flowSpacingM, isFlowVariant } from '@/lib/flow/flowPanelSpacing.js';
import { selectDockPosition } from '@/lib/flow/flowParallelGeometry.js';

const MAX_HOOK_SPACING_MM = 1200;
const RAIL_OVERHANG_MM = 150;
const PANEL_GAP_M = 0.03;
const DEFAULT_PANEL = {
  width_mm: 1134,
  height_mm: 1762,
  power_watts: 500,
  name: 'Standardpanel 500 W',
  model: 'Standardpanel 500 W',
};

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => number(value, fallback) > 0 ? number(value, fallback) : fallback;

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function readPlannerLayout(project) {
  for (const raw of [project?.solar_roof_planner_data, project?.panel_layout_data]) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  return { roofs: [] };
}

function readMountingData(project) {
  return safeJson(project?.mounting_data, {});
}

function variantForRoof(roof, mounting) {
  const saved = (mounting?.perRoofSystems || []).find(item => String(item.roofId) === String(roof?.id)) || {};
  return roof?.mountingSystemVariant || saved.systemVariant || mounting?.systemVariant || '';
}

function productForRoof(roof, selectedProduct) {
  return roof?.panelProductSnapshot || selectedProduct || DEFAULT_PANEL;
}

function panelSize(orientation, product) {
  const base = {
    w: positive(product?.width_mm, DEFAULT_PANEL.width_mm) / 1000,
    h: positive(product?.height_mm, DEFAULT_PANEL.height_mm) / 1000,
  };
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function buildFlowContext(project, selectedProduct) {
  const layout = readPlannerLayout(project);
  const mounting = readMountingData(project);
  const roofs = layout.roofs || [];
  const roof = roofs.find(item => isFlowVariant(variantForRoof(item, mounting)) && (item.panelGroups || []).length)
    || roofs.find(item => isFlowVariant(variantForRoof(item, mounting)));
  if (!roof) return null;

  const variant = variantForRoof(roof, mounting);
  if (!isFlowVariant(variant)) return null;

  return {
    roof,
    variant,
    product: productForRoof(roof, selectedProduct),
  };
}

function formatMm(value) {
  if (value == null || Number.isNaN(Number(value))) return 'Saknas';
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} mm`;
}

function flowVariantLabel(variant) {
  if (variant.includes('east_west')) return 'Flow east/west ballasted';
  if (variant.includes('south')) return 'Flow south ballasted';
  if (variant.includes('parallel')) return 'Flow parallel ballasted';
  return variant;
}

function DimLine({ x1, y1, x2, y2, label, textOffset = { x: 0, y: -6 }, color = '#1d4ed8' }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} strokeDasharray="4 2" />
      <line x1={x1} y1={y1 - 4} x2={x1} y2={y1 + 4} stroke={color} strokeWidth={1} />
      <line x1={x2} y1={y2 - 4} x2={x2} y2={y2 + 4} stroke={color} strokeWidth={1} />
      <text x={mx + textOffset.x} y={my + textOffset.y} textAnchor="middle" fontSize={9} fill={color} fontWeight="600" fontFamily="monospace">{label}</text>
    </g>
  );
}

export default function MountingDrawing(props) {
  const flowContext = useMemo(
    () => buildFlowContext(props.project, props.selectedProduct),
    [props.project, props.selectedProduct],
  );

  if (flowContext) return <FlowMountingDrawing {...props} flowContext={flowContext} />;
  return <HookMountingDrawing {...props} />;
}

function FlowMountingDrawing({ project, selectedProduct, systemBrand, systemModel, flowContext }) {
  const { roof, variant } = flowContext;
  const product = productForRoof(roof, selectedProduct);
  const roofW = positive(roof?.widthM, positive(project?.roof_width_m, 8));
  const roofH = positive(roof?.roofFallM, positive(project?.roof_height_m, 5));
  const panelItems = (roof.panelGroups || []).flatMap(group => {
    const size = panelSize(group.orientation, product);
    return panelPositions({
      group,
      panelSize: size,
      variant,
      gapFallbackM: PANEL_GAP_M,
    }).map(position => ({ ...position, groupId: group.id, groupName: group.name }));
  });
  const panelCount = panelItems.length;
  const spacing = flowSpacingM(variant, Math.max(0, ...((roof.panelGroups || []).map(group => Math.round(number(group.rows))))));
  const clampZone = resolveProductClampZone(product || DEFAULT_PANEL);
  const dock = variant.includes('parallel') ? selectDockPosition(clampZone) : null;

  const margin = { left: 58, right: 44, top: 38, bottom: 56 };
  const svgW = 700;
  const svgH = 420;
  const drawW = svgW - margin.left - margin.right;
  const drawH = svgH - margin.top - margin.bottom;
  const scale = Math.min(drawW / roofW, drawH / roofH);
  const roofDrawW = roofW * scale;
  const roofDrawH = roofH * scale;

  const colGapPair = panelItems.find(item => panelItems.some(next => (
    String(next.groupId) === String(item.groupId)
    && next.row === item.row
    && next.col === item.col + 1
  )));
  const colGapNext = colGapPair && panelItems.find(next => (
    String(next.groupId) === String(colGapPair.groupId)
    && next.row === colGapPair.row
    && next.col === colGapPair.col + 1
  ));
  const nockPair = panelItems.find(item => item.row === 0 && panelItems.some(next => (
    String(next.groupId) === String(item.groupId)
    && next.row === 1
    && next.col === item.col
  )));
  const nockNext = nockPair && panelItems.find(next => (
    String(next.groupId) === String(nockPair.groupId)
    && next.row === 1
    && next.col === nockPair.col
  ));
  const valleyPair = panelItems.find(item => item.row === 1 && panelItems.some(next => (
    String(next.groupId) === String(item.groupId)
    && next.row === 2
    && next.col === item.col
  )));
  const valleyNext = valleyPair && panelItems.find(next => (
    String(next.groupId) === String(valleyPair.groupId)
    && next.row === 2
    && next.col === valleyPair.col
  ));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-blue-800">Flow-geometri</p>
          <p className="text-blue-700">System: <strong>{flowVariantLabel(variant)}</strong></p>
          <p className="text-blue-700">Sidomellanrum: <strong>{formatMm(FLOW.sideGapMm)}</strong></p>
          <p className="text-blue-700">Radmellanrum: <strong>{spacing.rowGaps ? `${formatMm(FLOW.eastWestNockGapMm)} / ${formatMm(FLOW.eastWestValleyGapMm)}` : formatMm(FLOW.sideGapMm)}</strong></p>
        </div>
        {dock && (
          <div className={`${dock.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} border rounded-lg px-3 py-2 space-y-0.5`}>
            <p className={`font-semibold ${dock.ok ? 'text-emerald-800' : 'text-amber-800'}`}>Flow Dock</p>
            {dock.ok ? (
              <p className="text-emerald-700">Lage: <strong>{formatMm(dock.dockPositionMm)}</strong></p>
            ) : (
              <p className="text-amber-700">{dock.reason}</p>
            )}
            <p className={dock.ok ? 'text-emerald-700' : 'text-amber-700'}>Krok c/c visas ej for Flow.</p>
          </div>
        )}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-slate-800">Tak</p>
          <p className="text-slate-700">{roof?.name || 'Aktivt tak'}</p>
          <p className="text-slate-700">{roofW.toFixed(2)} x {roofH.toFixed(2)} m</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-purple-800">Paneler</p>
          <p className="text-purple-700">{product?.name || product?.model || 'Standardpanel'}</p>
          <p className="text-purple-700">{positive(product?.width_mm, DEFAULT_PANEL.width_mm)} x {positive(product?.height_mm, DEFAULT_PANEL.height_mm)} mm</p>
          <p className="text-purple-700">Antal: <strong>{panelCount}</strong></p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold">Montageritning - Flow takvy uppifran</p>
          {systemBrand && <p className="text-xs text-muted-foreground">{systemBrand} / {systemModel}</p>}
        </div>
        <div className="overflow-x-auto">
          <svg width={svgW} height={svgH} style={{ fontFamily: 'monospace' }}>
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              <rect x={0} y={0} width={roofDrawW} height={roofDrawH} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />
              <text x={roofDrawW / 2} y={-14} textAnchor="middle" fontSize={10} fill="#475569" fontWeight="700">
                Takyta {roofW.toFixed(2)} x {roofH.toFixed(2)} m
              </text>

              {panelItems.map(item => {
                const x = item.xM * scale;
                const y = item.yM * scale;
                const w = item.wM * scale;
                const h = item.hM * scale;
                const outside = item.xM < 0 || item.yM < 0 || item.xM + item.wM > roofW || item.yM + item.hM > roofH;
                const dockY = dock?.ok ? y + Math.min(h - 2, Math.max(2, (dock.dockPositionMm / 1000) * scale)) : null;

                return (
                  <g key={`${item.groupId}-${item.row}-${item.col}`}>
                    <rect x={x} y={y} width={w} height={h} fill={outside ? '#fee2e2' : '#dbeafe'} stroke={outside ? '#dc2626' : '#2563eb'} strokeWidth={1.2} rx={1} />
                    <line x1={x + w / 3} y1={y + 2} x2={x + w / 3} y2={y + h - 2} stroke={outside ? '#fca5a5' : '#93c5fd'} strokeWidth={0.6} />
                    <line x1={x + (w * 2) / 3} y1={y + 2} x2={x + (w * 2) / 3} y2={y + h - 2} stroke={outside ? '#fca5a5' : '#93c5fd'} strokeWidth={0.6} />
                    {dockY != null && <line x1={x + 2} y1={dockY} x2={x + w - 2} y2={dockY} stroke="#92400e" strokeWidth={2} />}
                  </g>
                );
              })}

              {colGapPair && colGapNext && (
                <DimLine
                  x1={(colGapPair.xM + colGapPair.wM) * scale}
                  y1={(colGapPair.yM + colGapPair.hM + 0.18) * scale}
                  x2={colGapNext.xM * scale}
                  y2={(colGapPair.yM + colGapPair.hM + 0.18) * scale}
                  label={formatMm((colGapNext.xM - (colGapPair.xM + colGapPair.wM)) * 1000)}
                  textOffset={{ x: 0, y: -5 }}
                />
              )}
              {nockPair && nockNext && (
                <DimLine
                  x1={(nockPair.xM + nockPair.wM + 0.2) * scale}
                  y1={(nockPair.yM + nockPair.hM) * scale}
                  x2={(nockPair.xM + nockPair.wM + 0.2) * scale}
                  y2={nockNext.yM * scale}
                  label={formatMm((nockNext.yM - (nockPair.yM + nockPair.hM)) * 1000)}
                  textOffset={{ x: 31, y: 0 }}
                  color="#0f766e"
                />
              )}
              {valleyPair && valleyNext && (
                <DimLine
                  x1={(valleyPair.xM + valleyPair.wM + 0.35) * scale}
                  y1={(valleyPair.yM + valleyPair.hM) * scale}
                  x2={(valleyPair.xM + valleyPair.wM + 0.35) * scale}
                  y2={valleyNext.yM * scale}
                  label={formatMm((valleyNext.yM - (valleyPair.yM + valleyPair.hM)) * 1000)}
                  textOffset={{ x: 36, y: 0 }}
                  color="#7c3aed"
                />
              )}

              <g transform={`translate(${roofDrawW + 12}, 12)`}>
                <rect x={0} y={0} width={9} height={7} fill="#dbeafe" stroke="#2563eb" strokeWidth={0.8} />
                <text x={14} y={7} fontSize={8} fill="#1d4ed8">Panel</text>
                {dock?.ok && (
                  <>
                    <line x1={0} y1={20} x2={9} y2={20} stroke="#92400e" strokeWidth={2} />
                    <text x={14} y={23} fontSize={8} fill="#78350f">Flow Dock</text>
                  </>
                )}
                {variant.includes('east_west') && (
                  <>
                    <line x1={0} y1={35} x2={9} y2={35} stroke="#0f766e" strokeWidth={1.5} strokeDasharray="3 2" />
                    <text x={14} y={38} fontSize={8} fill="#0f766e">Nock/valley</text>
                  </>
                )}
              </g>

              <text x={roofDrawW / 2} y={roofDrawH + 38} textAnchor="middle" fontSize={9} fill="#64748b">
                {flowVariantLabel(variant)} | {panelCount} paneler | {systemBrand || '-'} {systemModel || ''}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        * Flow Dock visas endast for parallellt Flow nar panelens klamzon matchar 730/980/1110 mm.
      </p>
    </div>
  );
}

function HookMountingDrawing({ project, selectedProduct, systemBrand, systemModel, panelCount, recommendedHookSpacingMM }) {
  const roofW = parseFloat(project?.roof_width_m) || 8;
  const roofH = parseFloat(project?.roof_height_m) || 5;

  const panelW = selectedProduct?.width_mm || 1134;
  const panelH = selectedProduct?.height_mm || 1762;
  const clampZone = resolveProductClampZone(selectedProduct || { width_mm: panelW, height_mm: panelH });

  const colsCount = Math.max(1, Math.floor((roofW * 1000) / panelW));
  const rowsCount = Math.max(1, panelCount ? Math.ceil(panelCount / colsCount) : Math.floor((roofH * 1000) / panelH));
  const railsPerColumn = 2;

  const railOffsetFromTop = Math.round(clampZone.railOffsetTopMm || clampZone.preferredMm || panelH * 0.2);
  const railOffsetFromBottom = Math.round(clampZone.railOffsetBottomMm || clampZone.preferredMm || panelH * 0.2);
  const hookSpacingMM = Math.min(MAX_HOOK_SPACING_MM, Number(recommendedHookSpacingMM) || Math.round(panelW * 0.9));
  const hooksPerRail = Math.max(2, Math.ceil((colsCount * panelW) / hookSpacingMM) + 1);
  const actualHookSpacing = Math.round((colsCount * panelW) / (hooksPerRail - 1));
  const railLengthMM = colsCount * panelW + RAIL_OVERHANG_MM * 2;
  const clampMin = Math.round(clampZone.minMm || panelH * 0.1);
  const clampMax = Math.round(clampZone.maxMm || panelH * 0.33);

  const margin = { left: 60, right: 40, top: 40, bottom: 50 };
  const svgW = 700;
  const svgH = 420;
  const drawW = svgW - margin.left - margin.right;
  const drawH = svgH - margin.top - margin.bottom;
  const totalArrayW = colsCount * panelW;
  const totalArrayH = rowsCount * panelH;
  const scale = Math.min(drawW / totalArrayW, drawH / totalArrayH);

  const pw = panelW * scale;
  const ph = panelH * scale;
  const arrayW = colsCount * pw;
  const arrayH = rowsCount * ph;
  const railY1 = railOffsetFromTop * scale;
  const railY2 = (panelH - railOffsetFromBottom) * scale;

  const hookXPositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < hooksPerRail; i++) positions.push((i * actualHookSpacing * scale) - RAIL_OVERHANG_MM * scale);
    return positions;
  }, [hooksPerRail, actualHookSpacing, scale]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-blue-800">Skenor</p>
          <p className="text-blue-700">Längd: <strong>{railLengthMM} mm</strong></p>
          <p className="text-blue-700">Antal: <strong>{rowsCount * railsPerColumn}</strong> st</p>
          <p className="text-blue-700">Per rad: <strong>{railsPerColumn}</strong> st</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-amber-800">Krokar / Fästen</p>
          <p className="text-amber-700">Antal per skena: <strong>{hooksPerRail}</strong> st</p>
          <p className="text-amber-700">C/C-avstånd: <strong>{actualHookSpacing} mm</strong></p>
          <p className="text-amber-700">Totalt: <strong>{rowsCount * railsPerColumn * hooksPerRail}</strong> st</p>
        </div>
        <div className={`${clampZone.hasProductZone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'} border rounded-lg px-3 py-2 space-y-0.5`}>
          <p className={`font-semibold ${clampZone.hasProductZone ? 'text-green-800' : 'text-amber-800'}`}>Klämzoner</p>
          <p className={clampZone.hasProductZone ? 'text-green-700' : 'text-amber-700'}>Klämma min: <strong>{clampMin} mm</strong> från kant</p>
          <p className={clampZone.hasProductZone ? 'text-green-700' : 'text-amber-700'}>Klämma max: <strong>{clampMax} mm</strong> från kant</p>
          <p className={clampZone.hasProductZone ? 'text-green-700' : 'text-amber-700'}>Skena pos 1: <strong>{railOffsetFromTop} mm</strong> uppifrån</p>
          <p className={clampZone.hasProductZone ? 'text-green-700' : 'text-amber-700'}>Skena pos 2: <strong>{railOffsetFromBottom} mm</strong> nedifrån</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-semibold text-purple-800">Panel</p>
          <p className="text-purple-700">{selectedProduct?.name || 'Ej vald'}</p>
          <p className="text-purple-700">{panelW} × {panelH} mm</p>
          <p className="text-purple-700">Layout: <strong>{colsCount} × {rowsCount}</strong></p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold">Montageritning – takvy uppifrån</p>
          {systemBrand && <p className="text-xs text-muted-foreground">{systemBrand} / {systemModel}</p>}
        </div>
        <div className="overflow-x-auto">
          <svg width={svgW} height={svgH} style={{ fontFamily: 'monospace' }}>
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              <rect x={0} y={0} width={arrayW} height={arrayH} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={1} />

              {Array.from({ length: rowsCount }).map((_, row) => Array.from({ length: colsCount }).map((_, col) => {
                const x = col * pw;
                const y = row * ph;
                return (
                  <g key={`${row}-${col}`}>
                    <rect x={x + 1} y={y + 1} width={pw - 2} height={ph - 2} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} rx={1} />
                    {[1, 2, 3, 4, 5].map(c => <line key={c} x1={x + (c * pw / 6)} y1={y + 2} x2={x + (c * pw / 6)} y2={y + ph - 2} stroke="#93c5fd" strokeWidth={0.4} />)}
                    {Array.from({ length: Math.max(0, Math.round(ph / pw * 6) - 1) }).map((_, r) => <line key={r} x1={x + 2} y1={y + ((r + 1) * ph / Math.round(ph / pw * 6))} x2={x + pw - 2} y2={y + ((r + 1) * ph / Math.round(ph / pw * 6))} stroke="#93c5fd" strokeWidth={0.4} />)}
                    <rect x={x + 2} y={y + clampMin * scale} width={pw - 4} height={Math.max(1, (clampMax - clampMin) * scale)} fill="rgba(34,197,94,0.12)" />
                    <rect x={x + 2} y={y + ph - clampMax * scale} width={pw - 4} height={Math.max(1, (clampMax - clampMin) * scale)} fill="rgba(34,197,94,0.12)" />
                  </g>
                );
              }))}

              {Array.from({ length: rowsCount }).map((_, row) => {
                const y = row * ph;
                const railXStart = -RAIL_OVERHANG_MM * scale;
                const railXEnd = arrayW + RAIL_OVERHANG_MM * scale;
                return (
                  <g key={`rails-${row}`}>
                    <line x1={railXStart} y1={y + railY1} x2={railXEnd} y2={y + railY1} stroke="#92400e" strokeWidth={3} />
                    <line x1={railXStart} y1={y + railY2} x2={railXEnd} y2={y + railY2} stroke="#92400e" strokeWidth={3} />
                    {hookXPositions.map((hx, hi) => <circle key={`h1-${hi}`} cx={hx + RAIL_OVERHANG_MM * scale} cy={y + railY1} r={4} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />)}
                    {hookXPositions.map((hx, hi) => <circle key={`h2-${hi}`} cx={hx + RAIL_OVERHANG_MM * scale} cy={y + railY2} r={4} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />)}
                  </g>
                );
              })}

              <DimLine x1={0} y1={arrayH + 15} x2={pw} y2={arrayH + 15} label={`${panelW}mm`} textOffset={{ x: 0, y: -5 }} />
              <DimLine x1={-35} y1={0} x2={-35} y2={ph} label={`${panelH}mm`} textOffset={{ x: -28, y: 5 }} />
              {hookXPositions.length >= 2 && <DimLine x1={hookXPositions[0] + RAIL_OVERHANG_MM * scale} y1={arrayH + 30} x2={hookXPositions[1] + RAIL_OVERHANG_MM * scale} y2={arrayH + 30} label={`${actualHookSpacing}mm c/c`} textOffset={{ x: 0, y: -5 }} color="#92400e" />}
              <DimLine x1={-RAIL_OVERHANG_MM * scale} y1={ph / 2} x2={0} y2={ph / 2} label={`${RAIL_OVERHANG_MM}mm`} textOffset={{ x: 0, y: -5 }} color="#6d28d9" />
              <DimLine x1={pw + 5} y1={railY1} x2={pw + 5} y2={railY2} label={`${panelH - railOffsetFromTop - railOffsetFromBottom}mm`} textOffset={{ x: 28, y: 0 }} color="#15803d" />

              <g transform={`translate(${arrayW + 10}, 10)`}>
                <rect x={0} y={0} width={8} height={3} fill="#92400e" /><text x={12} y={4} fontSize={7} fill="#78350f">Skena</text>
                <circle cx={4} cy={14} r={3} fill="#f59e0b" stroke="#92400e" strokeWidth={0.8} /><text x={12} y={17} fontSize={7} fill="#78350f">Krok/fäste</text>
                <rect x={0} y={22} width={8} height={6} fill="rgba(34,197,94,0.3)" /><text x={12} y={29} fontSize={7} fill="#15803d">Klämzon</text>
              </g>

              <text x={arrayW / 2} y={arrayH + 48} textAnchor="middle" fontSize={9} fill="#64748b">Takbredd {roofW}m × Takdjup {roofH}m | {colsCount}×{rowsCount} paneler | {systemBrand || '–'} {systemModel || ''}</text>
            </g>
          </svg>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        * Klämzonerna hämtas från sparad paneldata/manual/datablad. Om produkten saknar klämzon visas fallback-värde och produkten ska kompletteras i Produktsortimentet.
      </p>
    </div>
  );
}
