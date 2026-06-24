import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, CloudRain, Cpu, Info, Loader2, PanelTop, RefreshCw, Sun, ThermometerSun, Zap } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const WEATHER_FACTORS = {
  Soligt: { factor: 1, icon: Sun, description: 'Klar himmel och hög instrålning.' },
  'Lätta moln': { factor: 0.7, icon: Sun, description: 'Reducerad instrålning, normal svensk sommardag.' },
  Molnigt: { factor: 0.35, icon: CloudRain, description: 'Låg instrålning, panelerna producerar men långt från STC.' },
  Regn: { factor: 0.15, icon: CloudRain, description: 'Mycket låg instrålning och svag MPPT-drift.' },
};

const TIME_FACTORS = {
  '06:00': 0.15,
  '08:00': 0.45,
  '10:00': 0.75,
  '12:00': 1,
  '14:00': 0.8,
  '16:00': 0.5,
  '18:00': 0.2,
  '20:00': 0.05,
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback = 0) {
  const parsed = number(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function round(value, decimals = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const multiplier = 10 ** decimals;
  return Math.round(parsed * multiplier) / multiplier;
}

function statusClass(status) {
  if (status === 'OK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'Varning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
}

function productLabel(product) {
  return [product.brand, product.model].filter(Boolean).join(' ') || product.name || 'Namnlös produkt';
}

function mapPanelProduct(product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    model: product.model || product.name || '',
    pmax_w: positiveNumber(product.power_watts, 0),
    voc_v: positiveNumber(product.voc_v, 0),
    vmp_v: positiveNumber(product.vmp_v, 0),
    isc_a: positiveNumber(product.isc_a, 0),
    imp_a: positiveNumber(product.imp_a, 0),
    temp_coeff_pmax_percent_c: number(product.temp_coeff_pmax_percent_c, -0.35),
    temp_coeff_voc_percent_c: number(product.temp_coeff_voc_percent_c, -0.27),
    temp_coeff_isc_percent_c: number(product.temp_coeff_isc_percent_c, 0.05),
    noct_c: positiveNumber(product.noct_c, 45),
    module_length_mm: positiveNumber(product.height_mm, 0),
    module_width_mm: positiveNumber(product.width_mm, 0),
    bifacial: Boolean(product.bifacial),
    raw: product,
  };
}

function mapInverterProduct(product) {
  const acPowerKw = positiveNumber(product.power_watts, 0) / 1000;
  return {
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    model: product.model || product.name || '',
    type: product.inverter_type || product.type || '',
    ac_power_kw: acPowerKw,
    max_dc_power_kw: positiveNumber(product.max_dc_power_kw, acPowerKw * 1.5),
    max_dc_voltage_v: positiveNumber(product.max_dc_voltage_v, 0),
    startup_voltage_v: positiveNumber(product.startup_voltage_v, 0),
    mppt_voltage_min_v: positiveNumber(product.mppt_voltage_min_v, 0),
    mppt_voltage_max_v: positiveNumber(product.mppt_voltage_max_v, 0),
    nominal_dc_voltage_v: positiveNumber(product.nominal_dc_voltage_v, 0),
    mppt_count: Math.max(1, Math.round(positiveNumber(product.mppt_count, 1))),
    strings_per_mppt: Math.max(1, Math.round(positiveNumber(product.strings_per_mppt, 1))),
    max_input_current_a: positiveNumber(product.max_input_current_a, 0),
    max_short_circuit_current_a: positiveNumber(product.max_short_circuit_current_a, 0),
    battery_supported: Boolean(product.battery_supported),
    phase_type: product.phase_type || '',
    raw: product,
  };
}

function validatePanel(panel) {
  if (!panel) return ['Välj en solpanel från produktsortimentet.'];
  const warnings = [];
  if (!panel.pmax_w) warnings.push('Panelen saknar effekt i Product.power_watts.');
  if (!panel.voc_v) warnings.push('Panelen saknar Voc.');
  if (!panel.vmp_v) warnings.push('Panelen saknar Vmp.');
  if (!panel.isc_a) warnings.push('Panelen saknar Isc.');
  if (!panel.imp_a) warnings.push('Panelen saknar Imp.');
  return warnings;
}

function validateInverter(inverter) {
  if (!inverter) return ['Välj en växelriktare från produktsortimentet.'];
  const warnings = [];
  if (!inverter.ac_power_kw) warnings.push('Växelriktaren saknar nominell AC-effekt i Product.power_watts.');
  if (!inverter.max_dc_power_kw) warnings.push('Växelriktaren saknar max DC-effekt.');
  if (!inverter.max_dc_voltage_v) warnings.push('Växelriktaren saknar max DC-spänning.');
  if (!inverter.startup_voltage_v) warnings.push('Växelriktaren saknar startspänning.');
  if (!inverter.mppt_voltage_min_v || !inverter.mppt_voltage_max_v) warnings.push('Växelriktaren saknar komplett MPPT-spänningsområde.');
  if (!inverter.max_input_current_a) warnings.push('Växelriktaren saknar max ingångsström.');
  if (!inverter.max_short_circuit_current_a) warnings.push('Växelriktaren saknar max kortslutningsström.');
  return warnings;
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input(props) {
  return <input {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:ring-4" />;
}

function Metric({ label, value, unit, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}<span className="ml-1 text-sm font-bold text-slate-500">{unit}</span></div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function checkLimit(label, ok, warning, okText, warningText, failText) {
  if (!ok) return { label, status: 'Ej godkänd', text: failText };
  if (warning) return { label, status: 'Varning', text: warningText };
  return { label, status: 'OK', text: okText };
}

function calculateSimulation({ panel, inverter, panelsInSeries, parallelStrings, weather, timeOfDay, ambientTemperatureC }) {
  const weatherFactor = WEATHER_FACTORS[weather]?.factor ?? 1;
  const timeFactor = TIME_FACTORS[timeOfDay] ?? 1;
  const effectiveIrradiance = 1000 * weatherFactor * timeFactor;
  const cellTemperature = number(ambientTemperatureC, 20) + ((panel.noct_c - 20) / 800) * effectiveIrradiance;

  const temperaturePowerFactor = 1 + ((cellTemperature - 25) * panel.temp_coeff_pmax_percent_c) / 100;
  const irradianceFactor = effectiveIrradiance / 1000;
  const panelPower = panel.pmax_w * irradianceFactor * temperaturePowerFactor;

  const adjustedVoc = panel.voc_v * (1 + ((cellTemperature - 25) * panel.temp_coeff_voc_percent_c) / 100);
  const adjustedVmp = panel.vmp_v * (1 + ((cellTemperature - 25) * panel.temp_coeff_voc_percent_c) / 100);
  const adjustedIsc = panel.isc_a * (1 + ((cellTemperature - 25) * panel.temp_coeff_isc_percent_c) / 100);

  const stringVoc = adjustedVoc * panelsInSeries;
  const stringVmp = adjustedVmp * panelsInSeries;
  const stringCurrent = panel.imp_a * parallelStrings;
  const shortCircuitCurrent = adjustedIsc * parallelStrings;
  const stringPower = panelPower * panelsInSeries * parallelStrings;
  const dcAcRatio = inverter.ac_power_kw > 0 ? stringPower / 1000 / inverter.ac_power_kw : 0;
  const maxDcRatio = inverter.max_dc_power_kw > 0 ? stringPower / 1000 / inverter.max_dc_power_kw : 0;

  const checks = [
    checkLimit(
      'Max DC-spänning',
      inverter.max_dc_voltage_v > 0 && stringVoc <= inverter.max_dc_voltage_v,
      inverter.max_dc_voltage_v > 0 && stringVoc > inverter.max_dc_voltage_v * 0.92,
      'Slingans Voc ligger under växelriktarens maxgräns.',
      'Slingans Voc ligger nära växelriktarens maxgräns. Kontrollera kallaste dimensionerande temperatur.',
      inverter.max_dc_voltage_v > 0 ? 'Slingans Voc överstiger växelriktarens max DC-spänning.' : 'Växelriktaren saknar max DC-spänning.'
    ),
    checkLimit(
      'MPPT-område',
      inverter.mppt_voltage_min_v > 0 && inverter.mppt_voltage_max_v > 0 && stringVmp >= inverter.mppt_voltage_min_v && stringVmp <= inverter.mppt_voltage_max_v,
      inverter.mppt_voltage_min_v > 0 && inverter.mppt_voltage_max_v > 0 && (stringVmp < inverter.mppt_voltage_min_v * 1.08 || stringVmp > inverter.mppt_voltage_max_v * 0.92),
      'Slingans Vmp ligger inom MPPT-området.',
      'Slingans Vmp ligger nära kanten av MPPT-området.',
      inverter.mppt_voltage_min_v > 0 && inverter.mppt_voltage_max_v > 0 ? 'Slingans Vmp ligger utanför växelriktarens MPPT-område.' : 'Växelriktaren saknar komplett MPPT-område.'
    ),
    checkLimit(
      'Startspänning',
      inverter.startup_voltage_v > 0 && stringVmp >= inverter.startup_voltage_v,
      inverter.startup_voltage_v > 0 && stringVmp < inverter.startup_voltage_v * 1.15,
      'Slingans Vmp ligger över startspänningen.',
      'Slingans Vmp ligger nära startspänningen. Svag drift kan förekomma vid dåligt väder.',
      inverter.startup_voltage_v > 0 ? 'Slingans Vmp ligger under växelriktarens startspänning.' : 'Växelriktaren saknar startspänning.'
    ),
    checkLimit(
      'MPPT-ström',
      inverter.max_input_current_a > 0 && stringCurrent <= inverter.max_input_current_a,
      inverter.max_input_current_a > 0 && stringCurrent > inverter.max_input_current_a * 0.9,
      'Stringströmmen ligger under tillåten MPPT-ström.',
      'Stringströmmen ligger nära växelriktarens tillåtna MPPT-ström.',
      inverter.max_input_current_a > 0 ? 'Stringströmmen är högre än tillåten MPPT-ström.' : 'Växelriktaren saknar max ingångsström.'
    ),
    checkLimit(
      'Kortslutningsström',
      inverter.max_short_circuit_current_a > 0 && shortCircuitCurrent <= inverter.max_short_circuit_current_a,
      inverter.max_short_circuit_current_a > 0 && shortCircuitCurrent > inverter.max_short_circuit_current_a * 0.9,
      'Kortslutningsströmmen ligger under växelriktarens gräns.',
      'Kortslutningsströmmen ligger nära växelriktarens maxgräns.',
      inverter.max_short_circuit_current_a > 0 ? 'Kortslutningsströmmen är högre än växelriktarens tillåtna gräns.' : 'Växelriktaren saknar max kortslutningsström.'
    ),
    checkLimit(
      'DC-effekt',
      inverter.max_dc_power_kw > 0 && stringPower / 1000 <= inverter.max_dc_power_kw,
      inverter.max_dc_power_kw > 0 && maxDcRatio > 0.9,
      'DC-effekten ligger inom växelriktarens max DC-effekt.',
      'DC-effekten är hög i förhållande till växelriktarens max DC-effekt.',
      inverter.max_dc_power_kw > 0 ? 'DC-effekten överstiger växelriktarens max DC-effekt.' : 'Växelriktaren saknar max DC-effekt.'
    ),
  ];

  const hasFail = checks.some((check) => check.status === 'Ej godkänd');
  const hasWarning = checks.some((check) => check.status === 'Varning');

  return {
    status: hasFail ? 'Ej godkänd' : hasWarning ? 'Varning' : 'OK',
    weatherFactor,
    timeFactor,
    effectiveIrradiance,
    cellTemperature,
    temperaturePowerFactor,
    panelPower,
    adjustedVoc,
    adjustedVmp,
    adjustedIsc,
    stringVoc,
    stringVmp,
    stringCurrent,
    shortCircuitCurrent,
    stringPower,
    dcAcRatio,
    checks,
  };
}

export default function AdvancedStringCalculator() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [panelId, setPanelId] = useState('');
  const [inverterId, setInverterId] = useState('');
  const [mpptNumber, setMpptNumber] = useState(1);
  const [panelsInSeries, setPanelsInSeries] = useState(14);
  const [parallelStrings, setParallelStrings] = useState(1);
  const [weather, setWeather] = useState('Soligt');
  const [timeOfDay, setTimeOfDay] = useState('12:00');
  const [ambientTemperatureC, setAmbientTemperatureC] = useState(20);
  const [roofTiltDeg, setRoofTiltDeg] = useState(27);
  const [roofAzimuthDeg, setRoofAzimuthDeg] = useState(180);

  const loadProducts = async () => {
    setLoadingProducts(true);
    setLoadError(null);
    try {
      const data = await base44.entities.Product.list('-created_date');
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Could not load products', error);
      setLoadError('Kunde inte läsa produkter från Product-entity.');
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const panelProducts = useMemo(() => products.filter((product) => product.category === 'solpanel' && product.is_active !== false), [products]);
  const inverterProducts = useMemo(() => products.filter((product) => product.category === 'vaxelriktare' && product.is_active !== false), [products]);

  useEffect(() => {
    if (!panelId && panelProducts.length > 0) setPanelId(panelProducts[0].id);
  }, [panelId, panelProducts]);

  useEffect(() => {
    if (!inverterId && inverterProducts.length > 0) setInverterId(inverterProducts[0].id);
  }, [inverterId, inverterProducts]);

  const selectedPanelProduct = useMemo(() => panelProducts.find((product) => product.id === panelId) || null, [panelProducts, panelId]);
  const selectedInverterProduct = useMemo(() => inverterProducts.find((product) => product.id === inverterId) || null, [inverterProducts, inverterId]);
  const panel = useMemo(() => selectedPanelProduct ? mapPanelProduct(selectedPanelProduct) : null, [selectedPanelProduct]);
  const inverter = useMemo(() => selectedInverterProduct ? mapInverterProduct(selectedInverterProduct) : null, [selectedInverterProduct]);

  useEffect(() => {
    if (!inverter) return;
    setMpptNumber((value) => Math.min(Math.max(1, Number(value) || 1), inverter.mppt_count));
    setParallelStrings((value) => Math.min(Math.max(1, Number(value) || 1), inverter.strings_per_mppt));
  }, [inverter]);

  const dataWarnings = useMemo(() => [...validatePanel(panel), ...validateInverter(inverter)], [panel, inverter]);
  const canCalculate = panel && inverter && dataWarnings.length === 0;

  const simulation = useMemo(() => {
    if (!canCalculate) return null;
    return calculateSimulation({
      panel,
      inverter,
      panelsInSeries: Math.max(1, number(panelsInSeries, 1)),
      parallelStrings: Math.max(1, number(parallelStrings, 1)),
      weather,
      timeOfDay,
      ambientTemperatureC: number(ambientTemperatureC, 20),
    });
  }, [canCalculate, panel, inverter, panelsInSeries, parallelStrings, weather, timeOfDay, ambientTemperatureC]);

  const WeatherIcon = WEATHER_FACTORS[weather]?.icon || Sun;
  const selectedMppt = inverter ? Math.min(number(mpptNumber, 1), inverter.mppt_count) : 1;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Avancerad slingberäkning</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Panel + växelriktare + väder + temperatur</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Välj solpaneler och växelriktare direkt från produktsortimentet. Produkterna hämtas från Product-entity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={loadProducts} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Uppdatera produkter
          </button>
          <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${statusClass(simulation?.status || 'Ej godkänd')}`}>
            Status: {simulation?.status || 'Välj komplett produktdata'}
          </div>
        </div>
      </div>

      {loadingProducts && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Läser produkter från Product-entity...
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{loadError}</div>
      )}

      {!loadingProducts && (panelProducts.length === 0 || inverterProducts.length === 0) && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-black">Produktsortimentet saknar data för beräkningen.</div>
          <div className="mt-1">Du behöver minst en produkt med kategori <b>solpanel</b> och en produkt med kategori <b>vaxelriktare</b>.</div>
        </div>
      )}

      {dataWarnings.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 font-black">Komplettera produktdata för att beräkningen ska bli korrekt:</div>
          <ul className="list-disc space-y-1 pl-5">
            {dataWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Solpanel från produkter">
              <Select value={panelId} onValueChange={setPanelId} disabled={panelProducts.length === 0}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-emerald-500/20 focus:ring-4">
                  <SelectValue placeholder="Ingen solpanel hittad" />
                </SelectTrigger>
                <SelectContent>
                  {panelProducts.map((item) => <SelectItem key={item.id} value={item.id}>{productLabel(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Växelriktare från produkter">
              <Select value={inverterId} onValueChange={(value) => { setInverterId(value); setMpptNumber(1); }} disabled={inverterProducts.length === 0}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-emerald-500/20 focus:ring-4">
                  <SelectValue placeholder="Ingen växelriktare hittad" />
                </SelectTrigger>
                <SelectContent>
                  {inverterProducts.map((item) => <SelectItem key={item.id} value={item.id}>{productLabel(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="MPPT-ingång">
              <Select value={String(selectedMppt)} onValueChange={(value) => setMpptNumber(Number(value))} disabled={!inverter}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-emerald-500/20 focus:ring-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: inverter?.mppt_count || 1 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>MPPT {index + 1}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Paneler i serie">
              <Input type="number" min="1" max="40" value={panelsInSeries} onChange={(event) => setPanelsInSeries(Number(event.target.value))} />
            </Field>
            <Field label="Parallella slingor">
              <Input type="number" min="1" max={inverter?.strings_per_mppt || 20} value={parallelStrings} onChange={(event) => setParallelStrings(Number(event.target.value))} />
            </Field>
            <Field label="Utomhustemperatur °C">
              <Input type="number" step="1" value={ambientTemperatureC} onChange={(event) => setAmbientTemperatureC(Number(event.target.value))} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Tid på dygnet">
              <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-emerald-500/20 focus:ring-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(TIME_FACTORS).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Väderläge">
              <Select value={weather} onValueChange={setWeather}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-emerald-500/20 focus:ring-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(WEATHER_FACTORS).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Taklutning °">
              <Input type="number" min="0" max="75" value={roofTiltDeg} onChange={(event) => setRoofTiltDeg(Number(event.target.value))} />
            </Field>
            <Field label="Azimut °">
              <Input type="number" min="0" max="360" value={roofAzimuthDeg} onChange={(event) => setRoofAzimuthDeg(Number(event.target.value))} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-black text-slate-900"><PanelTop className="h-4 w-4 text-blue-600" />Paneldata</div>
              {panel ? (
                <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                  <span>Produkt</span><b className="text-right text-slate-900">{productLabel(selectedPanelProduct)}</b>
                  <span>Pmax</span><b className="text-right text-slate-900">{panel.pmax_w} W</b>
                  <span>Voc / Vmp</span><b className="text-right text-slate-900">{panel.voc_v} / {panel.vmp_v} V</b>
                  <span>Isc / Imp</span><b className="text-right text-slate-900">{panel.isc_a} / {panel.imp_a} A</b>
                  <span>Temp Pmax</span><b className="text-right text-slate-900">{panel.temp_coeff_pmax_percent_c} %/°C</b>
                </div>
              ) : <div className="text-slate-500">Ingen solpanel vald.</div>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-black text-slate-900"><Cpu className="h-4 w-4 text-violet-600" />Växelriktardata</div>
              {inverter ? (
                <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                  <span>Produkt</span><b className="text-right text-slate-900">{productLabel(selectedInverterProduct)}</b>
                  <span>MPPT</span><b className="text-right text-slate-900">{inverter.mppt_count} st</b>
                  <span>MPPT-område</span><b className="text-right text-slate-900">{inverter.mppt_voltage_min_v}-{inverter.mppt_voltage_max_v} V</b>
                  <span>Max DC</span><b className="text-right text-slate-900">{inverter.max_dc_voltage_v} V</b>
                  <span>Max ström</span><b className="text-right text-slate-900">{inverter.max_input_current_a} A</b>
                </div>
              ) : <div className="text-slate-500">Ingen växelriktare vald.</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {simulation ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Effektiv instrålning" value={round(simulation.effectiveIrradiance, 0)} unit="W/m²" sub={`${weather} · faktor ${simulation.weatherFactor}`} />
                <Metric label="Celltemperatur" value={round(simulation.cellTemperature, 1)} unit="°C" sub={`Ute ${ambientTemperatureC} °C · NOCT ${panel.noct_c} °C`} />
                <Metric label="Effekt per panel" value={round(simulation.panelPower, 0)} unit="W" sub={`${round(simulation.temperaturePowerFactor * 100, 1)} % tempfaktor`} />
                <Metric label="Stringeffekt" value={round(simulation.stringPower / 1000, 2)} unit="kW" sub={`DC/AC ${round(simulation.dcAcRatio * 100, 0)} %`} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="String Vmp" value={round(simulation.stringVmp, 1)} unit="V" sub="Driftspänning" />
                <Metric label="String Voc" value={round(simulation.stringVoc, 1)} unit="V" sub="Öppen kretsspänning" />
                <Metric label="Stringström" value={round(simulation.stringCurrent, 2)} unit="A" sub={`${parallelStrings} parallell(a) slinga/slingor`} />
                <Metric label="Kortslutningsström" value={round(simulation.shortCircuitCurrent, 2)} unit="A" sub="Isc temperaturjusterad" />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 font-black text-slate-950"><Zap className="h-5 w-5 text-emerald-600" />Teknisk kontroll mot växelriktare</div>
                <div className="space-y-2">
                  {simulation.checks.map((check) => (
                    <div key={check.label} className={`flex items-start gap-3 rounded-2xl border p-3 ${statusClass(check.status)}`}>
                      {check.status === 'OK' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
                      <div>
                        <div className="font-black">{check.label}: {check.status}</div>
                        <div className="text-sm opacity-90">{check.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              <div className="mb-2 flex items-center gap-2 font-black text-slate-950"><Info className="h-5 w-5 text-amber-600" />Ingen beräkning ännu</div>
              Välj en solpanel och en växelriktare från produktsortimentet med komplett teknisk data.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="mb-1 flex items-center gap-2 font-black text-slate-900"><WeatherIcon className="h-4 w-4" />Vädermodell</div>
              {WEATHER_FACTORS[weather]?.description}
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="mb-1 flex items-center gap-2 font-black text-slate-900"><ThermometerSun className="h-4 w-4" />Temperatur</div>
              Beräkningen använder celltemperatur, inte bara utomhustemperatur.
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="mb-1 flex items-center gap-2 font-black text-slate-900"><Info className="h-4 w-4" />Produktkoppling</div>
              Lägg till paneler och växelriktare under Produkter. De visas sedan här automatiskt.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}