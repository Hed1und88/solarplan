import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Home,
  Layers,
  Maximize2,
  Minimize2,
  MousePointer2,
  PanelTop,
  Plus,
  Save,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { resolveProductClampZone } from '@/lib/productDocuments';

const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };
const PANEL_GAP_M = 0.03;
const SCALE = 58;
const SHAPES = ['Rektangel', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger', 'Vinkel vänster', 'Vinkel höger'];
const ROOF_MATERIALS = ['Falsat', 'Plegel tak', 'Tegelpannor', 'Betongpannor', 'Papptak', 'Plåttak', 'Duktak'];
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
  material: 'Tegelpannor',
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
  return products.find(product => String(product.id) === String(roof?.panelProductId)) || roof?.panelProductSnapshot || DEFAULT_PANEL;
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
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <input
        type={type}
        step={step}
        min={min}
        value={value ?? ''}
        onChange={event => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <select
        value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      >
        {children}
      </select>
    </label>
  );
}

function IconButton({ title, active = false, danger = false, onClick, disabled = false, children, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-orange-300 bg-orange-50 text-orange-600 shadow-sm'
          : danger
            ? 'border-transparent text-red-500 hover:border-red-100 hover:bg-red-50'
            : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function InspectorSection({ title, icon: Icon, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {Icon && <Icon className="h-4 w-4 text-slate-500" />}
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ClampInfoBox({ product }) {
  const clampZone = resolveProductClampZone(product || DEFAULT_PANEL);
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${clampZone.hasProductZone ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="font-semibold">Klämzon: {clampZone.label}</div>
      <div className="mt-0.5 line-clamp-2 opacity-80">{clampZone.source}</div>
    </div>
  );
}

function RoofPreview({ roofs, products, dragMode, selectedItem, setSelectedItem, selectedRoofId, setSelectedRoofId, onMovePanel, onMoveGroup, zoom, fitKey }) {
  const pad = 60;
  const gap = 95;
  const [drag, setDrag] = useState(null);
  const scrollRef = useRef(null);
  let y = pad;
  const layouts = roofs.map(roof => {
    const layout = { roof, x: pad, y, w: positive(roof.widthM, 8) * SCALE, h: positive(roof.roofFallM, 6) * SCALE };
    y += layout.h + gap;
    return layout;
  });
  const width = Math.max(900, ...layouts.map(layout => layout.x + layout.w + 160));
  const height = Math.max(520, y + pad);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const selectedLayout = layouts.find(layout => String(layout.roof.id) === String(selectedRoofId)) || layouts[0];
    if (!selectedLayout) return;
    const targetLeft = Math.max(0, (selectedLayout.x + selectedLayout.w / 2) * zoom - viewport.clientWidth / 2);
    const targetTop = Math.max(0, (selectedLayout.y + selectedLayout.h / 2) * zoom - viewport.clientHeight / 2);
    viewport.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  }, [fitKey]);

  const pointFromEvent = event => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
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

  const moveDrag = event => {
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
    <div ref={scrollRef} className="h-full min-h-[560px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="touch-none"
        style={{ width: `${width * zoom}px`, height: `${height * zoom}px`, minWidth: '100%', minHeight: '100%' }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          <pattern id="roof-hatch-v2" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" />
          </pattern>
        </defs>
        {layouts.map(layout => {
          const product = panelProductForRoof(layout.roof, products);
          const isSelectedRoof = String(layout.roof.id) === String(selectedRoofId);
          return (
            <g key={layout.roof.id}>
              <text x={layout.x} y={layout.y - 25} fontSize="17" fontWeight="800" fill="#0f172a">{layout.roof.name}</text>
              <text x={layout.x} y={layout.y - 8} fontSize="11" fill="#64748b">{layout.roof.widthM} × {layout.roof.roofFallM} m · {layout.roof.angleDeg || 0}° · {panelLabel(product)}</text>
              <polygon
                points={polygonPoints(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)}
                fill="url(#roof-hatch-v2)"
                stroke={isSelectedRoof ? '#f97316' : '#94a3b8'}
                strokeWidth={isSelectedRoof ? '3' : '2'}
                onClick={() => {
                  setSelectedRoofId(layout.roof.id);
                  setSelectedItem(null);
                }}
                className="cursor-pointer"
              />
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
                      <g key={`${group.id}-${row}-${col}`} onPointerDown={event => startDrag(event, { roofId: layout.roof.id, groupId: group.id, row, col })} className="cursor-move">
                        <rect x={px} y={py} width={panelW} height={panelH} rx="4" fill={outside ? '#fee2e2' : '#dbeafe'} stroke={isSelectedPanel || isSelectedGroup ? '#f97316' : outside ? '#ef4444' : '#2563eb'} strokeWidth={isSelectedPanel || isSelectedGroup ? '3' : '1.5'} />
                        <line x1={px + panelW / 3} y1={py + 3} x2={px + panelW / 3} y2={py + panelH - 3} stroke={outside ? '#fca5a5' : '#93c5fd'} />
                        <line x1={px + panelW * 2 / 3} y1={py + 3} x2={px + panelW * 2 / 3} y2={py + panelH - 3} stroke={outside ? '#fca5a5' : '#93c5fd'} />
                        <text x={px + panelW / 2} y={py + panelH / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{row + 1}:{col + 1}</text>
                      </g>,
                    );
                  }
                }
                const groupShift = drag?.mode === 'group' && String(drag.payload.groupId) === String(group.id) ? { dx: drag.dxM * SCALE, dy: drag.dyM * SCALE } : { dx: 0, dy: 0 };
                return (
                  <g key={group.id}>
                    {panels}
                    <text x={layout.x + n(group.xM) * SCALE + groupShift.dx} y={layout.y + n(group.yM) * SCALE - 6 + groupShift.dy} fontSize="11" fontWeight="700" fill="#1d4ed8">{group.name}</text>
                  </g>
                );
              })}
            </g>
          );
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
  const [showLeftTools, setShowLeftTools] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    const nextRoofs = parseProjectLayout(project);
    setRoofs(nextRoofs);
    setSelectedRoofId(current => nextRoofs.some(roof => String(roof.id) === String(current)) ? current : nextRoofs[0]?.id || '');
    setSelectedItem(null);
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.roof_width_m, project?.roof_height_m]);

  useEffect(() => {
    if (!focusMode) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [focusMode]);

  const selectedRoof = roofs.find(roof => String(roof.id) === String(selectedRoofId)) || roofs[0];
  const selectedRoofProduct = selectedRoof ? panelProductForRoof(selectedRoof, panelProducts) : DEFAULT_PANEL;
  const selectedGroup = (selectedRoof?.panelGroups || []).find(group => String(group.id) === String(selectedItem?.groupId)) || selectedRoof?.panelGroups?.[0] || null;
  const total = useMemo(() => totals(roofs, panelProducts), [roofs, panelProducts]);
  const warnings = useMemo(
    () => roofs.flatMap(roof => (roof.panelGroups || []).map(group => ({ roof, group, size: groupSize(group, roof, panelProducts) })).filter(({ roof, group, size }) => n(group.xM) + size.w > n(roof.widthM) || n(group.yM) + size.h > n(roof.roofFallM))),
    [roofs, panelProducts],
  );

  const setRoof = (roofId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, ...patch } : roof));
  const setGroup = (roofId, groupId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, panelGroups: (roof.panelGroups || []).map(group => String(group.id) === String(groupId) ? { ...group, ...patch } : group) } : roof));

  const selectGroup = group => {
    if (!group || !selectedRoof) return;
    setSelectedItem({ mode: dragMode, roofId: selectedRoof.id, groupId: group.id });
  };

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
    setSelectedItem(null);
  };

  const deleteRoof = roofId => setRoofs(current => {
    const next = current.filter(roof => String(roof.id) !== String(roofId));
    if (!next.length) return current;
    setSelectedRoofId(next[0].id);
    setSelectedItem(null);
    return next;
  });

  const addGroup = () => {
    if (!selectedRoof) return;
    const nextIndex = (selectedRoof.panelGroups || []).length + 1;
    const group = createPanelGroup(nextIndex);
    setRoof(selectedRoof.id, { panelGroups: [...(selectedRoof.panelGroups || []), group] });
    setSelectedItem({ mode: dragMode, roofId: selectedRoof.id, groupId: group.id });
  };

  const deleteGroup = (roofId, groupId) => {
    const roof = roofs.find(item => String(item.id) === String(roofId));
    const nextGroups = (roof?.panelGroups || []).filter(group => String(group.id) !== String(groupId));
    setRoof(roofId, { panelGroups: nextGroups });
    setSelectedItem(nextGroups[0] ? { mode: dragMode, roofId, groupId: nextGroups[0].id } : null);
  };

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

  const resetView = () => {
    setZoom(1);
    setFitKey(current => current + 1);
  };

  const workbenchClass = focusMode
    ? 'fixed inset-3 z-[100] h-[calc(100vh-1.5rem)]'
    : 'relative min-h-[690px]';

  return (
    <div className={`${workbenchClass} overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 shadow-sm`}>
      <div className="flex h-full min-h-[690px] overflow-hidden">
        {showLeftTools ? (
          <aside className="relative z-20 flex w-[58px] shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 px-2 py-3">
            <IconButton title="Dölj verktygsfält" onClick={() => setShowLeftTools(false)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <div className="my-3 h-px w-8 bg-slate-200" />
            <IconButton title="Flytta en panel" active={dragMode === 'panel'} onClick={() => {
              setDragMode('panel');
              if (selectedGroup && selectedRoof) setSelectedItem({ mode: 'panel', roofId: selectedRoof.id, groupId: selectedGroup.id });
            }}>
              <MousePointer2 className="h-4 w-4" />
            </IconButton>
            <IconButton title="Flytta panelgrupp" active={dragMode === 'group'} onClick={() => {
              setDragMode('group');
              if (selectedGroup && selectedRoof) setSelectedItem({ mode: 'group', roofId: selectedRoof.id, groupId: selectedGroup.id });
            }}>
              <PanelTop className="h-4 w-4" />
            </IconButton>
            <IconButton title="Lägg till tak" onClick={addRoof}>
              <Home className="h-4 w-4" />
            </IconButton>
            <IconButton title="Lägg till panelgrupp" onClick={addGroup} disabled={!selectedRoof}>
              <Layers className="h-4 w-4" />
            </IconButton>
            <div className="mt-auto flex flex-col items-center gap-1">
              <IconButton title="Visa eller dölj inställningar" active={showInspector} onClick={() => setShowInspector(current => !current)}>
                <Settings2 className="h-4 w-4" />
              </IconButton>
              <IconButton title={focusMode ? 'Avsluta ritläge' : 'Maximera ritläge'} active={focusMode} onClick={() => setFocusMode(current => !current)}>
                {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </IconButton>
              <IconButton title="Spara panelritning" active={saving} onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
              </IconButton>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            title="Visa verktygsfält"
            aria-label="Visa verktygsfält"
            onClick={() => setShowLeftTools(true)}
            className="absolute left-2 top-1/2 z-30 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-xl border border-slate-200 bg-white text-slate-500 shadow-md hover:text-slate-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
          <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-sm font-bold text-slate-950">{selectedRoof?.name || 'Tak'}</h2>
                {selectedRoof && <span className="truncate text-xs text-slate-400">{selectedRoof.widthM} × {selectedRoof.roofFallM} m · {selectedRoof.angleDeg || 0}°</span>}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="secondary" className="h-5 text-[10px]">{total.panels} paneler</Badge>
                <Badge variant="outline" className="h-5 text-[10px]">{round(total.kwp, 2)} kWp</Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <IconButton title="Zooma in" onClick={() => setZoom(current => clamp(round(current + 0.15, 2), 0.55, 2.2))}>
                <ZoomIn className="h-4 w-4" />
              </IconButton>
              <IconButton title="Zooma ut" onClick={() => setZoom(current => clamp(round(current - 0.15, 2), 0.55, 2.2))}>
                <ZoomOut className="h-4 w-4" />
              </IconButton>
              <IconButton title="Centrera aktivt tak" onClick={resetView}>
                <Crosshair className="h-4 w-4" />
              </IconButton>
              {!showInspector && (
                <IconButton title="Visa inställningar" onClick={() => setShowInspector(true)}>
                  <Settings2 className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </header>

          <div className="relative min-h-0 flex-1 p-3">
            {warnings.length > 0 && (
              <div className="absolute left-6 top-6 z-20 flex max-w-[420px] items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm backdrop-blur">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {warnings.length} panelgrupp ligger helt eller delvis utanför takytan.
              </div>
            )}
            <RoofPreview
              roofs={roofs}
              products={panelProducts}
              dragMode={dragMode}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              selectedRoofId={selectedRoofId}
              setSelectedRoofId={setSelectedRoofId}
              onMovePanel={movePanel}
              onMoveGroup={moveGroup}
              zoom={zoom}
              fitKey={fitKey}
            />
            <div className="pointer-events-none absolute bottom-5 left-6 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-500 shadow-sm backdrop-blur">
              {dragMode === 'group' ? 'Dra i en panel för att flytta hela gruppen' : 'Dra i en panel för att flytta endast panelen'}
            </div>
          </div>
        </main>

        {showInspector ? (
          <aside className="absolute inset-y-0 right-0 z-30 w-[310px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3 shadow-xl xl:static xl:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Inställningar</div>
              <IconButton title="Dölj inställningar" onClick={() => setShowInspector(false)} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="space-y-3">
              <InspectorSection
                title="Tak"
                icon={Home}
                action={
                  <IconButton title="Lägg till tak" onClick={addRoof} className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </IconButton>
                }
              >
                <div className="space-y-1">
                  {roofs.map(roof => (
                    <button
                      type="button"
                      key={roof.id}
                      onClick={() => {
                        setSelectedRoofId(roof.id);
                        setSelectedItem(null);
                        setFitKey(current => current + 1);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${String(roof.id) === String(selectedRoof?.id) ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                    >
                      <span className="truncate">{roof.name}</span>
                      <span className={`h-3 w-3 rounded-sm border ${String(roof.id) === String(selectedRoof?.id) ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`} />
                    </button>
                  ))}
                </div>
              </InspectorSection>

              {selectedRoof && (
                <>
                  <InspectorSection
                    title="Takmått"
                    icon={Crosshair}
                    action={roofs.length > 1 ? (
                      <IconButton title="Ta bort aktivt tak" danger onClick={() => deleteRoof(selectedRoof.id)} className="h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                  >
                    <div className="space-y-2">
                      <Input label="Namn" value={selectedRoof.name} onChange={value => setRoof(selectedRoof.id, { name: value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input label="Bredd A (m)" type="number" step="0.1" min="0" value={selectedRoof.widthM} onChange={value => setRoof(selectedRoof.id, { widthM: value })} />
                        <Input label="Takfall B (m)" type="number" step="0.1" min="0" value={selectedRoof.roofFallM} onChange={value => setRoof(selectedRoof.id, { roofFallM: value })} />
                      </div>
                      <Select label="Takform" value={selectedRoof.shape} onChange={value => setRoof(selectedRoof.id, { shape: value })}>
                        {SHAPES.map(shape => <option key={shape}>{shape}</option>)}
                      </Select>
                    </div>
                  </InspectorSection>

                  <InspectorSection title="Taktyp" icon={PanelTop}>
                    <div className="grid grid-cols-1 gap-1">
                      {ROOF_MATERIALS.map(material => (
                        <button
                          type="button"
                          key={material}
                          onClick={() => setRoof(selectedRoof.id, { material })}
                          className={`rounded-lg px-2.5 py-2 text-left text-xs transition ${selectedRoof.material === material ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        >
                          {material}
                        </button>
                      ))}
                    </div>
                  </InspectorSection>

                  <InspectorSection title="Lutning" icon={Crosshair}>
                    <Input label="Taklutning (°)" type="number" min="0" value={selectedRoof.angleDeg} onChange={value => setRoof(selectedRoof.id, { angleDeg: value })} />
                  </InspectorSection>

                  <InspectorSection title="Solpanel" icon={PanelTop}>
                    <div className="space-y-2">
                      <ProductSearchSelect
                        label="Panel för aktivt tak"
                        products={panelProducts}
                        value={selectedRoof.panelProductId || ''}
                        onChange={value => {
                          const product = panelProducts.find(item => String(item.id) === String(value)) || null;
                          setRoof(selectedRoof.id, { panelProductId: value, panelProductSnapshot: panelSnapshot(product) });
                        }}
                        placeholder="Sök panel"
                      />
                      <ClampInfoBox product={selectedRoofProduct} />
                    </div>
                  </InspectorSection>

                  <InspectorSection
                    title="Panelgrupp"
                    icon={Layers}
                    action={
                      <IconButton title="Lägg till panelgrupp" onClick={addGroup} className="h-8 w-8">
                        <Plus className="h-4 w-4" />
                      </IconButton>
                    }
                  >
                    {(selectedRoof.panelGroups || []).length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(selectedRoof.panelGroups || []).map(group => (
                            <button
                              type="button"
                              key={group.id}
                              onClick={() => selectGroup(group)}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] transition ${String(selectedGroup?.id) === String(group.id) ? 'border-orange-300 bg-orange-50 font-semibold text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                            >
                              {group.name}
                            </button>
                          ))}
                        </div>
                        {selectedGroup && (
                          <div className="space-y-2 border-t border-slate-100 pt-3">
                            <div className="flex items-end gap-2">
                              <div className="min-w-0 flex-1">
                                <Input label="Namn" value={selectedGroup.name} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { name: value })} />
                              </div>
                              <IconButton title="Ta bort panelgrupp" danger onClick={() => deleteGroup(selectedRoof.id, selectedGroup.id)}>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input label="Rader" type="number" min="0" value={selectedGroup.rows} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { rows: value, panelOverrides: {} })} />
                              <Input label="Kolumner" type="number" min="0" value={selectedGroup.cols} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { cols: value, panelOverrides: {} })} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input label="X från vänster" type="number" step="0.1" min="0" value={selectedGroup.xM} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { xM: value })} />
                              <Input label="Y från överkant" type="number" step="0.1" min="0" value={selectedGroup.yM} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { yM: value })} />
                            </div>
                            <Select label="Montering" value={selectedGroup.orientation} onChange={value => setGroup(selectedRoof.id, selectedGroup.id, { orientation: value, panelOverrides: {} })}>
                              <option>Stående</option>
                              <option>Liggande</option>
                            </Select>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                              <input type="checkbox" checked={Boolean(selectedGroup.threeRails)} onChange={event => setGroup(selectedRoof.id, selectedGroup.id, { threeRails: event.target.checked })} />
                              Tre skenor
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={addGroup} className="w-full gap-2">
                        <Plus className="h-4 w-4" /> Lägg till panelgrupp
                      </Button>
                    )}
                  </InspectorSection>

                  <Button onClick={save} disabled={saving} className="w-full gap-2 bg-orange-500 text-white hover:bg-orange-600">
                    <Save className="h-4 w-4" />
                    {saving ? 'Sparar...' : 'Spara ritning'}
                  </Button>
                </>
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            title="Visa inställningar"
            aria-label="Visa inställningar"
            onClick={() => setShowInspector(true)}
            className="absolute right-2 top-1/2 z-30 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl border border-slate-200 bg-white text-slate-500 shadow-md hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
