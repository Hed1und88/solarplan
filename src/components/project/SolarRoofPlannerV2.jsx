import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Home, MousePointer2, PanelTop, Plus, Save, Trash2 } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { resolveProductClampZone } from '@/lib/productDocuments';

const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };
const PANEL_GAP_M = 0.03;
const SCALE = 58;
const SHAPES = ['Rektangel', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger', 'Vinkel vänster', 'Vinkel höger'];
const genId = () => Math.floor(Date.now() + Math.random() * 99999);
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => n(value, fallback) > 0 ? n(value, fallback) : fallback;
const round = (value, decimals = 2) => Math.round(n(value) * 10 ** decimals) / 10 ** decimals;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const createPanelGroup = (index = 1) => ({
  id: genId(),
  name: `Panelgrupp ${index}`,
  rows: 3,
  cols: 4,
  xM: 0.7,
  yM: 0.7,
  orientation: 'Stående',
  threeRails: false,
  panelOverrides: {},
});

const baseRoof = () => ({
  id: genId(),
  name: 'Tak 1',
  widthM: 8,
  roofFallM: 6,
  shape: 'Rektangel',
  angleDeg: 27,
  material: 'Takpannor',
  panelProductId: '',
  panelProductSnapshot: null,
  panelGroups: [createPanelGroup(1)],
  obstacles: [],
});

function removeLegacyClampFromRoofs(roofs = []) {
  return roofs.map(roof => ({
    ...roof,
    panelGroups: (roof.panelGroups || []).map(group => {
      const { clampMm, ...rest } = group || {};
      return rest;
    }),
  }));
}

function parseProjectLayout(project) {
  const rawCandidates = [project?.solar_roof_planner_data, project?.panel_layout_data];
  for (const raw of rawCandidates) {
    try {
      const data = JSON.parse(raw || 'null');
      if (Array.isArray(data?.roofs) && data.roofs.length) return removeLegacyClampFromRoofs(data.roofs);
    } catch {}
  }

  if (typeof window !== 'undefined' && project?.id) {
    try {
      const backup = JSON.parse(window.localStorage.getItem(`solarplan:project:${project.id}:solar_roof_planner_data`) || 'null');
      if (Array.isArray(backup?.roofs) && backup.roofs.length) return removeLegacyClampFromRoofs(backup.roofs);
    } catch {}
  }

  return [{ ...baseRoof(), widthM: positive(project?.roof_width_m, 8), roofFallM: positive(project?.roof_height_m, 6) }];
}

function panelSnapshot(product) {
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    model: product.model,
    width_mm: product.width_mm,
    height_mm: product.height_mm,
    power_watts: product.power_watts,
    voc_v: product.voc_v,
    vmp_v: product.vmp_v,
    isc_a: product.isc_a,
    imp_a: product.imp_a,
    description: product.description,
    clamp_zone_min_mm: product.clamp_zone_min_mm,
    clamp_zone_max_mm: product.clamp_zone_max_mm,
    rail_offset_top_mm: product.rail_offset_top_mm,
    rail_offset_bottom_mm: product.rail_offset_bottom_mm,
    clamp_source: product.clamp_source,
  };
}

