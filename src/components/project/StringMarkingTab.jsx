import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cable, Calculator, CheckCircle2, Circle, Info, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';

const STRING_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#e879f9'];
const WEATHER_FACTORS = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME_FACTORS = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };
const DEFAULT_PANEL_SIZE = { w: 1.134, h: 1.953 };

const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const positive = (value, fallback = 0) => {
  const parsed = n(value, fallback);
  return parsed > 0 ? parsed : fallback;
};
const round = (value, decimals = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const m = 10 ** decimals;
  return Math.round(parsed * m) / m;
};
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Produkt';
}

function normalizePanel(product) {
  if (!product) return null;
  return {
    pmax_w: positive(product.power_watts, 0),
    voc_v: positive(product.voc_v, 0),
    vmp_v: positive(product.vmp_v, 0),
    isc_a: positive(product.isc_a, 0),
    imp_a: positive(product.imp_a, 0),
    temp_coeff_pmax_percent_c: n(product.temp_coeff_pmax_percent_c, -0.35),
    temp_coeff_voc_percent_c: n(product.temp_coeff_voc_percent_c, -0.27),
    temp_coeff_isc_percent_c: n(product.temp_coeff_isc_percent_c, 0.05),
    noct_c: positive(product.noct_c, 45),
  };
}

function normalizeInverter(product) {
  if (!product) return null;
  const acKw = positive(product.power_watts, 0) / 1000;
  return {
    ac_power_kw: acKw,
    max_dc_power_kw: positive(product.max_dc_power_kw, acKw * 1.5),
    max_dc_voltage_v: positive(product.max_dc_voltage_v, 0),
    startup_voltage_v: positive(product.startup_voltage_v, 0),
    mppt_voltage_min_v: positive(product.mppt_voltage_min_v, 0),
    mppt_voltage_max_v: positive(product.mppt_voltage_max_v, 0),
    mppt_count: Math.max(1, Math.round(positive(product.mppt_count, 1))),
    strings_per_mppt: Math.max(1, Math.round(positive(product.strings_per_mppt, 1))),
    max_input_current_a: positive(product.max_input_current_a, 0),
    max_short_circuit_current_a: positive(product.max_short_circuit_current_a, 0),
  };
}

function parseJson(raw, fallback) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function parseProjectPanelLayout(project) {
  const planner = parseJson(project?.solar_roof_planner_data, null);
  if (Array.isArray(planner?.roofs) && planner.roofs.some((roof) => (roof.panelGroups || []).some((g) => positive(g.rows, 0) * positive(g.cols, 0) > 0))) {
    return { source: 'solar_roof_planner_data', roofs: planner.roofs, legacyPanels: [] };
  }

  const legacy = parseJson(project?.panel_layout_data, null);
  const legacyPanels = Array.isArray(legacy) ? legacy : Array.isArray(legacy?.panels) ? legacy.panels : [];
  if (legacyPanels.length) {
    const roofWidth = positive(legacy?.roofWidth, positive(project?.roof_width_m, 8));
    const roofHeight = positive(legacy?.roofHeight, positive(project?.roof_height_m, 6));
    return {
      source: 'panel_layout_data',
      roofs: [{ id: 'legacy-roof', name: 'Panelritning från solcellskalkylatorn', widthM: roofWidth, roofFallM: roofHeight, shape: 'Rektangel', panelGroups: [] }],
      legacyPanels,
    };
  }

  return { source: null, roofs: [], legacyPanels: [] };
}

function roofPolygon(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * 0.18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * 0.82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * 0.12},${y} ${x + w},${y} ${x + w * 0.88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * 0.88},${y} ${x + w},${y + h} ${x + w * 0.12},${y + h}`;
  if (shape === 'Vinkel vänster') return `${x + w * 0.25},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h} ${x},${y + h * 0.42} ${x + w * 0.25},${y + h * 0.42}`;
  if (shape === 'Vinkel höger') return `${x},${y} ${x + w * 0.75},${y} ${x + w * 0.75},${y + h * 0.42} ${x + w},${y + h * 0.42} ${x + w},${y + h} ${x},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function panelSize(orientation, selectedPanelProduct) {
  const productW = positive(selectedPanelProduct?.width_mm, 0) / 1000;
  const productH = positive(selectedPanelProduct?.height_mm, 0) / 1000;
  const base = productW && productH ? { w: productW, h: productH } : DEFAULT_PANEL_SIZE;
  const isLandscape = String(orientation || '').toLowerCase().includes('ligg');
  return isLandscape ? { w: base.h, h: base.w } : base;
}

