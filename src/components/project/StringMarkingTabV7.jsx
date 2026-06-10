import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cable, Minus, Plus, Save, Trash2 } from 'lucide-react';

const SCALE = 58;
const PLUS = '#ef4444';
const MINUS = '#111827';
const OUT = 36;
const WIRE = 8;
const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777'];
const WEATHER = ['Soligt', 'Lätta moln', 'Molnigt', 'Regn'];
const TIMES = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const json = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const stringKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function readLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeLocal(id, payload) {
  if (typeof window === 'undefined' || !id) return;
  try { window.localStorage.setItem(stringKey(id), JSON.stringify(payload)); } catch {}
}

function readPlanner(project) {
  const fromProject = json(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  if (Array.isArray(fromProject?.roofs) && fromProject.roofs.some(r => (r.panelGroups || []).length)) return fromProject;
  const fromLocal = readLocal(plannerKey(project?.id));
  if (Array.isArray(fromLocal?.roofs) && fromLocal.roofs.some(r => (r.panelGroups || []).length)) return fromLocal;
  return { roofs: [] };
}

function readSaved(project) {
  const fromProject = json(project?.string_layout_data, null);
  const fromLocal = readLocal(stringKey(project?.id));
  const data = fromProject?.strings ? fromProject : fromLocal;
  return data?.strings ? data : { stringCount: 1, strings: [], settings: {} };
}

function productSize(product, orientation) {
  const data = product || {};
  const w = pos(data.width_mm, 1134) / 1000;
  const h = pos(data.height_mm, 1953) / 1000;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: h, h: w } : { w, h };
}

function roofPoints(x, y, w, h) {
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function buildMap(plan, products) {
  const roofs = [];
  const panels = [];
  let y = 70;
  (plan.roofs || []).forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const box = { roof, x: 70, y, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofs.push(box);
    y += box.h + 90;
    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const product = group.panelProductSnapshot || group.panelProduct || products.find(p => p.id === group.panelProductId) || null;
      const size = productSize(product, group.orientation);
      const pw = size.w * SCALE;
      const ph = size.h * SCALE;
      const sx = box.x + pos(group.xM) * SCALE;
      const sy = box.y + pos(group.yM) * SCALE;
      const rows = Math.max(1, Math.round(pos(group.rows, 1)));
      const cols = Math.max(1, Math.round(pos(group.cols, 1)));
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const override = group.panelOverrides?.[`${row}-${col}`];
          const px = override ? box.x + pos(override.xM) * SCALE : sx + col * (pw + 0.035 * SCALE);
          const py = override ? box.y + pos(override.yM) * SCALE : sy + row * (ph + 0.035 * SCALE);
          panels.push({
            id: `${roofId}-${group.id || groupIndex}-${row}-${col}`,
            number: panels.length + 1,
            x: px,
            y: py,
            w: pw,
            h: ph,
            plus: { x: px + pw / 2 - WIRE, y: py + ph * 0.32 },
            minus: { x: px + pw / 2 + WIRE, y: py + ph * 0.72 },
            black: { x: px, y: py + ph / 2 },
            red: { x: px + pw, y: py + ph / 2 },
          });
        }
      }
    });
  });
  return { roofs, panels, width: Math.max(900, ...roofs.map(r => r.x + r.w + 170), 900), height: Math.max(560, y + 70) };
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

function count(nodes = []) {
  return ids(nodes).length;
}

function recount(item) {
  return { ...item, panel_count: count(item.nodes), startPolarity: item.startPolarity === 'minus' ? 'minus' : 'plus' };
}

function orderedPanels(string, map) {
  return ids(string.nodes).map(id => map.panels.find(panel => panel.id === id)).filter(Boolean);
}

function outside(panel, polarity, side) {
  const base = polarity === 'plus' ? panel.plus : panel.minus;
  return { x: side === 'left' ? panel.x - OUT : panel.x + panel.w + OUT, y: base.y };
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
  const last = panels[panels.length - 1];
  const startPolarity = string.startPolarity === 'minus' ? 'minus' : 'plus';
  const plusBase = orth(panels.map(panel => panel.plus));
  const minusBase = orth(panels.map(panel => panel.minus));
  return {
    panels,
    startPolarity,
    plus: startPolarity === 'plus' ? [outside(first, 'plus', 'left'), ...plusBase] : [...plusBase, outside(last, 'plus', 'right')],
    minus: startPolarity === 'minus' ? [outside(first, 'minus', 'left'), ...minusBase] : [...minusBase, outside(last, 'minus', 'right')],
  };
}

