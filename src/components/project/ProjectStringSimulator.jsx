import { useEffect, useMemo, useState } from 'react';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Cpu, Loader2, PanelTop, RefreshCw, Sun, CloudRain, Zap, Info } from 'lucide-react';

const WEATHER_FACTORS = {
  Soligt: { factor: 1, icon: Sun },
  'Lätta moln': { factor: 0.7, icon: Sun },
  Molnigt: { factor: 0.35, icon: CloudRain },
  Regn: { factor: 0.15, icon: CloudRain },
};

const TIME_FACTORS = {
  '06:00': 0.15, '08:00': 0.45, '10:00': 0.75,
  '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05,
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function pos(v, fallback = 0) {
  const n = num(v, fallback);
  return n > 0 ? n : fallback;
}
function r(v, d = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

function mapPanel(p) {
  return {
    id: p.id, name: p.name, brand: p.brand || '', model: p.model || p.name || '',
    pmax_w: pos(p.power_watts),
    voc_v: pos(p.voc_v), vmp_v: pos(p.vmp_v),
    isc_a: pos(p.isc_a), imp_a: pos(p.imp_a),
    temp_coeff_pmax: num(p.temp_coeff_pmax_percent_c, -0.35),
    temp_coeff_voc: num(p.temp_coeff_voc_percent_c, -0.27),
    temp_coeff_isc: num(p.temp_coeff_isc_percent_c, 0.05),
    noct_c: pos(p.noct_c, 45),
  };
}

function mapInverter(p) {
  const acKw = pos(p.power_watts) / 1000;
  return {
    id: p.id, name: p.name, brand: p.brand || '', model: p.model || p.name || '',
    ac_power_kw: acKw,
    max_dc_power_kw: pos(p.max_dc_power_kw, acKw * 1.5),
    max_dc_voltage_v: pos(p.max_dc_voltage_v),
    startup_voltage_v: pos(p.startup_voltage_v),
    mppt_min_v: pos(p.mppt_voltage_min_v),
    mppt_max_v: pos(p.mppt_voltage_max_v),
    mppt_count: Math.max(1, Math.round(pos(p.mppt_count, 1))),
    strings_per_mppt: Math.max(1, Math.round(pos(p.strings_per_mppt, 1))),
    max_input_current_a: pos(p.max_input_current_a),
    max_short_circuit_current_a: pos(p.max_short_circuit_current_a),
    phase_type: p.phase_type || '',
    inverter_type: p.inverter_type || '',
  };
}

function validatePanel(panel) {
  if (!panel) return ['Välj en solpanel.'];
  const w = [];
  if (!panel.pmax_w) w.push('Saknar effekt (power_watts)');
  if (!panel.voc_v) w.push('Saknar Voc');
  if (!panel.vmp_v) w.push('Saknar Vmp');
  if (!panel.isc_a) w.push('Saknar Isc');
  if (!panel.imp_a) w.push('Saknar Imp');
  return w;
}

function validateInverter(inv) {
  if (!inv) return ['Välj en växelriktare.'];
  const w = [];
  if (!inv.ac_power_kw) w.push('Saknar nominell AC-effekt');
  if (!inv.max_dc_voltage_v) w.push('Saknar max DC-spänning');
  if (!inv.startup_voltage_v) w.push('Saknar startspänning');
  if (!inv.mppt_min_v || !inv.mppt_max_v) w.push('Saknar MPPT-spänningsområde');
  if (!inv.max_input_current_a) w.push('Saknar max ingångsström');
  if (!inv.max_short_circuit_current_a) w.push('Saknar max kortslutningsström');
  return w;
}

function simulate({ panel, inverter, series, parallel, weather, timeOfDay, ambientC }) {
  const wFactor = WEATHER_FACTORS[weather]?.factor ?? 1;
  const tFactor = TIME_FACTORS[timeOfDay] ?? 1;
  const irr = 1000 * wFactor * tFactor;
  const cellT = num(ambientC, 20) + ((panel.noct_c - 20) / 800) * irr;

  const tempPFactor = 1 + ((cellT - 25) * panel.temp_coeff_pmax) / 100;
  const panelPower = panel.pmax_w * (irr / 1000) * tempPFactor;

  const adjVoc = panel.voc_v * (1 + ((cellT - 25) * panel.temp_coeff_voc) / 100);
  const adjVmp = panel.vmp_v * (1 + ((cellT - 25) * panel.temp_coeff_voc) / 100);
  const adjIsc = panel.isc_a * (1 + ((cellT - 25) * panel.temp_coeff_isc) / 100);

  const strVoc = adjVoc * series;
  const strVmp = adjVmp * series;
  const strCurrent = panel.imp_a * parallel;
  const strIsc = adjIsc * parallel;
  const strPower = panelPower * series * parallel;
  const dcAcRatio = inverter.ac_power_kw > 0 ? strPower / 1000 / inverter.ac_power_kw : 0;

  function chk(label, ok, warn, okTxt, warnTxt, failTxt) {
    if (!ok) return { label, status: 'Ej godkänd', text: failTxt };
    if (warn) return { label, status: 'Varning', text: warnTxt };
    return { label, status: 'OK', text: okTxt };
  }

  const checks = [
    chk('Max DC-spänning',
      inverter.max_dc_voltage_v > 0 && strVoc <= inverter.max_dc_voltage_v,
      inverter.max_dc_voltage_v > 0 && strVoc > inverter.max_dc_voltage_v * 0.92,
      'Voc under maxgräns.', 'Voc nära maxgräns — kontrollera lägsta temp.',
      inverter.max_dc_voltage_v > 0 ? 'Voc överstiger max DC-spänning!' : 'Saknar max DC-spänning.'
    ),
    chk('MPPT-område',
      inverter.mppt_min_v > 0 && inverter.mppt_max_v > 0 && strVmp >= inverter.mppt_min_v && strVmp <= inverter.mppt_max_v,
      inverter.mppt_min_v > 0 && inverter.mppt_max_v > 0 && (strVmp < inverter.mppt_min_v * 1.08 || strVmp > inverter.mppt_max_v * 0.92),
      'Vmp inom MPPT-området.', 'Vmp nära kanten av MPPT-området.',
      inverter.mppt_min_v > 0 ? 'Vmp utanför MPPT-området!' : 'Saknar MPPT-område.'
    ),
    chk('Startspänning',
      inverter.startup_voltage_v > 0 && strVmp >= inverter.startup_voltage_v,
      inverter.startup_voltage_v > 0 && strVmp < inverter.startup_voltage_v * 1.15,
      'Vmp över startspänning.', 'Vmp nära startspänning — svag drift vid dåligt väder.',
      inverter.startup_voltage_v > 0 ? 'Vmp under startspänning!' : 'Saknar startspänning.'
    ),
    chk('MPPT-ström',
      inverter.max_input_current_a > 0 && strCurrent <= inverter.max_input_current_a,
      inverter.max_input_current_a > 0 && strCurrent > inverter.max_input_current_a * 0.9,
      'Stringström under MPPT-gräns.', 'Stringström nära MPPT-gränsen.',
      inverter.max_input_current_a > 0 ? 'Stringström överstiger max MPPT-ström!' : 'Saknar max ingångsström.'
    ),
    chk('Kortslutningsström',
      inverter.max_short_circuit_current_a > 0 && strIsc <= inverter.max_short_circuit_current_a,
      inverter.max_short_circuit_current_a > 0 && strIsc > inverter.max_short_circuit_current_a * 0.9,
      'Kortslutningsström under gräns.', 'Kortslutningsström nära maxgränsen.',
      inverter.max_short_circuit_current_a > 0 ? 'Kortslutningsström överstiger gränsen!' : 'Saknar max kortslutningsström.'
    ),
    chk('DC-effekt',
      inverter.max_dc_power_kw > 0 && strPower / 1000 <= inverter.max_dc_power_kw,
      inverter.max_dc_power_kw > 0 && (strPower / 1000) / inverter.max_dc_power_kw > 0.9,
      'DC-effekt inom gräns.', 'DC-effekt hög relativt max DC-effekt.',
      inverter.max_dc_power_kw > 0 ? 'DC-effekt överstiger max DC-effekt!' : 'Saknar max DC-effekt.'
    ),
  ];

  const hasFail = checks.some(c => c.status === 'Ej godkänd');
  const hasWarn = checks.some(c => c.status === 'Varning');

  return {
    status: hasFail ? 'Ej godkänd' : hasWarn ? 'Varning' : 'OK',
    irr, cellT, tempPFactor, panelPower,
    adjVoc, adjVmp, adjIsc,
    strVoc, strVmp, strCurrent, strIsc, strPower, dcAcRatio, checks,
  };
}

function statusCls(status) {
  if (status === 'OK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'Varning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
}

function Metric({ label, value, unit, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-black text-foreground">{value}<span className="ml-1 text-xs font-bold text-muted-foreground">{unit}</span></div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <span className="text-xs font-semibold text-muted-foreground block mb-1">{children}</span>;
}

function NativeSelect({ value, onChange, children, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
    >
      {children}
    </select>
  );
}

function NativeInput({ type = 'number', value, onChange, min, max, step, placeholder }) {
  return (
    <input
      type={type} value={value} min={min} max={max} step={step} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}

export default function ProjectStringSimulator({ project, onUpdate, preselectedPanelId }) {
  const { data: allProducts = [], isLoading, refetch } = useQuery({
    queryKey: ['products-for-simulator'],
    queryFn: () => listVisibleProducts(),
  });

  const panels = useMemo(() => allProducts.filter(p => p.category === 'solpanel' && p.is_active !== false), [allProducts]);
  const inverters = useMemo(() => allProducts.filter(p => p.category === 'vaxelriktare' && p.is_active !== false), [allProducts]);

  // Load saved sim state from project
  const saved = useMemo(() => {
    try {
      const d = JSON.parse(project?.string_layout_data || '{}');
      return d.sim || {};
    } catch { return {}; }
  }, [project?.string_layout_data]);

  const [panelId, setPanelId] = useState(saved.panelId || preselectedPanelId || '');
  const [inverterId, setInverterId] = useState(saved.inverterId || '');
  const [series, setSeries] = useState(saved.series || 14);
  const [parallel, setParallel] = useState(saved.parallel || 1);
  const [mppt, setMppt] = useState(saved.mppt || 1);
  const [weather, setWeather] = useState(saved.weather || 'Soligt');
  const [timeOfDay, setTimeOfDay] = useState(saved.timeOfDay || '12:00');
  const [ambientC, setAmbientC] = useState(saved.ambientC ?? 20);
  const [roofTilt, setRoofTilt] = useState(saved.roofTilt || 27);
  const [azimuth, setAzimuth] = useState(saved.azimuth || 180);

  // Auto-select first panel/inverter if none saved
  useEffect(() => {
    if (!panelId && panels.length > 0) setPanelId(preselectedPanelId || panels[0].id);
  }, [panels, preselectedPanelId]);

  useEffect(() => {
    if (!inverterId && inverters.length > 0) setInverterId(inverters[0].id);
  }, [inverters]);

  const panel = useMemo(() => {
    const p = panels.find(x => x.id === panelId);
    return p ? mapPanel(p) : null;
  }, [panels, panelId]);

  const inverter = useMemo(() => {
    const p = inverters.find(x => x.id === inverterId);
    return p ? mapInverter(p) : null;
  }, [inverters, inverterId]);

  // Clamp mppt/parallel when inverter changes
  useEffect(() => {
    if (!inverter) return;
    setMppt(v => Math.min(Math.max(1, Number(v) || 1), inverter.mppt_count));
    setParallel(v => Math.min(Math.max(1, Number(v) || 1), inverter.strings_per_mppt));
  }, [inverter]);

  const panelWarnings = useMemo(() => validatePanel(panel), [panel]);
  const inverterWarnings = useMemo(() => validateInverter(inverter), [inverter]);
  const warnings = useMemo(() => [...panelWarnings, ...inverterWarnings], [panelWarnings, inverterWarnings]);
  const canCalc = panel && inverter && warnings.length === 0;

  const sim = useMemo(() => {
    if (!canCalc) return null;
    return simulate({ panel, inverter, series: Math.max(1, num(series, 1)), parallel: Math.max(1, num(parallel, 1)), weather, timeOfDay, ambientC: num(ambientC, 20) });
  }, [canCalc, panel, inverter, series, parallel, weather, timeOfDay, ambientC]);

  // Save sim state into string_layout_data
  const saveSimState = () => {
    if (!onUpdate) return;
    try {
      const existing = JSON.parse(project?.string_layout_data || '{}');
      const merged = Array.isArray(existing)
        ? { panels: existing, sim: {} }
        : { ...existing };
      merged.sim = { panelId, inverterId, series, parallel, mppt, weather, timeOfDay, ambientC, roofTilt, azimuth };
      onUpdate({ string_layout_data: JSON.stringify(merged) });
    } catch { /* ignore */ }
  };

  const label = (p) => [p.brand, p.model].filter(Boolean).join(' ') || p.name;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Avancerad slingberäkning</p>
          <p className="text-sm text-muted-foreground mt-0.5">Välj panel och växelriktare — beräkning mot verkliga produktdata</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Uppdatera
          </button>
          {sim && (
            <div className={`rounded-xl border px-3 py-1.5 text-xs font-black ${statusCls(sim.status)}`}>
              {sim.status}
            </div>
          )}
          {!sim && !isLoading && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">
              Välj produkter
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Läser produkter...
          </div>
        )}

        {!isLoading && (panels.length === 0 || inverters.length === 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Produkter saknas.</strong> Lägg till minst en <b>solpanel</b> och en <b>växelriktare</b> under Produkter.
          </div>
        )}

        {warnings.length > 0 && panel && inverter && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-bold mb-1">Komplettera produktdata:</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {warnings.map(w => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Product selectors + config */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel><span className="flex items-center gap-1"><PanelTop className="h-3 w-3" /> Solpanel</span></FieldLabel>
            <NativeSelect value={panelId} onChange={setPanelId} disabled={panels.length === 0}>
              {panels.length === 0 && <option value="">Ingen hittad</option>}
              {panels.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel><span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> Växelriktare</span></FieldLabel>
            <NativeSelect value={inverterId} onChange={v => { setInverterId(v); setMppt(1); }} disabled={inverters.length === 0}>
              {inverters.length === 0 && <option value="">Ingen hittad</option>}
              {inverters.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>MPPT-ingång</FieldLabel>
            <NativeSelect value={mppt} onChange={v => setMppt(Number(v))} disabled={!inverter}>
              {Array.from({ length: inverter?.mppt_count || 1 }, (_, i) => (
                <option key={i + 1} value={i + 1}>MPPT {i + 1}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Parallella slingor</FieldLabel>
            <NativeInput value={parallel} onChange={v => setParallel(Number(v))} min={1} max={inverter?.strings_per_mppt || 20} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>Paneler i serie</FieldLabel>
            <NativeInput value={series} onChange={v => setSeries(Number(v))} min={1} max={40} />
          </div>
          <div>
            <FieldLabel>Utomhustemperatur °C</FieldLabel>
            <NativeInput value={ambientC} onChange={v => setAmbientC(Number(v))} step={1} />
          </div>
          <div>
            <FieldLabel>Taklutning °</FieldLabel>
            <NativeInput value={roofTilt} onChange={v => setRoofTilt(Number(v))} min={0} max={75} />
          </div>
          <div>
            <FieldLabel>Azimut °</FieldLabel>
            <NativeInput value={azimuth} onChange={v => setAzimuth(Number(v))} min={0} max={360} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Tid på dygnet</FieldLabel>
            <NativeSelect value={timeOfDay} onChange={setTimeOfDay}>
              {Object.keys(TIME_FACTORS).map(t => <option key={t} value={t}>{t}</option>)}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Väderläge</FieldLabel>
            <NativeSelect value={weather} onChange={setWeather}>
              {Object.keys(WEATHER_FACTORS).map(w => <option key={w} value={w}>{w}</option>)}
            </NativeSelect>
          </div>
        </div>

        {/* Spara-knapp */}
        <div className="flex justify-end">
          <button
            onClick={saveSimState}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Spara beräkningsinställningar
          </button>
        </div>

        {/* Product summary cards */}
        {(panel || inverter) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center gap-2 font-bold text-foreground mb-2"><PanelTop className="h-4 w-4 text-blue-500" />Paneldata</div>
              {panel ? (
                <div className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                  <span>Modell</span><b className="text-right text-foreground">{[panel.brand, panel.model].filter(Boolean).join(' ')}</b>
                  <span>Pmax</span><b className="text-right text-foreground">{panel.pmax_w} W</b>
                  <span>Voc / Vmp</span><b className="text-right text-foreground">{panel.voc_v} / {panel.vmp_v} V</b>
                  <span>Isc / Imp</span><b className="text-right text-foreground">{panel.isc_a} / {panel.imp_a} A</b>
                  <span>Temp Pmax</span><b className="text-right text-foreground">{panel.temp_coeff_pmax} %/°C</b>
                </div>
              ) : <p className="text-xs text-muted-foreground">Ingen panel vald.</p>}
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center gap-2 font-bold text-foreground mb-2"><Cpu className="h-4 w-4 text-violet-500" />Växelriktardata</div>
              {inverter ? (
                <div className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                  <span>Modell</span><b className="text-right text-foreground">{[inverter.brand, inverter.model].filter(Boolean).join(' ')}</b>
                  <span>MPPT-ingångar</span><b className="text-right text-foreground">{inverter.mppt_count} st</b>
                  <span>MPPT-område</span><b className="text-right text-foreground">{inverter.mppt_min_v}–{inverter.mppt_max_v} V</b>
                  <span>Max DC</span><b className="text-right text-foreground">{inverter.max_dc_voltage_v} V</b>
                  <span>Max ström / Isc</span><b className="text-right text-foreground">{inverter.max_input_current_a} / {inverter.max_short_circuit_current_a} A</b>
                </div>
              ) : <p className="text-xs text-muted-foreground">Ingen växelriktare vald.</p>}
            </div>
          </div>
        )}

        {/* Results */}
        {sim && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Instrålning" value={r(sim.irr, 0)} unit="W/m²" sub={weather} />
              <Metric label="Celltemperatur" value={r(sim.cellT, 1)} unit="°C" sub={`Ute ${ambientC} °C`} />
              <Metric label="Effekt per panel" value={r(sim.panelPower, 0)} unit="W" />
              <Metric label="Stringeffekt" value={r(sim.strPower / 1000, 2)} unit="kW" sub={`DC/AC ${r(sim.dcAcRatio * 100, 0)} %`} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="String Vmp" value={r(sim.strVmp, 1)} unit="V" sub="Driftspänning" />
              <Metric label="String Voc" value={r(sim.strVoc, 1)} unit="V" sub="Öppen krets" />
              <Metric label="Stringström (Imp)" value={r(sim.strCurrent, 2)} unit="A" />
              <Metric label="Kortslutningsström" value={r(sim.strIsc, 2)} unit="A" sub="Isc justerad" />
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 font-bold text-foreground mb-3"><Zap className="h-4 w-4 text-emerald-600" />Teknisk kontroll</div>
              <div className="space-y-2">
                {sim.checks.map(chk => (
                  <div key={chk.label} className={`flex items-start gap-3 rounded-xl border p-2.5 text-sm ${statusCls(chk.status)}`}>
                    {chk.status === 'OK'
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <div>
                      <span className="font-bold">{chk.label}: {chk.status}</span>
                      <span className="ml-2 text-xs opacity-80">{chk.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!sim && !isLoading && panel && inverter && warnings.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" /> Komplettera produktdata ovan för att köra beräkningen.
          </div>
        )}
      </div>
    </div>
  );
}