function buildPanelMap(layoutData, selectedPanelProduct) {
  const zoom = 58;
  const pad = 60;
  const roofGap = 85;
  const panelGap = 0.035 * zoom;
  let cursorY = pad;
  const roofLayouts = [];
  const panels = [];

  layoutData.roofs.forEach((roof, roofIndex) => {
    const layout = {
      roof,
      x: pad,
      y: cursorY,
      w: positive(roof.widthM, 8) * zoom,
      h: positive(roof.roofFallM, 6) * zoom,
    };
    roofLayouts.push(layout);
    cursorY += layout.h + roofGap;

    if (layoutData.legacyPanels.length) {
      const rows = Math.max(1, ...layoutData.legacyPanels.map((p) => n(p.row, 0) + 1));
      const cols = Math.max(1, ...layoutData.legacyPanels.map((p) => n(p.col, 0) + 1));
      const pw = Math.min(layout.w / cols, 72);
      const ph = Math.min(layout.h / rows, Math.max(44, pw * 1.45));
      layoutData.legacyPanels.forEach((panel, index) => {
        const x = layout.x + n(panel.col, 0) * (pw + 2);
        const y = layout.y + n(panel.row, 0) * (ph + 2);
        panels.push({
          id: panel.id || `legacy-panel-${index}`,
          label: `Panel ${index + 1}`,
          x, y, w: pw, h: ph,
          black: { x, y: y + ph / 2 },
          red: { x: x + pw, y: y + ph / 2 },
        });
      });
      return;
    }

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const size = panelSize(group.orientation, selectedPanelProduct);
      const pw = size.w * zoom;
      const ph = size.h * zoom;
      const startX = layout.x + positive(group.xM, 0) * zoom;
      const startY = layout.y + positive(group.yM, 0) * zoom;
      const rows = Math.max(0, Math.round(positive(group.rows, 0)));
      const cols = Math.max(0, Math.round(positive(group.cols, 0)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const id = `roof-${roof.id || roofIndex}-group-${group.id || groupIndex}-r${r}-c${c}`;
          const x = startX + c * (pw + panelGap);
          const y = startY + r * (ph + panelGap);
          panels.push({
            id,
            label: `${roof.name || `Tak ${roofIndex + 1}`} · ${group.name || `Grupp ${groupIndex + 1}`} · ${r + 1}:${c + 1}`,
            x, y, w: pw, h: ph,
            black: { x, y: y + ph / 2 },
            red: { x: x + pw, y: y + ph / 2 },
          });
        }
      }
    });
  });

  return { roofLayouts, panels, width: Math.max(900, ...roofLayouts.map((l) => l.x + l.w + 160), 900), height: Math.max(560, cursorY + pad) };
}

function parseStoredStrings(project) {
  const parsed = parseJson(project?.string_layout_data, null);
  if (Array.isArray(parsed)) return { strings: parsed, stringCount: Math.max(parsed.length, 1), settings: {} };
  if (parsed?.version === 2) return { strings: parsed.strings || [], stringCount: parsed.stringCount || 1, settings: parsed.settings || {}, panelProductId: parsed.panelProductId || '', inverterProductId: parsed.inverterProductId || '' };
  return { strings: [], stringCount: 1, settings: {}, panelProductId: '', inverterProductId: '' };
}

function makeString(index, existing = {}) {
  return { id: existing.id || uid(), name: `Slinga ${index + 1}`, color: STRING_COLORS[index % STRING_COLORS.length], nodes: existing.nodes || [], panel_count: existing.panel_count || 0, ...existing };
}

function uniquePanelCount(nodes) {
  return new Set((nodes || []).map((node) => node.panelId)).size;
}

