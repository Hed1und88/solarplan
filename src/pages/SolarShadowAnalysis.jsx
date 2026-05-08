import { useMemo, useState } from 'react';
import { Sun, Save, RotateCcw, Download, Home, CloudSun, TreePine, Play } from 'lucide-react';
import { calculateSolarPosition, calculateWeatherFactor, calculateShadeLoss, calculatePvEstimate, generateHourlySimulation, annualFactorFromDate, clamp } from '@/lib/solarShadowEngine';

const initial = {
  projectName: 'Ny sol- och skugganalys',
  address: '',
  latitude: 59.3793,
  longitude: 13.5036,
  buildingLength: 12,
  buildingWidth: 8,
  buildingHeight: 5.2,
  roofPitch: 27,
  roofAzimuth: 180,
  panelKw: 12,
  panelRows: 3,
  panelColumns: 8,
  temperature: 18,
  cloudCover: 22,
  precipitation: 0,
  treeHeight: 9,
  treeDistance: 8,
  neighbourHeight: 7,
  neighbourDistance: 13,
  obstacles: { chimney: true, tree: true, neighbour: false }
};

const today = () => new Date().toISOString().slice(0, 10);

function NumberInput({ label, value, onChange, suffix = '', step = 1 }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-12 text-sm outline-none focus:border-primary" />
        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </label>
  );
}

