import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cable, Hand, Layers, Minus, MousePointer2, Move, Plus, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

const DEFAULT_SCALE = 58;
const PLUS = '#ef4444';
const MINUS = '#334155';
const OUT = 36;
const WIRE = 8;
const PANEL_GAP_M = 0.03;
const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777'];
const WEATHER = ['Soligt', 'Lätta moln', 'Molnigt', 'Regn'];
const TIMES = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const json = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const stringKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function readLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeStringLocal(id, payload) {
  if (typeof window === 'undefined' || !id) return;
  try { window.localStorage.setItem(stringKey(id), JSON.stringify(payload)); } catch {}
}

function writePlannerLocal(id, payload) {
  if (typeof window === 'undefined' || !id) return;
  try { window.localStorage.setItem(plannerKey(id), JSON.stringify(payload)); } catch {}
}

function hasPanelGroups(data) {
  return data?.roofs?.some(roof => (roof.panelGroups || []).length);
}

function readPlanner(project) {
  const fromLocal = readLocal(plannerKey(project?.id));
  const fromProject = json(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  if (hasPanelGroups(fromLocal)) return fromLocal;
  if (hasPanelGroups(fromProject)) return fromProject;
  if (Array.isArray(fromLocal?.roofs) && fromLocal.roofs.length) return fromLocal;
  if (Array.isArray(fromProject?.roofs) && fromProject.roofs.length) return fromProject;
  return { version: 7, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

function readSaved(project) {
  const fromProject = json(project?.string_layout_data, null);
  const fromLocal = readLocal(stringKey(project?.id));
  const data = fromProject?.strings ? fromProject : fromLocal;
  return data?.strings ? data : { stringCount: 1, strings: [], settings: {} };
}

function panelProductForRoof(roof, products, group = null) {
  return group?.panelProductSnapshot || group?.panelProduct || roof?.panelProductSnapshot || products.find(product => product.id === (group?.panelProductId || roof?.panelProductId)) || DEFAULT_PANEL;
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

function productSize(product, orientation) {
  const data = product || DEFAULT_PANEL;
  const w = pos(data.width_mm, DEFAULT_PANEL.width_mm) / 1000;
  const h = pos(data.height_mm, DEFAULT_PANEL.height_mm) / 1000;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: h, h: w } : { w, h };
}

function clampLabel(roof) {
  const groups = roof?.panelGroups || [];
  const clamp = groups.find(group => group.clampMm)?.clampMm || groups[0]?.clampMm;
  return clamp ? `Klämzon ${clamp} mm` : '';
}

function groupPhysicalSize(group, roof, products) {
  const size = productSize(panelProductForRoof(roof, products, group), group.orientation);
  const cols = Math.max(1, Math.round(pos(group.cols, 1)));
  const rows = Math.max(1, Math.round(pos(group.rows, 1)));
  return {
    w: cols * size.w + Math.max(0, cols - 1) * PANEL_GAP_M,
    h: rows * size.h + Math.max(0, rows - 1) * PANEL_GAP_M,
  };
}

function getPanelBasePosition(group, roof, products, row, col) {
  const size = productSize(panelProductForRoof(roof, products, group), group.orientation);
  const key = `${row}-${col}`;
  const override = group.panelOverrides?.[key];
  if (override) return { xM: num(override.xM), yM: num(override.yM), overridden: true };
  return {
    xM: num(group.xM) + col * (size.w + PANEL_GAP_M),
    yM: num(group.yM) + row * (size.h + PANEL_GAP_M),
    overridden: false,
  };
}

function roofPoints(x, y, w, h) {
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function buildMap(plan, products, scale) {
  const roofs = [];
  const groups = [];
  const panels = [];
  let y = 82;
  (plan.roofs || []).forEach((roof, roofIndex) => {
    const roofId = roof.id ?? `roof-${roofIndex}`;
    const product = panelProductForRoof(roof, products);
    const box = {
      roof,
      roofId,
      x: 76,
      y,
      w: pos(roof.widthM, 8) * scale,
      h: pos(roof.roofFallM, 6) * scale,
      productName: productLabel(product),
      panelWidthMm: pos(product.width_mm, DEFAULT_PANEL.width_mm),
      panelHeightMm: pos(product.height_mm, DEFAULT_PANEL.height_mm),
      clampText: clampLabel(roof),
    };
    roofs.push(box);
    y += box.h + 104;
    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupProduct = panelProductForRoof(roof, products, group);
      const size = productSize(groupProduct, group.orientation);
      const pw = size.w * scale;
      const ph = size.h * scale;
      const rows = Math.max(1, Math.round(pos(group.rows, 1)));
      const cols = Math.max(1, Math.round(pos(group.cols, 1)));
      const gx = box.x + num(group.xM) * scale;
      const gy = box.y + num(group.yM) * scale;
      groups.push({ id: `${String(roofId)}-${group.id || groupIndex}`, roofId, groupId: group.id, name: group.name || `Panelgrupp ${groupIndex + 1}`, x: gx, y: gy });
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const p = getPanelBasePosition(group, roof, products, row, col);
          const px = box.x + p.xM * scale;
          const py = box.y + p.yM * scale;
          panels.push({
            id: `${String(roofId)}-${group.id || groupIndex}-${row}-${col}`,
            number: panels.length + 1,
            roofId,
            groupId: group.id,
            groupIndex,
            groupName: group.name || `Panelgrupp ${groupIndex + 1}`,
            row,
            col,
            xM: p.xM,
            yM: p.yM,
            x: px,
            y: py,
            w: pw,
            h: ph,
            plus: { x: px + pw + 7, y: py + ph / 2 },
            minus: { x: px - 7, y: py + ph / 2 },
            black: { x: px, y: py + ph / 2 },
            red: { x: px + pw, y: py + ph / 2 },
          });
        }
      }
    });
  });
  return { roofs, groups, panels, width: Math.max(980, ...roofs.map(r => r.x + r.w + 190), 980), height: Math.max(620, y + 70) };
}

