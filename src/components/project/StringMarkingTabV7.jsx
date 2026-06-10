import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cable, Hand, Layers, Minus, MousePointer2, Move, Plus, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

const DEFAULT_SCALE = 60;
const PANEL_GAP_M = 0.03;
const PLUS = '#ef4444';
const MINUS = '#334155';
const OUT = 34;
const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777'];
const WEATHER = ['Soligt', 'Lätta moln', 'Molnigt', 'Regn'];
const TIMES = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };

const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => toNumber(value, fallback) > 0 ? toNumber(value, fallback) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const stringKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function parseJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function readLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeLocal(key, payload) {
  if (typeof window === 'undefined' || !key) return;
  try { window.localStorage.setItem(key, JSON.stringify(payload)); } catch {}
}

function hasPanelGroups(data) {
  return data?.roofs?.some(roof => (roof.panelGroups || []).length);
}

function readPlanner(project) {
  const local = readLocal(plannerKey(project?.id));
  const projectData = parseJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  if (hasPanelGroups(local)) return local;
  if (hasPanelGroups(projectData)) return projectData;
  if (Array.isArray(local?.roofs) && local.roofs.length) return local;
  if (Array.isArray(projectData?.roofs) && projectData.roofs.length) return projectData;
  return { version: 7, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

function readSaved(project) {
  const projectData = parseJson(project?.string_layout_data, null);
  const local = readLocal(stringKey(project?.id));
  const data = projectData?.strings ? projectData : local;
  return data?.strings ? data : { stringCount: 1, strings: [], settings: {} };
}

function panelProductForRoof(roof, products) {
  return products.find(product => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

function panelSize(orientation, product) {
  const base = {
    w: (toNumber(product?.width_mm, DEFAULT_PANEL.width_mm) || DEFAULT_PANEL.width_mm) / 1000,
    h: (toNumber(product?.height_mm, DEFAULT_PANEL.height_mm) || DEFAULT_PANEL.height_mm) / 1000,
  };
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
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

function getPanelBasePosition(group, roof, products, row, col) {
  const product = panelProductForRoof(roof, products);
  const s = panelSize(group.orientation, product);
  const key = `${row}-${col}`;
  const override = group.panelOverrides?.[key];
  return override ? { xM: toNumber(override.xM), yM: toNumber(override.yM) } : { xM: toNumber(group.xM) + col * (s.w + PANEL_GAP_M), yM: toNumber(group.yM) + row * (s.h + PANEL_GAP_M) };
}

function groupPhysicalSize(group, roof, products) {
  const s = panelSize(group.orientation, panelProductForRoof(roof, products));
  return {
    w: toNumber(group.cols) * s.w + Math.max(0, toNumber(group.cols) - 1) * PANEL_GAP_M,
    h: toNumber(group.rows) * s.h + Math.max(0, toNumber(group.rows) - 1) * PANEL_GAP_M,
  };
}

function clampText(roof) {
  const groups = roof?.panelGroups || [];
  const clampMm = groups.find(group => group.clampMm)?.clampMm || groups[0]?.clampMm;
  return clampMm ? ` · Klämzon ${clampMm} mm` : '';
}

function buildMap(plan, products, scale) {
  const pad = 80;
  const roofGap = 110;
  let cursorY = pad;
  const roofs = [];
  const groups = [];
  const panels = [];

  (plan.roofs || []).forEach((roof, roofIndex) => {
    const roofId = roof.id ?? roofIndex;
    const product = panelProductForRoof(roof, products);
    const layout = {
      roof,
      roofId,
      x: pad,
      y: cursorY,
      w: toNumber(roof.widthM, 8) * scale,
      h: toNumber(roof.roofFallM, 6) * scale,
      product,
      productLabel: productLabel(product),
    };
    roofs.push(layout);
    cursorY += layout.h + roofGap;

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupId = group.id ?? groupIndex;
      const s = panelSize(group.orientation, product);
      const panelW = s.w * scale;
      const panelH = s.h * scale;
      const rows = Math.max(0, Math.round(toNumber(group.rows)));
      const cols = Math.max(0, Math.round(toNumber(group.cols)));
      groups.push({ id: `${roofId}-${groupId}`, roofId, groupId, name: group.name || `Panelgrupp ${groupIndex + 1}`, x: layout.x + toNumber(group.xM) * scale, y: layout.y + toNumber(group.yM) * scale });

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const base = getPanelBasePosition(group, roof, products, row, col);
          const x = layout.x + base.xM * scale;
          const y = layout.y + base.yM * scale;
          panels.push({
            id: `${roofId}-${groupId}-${row}-${col}`,
            number: panels.length + 1,
            roofId,
            groupId,
            row,
            col,
            groupName: group.name || `Panelgrupp ${groupIndex + 1}`,
            x,
            y,
            w: panelW,
            h: panelH,
            plus: { x: x + panelW + 7, y: y + panelH / 2 },
            minus: { x: x - 7, y: y + panelH / 2 },
          });
        }
      }
    });
  });

  return {
    roofs,
    groups,
    panels,
    width: Math.max(900, ...roofs.map(roof => roof.x + roof.w + 220)),
    height: Math.max(620, ...roofs.map(roof => roof.y + roof.h + roofGap + pad)),
  };
}

function makeString(index, old = {}) {
  return { id: old.id || uid(), name: old.name || `Slinga ${index + 1}`, color: old.color || COLORS[index % COLORS.length], nodes: Array.isArray(old.nodes) ? old.nodes : [], panel_count: old.panel_count || 0, mppt: old.mppt || 1, pvInput: old.pvInput || 1, startPolarity: old.startPolarity === 'minus' ? 'minus' : 'plus' };
}

function ids(nodes = []) {
  const seen = new Set();
  const result = [];
  nodes.forEach(node => { if (node?.panelId && !seen.has(node.panelId)) { seen.add(node.panelId); result.push(node.panelId); } });
  return result;
}

function validNodes(nodes = [], map) {
  const valid = new Set(map.panels.map(panel => panel.id));
  return (nodes || []).filter(node => valid.has(node.panelId));
}

function count(nodes = [], map = null) {
  return map ? ids(validNodes(nodes, map)).length : ids(nodes).length;
}

function recount(item, map = null) {
  const nodes = map ? validNodes(item.nodes || [], map) : (item.nodes || []);
  return { ...item, nodes, panel_count: count(nodes), startPolarity: item.startPolarity === 'minus' ? 'minus' : 'plus' };
}

function orderedPanels(string, map) {
  return ids(validNodes(string.nodes, map)).map(id => map.panels.find(panel => panel.id === id)).filter(Boolean);
}

function outsideStart(panel, polarity) {
  const base = polarity === 'plus' ? panel.plus : panel.minus;
  return { x: panel.x - OUT, y: base.y };
}

function terminalPoint(panel, polarity, side = 'inside') {
  if (side === 'left') return outsideStart(panel, polarity);
  return polarity === 'plus' ? panel.plus : panel.minus;
}

function orth(points) {
  if (!points.length) return [];
  const output = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = output[output.length - 1];
    const next = points[i];
    if (Math.abs(prev.x - next.x) > 1 && Math.abs(prev.y - next.y) > 1) output.push({ x: prev.x, y: next.y });
    output.push(next);
  }
  return output;
}

