import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Cable, Calculator, CheckCircle2, Info, Minus, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { createProductSnapshot, hydrateProductWithMeta } from '@/lib/productDocuments';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'];
const SCALE = 58;
const DEF_PANEL = { w: 1.134, h: 1.953 };
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 99999)}`;
const parseJson = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const backupKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function localJson(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function saveLocal(projectId, data) {
  if (typeof window === 'undefined' || !projectId) return;
  try { window.localStorage.setItem(backupKey(projectId), JSON.stringify(data)); } catch {}
}

function productData(product) {
  if (!product) return null;
  const technical = product.technical_data_snapshot || product.technical_snapshot || {};
  return hydrateProductWithMeta({ ...technical, ...product });
}

function snapshot(product) {
  if (!product) return null;
  if (product.technical_data_snapshot || product.documents_snapshot || product.product_meta_snapshot) return product;
  return createProductSnapshot(productData(product)) || productData(product);
}

function productLabel(product, fallback = 'Produkt saknas') {
  const p = productData(product);
  return [p?.brand, p?.model].filter(Boolean).join(' ') || p?.name || fallback;
}

function panelSize(orientation, product) {
  const p = productData(product);
  const width = pos(p?.width_mm, 0) / 1000;
  const height = pos(p?.height_mm, 0) / 1000;
  const base = width && height ? { w: width, h: height } : DEF_PANEL;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function readPlanner(project) {
  const fromProject = parseJson(project?.solar_roof_planner_data, null);
  if (Array.isArray(fromProject?.roofs) && fromProject.roofs.some(roof => (roof.panelGroups || []).length)) return fromProject;
  const fromBackup = localJson(plannerKey(project?.id));
  if (Array.isArray(fromBackup?.roofs) && fromBackup.roofs.some(roof => (roof.panelGroups || []).length)) return fromBackup;
  return { roofs: [] };
}

function roofPoly(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * .18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * .82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * .12},${y} ${x + w},${y} ${x + w * .88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * .88},${y} ${x + w},${y + h} ${x + w * .12},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function buildPanelMap(planner, products, fallbackPanel) {
  const pad = 60;
  const gap = 85;
  const panelGap = .035 * SCALE;
  const roofLayouts = [];
  const panels = [];
  let yCursor = pad;

  (planner.roofs || []).forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const roofProduct = roof.panelProductSnapshot || products.find(product => product.id === roof.panelProductId) || fallbackPanel || null;
    const layout = { roof, x: pad, y: yCursor, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofLayouts.push(layout);
    yCursor += layout.h + gap;

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupProduct = group.panelProductSnapshot || group.panelProduct || roofProduct;
      const size = panelSize(group.orientation, groupProduct);
      const pw = size.w * SCALE;
      const ph = size.h * SCALE;
      const sx = layout.x + pos(group.xM) * SCALE;
      const sy = layout.y + pos(group.yM) * SCALE;
      const rows = Math.round(pos(group.rows));
      const cols = Math.round(pos(group.cols));

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const override = group.panelOverrides?.[`${row}-${col}`];
          const x = override ? layout.x + pos(override.xM) * SCALE : sx + col * (pw + panelGap);
          const y = override ? layout.y + pos(override.yM) * SCALE : sy + row * (ph + panelGap);
          panels.push({
            id: `r${roofId}-g${group.id || groupIndex}-${row}-${col}`,
            number: panels.length + 1,
            roofId,
            groupId: `${roofId}-${group.id || groupIndex}`,
            row,
            col,
            x,
            y,
            w: pw,
            h: ph,
            cable: { x: x + pw / 2, y: y + ph * 0.72 },
            black: { x, y: y + ph / 2 },
            red: { x: x + pw, y: y + ph / 2 },
            panelProduct: groupProduct,
            panelProductSnapshot: snapshot(groupProduct),
          });
        }
      }
    });
  });

  return { roofLayouts, panels, width: Math.max(900, ...roofLayouts.map(r => r.x + r.w + 160), 900), height: Math.max(560, yCursor + pad) };
}

function uniquePanelIds(nodes = []) {
  const seen = new Set();
  const ids = [];
  nodes.forEach(node => {
    if (!node?.panelId || seen.has(node.panelId)) return;
    seen.add(node.panelId);
    ids.push(node.panelId);
  });
  return ids;
}

function countPanels(nodes = []) {
  return uniquePanelIds(nodes).length;
}

function panelSet(nodes = []) {
  return new Set(uniquePanelIds(nodes));
}

function removePanel(nodes = [], panelId) {
  return nodes.filter(node => node.panelId !== panelId);
}

function makeString(index, old = {}, inverterId = '') {
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${index + 1}`,
    color: old.color || COLORS[index % COLORS.length],
    nodes: Array.isArray(old.nodes) ? old.nodes : [],
    panel_count: old.panel_count || 0,
    panelProductId: old.panelProductId || '',
    panelProductSnapshot: old.panelProductSnapshot || null,
    inverterConfigId: old.inverterConfigId || inverterId,
    inverterProductId: old.inverterProductId || old.inverterProductSnapshot?.id || '',
    inverterProductSnapshot: old.inverterProductSnapshot || null,
    mppt: old.mppt || 1,
    pvInput: old.pvInput || old.pv_input || old.pv || 1,
  };
}

