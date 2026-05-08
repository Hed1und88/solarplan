import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudRain, Cpu, Info, PanelTop, Sun, ThermometerSun, Zap } from 'lucide-react';

const PANEL_MODELS = [
  {
    id: 'ja-solar-jam60d41-500-lb',
    brand: 'JA Solar',
    model: 'JAM60D41-500/LB',
    pmax_w: 500,
    voc_v: 45.59,
    vmp_v: 38.35,
    isc_a: 13.93,
    imp_a: 13.04,
    temp_coeff_pmax_percent_c: -0.30,
    temp_coeff_voc_percent_c: -0.25,
    temp_coeff_isc_percent_c: 0.046,
    noct_c: 45,
    module_length_mm: 1953,
    module_width_mm: 1134,
    bifacial: true,
  },
  {
    id: 'longi-lr5-72hbd-550m',
    brand: 'Longi',
    model: 'LR5-72HBD-550M',
    pmax_w: 550,
    voc_v: 49.8,
    vmp_v: 41.95,
    isc_a: 13.98,
    imp_a: 13.12,
    temp_coeff_pmax_percent_c: -0.35,
    temp_coeff_voc_percent_c: -0.27,
    temp_coeff_isc_percent_c: 0.05,
    noct_c: 45,
    module_length_mm: 2278,
    module_width_mm: 1134,
    bifacial: true,
  },
  {
    id: 'bluesun-bsm560m10-72hph',
    brand: 'Bluesun',
    model: 'BSM560M10-72HPH',
    pmax_w: 560,
    voc_v: 50.2,
    vmp_v: 42.2,
    isc_a: 14.1,
    imp_a: 13.27,
    temp_coeff_pmax_percent_c: -0.35,
    temp_coeff_voc_percent_c: -0.28,
    temp_coeff_isc_percent_c: 0.05,
    noct_c: 45,
    module_length_mm: 2279,
    module_width_mm: 1134,
    bifacial: false,
  },
];

const INVERTER_MODELS = [
  {
    id: 'solax-x3-hybrid-15-g4',
    brand: 'SolaX',
    model: 'X3-Hybrid-15.0-D G4',
    type: 'Hybrid',
    ac_power_kw: 15,
    max_dc_power_kw: 22.5,
    max_dc_voltage_v: 1000,
    startup_voltage_v: 180,
    mppt_voltage_min_v: 160,
    mppt_voltage_max_v: 950,
    nominal_dc_voltage_v: 640,
    mppt_count: 2,
    strings_per_mppt: 1,
    max_input_current_a: 16,
    max_short_circuit_current_a: 20,
    battery_supported: true,
    phase_type: '3-fas',
  },
  {
    id: 'solax-x3-mega-60-g2',
    brand: 'SolaX',
    model: 'X3-MEGA-60K-G2',
    type: 'String',
    ac_power_kw: 60,
    max_dc_power_kw: 90,
    max_dc_voltage_v: 1100,
    startup_voltage_v: 200,
    mppt_voltage_min_v: 180,
    mppt_voltage_max_v: 1000,
    nominal_dc_voltage_v: 620,
    mppt_count: 6,
    strings_per_mppt: 2,
    max_input_current_a: 32,
    max_short_circuit_current_a: 40,
    battery_supported: false,
    phase_type: '3-fas',
  },
  {
    id: 'growatt-mod-10ktl3-xh',
    brand: 'Growatt',
    model: 'MOD 10KTL3-XH',
    type: 'Hybrid-ready',
    ac_power_kw: 10,
    max_dc_power_kw: 15,
    max_dc_voltage_v: 1100,
    startup_voltage_v: 160,
    mppt_voltage_min_v: 140,
    mppt_voltage_max_v: 1000,
    nominal_dc_voltage_v: 580,
    mppt_count: 2,
    strings_per_mppt: 1,
    max_input_current_a: 16,
    max_short_circuit_current_a: 20,
    battery_supported: true,
    phase_type: '3-fas',
  },
];

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

