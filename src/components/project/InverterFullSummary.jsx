import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react';

const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pos = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const json = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };

function firstNumber(obj, keys, fallback = 0) {
  for (const key of keys) if (pos(obj?.[key], 0)) return pos(obj[key], fallback);
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

function inverterTopology(product) {
  const modelText = `${product?.brand || ''} ${product?.name || ''} ${product?.model || ''}`.toLowerCase();
  const isAforeBnt50 = modelText.includes('afore') && (modelText.includes('bnt50ktl') || modelText.includes('bnt 50ktl') || modelText.includes('bnt050ktl'));

  if (isAforeBnt50) {
    return {
      mpptCount: 3,
      counts: [2, 2, 3],
      totalPv: 7,
      mppts: [
        { mppt: 1, pvInputs: [1, 2] },
        { mppt: 2, pvInputs: [3, 4] },
        { mppt: 3, pvInputs: [5, 6, 7] },
      ],
      source: 'modellregel Afore BNT50KTL',
    };
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
    if (uniformRaw > 3 && mpptCount > 1) {
      counts = distributeExtraToLast(uniformRaw, mpptCount);
      source = 'strings_per_mppt tolkat som totalt antal PV-ingångar';
    } else {
      counts = Array.from({ length: mpptCount }, () => Math.max(1, Math.round(uniformRaw)));
      source = 'strings_per_mppt';
    }
  } else {
    counts = Array.from({ length: mpptCount }, () => 2);
    source = 'standardvärde';
  }

  let pv = 1;
  const mppts = counts.map((count, index) => {
    const pvInputs = Array.from({ length: Math.max(1, Math.round(count)) }, () => pv++);
    return { mppt: index + 1, pvInputs };
  });

  return { mpptCount, counts, totalPv: pv - 1, mppts, source };
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Ej vald växelriktare';
}

function countPanels(nodes) {
  return new Set((nodes || []).map(node => node.panelId)).size;
}

function panelSpecs(panelProduct) {
  return panelProduct && {
    pmax: pos(panelProduct.power_watts),
    voc: pos(panelProduct.voc_v),
    vmp: pos(panelProduct.vmp_v),
    isc: pos(panelProduct.isc_a),
    imp: pos(panelProduct.imp_a),
    pcoef: num(panelProduct.temp_coeff_pmax_percent_c, -0.35),
    vcoef: num(panelProduct.temp_coeff_voc_percent_c, -0.27),
    icoef: num(panelProduct.temp_coeff_isc_percent_c, 0.05),
    noct: pos(panelProduct.noct_c, 45),
  };
}

function inverterSpecs(inverterProduct) {
  const ac = pos(inverterProduct?.power_watts) / 1000;
  return inverterProduct && {
    ac,
    maxdc: pos(inverterProduct.max_dc_power_kw, ac * 1.5),
    maxv: pos(inverterProduct.max_dc_voltage_v),
    start: pos(inverterProduct.startup_voltage_v),
    mpptmin: pos(inverterProduct.mppt_voltage_min_v),
    mpptmax: pos(inverterProduct.mppt_voltage_max_v),
    maxa: pos(inverterProduct.max_input_current_a),
    maxisc: pos(inverterProduct.max_short_circuit_current_a),
  };
}

function branchElectrical(panel, panelCount, settings) {
  const irradiance = 1000 * (WEATHER[settings?.weather] ?? 1) * (TIME[settings?.timeOfDay] ?? 1);
  const cell = num(settings?.ambientTemperatureC, 20) + ((panel.noct - 20) / 800) * irradiance;
  const panelPower = panel.pmax * (irradiance / 1000) * (1 + ((cell - 25) * panel.pcoef) / 100);

  return {
    voc: panel.voc * (1 + ((cell - 25) * panel.vcoef) / 100) * panelCount,
    vmp: panel.vmp * (1 + ((cell - 25) * panel.vcoef) / 100) * panelCount,
    imp: panel.imp,
    isc: panel.isc * (1 + ((cell - 25) * panel.icoef) / 100),
    power: panelPower * panelCount,
  };
}

function calculateMppt(panelProduct, inverterProduct, strings, settings) {
  const panel = panelSpecs(panelProduct);
  const inverter = inverterSpecs(inverterProduct);
  const usable = strings.filter(item => (countPanels(item.nodes) || item.panel_count || 0) > 0);
  if (!panel || !inverter || !usable.length) return null;

  const branches = usable.map(item => {
    const panelCount = countPanels(item.nodes) || item.panel_count || 0;
    return {
      ...item,
      panelCount,
      ...branchElectrical(panel, panelCount, settings),
    };
  });

  const totalImp = branches.reduce((sum, item) => sum + item.imp, 0);
  const totalIsc = branches.reduce((sum, item) => sum + item.isc, 0);
  const totalPower = branches.reduce((sum, item) => sum + item.power, 0);
  const maxVoc = Math.max(...branches.map(item => item.voc));
  const minVmp = Math.min(...branches.map(item => item.vmp));
  const maxVmp = Math.max(...branches.map(item => item.vmp));
  const pvUsed = [...new Set(branches.map(item => item.pvInput).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const checks = [
    inverter.maxv > 0 && maxVoc <= inverter.maxv,
    inverter.start > 0 && minVmp >= inverter.start,
    inverter.mpptmin > 0 && inverter.mpptmax > 0 && minVmp >= inverter.mpptmin && maxVmp <= inverter.mpptmax,
    inverter.maxa > 0 && totalImp <= inverter.maxa,
    inverter.maxisc > 0 && totalIsc <= inverter.maxisc,
    inverter.maxdc > 0 && totalPower / 1000 <= inverter.maxdc,
  ];

  return {
    ok: checks.every(Boolean),
    branches,
    stringCount: branches.length,
    panelCount: branches.reduce((sum, item) => sum + item.panelCount, 0),
    powerKw: totalPower / 1000,
    imp: totalImp,
    isc: totalIsc,
    maxVoc,
    minVmp,
    maxVmp,
    pvUsed,
  };
}

function StatusBadge({ ok, hasData }) {
  if (!hasData) return <Badge variant="outline">Ingen data</Badge>;
  return <Badge className={ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{ok ? 'OK' : 'Kontrollera'}</Badge>;
}

function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

export default function InverterFullSummary({ project, products = [] }) {
  const data = useMemo(() => json(project?.string_layout_data, null), [project?.string_layout_data]);
  const strings = Array.isArray(data?.strings) ? data.strings : [];
  const panelProduct = products.find(product => product.id === data?.panelProductId) || products.find(product => product.category === 'solpanel');
  const inverterConfigs = Array.isArray(data?.inverterConfigs) && data.inverterConfigs.length
    ? data.inverterConfigs
    : [{ id: 'default-inverter', name: 'Växelriktare 1', productId: data?.inverterProductId || '' }];

  if (!data || !strings.length) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Hela växelriktaren</CardTitle>
        <p className="text-sm text-muted-foreground">Visar alla MPPT och PV-ingångar på växelriktaren, inte bara vald MPPT.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {inverterConfigs.map(config => {
          const inverterProduct = products.find(product => product.id === config.productId);
          const topology = inverterTopology(inverterProduct);
          const inverterStrings = strings.filter(item => !item.inverterConfigId || item.inverterConfigId === config.id);
          const mpptRows = topology.mppts.map(mppt => {
            const mpptStrings = inverterStrings.filter(item => Number(item.mppt) === Number(mppt.mppt));
            return { ...mppt, calculation: calculateMppt(panelProduct, inverterProduct, mpptStrings, data.settings || {}), strings: mpptStrings };
          });
          const activeRows = mpptRows.filter(row => row.calculation);
          const totalPower = activeRows.reduce((sum, row) => sum + row.calculation.powerKw, 0);
          const totalPanels = activeRows.reduce((sum, row) => sum + row.calculation.panelCount, 0);
          const totalStrings = activeRows.reduce((sum, row) => sum + row.calculation.stringCount, 0);
          const allOk = activeRows.length > 0 && activeRows.every(row => row.calculation.ok);

          return (
            <div key={config.id} className="rounded-2xl border p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{config.name}</div>
                  <div className="text-sm text-muted-foreground">{productLabel(inverterProduct)} · {topology.mpptCount} MPPT · {topology.totalPv} PV · PV/MPPT: {topology.counts.join(' / ')} · källa: {topology.source}</div>
                </div>
                <StatusBadge ok={allOk} hasData={activeRows.length > 0} />
              </div>

              {!inverterProduct && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Välj växelriktarprodukt för att visa full beräkning.</div>}

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
                    <div className="text-xs text-muted-foreground mb-2">PV-ingångar: {row.pvInputs.map(pv => `PV${pv}`).join(', ')}</div>
                    {row.calculation ? (
                      <div className="space-y-1 text-sm">
                        <div><b>Effekt:</b> {round(row.calculation.powerKw, 2)} kW</div>
                        <div><b>Vmp:</b> {round(row.calculation.minVmp, 1)}-{round(row.calculation.maxVmp, 1)} V</div>
                        <div><b>Imp:</b> {round(row.calculation.imp, 2)} A</div>
                        <div><b>Isc:</b> {round(row.calculation.isc, 2)} A</div>
                        <div><b>Slingor:</b> {row.calculation.branches.map(branch => `${branch.name}${branch.pvInput ? ` PV${branch.pvInput}` : ''}`).join(', ')}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Ingen slinga kopplad till denna MPPT.</div>
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
