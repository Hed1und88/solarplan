import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cable, Calculator, CheckCircle2, Info, Minus, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { createProductSnapshot, hydrateProductWithMeta } from '@/lib/productDocuments';

const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777', '#0891b2', '#65a30d'];
const SCALE = 58;
const PANEL_FALLBACK = { w: 1.134, h: 1.953 };
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const parseJson = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const stringLocalKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerLocalKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function readLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeLocal(projectId, data) {
  if (typeof window === 'undefined' || !projectId) return;
  try { window.localStorage.setItem(stringLocalKey(projectId), JSON.stringify(data)); } catch {}
}

function productData(product) {
  if (!product) return null;
  const technical = product.technical_data_snapshot || product.technical_snapshot || {};
  return hydrateProductWithMeta({ ...technical, ...product });
}

function snapshotProduct(product) {
  if (!product) return null;
  if (product.technical_data_snapshot || product.documents_snapshot || product.product_meta_snapshot) return product;
  return createProductSnapshot(productData(product)) || productData(product);
}

function productLabel(product, fallback = 'Produkt saknas') {
  const p = productData(product);
  return [p?.brand, p?.model].filter(Boolean).join(' ') || p?.name || fallback;
}

function readPlanner(project) {
  const fromProject = parseJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  if (Array.isArray(fromProject?.roofs) && fromProject.roofs.some(roof => (roof.panelGroups || []).length)) return fromProject;
  const fromLocal = readLocal(plannerLocalKey(project?.id));
  if (Array.isArray(fromLocal?.roofs) && fromLocal.roofs.some(roof => (roof.panelGroups || []).length)) return fromLocal;
  return { roofs: [] };
}

function readSaved(project) {
  const fromProject = parseJson(project?.string_layout_data, null);
  const fromLocal = readLocal(stringLocalKey(project?.id));
  const data = fromProject?.strings ? fromProject : fromLocal;
  return data?.strings ? data : { stringCount: 1, strings: [], inverterConfigs: [], panelProductId: '', settings: {} };
}

function panelSize(orientation, product) {
  const p = productData(product);
  const w = pos(p?.width_mm, 0) / 1000;
  const h = pos(p?.height_mm, 0) / 1000;
  const base = w && h ? { w, h } : PANEL_FALLBACK;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function roofPolygon(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * 0.18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * 0.82},${y} ${x + w},${y + h} ${x},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function buildPanels(planner, products, fallbackPanel) {
  const pad = 60;
  const roofGap = 85;
  const panelGap = 0.035 * SCALE;
  const roofs = [];
  const panels = [];
  let yCursor = pad;

  (planner.roofs || []).forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const roofProduct = roof.panelProductSnapshot || products.find(p => p.id === roof.panelProductId) || fallbackPanel || null;
    const roofBox = { roof, x: pad, y: yCursor, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofs.push(roofBox);
    yCursor += roofBox.h + roofGap;

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const panelProduct = group.panelProductSnapshot || group.panelProduct || roofProduct;
      const size = panelSize(group.orientation, panelProduct);
      const pw = size.w * SCALE;
      const ph = size.h * SCALE;
      const startX = roofBox.x + pos(group.xM) * SCALE;
      const startY = roofBox.y + pos(group.yM) * SCALE;
      const rows = Math.max(1, Math.round(pos(group.rows, 1)));
      const cols = Math.max(1, Math.round(pos(group.cols, 1)));

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const override = group.panelOverrides?.[`${row}-${col}`];
          const x = override ? roofBox.x + pos(override.xM) * SCALE : startX + col * (pw + panelGap);
          const y = override ? roofBox.y + pos(override.yM) * SCALE : startY + row * (ph + panelGap);
          panels.push({
            id: `${roofId}-${group.id || groupIndex}-${row}-${col}`,
            number: panels.length + 1,
            x,
            y,
            w: pw,
            h: ph,
            cablePlus: { x: x + pw / 2, y: y + ph * 0.32 },
            cableMinus: { x: x + pw / 2, y: y + ph * 0.72 },
            black: { x, y: y + ph / 2 },
            red: { x: x + pw, y: y + ph / 2 },
            panelProduct,
            panelProductSnapshot: snapshotProduct(panelProduct),
          });
        }
      }
    });
  });

  return { roofs, panels, width: Math.max(900, ...roofs.map(r => r.x + r.w + 160), 900), height: Math.max(560, yCursor + pad) };
}

