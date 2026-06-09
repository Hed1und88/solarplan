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
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };
const SCALE = 58;
const DEF_PANEL = { w: 1.134, h: 1.953 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 99999)}`;
const json = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const stringBackupKey = projectId => `solarplan:project:${projectId}:string_layout_data`;
const plannerStorageKey = projectId => `solarplan:project:${projectId}:solar_roof_planner_data`;

function readLocalJson(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeStringBackup(projectId, payload) {
  if (typeof window === 'undefined' || !projectId) return;
  try { window.localStorage.setItem(stringBackupKey(projectId), JSON.stringify(payload)); } catch {}
}

function productData(product) {
  if (!product) return null;
  const technical = product?.technical_data_snapshot || product?.technical_snapshot || {};
  return hydrateProductWithMeta({ ...technical, ...product });
}

function snapshotProduct(product) {
  if (!product) return null;
  if (product.technical_data_snapshot || product.documents_snapshot || product.product_meta_snapshot) return product;
  return createProductSnapshot(productData(product)) || productData(product);
}

function productLabel(product) {
  const p = productData(product);
  return [p?.brand, p?.model].filter(Boolean).join(' ') || p?.name || 'Ingen solpanel vald';
}

function inverterLabel(product) {
  const p = productData(product);
  return [p?.brand, p?.model].filter(Boolean).join(' ') || p?.name || 'Växelriktare';
}

function firstNumber(obj, keys, fallback = 0) {
  const p = productData(obj) || obj;
  for (const key of keys) if (pos(p?.[key], 0)) return pos(p[key], fallback);
  return fallback;
}

function parseNumberList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => Math.max(0, Math.round(num(v)))).filter(Boolean);
  if (typeof value === 'object') return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => Math.max(0, Math.round(num(value[key])))).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;,|/ ]+/).map(v => Math.max(0, Math.round(num(v)))).filter(Boolean);
  return [];
}

function distributeExtraToLast(total, count) {
  const safeCount = Math.max(1, Math.round(pos(count, 1)));
  const safeTotal = Math.max(safeCount, Math.round(pos(total, safeCount * 2)));
  const base = Math.floor(safeTotal / safeCount);
  const rest = safeTotal % safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index >= safeCount - rest ? 1 : 0));
}

function inverterTopology(rawProduct) {
  const product = productData(rawProduct);
  const modelText = `${product?.brand || ''} ${product?.name || ''} ${product?.model || ''}`.toLowerCase();
  const isAforeBnt50 = modelText.includes('afore') && (modelText.includes('bnt50ktl') || modelText.includes('bnt 50ktl') || modelText.includes('bnt050ktl'));
  if (isAforeBnt50) {
    return { mpptCount: 3, counts: [2, 2, 3], totalPv: 7, mppts: [{ mppt: 1, pvInputs: [1, 2] }, { mppt: 2, pvInputs: [3, 4] }, { mppt: 3, pvInputs: [5, 6, 7] }], source: 'modellregel Afore BNT50KTL' };
  }

  const mpptCount = Math.max(1, Math.round(firstNumber(product, ['mppt_count', 'number_of_mppt', 'number_of_mppts', 'mppts', 'mppt_inputs', 'mppt_input_count', 'tracker_count', 'mpp_tracker_count'], 2)));
  const explicitCounts = parseNumberList(product?.pv_inputs_per_mppt || product?.pv_per_mppt || product?.dc_inputs_per_mppt || product?.string_inputs_per_mppt_map || product?.mppt_pv_inputs || product?.mppt_string_inputs);
  const totalPv = firstNumber(product, ['total_pv_inputs', 'pv_input_count', 'pv_inputs_count', 'pv_inputs', 'dc_input_count', 'dc_inputs', 'total_dc_inputs', 'string_input_count', 'string_inputs', 'total_strings', 'input_count', 'inputs_total'], 0);
  const uniformRaw = firstNumber(product, ['pv_inputs_per_mppt_count', 'inputs_per_mppt', 'dc_inputs_each_mppt', 'strings_per_mppt'], 0);

  let counts;
  let source;
  if (explicitCounts.length) {
    counts = Array.from({ length: mpptCount }, (_, index) => explicitCounts[index] || explicitCounts[explicitCounts.length - 1] || 1);
    source = 'pv_inputs_per_mppt / mppt_pv_inputs';
  } else if (totalPv > 0) {
    counts = distributeExtraToLast(totalPv, mpptCount);
    source = 'total_pv_inputs / pv_input_count';
  } else if (uniformRaw > 0) {
    counts = uniformRaw > 3 && mpptCount > 1 ? distributeExtraToLast(uniformRaw, mpptCount) : Array.from({ length: mpptCount }, () => Math.max(1, Math.round(uniformRaw)));
    source = uniformRaw > 3 && mpptCount > 1 ? 'strings_per_mppt tolkat som totalt antal PV-ingångar' : 'strings_per_mppt';
  } else {
    counts = Array.from({ length: mpptCount }, () => 2);
    source = 'standardvärde';
  }

  let pv = 1;
  const mppts = counts.map((count, index) => ({ mppt: index + 1, pvInputs: Array.from({ length: Math.max(1, Math.round(count)) }, () => pv++) }));
  return { mpptCount, counts, totalPv: pv - 1, mppts, source };
}

function pvInputsForMppt(mppt, topology) {
  return topology?.mppts?.find(item => Number(item.mppt) === Number(mppt))?.pvInputs || [1, 2];
}

function mpptFromPvInput(pvInput, topology) {
  return topology?.mppts?.find(item => item.pvInputs.includes(Number(pvInput)))?.mppt || 1;
}

function parseLayout(project) {
  const planner = json(project?.solar_roof_planner_data, null);
  if (Array.isArray(planner?.roofs) && planner.roofs.some(roof => (roof.panelGroups || []).length)) return { source: 'solar_roof_planner_data', roofs: planner.roofs };
  const backup = readLocalJson(plannerStorageKey(project?.id));
  if (Array.isArray(backup?.roofs) && backup.roofs.some(roof => (roof.panelGroups || []).length)) return { source: 'solar_roof_planner_data_backup', roofs: backup.roofs };
  return { source: null, roofs: [] };
}

function panelSize(orientation, product) {
  const p = productData(product);
  const w = pos(p?.width_mm, 0) / 1000;
  const h = pos(p?.height_mm, 0) / 1000;
  const base = w && h ? { w, h } : DEF_PANEL;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function roofPanelProduct(roof, products, fallback) {
  return roof?.panelProductSnapshot || products.find(product => product.id === roof?.panelProductId) || fallback || null;
}

function roofPoly(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * .18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * .82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * .12},${y} ${x + w},${y} ${x + w * .88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * .88},${y} ${x + w},${y + h} ${x + w * .12},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function buildMap(layout, products, fallbackPanelProduct) {
  const pad = 60;
  const gap = 85;
  const panelGap = .035 * SCALE;
  let yCursor = pad;
  const roofLayouts = [];
  const panels = [];
  const panelGroups = [];

  layout.roofs.forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const roofProduct = roofPanelProduct(roof, products, fallbackPanelProduct);
    const r = { roof, x: pad, y: yCursor, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofLayouts.push(r);
    yCursor += r.h + gap;

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupId = `${roofId}-${group.id || groupIndex}`;
      const groupName = group.name || `Panelgrupp ${groupIndex + 1}`;
      const groupProduct = group.panelProductSnapshot || group.panelProduct || roofProduct;
      const size = panelSize(group.orientation, groupProduct);
      const pw = size.w * SCALE;
      const ph = size.h * SCALE;
      const sx = r.x + pos(group.xM) * SCALE;
      const sy = r.y + pos(group.yM) * SCALE;
      const rows = Math.round(pos(group.rows));
      const cols = Math.round(pos(group.cols));

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const override = group.panelOverrides?.[`${row}-${col}`];
          const x = override ? r.x + pos(override.xM) * SCALE : sx + col * (pw + panelGap);
          const y = override ? r.y + pos(override.yM) * SCALE : sy + row * (ph + panelGap);
          panels.push({ id: `r${roofId}-g${group.id || groupIndex}-${row}-${col}`, roofId, groupId, groupName, x, y, w: pw, h: ph, panelProduct: groupProduct, panelProductSnapshot: snapshotProduct(groupProduct), black: { x, y: y + ph / 2 }, red: { x: x + pw, y: y + ph / 2 } });
        }
      }

      panelGroups.push({ id: groupId, label: `${roof.name || 'Tak'} / ${groupName}`, roofName: roof.name || 'Tak', groupName, panelCount: rows * cols, panelProduct: groupProduct, panelProductSnapshot: snapshotProduct(groupProduct), panelProductId: productData(groupProduct)?.id || roof.panelProductId || '' });
    });
  });

  return { roofLayouts, panels, panelGroups, width: Math.max(900, ...roofLayouts.map(r => r.x + r.w + 160), 900), height: Math.max(560, yCursor + pad) };
}

function readStored(project) {
  const server = json(project?.string_layout_data, null);
  const backup = readLocalJson(stringBackupKey(project?.id));
  const preferred = server?.version >= 2 && Array.isArray(server.strings) ? server : backup;
  if (preferred?.version >= 2 && Array.isArray(preferred.strings)) return preferred;
  return { strings: [], stringCount: 1, settings: {}, panelProductId: '', inverterProductId: '', inverterConfigs: [] };
}

function makeInverterConfig(i, old = {}) {
  return { id: old.id || uid(), name: old.name || `Växelriktare ${i + 1}`, productId: old.productId || old.inverterProductId || old.productSnapshot?.id || old.productSnapshot?.product_id || '', productSnapshot: old.productSnapshot || old.inverterProductSnapshot || null };
}

function makeString(i, old = {}, fallbackInverterId = '') {
  const legacyPvInput = old.pvInput || old.pv_input || old.pv || '';
  return { id: old.id || uid(), name: old.name || `Slinga ${i + 1}`, color: old.color || COLORS[i % COLORS.length], nodes: old.nodes || [], panel_count: old.panel_count || 0, panelGroupId: old.panelGroupId || '', panelProductId: old.panelProductId || old.panelProductSnapshot?.id || old.panelProductSnapshot?.product_id || '', panelProductSnapshot: old.panelProductSnapshot || null, inverterConfigId: old.inverterConfigId || fallbackInverterId, inverterProductId: old.inverterProductId || '', inverterProductSnapshot: old.inverterProductSnapshot || null, mppt: old.mppt || 1, pvInput: legacyPvInput || old.pvInput || '' };
}

function countPanels(nodes) {
  return new Set((nodes || []).map(node => node.panelId)).size;
}

function panelIds(nodes) {
  return new Set((nodes || []).map(node => node.panelId));
}

function removePanelNodes(nodes, panelId) {
  return (nodes || []).filter(node => node.panelId !== panelId);
}

function nodesForPanel(panel) {
  return [{ panelId: panel.id, terminal: 'black' }, { panelId: panel.id, terminal: 'red' }];
}

function recountString(string) {
  return { ...string, panel_count: countPanels(string.nodes || []) };
}

function panelProductForString(string, map, products, fallbackPanelProduct) {
  const firstSelectedPanelId = string?.nodes?.[0]?.panelId;
  const firstSelectedPanel = map.panels.find(panel => panel.id === firstSelectedPanelId);
  return string?.panelProductSnapshot || firstSelectedPanel?.panelProductSnapshot || firstSelectedPanel?.panelProduct || map.panelGroups.find(group => group.id === string?.panelGroupId)?.panelProductSnapshot || products.find(product => product.id === string?.panelProductId) || fallbackPanelProduct || null;
}

function inverterProductForConfig(config, inverters) {
  return config?.productSnapshot || inverters.find(product => product.id === config?.productId) || null;
}

function normPanel(product) {
  const p = productData(product);
  return p && { pmax: pos(p.power_watts), voc: pos(p.voc_v), vmp: pos(p.vmp_v), isc: pos(p.isc_a), imp: pos(p.imp_a), pcoef: num(p.temp_coeff_pmax_percent_c, -0.35), vcoef: num(p.temp_coeff_voc_percent_c, -0.27), icoef: num(p.temp_coeff_isc_percent_c, 0.05), noct: pos(p.noct_c, 45) };
}

function normInv(product) {
  const p = productData(product);
  const ac = pos(p?.power_watts) / 1000;
  return p && { ac, maxdc: pos(p.max_dc_power_kw, ac * 1.5), maxv: pos(p.max_dc_voltage_v), start: pos(p.startup_voltage_v), mpptmin: pos(p.mppt_voltage_min_v), mpptmax: pos(p.mppt_voltage_max_v), maxa: pos(p.max_input_current_a), maxisc: pos(p.max_short_circuit_current_a) };
}

function missingPanelFields(product) {
  const p = productData(product);
  if (!p) return ['Ingen solpanel vald'];
  return [['voc_v', 'Voc saknas'], ['vmp_v', 'Vmp saknas'], ['isc_a', 'Isc saknas'], ['imp_a', 'Imp saknas'], ['power_watts', 'Effekt saknas']].filter(([key]) => !pos(p[key])).map(([, label]) => label);
}

function missingInvFields(product) {
  const p = productData(product);
  if (!p) return ['Ingen växelriktare vald'];
  const missing = [];
  if (!pos(p.max_dc_voltage_v)) missing.push('Max DC-spänning saknas');
  if (!pos(p.startup_voltage_v)) missing.push('Startspänning saknas');
  if (!pos(p.mppt_voltage_min_v) || !pos(p.mppt_voltage_max_v)) missing.push('MPPT-spänningsområde saknas');
  if (!pos(p.max_input_current_a)) missing.push('Max ingångsström saknas');
  if (!pos(p.max_short_circuit_current_a)) missing.push('Max kortslutningsström saknas');
  return missing;
}

function branchElectrical(panel, seriesPanelCount, settings) {
  const irradiance = 1000 * (WEATHER[settings.weather] ?? 1) * (TIME[settings.timeOfDay] ?? 1);
  const cell = num(settings.ambientTemperatureC, 20) + ((panel.noct - 20) / 800) * irradiance;
  const panelPower = panel.pmax * (irradiance / 1000) * (1 + ((cell - 25) * panel.pcoef) / 100);
  return { irradiance, cell, voc: panel.voc * (1 + ((cell - 25) * panel.vcoef) / 100) * seriesPanelCount, vmp: panel.vmp * (1 + ((cell - 25) * panel.vcoef) / 100) * seriesPanelCount, imp: panel.imp, isc: panel.isc * (1 + ((cell - 25) * panel.icoef) / 100), power: panelPower * seriesPanelCount };
}

function simulateMppt(inverterProduct, branches, settings) {
  const inverter = normInv(inverterProduct);
  const valid = (branches || []).filter(branch => pos(branch.panelCount) > 0 && normPanel(branch.panelProduct));
  if (!inverter || !valid.length) return null;
  const values = valid.map(branch => ({ ...branch, ...branchElectrical(normPanel(branch.panelProduct), branch.panelCount, settings) }));
  const totalImp = values.reduce((sum, item) => sum + item.imp, 0);
  const totalIsc = values.reduce((sum, item) => sum + item.isc, 0);
  const totalPower = values.reduce((sum, item) => sum + item.power, 0);
  const maxVoc = Math.max(...values.map(item => item.voc));
  const minVmp = Math.min(...values.map(item => item.vmp));
  const maxVmp = Math.max(...values.map(item => item.vmp));
  const pvUsed = [...new Set(values.map(item => item.pvInput).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const checks = [
    { label: 'Max DC-spänning', ok: inverter.maxv > 0 && maxVoc <= inverter.maxv, nodata: !inverter.maxv, detail: inverter.maxv > 0 ? `Högsta Voc ${round(maxVoc, 1)} V ≤ ${inverter.maxv} V` : 'Produkten saknar max_dc_voltage_v' },
    { label: 'Startspänning', ok: inverter.start > 0 && minVmp >= inverter.start, nodata: !inverter.start, detail: inverter.start > 0 ? `Lägsta Vmp ${round(minVmp, 1)} V ≥ ${inverter.start} V` : 'Produkten saknar startup_voltage_v' },
    { label: 'MPPT-område', ok: inverter.mpptmin > 0 && inverter.mpptmax > 0 && minVmp >= inverter.mpptmin && maxVmp <= inverter.mpptmax, nodata: !inverter.mpptmin || !inverter.mpptmax, detail: inverter.mpptmin && inverter.mpptmax ? `Vmp ${round(minVmp, 1)}-${round(maxVmp, 1)} V i [${inverter.mpptmin}-${inverter.mpptmax}] V` : 'Produkten saknar mppt_voltage_min/max_v' },
    { label: 'MPPT-ström', ok: inverter.maxa > 0 && totalImp <= inverter.maxa, nodata: !inverter.maxa, detail: inverter.maxa > 0 ? `Total Imp ${round(totalImp, 2)} A (${values.length} slinga/slingor) ≤ ${inverter.maxa} A` : 'Produkten saknar max_input_current_a' },
    { label: 'Kortslutningsström', ok: inverter.maxisc > 0 && totalIsc <= inverter.maxisc, nodata: !inverter.maxisc, detail: inverter.maxisc > 0 ? `Total Isc ${round(totalIsc, 2)} A ≤ ${inverter.maxisc} A` : 'Produkten saknar max_short_circuit_current_a' },
    { label: 'PV-ingångar', ok: true, nodata: false, detail: pvUsed.length ? `Använder ${pvUsed.map(pv => `PV${pv}`).join(', ')}` : 'Ingen PV-ingång vald' },
    { label: 'DC-effekt', ok: inverter.maxdc > 0 && totalPower / 1000 <= inverter.maxdc, nodata: !inverter.maxdc, detail: inverter.maxdc > 0 ? `${round(totalPower / 1000, 2)} kW ≤ ${inverter.maxdc} kW` : 'Produkten saknar max_dc_power_kw' },
  ];
  return { status: checks.filter(check => !check.nodata).every(check => check.ok) ? 'OK' : 'Ej godkänd', checks, branchValues: values, branchCount: values.length, current: totalImp, isc: totalIsc, power: totalPower, vmpMin: minVmp, vmpMax: maxVmp };
}

function Select({ label, value, onChange, children }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}

function Input({ label, value, onChange, min, max }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value ?? ''} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}

function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

function CheckRow({ check }) {
  const Icon = check.ok ? CheckCircle2 : check.nodata ? AlertTriangle : XCircle;
  const tone = check.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : check.nodata ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-red-700 bg-red-50 border-red-100';
  return <div className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">{check.label}</div><div className="text-xs opacity-90">{check.detail}</div></div></div>;
}

function StringCountControl({ count, strings, activeId, onChangeCount, onSelectString }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-bold text-foreground">1. Välj antal slingor</div>
          <p className="text-xs text-muted-foreground">Bestäm först hur många slingor projektet ska ha. Därefter väljer du aktiv slinga och klickar panelerna som hör dit.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => onChangeCount(Math.max(1, count - 1))} disabled={count <= 1}><Minus className="h-4 w-4" /></Button>
          <input type="number" min="1" max="80" value={count} onChange={event => onChangeCount(event.target.value)} className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-center text-lg font-black text-foreground" />
          <Button type="button" variant="outline" size="icon" onClick={() => onChangeCount(Math.min(80, count + 1))}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {strings.map((item, index) => (
          <button key={item.id} type="button" onClick={() => onSelectString(item.id)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${item.id === activeId ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}>
            {item.name || `Slinga ${index + 1}`} · {countPanels(item.nodes || [])} paneler
          </button>
        ))}
      </div>
    </div>
  );
}

function Canvas({ map, strings, activeId, activeString, onClickPanel }) {
  const point = node => { const panel = map.panels.find(item => item.id === node.panelId); return panel ? panel[node.terminal] : null; };
  const pts = nodes => nodes.map(point).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');
  const activePanelIds = panelIds(activeString?.nodes || []);
  const panelOwners = new Map();
  strings.forEach(string => panelIds(string.nodes || []).forEach(panelId => { if (!panelOwners.has(panelId) || string.id === activeId) panelOwners.set(panelId, string); }));
  return <div className="overflow-auto rounded-2xl border bg-white"><svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]">
    <defs><pattern id="string-hatch-v7" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
    {map.roofLayouts.map(r => <g key={r.roof.id || r.roof.name}><text x={r.x} y={r.y - 22} fontSize="18" fontWeight="800">{r.roof.name || 'Tak'}</text><polygon points={roofPoly(r.x, r.y, r.w, r.h, r.roof.shape)} fill="url(#string-hatch-v7)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
    {strings.filter(s => s.nodes?.length >= 2).map(s => <g key={s.id}><polyline points={pts(s.nodes)} fill="none" stroke={s.color} strokeWidth={s.id === activeId ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" opacity={s.id === activeId ? 1 : 0.55} />{s.nodes.map((node, index) => { const p = point(node); return p && <circle key={index} cx={p.x} cy={p.y} r={s.id === activeId ? 6 : 4} fill={s.color} stroke="white" />; })}</g>)}
    {map.panels.map((panel, index) => { const owner = panelOwners.get(panel.id); const isActive = activePanelIds.has(panel.id); const fill = owner ? `${owner.color || '#2563eb'}22` : '#dbeafe'; const stroke = isActive ? activeString?.color || '#2563eb' : owner?.color || '#2563eb'; const strokeWidth = isActive ? 4 : owner ? 3 : 1.5; return <g key={panel.id} onClick={() => onClickPanel(panel)} className="cursor-pointer"><rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="4" fill={fill} stroke={stroke} strokeWidth={strokeWidth} /><text x={panel.x + panel.w / 2} y={panel.y + panel.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{index + 1}</text>{owner && <text x={panel.x + panel.w / 2} y={panel.y + panel.h - 6} textAnchor="middle" fontSize="9" fontWeight="800" fill={owner.color}>{owner.name}</text>}<circle cx={panel.black.x} cy={panel.black.y} r="5" fill="#111827" stroke="white" strokeWidth="1.5" pointerEvents="none" /><circle cx={panel.red.x} cy={panel.red.y} r="5" fill="#dc2626" stroke="white" strokeWidth="1.5" pointerEvents="none" /></g>; })}
  </svg></div>;
}

function InverterManager({ configs, inverters, activeId, setActiveId, updateProduct, addInverter, removeInverter }) {
  return <div className="rounded-xl border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><div className="text-sm font-semibold text-foreground">Växelriktare på site</div><Button size="sm" variant="outline" onClick={addInverter}><Plus className="mr-2 h-4 w-4" />Lägg till växelriktare</Button></div><div className="grid gap-3 lg:grid-cols-2">{configs.map((cfg, index) => { const product = inverterProductForConfig(cfg, inverters); const topology = inverterTopology(product); return <div key={cfg.id} className={`rounded-xl border p-3 ${cfg.id === activeId ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}><div className="mb-2 flex items-center justify-between gap-2"><button type="button" onClick={() => setActiveId(cfg.id)} className="text-left font-bold">{cfg.name || `Växelriktare ${index + 1}`}</button>{configs.length > 1 && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => removeInverter(cfg.id)}><Trash2 className="h-4 w-4" /></Button>}</div><ProductSearchSelect label="Växelriktare" products={inverters} value={cfg.productId || ''} onChange={value => updateProduct(cfg.id, value)} placeholder="Sök/välj växelriktare" /><div className="mt-2 text-xs text-muted-foreground">{inverterLabel(product)} · {topology.mpptCount} MPPT · {topology.totalPv} PV · PV/MPPT: {topology.counts.join(' / ')} · källa: {topology.source}</div>{cfg.id !== activeId && <Button size="sm" variant="outline" className="mt-2" onClick={() => setActiveId(cfg.id)}>Välj denna</Button>}</div>; })}</div></div>;
}

