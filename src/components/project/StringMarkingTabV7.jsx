import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cable, Layers, Minus, Plus, Save, Trash2 } from 'lucide-react';

const SCALE = 58;
const PLUS = '#ef4444';
const MINUS = '#334155';
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
  let y = 82;
  (plan.roofs || []).forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const box = { roof, x: 76, y, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofs.push(box);
    y += box.h + 104;
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
  return { roofs, panels, width: Math.max(980, ...roofs.map(r => r.x + r.w + 190), 980), height: Math.max(620, y + 70) };
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
      <circle cx={point.x} cy={point.y} r={selected ? 13 : 11} fill="#ffffff" stroke={color} strokeWidth={selected ? 3 : 2} />
      <circle cx={point.x} cy={point.y} r={selected ? 8 : 6.5} fill={plus ? '#fff1f2' : '#f8fafc'} />
      <text x={point.x} y={point.y + 4.5} textAnchor="middle" fontSize="14" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text>
    </g>
  );
}

function PanelModule({ panel, owner, selected, activeString, onClick }) {
  const stroke = selected ? activeString?.color || '#ef4444' : owner?.color || '#64748b';
  const status = owner ? owner.name : 'LEDIG';
  const tagColor = owner ? owner.color : '#64748b';

  return (
    <g onClick={() => onClick(panel)} className="cursor-pointer">
      <rect x={panel.x - 2} y={panel.y - 2} width={panel.w + 4} height={panel.h + 4} rx="7" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
      <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="5" fill="url(#pv-panel-glass)" stroke={stroke} strokeWidth={selected ? 3 : owner ? 2.2 : 1.4} />
      <rect x={panel.x + 4} y={panel.y + 4} width={Math.max(0, panel.w - 8)} height={Math.max(0, panel.h - 8)} rx="3" fill="url(#pv-cell-grid)" opacity="0.82" />
      <line x1={panel.x + panel.w * 0.33} y1={panel.y + 5} x2={panel.x + panel.w * 0.33} y2={panel.y + panel.h - 5} stroke="#e2e8f0" strokeWidth="0.6" opacity="0.18" />
      <line x1={panel.x + panel.w * 0.66} y1={panel.y + 5} x2={panel.x + panel.w * 0.66} y2={panel.y + panel.h - 5} stroke="#e2e8f0" strokeWidth="0.6" opacity="0.18" />
      <rect x={panel.x + panel.w / 2 - 7} y={panel.y + panel.h - 5} width="14" height="7" rx="1.5" fill="#020617" opacity="0.88" />
      <circle cx={panel.black.x} cy={panel.black.y} r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.2" />
      <circle cx={panel.red.x} cy={panel.red.y} r="4.5" fill="#ef4444" stroke="#fee2e2" strokeWidth="1.2" />
      <g transform={`translate(${panel.x + 9}, ${panel.y + 10})`}>
        <rect width="26" height="16" rx="4" fill="#ffffff" opacity="0.14" />
        <text x="13" y="12" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="900" fill="#f8fafc">{String(panel.number).padStart(2, '0')}</text>
      </g>
      <text x={panel.x + panel.w / 2} y={panel.y + panel.h - 12} textAnchor="middle" fontSize="9" fontWeight="900" fill={tagColor}>{status}</text>
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
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[620px] w-full min-w-[980px]">
        <defs>
          <pattern id="cad-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.7" />
          </pattern>
          <pattern id="roof-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="#dbe3ee" strokeWidth="1.2" />
          </pattern>
          <linearGradient id="pv-panel-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="48%" stopColor="#172554" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <pattern id="pv-cell-grid" width="14" height="18" patternUnits="userSpaceOnUse">
            <rect width="14" height="18" fill="none" stroke="#ffffff" strokeWidth="0.45" opacity="0.16" />
            <line x1="7" y1="0" x2="7" y2="18" stroke="#ffffff" strokeWidth="0.25" opacity="0.12" />
          </pattern>
        </defs>

        <rect width={map.width} height={map.height} fill="#ffffff" />
        <rect width={map.width} height={map.height} fill="url(#cad-grid)" />

        {map.roofs.map(roof => (
          <g key={roof.roof.id || roof.roof.name}>
            <text x={roof.x} y={roof.y - 26} fontSize="18" fontWeight="900" fill="#0f172a">{roof.roof.name || 'Tak'}</text>
            <text x={roof.x} y={roof.y - 10} fontSize="11" fontWeight="700" fill="#64748b">PV boundary / panelritning</text>
            <polygon points={roofPoints(roof.x, roof.y, roof.w, roof.h)} fill="url(#roof-hatch)" stroke="#475569" strokeWidth="1.7" />
            <polygon points={roofPoints(roof.x + 5, roof.y + 5, Math.max(0, roof.w - 10), Math.max(0, roof.h - 10))} fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="6,5" />
          </g>
        ))}

        {strings.map(string => {
          const path = cablePath(string, map);
          if (!path.panels.length) return null;
          const isActive = string.id === activeId;
          const startPlus = path.startPolarity === 'plus';
          const startPanel = path.panels[0];
          const endPanel = path.panels[path.panels.length - 1];
          return (
            <g key={string.id}>
              <polyline points={pointText(path.plus)} fill="none" stroke={PLUS} strokeWidth={isActive ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.98 : 0.45} />
              <polyline points={pointText(path.minus)} fill="none" stroke={MINUS} strokeWidth={isActive ? 2.6 : 1.8} strokeDasharray="7,5" strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 0.88 : 0.38} />
              {startPlus && path.plus.map((point, index) => <circle key={`p-${index}`} cx={point.x} cy={point.y} r={isActive ? 2.8 : 1.8} fill={PLUS} />)}
              {!startPlus && path.minus.map((point, index) => <circle key={`m-${index}`} cx={point.x} cy={point.y} r={isActive ? 2.8 : 1.8} fill={MINUS} />)}
              {isActive && <Terminal panel={startPanel} plus selected={startPlus} side="left" onClick={() => onStartPolarity(string.id, 'plus')} />}
              {isActive && <Terminal panel={startPanel} plus={false} selected={!startPlus} side="left" onClick={() => onStartPolarity(string.id, 'minus')} />}
              {isActive && <Terminal panel={endPanel} plus={!startPlus} selected />}
            </g>
          );
        })}

        {map.panels.map(panel => {
          const owner = owners.get(panel.id);
          const selected = selectedIds.has(panel.id);
          return <PanelModule key={panel.id} panel={panel} owner={owner} selected={selected} activeString={activeString} onClick={onPanelClick} />;
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
    version: 52,
    source: 'virto_inspired_real_panel_string_tab',
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
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-slate-900" />Slingor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div>
        </CardContent>
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
              <p className="mt-1 text-sm text-slate-500">Klicka riktiga paneler i kabelordning. Starten ligger utanför första panelen och slutet på sista panelens anslutning.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <Layers className="h-4 w-4" />
              Lager: paneler, takgräns, DC+, DC-, terminaler
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 xl:grid-cols-[220px_1fr_260px]">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Verktyg</div>
                <div className="mt-1 text-sm font-bold text-slate-900">Välj antal slingor</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCountValue(Math.max(1, countValue - 1))} disabled={countValue <= 1}><Minus className="h-4 w-4" /></Button>
                <input type="number" min="1" max="80" value={countValue} onChange={event => setCountValue(event.target.value)} className="h-10 w-20 rounded-xl border border-slate-300 bg-white px-2 text-center text-lg font-black text-slate-900" />
                <Button variant="outline" size="icon" onClick={() => setCountValue(Math.min(80, countValue + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {strings.map(string => (
                  <button key={string.id} onClick={() => setActiveId(string.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold ${string.id === activeId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400'}`}>
                    <span className="block">{string.name}</span>
                    <span className="block font-medium opacity-80">{count(string.nodes)} paneler · start {string.startPolarity === 'minus' ? '-' : '+'}</span>
                  </button>
                ))}
              </div>
            </div>

            <Canvas map={map} strings={strings} activeId={activeId} activeString={active} onPanelClick={togglePanel} onStartPolarity={setStartPolarity} />

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Egenskaper</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{active?.name}</div>
                <div className="text-xs text-slate-500">{count(active?.nodes)} markerade paneler</div>
              </div>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Väder</span><select value={settings.weather} onChange={event => patchSettings({ weather: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{WEATHER.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Tid</span><select value={settings.timeOfDay} onChange={event => patchSettings({ timeOfDay: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{TIMES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-500"><span>Temperatur °C</span><input type="number" value={settings.ambientTemperatureC} onChange={event => patchSettings({ ambientTemperatureC: Number(event.target.value) })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">Panelerna är riktiga objekt från panelritningen, inte statiska blå CAD-rutor.</div>
              <Button variant="outline" className="w-full text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button>
              <Button className="w-full" onClick={() => persist(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button>
              {saveInfo && <div className="text-xs text-slate-500">{saveInfo}</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