function panelProductForRoof(roof, products) {
  return products.find(product => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function panelLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

function panelSize(orientation, product) {
  const base = {
    w: positive(product?.width_mm, DEFAULT_PANEL.width_mm) / 1000,
    h: positive(product?.height_mm, DEFAULT_PANEL.height_mm) / 1000,
  };
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function panelPositionM(group, product, row, col) {
  const override = group.panelOverrides?.[`${row}-${col}`];
  if (override) return { xM: n(override.xM), yM: n(override.yM) };
  const size = panelSize(group.orientation, product);
  return {
    xM: n(group.xM) + col * (size.w + PANEL_GAP_M),
    yM: n(group.yM) + row * (size.h + PANEL_GAP_M),
  };
}

function polygonPoints(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * 0.18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * 0.82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * 0.12},${y} ${x + w},${y} ${x + w * 0.88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * 0.88},${y} ${x + w},${y + h} ${x + w * 0.12},${y + h}`;
  if (shape === 'Vinkel vänster') return `${x + w * 0.25},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h} ${x},${y + h * 0.42} ${x + w * 0.25},${y + h * 0.42}`;
  if (shape === 'Vinkel höger') return `${x},${y} ${x + w * 0.75},${y} ${x + w * 0.75},${y + h * 0.42} ${x + w},${y + h * 0.42} ${x + w},${y + h} ${x},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function totals(roofs, products) {
  return roofs.reduce((acc, roof) => {
    const product = panelProductForRoof(roof, products);
    (roof.panelGroups || []).forEach(group => {
      const count = Math.max(0, Math.round(n(group.rows) * n(group.cols)));
      acc.panels += count;
      acc.kwp += count * positive(product.power_watts, DEFAULT_PANEL.power_watts) / 1000;
    });
    return acc;
  }, { panels: 0, kwp: 0 });
}

function groupSize(group, roof, products) {
  const size = panelSize(group.orientation, panelProductForRoof(roof, products));
  const cols = Math.max(0, Math.round(n(group.cols)));
  const rows = Math.max(0, Math.round(n(group.rows)));
  return {
    w: cols * size.w + Math.max(0, cols - 1) * PANEL_GAP_M,
    h: rows * size.h + Math.max(0, rows - 1) * PANEL_GAP_M,
  };
}

function Input({ label, value, onChange, type = 'text', step, min }) {
  return <label className="block text-xs font-medium text-muted-foreground"><span>{label}</span><input type={type} step={step} min={min} value={value ?? ''} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}

function Select({ label, value, onChange, children }) {
  return <label className="block text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value ?? ''} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}

function ClampInfoBox({ product }) {
  const clampZone = resolveProductClampZone(product || DEFAULT_PANEL);
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${clampZone.hasProductZone ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="font-semibold">Klämzon: {clampZone.label}</div>
      <div>{clampZone.source}</div>
    </div>
  );
}

function RoofPreview({ roofs, products, dragMode, selectedItem, setSelectedItem, setSelectedRoofId, onMovePanel, onMoveGroup }) {
  const pad = 60;
  const gap = 95;
  const [drag, setDrag] = useState(null);
  let y = pad;
  const layouts = roofs.map(roof => {
    const layout = { roof, x: pad, y, w: positive(roof.widthM, 8) * SCALE, h: positive(roof.roofFallM, 6) * SCALE };
    y += layout.h + gap;
    return layout;
  });
  const width = Math.max(900, ...layouts.map(layout => layout.x + layout.w + 160));
  const height = Math.max(520, y + pad);

  const pointFromEvent = (event) => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const startDrag = (event, payload) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const mode = dragMode === 'group' ? 'group' : 'panel';
    setSelectedRoofId(payload.roofId);
    setSelectedItem({ mode, ...payload });
    setDrag({ mode, payload, startX: point.x, startY: point.y, dxM: 0, dyM: 0 });
  };

  const moveDrag = (event) => {
    if (!drag) return;
    const point = pointFromEvent(event);
    setDrag(current => current ? { ...current, dxM: (point.x - current.startX) / SCALE, dyM: (point.y - current.startY) / SCALE } : current);
  };

  const endDrag = () => {
    if (!drag) return;
    if (Math.abs(drag.dxM) > 0.005 || Math.abs(drag.dyM) > 0.005) {
      if (drag.mode === 'group') onMoveGroup(drag.payload.roofId, drag.payload.groupId, drag.dxM, drag.dyM);
      if (drag.mode === 'panel') onMovePanel(drag.payload.roofId, drag.payload.groupId, drag.payload.row, drag.payload.col, drag.dxM, drag.dyM);
    }
    setDrag(null);
  };

  const shiftFor = (groupId, row, col) => {
    if (!drag || String(drag.payload.groupId) !== String(groupId)) return { dx: 0, dy: 0 };
    if (drag.mode === 'group') return { dx: drag.dxM * SCALE, dy: drag.dyM * SCALE };
    if (drag.mode === 'panel' && drag.payload.row === row && drag.payload.col === col) return { dx: drag.dxM * SCALE, dy: drag.dyM * SCALE };
    return { dx: 0, dy: 0 };
  };

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[520px] w-full min-w-[900px] touch-none" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}>
        <defs><pattern id="roof-hatch-v2" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {layouts.map(layout => {
          const product = panelProductForRoof(layout.roof, products);
          const clampZone = resolveProductClampZone(product);
          return <g key={layout.roof.id}>
            <text x={layout.x} y={layout.y - 24} fontSize="18" fontWeight="800">{layout.roof.name}</text>
            <text x={layout.x} y={layout.y - 7} fontSize="11" fill="#64748b">{panelLabel(product)} · {layout.roof.widthM} x {layout.roof.roofFallM} m · Klämzon {clampZone.label}</text>
            <polygon points={polygonPoints(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#roof-hatch-v2)" stroke="#111827" strokeWidth="2.5" onClick={() => setSelectedRoofId(layout.roof.id)} />
            {(layout.roof.panelGroups || []).map(group => {
              const panel = panelSize(group.orientation, product);
              const panelW = panel.w * SCALE;
              const panelH = panel.h * SCALE;
              const rows = Math.max(0, Math.round(n(group.rows)));
              const cols = Math.max(0, Math.round(n(group.cols)));
              const panels = [];
              for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                  const pos = panelPositionM(group, product, row, col);
                  const shift = shiftFor(group.id, row, col);
                  const px = layout.x + pos.xM * SCALE + shift.dx;
                  const py = layout.y + pos.yM * SCALE + shift.dy;
                  const outside = px < layout.x || py < layout.y || px + panelW > layout.x + layout.w || py + panelH > layout.y + layout.h;
                  const isSelectedPanel = selectedItem?.mode === 'panel' && String(selectedItem.groupId) === String(group.id) && selectedItem.row === row && selectedItem.col === col;
                  const isSelectedGroup = selectedItem?.mode === 'group' && String(selectedItem.groupId) === String(group.id);
                  panels.push(
                    <g key={`${group.id}-${row}-${col}`} onPointerDown={(event) => startDrag(event, { roofId: layout.roof.id, groupId: group.id, row, col })} className="cursor-move">
                      <rect x={px} y={py} width={panelW} height={panelH} rx="4" fill={outside ? '#fee2e2' : '#dbeafe'} stroke={isSelectedPanel || isSelectedGroup ? '#7c3aed' : outside ? '#ef4444' : '#2563eb'} strokeWidth={isSelectedPanel || isSelectedGroup ? '3' : '1.5'} />
                      <line x1={px + panelW / 3} y1={py + 3} x2={px + panelW / 3} y2={py + panelH - 3} stroke={outside ? '#fca5a5' : '#93c5fd'} />
                      <line x1={px + panelW * 2 / 3} y1={py + 3} x2={px + panelW * 2 / 3} y2={py + panelH - 3} stroke={outside ? '#fca5a5' : '#93c5fd'} />
                      <text x={px + panelW / 2} y={py + panelH / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{row + 1}:{col + 1}</text>
                    </g>
                  );
                }
              }
              const groupShift = drag?.mode === 'group' && String(drag.payload.groupId) === String(group.id) ? { dx: drag.dxM * SCALE, dy: drag.dyM * SCALE } : { dx: 0, dy: 0 };
              return <g key={group.id}>{panels}<text x={layout.x + n(group.xM) * SCALE + groupShift.dx} y={layout.y + n(group.yM) * SCALE - 6 + groupShift.dy} fontSize="11" fontWeight="700" fill="#1d4ed8">{group.name}</text></g>;
            })}
          </g>;
        })}
      </svg>
    </div>
  );
}

export default function SolarRoofPlannerV2({ project, onUpdate }) {
  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-roof-planner'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });
  const panelProducts = products.filter(product => product.is_active !== false);
  const [roofs, setRoofs] = useState(() => parseProjectLayout(project));
  const [selectedRoofId, setSelectedRoofId] = useState(roofs[0]?.id || '');
  const [selectedItem, setSelectedItem] = useState(null);
  const [dragMode, setDragMode] = useState('panel');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextRoofs = parseProjectLayout(project);
    setRoofs(nextRoofs);
    setSelectedRoofId(current => nextRoofs.some(roof => String(roof.id) === String(current)) ? current : nextRoofs[0]?.id || '');
    setSelectedItem(null);
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.roof_width_m, project?.roof_height_m]);

  const selectedRoof = roofs.find(roof => String(roof.id) === String(selectedRoofId)) || roofs[0];
  const selectedRoofProduct = selectedRoof ? panelProductForRoof(selectedRoof, panelProducts) : DEFAULT_PANEL;
  const total = useMemo(() => totals(roofs, panelProducts), [roofs, panelProducts]);
  const warnings = useMemo(() => roofs.flatMap(roof => (roof.panelGroups || []).map(group => ({ roof, group, size: groupSize(group, roof, panelProducts) })).filter(({ roof, group, size }) => n(group.xM) + size.w > n(roof.widthM) || n(group.yM) + size.h > n(roof.roofFallM))), [roofs, panelProducts]);

  const setRoof = (roofId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, ...patch } : roof));
  const setGroup = (roofId, groupId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, panelGroups: (roof.panelGroups || []).map(group => String(group.id) === String(groupId) ? { ...group, ...patch } : group) } : roof));

  const movePanel = (roofId, groupId, row, col, dxM, dyM) => {
    setRoofs(current => current.map(roof => {
      if (String(roof.id) !== String(roofId)) return roof;
      return {
        ...roof,
        panelGroups: (roof.panelGroups || []).map(group => {
          if (String(group.id) !== String(groupId)) return group;
          const product = panelProductForRoof(roof, panelProducts);
          const size = panelSize(group.orientation, product);
          const pos = panelPositionM(group, product, row, col);
          const key = `${row}-${col}`;
          return {
            ...group,
            panelOverrides: {
              ...(group.panelOverrides || {}),
              [key]: {
                xM: clamp(pos.xM + dxM, 0, Math.max(0, n(roof.widthM, 8) - size.w)),
                yM: clamp(pos.yM + dyM, 0, Math.max(0, n(roof.roofFallM, 6) - size.h)),
              },
            },
          };
        }),
      };
    }));
  };

  const moveGroup = (roofId, groupId, dxM, dyM) => {
    setRoofs(current => current.map(roof => {
      if (String(roof.id) !== String(roofId)) return roof;
      return {
        ...roof,
        panelGroups: (roof.panelGroups || []).map(group => {
          if (String(group.id) !== String(groupId)) return group;
          const size = groupSize(group, roof, panelProducts);
          const nextX = clamp(n(group.xM) + dxM, 0, Math.max(0, n(roof.widthM, 8) - size.w));
          const nextY = clamp(n(group.yM) + dyM, 0, Math.max(0, n(roof.roofFallM, 6) - size.h));
          const realDx = nextX - n(group.xM);
          const realDy = nextY - n(group.yM);
          const nextOverrides = Object.fromEntries(Object.entries(group.panelOverrides || {}).map(([key, value]) => [key, { xM: n(value.xM) + realDx, yM: n(value.yM) + realDy }]));
          return { ...group, xM: nextX, yM: nextY, panelOverrides: nextOverrides };
        }),
      };
    }));
  };

  const addRoof = () => {
    const roof = { ...baseRoof(), name: `Tak ${roofs.length + 1}` };
    setRoofs(current => [...current, roof]);
    setSelectedRoofId(roof.id);
  };

  const deleteRoof = (roofId) => setRoofs(current => {
    const next = current.filter(roof => String(roof.id) !== String(roofId));
    if (!next.length) return current;
    setSelectedRoofId(next[0].id);
    return next;
  });

  const addGroup = () => {
    if (!selectedRoof) return;
    const nextIndex = (selectedRoof.panelGroups || []).length + 1;
    setRoof(selectedRoof.id, { panelGroups: [...(selectedRoof.panelGroups || []), createPanelGroup(nextIndex)] });
  };

  const deleteGroup = (roofId, groupId) => setRoof(roofId, { panelGroups: (roofs.find(roof => String(roof.id) === String(roofId))?.panelGroups || []).filter(group => String(group.id) !== String(groupId)) });

  const save = async () => {
    setSaving(true);
    const savedRoofs = removeLegacyClampFromRoofs(roofs);
    const payload = { version: 10, scaleType: 'meter', railMode: 'per-panel', clampSource: 'panel-product-documents', roofs: savedRoofs, savedAt: new Date().toISOString() };
    try {
      if (typeof window !== 'undefined' && project?.id) window.localStorage.setItem(`solarplan:project:${project.id}:solar_roof_planner_data`, JSON.stringify(payload));
      await onUpdate?.({
        solar_roof_planner_data: JSON.stringify(payload),
        roof_width_m: savedRoofs[0]?.widthM || '',
        roof_height_m: savedRoofs[0]?.roofFallM || '',
        panel_layout_data: JSON.stringify(payload),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5 text-primary" />Paneler och takmått</CardTitle>
            <p className="text-sm text-muted-foreground">Klämzon hämtas från vald panelprodukt. Byter du panel ändras klämzonsinformationen automatiskt.</p>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara'}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{total.panels} paneler</Badge>
            <Badge variant="outline">{round(total.kwp, 2)} kWp</Badge>
            <Button variant={dragMode === 'panel' ? 'default' : 'outline'} size="sm" onClick={() => setDragMode('panel')} className="gap-2"><MousePointer2 className="h-4 w-4" />Flytta en panel</Button>
            <Button variant={dragMode === 'group' ? 'default' : 'outline'} size="sm" onClick={() => setDragMode('group')} className="gap-2"><PanelTop className="h-4 w-4" />Flytta hel panelgrupp</Button>
            <Button variant="outline" size="sm" onClick={addRoof} className="gap-2"><Plus className="h-4 w-4" />Lägg till tak</Button>
          </div>

          {warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{warnings.length} panelgrupp ligger helt eller delvis utanför takytan efter ändringen.</div>}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">Dragläge: <b>{dragMode === 'group' ? 'Flytta hel panelgrupp' : 'Flytta en panel'}</b>. Dra i en panel i ritningen. Tryck sedan <b>Spara</b>.</div>

          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="space-y-3">
              <Select label="Aktivt tak" value={selectedRoof?.id || ''} onChange={setSelectedRoofId}>{roofs.map(roof => <option key={roof.id} value={roof.id}>{roof.name}</option>)}</Select>

              {selectedRoof && (
                <div className="rounded-2xl border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2"><div className="font-semibold">Redigera tak</div>{roofs.length > 1 && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteRoof(selectedRoof.id)}><Trash2 className="h-4 w-4" /></Button>}</div>
                  <Input label="Namn" value={selectedRoof.name} onChange={value => setRoof(selectedRoof.id, { name: value })} />
                  <div className="grid grid-cols-2 gap-2"><Input label="Bredd A (m)" type="number" step="0.1" min="0" value={selectedRoof.widthM} onChange={value => setRoof(selectedRoof.id, { widthM: value })} /><Input label="Takfall B (m)" type="number" step="0.1" min="0" value={selectedRoof.roofFallM} onChange={value => setRoof(selectedRoof.id, { roofFallM: value })} /></div>
                  <div className="grid grid-cols-2 gap-2"><Input label="Taklutning (°)" type="number" value={selectedRoof.angleDeg} onChange={value => setRoof(selectedRoof.id, { angleDeg: value })} /><Select label="Takform" value={selectedRoof.shape} onChange={value => setRoof(selectedRoof.id, { shape: value })}>{SHAPES.map(shape => <option key={shape}>{shape}</option>)}</Select></div>
                  <Input label="Material" value={selectedRoof.material || ''} onChange={value => setRoof(selectedRoof.id, { material: value })} />
                  <ProductSearchSelect label="Solpanel för detta tak" products={panelProducts} value={selectedRoof.panelProductId || ''} onChange={value => { const product = panelProducts.find(item => item.id === value) || null; setRoof(selectedRoof.id, { panelProductId: value, panelProductSnapshot: panelSnapshot(product) }); }} placeholder="Välj solpanel" />
                  <ClampInfoBox product={selectedRoofProduct} />
                </div>
              )}

              <Button variant="outline" onClick={addGroup} className="w-full gap-2"><PanelTop className="h-4 w-4" />Lägg till panelgrupp</Button>

              {(selectedRoof?.panelGroups || []).map(group => (
                <div key={group.id} className={`rounded-2xl border p-3 space-y-2 ${selectedItem?.groupId === group.id ? 'border-primary bg-primary/5' : ''}`}>
                  <div className="flex items-center justify-between gap-2"><div className="font-semibold">{group.name}</div><Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteGroup(selectedRoof.id, group.id)}><Trash2 className="h-4 w-4" /></Button></div>
                  <Input label="Namn" value={group.name} onChange={value => setGroup(selectedRoof.id, group.id, { name: value })} />
                  <div className="grid grid-cols-2 gap-2"><Input label="Rader" type="number" min="0" value={group.rows} onChange={value => setGroup(selectedRoof.id, group.id, { rows: value, panelOverrides: {} })} /><Input label="Kolumner" type="number" min="0" value={group.cols} onChange={value => setGroup(selectedRoof.id, group.id, { cols: value, panelOverrides: {} })} /></div>
                  <div className="grid grid-cols-2 gap-2"><Input label="X från vänster (m)" type="number" step="0.1" min="0" value={group.xM} onChange={value => setGroup(selectedRoof.id, group.id, { xM: value })} /><Input label="Y från överkant (m)" type="number" step="0.1" min="0" value={group.yM} onChange={value => setGroup(selectedRoof.id, group.id, { yM: value })} /></div>
                  <Select label="Montering" value={group.orientation} onChange={value => setGroup(selectedRoof.id, group.id, { orientation: value, panelOverrides: {} })}><option>Stående</option><option>Liggande</option></Select>
                  <ClampInfoBox product={selectedRoofProduct} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(group.threeRails)} onChange={event => setGroup(selectedRoof.id, group.id, { threeRails: event.target.checked })} />Tre skenor</label>
                </div>
              ))}
            </div>

            <RoofPreview roofs={roofs} products={panelProducts} dragMode={dragMode} selectedItem={selectedItem} setSelectedItem={setSelectedItem} setSelectedRoofId={setSelectedRoofId} onMovePanel={movePanel} onMoveGroup={moveGroup} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