function makeInverter(index, old = {}) {
  return {
    id: old.id || uid(),
    name: old.name || `Växelriktare ${index + 1}`,
    productId: old.productId || old.inverterProductId || old.productSnapshot?.id || old.productSnapshot?.product_id || '',
    productSnapshot: old.productSnapshot || old.inverterProductSnapshot || null,
  };
}

function readSaved(project) {
  const server = parseJson(project?.string_layout_data, null);
  const backup = localJson(backupKey(project?.id));
  const selected = server?.version >= 2 && Array.isArray(server.strings) ? server : backup;
  if (selected?.version >= 2 && Array.isArray(selected.strings)) return selected;
  return { stringCount: 1, strings: [], inverterConfigs: [], settings: {}, panelProductId: '' };
}

function recount(string) {
  return { ...string, panel_count: countPanels(string.nodes || []) };
}

function cablePointsForString(string, panelMap) {
  const selectedPanels = uniquePanelIds(string.nodes || []).map(id => panelMap.panels.find(panel => panel.id === id)).filter(Boolean);
  if (!selectedPanels.length) return [];
  const points = [selectedPanels[0].cable];
  for (let i = 1; i < selectedPanels.length; i++) {
    const previous = points[points.length - 1];
    const next = selectedPanels[i].cable;
    if (Math.abs(previous.x - next.x) > 1 && Math.abs(previous.y - next.y) > 1) {
      points.push({ x: previous.x, y: next.y });
    }
    points.push(next);
  }
  return points;
}

