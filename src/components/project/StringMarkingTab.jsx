import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cable, Calculator, CheckCircle2, Circle, Info, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };
const SCALE = 58;
const DEF_PANEL = { w: 1.134, h: 1.953 };

const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
const pos = (v, f = 0) => num(v, f) > 0 ? num(v, f) : f;
const round = (v, d = 1) => Math.round(num(v) * 10 ** d) / 10 ** d;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 99999)}`;

function labelOf(p) { return [p?.brand, p?.model].filter(Boolean).join(' ') || p?.name || 'Produkt'; }
function json(raw, fallback) { try { return JSON.parse(raw || ''); } catch { return fallback; } }
function panelSize(orientation, product) {
  const w = pos(product?.width_mm, 0) / 1000;
  const h = pos(product?.height_mm, 0) / 1000;
  const base = w && h ? { w, h } : DEF_PANEL;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}
function roofPoly(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * .18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * .82},${y} ${x + w},${y + h} ${x},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}
function parseLayout(project) {
  const planner = json(project?.solar_roof_planner_data, null);
  if (Array.isArray(planner?.roofs) && planner.roofs.some(r => (r.panelGroups || []).length)) return { source: 'solar_roof_planner_data', roofs: planner.roofs, legacy: [] };
  const old = json(project?.panel_layout_data, null);
  const legacy = Array.isArray(old) ? old : Array.isArray(old?.panels) ? old.panels : [];
  if (legacy.length) return { source: 'panel_layout_data', roofs: [{ id: 'legacy', name: 'Panelritning', widthM: pos(old?.roofWidth, pos(project?.roof_width_m, 8)), roofFallM: pos(old?.roofHeight, pos(project?.roof_height_m, 6)), shape: 'Rektangel' }], legacy };
  return { source: null, roofs: [], legacy: [] };
}
function buildMap(layout, panelProduct) {
  const pad = 60, gap = 85, pg = .035 * SCALE;
  let yCursor = pad;
  const roofLayouts = [], panels = [];
  layout.roofs.forEach((roof, ri) => {
    const r = { roof, x: pad, y: yCursor, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofLayouts.push(r); yCursor += r.h + gap;
    if (layout.legacy.length) {
      const rows = Math.max(1, ...layout.legacy.map(p => num(p.row) + 1));
      const cols = Math.max(1, ...layout.legacy.map(p => num(p.col) + 1));
      const pw = Math.min(r.w / cols, 72), ph = Math.min(r.h / rows, Math.max(44, pw * 1.45));
      layout.legacy.forEach((p, i) => { const x = r.x + num(p.col) * (pw + 2), y = r.y + num(p.row) * (ph + 2); panels.push({ id: p.id || `legacy-${i}`, x, y, w: pw, h: ph, black: { x, y: y + ph / 2 }, red: { x: x + pw, y: y + ph / 2 } }); });
      return;
    }
    (roof.panelGroups || []).forEach((g, gi) => {
      const s = panelSize(g.orientation, panelProduct), pw = s.w * SCALE, ph = s.h * SCALE;
      const sx = r.x + pos(g.xM) * SCALE, sy = r.y + pos(g.yM) * SCALE;
      for (let row = 0; row < Math.round(pos(g.rows)); row++) for (let col = 0; col < Math.round(pos(g.cols)); col++) {
        const x = sx + col * (pw + pg), y = sy + row * (ph + pg);
        panels.push({ id: `r${roof.id || ri}-g${g.id || gi}-${row}-${col}`, x, y, w: pw, h: ph, black: { x, y: y + ph / 2 }, red: { x: x + pw, y: y + ph / 2 } });
      }
    });
  });
  return { roofLayouts, panels, width: Math.max(900, ...roofLayouts.map(r => r.x + r.w + 160), 900), height: Math.max(560, yCursor + pad) };
}
function stored(project) {
  const d = json(project?.string_layout_data, null);
  if (d?.version === 2) return d;
  return { strings: [], stringCount: 1, settings: {}, panelProductId: '', inverterProductId: '' };
}
function makeString(i, old = {}) { return { id: old.id || uid(), name: `Slinga ${i + 1}`, color: COLORS[i % COLORS.length], nodes: old.nodes || [], panel_count: old.panel_count || 0, ...old }; }
function countPanels(nodes) { return new Set((nodes || []).map(n => n.panelId)).size; }
function normPanel(p) { return p && { pmax: pos(p.power_watts), voc: pos(p.voc_v), vmp: pos(p.vmp_v), isc: pos(p.isc_a), imp: pos(p.imp_a), pcoef: num(p.temp_coeff_pmax_percent_c, -0.35), vcoef: num(p.temp_coeff_voc_percent_c, -0.27), icoef: num(p.temp_coeff_isc_percent_c, 0.05), noct: pos(p.noct_c, 45) }; }
function normInv(p) { const ac = pos(p?.power_watts) / 1000; return p && { ac, maxdc: pos(p.max_dc_power_kw, ac * 1.5), maxv: pos(p.max_dc_voltage_v), start: pos(p.startup_voltage_v), mpptmin: pos(p.mppt_voltage_min_v), mpptmax: pos(p.mppt_voltage_max_v), maxa: pos(p.max_input_current_a), maxisc: pos(p.max_short_circuit_current_a) }; }
function simulate(panelProduct, inverterProduct, panelCount, settings) {
  const p = normPanel(panelProduct), i = normInv(inverterProduct);
  if (!p || !i || !panelCount) return null;
  const irr = 1000 * (WEATHER[settings.weather] ?? 1) * (TIME[settings.timeOfDay] ?? 1);
  const cell = num(settings.ambientTemperatureC, 20) + ((p.noct - 20) / 800) * irr;
  const panelPower = p.pmax * (irr / 1000) * (1 + ((cell - 25) * p.pcoef) / 100);
  const voc = p.voc * (1 + ((cell - 25) * p.vcoef) / 100) * panelCount;
  const vmp = p.vmp * (1 + ((cell - 25) * p.vcoef) / 100) * panelCount;
  const isc = p.isc * (1 + ((cell - 25) * p.icoef) / 100);
  const power = panelPower * panelCount;
  const checks = [
    ['Max DC-spänning', i.maxv > 0 && voc <= i.maxv], ['Startspänning', i.start > 0 && vmp >= i.start], ['MPPT-område', i.mpptmin > 0 && i.mpptmax > 0 && vmp >= i.mpptmin && vmp <= i.mpptmax], ['MPPT-ström', i.maxa > 0 && p.imp <= i.maxa], ['Kortslutningsström', i.maxisc > 0 && isc <= i.maxisc], ['DC-effekt', i.maxdc > 0 && power / 1000 <= i.maxdc]
  ];
  return { status: checks.every(c => c[1]) ? 'OK' : 'Ej godkänd', checks, irr, cell, panelPower, voc, vmp, current: p.imp, isc, power, dcac: i.ac ? power / 1000 / i.ac : 0 };
}
function Select({ label, value, onChange, children }) { return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>; }
function Input({ label, value, onChange, min, max }) { return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>; }
function Metric({ label, value, unit }) { return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>; }
function Canvas({ map, strings, activeId, draft, onClickNode }) {
  const active = strings.find(s => s.id === activeId), color = active?.color || COLORS[0];
  const point = node => { const p = map.panels.find(x => x.id === node.panelId); return p ? p[node.terminal] : null; };
  const pts = nodes => nodes.map(point).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');
  return <div className="overflow-auto rounded-2xl border bg-white"><svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]"><defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>{map.roofLayouts.map(r => <g key={r.roof.id || r.roof.name}><text x={r.x} y={r.y - 22} fontSize="18" fontWeight="800">{r.roof.name || 'Tak'}</text><polygon points={roofPoly(r.x, r.y, r.w, r.h, r.roof.shape)} fill="url(#hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}{map.panels.map((p, i) => <g key={p.id}><rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill="#dbeafe" stroke="#2563eb" /><text x={p.x + p.w / 2} y={p.y + p.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{i + 1}</text><circle cx={p.black.x} cy={p.black.y} r="7" fill="#111827" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'black')} className="cursor-pointer" /><circle cx={p.red.x} cy={p.red.y} r="7" fill="#dc2626" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'red')} className="cursor-pointer" /></g>)}{strings.filter(s => s.nodes?.length >= 2).map(s => <g key={s.id}><polyline points={pts(s.nodes)} fill="none" stroke={s.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{s.nodes.map((n, i) => { const p = point(n); return p && <circle key={i} cx={p.x} cy={p.y} r="5" fill={s.color} stroke="white" />; })}</g>)}{draft.length > 0 && <g>{draft.length >= 2 && <polyline points={pts(draft)} fill="none" stroke={color} strokeWidth="4" strokeDasharray="8 5" />}{draft.map((n, i) => { const p = point(n); return p && <circle key={i} cx={p.x} cy={p.y} r="6" fill={color} stroke="white" />; })}</g>}</svg></div>;
}

export default function StringMarkingTab({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const s = stored(project), layout = useMemo(() => parseLayout(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panels = products.filter(p => p.category === 'solpanel' && p.is_active !== false), inverters = products.filter(p => p.category === 'vaxelriktare' && p.is_active !== false);
  const [panelId, setPanelId] = useState(s.panelProductId || selectedProductProp?.id || ''), [invId, setInvId] = useState(s.inverterProductId || ''), [count, setCount] = useState(Math.max(1, s.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, s.stringCount || 1) }, (_, i) => makeString(i, s.strings?.[i]))), [activeId, setActiveId] = useState(strings[0]?.id || null), [draft, setDraft] = useState([]), [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ weather: s.settings?.weather || 'Soligt', timeOfDay: s.settings?.timeOfDay || '12:00', ambientTemperatureC: s.settings?.ambientTemperatureC ?? 20, roofTiltDeg: s.settings?.roofTiltDeg ?? 27, roofAzimuthDeg: s.settings?.roofAzimuthDeg ?? 180 });
  const panelProduct = panels.find(p => p.id === panelId) || selectedProductProp || null, invProduct = inverters.find(p => p.id === invId) || null, map = useMemo(() => buildMap(layout, panelProduct), [layout, panelProduct]);
  const active = strings.find(x => x.id === activeId) || strings[0], result = simulate(panelProduct, invProduct, countPanels(draft.length ? draft : active?.nodes || []), settings);
  const setStringCount = v => { const c = Math.max(1, Math.min(10, Number(v) || 1)); setCount(c); setStrings(prev => Array.from({ length: c }, (_, i) => makeString(i, prev[i]))); };
  const save = async next => { setSaving(true); try { await onUpdate({ string_layout_data: JSON.stringify({ version: 2, source: layout.source, stringCount: count, panelProductId: panelId, inverterProductId: invId, settings, strings: next }) }); } finally { setSaving(false); } };
  const saveActive = async () => { if (!active || draft.length < 2) return; const next = strings.map(x => x.id === active.id ? { ...x, nodes: draft, panel_count: countPanels(draft) } : x); setStrings(next); setDraft([]); await save(next); };
  if (!map.panels.length) return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i projektets flik Paneler först.</div></CardContent></Card>;
  return <div className="space-y-4"><Card className="border-0 shadow-sm"><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Sök/välj produkter och klicka svarta/röda anslutningspunkter.</p></div><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 lg:grid-cols-4"><Input label="Antal slingor" min="1" max="10" value={count} onChange={setStringCount} /><ProductSearchSelect label="Solpanel" products={panels} value={panelId} onChange={setPanelId} placeholder="Sök/välj solpanel" /><ProductSearchSelect label="Växelriktare" products={inverters} value={invId} onChange={setInvId} placeholder="Sök/välj växelriktare" /><Select label="Aktiv slinga" value={activeId || ''} onChange={v => { setActiveId(v); setDraft([]); }}>{strings.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div><div className="grid gap-3 lg:grid-cols-5"><Select label="Väder" value={settings.weather} onChange={v => setSettings({ ...settings, weather: v })}>{Object.keys(WEATHER).map(x => <option key={x}>{x}</option>)}</Select><Select label="Tid" value={settings.timeOfDay} onChange={v => setSettings({ ...settings, timeOfDay: v })}>{Object.keys(TIME).map(x => <option key={x}>{x}</option>)}</Select><Input label="Temperatur °C" value={settings.ambientTemperatureC} onChange={v => setSettings({ ...settings, ambientTemperatureC: Number(v) })} /><Input label="Taklutning °" value={settings.roofTiltDeg} onChange={v => setSettings({ ...settings, roofTiltDeg: Number(v) })} /><Input label="Azimut °" value={settings.roofAzimuthDeg} onChange={v => setSettings({ ...settings, roofAzimuthDeg: Number(v) })} /></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Svart = minus. Röd = plus.</div><Canvas map={map} strings={strings} activeId={activeId} draft={draft} onClickNode={(p, terminal) => activeId && setDraft(d => [...d, { panelId: p.id, terminal }])} /><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv ritning: <b>{active?.name}</b> · {draft.length} punkter · {countPanels(draft)} paneler</div><div className="flex gap-2"><Button variant="outline" onClick={() => setDraft([])} disabled={!draft.length}>Rensa osparad</Button><Button variant="outline" className="text-red-600" onClick={() => { const next = strings.map(x => x.id === active?.id ? { ...x, nodes: [], panel_count: 0 } : x); setStrings(next); setDraft([]); }}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={saveActive} disabled={saving || draft.length < 2}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara aktiv slinga'}</Button></div></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4 text-primary" />Avancerad beräkning</CardTitle></CardHeader><CardContent>{result ? <div className="space-y-3"><div className={`rounded-xl border p-3 font-bold ${result.status === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>Status: {result.status}</div><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Paneler" value={countPanels(draft.length ? draft : active?.nodes || [])} unit="st" /><Metric label="Voc" value={round(result.voc, 1)} unit="V" /><Metric label="Vmp" value={round(result.vmp, 1)} unit="V" /><Metric label="Effekt" value={round(result.power / 1000, 2)} unit="kW" /></div>{result.checks.map(c => <div key={c[0]} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${c[1] ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{c[1] ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}<b>{c[0]}</b></div>)}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Välj solpanel, växelriktare och markera paneler i slingan.</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Sparade slingor</CardTitle></CardHeader><CardContent className="space-y-2">{strings.map(x => <div key={x.id} className="flex justify-between rounded-xl border p-3 text-sm"><div className="flex items-center gap-2"><Circle className="h-4 w-4" style={{ color: x.color, fill: x.color }} /><div><b>{x.name}</b><div className="text-xs text-muted-foreground">{x.nodes?.length || 0} punkter · {x.panel_count || countPanels(x.nodes)} paneler</div></div></div><Badge variant={x.nodes?.length >= 2 ? 'default' : 'outline'}>{x.nodes?.length >= 2 ? 'Sparad' : 'Ej ritad'}</Badge></div>)}</CardContent></Card></div></div>;
}