function cablePath(string, map) {
  const panels = orderedPanels(string, map);
  if (!panels.length) return { panels: [], plus: [], minus: [], startPolarity: string.startPolarity || 'plus' };
  const first = panels[0];
  const startPolarity = string.startPolarity === 'minus' ? 'minus' : 'plus';
  const plusBase = orth(panels.map(panel => panel.plus));
  const minusBase = orth(panels.map(panel => panel.minus));
  return { panels, startPolarity, plus: startPolarity === 'plus' ? [outsideStart(first, 'plus'), ...plusBase] : plusBase, minus: startPolarity === 'minus' ? [outsideStart(first, 'minus'), ...minusBase] : minusBase };
}

function pointText(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function Terminal({ panel, plus, side = 'inside', selected, onClick }) {
  if (!panel) return null;
  const point = terminalPoint(panel, plus ? 'plus' : 'minus', side);
  const color = plus ? PLUS : MINUS;
  return <g onClick={event => { event.stopPropagation(); onClick?.(); }} className="cursor-pointer"><circle cx={point.x} cy={point.y} r={selected ? 11 : 9} fill="#ffffff" stroke={color} strokeWidth={selected ? 2.6 : 2} /><text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="13" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text></g>;
}

function PanelModule({ panel, owner, selected, activeString, tool, dragOffset, onPanelClick, onPanelPointerDown }) {
  const x = panel.x + (dragOffset?.dx || 0);
  const y = panel.y + (dragOffset?.dy || 0);
  const moving = tool === 'panel' || tool === 'group';
  const ring = selected ? activeString?.color || PLUS : owner?.color || '#2563eb';
  const accent = owner?.color || '#38bdf8';

  return (
    <g onPointerDown={event => moving && onPanelPointerDown(event, panel)} onClick={() => tool === 'string' && onPanelClick(panel)} className={moving ? 'cursor-move' : 'cursor-pointer'}>
      <rect x={x} y={y} width={panel.w} height={panel.h} rx="3" fill="#111827" stroke="#cbd5e1" strokeWidth="1.5" />
      <rect x={x + 2.5} y={y + 2.5} width={Math.max(0, panel.w - 5)} height={Math.max(0, panel.h - 5)} rx="2" fill="url(#pvGlass)" stroke={ring} strokeWidth={selected ? 3.2 : owner ? 2.4 : 1.4} />
      <rect x={x + 6} y={y + 6} width={Math.max(0, panel.w - 12)} height={Math.max(0, panel.h - 12)} rx="2" fill="url(#pvCells)" opacity="0.95" />
      <line x1={x + panel.w / 3} y1={y + 6} x2={x + panel.w / 3} y2={y + panel.h - 6} stroke="#e0f2fe" strokeWidth="0.7" opacity="0.25" />
      <line x1={x + panel.w * 2 / 3} y1={y + 6} x2={x + panel.w * 2 / 3} y2={y + panel.h - 6} stroke="#e0f2fe" strokeWidth="0.7" opacity="0.25" />
      <rect x={x + panel.w / 2 - 7} y={y + panel.h - 5} width="14" height="7" rx="1.5" fill="#020617" />
      <g transform={`translate(${x + 8}, ${y + 9})`}>
        <rect width="30" height="16" rx="4" fill="#ffffff" opacity="0.16" />
        <text x="15" y="12" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="900" fill="#f8fafc">{panel.row + 1}:{panel.col + 1}</text>
      </g>
      {owner && <text x={x + panel.w / 2} y={y + panel.h - 13} textAnchor="middle" fontSize="9" fontWeight="900" fill={accent}>{owner.name}</text>}
      <circle cx={x} cy={y + panel.h / 2} r="4.3" fill="#020617" stroke="#e5e7eb" strokeWidth="1" />
      <circle cx={x + panel.w} cy={y + panel.h / 2} r="4.3" fill="#ef4444" stroke="#fee2e2" strokeWidth="1" />
    </g>
  );
}

function Canvas({ map, strings, activeId, activeString, tool, scale, setScale, onPanelClick, onStartPolarity, onMovePanel, onMoveGroup }) {
  const selectedIds = new Set(ids(validNodes(activeString?.nodes || [], map)));
  const owners = new Map();
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [pan, setPan] = useState(null);
  strings.forEach(string => ids(validNodes(string.nodes, map)).forEach(id => { if (!owners.has(id) || string.id === activeId) owners.set(id, string); }));

  const pointFromEvent = event => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const startMove = (event, panel) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event); setDrag({ panel, mode: tool, startX: point.x, startY: point.y, dxM: 0, dyM: 0 }); };
  const startPan = event => { if (tool !== 'pan') return; const el = scrollRef.current; if (!el) return; setPan({ x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop }); };
  const onPointerMove = event => {
    if (drag) { const point = pointFromEvent(event); setDrag(current => current ? { ...current, dxM: (point.x - current.startX) / scale, dyM: (point.y - current.startY) / scale } : current); return; }
    if (pan && scrollRef.current) { scrollRef.current.scrollLeft = pan.left - (event.clientX - pan.x); scrollRef.current.scrollTop = pan.top - (event.clientY - pan.y); }
  };
  const endPointer = () => { if (drag) { if (Math.abs(drag.dxM) > 0.005 || Math.abs(drag.dyM) > 0.005) { if (drag.mode === 'panel') onMovePanel(drag.panel, drag.dxM, drag.dyM); if (drag.mode === 'group') onMoveGroup(drag.panel, drag.dxM, drag.dyM); } setDrag(null); } if (pan) setPan(null); };
  const previewOffset = panel => {
    if (!drag) return { dx: 0, dy: 0 };
    if (drag.mode === 'panel' && drag.panel.id === panel.id) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    if (drag.mode === 'group' && drag.panel.groupId === panel.groupId && drag.panel.roofId === panel.roofId) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    return { dx: 0, dy: 0 };
  };

  return (
    <div ref={scrollRef} className="relative overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
      <div className="absolute right-3 top-3 z-10 flex gap-2 print:hidden"><button onClick={() => setScale(v => Math.min(120, v + 8))} className="rounded bg-white p-2 shadow"><ZoomIn className="h-4 w-4" /></button><button onClick={() => setScale(v => Math.max(28, v - 8))} className="rounded bg-white p-2 shadow"><ZoomOut className="h-4 w-4" /></button><button onClick={() => setScale(DEFAULT_SCALE)} className="rounded bg-white px-3 py-2 text-xs font-bold shadow">100%</button></div>
      <svg viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid meet" className="block h-[620px] w-full min-w-[900px] touch-none bg-white" onPointerDown={startPan} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerLeave={endPointer}>
        <defs>
          <pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern>
          <linearGradient id="pvGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0f172a" /><stop offset="46%" stopColor="#172554" /><stop offset="100%" stopColor="#020617" /></linearGradient>
          <pattern id="pvCells" width="13" height="18" patternUnits="userSpaceOnUse"><rect width="13" height="18" fill="none" stroke="#e0f2fe" strokeWidth="0.45" opacity="0.20" /><line x1="6.5" y1="0" x2="6.5" y2="18" stroke="#e0f2fe" strokeWidth="0.25" opacity="0.14" /></pattern>
        </defs>
        {map.roofs.map(roof => (
          <g key={roof.roofId}>
            <text x={roof.x} y={roof.y - 24} fontSize="18" fontWeight="800">{roof.roof.name}</text>
            <text x={roof.x} y={roof.y - 7} fontSize="11" fill="#64748b">{roof.productLabel} · {toNumber(roof.product.width_mm, DEFAULT_PANEL.width_mm)}x{toNumber(roof.product.height_mm, DEFAULT_PANEL.height_mm)} mm · {roof.roof.widthM} x {roof.roof.roofFallM} m{clampText(roof.roof)}</text>
            <polygon points={polygonPoints(roof.x, roof.y, roof.w, roof.h, roof.roof.shape)} fill="url(#roof-hatch)" stroke="#111827" strokeWidth="2.5" />
          </g>
        ))}
        {map.groups.map(group => <text key={group.id} x={group.x} y={group.y - 7} fontSize="11" fontWeight="800" fill="#1d4ed8">{group.name}</text>)}
        {strings.map(string => {
          const path = cablePath(string, map);
          if (!path.panels.length) return null;
          const isActive = string.id === activeId;
          const startPlus = path.startPolarity === 'plus';
          return <g key={string.id}><polyline points={pointText(path.plus)} fill="none" stroke={PLUS} strokeWidth={isActive ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.95 : 0.42} /><polyline points={pointText(path.minus)} fill="none" stroke={MINUS} strokeWidth={isActive ? 2.2 : 1.5} strokeDasharray="7,5" strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.78 : 0.32} />{isActive && <Terminal panel={path.panels[0]} plus selected={startPlus} side="left" onClick={() => onStartPolarity(string.id, 'plus')} />}{isActive && <Terminal panel={path.panels[0]} plus={false} selected={!startPlus} side="left" onClick={() => onStartPolarity(string.id, 'minus')} />}{isActive && <Terminal panel={path.panels[path.panels.length - 1]} plus={!startPlus} selected />}</g>;
        })}
        {map.panels.map(panel => <PanelModule key={panel.id} panel={panel} owner={owners.get(panel.id)} selected={selectedIds.has(panel.id)} activeString={activeString} tool={tool} dragOffset={previewOffset(panel)} onPanelClick={onPanelClick} onPanelPointerDown={startMove} />)}
      </svg>
    </div>
  );
}

