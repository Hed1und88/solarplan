import React, { useMemo } from 'react';
import { resolveProductClampZone } from '@/lib/productDocuments';

const MAX_HOOK_SPACING_MM = 1200;
const RAIL_OVERHANG_MM = 150;

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

export default function MountingDrawing({ project, selectedProduct, systemBrand, systemModel, panelCount, recommendedHookSpacingMM }) {
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