function makeString(index, old = {}, inverterId = '') {
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${index + 1}`,
    color: old.color || COLORS[index % COLORS.length],
    nodes: Array.isArray(old.nodes) ? old.nodes : [],
    panel_count: old.panel_count || 0,
    inverterConfigId: old.inverterConfigId || inverterId,
    inverterProductId: old.inverterProductId || '',
    inverterProductSnapshot: old.inverterProductSnapshot || null,
    panelProductId: old.panelProductId || '',
    panelProductSnapshot: old.panelProductSnapshot || null,
    mppt: old.mppt || 1,
    pvInput: old.pvInput || 1,
  };
}

function makeInverter(index, old = {}) {
  return {
    id: old.id || uid(),
    name: old.name || `Växelriktare ${index + 1}`,
    productId: old.productId || old.inverterProductId || old.productSnapshot?.id || '',
    productSnapshot: old.productSnapshot || old.inverterProductSnapshot || null,
  };
}

function uniquePanelIds(nodes = []) {
  const ids = [];
  const seen = new Set();
  nodes.forEach(node => {
    if (!node?.panelId || seen.has(node.panelId)) return;
    seen.add(node.panelId);
    ids.push(node.panelId);
  });
  return ids;
}

function panelCount(nodes = []) {
  return uniquePanelIds(nodes).length;
}

function panelSet(nodes = []) {
  return new Set(uniquePanelIds(nodes));
}

function recount(string) {
  return { ...string, panel_count: panelCount(string.nodes || []) };
}

function removePanel(nodes, panelId) {
  return (nodes || []).filter(node => node.panelId !== panelId);
}

function orderedPanels(string, map) {
  return uniquePanelIds(string.nodes || []).map(id => map.panels.find(p => p.id === id)).filter(Boolean);
}

function orthogonalPoints(panels, key) {
  if (!panels.length) return [];
  const points = [panels[0][key]];
  for (let i = 1; i < panels.length; i++) {
    const prev = points[points.length - 1];
    const next = panels[i][key];
    if (Math.abs(prev.x - next.x) > 1 && Math.abs(prev.y - next.y) > 1) points.push({ x: prev.x, y: next.y });
    points.push(next);
  }
  return points;
}

function cablePaths(string, map) {
  const panels = orderedPanels(string, map);
  return {
    panels,
    plus: orthogonalPoints(panels, 'cablePlus'),
    minus: orthogonalPoints([...panels].reverse(), 'cableMinus'),
  };
}

function pointString(points) {
  return points.map(pt => `${pt.x},${pt.y}`).join(' ');
}

function getInverterProduct(config, products) {
  return config?.productSnapshot || products.find(p => p.id === config?.productId) || null;
}

function getPanelProductForString(string, map, products, fallbackPanel) {
  const firstId = uniquePanelIds(string.nodes || [])[0];
  const firstPanel = map.panels.find(panel => panel.id === firstId);
  return string.panelProductSnapshot || firstPanel?.panelProductSnapshot || firstPanel?.panelProduct || products.find(p => p.id === string.panelProductId) || fallbackPanel || null;
}

function topology(product) {
  const p = productData(product);
  const name = `${p?.brand || ''} ${p?.model || ''} ${p?.name || ''}`.toLowerCase();
  if (name.includes('afore') && name.includes('bnt50')) return { mppts: [{ mppt: 1, pvInputs: [1, 2] }, { mppt: 2, pvInputs: [3, 4] }, { mppt: 3, pvInputs: [5, 6, 7] }] };
  const mpptCount = Math.max(1, Math.round(pos(p?.mppt_count || p?.mppts, 2)));
  const perMppt = Math.max(1, Math.round(pos(p?.strings_per_mppt || p?.inputs_per_mppt, 2)));
  let pv = 1;
  return { mppts: Array.from({ length: mpptCount }, (_, i) => ({ mppt: i + 1, pvInputs: Array.from({ length: perMppt }, () => pv++) })) };
}

function panelElectrical(product) {
  const p = productData(product);
  return p && {
    pmax: pos(p.power_watts),
    voc: pos(p.voc_v),
    vmp: pos(p.vmp_v),
    isc: pos(p.isc_a),
    imp: pos(p.imp_a),
    pcoef: num(p.temp_coeff_pmax_percent_c, -0.35),
    vcoef: num(p.temp_coeff_voc_percent_c, -0.27),
    icoef: num(p.temp_coeff_isc_percent_c, 0.05),
    noct: pos(p.noct_c, 45),
  };
}

function inverterElectrical(product) {
  const p = productData(product);
  const ac = pos(p?.power_watts) / 1000;
  return p && { maxdc: pos(p.max_dc_power_kw, ac * 1.5), maxv: pos(p.max_dc_voltage_v), start: pos(p.startup_voltage_v), mpptmin: pos(p.mppt_voltage_min_v), mpptmax: pos(p.mppt_voltage_max_v), maxa: pos(p.max_input_current_a), maxisc: pos(p.max_short_circuit_current_a) };
}

function branchValues(panel, count, settings) {
  const irradiance = 1000 * (WEATHER[settings.weather] ?? 1) * (TIME[settings.timeOfDay] ?? 1);
  const cell = num(settings.ambientTemperatureC, 20) + ((panel.noct - 20) / 800) * irradiance;
  const power = panel.pmax * (irradiance / 1000) * (1 + ((cell - 25) * panel.pcoef) / 100) * count;
  return {
    power,
    voc: panel.voc * (1 + ((cell - 25) * panel.vcoef) / 100) * count,
    vmp: panel.vmp * (1 + ((cell - 25) * panel.vcoef) / 100) * count,
    imp: panel.imp,
    isc: panel.isc * (1 + ((cell - 25) * panel.icoef) / 100),
  };
}

function calculate(inverterProduct, branches, settings) {
  const inv = inverterElectrical(inverterProduct);
  const valid = branches.filter(b => b.count > 0 && panelElectrical(b.panelProduct));
  if (!inv || !valid.length) return null;
  const values = valid.map(b => ({ ...b, ...branchValues(panelElectrical(b.panelProduct), b.count, settings) }));
  const totalPower = values.reduce((s, v) => s + v.power, 0);
  const totalImp = values.reduce((s, v) => s + v.imp, 0);
  const totalIsc = values.reduce((s, v) => s + v.isc, 0);
  const maxVoc = Math.max(...values.map(v => v.voc));
  const minVmp = Math.min(...values.map(v => v.vmp));
  const maxVmp = Math.max(...values.map(v => v.vmp));
  const checks = [
    { label: 'Max DC-spänning', ok: inv.maxv > 0 && maxVoc <= inv.maxv, nodata: !inv.maxv, detail: inv.maxv ? `Voc ${round(maxVoc, 1)} V <= ${inv.maxv} V` : 'Saknas i produktdata' },
    { label: 'Startspänning', ok: inv.start > 0 && minVmp >= inv.start, nodata: !inv.start, detail: inv.start ? `Vmp ${round(minVmp, 1)} V >= ${inv.start} V` : 'Saknas i produktdata' },
    { label: 'MPPT-område', ok: inv.mpptmin > 0 && inv.mpptmax > 0 && minVmp >= inv.mpptmin && maxVmp <= inv.mpptmax, nodata: !inv.mpptmin || !inv.mpptmax, detail: inv.mpptmin && inv.mpptmax ? `Vmp ${round(minVmp, 1)}-${round(maxVmp, 1)} V inom ${inv.mpptmin}-${inv.mpptmax} V` : 'Saknas i produktdata' },
    { label: 'MPPT-ström', ok: inv.maxa > 0 && totalImp <= inv.maxa, nodata: !inv.maxa, detail: inv.maxa ? `Imp ${round(totalImp, 2)} A <= ${inv.maxa} A` : 'Saknas i produktdata' },
    { label: 'Kortslutningsström', ok: inv.maxisc > 0 && totalIsc <= inv.maxisc, nodata: !inv.maxisc, detail: inv.maxisc ? `Isc ${round(totalIsc, 2)} A <= ${inv.maxisc} A` : 'Saknas i produktdata' },
    { label: 'DC-effekt', ok: inv.maxdc > 0 && totalPower / 1000 <= inv.maxdc, nodata: !inv.maxdc, detail: inv.maxdc ? `${round(totalPower / 1000, 2)} kW <= ${inv.maxdc} kW` : 'Saknas i produktdata' },
  ];
  return { values, totalPower, totalImp, totalIsc, minVmp, maxVmp, status: checks.filter(c => !c.nodata).every(c => c.ok) ? 'OK' : 'Ej godkänd', checks };
}

function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

function CheckRow({ check }) {
  const Icon = check.ok ? CheckCircle2 : check.nodata ? Info : XCircle;
  const tone = check.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : check.nodata ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-red-700 bg-red-50 border-red-100';
  return <div className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">{check.label}</div><div className="text-xs opacity-90">{check.detail}</div></div></div>;
}

function StringCountControl({ count, strings, activeId, setCount, selectString }) {
  return <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-sm font-bold text-foreground">1. Välj antal slingor</div><p className="text-xs text-muted-foreground">Bestäm hur många slingor projektet ska ha. Klicka sedan vilken slinga du vill markera.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setCount(Math.max(1, count - 1))} disabled={count <= 1}><Minus className="h-4 w-4" /></Button><input type="number" min="1" max="80" value={count} onChange={e => setCount(e.target.value)} className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-center text-lg font-black" /><Button variant="outline" size="icon" onClick={() => setCount(Math.min(80, count + 1))}><Plus className="h-4 w-4" /></Button></div></div><div className="mt-3 flex flex-wrap gap-2">{strings.map(s => <button key={s.id} onClick={() => selectString(s.id)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${s.id === activeId ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}>{s.name} · {panelCount(s.nodes)} paneler</button>)}</div></div>;
}

function TerminalMarker({ panel, plus, color }) {
  const pt = panel ? { x: panel.x + panel.w * (plus ? 0.18 : 0.82), y: panel.y + panel.h * 0.16 } : null;
  if (!pt) return null;
  return <g><circle cx={pt.x} cy={pt.y} r="10" fill="white" stroke={color} strokeWidth="3" /><text x={pt.x} y={pt.y + 5} textAnchor="middle" fontSize="16" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text></g>;
}

function Canvas({ map, strings, activeId, activeString, onPanelClick }) {
  const activePanels = panelSet(activeString?.nodes || []);
  const owners = new Map();
  strings.forEach(s => panelSet(s.nodes || []).forEach(id => { if (!owners.has(id) || s.id === activeId) owners.set(id, s); }));
  return <div className="overflow-auto rounded-2xl border bg-white"><svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]"><defs><pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>{map.roofs.map(r => <g key={r.roof.id || r.roof.name}><text x={r.x} y={r.y - 22} fontSize="18" fontWeight="800">{r.roof.name || 'Tak'}</text><polygon points={roofPolygon(r.x, r.y, r.w, r.h, r.roof.shape)} fill="url(#roof-hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}{strings.filter(s => panelCount(s.nodes) >= 2).map(s => { const paths = cablePaths(s, map); const selected = paths.panels; return <g key={s.id}><polyline points={pointString(paths.plus)} fill="none" stroke={s.color} strokeWidth={s.id === activeId ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={s.id === activeId ? 1 : 0.55} /><polyline points={pointString(paths.minus)} fill="none" stroke={s.color} strokeWidth={s.id === activeId ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={s.id === activeId ? 0.75 : 0.4} strokeDasharray="7 5" />{paths.plus.map((pt, i) => <circle key={`p-${i}`} cx={pt.x} cy={pt.y} r={s.id === activeId ? 3.5 : 2.5} fill={s.color} stroke="white" />)}{paths.minus.map((pt, i) => <circle key={`m-${i}`} cx={pt.x} cy={pt.y} r={s.id === activeId ? 3.5 : 2.5} fill="white" stroke={s.color} strokeWidth="2" />)}{s.id === activeId && <TerminalMarker panel={selected[0]} plus color={s.color} />}{s.id === activeId && <TerminalMarker panel={selected[selected.length - 1]} plus={false} color={s.color} />}</g>; })}{map.panels.map(panel => { const owner = owners.get(panel.id); const selected = activePanels.has(panel.id); const fill = owner ? `${owner.color}22` : '#dbeafe'; const stroke = selected ? activeString?.color || '#2563eb' : owner?.color || '#2563eb'; return <g key={panel.id} onClick={() => onPanelClick(panel)} className="cursor-pointer"><rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="4" fill={fill} stroke={stroke} strokeWidth={selected ? 4 : owner ? 3 : 1.5} /><text x={panel.x + panel.w / 2} y={panel.y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{panel.number}</text>{owner && <text x={panel.x + panel.w / 2} y={panel.y + panel.h - 6} textAnchor="middle" fontSize="9" fontWeight="800" fill={owner.color}>{owner.name}</text>}<circle cx={panel.black.x} cy={panel.black.y} r="5" fill="#111827" stroke="white" strokeWidth="1.5" /><circle cx={panel.red.x} cy={panel.red.y} r="5" fill="#dc2626" stroke="white" strokeWidth="1.5" /></g>; })}</svg></div>;
}

export default function StringMarkingTabV7({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const saved = readSaved(project);
  const planner = useMemo(() => readPlanner(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panelProducts = products.filter(p => p.category === 'solpanel' && p.is_active !== false);
  const inverterProducts = products.filter(p => p.category === 'vaxelriktare' && p.is_active !== false);
  const initialInverters = (saved.inverterConfigs?.length ? saved.inverterConfigs : [{ productId: saved.inverterProductId || '' }]).map((item, index) => makeInverter(index, item));
  const firstInverterId = initialInverters[0]?.id || '';

  const [inverters, setInverters] = useState(initialInverters);
  const [activeInverterId, setActiveInverterId] = useState(saved.selectedInverterConfigId || firstInverterId);
  const [panelProductId, setPanelProductId] = useState(saved.panelProductId || selectedProductProp?.id || '');
  const [count, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, index) => makeString(index, saved.strings?.[index], firstInverterId)));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [selectedMppt, setSelectedMppt] = useState(Number(saved.selectedMppt || 1));
  const [selectedPv, setSelectedPv] = useState(Number(saved.selectedPv || 1));
  const [settings, setSettingsState] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20 });
  const [saveInfo, setSaveInfo] = useState('');
  const [saving, setSaving] = useState(false);

  const fallbackPanel = selectedProductProp?.id === panelProductId ? selectedProductProp : panelProducts.find(p => p.id === panelProductId) || selectedProductProp || null;
  const map = useMemo(() => buildPanels(planner, panelProducts, fallbackPanel), [planner, panelProducts, fallbackPanel]);
  const active = strings.find(s => s.id === activeId) || strings[0];
  const activeInverter = inverters.find(i => i.id === activeInverterId) || inverters[0];
  const activeInverterProduct = getInverterProduct(activeInverter, inverterProducts);
  const activeTopology = topology(activeInverterProduct);
  const pvOptions = activeTopology.mppts.find(m => Number(m.mppt) === Number(selectedMppt))?.pvInputs || [1, 2];
  const selectedPvSafe = pvOptions.includes(Number(selectedPv)) ? Number(selectedPv) : pvOptions[0];

  const buildPayload = (nextStrings = strings, overrides = {}) => {
    const nextInverters = overrides.inverters || inverters;
    const normalizedStrings = nextStrings.map(s => {
      const panelProduct = getPanelProductForString(s, map, panelProducts, fallbackPanel);
      const inverterConfig = nextInverters.find(i => i.id === s.inverterConfigId);
      const inverterProduct = getInverterProduct(inverterConfig, inverterProducts);
      return recount({ ...s, panelProductId: productData(panelProduct)?.id || s.panelProductId || '', panelProductSnapshot: s.panelProductSnapshot || snapshotProduct(panelProduct), inverterProductId: productData(inverterProduct)?.id || s.inverterProductId || '', inverterProductSnapshot: s.inverterProductSnapshot || snapshotProduct(inverterProduct) });
    });
    return { version: 32, source: 'manual_panel_click_two_wire_daisy_chain', stringCount: overrides.stringCount ?? count, panelProductId: overrides.panelProductId ?? panelProductId, selectedInverterConfigId: overrides.selectedInverterConfigId ?? activeInverterId, selectedMppt: overrides.selectedMppt ?? selectedMppt, selectedPv: overrides.selectedPv ?? selectedPvSafe, settings: overrides.settings ?? settings, inverterConfigs: nextInverters.map(i => ({ ...i, productSnapshot: i.productSnapshot || snapshotProduct(getInverterProduct(i, inverterProducts)) })), strings: normalizedStrings, savedAt: new Date().toISOString() };
  };

  const persist = async (nextStrings = strings, overrides = {}) => {
    const data = buildPayload(nextStrings, overrides);
    writeLocal(project?.id, data);
    setSaving(true);
    setSaveInfo('Sparar...');
    try { await onUpdate?.({ string_layout_data: JSON.stringify(data) }); setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`); }
    catch { setSaveInfo('Lokal backup sparad. Servern svarade inte.'); }
    finally { setSaving(false); }
  };

  const replaceStrings = next => { const normalized = next.map(recount); setStrings(normalized); persist(normalized).catch(() => {}); };
  const setSettings = patch => { const next = { ...settings, ...patch }; setSettingsState(next); persist(strings, { settings: next }).catch(() => {}); };

  const setCount = value => {
    const nextCount = Math.max(1, Math.min(80, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index], activeInverterId));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(s => s.id === activeId)) setActiveId(next[0]?.id || null);
    persist(next, { stringCount: nextCount }).catch(() => {});
  };

  const selectString = id => {
    setActiveId(id);
    const selected = strings.find(s => s.id === id);
    if (selected?.inverterConfigId) setActiveInverterId(selected.inverterConfigId);
    if (selected?.mppt) setSelectedMppt(Number(selected.mppt));
    if (selected?.pvInput) setSelectedPv(Number(selected.pvInput));
  };

  const updateInverterProduct = productId => {
    const product = inverterProducts.find(p => p.id === productId);
    const nextInverters = inverters.map(i => i.id === activeInverterId ? { ...i, productId, productSnapshot: snapshotProduct(product) } : i);
    const firstPv = topology(product).mppts[0]?.pvInputs?.[0] || 1;
    setInverters(nextInverters);
    setSelectedMppt(1);
    setSelectedPv(firstPv);
    const nextStrings = strings.map(s => s.inverterConfigId === activeInverterId ? { ...s, inverterProductId: productId, inverterProductSnapshot: snapshotProduct(product), mppt: 1, pvInput: firstPv } : s);
    setStrings(nextStrings);
    persist(nextStrings, { inverters: nextInverters, selectedMppt: 1, selectedPv: firstPv }).catch(() => {});
  };

  const addInverter = () => {
    const inverter = makeInverter(inverters.length, {});
    const nextInverters = [...inverters, inverter];
    setInverters(nextInverters);
    setActiveInverterId(inverter.id);
    persist(strings, { inverters: nextInverters, selectedInverterConfigId: inverter.id }).catch(() => {});
  };

  const removeInverter = id => {
    const nextInverters = inverters.filter(i => i.id !== id);
    const fallbackId = nextInverters[0]?.id || '';
    setInverters(nextInverters);
    setActiveInverterId(fallbackId);
    const nextStrings = strings.map(s => s.inverterConfigId === id ? { ...s, inverterConfigId: fallbackId, inverterProductId: '', inverterProductSnapshot: null } : s);
    replaceStrings(nextStrings);
  };

  const togglePanel = panel => {
    if (!active?.id) return;
    const exists = panelSet(active.nodes).has(panel.id);
    const panelProduct = panel.panelProductSnapshot || panel.panelProduct || fallbackPanel;
    const inverterProduct = activeInverterProduct;
    const nextStrings = strings.map(s => {
      const base = { ...s, nodes: removePanel(s.nodes || [], panel.id) };
      if (s.id !== active.id) return recount(base);
      if (exists) return recount(base);
      return recount({ ...base, nodes: [...base.nodes, { panelId: panel.id }], inverterConfigId: activeInverterId, inverterProductId: productData(inverterProduct)?.id || '', inverterProductSnapshot: snapshotProduct(inverterProduct), panelProductId: productData(panelProduct)?.id || '', panelProductSnapshot: snapshotProduct(panelProduct), mppt: selectedMppt, pvInput: selectedPvSafe });
    });
    replaceStrings(nextStrings);
  };

  const clearActive = () => {
    if (!active?.id) return;
    replaceStrings(strings.map(s => s.id === active.id ? recount({ ...s, nodes: [], panel_count: 0 }) : s));
  };

  const branches = strings.filter(s => s.inverterConfigId === activeInverterId && Number(s.mppt) === Number(selectedMppt)).map(s => ({ id: s.id, label: `${s.name}${s.pvInput ? ` - PV${s.pvInput}` : ''}`, count: panelCount(s.nodes), panelProduct: getPanelProductForString(s, map, panelProducts, fallbackPanel) })).filter(b => b.count > 0);
  const result = calculate(activeInverterProduct, branches, settings);
  const activeCount = panelCount(active?.nodes || []);

  if (!map.panels.length) return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div></CardContent></Card>;

  return <div className="space-y-4">
    <Card className="border-0 shadow-sm"><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Första panelen du klickar blir +. Sista panelen blir -. Slingan visas som tvåledar/daisy-chain: plusledare och minusledare.</p></div><div className="flex flex-col items-end gap-2"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button>{saveInfo && <span className="text-xs text-muted-foreground">{saving ? 'Sparar...' : saveInfo}</span>}</div></div></CardHeader><CardContent className="space-y-4">
      <StringCountControl count={count} strings={strings} activeId={activeId} setCount={setCount} selectString={selectString} />
      <div className="grid gap-3 lg:grid-cols-2"><ProductSearchSelect label="Reservsolpanel om tak saknar val" products={panelProducts} value={panelProductId} onChange={value => { setPanelProductId(value); persist(strings, { panelProductId: value }).catch(() => {}); }} placeholder="Sök/välj solpanel" /><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Aktiv slinga</span><select value={activeId || ''} onChange={e => selectString(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{strings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <div className="grid gap-3 lg:grid-cols-3"><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Väder</span><select value={settings.weather} onChange={e => setSettings({ weather: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{Object.keys(WEATHER).map(w => <option key={w} value={w}>{w}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Tid</span><select value={settings.timeOfDay} onChange={e => setSettings({ timeOfDay: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{Object.keys(TIME).map(t => <option key={t} value={t}>{t}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Temperatur °C</span><input type="number" value={settings.ambientTemperatureC} onChange={e => setSettings({ ambientTemperatureC: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label></div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Klicka panelerna i den ordning kabeln ska gå. Två linjer visas: heldragen plusledare och streckad minusledare.</div>
      <div className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold">Växelriktare</div><Button size="sm" variant="outline" onClick={addInverter}><Plus className="mr-2 h-4 w-4" />Lägg till växelriktare</Button></div><div className="grid gap-3 lg:grid-cols-2">{inverters.map((config, index) => <div key={config.id} className={`rounded-xl border p-3 ${config.id === activeInverterId ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="mb-2 flex items-center justify-between"><button className="font-bold" onClick={() => setActiveInverterId(config.id)}>{config.name || `Växelriktare ${index + 1}`}</button>{inverters.length > 1 && <Button variant="ghost" size="icon" className="text-red-600" onClick={() => removeInverter(config.id)}><Trash2 className="h-4 w-4" /></Button>}</div><ProductSearchSelect label="Växelriktare" products={inverterProducts} value={config.productId || ''} onChange={updateInverterProduct} placeholder="Sök/välj växelriktare" /><p className="mt-2 text-xs text-muted-foreground">{productLabel(getInverterProduct(config, inverterProducts), 'Växelriktare')}</p></div>)}</div></div>
      <div className="grid gap-3 lg:grid-cols-2"><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>MPPT</span><select value={selectedMppt} onChange={e => { const next = Number(e.target.value); const firstPv = topology(activeInverterProduct).mppts.find(m => m.mppt === next)?.pvInputs?.[0] || 1; setSelectedMppt(next); setSelectedPv(firstPv); persist(strings, { selectedMppt: next, selectedPv: firstPv }).catch(() => {}); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{topology(activeInverterProduct).mppts.map(m => <option key={m.mppt} value={m.mppt}>MPPT {m.mppt}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>PV-ingång</span><select value={selectedPvSafe} onChange={e => { const pv = Number(e.target.value); setSelectedPv(pv); persist(strings, { selectedPv: pv }).catch(() => {}); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{pvOptions.map(pv => <option key={pv} value={pv}>PV {pv}</option>)}</select></label></div>
      <Canvas map={map} strings={strings} activeId={activeId} activeString={active} onPanelClick={togglePanel} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv slinga: <b>{active?.name}</b> - {activeCount} paneler - MPPT {selectedMppt} - PV{selectedPvSafe}</div><div className="flex gap-2"><Button variant="outline" className="text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={() => persist(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button></div></div>
    </CardContent></Card>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" />Beräkning</CardTitle></CardHeader><CardContent className="space-y-4">{result ? <><Badge className={result.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{result.status === 'OK' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{result.status}</Badge><div className="text-xs text-muted-foreground">Väder: {settings.weather} · Tid: {settings.timeOfDay} · Temperatur: {settings.ambientTemperatureC} °C</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Effekt" value={round(result.totalPower / 1000, 2)} unit="kW" /><Metric label="Vmp" value={`${round(result.minVmp, 1)}-${round(result.maxVmp, 1)}`} unit="V" /><Metric label="Imp" value={round(result.totalImp, 2)} unit="A" /><Metric label="Isc" value={round(result.totalIsc, 2)} unit="A" /></div><div className="grid gap-2 lg:grid-cols-2">{result.checks.map(check => <CheckRow key={check.label} check={check} />)}</div></> : <div className="rounded-xl border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">Klicka paneler och välj växelriktare för att få beräkning.</div>}</CardContent></Card>
  </div>;
}