function round(value, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function statusClass(status) {
  if (status === 'OK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'Varning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
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

function Select({ children, ...props }) {
  return <select {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:ring-4">{children}</select>;
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
  const dcAcRatio = stringPower / 1000 / inverter.ac_power_kw;
  const maxDcRatio = stringPower / 1000 / inverter.max_dc_power_kw;

  const checks = [
    checkLimit(
      'Max DC-spänning',
      stringVoc <= inverter.max_dc_voltage_v,
      stringVoc > inverter.max_dc_voltage_v * 0.92,
      'Slingans Voc ligger under växelriktarens maxgräns.',
      'Slingans Voc ligger nära växelriktarens maxgräns. Kontrollera kallaste dimensionerande temperatur.',
      'Slingans Voc överstiger växelriktarens max DC-spänning.'
    ),
    checkLimit(
      'MPPT-område',
      stringVmp >= inverter.mppt_voltage_min_v && stringVmp <= inverter.mppt_voltage_max_v,
      stringVmp < inverter.mppt_voltage_min_v * 1.08 || stringVmp > inverter.mppt_voltage_max_v * 0.92,
      'Slingans Vmp ligger inom MPPT-området.',
      'Slingans Vmp ligger nära kanten av MPPT-området.',
      'Slingans Vmp ligger utanför växelriktarens MPPT-område.'
    ),
    checkLimit(
      'Startspänning',
      stringVmp >= inverter.startup_voltage_v,
      stringVmp < inverter.startup_voltage_v * 1.15,
      'Slingans Vmp ligger över startspänningen.',
      'Slingans Vmp ligger nära startspänningen. Svag drift kan förekomma vid dåligt väder.',
      'Slingans Vmp ligger under växelriktarens startspänning.'
    ),
    checkLimit(
      'MPPT-ström',
      stringCurrent <= inverter.max_input_current_a,
      stringCurrent > inverter.max_input_current_a * 0.9,
      'Stringströmmen ligger under tillåten MPPT-ström.',
      'Stringströmmen ligger nära växelriktarens tillåtna MPPT-ström.',
      'Stringströmmen är högre än tillåten MPPT-ström.'
    ),
    checkLimit(
      'Kortslutningsström',
      shortCircuitCurrent <= inverter.max_short_circuit_current_a,
      shortCircuitCurrent > inverter.max_short_circuit_current_a * 0.9,
      'Kortslutningsströmmen ligger under växelriktarens gräns.',
      'Kortslutningsströmmen ligger nära växelriktarens maxgräns.',
      'Kortslutningsströmmen är högre än växelriktarens tillåtna gräns.'
    ),
    checkLimit(
      'DC-effekt',
      stringPower / 1000 <= inverter.max_dc_power_kw,
      maxDcRatio > 0.9,
      'DC-effekten ligger inom växelriktarens max DC-effekt.',
      'DC-effekten är hög i förhållande till växelriktarens max DC-effekt.',
      'DC-effekten överstiger växelriktarens max DC-effekt.'
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
  const [panelId, setPanelId] = useState(PANEL_MODELS[0].id);
  const [inverterId, setInverterId] = useState(INVERTER_MODELS[0].id);
  const [mpptNumber, setMpptNumber] = useState(1);
  const [panelsInSeries, setPanelsInSeries] = useState(14);
  const [parallelStrings, setParallelStrings] = useState(1);
  const [weather, setWeather] = useState('Soligt');
  const [timeOfDay, setTimeOfDay] = useState('12:00');
  const [ambientTemperatureC, setAmbientTemperatureC] = useState(20);
  const [roofTiltDeg, setRoofTiltDeg] = useState(27);
  const [roofAzimuthDeg, setRoofAzimuthDeg] = useState(180);

  const panel = useMemo(() => PANEL_MODELS.find((item) => item.id === panelId) || PANEL_MODELS[0], [panelId]);
  const inverter = useMemo(() => INVERTER_MODELS.find((item) => item.id === inverterId) || INVERTER_MODELS[0], [inverterId]);
  const simulation = useMemo(() => calculateSimulation({
    panel,
    inverter,
    panelsInSeries: number(panelsInSeries, 1),
    parallelStrings: number(parallelStrings, 1),
    weather,
    timeOfDay,
    ambientTemperatureC: number(ambientTemperatureC, 20),
  }), [panel, inverter, panelsInSeries, parallelStrings, weather, timeOfDay, ambientTemperatureC]);

  const WeatherIcon = WEATHER_FACTORS[weather]?.icon || Sun;
  const selectedMppt = Math.min(number(mpptNumber, 1), inverter.mppt_count);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Avancerad slingberäkning</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Panel + växelriktare + väder + temperatur</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Simulerar faktisk drift utifrån vald panelmodell, växelriktarens MPPT-gränser, tid på dygnet, väderläge och utomhustemperatur.
          </p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${statusClass(simulation.status)}`}>
          Status: {simulation.status}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Panelmodell">
              <Select value={panelId} onChange={(event) => setPanelId(event.target.value)}>
                {PANEL_MODELS.map((item) => <option key={item.id} value={item.id}>{item.brand} {item.model}</option>)}
              </Select>
            </Field>
            <Field label="Växelriktare">
              <Select value={inverterId} onChange={(event) => { setInverterId(event.target.value); setMpptNumber(1); }}>
                {INVERTER_MODELS.map((item) => <option key={item.id} value={item.id}>{item.brand} {item.model}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="MPPT-ingång">
              <Select value={selectedMppt} onChange={(event) => setMpptNumber(Number(event.target.value))}>
                {Array.from({ length: inverter.mppt_count }, (_, index) => <option key={index + 1} value={index + 1}>MPPT {index + 1}</option>)}
              </Select>
            </Field>
            <Field label="Paneler i serie">
              <Input type="number" min="1" max="40" value={panelsInSeries} onChange={(event) => setPanelsInSeries(Number(event.target.value))} />
            </Field>
            <Field label="Parallella slingor">
              <Input type="number" min="1" max={inverter.strings_per_mppt} value={parallelStrings} onChange={(event) => setParallelStrings(Number(event.target.value))} />
            </Field>
            <Field label="Utomhustemperatur °C">
              <Input type="number" step="1" value={ambientTemperatureC} onChange={(event) => setAmbientTemperatureC(Number(event.target.value))} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Tid på dygnet">
              <Select value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)}>
                {Object.keys(TIME_FACTORS).map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Väderläge">
              <Select value={weather} onChange={(event) => setWeather(event.target.value)}>
                {Object.keys(WEATHER_FACTORS).map((item) => <option key={item} value={item}>{item}</option>)}
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
              <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                <span>Pmax</span><b className="text-right text-slate-900">{panel.pmax_w} W</b>
                <span>Voc / Vmp</span><b className="text-right text-slate-900">{panel.voc_v} / {panel.vmp_v} V</b>
                <span>Isc / Imp</span><b className="text-right text-slate-900">{panel.isc_a} / {panel.imp_a} A</b>
                <span>Temp Pmax</span><b className="text-right text-slate-900">{panel.temp_coeff_pmax_percent_c} %/°C</b>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-black text-slate-900"><Cpu className="h-4 w-4 text-violet-600" />Växelriktardata</div>
              <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                <span>MPPT</span><b className="text-right text-slate-900">{inverter.mppt_count} st</b>
                <span>MPPT-område</span><b className="text-right text-slate-900">{inverter.mppt_voltage_min_v}-{inverter.mppt_voltage_max_v} V</b>
                <span>Max DC</span><b className="text-right text-slate-900">{inverter.max_dc_voltage_v} V</b>
                <span>Max ström</span><b className="text-right text-slate-900">{inverter.max_input_current_a} A</b>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
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
              <div className="mb-1 flex items-center gap-2 font-black text-slate-900"><Info className="h-4 w-4" />Nästa steg</div>
              Taklutning och azimut är sparade i formuläret och kan kopplas till solhöjdsmodell i nästa version.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