function pointText(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function Terminal({ panel, plus, side, selected, onClick }) {
  if (!panel) return null;
  const point = outside(panel, plus ? 'plus' : 'minus', side);
  const color = plus ? PLUS : MINUS;
  return (
    <g onClick={event => { event.stopPropagation(); onClick?.(); }} className="cursor-pointer">
      <circle cx={point.x} cy={point.y} r={selected ? 12 : 10} fill="white" stroke={color} strokeWidth={selected ? 4 : 2.5} />
      <text x={point.x} y={point.y + 5} textAnchor="middle" fontSize="17" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text>
    </g>
  );
}

function Canvas({ map, strings, activeId, activeString, onPanelClick, onStartPolarity }) {
  const selectedIds = new Set(ids(activeString?.nodes || []));
  const owners = new Map();
  strings.forEach(string => ids(string.nodes).forEach(id => {
    if (!owners.has(id) || string.id === activeId) owners.set(id, string);
  }));

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]">
        <defs><pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {map.roofs.map(roof => <g key={roof.roof.id || roof.roof.name}><text x={roof.x} y={roof.y - 22} fontSize="18" fontWeight="800">{roof.roof.name || 'Tak'}</text><polygon points={roofPoints(roof.x, roof.y, roof.w, roof.h)} fill="url(#roof-hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
        {strings.map(string => {
          const path = cablePath(string, map);
          if (!path.panels.length) return null;
          const isActive = string.id === activeId;
          const startPlus = path.startPolarity === 'plus';
          const startPanel = path.panels[0];
          const endPanel = path.panels[path.panels.length - 1];
          return <g key={string.id}>
            <polyline points={pointText(path.plus)} fill="none" stroke={PLUS} strokeWidth={isActive ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 1 : 0.55} />
            <polyline points={pointText(path.minus)} fill="none" stroke={MINUS} strokeWidth={isActive ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.9 : 0.55} />
            {startPlus && path.plus.map((point, index) => <circle key={`p-${index}`} cx={point.x} cy={point.y} r={isActive ? 3.5 : 2.5} fill={PLUS} stroke="white" />)}
            {!startPlus && path.minus.map((point, index) => <circle key={`m-${index}`} cx={point.x} cy={point.y} r={isActive ? 3.5 : 2.5} fill={MINUS} stroke="white" strokeWidth="1.5" />)}
            {isActive && <Terminal panel={startPanel} plus selected={startPlus} side="left" onClick={() => onStartPolarity(string.id, 'plus')} />}
            {isActive && <Terminal panel={startPanel} plus={false} selected={!startPlus} side="left" onClick={() => onStartPolarity(string.id, 'minus')} />}
            {isActive && <Terminal panel={endPanel} plus={!startPlus} selected side="right" />}
          </g>;
        })}
        {map.panels.map(panel => {
          const owner = owners.get(panel.id);
          const selected = selectedIds.has(panel.id);
          const fill = owner ? `${owner.color}22` : '#dbeafe';
          const stroke = selected ? activeString?.color || '#2563eb' : owner?.color || '#2563eb';
          return <g key={panel.id} onClick={() => onPanelClick(panel)} className="cursor-pointer"><rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="4" fill={fill} stroke={stroke} strokeWidth={selected ? 4 : owner ? 3 : 1.5} /><text x={panel.x + panel.w / 2} y={panel.y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{panel.number}</text>{owner && <text x={panel.x + panel.w / 2} y={panel.y + panel.h - 6} textAnchor="middle" fontSize="9" fontWeight="800" fill={owner.color}>{owner.name}</text>}<circle cx={panel.black.x} cy={panel.black.y} r="5" fill="#111827" stroke="white" strokeWidth="1.5" /><circle cx={panel.red.x} cy={panel.red.y} r="5" fill="#dc2626" stroke="white" strokeWidth="1.5" /></g>;
        })}
      </svg>
    </div>
  );
}

export default function StringMarkingTabV7({ project, onUpdate }) {
  const saved = readSaved(project);
  const plan = useMemo(() => readPlanner(project), [project]);
  const { data: products = [] } = useQuery({ queryKey: ['products-for-string-marking-stable'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panelProducts = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
  const map = useMemo(() => buildMap(plan, panelProducts), [plan, panelProducts]);
  const [countValue, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, index) => makeString(index, saved.strings?.[index])));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [settings, setSettings] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20 });
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');

  const active = strings.find(string => string.id === activeId) || strings[0];

  const buildPayload = (nextStrings = strings, overrides = {}) => ({
    version: 50,
    source: 'stable_external_start_string_tab',
    stringCount: overrides.stringCount ?? countValue,
    settings: overrides.settings ?? settings,
    strings: nextStrings.map(recount),
    savedAt: new Date().toISOString(),
  });

  const persist = async (nextStrings = strings, overrides = {}) => {
    const payload = buildPayload(nextStrings, overrides);
    writeLocal(project?.id, payload);
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

  const replaceStrings = next => {
    const normalized = next.map(recount);
    setStrings(normalized);
    persist(normalized).catch(() => {});
  };

  const setCountValue = value => {
    const nextCount = Math.max(1, Math.min(80, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index]));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(string => string.id === activeId)) setActiveId(next[0]?.id || null);
    persist(next, { stringCount: nextCount }).catch(() => {});
  };

  const patchSettings = patch => {
    const next = { ...settings, ...patch };
    setSettings(next);
    persist(strings, { settings: next }).catch(() => {});
  };

  const togglePanel = panel => {
    if (!active?.id) return;
    const selected = new Set(ids(active.nodes));
    const exists = selected.has(panel.id);
    const next = strings.map(string => {
      const base = { ...string, nodes: (string.nodes || []).filter(node => node.panelId !== panel.id) };
      if (string.id !== active.id) return recount(base);
      if (exists) return recount(base);
      return recount({ ...base, nodes: [...base.nodes, { panelId: panel.id }] });
    });
    replaceStrings(next);
  };

  const setStartPolarity = (stringId, polarity) => {
    replaceStrings(strings.map(string => string.id === stringId ? recount({ ...string, startPolarity: polarity === 'minus' ? 'minus' : 'plus' }) : string));
  };

  const clearActive = () => active?.id && replaceStrings(strings.map(string => string.id === active.id ? recount({ ...string, nodes: [] }) : string));

  if (!map.panels.length) {
    return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div></CardContent></Card>;
  }

  return <div className="space-y-4"><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Starten ligger utanför första panelen. Klicka + eller - utanför panelen för att välja startpol.</p></CardHeader><CardContent className="space-y-4"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-sm font-bold">1. Välj antal slingor</div><p className="text-xs text-muted-foreground">Välj antal slingor och klicka panelerna manuellt.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setCountValue(Math.max(1, countValue - 1))} disabled={countValue <= 1}><Minus className="h-4 w-4" /></Button><input type="number" min="1" max="80" value={countValue} onChange={event => setCountValue(event.target.value)} className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-center text-lg font-black" /><Button variant="outline" size="icon" onClick={() => setCountValue(Math.min(80, countValue + 1))}><Plus className="h-4 w-4" /></Button></div></div><div className="mt-3 flex flex-wrap gap-2">{strings.map(string => <button key={string.id} onClick={() => setActiveId(string.id)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${string.id === activeId ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground'}`}>{string.name} · {count(string.nodes)} paneler · start {string.startPolarity === 'minus' ? '-' : '+'}</button>)}</div></div><div className="grid gap-3 lg:grid-cols-3"><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Väder</span><select value={settings.weather} onChange={event => patchSettings({ weather: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{WEATHER.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Tid</span><select value={settings.timeOfDay} onChange={event => patchSettings({ timeOfDay: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{TIMES.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Temperatur °C</span><input type="number" value={settings.ambientTemperatureC} onChange={event => patchSettings({ ambientTemperatureC: Number(event.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">Klicka panelerna i kabelordning. + och - ligger utanför panelen och tar inte bort panelen ur slingan.</div><Canvas map={map} strings={strings} activeId={activeId} activeString={active} onPanelClick={togglePanel} onStartPolarity={setStartPolarity} /><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv slinga: <b>{active?.name}</b> · {count(active?.nodes)} paneler · start {active?.startPolarity === 'minus' ? '-' : '+'}</div><div className="flex gap-2"><Button variant="outline" className="text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={() => persist(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button></div>{saveInfo && <div className="w-full text-xs text-muted-foreground">{saveInfo}</div>}</div></CardContent></Card></div>;
}
