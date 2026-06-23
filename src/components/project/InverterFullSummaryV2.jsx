import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { normalizeStringProductContext, resolveContextProduct } from '@/lib/stringProductContext';

const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;

function firstNumber(obj, keys, fallback = 0) {
  for (const key of keys) if (pos(obj?.[key], 0)) return pos(obj[key], fallback);
  return fallback;
}

function parseNumberList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(item => Math.max(0, Math.round(num(item)))).filter(Boolean);
  if (typeof value === 'object') return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => Math.max(0, Math.round(num(value[key])))).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;,|/ ]+/).map(item => Math.max(0, Math.round(num(item)))).filter(Boolean);
  return [];
}

function distribute(total, count) {
  const safeCount = Math.max(1, Math.round(pos(count, 1)));
  const safeTotal = Math.max(safeCount, Math.round(pos(total, safeCount)));
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal % safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function inverterTopology(product) {
  const mpptCount = Math.max(1, Math.round(firstNumber(product, ['mppt_count', 'mpptCount', 'number_of_mppt', 'number_of_mppts', 'mppts', 'mppt_inputs', 'tracker_count', 'mpp_tracker_count'], 1)));
  const explicitCounts = parseNumberList(product?.pv_inputs_per_mppt || product?.mppt_input_counts || product?.pv_per_mppt || product?.dc_inputs_per_mppt || product?.string_inputs_per_mppt_map || product?.mppt_pv_inputs || product?.mppt_string_inputs);
  const totalPv = firstNumber(product, ['total_pv_inputs', 'pv_input_count', 'pv_inputs_count', 'pv_inputs', 'dc_input_count', 'dc_inputs', 'total_dc_inputs', 'string_input_count', 'string_inputs', 'total_strings', 'input_count', 'inputs_total'], 0);
  const uniform = firstNumber(product, ['pv_inputs_per_mppt_count', 'inputs_per_mppt', 'dc_inputs_each_mppt', 'strings_per_mppt'], 0);

  let counts;
  let source;
  if (explicitCounts.length) {
    counts = Array.from({ length: mpptCount }, (_, index) => explicitCounts[index] || explicitCounts[explicitCounts.length - 1] || 1);
    source = 'produktdata per MPPT';
  } else if (uniform > 0) {
    counts = Array.from({ length: mpptCount }, () => Math.max(1, Math.round(uniform)));
    source = 'strängar per MPPT';
  } else if (totalPv > 0) {
    counts = distribute(totalPv, mpptCount);
    source = 'totalt antal PV-ingångar';
  } else {
    counts = Array.from({ length: mpptCount }, () => 1);
    source = 'ofullständig produktdata';
  }

  let pv = 1;
  const mppts = counts.map((count, index) => ({
    mppt: index + 1,
    pvInputs: Array.from({ length: Math.max(1, Math.round(count)) }, () => pv++),
  }));

  return { mpptCount, counts, totalPv: pv - 1, mppts, source };
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Ej vald växelriktare';
}

function countPanels(nodes) {
  return new Set((nodes || []).map(node => node.panelId).filter(Boolean)).size;
}

function panelSpecs(product) {
  if (!product) return null;
  return {
    pmax: pos(product.power_watts),
    voc: pos(product.voc_v),
    vmp: pos(product.vmp_v),
    isc: pos(product.isc_a),
    imp: pos(product.imp_a),
    pcoef: num(product.temp_coeff_pmax_percent_c, -0.35),
    vcoef: num(product.temp_coeff_voc_percent_c, -0.27),
    icoef: num(product.temp_coeff_isc_percent_c, 0.05),
    noct: pos(product.noct_c, 45),
  };
}

function inverterSpecs(product) {
  if (!product) return null;
  const ac = pos(product.power_watts) / 1000;
  return {
    ac,
    maxdc: pos(product.max_dc_power_kw, ac * 1.5),
    maxv: pos(product.max_dc_voltage_v),
    start: pos(product.startup_voltage_v),
    mpptmin: pos(product.mppt_voltage_min_v),
    mpptmax: pos(product.mppt_voltage_max_v),
    maxa: pos(product.max_input_current_a),
    maxisc: pos(product.max_short_circuit_current_a),
  };
}

function branchElectrical(panel, panelCount, settings) {
  const irradiance = 1000 * (WEATHER[settings?.weather] ?? 1) * (TIME[settings?.timeOfDay] ?? 1);
  const cellTemperature = num(settings?.ambientTemperatureC, 20) + ((panel.noct - 20) / 800) * irradiance;
  const panelPower = panel.pmax * (irradiance / 1000) * (1 + ((cellTemperature - 25) * panel.pcoef) / 100);
  return {
    voc: panel.voc * (1 + ((cellTemperature - 25) * panel.vcoef) / 100) * panelCount,
    vmp: panel.vmp * (1 + ((cellTemperature - 25) * panel.vcoef) / 100) * panelCount,
    imp: panel.imp,
    isc: panel.isc * (1 + ((cellTemperature - 25) * panel.icoef) / 100),
    power: panelPower * panelCount,
  };
}

function calculateMppt(products, fallbackPanel, inverterProduct, strings, settings) {
  const inverter = inverterSpecs(inverterProduct);
  const usable = strings.filter(item => (countPanels(item.nodes) || Number(item.panel_count) || 0) > 0);
  if (!inverter || !usable.length) return null;

  const branches = usable.map(item => {
    const panelProduct = resolveContextProduct(products, item.panelProductId, item.panelProductSnapshot) || fallbackPanel;
    const panel = panelSpecs(panelProduct);
    const panelCount = countPanels(item.nodes) || Number(item.panel_count) || 0;
    if (!panel || !panelCount) return null;
    return {
      ...item,
      panelProduct,
      panelCount,
      ...branchElectrical(panel, panelCount, settings),
    };
  }).filter(Boolean);

  if (!branches.length) return null;

  const totalImp = branches.reduce((sum, item) => sum + item.imp, 0);
  const totalIsc = branches.reduce((sum, item) => sum + item.isc, 0);
  const totalPower = branches.reduce((sum, item) => sum + item.power, 0);
  const maxVoc = Math.max(...branches.map(item => item.voc));
  const minVmp = Math.min(...branches.map(item => item.vmp));
  const maxVmp = Math.max(...branches.map(item => item.vmp));
  const checks = [];
  if (inverter.maxv > 0) checks.push(maxVoc <= inverter.maxv);
  if (inverter.start > 0) checks.push(minVmp >= inverter.start);
  if (inverter.mpptmin > 0 && inverter.mpptmax > 0) checks.push(minVmp >= inverter.mpptmin && maxVmp <= inverter.mpptmax);
  if (inverter.maxa > 0) checks.push(totalImp <= inverter.maxa);
  if (inverter.maxisc > 0) checks.push(totalIsc <= inverter.maxisc);
  if (inverter.maxdc > 0) checks.push(totalPower / 1000 <= inverter.maxdc);

  return {
    ok: checks.length > 0 && checks.every(Boolean),
    hasLimits: checks.length > 0,
    branches,
    stringCount: branches.length,
    panelCount: branches.reduce((sum, item) => sum + item.panelCount, 0),
    powerKw: totalPower / 1000,
    imp: totalImp,
    isc: totalIsc,
    maxVoc,
    minVmp,
    maxVmp,
  };
}

function StatusBadge({ ok, hasData }) {
  if (!hasData) return <Badge variant="outline">Ingen data</Badge>;
  return <Badge className={ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{ok ? 'OK' : 'Kontrollera'}</Badge>;
}

function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

export default function InverterFullSummaryV2({ project, products = [] }) {
  const context = useMemo(() => normalizeStringProductContext(project, products), [project?.string_layout_data, project?.solar_roof_planner_data, project?.panel_layout_data, products]);
  const data = context.data;
  const strings = Array.isArray(data?.strings) ? data.strings : [];
  const fallbackPanel = resolveContextProduct(context.products, data?.panelProductId, data?.panelProductSnapshot) || context.products.find(product => product.category === 'solpanel');
  const inverterConfigs = Array.isArray(data?.inverterConfigs) && data.inverterConfigs.length ? data.inverterConfigs : [];

  if (!data || !strings.length || !inverterConfigs.length) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Hela växelriktaren</CardTitle>
        <p className="text-sm text-muted-foreground">Visar alla MPPT och PV-ingångar på växelriktaren, inte bara vald MPPT.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {inverterConfigs.map(config => {
          const inverterProduct = resolveContextProduct(context.products, config.productId, config.productSnapshot);
          const topology = inverterTopology(inverterProduct);
          const inverterStrings = strings.filter(item => !item.inverterConfigId || String(item.inverterConfigId) === String(config.id));
          const mpptRows = topology.mppts.map(mppt => {
            const mpptStrings = inverterStrings.filter(item => Number(item.mppt) === Number(mppt.mppt));
            return {
              ...mppt,
              strings: mpptStrings,
              calculation: calculateMppt(context.products, fallbackPanel, inverterProduct, mpptStrings, data.settings || {}),
            };
          });
          const activeRows = mpptRows.filter(row => row.calculation);
          const totalPower = activeRows.reduce((sum, row) => sum + row.calculation.powerKw, 0);
          const totalPanels = activeRows.reduce((sum, row) => sum + row.calculation.panelCount, 0);
          const totalStrings = activeRows.reduce((sum, row) => sum + row.calculation.stringCount, 0);
          const allOk = activeRows.length > 0 && activeRows.every(row => row.calculation.ok);
          const hasSelectedProduct = Boolean(inverterProduct);

          return (
            <div key={config.id} className="space-y-4 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{config.name}</div>
                  <div className="text-sm text-muted-foreground">{productLabel(inverterProduct)} · {topology.mpptCount} MPPT · {topology.totalPv} PV · PV/MPPT: {topology.counts.join(' / ')} · källa: {topology.source}</div>
                </div>
                <StatusBadge ok={allOk} hasData={activeRows.length > 0} />
              </div>

              {!hasSelectedProduct && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Den sparade växelriktaren kunde inte hittas. Välj produkten igen i Slingor.</div>}
              {hasSelectedProduct && topology.source === 'ofullständig produktdata' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Växelriktaren är vald, men antal MPPT/PV-ingångar saknas i produktens tekniska data.</div>}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Total effekt" value={round(totalPower, 2)} unit="kW" />
                <Metric label="Paneler" value={totalPanels} unit="st" />
                <Metric label="Slingor" value={totalStrings} unit="st" />
                <Metric label="Aktiva MPPT" value={activeRows.length} unit={`av ${topology.mpptCount}`} />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {mpptRows.map(row => (
                  <div key={row.mppt} className="rounded-xl border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-bold">MPPT {row.mppt}</div>
                      <StatusBadge ok={row.calculation?.ok} hasData={Boolean(row.calculation)} />
                    </div>
                    <div className="mb-2 text-xs text-muted-foreground">PV-ingångar: {row.pvInputs.map(pv => `PV${pv}`).join(', ')}</div>
                    {row.calculation ? (
                      <div className="space-y-1 text-sm">
                        <div><b>Effekt:</b> {round(row.calculation.powerKw, 2)} kW</div>
                        <div><b>Vmp:</b> {round(row.calculation.minVmp, 1)}–{round(row.calculation.maxVmp, 1)} V</div>
                        <div><b>Imp:</b> {round(row.calculation.imp, 2)} A</div>
                        <div><b>Isc:</b> {round(row.calculation.isc, 2)} A</div>
                        <div><b>PV-ingångar:</b> {row.calculation.branches.map(branch => `PV${branch.pvInput || '?'} (${branch.panelCount} paneler)`).join(', ')}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Ingen panelsträng kopplad till denna MPPT.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