function simulate({ panel, inverter, panelCount, parallelStrings, weather, timeOfDay, ambientTemperatureC }) {
  if (!panel || !inverter || !panelCount) return null;
  const effectiveIrradiance = 1000 * (WEATHER_FACTORS[weather] ?? 1) * (TIME_FACTORS[timeOfDay] ?? 1);
  const cellTemperature = n(ambientTemperatureC, 20) + ((panel.noct_c - 20) / 800) * effectiveIrradiance;
  const tempPowerFactor = 1 + ((cellTemperature - 25) * panel.temp_coeff_pmax_percent_c) / 100;
  const panelPower = panel.pmax_w * (effectiveIrradiance / 1000) * tempPowerFactor;
  const stringVoc = panel.voc_v * (1 + ((cellTemperature - 25) * panel.temp_coeff_voc_percent_c) / 100) * panelCount;
  const stringVmp = panel.vmp_v * (1 + ((cellTemperature - 25) * panel.temp_coeff_voc_percent_c) / 100) * panelCount;
  const shortCircuitCurrent = panel.isc_a * (1 + ((cellTemperature - 25) * panel.temp_coeff_isc_percent_c) / 100) * parallelStrings;
  const stringCurrent = panel.imp_a * parallelStrings;
  const stringPower = panelPower * panelCount * parallelStrings;
  const checks = [
    { label: 'Max DC-spänning', ok: inverter.max_dc_voltage_v > 0 && stringVoc <= inverter.max_dc_voltage_v, fail: 'Voc överstiger växelriktarens max DC-spänning eller data saknas.' },
    { label: 'Startspänning', ok: inverter.startup_voltage_v > 0 && stringVmp >= inverter.startup_voltage_v, fail: 'Vmp ligger under startspänning eller data saknas.' },
    { label: 'MPPT-område', ok: inverter.mppt_voltage_min_v > 0 && inverter.mppt_voltage_max_v > 0 && stringVmp >= inverter.mppt_voltage_min_v && stringVmp <= inverter.mppt_voltage_max_v, fail: 'Vmp ligger utanför MPPT-området eller data saknas.' },
    { label: 'MPPT-ström', ok: inverter.max_input_current_a > 0 && stringCurrent <= inverter.max_input_current_a, fail: 'Stringström är högre än tillåten MPPT-ström eller data saknas.' },
    { label: 'Kortslutningsström', ok: inverter.max_short_circuit_current_a > 0 && shortCircuitCurrent <= inverter.max_short_circuit_current_a, fail: 'Kortslutningsström är högre än tillåten gräns eller data saknas.' },
    { label: 'DC-effekt', ok: inverter.max_dc_power_kw > 0 && stringPower / 1000 <= inverter.max_dc_power_kw, fail: 'DC-effekt är högre än växelriktarens max DC-effekt eller data saknas.' },
  ];
  return { status: checks.every((check) => check.ok) ? 'OK' : 'Ej godkänd', checks, effectiveIrradiance, cellTemperature, panelPower, stringVoc, stringVmp, stringCurrent, shortCircuitCurrent, stringPower, dcAcRatio: inverter.ac_power_kw ? stringPower / 1000 / inverter.ac_power_kw : 0 };
}

function SmallSelect({ label, value, onChange, children }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}
function SmallInput({ label, value, onChange, type = 'number', min, max, step = '1' }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><input type={type} min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}
function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-lg font-black text-foreground">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