function makeString(index, old = {}) {
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${index + 1}`,
    color: old.color || COLORS[index % COLORS.length],
    nodes: Array.isArray(old.nodes) ? old.nodes : [],
    panel_count: old.panel_count || 0,
    mppt: old.mppt || 1,
    pvInput: old.pvInput || 1,
    startPolarity: old.startPolarity === 'minus' ? 'minus' : 'plus',
  };
}

function ids(nodes = []) {
  const seen = new Set();
  const result = [];
  nodes.forEach(node => {
    if (node?.panelId && !seen.has(node.panelId)) {
      seen.add(node.panelId);
      result.push(node.panelId);
    }
  });
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
    const previous = output[output.length - 1];
    const next = points[i];
    if (Math.abs(previous.x - next.x) > 1 && Math.abs(previous.y - next.y) > 1) output.push({ x: previous.x, y: next.y });
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
  return {
    panels,
    startPolarity,
    plus: startPolarity === 'plus' ? [outsideStart(first, 'plus'), ...plusBase] : plusBase,
    minus: startPolarity === 'minus' ? [outsideStart(first, 'minus'), ...minusBase] : minusBase,
  };
}

function pointText(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function Terminal({ panel, plus, side = 'inside', selected, onClick }) {
  if (!panel) return null;
  const polarity = plus ? 'plus' : 'minus';
  const point = terminalPoint(panel, polarity, side);
  const color = plus ? PLUS : MINUS;
  return (
    <g onClick={event => { event.stopPropagation(); onClick?.(); }} className="cursor-pointer">
      <circle cx={point.x} cy={point.y} r={selected ? 11 : 9} fill="#ffffff" stroke={color} strokeWidth={selected ? 2.6 : 2} />
      <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="13" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text>
    </g>
  );
}

function PanelModule({ panel, owner, selected, activeString, tool, dragOffset, onPanelClick, onPanelPointerDown }) {
  const x = panel.x + (dragOffset?.dx || 0);
  const y = panel.y + (dragOffset?.dy || 0);
  const moving = tool === 'panel' || tool === 'group';
  const border = selected ? activeString?.color || PLUS : owner?.color || '#2563eb';
  const strokeWidth = selected ? 3.4 : owner ? 2.4 : 1.7;

  return (
    <g onPointerDown={event => moving && onPanelPointerDown(event, panel)} onClick={() => tool === 'string' && onPanelClick(panel)} className={moving ? 'cursor-move' : 'cursor-pointer'}>
      <rect x={x} y={y} width={panel.w} height={panel.h} rx="3" fill={owner ? '#fee2e2' : '#dbeafe'} stroke={border} strokeWidth={strokeWidth} />
      <rect x={x + 2} y={y + 2} width={Math.max(0, panel.w - 4)} height={Math.max(0, panel.h - 4)} rx="2" fill={owner ? '#fecaca' : '#dbeafe'} opacity="0.42" />
      <line x1={x + panel.w / 3} y1={y + 3} x2={x + panel.w / 3} y2={y + panel.h - 3} stroke={owner ? '#fca5a5' : '#93c5fd'} strokeWidth="1" />
      <line x1={x + panel.w * 2 / 3} y1={y + 3} x2={x + panel.w * 2 / 3} y2={y + panel.h - 3} stroke={owner ? '#fca5a5' : '#93c5fd'} strokeWidth="1" />
      <text x={x + panel.w / 2} y={y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill={owner ? '#b91c1c' : '#1d4ed8'}>{panel.row + 1}:{panel.col + 1}</text>
      {owner && <text x={x + panel.w / 2} y={y + panel.h - 9} textAnchor="middle" fontSize="9" fontWeight="900" fill={owner.color}>{owner.name}</text>}
      <circle cx={x} cy={y + panel.h / 2} r="4" fill="#0f172a" />
      <circle cx={x + panel.w} cy={y + panel.h / 2} r="4" fill="#ef4444" />
    </g>
  );
}

function Canvas({ map, strings, activeId, activeString, tool, scale, setScale, onPanelClick, onStartPolarity, onMovePanel, onMoveGroup }) {
  const selectedIds = new Set(ids(validNodes(activeString?.nodes || [], map)));
  const owners = new Map();
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [pan, setPan] = useState(null);

  strings.forEach(string => ids(validNodes(string.nodes, map)).forEach(id => {
    if (!owners.has(id) || string.id === activeId) owners.set(id, string);
  }));

  const pointFromEvent = event => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const startMove = (event, panel) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setDrag({ panel, mode: tool, startX: point.x, startY: point.y, dxM: 0, dyM: 0 });
  };

  const startPan = event => {
    if (tool !== 'pan' || event.target?.tagName !== 'svg') return;
    const el = scrollRef.current;
    if (!el) return;
    setPan({ x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop });
  };

  const onPointerMove = event => {
    if (drag) {
      const point = pointFromEvent(event);
      setDrag(current => current ? { ...current, dxM: (point.x - current.startX) / scale, dyM: (point.y - current.startY) / scale } : current);
      return;
    }
    if (pan && scrollRef.current) {
      scrollRef.current.scrollLeft = pan.left - (event.clientX - pan.x);
      scrollRef.current.scrollTop = pan.top - (event.clientY - pan.y);
    }
  };

  const endPointer = () => {
    if (drag) {
      if (Math.abs(drag.dxM) > 0.005 || Math.abs(drag.dyM) > 0.005) {
        if (drag.mode === 'panel') onMovePanel(drag.panel, drag.dxM, drag.dyM);
        if (drag.mode === 'group') onMoveGroup(drag.panel, drag.dxM, drag.dyM);
      }
      setDrag(null);
    }
    if (pan) setPan(null);
  };

  const previewOffset = panel => {
    if (!drag) return { dx: 0, dy: 0 };
    if (drag.mode === 'panel' && drag.panel.id === panel.id) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    if (drag.mode === 'group' && drag.panel.groupId === panel.groupId && drag.panel.roofId === panel.roofId) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    return { dx: 0, dy: 0 };
  };

  return (
    <div ref={scrollRef} className="relative overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
      <div className="absolute right-3 top-3 z-10 flex gap-2 print:hidden">
        <button onClick={() => setScale(value => Math.min(120, value + 8))} className="rounded bg-white p-2 shadow"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={() => setScale(value => Math.max(28, value - 8))} className="rounded bg-white p-2 shadow"><ZoomOut className="h-4 w-4" /></button>
        <button onClick={() => setScale(DEFAULT_SCALE)} className="rounded bg-white px-3 py-2 text-xs font-bold shadow">100%</button>
      </div>
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="block min-h-[620px] w-full min-w-[980px] touch-none" onPointerDown={startPan} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerLeave={endPointer}>
        <defs>
          <pattern id="cad-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.7" /></pattern>
          <pattern id="roof-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="18" stroke="#dbe3ee" strokeWidth="1.2" /></pattern>
        </defs>

        <rect width={map.width} height={map.height} fill="#ffffff" />
        <rect width={map.width} height={map.height} fill="url(#cad-grid)" />

        {map.roofs.map(roof => (
          <g key={roof.roof.id || roof.roof.name}>
            <text x={roof.x} y={roof.y - 26} fontSize="20" fontWeight="900" fill="#0f172a">{roof.roof.name || 'Tak'}</text>
            <text x={roof.x} y={roof.y - 10} fontSize="11" fontWeight="700" fill="#64748b">{roof.productName} · {roof.roof.widthM} × {roof.roof.roofFallM} m{roof.clampText ? ` · ${roof.clampText}` : ''}</text>
            <polygon points={roofPoints(roof.x, roof.y, roof.w, roof.h)} fill="url(#roof-hatch)" stroke="#111827" strokeWidth="2.5" />
          </g>
        ))}

        {map.groups.map(group => <text key={group.id} x={group.x} y={group.y - 7} fontSize="11" fontWeight="800" fill="#1d4ed8">{group.name}</text>)}

        {strings.map(string => {
          const path = cablePath(string, map);
          if (!path.panels.length) return null;
          const isActive = string.id === activeId;
          const startPlus = path.startPolarity === 'plus';
          const startPanel = path.panels[0];
          const endPanel = path.panels[path.panels.length - 1];
          return (
            <g key={string.id}>
              <polyline points={pointText(path.plus)} fill="none" stroke={PLUS} strokeWidth={isActive ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.95 : 0.42} />
              <polyline points={pointText(path.minus)} fill="none" stroke={MINUS} strokeWidth={isActive ? 2.2 : 1.5} strokeDasharray="7,5" strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.78 : 0.32} />
              {isActive && <Terminal panel={startPanel} plus selected={startPlus} side="left" onClick={() => onStartPolarity(string.id, 'plus')} />}
              {isActive && <Terminal panel={startPanel} plus={false} selected={!startPlus} side="left" onClick={() => onStartPolarity(string.id, 'minus')} />}
              {isActive && <Terminal panel={endPanel} plus={!startPlus} selected />}
            </g>
          );
        })}

        {map.panels.map(panel => {
          const owner = owners.get(panel.id);
          const selected = selectedIds.has(panel.id);
          return <PanelModule key={panel.id} panel={panel} owner={owner} selected={selected} activeString={activeString} tool={tool} dragOffset={previewOffset(panel)} onPanelClick={onPanelClick} onPanelPointerDown={startMove} />;
        })}
      </svg>
    </div>
  );
}

export default function StringMarkingTabV7({ project, onUpdate }) {
  const saved = readSaved(project);
  const [plannerData, setPlannerData] = useState(() => readPlanner(project));
  const { data: products = [] } = useQuery({ queryKey: ['products-for-string-marking-stable'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panelProducts = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
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
    const refresh = () => {
      const next = readPlanner(project);
      setPlannerData(current => JSON.stringify(current?.roofs || []) === JSON.stringify(next?.roofs || []) ? current : next);
    };
    refresh();
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  const active = strings.find(string => string.id === activeId) || strings[0];
  const visibleCount = string => count(string?.nodes || [], map);

  const cleanStrings = nextStrings => nextStrings.map(item => recount(item, map));

  const buildPayload = (nextStrings = strings, overrides = {}) => ({
    version: 54,
    source: 'paneler_aligned_string_tab',
    stringCount: overrides.stringCount ?? countValue,
    settings: overrides.settings ?? settings,
    strings: cleanStrings(nextStrings),
    savedAt: new Date().toISOString(),
  });

  const persistStrings = async (nextStrings = strings, overrides = {}) => {
    const payload = buildPayload(nextStrings, overrides);
    writeStringLocal(project?.id, payload);
    setSaving(true);
    setSaveInfo('Sparar...');
    try {
      await onUpdate?.({ string_layout_data: JSON.stringify(payload) });
      setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch {
      setSaveInfo('Lokal backup sparad. Servern svarade inte.');
    } finally {
      setSaving(false);
    }
  };

  const persistPlanner = async nextPlan => {
    const payload = { version: nextPlan.version || 7, scaleType: nextPlan.scaleType || 'meter', railMode: nextPlan.railMode || 'per-panel', roofs: nextPlan.roofs || [] };
    setPlannerData(payload);
    writePlannerLocal(project?.id, payload);
    setSaving(true);
    setSaveInfo('Sparar panelplacering...');
    try {
      await onUpdate?.({ solar_roof_planner_data: JSON.stringify(payload) });
      setSaveInfo(`Panelplacering sparad ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch {
      setSaveInfo('Panelplacering sparad lokalt. Servern svarade inte.');
    } finally {
      setSaving(false);
    }
  };

  const replaceStrings = next => {
    const normalized = cleanStrings(next);
    setStrings(normalized);
    persistStrings(normalized).catch(() => {});
  };

  const setCountValue = value => {
    const nextCount = Math.max(1, Math.min(80, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index]));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(string => string.id === activeId)) setActiveId(next[0]?.id || null);
    persistStrings(next, { stringCount: nextCount }).catch(() => {});
  };

  const patchSettings = patch => {
    const next = { ...settings, ...patch };
    setSettings(next);
    persistStrings(strings, { settings: next }).catch(() => {});
  };

  const togglePanel = panel => {
    if (!active?.id) return;
    const selected = new Set(ids(validNodes(active.nodes, map)));
    const exists = selected.has(panel.id);
    const next = strings.map(string => {
      const base = { ...string, nodes: validNodes(string.nodes || [], map).filter(node => node.panelId !== panel.id) };
      if (string.id !== active.id) return recount(base, map);
      if (exists) return recount(base, map);
      return recount({ ...base, nodes: [...base.nodes, { panelId: panel.id }] }, map);
    });
    replaceStrings(next);
  };

  const setStartPolarity = (stringId, polarity) => replaceStrings(strings.map(string => string.id === stringId ? recount({ ...string, startPolarity: polarity === 'minus' ? 'minus' : 'plus' }, map) : string));
  const clearActive = () => active?.id && replaceStrings(strings.map(string => string.id === active.id ? recount({ ...string, nodes: [] }, map) : string));

  const updateGroup = (roofId, groupId, updater) => {
    const next = {
      ...plannerData,
      roofs: (plannerData.roofs || []).map(roof => String(roof.id) === String(roofId)
        ? { ...roof, panelGroups: (roof.panelGroups || []).map(group => String(group.id) === String(groupId) ? updater(group, roof) : group) }
        : roof),
    };
    persistPlanner(next).catch(() => {});
  };

  const movePanel = (panel, dxM, dyM) => updateGroup(panel.roofId, panel.groupId, (group, roof) => {
    const size = productSize(panelProductForRoof(roof, panelProducts, group), group.orientation);
    const key = `${panel.row}-${panel.col}`;
    const current = getPanelBasePosition(group, roof, panelProducts, panel.row, panel.col);
    return { ...group, panelOverrides: { ...(group.panelOverrides || {}), [key]: { xM: clamp(num(current.xM) + dxM, 0, Math.max(0, pos(roof.widthM, 8) - size.w)), yM: clamp(num(current.yM) + dyM, 0, Math.max(0, pos(roof.roofFallM, 6) - size.h)) } } };
  });

  const moveGroup = (panel, dxM, dyM) => updateGroup(panel.roofId, panel.groupId, (group, roof) => {
    const size = groupPhysicalSize(group, roof, panelProducts);
    return { ...group, xM: clamp(num(group.xM) + dxM, 0, Math.max(0, pos(roof.widthM, 8) - size.w)), yM: clamp(num(group.yM) + dyM, 0, Math.max(0, pos(roof.roofFallM, 6) - size.h)) };
  });

  if (!map.panels.length) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-slate-900" />Slingor</CardTitle></CardHeader>
        <CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-200 bg-slate-50 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-950"><Cable className="h-5 w-5 text-slate-900" />Slingor - CAD stringing</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Samma panelritning som Paneler-fliken. Stränga, zooma/panorera eller flytta paneler/grupper.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><Layers className="h-4 w-4" />Zoom {scale} px/m</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 xl:grid-cols-[240px_1fr_270px]">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Verktyg</div><div className="mt-1 text-sm font-bold text-slate-900">Arbetsläge</div></div>
              <div className="grid gap-2">
                <Button size="sm" variant={tool === 'string' ? 'default' : 'outline'} onClick={() => setTool('string')}><MousePointer2 className="mr-2 h-4 w-4" />Stränga</Button>
                <Button size="sm" variant={tool === 'panel' ? 'default' : 'outline'} onClick={() => setTool('panel')}><Move className="mr-2 h-4 w-4" />Flytta panel</Button>
                <Button size="sm" variant={tool === 'group' ? 'default' : 'outline'} onClick={() => setTool('group')}><Move className="mr-2 h-4 w-4" />Flytta grupp</Button>
                <Button size="sm" variant={tool === 'pan' ? 'default' : 'outline'} onClick={() => setTool('pan')}><Hand className="mr-2 h-4 w-4" />Panorera</Button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">Stränga = klicka paneler. Flytta panel/grupp = dra panelen. Slingantalet räknar bara paneler som finns i aktuell Paneler-ritning.</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCountValue(Math.max(1, countValue - 1))} disabled={countValue <= 1}><Minus className="h-4 w-4" /></Button>
                <input type="number" min="1" max="80" value={countValue} onChange={event => setCountValue(event.target.value)} className="h-10 w-20 rounded-xl border border-slate-300 bg-white px-2 text-center text-lg font-black text-slate-900" />
                <Button variant="outline" size="icon" onClick={() => setCountValue(Math.min(80, countValue + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {strings.map(string => (
                  <button key={string.id} onClick={() => setActiveId(string.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold ${string.id === activeId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400'}`}>
                    <span className="block">{string.name}</span>
                    <span className="block font-medium opacity-80">{visibleCount(string)} paneler · start {string.startPolarity === 'minus' ? '-' : '+'}</span>
                  </button>
                ))}
              </div>
            </div>

            <Canvas map={map} strings={strings} activeId={activeId} activeString={active} tool={tool} scale={scale} setScale={setScale} onPanelClick={togglePanel} onStartPolarity={setStartPolarity} onMovePanel={movePanel} onMoveGroup={moveGroup} />

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Egenskaper</div><div className="mt-1 text-sm font-bold text-slate-900">{active?.name}</div><div className="text-xs text-slate-500">{visibleCount(active)} markerade paneler</div></div>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Väder</span><select value={settings.weather} onChange={event => patchSettings({ weather: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{WEATHER.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Tid</span><select value={settings.timeOfDay} onChange={event => patchSettings({ timeOfDay: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{TIMES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Temperatur °C</span><input type="number" value={settings.ambientTemperatureC} onChange={event => patchSettings({ ambientTemperatureC: Number(event.target.value) })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">Slingor läser nu lokal planner-data först, samma som Paneler-fliken skriver.</div>
              <Button variant="outline" className="w-full text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button>
              <Button className="w-full" onClick={() => persistStrings(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button>
              {saveInfo && <div className="text-xs text-slate-500">{saveInfo}</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