function Stat({ title, value, text }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function VisualModel({ model, solar, shadeLoss }) {
  const shadowWidth = `${clamp(shadeLoss, 6, 92)}%`;
  const sunLeft = `${clamp((solar.azimuth / 360) * 100, 6, 94)}%`;
  const sunBottom = `${clamp(solar.altitude, 8, 80)}%`;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="font-semibold">3D-liknande fastighetsvy</h2>
        <p className="text-sm text-muted-foreground">Visar hus, tak, paneler, solposition, hinder och skuggzon.</p>
      </div>
      <div className="relative h-[430px] overflow-hidden bg-gradient-to-b from-sky-100 via-slate-50 to-emerald-100">
        <div className="absolute h-14 w-14 rounded-full bg-amber-300 shadow-xl shadow-amber-200" style={{ left: sunLeft, bottom: sunBottom }} />
        <div className="absolute bottom-16 left-1/2 h-24 w-64 -translate-x-1/2 bg-white shadow-xl" />
        <div className="absolute bottom-40 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[150px] border-r-[150px] border-b-[80px] border-l-transparent border-r-transparent border-b-slate-700" />
        <div className="absolute bottom-44 left-1/2 grid -translate-x-1/2 grid-cols-8 gap-1">
          {Array.from({ length: Number(model.panelRows) * Number(model.panelColumns) }).slice(0, 32).map((_, index) => (
            <div key={index} className="h-5 w-7 rounded-sm bg-slate-950 ring-1 ring-slate-600" />
          ))}
        </div>
        {model.obstacles.chimney && <div className="absolute bottom-48 left-[58%] h-16 w-8 bg-orange-800" />}
        {model.obstacles.tree && <><div className="absolute bottom-16 left-[16%] h-24 w-5 bg-amber-900" /><div className="absolute bottom-36 left-[11%] h-28 w-28 rounded-full bg-emerald-700" /></>}
        {model.obstacles.neighbour && <div className="absolute bottom-16 right-[10%] h-32 w-32 bg-slate-400 shadow-lg" />}
        <div className="absolute bottom-40 left-1/2 h-20 -translate-x-1/2 -skew-x-12 rounded-2xl bg-slate-950/35 blur-sm" style={{ width: shadowWidth }} />
        <div className="absolute bottom-4 left-4 rounded-2xl bg-white/85 p-3 text-xs shadow-sm">
          <b>Sol:</b> {Math.max(0, solar.altitude).toFixed(1)}° · <b>Azimut:</b> {solar.azimuth.toFixed(0)}° · <b>Skugga:</b> {shadeLoss.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

export default function SolarShadowAnalysis() {
  const [model, setModel] = useState(initial);
  const [date, setDate] = useState(today());
  const [hour, setHour] = useState(12);

  const set = (key, value) => setModel((current) => ({ ...current, [key]: value }));
  const setObstacle = (key, value) => setModel((current) => ({ ...current, obstacles: { ...current.obstacles, [key]: value } }));

  const time = `${String(hour).padStart(2, '0')}:00`;
  const solar = useMemo(() => calculateSolarPosition({ latitude: model.latitude, longitude: model.longitude, date, time }), [model.latitude, model.longitude, date, time]);
  const weatherFactor = useMemo(() => calculateWeatherFactor(model), [model]);
  const shadeLoss = useMemo(() => calculateShadeLoss({ solar, model }), [solar, model]);
  const estimate = useMemo(() => calculatePvEstimate({ solar, model, weatherFactor, shadeLoss }), [solar, model, weatherFactor, shadeLoss]);
  const simulation = useMemo(() => generateHourlySimulation({ model, date }), [model, date]);
  const dailyKwh = simulation.reduce((sum, row) => sum + row.productionKw, 0);
  const annualKwh = dailyKwh * 365 * annualFactorFromDate(date);

  const saveLocal = () => localStorage.setItem('solarplan_shadow_analysis_v1', JSON.stringify({ model, date, hour }));
  const reset = () => { setModel(initial); setDate(today()); setHour(12); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ model, date, hour, solar, weatherFactor, shadeLoss, estimate, simulation }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solarplan-skugganalys-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const buildingFields = [
    ['buildingLength', 'Längd', 'm'], ['buildingWidth', 'Bredd', 'm'], ['buildingHeight', 'Höjd', 'm'], ['roofPitch', 'Taklutning', '°'],
    ['roofAzimuth', 'Takazimut', '°'], ['panelKw', 'Effekt', 'kWp'], ['panelRows', 'Panelrader', 'st'], ['panelColumns', 'Panelkolumner', 'st']
  ];
  const weatherFields = [
    ['cloudCover', 'Molnighet', '%', 1], ['temperature', 'Temperatur', '°C', 1], ['precipitation', 'Nederbörd', 'mm/h', 0.1],
    ['treeHeight', 'Trädhöjd', 'm', 1], ['treeDistance', 'Trädavstånd', 'm', 1], ['neighbourHeight', 'Grannhöjd', 'm', 1]
  ];

  return (
    <div className="min-h-full bg-muted/30 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><Sun className="h-4 w-4" /> SolarPlan</div>
              <h1 className="text-2xl font-bold lg:text-3xl">3D Solanalys</h1>
              <p className="mt-2 text-sm text-muted-foreground">Fastighet, solbana, skuggning, väderpåverkan och uppskattad produktion.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveLocal} className="rounded-xl bg-primary px-4 py-2 text-sm text-white"><Save className="mr-2 inline h-4 w-4" />Spara</button>
              <button onClick={exportJson} className="rounded-xl border border-border px-4 py-2 text-sm"><Download className="mr-2 inline h-4 w-4" />Export</button>
              <button onClick={reset} className="rounded-xl border border-border px-4 py-2 text-sm"><RotateCcw className="mr-2 inline h-4 w-4" />Reset</button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Stat title="Solhöjd" value={`${Math.max(0, solar.altitude).toFixed(1)}°`} text={`Azimut ${solar.azimuth.toFixed(0)}°`} />
          <Stat title="Väderfaktor" value={`${(weatherFactor * 100).toFixed(0)}%`} text={`${model.cloudCover}% moln`} />
          <Stat title="Skuggförlust" value={`${shadeLoss.toFixed(0)}%`} text="Tak och hinder" />
          <Stat title="Effekt nu" value={`${estimate.productionKw.toFixed(1)} kW`} text={`${estimate.irradiance.toFixed(0)} W/m²`} />
          <Stat title="Dag" value={`${dailyKwh.toFixed(1)} kWh`} text="Timvis summering" />
          <Stat title="År" value={`${annualKwh.toFixed(0)} kWh`} text="Förenklat estimat" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 flex gap-2 font-semibold"><Home className="h-5 w-5 text-primary" />Fastighet</h2>
              <div className="grid gap-3">
                <input value={model.projectName} onChange={(event) => set('projectName', event.target.value)} className="rounded-xl border border-border px-3 py-2 text-sm" />
                <input value={model.address} onChange={(event) => set('address', event.target.value)} placeholder="Adress / fastighet" className="rounded-xl border border-border px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Latitud" value={model.latitude} onChange={(value) => set('latitude', value)} suffix="°" step={0.0001} />
                  <NumberInput label="Longitud" value={model.longitude} onChange={(value) => set('longitude', value)} suffix="°" step={0.0001} />
                </div>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-border px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 font-semibold">Byggnad och tak</h2>
              <div className="grid grid-cols-2 gap-3">
                {buildingFields.map(([key, label, suffix]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, value)} suffix={suffix} />)}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 flex gap-2 font-semibold"><CloudSun className="h-5 w-5 text-primary" />Väder och hinder</h2>
              <div className="grid grid-cols-2 gap-3">
                {weatherFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, key === 'cloudCover' ? clamp(value, 0, 100) : value)} suffix={suffix} step={step} />)}
              </div>
              <div className="mt-4 grid gap-2">
                {[["chimney", "Skorsten"], ["tree", "Träd"], ["neighbour", "Grannbyggnad"]].map(([key, label]) => (
                  <label key={key} className="flex justify-between rounded-xl border border-border px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={model.obstacles[key]} onChange={(event) => setObstacle(key, event.target.checked)} /></label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <VisualModel model={model} solar={solar} shadeLoss={shadeLoss} />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-4 font-semibold">Timvis simulering</h2>
                <input type="range" min="4" max="19" value={hour} onChange={(event) => setHour(Number(event.target.value))} className="mb-4 w-full" />
                {simulation.map((row) => (
                  <button key={row.time} onClick={() => setHour(Number(row.time.slice(0, 2)))} className={`mb-2 grid w-full grid-cols-[52px_1fr_70px] items-center gap-3 rounded-xl px-3 py-2 text-sm ${Number(row.time.slice(0, 2)) === hour ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                    <span>{row.time}</span>
                    <span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{ width: `${clamp((row.productionKw / Math.max(1, Number(model.panelKw))) * 100, 0, 100)}%` }} /></span>
                    <span className="text-right">{row.productionKw.toFixed(1)} kW</span>
                  </button>
                ))}
              </div>
              <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-4 flex gap-2 font-semibold"><TreePine className="h-5 w-5 text-primary" />Analys</h2>
                <div className="space-y-3 text-sm">
                  <p className="rounded-2xl bg-muted/60 p-3"><b>Vald timme:</b> {time}</p>
                  <p className="rounded-2xl bg-muted/60 p-3"><b>Produktion:</b> {estimate.productionKw.toFixed(1)} kW just nu</p>
                  <p className="rounded-2xl bg-muted/60 p-3"><b>Skuggning:</b> {shadeLoss.toFixed(0)}%</p>
                  <button onClick={() => setHour(12)} className="w-full rounded-xl bg-primary px-4 py-2 text-white"><Play className="mr-2 inline h-4 w-4" />Visa mitt på dagen</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