export default function StringMarkingTabV7({ project, onUpdate }) {
  const saved = readSaved(project);
  const [plannerData, setPlannerData] = useState(() => readPlanner(project));
  const { data: products = [] } = useQuery({ queryKey: ['products-panels-roof-planner'], queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }) });
  const panelProducts = products.filter(product => product.is_active !== false);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [tool, setTool] = useState('string');
  const map = useMemo(() => buildMap(plannerData, panelProducts, scale), [plannerData, panelProducts, scale]);
  const [countValue, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, index) => makeString(index, saved.strings?.[index])));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [settings, setSettings] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20 });
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');

  useEffect(() => {
    const refresh = () => { const next = readPlanner(project); setPlannerData(current => JSON.stringify(current?.roofs || []) === JSON.stringify(next?.roofs || []) ? current : next); };
    refresh();
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  const active = strings.find(string => string.id === activeId) || strings[0];
  const visibleCount = string => count(string?.nodes || [], map);
  const cleanStrings = nextStrings => nextStrings.map(item => recount(item, map));
  const buildPayload = (nextStrings = strings, overrides = {}) => ({ version: 56, source: 'exact_paneler_geometry_real_pv_slingor', stringCount: overrides.stringCount ?? countValue, settings: overrides.settings ?? settings, strings: cleanStrings(nextStrings), savedAt: new Date().toISOString() });
  const persistStrings = async (nextStrings = strings, overrides = {}) => { const payload = buildPayload(nextStrings, overrides); writeLocal(stringKey(project?.id), payload); setSaving(true); setSaveInfo('Sparar...'); try { await onUpdate?.({ string_layout_data: JSON.stringify(payload) }); setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`); } catch { setSaveInfo('Lokal backup sparad. Servern svarade inte.'); } finally { setSaving(false); } };
  const persistPlanner = async nextPlan => { const payload = { version: nextPlan.version || 7, scaleType: nextPlan.scaleType || 'meter', railMode: nextPlan.railMode || 'per-panel', roofs: nextPlan.roofs || [] }; setPlannerData(payload); writeLocal(plannerKey(project?.id), payload); setSaving(true); setSaveInfo('Sparar panelplacering...'); try { await onUpdate?.({ solar_roof_planner_data: JSON.stringify(payload) }); setSaveInfo(`Panelplacering sparad ${new Date().toLocaleTimeString('sv-SE')}`); } catch { setSaveInfo('Panelplacering sparad lokalt. Servern svarade inte.'); } finally { setSaving(false); } };
  const replaceStrings = next => { const normalized = cleanStrings(next); setStrings(normalized); persistStrings(normalized).catch(() => {}); };
  const setCountValue = value => { const nextCount = Math.max(1, Math.min(80, Number(value) || 1)); const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index])); setCountState(nextCount); setStrings(next); if (!next.some(string => string.id === activeId)) setActiveId(next[0]?.id || null); persistStrings(next, { stringCount: nextCount }).catch(() => {}); };
  const patchSettings = patch => { const next = { ...settings, ...patch }; setSettings(next); persistStrings(strings, { settings: next }).catch(() => {}); };
  const togglePanel = panel => { if (!active?.id) return; const selected = new Set(ids(validNodes(active.nodes, map))); const exists = selected.has(panel.id); const next = strings.map(string => { const base = { ...string, nodes: validNodes(string.nodes || [], map).filter(node => node.panelId !== panel.id) }; if (string.id !== active.id) return recount(base, map); if (exists) return recount(base, map); return recount({ ...base, nodes: [...base.nodes, { panelId: panel.id }] }, map); }); replaceStrings(next); };
  const setStartPolarity = (stringId, polarity) => replaceStrings(strings.map(string => string.id === stringId ? recount({ ...string, startPolarity: polarity === 'minus' ? 'minus' : 'plus' }, map) : string));
  const clearActive = () => active?.id && replaceStrings(strings.map(string => string.id === active.id ? recount({ ...string, nodes: [] }, map) : string));
  const updateGroup = (roofId, groupId, updater) => { const next = { ...plannerData, roofs: (plannerData.roofs || []).map(roof => String(roof.id) === String(roofId) ? { ...roof, panelGroups: (roof.panelGroups || []).map((group, index) => String(group.id ?? index) === String(groupId) ? updater(group, roof) : group) } : roof) }; persistPlanner(next).catch(() => {}); };
  const movePanel = (panel, dxM, dyM) => updateGroup(panel.roofId, panel.groupId, (group, roof) => { const s = panelSize(group.orientation, panelProductForRoof(roof, panelProducts)); const key = `${panel.row}-${panel.col}`; const current = getPanelBasePosition(group, roof, panelProducts, panel.row, panel.col); return { ...group, panelOverrides: { ...(group.panelOverrides || {}), [key]: { xM: clamp(toNumber(current.xM) + dxM, 0, Math.max(0, toNumber(roof.widthM, 8) - s.w)), yM: clamp(toNumber(current.yM) + dyM, 0, Math.max(0, toNumber(roof.roofFallM, 6) - s.h)) } } }; });
  const moveGroup = (panel, dxM, dyM) => updateGroup(panel.roofId, panel.groupId, (group, roof) => { const size = groupPhysicalSize(group, roof, panelProducts); return { ...group, xM: clamp(toNumber(group.xM) + dxM, 0, Math.max(0, toNumber(roof.widthM, 8) - size.w)), yM: clamp(toNumber(group.yM) + dyM, 0, Math.max(0, toNumber(roof.roofFallM, 6) - size.h)) }; });

  if (!map.panels.length) return <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-slate-900" />Slingor</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div></CardContent></Card>;

  return (
    <div className="space-y-4"><Card className="overflow-hidden border-slate-200 bg-slate-50 shadow-sm"><CardHeader className="border-b border-slate-200 bg-white"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-slate-950"><Cable className="h-5 w-5 text-slate-900" />Slingor - CAD stringing</CardTitle><p className="mt-1 text-sm text-slate-500">Exakt samma panelgeometri som Paneler-fliken. Slingor läggs som kabel-lager ovanpå.</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><Layers className="h-4 w-4" />Zoom {scale} px/m</div></div></CardHeader><CardContent className="space-y-4 p-4"><div className="grid gap-4 xl:grid-cols-[240px_1fr_270px]"><div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Verktyg</div><div className="mt-1 text-sm font-bold text-slate-900">Arbetsläge</div></div><div className="grid gap-2"><Button size="sm" variant={tool === 'string' ? 'default' : 'outline'} onClick={() => setTool('string')}><MousePointer2 className="mr-2 h-4 w-4" />Stränga</Button><Button size="sm" variant={tool === 'panel' ? 'default' : 'outline'} onClick={() => setTool('panel')}><Move className="mr-2 h-4 w-4" />Flytta panel</Button><Button size="sm" variant={tool === 'group' ? 'default' : 'outline'} onClick={() => setTool('group')}><Move className="mr-2 h-4 w-4" />Flytta grupp</Button><Button size="sm" variant={tool === 'pan' ? 'default' : 'outline'} onClick={() => setTool('pan')}><Hand className="mr-2 h-4 w-4" />Panorera</Button></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">Stränga = klicka paneler. Flytta panel/grupp = dra panelen. Geometrin är samma som Paneler-fliken.</div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setCountValue(Math.max(1, countValue - 1))} disabled={countValue <= 1}><Minus className="h-4 w-4" /></Button><input type="number" min="1" max="80" value={countValue} onChange={event => setCountValue(event.target.value)} className="h-10 w-20 rounded-xl border border-slate-300 bg-white px-2 text-center text-lg font-black text-slate-900" /><Button variant="outline" size="icon" onClick={() => setCountValue(Math.min(80, countValue + 1))}><Plus className="h-4 w-4" /></Button></div><div className="space-y-2">{strings.map(string => <button key={string.id} onClick={() => setActiveId(string.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold ${string.id === activeId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400'}`}><span className="block">{string.name}</span><span className="block font-medium opacity-80">{visibleCount(string)} paneler · start {string.startPolarity === 'minus' ? '-' : '+'}</span></button>)}</div></div><Canvas map={map} strings={strings} activeId={activeId} activeString={active} tool={tool} scale={scale} setScale={setScale} onPanelClick={togglePanel} onStartPolarity={setStartPolarity} onMovePanel={movePanel} onMoveGroup={moveGroup} /><div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Egenskaper</div><div className="mt-1 text-sm font-bold text-slate-900">{active?.name}</div><div className="text-xs text-slate-500">{visibleCount(active)} markerade paneler</div></div><label className="space-y-1 text-xs font-semibold text-slate-500"><span>Väder</span><select value={settings.weather} onChange={event => patchSettings({ weather: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{WEATHER.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-slate-500"><span>Tid</span><select value={settings.timeOfDay} onChange={event => patchSettings({ timeOfDay: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{TIMES.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-slate-500"><span>Temperatur °C</span><input type="number" value={settings.ambientTemperatureC} onChange={event => patchSettings({ ambientTemperatureC: Number(event.target.value) })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">Slingor använder nu samma koordinatsystem som SolarRoofPlanner.jsx.</div><Button variant="outline" className="w-full text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button className="w-full" onClick={() => persistStrings(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button>{saveInfo && <div className="text-xs text-slate-500">{saveInfo}</div>}</div></div></CardContent></Card></div>
  );
}
