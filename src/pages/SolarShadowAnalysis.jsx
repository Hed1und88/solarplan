import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sun, Save, RotateCcw, Download, Home, CloudSun, TreePine, Play, Compass, Zap, ScanLine, Activity } from 'lucide-react';
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
const card = 'rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm';

function NumberInput({ label, value, onChange, suffix = '', step = 1 }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-12 text-sm font-medium outline-none transition focus:border-amber-500 focus:bg-white" />
        <span className="absolute right-3 top-2.5 text-xs text-slate-400">{suffix}</span>
      </div>
    </label>
  );
}

function Stat({ icon: Icon, title, value, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-950 p-2 text-amber-300"><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function Technical3DModel({ model, solar, shadeLoss, simulation, hour, setHour }) {
  const panelCount = Math.min(48, Math.max(1, Number(model.panelRows) * Number(model.panelColumns)));
  const sunPath = simulation.map((row, index) => ({
    x: 80 + index * (760 / Math.max(1, simulation.length - 1)),
    y: 300 - clamp(row.solar.altitude, 0, 65) * 3.3,
    time: row.time,
    kw: row.productionKw
  }));
  const currentIndex = simulation.findIndex((row) => Number(row.time.slice(0, 2)) === hour);
  const currentPoint = sunPath[Math.max(0, currentIndex)] || sunPath[0];
  const shadowAlpha = clamp(shadeLoss / 100, 0.12, 0.72);
  const roofHeat = 100 - shadeLoss;

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><ScanLine className="h-4 w-4" /> Projekteringsvy</div>
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · Takmodell, solbana och skuggmatris</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{hour}:00 · {estimateLabel(roofHeat)}</div>
      </div>

      <div className="relative bg-slate-950 p-3 sm:p-5">
        <svg viewBox="0 0 960 560" className="h-[430px] w-full rounded-2xl bg-slate-900">
          <defs>
            <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="48%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <linearGradient id="roof" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="55%" stopColor="#111827" />
              <stop offset="100%" stopColor="#030712" />
            </linearGradient>
            <linearGradient id="panel" x1="0" x2="1">
              <stop offset="0%" stopColor="#1d4ed8" />
              <stop offset="55%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="45%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8" /></filter>
          </defs>

          <rect width="960" height="560" fill="url(#sky)" />
          {Array.from({ length: 13 }).map((_, index) => <line key={`h-${index}`} x1="40" x2="920" y1={60 + index * 34} y2={60 + index * 34} stroke="#334155" strokeOpacity="0.32" />)}
          {Array.from({ length: 13 }).map((_, index) => <line key={`v-${index}`} x1={60 + index * 70} x2={60 + index * 70} y1="36" y2="520" stroke="#334155" strokeOpacity="0.22" />)}

          <path d={sunPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth="3" strokeDasharray="8 7" opacity="0.9" />
          <circle cx={currentPoint?.x || 480} cy={currentPoint?.y || 130} r="58" fill="url(#sunGlow)" opacity="0.65" />
          <circle cx={currentPoint?.x || 480} cy={currentPoint?.y || 130} r="14" fill="#fde68a" />
          <line x1={currentPoint?.x || 480} y1={currentPoint?.y || 130} x2="500" y2="305" stroke="#f59e0b" strokeWidth="2" strokeOpacity="0.8" />

          <polygon points="210,385 500,270 760,385 470,500" fill="#0f172a" filter="url(#softShadow)" opacity={shadowAlpha} />
          <polygon points="250,300 510,205 735,310 472,414" fill="url(#roof)" stroke="#64748b" strokeWidth="2" />
          <polygon points="250,300 472,414 472,485 250,374" fill="#f8fafc" stroke="#cbd5e1" />
          <polygon points="735,310 472,414 472,485 735,380" fill="#e2e8f0" stroke="#cbd5e1" />
          <polygon points="250,374 472,485 735,380 735,410 472,522 250,405" fill="#cbd5e1" opacity="0.55" />

          {Array.from({ length: panelCount }).map((_, index) => {
            const col = index % 8;
            const row = Math.floor(index / 8);
            const x = 320 + col * 43 + row * 11;
            const y = 275 + row * 22 - col * 6;
            const heat = clamp(roofHeat - row * 4 - col * 1.5, 10, 100);
            const opacity = 0.42 + heat / 170;
            return <polygon key={index} points={`${x},${y} ${x + 36},${y - 12} ${x + 58},${y} ${x + 21},${y + 13}`} fill="url(#panel)" opacity={opacity} stroke="#60a5fa" strokeOpacity="0.55" />;
          })}

          {model.obstacles.chimney && <><polygon points="610,232 650,217 650,295 610,310" fill="#7c2d12" /><polygon points="610,232 635,242 675,226 650,217" fill="#9a3412" /></>}
          {model.obstacles.tree && <><rect x="130" y="330" width="22" height="110" fill="#92400e" /><circle cx="142" cy="292" r="66" fill="#047857" /><circle cx="105" cy="317" r="45" fill="#065f46" opacity="0.92" /></>}
          {model.obstacles.neighbour && <><polygon points="760,312 890,350 890,455 760,415" fill="#64748b" /><polygon points="760,312 825,278 955,315 890,350" fill="#94a3b8" /></>}

          <rect x="34" y="30" width="224" height="88" rx="18" fill="#020617" fillOpacity="0.72" stroke="#334155" />
          <text x="54" y="62" fill="#f8fafc" fontSize="18" fontWeight="700">Teknisk solgeometri</text>
          <text x="54" y="88" fill="#cbd5e1" fontSize="13">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Azimut {solar.azimuth.toFixed(0)}°</text>
          <text x="54" y="108" fill="#cbd5e1" fontSize="13">Skuggförlust {shadeLoss.toFixed(0)}% · Heatmap {roofHeat.toFixed(0)}%</text>

          <rect x="716" y="34" width="206" height="104" rx="18" fill="#020617" fillOpacity="0.72" stroke="#334155" />
          <text x="736" y="66" fill="#f8fafc" fontSize="17" fontWeight="700">Panelmatris</text>
          <text x="736" y="92" fill="#cbd5e1" fontSize="13">{model.panelRows} rader × {model.panelColumns} kolumner</text>
          <text x="736" y="113" fill="#cbd5e1" fontSize="13">DC-effekt {model.panelKw} kWp</text>
        </svg>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-300">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Takazimut</b><br />{model.roofAzimuth}°</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Taklutning</b><br />{model.roofPitch}°</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Aktiv timme</b><br />{hour}:00</div>
        </div>
      </div>
    </div>
  );
}

function estimateLabel(value) {
  if (value > 80) return 'Låg skuggning';
  if (value > 55) return 'Måttlig skuggning';
  return 'Hög skuggning';
}

function ChartCard({ title, children }) {
  return <div className={`${card} p-4`}><h3 className="mb-4 text-sm font-bold text-slate-950">{title}</h3><div className="h-56">{children}</div></div>;
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
  const chartData = simulation.map((row) => ({
    time: row.time,
    power: Number(row.productionKw.toFixed(2)),
    shade: Number(row.shadeLoss.toFixed(0)),
    altitude: Number(Math.max(0, row.solar.altitude).toFixed(1)),
    irradiance: Number(row.irradiance.toFixed(0))
  }));

  const saveLocal = () => localStorage.setItem('solarplan_shadow_analysis_v2', JSON.stringify({ model, date, hour }));
  const reset = () => { setModel(initial); setDate(today()); setHour(12); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ model, date, hour, solar, weatherFactor, shadeLoss, estimate, simulation }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solarplan-teknisk-solanalys-${date}.json`;
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
    <div className="min-h-full bg-slate-100 p-4 pb-28 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300"><Activity className="h-4 w-4" /> SolarPlan Engineering</div>
              <h1 className="text-2xl font-black tracking-tight lg:text-4xl">3D Solanalys · Teknisk projektering</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Solgeometri, takmodell, panelmatris, skuggförlust, väderfaktor och produktionskurvor i samma arbetsvy.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveLocal} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950"><Save className="mr-2 inline h-4 w-4" />Spara</button>
              <button onClick={exportJson} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><Download className="mr-2 inline h-4 w-4" />Export</button>
              <button onClick={reset} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><RotateCcw className="mr-2 inline h-4 w-4" />Reset</button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Stat icon={Sun} title="Solhöjd" value={`${Math.max(0, solar.altitude).toFixed(1)}°`} text={`Azimut ${solar.azimuth.toFixed(0)}°`} />
          <Stat icon={CloudSun} title="Väderfaktor" value={`${(weatherFactor * 100).toFixed(0)}%`} text={`${model.cloudCover}% moln · ${model.temperature}°C`} />
          <Stat icon={TreePine} title="Skuggförlust" value={`${shadeLoss.toFixed(0)}%`} text="Hinder, takvinkel och låg sol" />
          <Stat icon={Zap} title="Effekt nu" value={`${estimate.productionKw.toFixed(1)} kW`} text={`${estimate.irradiance.toFixed(0)} W/m²`} />
          <Stat icon={Activity} title="Dag" value={`${dailyKwh.toFixed(1)} kWh`} text="Summerad timmodell" />
          <Stat icon={Compass} title="År" value={`${annualKwh.toFixed(0)} kWh`} text="Förenklat årsestimat" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <div className="space-y-4">
            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><Home className="h-5 w-5 text-amber-500" />Fastighet</h2>
              <div className="grid gap-3">
                <input value={model.projectName} onChange={(event) => set('projectName', event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium" />
                <input value={model.address} onChange={(event) => set('address', event.target.value)} placeholder="Adress / fastighet" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Latitud" value={model.latitude} onChange={(value) => set('latitude', value)} suffix="°" step={0.0001} />
                  <NumberInput label="Longitud" value={model.longitude} onChange={(value) => set('longitude', value)} suffix="°" step={0.0001} />
                </div>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 font-bold text-slate-950">Byggnad och tak</h2>
              <div className="grid grid-cols-2 gap-3">
                {buildingFields.map(([key, label, suffix]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, value)} suffix={suffix} />)}
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><CloudSun className="h-5 w-5 text-amber-500" />Väder och hinder</h2>
              <div className="grid grid-cols-2 gap-3">
                {weatherFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, key === 'cloudCover' ? clamp(value, 0, 100) : value)} suffix={suffix} step={step} />)}
              </div>
              <div className="mt-4 grid gap-2">
                {[["chimney", "Skorsten"], ["tree", "Träd"], ["neighbour", "Grannbyggnad"]].map(([key, label]) => (
                  <label key={key} className="flex justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={model.obstacles[key]} onChange={(event) => setObstacle(key, event.target.checked)} /></label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Technical3DModel model={model} solar={solar} shadeLoss={shadeLoss} simulation={simulation} hour={hour} setHour={setHour} />

            <div className={`${card} p-4`}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold text-slate-950">Timvis teknisk simulering</h2>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Aktiv timme {hour}:00</div>
              </div>
              <input type="range" min="4" max="19" value={hour} onChange={(event) => setHour(Number(event.target.value))} className="mb-5 w-full" />
              <div className="grid gap-2">
                {simulation.map((row) => (
                  <button key={row.time} onClick={() => setHour(Number(row.time.slice(0, 2)))} className={`grid w-full grid-cols-[52px_1fr_76px_64px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${Number(row.time.slice(0, 2)) === hour ? 'bg-slate-950 text-white' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <span className="font-bold">{row.time}</span>
                    <span className="h-2 rounded-full bg-slate-200"><span className="block h-2 rounded-full bg-amber-400" style={{ width: `${clamp((row.productionKw / Math.max(1, Number(model.panelKw))) * 100, 0, 100)}%` }} /></span>
                    <span className="text-right font-semibold">{row.productionKw.toFixed(1)} kW</span>
                    <span className="text-right text-xs opacity-75">{row.shadeLoss.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setHour(12)} className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950"><Play className="mr-2 inline h-4 w-4" />Visa mitt på dagen</button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Produktion och instrålning">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="power" name="kW" stroke="#f59e0b" fill="#fde68a" />
                    <Line type="monotone" dataKey="irradiance" name="W/m²" stroke="#0f172a" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Skuggförlust per timme">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="shade" name="Skugga %" fill="#0f172a" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Solhöjd över dagen">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="altitude" name="Solhöjd °" stroke="#f59e0b" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className={`${card} p-4`}>
                <h3 className="mb-4 text-sm font-bold text-slate-950">Analys</h3>
                <div className="space-y-3 text-sm">
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Vald timme:</b> {time}</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Produktion:</b> {estimate.productionKw.toFixed(1)} kW just nu</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Skuggning:</b> {shadeLoss.toFixed(0)}%</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Tak:</b> {model.roofPitch}° lutning · {model.roofAzimuth}° azimut</p>
                  <p className="rounded-2xl bg-amber-50 p-3 text-amber-950"><b>Nästa steg:</b> koppla mot verklig kartdata, höjddata och SMHI när basvyn är godkänd.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