function PvInputPanel({ selectedPv, setSelectedPv, pvInputs, strings, activeInverterId, configs, onToggleString }) {
  const cfgName = id => configs.find(cfg => cfg.id === id)?.name || 'Växelriktare';
  return <div className="rounded-xl border border-border p-3"><div className="mb-2 text-sm font-semibold text-foreground">PV-ingångar</div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{pvInputs.map(pv => { const pvStrings = strings.filter(item => item.inverterConfigId === activeInverterId && Number(item.pvInput) === Number(pv)); return <button key={pv} type="button" onClick={() => setSelectedPv(pv)} className={`rounded-xl border p-3 text-left ${Number(selectedPv) === Number(pv) ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}><div className="font-bold">PV {pv}</div><div className="text-xs text-muted-foreground">{pvStrings.length ? pvStrings.map(item => item.name).join(', ') : 'Ingen slinga vald'}</div></button>; })}</div><div className="mt-3 rounded-xl bg-muted/40 p-3"><div className="mb-2 text-sm font-semibold">Slingor på PV {selectedPv}</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{strings.map(item => { const checked = item.inverterConfigId === activeInverterId && Number(item.pvInput) === Number(selectedPv); const assigned = item.pvInput ? `${cfgName(item.inverterConfigId)} PV${item.pvInput}` : ''; return <label key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}><input type="checkbox" checked={checked} onChange={event => onToggleString(item.id, event.target.checked)} /><span>{item.name}</span>{assigned && !checked && <span className="text-xs text-muted-foreground">{assigned}</span>}</label>; })}</div></div></div>;
}

export default function StringMarkingTabV7({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const saved = readStored(project);
  const layout = useMemo(() => parseLayout(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => base44.entities.Product.list('-created_date') });
  const panels = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
  const inverters = products.filter(product => product.category === 'vaxelriktare' && product.is_active !== false);
  const initialInverters = (Array.isArray(saved.inverterConfigs) && saved.inverterConfigs.length ? saved.inverterConfigs : [{ productId: saved.inverterProductId || '' }]).map((cfg, index) => makeInverterConfig(index, cfg));
  const firstInverterId = initialInverters[0]?.id || '';

  const [inverterConfigs, setInverterConfigs] = useState(initialInverters);
  const [activeInverterId, setActiveInverterIdState] = useState(saved.selectedInverterConfigId || saved.strings?.[0]?.inverterConfigId || firstInverterId);
  const [fallbackPanelId, setFallbackPanelIdState] = useState(saved.panelProductId || selectedProductProp?.id || '');
  const [count, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, index) => makeString(index, saved.strings?.[index], firstInverterId)));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [selectedMppt, setSelectedMpptState] = useState(Number(saved.selectedMppt || strings[0]?.mppt || 1));
  const [selectedPv, setSelectedPvState] = useState(Number(saved.selectedPv || strings[0]?.pvInput || 1));
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');
  const [settings, setSettingsState] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20, roofTiltDeg: saved.settings?.roofTiltDeg ?? 27, roofAzimuthDeg: saved.settings?.roofAzimuthDeg ?? 180 });

  const fallbackPanelProduct = selectedProductProp?.id === fallbackPanelId ? selectedProductProp : panels.find(product => product.id === fallbackPanelId) || selectedProductProp || null;
  const activeInverterConfig = inverterConfigs.find(cfg => cfg.id === activeInverterId) || inverterConfigs[0];
  const activeInverterProduct = inverterProductForConfig(activeInverterConfig, inverters);
  const topology = inverterTopology(activeInverterProduct);
  const pvInputs = pvInputsForMppt(selectedMppt, topology);
  const selectedPvNumber = pvInputs.includes(Number(selectedPv)) ? Number(selectedPv) : pvInputs[0];
  const map = useMemo(() => buildMap(layout, panels, fallbackPanelProduct), [layout, panels, fallbackPanelProduct]);
  const active = strings.find(item => item.id === activeId) || strings[0];
  const activePanelProduct = panelProductForString(active, map, panels, fallbackPanelProduct);
  const activePanelCount = countPanels(active?.nodes || []) || active?.panel_count || 0;

  const buildPayload = (nextStrings = strings, overrides = {}) => {
    const nextConfigs = overrides.inverterConfigs ?? inverterConfigs;
    const normalizedStrings = nextStrings.map(item => {
      const panelProduct = panelProductForString(item, map, panels, fallbackPanelProduct);
      const invCfg = nextConfigs.find(cfg => cfg.id === item.inverterConfigId);
      const inverterProduct = inverterProductForConfig(invCfg, inverters);
      return recountString({ ...item, panelProductId: productData(panelProduct)?.id || item.panelProductId || '', panelProductSnapshot: item.panelProductSnapshot || snapshotProduct(panelProduct), inverterProductId: productData(inverterProduct)?.id || item.inverterProductId || '', inverterProductSnapshot: item.inverterProductSnapshot || snapshotProduct(inverterProduct) });
    });
    return { version: 12, source: layout.source, panelProductMode: 'manual_panel_click_snapshot', stringCount: overrides.stringCount ?? count, panelProductId: overrides.panelProductId ?? fallbackPanelId, inverterProductId: productData(activeInverterProduct)?.id || '', inverterConfigs: nextConfigs.map(cfg => ({ ...cfg, productSnapshot: cfg.productSnapshot || snapshotProduct(inverterProductForConfig(cfg, inverters)) })), selectedInverterConfigId: overrides.selectedInverterConfigId ?? activeInverterId, selectedMppt: overrides.selectedMppt ?? selectedMppt, selectedPv: overrides.selectedPv ?? selectedPvNumber, settings: overrides.settings ?? settings, savedAt: new Date().toISOString(), autosave: true, strings: normalizedStrings, pvTopology: normalizedStrings.map(item => ({ stringId: item.id, name: item.name, inverterConfigId: item.inverterConfigId || '', mppt: item.mppt || '', pvInput: item.pvInput || '', panelGroupId: item.panelGroupId || '', panelProductId: item.panelProductId || '', panelCount: countPanels(item.nodes || []) || item.panel_count || 0 })) };
  };

  const persist = async (nextStrings = strings, overrides = {}) => {
    const payload = buildPayload(nextStrings, overrides);
    writeStringBackup(project?.id, payload);
    setSaving(true);
    setSaveInfo('Sparar...');
    try { await onUpdate?.({ string_layout_data: JSON.stringify(payload) }); setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`); }
    catch (error) { setSaveInfo('Lokal backup sparad. Servern svarade inte.'); throw error; }
    finally { setSaving(false); }
  };

  const replaceStrings = (nextStrings, overrides = {}) => { const normalized = nextStrings.map(recountString); setStrings(normalized); persist(normalized, overrides).catch(() => {}); };
  const patchString = (stringId, patch) => replaceStrings(strings.map(item => item.id === stringId ? recountString({ ...item, ...patch }) : item));
  const patchActiveString = patch => active?.id && patchString(active.id, patch);

  const setActiveInverterId = id => {
    setActiveInverterIdState(id);
    const product = inverterProductForConfig(inverterConfigs.find(cfg => cfg.id === id), inverters);
    const t = inverterTopology(product);
    const firstPv = pvInputsForMppt(1, t)[0];
    setSelectedMpptState(1);
    setSelectedPvState(firstPv);
    persist(strings, { selectedInverterConfigId: id, selectedMppt: 1, selectedPv: firstPv }).catch(() => {});
  };

  const updateInverterProduct = (configId, productId) => {
    const product = inverters.find(item => item.id === productId);
    const nextConfigs = inverterConfigs.map(cfg => cfg.id === configId ? { ...cfg, productId, productSnapshot: snapshotProduct(product) } : cfg);
    setInverterConfigs(nextConfigs);
    setActiveInverterIdState(configId);
    const t = inverterTopology(product);
    const firstPv = pvInputsForMppt(1, t)[0];
    setSelectedMpptState(1);
    setSelectedPvState(firstPv);
    const nextStrings = strings.map(item => item.inverterConfigId === configId ? { ...item, inverterProductId: productId, inverterProductSnapshot: snapshotProduct(product), mppt: 1, pvInput: firstPv } : item);
    replaceStrings(nextStrings, { inverterConfigs: nextConfigs, selectedInverterConfigId: configId, selectedMppt: 1, selectedPv: firstPv });
  };

  const addInverter = () => {
    const cfg = makeInverterConfig(inverterConfigs.length, {});
    const nextConfigs = [...inverterConfigs, cfg];
    setInverterConfigs(nextConfigs);
    setActiveInverterIdState(cfg.id);
    setSelectedMpptState(1);
    setSelectedPvState(1);
    persist(strings, { inverterConfigs: nextConfigs, selectedInverterConfigId: cfg.id, selectedMppt: 1, selectedPv: 1 }).catch(() => {});
  };

  const removeInverter = id => {
    const nextConfigs = inverterConfigs.filter(cfg => cfg.id !== id);
    const fallback = nextConfigs[0]?.id || '';
    const nextStrings = strings.map(item => item.inverterConfigId === id ? { ...item, inverterConfigId: fallback, inverterProductId: '', inverterProductSnapshot: null, pvInput: '', mppt: 1 } : item);
    setInverterConfigs(nextConfigs);
    setActiveInverterIdState(fallback);
    replaceStrings(nextStrings, { inverterConfigs: nextConfigs, selectedInverterConfigId: fallback, selectedMppt: 1, selectedPv: 1 });
  };

  const setStringCount = value => {
    const nextCount = Math.max(1, Math.min(80, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, index) => makeString(index, strings[index], activeInverterId));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(item => item.id === activeId)) setActiveId(next[0]?.id || null);
    persist(next, { stringCount: nextCount }).catch(() => {});
  };

  const selectString = id => {
    setActiveId(id);
    const s = strings.find(item => item.id === id);
    if (s?.inverterConfigId) setActiveInverterIdState(s.inverterConfigId);
    if (s?.pvInput) setSelectedPv(s.pvInput);
    else if (s?.mppt) setSelectedMppt(s.mppt);
  };

  const setFallbackPanelId = value => { setFallbackPanelIdState(value); persist(strings, { panelProductId: value }).catch(() => {}); };
  const setSettings = nextSettings => { setSettingsState(nextSettings); persist(strings, { settings: nextSettings }).catch(() => {}); };
  const setSelectedMppt = value => { const nextMppt = Number(value) || 1; const firstPv = pvInputsForMppt(nextMppt, topology)[0]; setSelectedMpptState(nextMppt); setSelectedPvState(firstPv); persist(strings, { selectedMppt: nextMppt, selectedPv: firstPv }).catch(() => {}); };
  const setSelectedPv = value => { const pv = Number(value) || 1; const mppt = mpptFromPvInput(pv, topology); setSelectedPvState(pv); setSelectedMpptState(mppt); persist(strings, { selectedMppt: mppt, selectedPv: pv }).catch(() => {}); };

  const toggleStringOnPv = (stringId, checked) => {
    const invProduct = activeInverterProduct;
    const next = strings.map(item => item.id === stringId ? { ...item, inverterConfigId: checked ? activeInverterId : item.inverterConfigId, inverterProductId: checked ? productData(invProduct)?.id || '' : item.inverterProductId, inverterProductSnapshot: checked ? snapshotProduct(invProduct) : item.inverterProductSnapshot, mppt: checked ? selectedMppt : item.mppt, pvInput: checked ? selectedPvNumber : '' } : item);
    replaceStrings(next);
    if (checked) setActiveId(stringId);
  };

  const togglePanelForActiveString = panel => {
    if (!active?.id) return;
    const alreadyInActive = panelIds(active.nodes || []).has(panel.id);
    const group = map.panelGroups.find(item => item.id === panel.groupId);
    const panelProduct = panel.panelProductSnapshot || panel.panelProduct || group?.panelProductSnapshot || group?.panelProduct || activePanelProduct || fallbackPanelProduct;
    const invProduct = activeInverterProduct;
    const next = strings.map(item => {
      const base = { ...item, nodes: removePanelNodes(item.nodes || [], panel.id) };
      if (item.id !== active.id) return recountString(base);
      if (alreadyInActive) return recountString(base);
      return recountString({ ...base, inverterConfigId: activeInverterId, inverterProductId: productData(invProduct)?.id || '', inverterProductSnapshot: snapshotProduct(invProduct), panelGroupId: base.panelGroupId || panel.groupId, panelProductId: productData(panelProduct)?.id || '', panelProductSnapshot: snapshotProduct(panelProduct), nodes: [...base.nodes, ...nodesForPanel(panel)], mppt: selectedMppt, pvInput: selectedPvNumber });
    });
    replaceStrings(next);
  };

  const clearActiveString = () => patchActiveString({ nodes: [], panel_count: 0, panelGroupId: '', panelProductId: '', panelProductSnapshot: null, pvInput: '', mppt: selectedMppt });
  const mpptBranches = useMemo(() => strings.filter(item => item.inverterConfigId === activeInverterId && Number(item.mppt || mpptFromPvInput(item.pvInput, topology)) === Number(selectedMppt)).map(item => ({ groupId: item.id, label: `${item.name}${item.pvInput ? ` · PV${item.pvInput}` : ''}`, panelCount: countPanels(item.nodes || []) || item.panel_count || 0, stringId: item.id, pvInput: item.pvInput || '', panelProduct: panelProductForString(item, map, panels, fallbackPanelProduct) })).filter(branch => branch.panelCount > 0), [strings, activeInverterId, selectedMppt, topology, map, panels, fallbackPanelProduct]);
  const result = simulateMppt(activeInverterProduct, mpptBranches, settings);
  const activePanelMissing = missingPanelFields(activePanelProduct);
  const invMissing = missingInvFields(activeInverterProduct);
  const hasMissing = activePanelMissing.length > 0 || invMissing.length > 0;
  const visibleStrings = strings.filter(item => !item.inverterConfigId || item.inverterConfigId === activeInverterId);

  if (!map.panels.length) {
    return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i projektets flik Paneler först.</div></CardContent></Card>;
  }

  return <div className="space-y-4"><Card className="border-0 shadow-sm"><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Välj antal slingor, välj aktiv slinga, MPPT och PV-ingång. Klicka sedan direkt på de paneler som ska ingå i just den slingan.</p></div><div className="flex flex-col items-end gap-2"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button>{saveInfo && <span className="text-xs text-muted-foreground">{saving ? 'Sparar...' : saveInfo}</span>}</div></div></CardHeader><CardContent className="space-y-4">
    <StringCountControl count={count} strings={strings} activeId={activeId} onChangeCount={setStringCount} onSelectString={selectString} />
    <div className="grid gap-3 lg:grid-cols-2"><ProductSearchSelect label="Reservsolpanel om tak saknar val" products={panels} value={fallbackPanelId} onChange={setFallbackPanelId} placeholder="Sök/välj solpanel" /><Select label="Aktiv slinga" value={activeId || ''} onChange={selectString}>{strings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Aktiv slinga: <b>{active?.name}</b>. Klicka en panel för att lägga till den. Klicka samma panel igen för att ta bort den. Om panelen redan låg i en annan slinga flyttas den hit så den inte dubbelräknas.</div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Aktiv slinga använder solpanel: <b>{productLabel(activePanelProduct)}</b>. Beräkningen använder sparad panel-snapshot när den finns.</div>
    <InverterManager configs={inverterConfigs} inverters={inverters} activeId={activeInverterId} setActiveId={setActiveInverterId} updateProduct={updateInverterProduct} addInverter={addInverter} removeInverter={removeInverter} />
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Vald växelriktare: <b>{activeInverterConfig?.name}</b>. Produkt/topologidata ger <b>{topology.mpptCount} MPPT</b> och <b>{topology.totalPv} PV-ingångar</b>. PV/MPPT: <b>{topology.counts.join(' / ')}</b>. Källa: {topology.source}.</div>
    <div className="grid gap-3 lg:grid-cols-2"><Select label="MPPT-ingång" value={selectedMppt} onChange={setSelectedMppt}>{topology.mppts.map(item => <option key={item.mppt} value={item.mppt}>MPPT {item.mppt}</option>)}</Select><Select label="PV-ingång" value={selectedPvNumber} onChange={setSelectedPv}>{pvInputs.map(pv => <option key={pv} value={pv}>PV {pv}</option>)}</Select></div>
    <PvInputPanel selectedPv={selectedPvNumber} setSelectedPv={setSelectedPv} pvInputs={pvInputs} strings={strings} activeInverterId={activeInverterId} configs={inverterConfigs} onToggleString={toggleStringOnPv} />
    <div className="grid gap-3 lg:grid-cols-5"><Select label="Väder" value={settings.weather} onChange={value => setSettings({ ...settings, weather: value })}>{Object.keys(WEATHER).map(item => <option key={item}>{item}</option>)}</Select><Select label="Tid" value={settings.timeOfDay} onChange={value => setSettings({ ...settings, timeOfDay: value })}>{Object.keys(TIME).map(item => <option key={item}>{item}</option>)}</Select><Input label="Temperatur °C" value={settings.ambientTemperatureC} onChange={value => setSettings({ ...settings, ambientTemperatureC: Number(value) })} /><Input label="Taklutning °" value={settings.roofTiltDeg} onChange={value => setSettings({ ...settings, roofTiltDeg: Number(value) })} /><Input label="Azimut °" value={settings.roofAzimuthDeg} onChange={value => setSettings({ ...settings, roofAzimuthDeg: Number(value) })} /></div>
    <Canvas map={map} strings={visibleStrings} activeId={activeId} activeString={active} onClickPanel={togglePanelForActiveString} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv slinga: <b>{active?.name}</b> · {activeInverterConfig?.name} · PV{active?.pvInput || selectedPvNumber || '-'} · MPPT {active?.mppt || selectedMppt} · {activePanelCount || 0} paneler · <b>{productLabel(activePanelProduct)}</b></div><div className="flex gap-2"><Button variant="outline" className="text-red-600" onClick={clearActiveString}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={() => persist(strings).catch(() => {})} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button></div></div>
  </CardContent></Card>
  <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" />Beräkning för {activeInverterConfig?.name} · MPPT {selectedMppt}</CardTitle></CardHeader><CardContent className="space-y-4">{hasMissing && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Produktdata saknas för aktiv slinga/växelriktare: {[...activePanelMissing, ...invMissing].join(', ')}.</div>}{result ? <><div className="flex flex-wrap items-center gap-2"><Badge className={result.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{result.status === 'OK' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{result.status}</Badge><span className="text-sm text-muted-foreground">{activeInverterConfig?.name} · MPPT {selectedMppt} · {result.branchCount} slinga/slingor</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Effekt" value={round(result.power / 1000, 2)} unit="kW" /><Metric label="Vmp-intervall" value={`${round(result.vmpMin, 1)}-${round(result.vmpMax, 1)}`} unit="V" /><Metric label="Imp total" value={round(result.current, 2)} unit="A" /><Metric label="Isc total" value={round(result.isc, 2)} unit="A" /></div><div className="grid gap-2 lg:grid-cols-2">{result.checks.map(check => <CheckRow key={check.label} check={check} />)}</div><div className="rounded-xl border bg-background p-3"><div className="mb-2 text-sm font-semibold">Slingor som ingår</div><div className="grid gap-2 lg:grid-cols-2">{result.branchValues.map(branch => <div key={branch.groupId} className="rounded-lg border border-border p-3 text-sm"><div className="font-semibold text-foreground">{branch.label}</div><div className="text-xs text-muted-foreground">{productLabel(branch.panelProduct)} · {branch.panelCount} paneler i serie · Voc {round(branch.voc, 1)} V · Vmp {round(branch.vmp, 1)} V · Imp {round(branch.imp, 2)} A · Isc {round(branch.isc, 2)} A · Effekt {round(branch.power / 1000, 2)} kW</div></div>)}</div></div></> : <div className="rounded-xl border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">Välj antal slingor, välj aktiv slinga och klicka paneler för att få beräkning.</div>}</CardContent></Card></div>;
}