function pointString(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function terminalPoint(panel, plus) {
  if (!panel) return null;
  return { x: panel.x + panel.w * (plus ? 0.18 : 0.82), y: panel.y + panel.h * 0.18 };
}

function Terminal({ panel, plus, color }) {
  const point = terminalPoint(panel, plus);
  if (!point) return null;
  return <g><circle cx={point.x} cy={point.y} r="10" fill="white" stroke={color} strokeWidth="3" /><text x={point.x} y={point.y + 5} textAnchor="middle" fontSize="16" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text></g>;
}

function getPanelProductForString(string, panelMap, products, fallbackPanel) {
  const firstId = uniquePanelIds(string.nodes || [])[0];
  const firstPanel = panelMap.panels.find(panel => panel.id === firstId);
  return string.panelProductSnapshot || firstPanel?.panelProductSnapshot || firstPanel?.panelProduct || products.find(product => product.id === string.panelProductId) || fallbackPanel || null;
}

function getInverterProduct(config, inverters) {
  return config?.productSnapshot || inverters.find(product => product.id === config?.productId) || null;
}

function topology(inverter) {
  const item = productData(inverter);
  const label = `${item?.brand || ''} ${item?.name || ''} ${item?.model || ''}`.toLowerCase();
  if (label.includes('afore') && label.includes('bnt50')) return { mpptCount: 3, mppts: [{ mppt: 1, pvInputs: [1, 2] }, { mppt: 2, pvInputs: [3, 4] }, { mppt: 3, pvInputs: [5, 6, 7] }], source: 'Afore BNT50KTL' };
  const mpptCount = Math.max(1, Math.round(pos(item?.mppt_count || item?.mppts, 2)));
  const perMppt = Math.max(1, Math.round(pos(item?.strings_per_mppt || item?.inputs_per_mppt, 2)));
  let pv = 1;
  return { mpptCount, mppts: Array.from({ length: mpptCount }, (_, index) => ({ mppt: index + 1, pvInputs: Array.from({ length: perMppt }, () => pv++) })), source: 'produktdata/standard' };
}

function panelElectrical(product) {
  const item = productData(product);
  return item && {
    pmax: pos(item.power_watts),
    voc: pos(item.voc_v),
    vmp: pos(item.vmp_v),
    isc: pos(item.isc_a),
    imp: pos(item.imp_a),
    pcoef: num(item.temp_coeff_pmax_percent_c, -0.35),
    vcoef: num(item.temp_coeff_voc_percent_c, -0.27),
    icoef: num(item.temp_coeff_isc_percent_c, 0.05),
    noct: pos(item.noct_c, 45),
  };
}

function inverterElectrical(product) {
  const item = productData(product);
  const ac = pos(item?.power_watts) / 1000;
  return item && {
    maxdc: pos(item.max_dc_power_kw, ac * 1.5),
    maxv: pos(item.max_dc_voltage_v),
    start: pos(item.startup_voltage_v),
    mpptmin: pos(item.mppt_voltage_min_v),
    mpptmax: pos(item.mppt_voltage_max_v),
    maxa: pos(item.max_input_current_a),
    maxisc: pos(item.max_short_circuit_current_a),
  };
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
  const inverter = inverterElectrical(inverterProduct);
  const valid = branches.filter(branch => branch.count > 0 && panelElectrical(branch.panelProduct));
  if (!inverter || !valid.length) return null;
  const values = valid.map(branch => ({ ...branch, ...branchValues(panelElectrical(branch.panelProduct), branch.count, settings) }));
  const totalPower = values.reduce((sum, item) => sum + item.power, 0);
  const totalImp = values.reduce((sum, item) => sum + item.imp, 0);
  const totalIsc = values.reduce((sum, item) => sum + item.isc, 0);
  const maxVoc = Math.max(...values.map(item => item.voc));
  const minVmp = Math.min(...values.map(item => item.vmp));
  const maxVmp = Math.max(...values.map(item => item.vmp));
  const checks = [
    { label: 'Max DC-spänning', ok: inverter.maxv > 0 && maxVoc <= inverter.maxv, nodata: !inverter.maxv, detail: inverter.maxv ? `Voc ${round(maxVoc, 1)} V ≤ ${inverter.maxv} V` : 'Saknas i produktdata' },
    { label: 'Startspänning', ok: inverter.start > 0 && minVmp >= inverter.start, nodata: !inverter.start, detail: inverter.start ? `Vmp ${round(minVmp, 1)} V ≥ ${inverter.start} V` : 'Saknas i produktdata' },
    { label: 'MPPT-område', ok: inverter.mpptmin > 0 && inverter.mpptmax > 0 && minVmp >= inverter.mpptmin && maxVmp <= inverter.mpptmax, nodata: !inverter.mpptmin || !inverter.mpptmax, detail: inverter.mpptmin && inverter.mpptmax ? `Vmp ${round(minVmp, 1)}-${round(maxVmp, 1)} V inom ${inverter.mpptmin}-${inverter.mpptmax} V` : 'Saknas i produktdata' },
    { label: 'MPPT-ström', ok: inverter.maxa > 0 && totalImp <= inverter.maxa, nodata: !inverter.maxa, detail: inverter.maxa ? `Imp ${round(totalImp, 2)} A ≤ ${inverter.maxa} A` : 'Saknas i produktdata' },
    { label: 'Kortslutningsström', ok: inverter.maxisc > 0 && totalIsc <= inverter.maxisc, nodata: !inverter.maxisc, detail: inverter.maxisc ? `Isc ${round(totalIsc, 2)} A ≤ ${inverter.maxisc} A` : 'Saknas i produktdata' },
    { label: 'DC-effekt', ok: inverter.maxdc > 0 && totalPower / 1000 <= inverter.maxdc, nodata: !inverter.maxdc, detail: inverter.maxdc ? `${round(totalPower / 1000, 2)} kW ≤ ${inverter.maxdc} kW` : 'Saknas i produktdata' },
  ];
  return { values, totalPower, totalImp, totalIsc, minVmp, maxVmp, status: checks.filter(check => !check.nodata).every(check => check.ok) ? 'OK' : 'Ej godkänd', checks };
}

function Canvas({ panelMap, strings, activeId, activeString, onPanelClick }) {
  const activePanels = panelSet(activeString?.nodes || []);
  const panelOwners = new Map();
  strings.forEach(string => panelSet(string.nodes || []).forEach(panelId => {
    if (!panelOwners.has(panelId) || string.id === activeId) panelOwners.set(panelId, string);
  }));

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${panelMap.width} ${panelMap.height}`} className="min-h-[560px] w-full min-w-[900px]">
        <defs><pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {panelMap.roofLayouts.map(layout => <g key={layout.roof.id || layout.roof.name}><text x={layout.x} y={layout.y - 22} fontSize="18" fontWeight="800">{layout.roof.name || 'Tak'}</text><polygon points={roofPoly(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#roof-hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
        {strings.filter(string => countPanels(string.nodes) >= 2).map(string => {
          const points = cablePointsForString(string, panelMap);
          const selectedPanels = uniquePanelIds(string.nodes).map(id => panelMap.panels.find(panel => panel.id === id)).filter(Boolean);
          const start = selectedPanels[0];
          const end = selectedPanels[selectedPanels.length - 1];
          return <g key={string.id}><polyline points={pointString(points)} fill="none" stroke={string.color} strokeWidth={string.id === activeId ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" opacity={string.id === activeId ? 1 : 0.55} />{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={string.id === activeId ? 4 : 3} fill={string.color} stroke="white" />)}{string.id === activeId && <Terminal panel={start} plus color={string.color} />}{string.id === activeId && <Terminal panel={end} plus={false} color={string.color} />}</g>;
        })}
        {panelMap.panels.map(panel => {
          const owner = panelOwners.get(panel.id);
          const selected = activePanels.has(panel.id);
          const fill = owner ? `${owner.color}22` : '#dbeafe';
          const stroke = selected ? activeString?.color || '#2563eb' : owner?.color || '#2563eb';
          return <g key={panel.id} onClick={() => onPanelClick(panel)} className="cursor-pointer"><rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="4" fill={fill} stroke={stroke} strokeWidth={selected ? 4 : owner ? 3 : 1.5} /><text x={panel.x + panel.w / 2} y={panel.y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{panel.number}</text>{owner && <text x={panel.x + panel.w / 2} y={panel.y + panel.h - 6} textAnchor="middle" fontSize="9" fontWeight="800" fill={owner.color}>{owner.name}</text>}<circle cx={panel.black.x} cy={panel.black.y} r="5" fill="#111827" stroke="white" strokeWidth="1.5" /><circle cx={panel.red.x} cy={panel.red.y} r="5" fill="#dc2626" stroke="white" strokeWidth="1.5" /></g>;
        })}
      </svg>
    </div>
  );
}

function CheckRow({ check }) {
  const Icon = check.ok ? CheckCircle2 : check.nodata ? AlertTriangle : XCircle;
  const tone = check.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : check.nodata ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-red-700 bg-red-50 border-red-100';
  return <div className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">{check.label}</div><div className="text-xs opacity-90">{check.detail}</div></div></div>;
}

function StringCountControl({ count, strings, activeId, setCount, selectString }) {
  return <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-sm font-bold text-foreground">1. Välj antal slingor</div><p className="text-xs text-muted-foreground">Bestäm hur många slingor projektet ska ha. Klicka sedan vilken slinga du vill markera.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setCount(Math.max(1, count - 1))} disabled={count <= 1}><Minus className="h-4 w-4" /></Button><input type="number" min="1" max="80" value={count} onChange={event => setCount(event.target.value)} className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-center text-lg font-black" /><Button variant="outline" size="icon" onClick={() => setCount(Math.min(80, count + 1))}><Plus className="h-4 w-4" /></Button></div></div><div className="mt-3 flex flex-wrap gap-2">{strings.map(string => <button key={string.id} onClick={() => selectString(string.id)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${string.id === activeId ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}>{string.name} · {countPanels(string.nodes)} paneler</button>)}</div></div>;
}

export default function StringMarkingTabV7({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const saved = readSaved(project);
  const planner = useMemo(() => readPlanner(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panelProducts = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
  const inverterProducts = products.filter(product => product.category === 'vaxelriktare' && product.is_active !== false);
  const initialInverters = (saved.inverterConfigs?.length ? saved.inverterConfigs : [{ productId: saved.inverterProductId || '' }]).map((item, index) => makeInverter(index, item));
  const firstInverterId = initialInverters[0]?.id || '';

  const [inverterConfigs, setInverterConfigs] = useState(initialInverters);
  const [activeInverterId, setActiveInverterId] = useState(saved.selectedInverterConfigId || firstInverterId);
  const [panelProductId, setPanelProductId] = useState(saved.panelProductId || selectedProductProp?.id || '');
  const [count, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, index) => makeString(index, saved.strings?.[index], firstInverterId)));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [selectedMppt, setSelectedMppt] = useState(Number(saved.selectedMppt || 1));
  const [selectedPv, setSelectedPv] = useState(Number(saved.selectedPv || 1));
  const [settings, setSettings] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20 });
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');

  const fallbackPanel = selectedProductProp?.id === panelProductId ? selectedProductProp : panelProducts.find(product => product.id === panelProductId) || selectedProductProp || null;
  const panelMap = useMemo(() => buildPanelMap(planner, panelProducts, fallbackPanel), [planner, panelProducts, fallbackPanel]);
  const active = strings.find(string => string.id === activeId) || strings[0];
  const activeInverterConfig = inverterConfigs.find(config => config.id === activeInverterId) || inverterConfigs[0];
  const activeInverterProduct = getInverterProduct(activeInverterConfig, inverterProducts);
  const inverterTopology = topology(activeInverterProduct);
  const pvOptions = inverterTopology.mppts.find(item => Number(item.mppt) === Number(selectedMppt))?.pvInputs || [1, 2];
  const selectedPvSafe = pvOptions.includes(Number(selectedPv)) ? Number(selectedPv) : pvOptions[0];

  const payload = (nextStrings = strings, overrides = {}) => {
    const nextConfigs = overrides.inverterConfigs ?? inverterConfigs;
    const normalizedStrings = nextStrings.map(item => {
      const panelProduct = getPanelProductForString(item, panelMap, panelProducts, fallbackPanel);
      const inverterConfig = nextConfigs.find(config => config.id === item.inverterConfigId);
      const inverterProduct = getInverterProduct(inverterConfig, inverterProducts);
      return recount({ ...item, panelProductId: productData(panelProduct)?.id || item.panelProductId || '', panelProductSnapshot: item.panelProductSnapshot || snapshot(panelProduct), inverterProductId: productData(inverterProduct)?.id || item.inverterProductId || '', inverterProductSnapshot: item.inverterProductSnapshot || snapshot(inverterProduct) });
    });
    return { version: 20, source: 'manual_panel_click_orthogonal_daisy_chain', stringCount: overrides.stringCount ?? count, panelProductId: overrides.panelProductId ?? panelProductId, selectedInverterConfigId: overrides.selectedInverterConfigId ?? activeInverterId, selectedMppt: overrides.selectedMppt ?? selectedMppt, selectedPv: overrides.selectedPv ?? selectedPvSafe, settings: overrides.settings ?? settings, inverterConfigs: nextConfigs.map(config => ({ ...config, productSnapshot: config.productSnapshot || snapshot(getInverterProduct(config, inverterProducts)) })), strings: normalizedStrings, savedAt: new Date().toISOString() };
  };

  const persist = async (nextStrings = strings, overrides = {}) => {
    const data = payload(nextStrings, overrides);
    saveLocal(project?.id, data);
    setSaving(true);
    setSaveInfo('Sparar...');
    try {
      await onUpdate?.({ string_layout_data: JSON.stringify(data) });
      setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch {
      setSaveInfo('Lokal backup sparad. Servern svarade inte.');
    } finally {
      setSaving(false);
    }
  };

  const replaceStrings = nextStrings => {
    const normalized = nextStrings.map(recount);
    setStrings(normalized);
    persist(normalized).catch(() => {});
  };

  const setCount = value => {
    const nextCount = Math.max(1, Math.min(80, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index], activeInverterId));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(item => item.id === activeId)) setActiveId(next[0]?.id || null);
    persist(next, { stringCount: nextCount }).catch(() => {});
  };

  const selectString = id => {
    setActiveId(id);
    const selected = strings.find(item => item.id === id);
    if (selected?.inverterConfigId) setActiveInverterId(selected.inverterConfigId);
    if (selected?.mppt) setSelectedMppt(Number(selected.mppt));
    if (selected?.pvInput) setSelectedPv(Number(selected.pvInput));
  };

  const updateInverterProduct = productId => {
    const product = inverterProducts.find(item => item.id === productId);
    const nextConfigs = inverterConfigs.map(config => config.id === activeInverterId ? { ...config, productId, productSnapshot: snapshot(product) } : config);
    setInverterConfigs(nextConfigs);
    const firstPv = topology(product).mppts[0]?.pvInputs?.[0] || 1;
    setSelectedMppt(1);
    setSelectedPv(firstPv);
    const nextStrings = strings.map(item => item.inverterConfigId === activeInverterId ? { ...item, inverterProductId: productId, inverterProductSnapshot: snapshot(product), mppt: 1, pvInput: firstPv } : item);
    setStrings(nextStrings);
    persist(nextStrings, { inverterConfigs: nextConfigs, selectedMppt: 1, selectedPv: firstPv }).catch(() => {});
  };

  const addInverter = () => {
    const config = makeInverter(inverterConfigs.length, {});
    const nextConfigs = [...inverterConfigs, config];
    setInverterConfigs(nextConfigs);
    setActiveInverterId(config.id);
    persist(strings, { inverterConfigs: nextConfigs, selectedInverterConfigId: config.id }).catch(() => {});
  };

  const removeInverter = id => {
    const nextConfigs = inverterConfigs.filter(config => config.id !== id);
    const fallbackId = nextConfigs[0]?.id || '';
    setInverterConfigs(nextConfigs);
    setActiveInverterId(fallbackId);
    const nextStrings = strings.map(item => item.inverterConfigId === id ? { ...item, inverterConfigId: fallbackId, inverterProductId: '', inverterProductSnapshot: null } : item);
    replaceStrings(nextStrings);
  };

  const togglePanel = panel => {
    if (!active?.id) return;
    const exists = panelSet(active.nodes).has(panel.id);
    const panelProduct = panel.panelProductSnapshot || panel.panelProduct || fallbackPanel;
    const inverterProduct = activeInverterProduct;
    const nextStrings = strings.map(item => {
      const base = { ...item, nodes: removePanel(item.nodes || [], panel.id) };
      if (item.id !== active.id) return recount(base);
      if (exists) return recount(base);
      return recount({ ...base, nodes: [...base.nodes, { panelId: panel.id }], inverterConfigId: activeInverterId, inverterProductId: productData(inverterProduct)?.id || '', inverterProductSnapshot: snapshot(inverterProduct), panelProductId: productData(panelProduct)?.id || '', panelProductSnapshot: snapshot(panelProduct), mppt: selectedMppt, pvInput: selectedPvSafe });
    });
    replaceStrings(nextStrings);
  };

  const clearActive = () => {
    if (!active?.id) return;
    replaceStrings(strings.map(item => item.id === active.id ? recount({ ...item, nodes: [], panel_count: 0 }) : item));
  };

  const branches = strings.filter(item => item.inverterConfigId === activeInverterId && Number(item.mppt) === Number(selectedMppt)).map(item => ({ id: item.id, label: `${item.name}${item.pvInput ? ` - PV${item.pvInput}` : ''}`, count: countPanels(item.nodes), panelProduct: getPanelProductForString(item, panelMap, panelProducts, fallbackPanel) })).filter(item => item.count > 0);
  const result = calculate(activeInverterProduct, branches, settings);
  const activeCount = countPanels(active?.nodes || []);

  if (!panelMap.panels.length) {
    return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i fliken Paneler först.</div></CardContent></Card>;
  }

  return <div className="space-y-4">
    <Card className="border-0 shadow-sm"><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Första panelen du klickar blir +. Sista panelen blir -. Kabeln ritas med 90-graders daisy-chain, utan diagonala hopp.</p></div><div className="flex flex-col items-end gap-2"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button>{saveInfo && <span className="text-xs text-muted-foreground">{saving ? 'Sparar...' : saveInfo}</span>}</div></div></CardHeader><CardContent className="space-y-4">
      <StringCountControl count={count} strings={strings} activeId={activeId} setCount={setCount} selectString={selectString} />
      <div className="grid gap-3 lg:grid-cols-2"><ProductSearchSelect label="Reservsolpanel om tak saknar val" products={panelProducts} value={panelProductId} onChange={value => { setPanelProductId(value); persist(strings, { panelProductId: value }).catch(() => {}); }} placeholder="Sök/välj solpanel" /><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Aktiv slinga</span><select value={activeId || ''} onChange={event => selectString(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{strings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Klicka panelerna i den ordning kabeln ska gå. Vill du göra om en slinga: tryck Rensa slinga och klicka om.</div>
      <div className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold">Växelriktare</div><Button size="sm" variant="outline" onClick={addInverter}><Plus className="mr-2 h-4 w-4" />Lägg till växelriktare</Button></div><div className="grid gap-3 lg:grid-cols-2">{inverterConfigs.map((config, index) => <div key={config.id} className={`rounded-xl border p-3 ${config.id === activeInverterId ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="mb-2 flex items-center justify-between"><button className="font-bold" onClick={() => setActiveInverterId(config.id)}>{config.name || `Växelriktare ${index + 1}`}</button>{inverterConfigs.length > 1 && <Button variant="ghost" size="icon" className="text-red-600" onClick={() => removeInverter(config.id)}><Trash2 className="h-4 w-4" /></Button>}</div><ProductSearchSelect label="Växelriktare" products={inverterProducts} value={config.productId || ''} onChange={updateInverterProduct} placeholder="Sök/välj växelriktare" /><p className="mt-2 text-xs text-muted-foreground">{productLabel(getInverterProduct(config, inverterProducts), 'Växelriktare')} - {topology(getInverterProduct(config, inverterProducts)).mpptCount} MPPT</p></div>)}</div></div>
      <div className="grid gap-3 lg:grid-cols-2"><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>MPPT</span><select value={selectedMppt} onChange={event => { const next = Number(event.target.value); const firstPv = topology(activeInverterProduct).mppts.find(item => item.mppt === next)?.pvInputs?.[0] || 1; setSelectedMppt(next); setSelectedPv(firstPv); persist(strings, { selectedMppt: next, selectedPv: firstPv }).catch(() => {}); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{topology(activeInverterProduct).mppts.map(item => <option key={item.mppt} value={item.mppt}>MPPT {item.mppt}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted-foreground"><span>PV-ingång</span><select value={selectedPvSafe} onChange={event => { const pv = Number(event.target.value); setSelectedPv(pv); persist(strings, { selectedPv: pv }).catch(() => {}); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{pvOptions.map(pv => <option key={pv} value={pv}>PV {pv}</option>)}</select></label></div>
      <Canvas panelMap={panelMap} strings={strings} activeId={activeId} activeString={active} onPanelClick={togglePanel} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv slinga: <b>{active?.name}</b> - {activeCount} paneler - MPPT {selectedMppt} - PV{selectedPvSafe}</div><div className="flex gap-2"><Button variant="outline" className="text-red-600" onClick={clearActive}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={() => persist(strings)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button></div></div>
    </CardContent></Card>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" />Beräkning</CardTitle></CardHeader><CardContent className="space-y-4">{result ? <><Badge className={result.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{result.status === 'OK' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{result.status}</Badge><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Effekt" value={round(result.totalPower / 1000, 2)} unit="kW" /><Metric label="Vmp" value={`${round(result.minVmp, 1)}-${round(result.maxVmp, 1)}`} unit="V" /><Metric label="Imp" value={round(result.totalImp, 2)} unit="A" /><Metric label="Isc" value={round(result.totalIsc, 2)} unit="A" /></div><div className="grid gap-2 lg:grid-cols-2">{result.checks.map(check => <CheckRow key={check.label} check={check} />)}</div></> : <div className="rounded-xl border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">Klicka paneler och välj växelriktare för att få beräkning.</div>}</CardContent></Card>
  </div>;
}