function StringCanvas({ roofMap, strings, activeStringId, draftNodes, onConnectorClick }) {
  const activeString = strings.find((string) => string.id === activeStringId);
  const activeColor = activeString?.color || '#ef4444';
  const nodePoint = (node) => {
    const panel = roofMap.panels.find((p) => p.id === node.panelId);
    if (!panel) return null;
    return node.terminal === 'red' ? panel.red : panel.black;
  };
  const polylinePoints = (nodes) => nodes.map(nodePoint).filter(Boolean).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="overflow-auto rounded-2xl border border-border bg-white">
      <svg viewBox={`0 0 ${roofMap.width} ${roofMap.height}`} className="min-h-[560px] w-full min-w-[900px]">
        <defs><pattern id="string-roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {roofMap.roofLayouts.map((layout) => <g key={layout.roof.id || layout.roof.name}><text x={layout.x} y={layout.y - 22} fontSize="18" fontWeight="800" fill="#0f172a">{layout.roof.name || 'Tak'}</text><polygon points={roofPolygon(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#string-roof-hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
        {roofMap.panels.map((panel, index) => <g key={panel.id}><rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="4" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.4" /><line x1={panel.x + panel.w / 3} y1={panel.y + 4} x2={panel.x + panel.w / 3} y2={panel.y + panel.h - 4} stroke="#93c5fd" strokeWidth="0.9" /><line x1={panel.x + panel.w * 2 / 3} y1={panel.y + 4} x2={panel.x + panel.w * 2 / 3} y2={panel.y + panel.h - 4} stroke="#93c5fd" strokeWidth="0.9" /><text x={panel.x + panel.w / 2} y={panel.y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{index + 1}</text><circle cx={panel.black.x} cy={panel.black.y} r="7" fill="#111827" stroke="white" strokeWidth="2" className="cursor-pointer" onClick={() => onConnectorClick(panel, 'black')} /><circle cx={panel.red.x} cy={panel.red.y} r="7" fill="#dc2626" stroke="white" strokeWidth="2" className="cursor-pointer" onClick={() => onConnectorClick(panel, 'red')} /></g>)}
        {strings.filter((s) => s.nodes?.length >= 2).map((string) => <g key={string.id}><polyline points={polylinePoints(string.nodes)} fill="none" stroke={string.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{string.nodes.map((node, i) => { const p = nodePoint(node); return p ? <circle key={i} cx={p.x} cy={p.y} r="5" fill={string.color} stroke="white" strokeWidth="1.5" /> : null; })}</g>)}
        {draftNodes.length >= 1 && <g>{draftNodes.length >= 2 && <polyline points={polylinePoints(draftNodes)} fill="none" stroke={activeColor} strokeWidth="4" strokeDasharray="8 5" strokeLinecap="round" strokeLinejoin="round" />}{draftNodes.map((node, i) => { const p = nodePoint(node); return p ? <circle key={i} cx={p.x} cy={p.y} r="6" fill={activeColor} stroke="white" strokeWidth="2" /> : null; })}</g>}
      </svg>
    </div>
  );
}

function CalculationPanel({ selectedString, draftNodes, panelProduct, inverterProduct, settings }) {
  const panel = normalizePanel(panelProduct);
  const inverter = normalizeInverter(inverterProduct);
  const panelCount = uniquePanelCount(draftNodes.length ? draftNodes : selectedString?.nodes || []);
  const result = simulate({ panel, inverter, panelCount, parallelStrings: 1, weather: settings.weather, timeOfDay: settings.timeOfDay, ambientTemperatureC: settings.ambientTemperatureC });
  const missing = [];
  if (!panelProduct) missing.push('Välj solpanel.');
  if (!inverterProduct) missing.push('Välj växelriktare.');
  if (panel && (!panel.pmax_w || !panel.voc_v || !panel.vmp_v || !panel.isc_a || !panel.imp_a)) missing.push('Solpanelen saknar effekt/Voc/Vmp/Isc/Imp.');
  if (inverter && (!inverter.max_dc_voltage_v || !inverter.startup_voltage_v || !inverter.mppt_voltage_min_v || !inverter.mppt_voltage_max_v || !inverter.max_input_current_a || !inverter.max_short_circuit_current_a)) missing.push('Växelriktaren saknar DC/MPPT/strömdata.');
  if (!panelCount) missing.push('Slingan saknar valda paneler.');
  return <Card className="border border-border shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4 text-primary" />Avancerad beräkning för vald slinga</CardTitle></CardHeader><CardContent className="space-y-3">{missing.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><div className="mb-1 font-bold">Komplettera innan beräkning:</div><ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul></div> : <><div className={`rounded-xl border p-3 text-sm font-bold ${result.status === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>Status: {result.status}</div><div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4"><Metric label="Paneler" value={panelCount} unit="st" /><Metric label="String Voc" value={round(result.stringVoc, 1)} unit="V" /><Metric label="String Vmp" value={round(result.stringVmp, 1)} unit="V" /><Metric label="Stringeffekt" value={round(result.stringPower / 1000, 2)} unit="kW" /><Metric label="Effekt/panel" value={round(result.panelPower, 0)} unit="W" /><Metric label="Celltemp" value={round(result.cellTemperature, 1)} unit="°C" /><Metric label="Instrålning" value={round(result.effectiveIrradiance, 0)} unit="W/m²" /><Metric label="DC/AC" value={round(result.dcAcRatio * 100, 0)} unit="%" /></div><div className="space-y-1">{result.checks.map((c) => <div key={c.label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{c.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}<span className="font-semibold">{c.label}</span>{!c.ok && <span>– {c.fail}</span>}</div>)}</div></>}</CardContent></Card>;
}

export default function StringMarkingTab({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const stored = useMemo(() => parseStoredStrings(project), [project?.string_layout_data]);
  const layoutData = useMemo(() => parseProjectPanelLayout(project), [project?.solar_roof_planner_data, project?.panel_layout_data, project?.roof_width_m, project?.roof_height_m]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => base44.entities.Product.list('-created_date') });
  const solarProducts = products.filter((p) => p.category === 'solpanel' && p.is_active !== false);
  const inverterProducts = products.filter((p) => p.category === 'vaxelriktare' && p.is_active !== false);
  const [panelProductId, setPanelProductId] = useState(stored.panelProductId || selectedProductProp?.id || '');
  const [inverterProductId, setInverterProductId] = useState(stored.inverterProductId || '');
  const [stringCount, setStringCount] = useState(Math.max(1, stored.stringCount || stored.strings.length || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, stored.stringCount || stored.strings.length || 1) }, (_, i) => makeString(i, stored.strings[i])));
  const [activeStringId, setActiveStringId] = useState(strings[0]?.id || null);
  const [draftNodes, setDraftNodes] = useState([]);
  const [settings, setSettings] = useState({ weather: stored.settings.weather || 'Soligt', timeOfDay: stored.settings.timeOfDay || '12:00', ambientTemperatureC: stored.settings.ambientTemperatureC ?? 20, roofTiltDeg: stored.settings.roofTiltDeg ?? 27, roofAzimuthDeg: stored.settings.roofAzimuthDeg ?? 180 });
  const [saving, setSaving] = useState(false);
  const panelProduct = solarProducts.find((p) => p.id === panelProductId) || selectedProductProp || null;
  const inverterProduct = inverterProducts.find((p) => p.id === inverterProductId) || null;
  const roofMap = useMemo(() => buildPanelMap(layoutData, panelProduct), [layoutData, panelProduct]);
  const selectedString = strings.find((s) => s.id === activeStringId) || strings[0];

  const changeStringCount = (value) => {
    const count = Math.max(1, Math.min(10, Number(value) || 1));
    setStringCount(count);
    setStrings((prev) => Array.from({ length: count }, (_, i) => makeString(i, prev[i])));
  };
  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const handleConnectorClick = (panel, terminal) => activeStringId && setDraftNodes((prev) => [...prev, { panelId: panel.id, terminal, panelLabel: panel.label }]);
  const persist = async (nextStrings = strings) => {
    setSaving(true);
    const payload = { version: 2, source: layoutData.source, stringCount, panelProductId, inverterProductId, settings, strings: nextStrings };
    try { await onUpdate({ string_layout_data: JSON.stringify(payload) }); } finally { setSaving(false); }
  };
  const saveActiveString = async () => {
    if (!selectedString || draftNodes.length < 2) return;
    const next = strings.map((s) => s.id === selectedString.id ? { ...s, nodes: draftNodes, panel_count: uniquePanelCount(draftNodes) } : s);
    setStrings(next); setDraftNodes([]); await persist(next);
  };
  const clearActiveString = () => {
    if (!selectedString) return;
    setStrings((prev) => prev.map((s) => s.id === selectedString.id ? { ...s, nodes: [], panel_count: 0 } : s));
    setDraftNodes([]);
  };

  if (!roofMap.panels.length) {
    return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="mb-1 font-bold">Ingen panelritning hittades från solcellskalkylatorn.</div>Gå till fliken <b>Paneler</b>, skapa panelplacering i solcellskalkylatorn och kom sedan tillbaka till Slingor.</div></CardContent></Card>;
  }

  return <div className="space-y-4"><Card className="border-0 shadow-sm"><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering från solcellskalkylatorn</CardTitle><p className="mt-1 text-sm text-muted-foreground">Källa: {layoutData.source}. Klicka svart/röd anslutningspunkt på panelerna i ordning. Tryck sedan Spara aktiv slinga.</p></div><Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}><RefreshCw className="h-4 w-4" />Uppdatera produkter</Button></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 lg:grid-cols-4"><SmallInput label="Antal slingor" min="1" max="10" value={stringCount} onChange={changeStringCount} /><SmallSelect label="Solpanel" value={panelProductId} onChange={setPanelProductId}><option value="">Välj solpanel</option>{solarProducts.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}</SmallSelect><SmallSelect label="Växelriktare" value={inverterProductId} onChange={setInverterProductId}><option value="">Välj växelriktare</option>{inverterProducts.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}</SmallSelect><SmallSelect label="Aktiv slinga" value={activeStringId || ''} onChange={(v) => { setActiveStringId(v); setDraftNodes([]); }}>{strings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SmallSelect></div><div className="grid gap-3 lg:grid-cols-5"><SmallSelect label="Väder" value={settings.weather} onChange={(v) => updateSettings({ weather: v })}>{Object.keys(WEATHER_FACTORS).map((item) => <option key={item}>{item}</option>)}</SmallSelect><SmallSelect label="Tid" value={settings.timeOfDay} onChange={(v) => updateSettings({ timeOfDay: v })}>{Object.keys(TIME_FACTORS).map((item) => <option key={item}>{item}</option>)}</SmallSelect><SmallInput label="Temperatur °C" value={settings.ambientTemperatureC} onChange={(v) => updateSettings({ ambientTemperatureC: Number(v) })} /><SmallInput label="Taklutning °" value={settings.roofTiltDeg} onChange={(v) => updateSettings({ roofTiltDeg: Number(v) })} /><SmallInput label="Azimut °" value={settings.roofAzimuthDeg} onChange={(v) => updateSettings({ roofAzimuthDeg: Number(v) })} /></div><div className="flex flex-wrap gap-2">{strings.map((s) => <button key={s.id} onClick={() => { setActiveStringId(s.id); setDraftNodes([]); }} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${activeStringId === s.id ? 'border-primary bg-primary text-white' : 'border-border bg-background text-foreground'}`}><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />{s.name} · {s.panel_count || uniquePanelCount(s.nodes)} paneler</button>)}</div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Svart cirkel = minus. Röd cirkel = plus. Klicka punkterna i den ordning slingan ska gå.</div><StringCanvas roofMap={roofMap} strings={strings} activeStringId={activeStringId} draftNodes={draftNodes} onConnectorClick={handleConnectorClick} /><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv ritning: <b>{selectedString?.name}</b> · {draftNodes.length} klickade anslutningspunkter · {uniquePanelCount(draftNodes)} paneler</div><div className="flex gap-2"><Button variant="outline" onClick={() => setDraftNodes([])} disabled={!draftNodes.length}>Rensa osparad ritning</Button><Button variant="outline" className="gap-2 text-red-600" onClick={clearActiveString} disabled={!selectedString}><Trash2 className="h-4 w-4" />Rensa sparad slinga</Button><Button className="gap-2" onClick={saveActiveString} disabled={saving || draftNodes.length < 2}><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara aktiv slinga'}</Button></div></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><CalculationPanel selectedString={selectedString} draftNodes={draftNodes} panelProduct={panelProduct} inverterProduct={inverterProduct} settings={settings} /><Card className="border border-border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Sparade slingor</CardTitle></CardHeader><CardContent className="space-y-2">{strings.map((s) => <div key={s.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"><div className="flex items-center gap-2"><Circle className="h-4 w-4" style={{ color: s.color, fill: s.color }} /><div><div className="font-bold">{s.name}</div><div className="text-xs text-muted-foreground">{s.nodes?.length || 0} anslutningspunkter · {s.panel_count || uniquePanelCount(s.nodes)} paneler</div></div></div><Badge variant={s.nodes?.length >= 2 ? 'default' : 'outline'}>{s.nodes?.length >= 2 ? 'Sparad' : 'Ej ritad'}</Badge></div>)}</CardContent></Card></div></div>;
}
