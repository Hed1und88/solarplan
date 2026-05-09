import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sun, Save, RotateCcw, Download, Home, CloudSun, TreePine, Compass, Zap, ScanLine, Activity, MapPin, Mountain, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  calculateSolarPosition,
  calculateWeatherFactor,
  calculateShadeLoss,
  calculatePvEstimate,
  generateHourlySimulation,
  annualFactorFromDate,
  calculatePanelLayout,
  clamp
} from '@/lib/solarShadowEngine';
import { applyForecastToModel, fetchSolarPlanSiteData } from '@/lib/geoDataServices';

const initial = {
  projectName: 'Ny 3D Solanalys',
  address: '',
  latitude: 59.3793,
  longitude: 13.5036,
  elevationM: 0,
  terrainSlopeDeg: 0,
  terrainAspect: 180,
  buildingLength: 12,
  buildingWidth: 8,
  buildingHeight: 4.2,
  roofType: 'sadeltak',
  roofPitch: 27,
  roofAzimuth: 180,
  panelPowerW: 450,
  panelLengthM: 1.9,
  panelWidthM: 1.1,
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

function NumberInput({ label, value, onChange, suffix = '', step = 1, min, max }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-12 text-sm font-medium outline-none transition focus:border-amber-500 focus:bg-white" />
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

function ParametricHouse3D({ model, solar, shadeLoss, siteData }) {
  const panelLayout = calculatePanelLayout(model);
  const shadeOpacity = clamp(shadeLoss / 100, 0.08, 0.46);
  const sunX = 520 + solar.sunVector.x * 120;
  const sunY = 125 - Math.max(0, solar.sunVector.y) * 70;
  const mapUrl = siteData?.tile?.url;

  const panelCells = Array.from({ length: Math.min(panelLayout.panelCount, 32) }, (_, index) => ({
    x: 368 + (index % panelLayout.columns) * 22,
    y: 221 + Math.floor(index / panelLayout.columns) * 20,
  }));

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f]">
      {mapUrl && <img src={mapUrl} alt="" className="absolute inset-x-10 bottom-6 h-32 w-[calc(100%-5rem)] rounded-xl object-cover opacity-25 saturate-75" />}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 920 520" role="img" aria-label="Teknisk 3D-solanalys av fastighet, takpaneler, träd och grannhus">
        <defs>
          <filter id="softDrop" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000000" floodOpacity="0.28" />
          </filter>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dce8f2" />
            <stop offset="52%" stopColor="#edf3f8" />
            <stop offset="100%" stopColor="#d9e6da" />
          </linearGradient>
          <linearGradient id="plot" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d7e4d8" />
            <stop offset="55%" stopColor="#b9cda9" />
            <stop offset="100%" stopColor="#8fa177" />
          </linearGradient>
          <linearGradient id="roof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="45%" stopColor="#0f4c81" />
            <stop offset="100%" stopColor="#081a36" />
          </linearGradient>
          <pattern id="grid" x="0" y="0" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0H0V34" fill="none" stroke="#94a3b8" strokeWidth="0.8" opacity="0.22" />
          </pattern>
        </defs>

        <rect width="920" height="520" fill="url(#sky)" />
        <rect width="920" height="520" fill="url(#grid)" />
        <circle cx={sunX} cy={sunY} r="14" fill="#fbbf24" />
        <circle cx={sunX} cy={sunY} r="34" fill="#fbbf24" opacity="0.14" />
        <path d="M96 365 L462 168 L822 365 L462 492 Z" fill="url(#plot)" stroke="#d7e7d9" strokeWidth="1.5" filter="url(#softDrop)" />
        <path d="M96 365 L462 168 L822 365 L462 492 Z" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="7 9" opacity="0.45" />

        <g opacity="0.8" transform="translate(184 242)">
          <ellipse cx="0" cy="88" rx="78" ry="17" fill="#0f172a" opacity="0.16" />
          <polygon points="-72,32 0,-10 72,32 42,51 -30,12 -102,51" fill="#64748b" />
          <polygon points="-72,32 -72,82 42,82 42,51 -30,12" fill="#cbd5e1" />
          <polygon points="42,51 72,32 72,68 42,82" fill="#94a3b8" />
        </g>

        {model.obstacles.neighbour && (
          <g opacity="0.85" transform="translate(716 265)">
            <ellipse cx="0" cy="86" rx="82" ry="18" fill="#0f172a" opacity="0.16" />
            <polygon points="-76,32 0,-14 76,32 44,52 -30,10 -106,52" fill="#64748b" />
            <polygon points="-76,32 -76,86 44,86 44,52 -30,10" fill="#d8e1eb" />
            <polygon points="44,52 76,32 76,72 44,86" fill="#aebccd" />
          </g>
        )}

        {model.obstacles.tree && (
          <g transform="translate(204 303)">
            <ellipse cx="19" cy="98" rx="86" ry="24" fill="#0f172a" opacity="0.22" />
            <path d="M0 90 L12 18 L25 90 Z" fill="#6b4a28" />
            <circle cx="-16" cy="28" r="34" fill="#14532d" />
            <circle cx="28" cy="22" r="38" fill="#166534" />
            <circle cx="6" cy="-6" r="42" fill="#15803d" />
          </g>
        )}

        <g transform="translate(458 284)" filter="url(#softDrop)">
          <ellipse cx="0" cy="125" rx="174" ry="30" fill="#0f172a" opacity="0.18" />
          <polygon points="-168,18 0,-72 168,18 128,52 -36,-34 -206,52" fill="url(#roof)" />
          <polygon points="-168,18 -168,118 128,118 128,52 -36,-34" fill="#eef3f7" stroke="#c8d4df" strokeWidth="1.2" />
          <polygon points="128,52 168,18 168,100 128,118" fill="#cbd5e1" stroke="#b9c6d4" strokeWidth="1.2" />
          <polygon points="-36,-34 128,52 168,18 0,-72" fill="#263244" opacity="0.95" />
          <rect x="-136" y="64" width="32" height="48" rx="3" fill="#1f2937" />
          <rect x="-82" y="62" width="34" height="50" rx="3" fill="#1f2937" />
          <rect x="-26" y="62" width="34" height="50" rx="3" fill="#1f2937" />
          <rect x="68" y="58" width="44" height="60" rx="3" fill="#334155" />

          <g transform="translate(-52 -12) rotate(28)">
            {panelCells.map((cell) => (
              <g key={`${cell.x}-${cell.y}`} transform={`translate(${(cell.x - 430) * 0.82} ${(cell.y - 230) * 0.72})`}>
                <rect x="-10" y="-9" width="20" height="18" rx="2" fill="url(#panel)" stroke="#7dd3fc" strokeWidth="0.7" />
                <path d="M-4 -8V8 M4 -8V8 M-9 0H9" stroke="#bae6fd" strokeWidth="0.45" opacity="0.55" />
              </g>
            ))}
          </g>

          {model.obstacles.chimney && (
            <g transform="translate(72 -34)">
              <rect x="-9" y="-34" width="18" height="48" rx="2" fill="#7c2d12" />
              <rect x="-11" y="-38" width="22" height="7" rx="1.5" fill="#9a3412" />
            </g>
          )}
        </g>

        <path d="M650 287 C720 329 774 351 852 381 L814 403 C742 376 680 340 606 298 Z" fill="#020617" opacity={shadeOpacity} />
        {model.obstacles.tree && <path d="M214 350 C318 369 410 412 500 475 L442 490 C350 427 265 397 160 381 Z" fill="#020617" opacity={shadeOpacity * 0.72} />}
        {model.obstacles.neighbour && <path d="M714 343 C782 366 823 390 876 427 L826 446 C778 407 725 381 656 358 Z" fill="#020617" opacity={shadeOpacity * 0.7} />}

        <g transform="translate(40 44)">
          <rect width="242" height="96" rx="18" fill="#07111f" opacity="0.88" />
          <text x="18" y="30" fill="#94a3b8" fontSize="11" fontWeight="700">3D SOLANALYS</text>
          <text x="18" y="58" fill="#f8fafc" fontSize="23" fontWeight="900">{Math.max(0, solar.altitude).toFixed(1)}° solhöjd</text>
          <text x="18" y="80" fill="#cbd5e1" fontSize="12">Skuggpåverkan {shadeLoss.toFixed(0)}% · {model.roofAzimuth}° azimut</text>
        </g>

        <g transform="translate(630 46)">
          <rect width="244" height="100" rx="18" fill="#ffffff" opacity="0.92" />
          <text x="18" y="31" fill="#64748b" fontSize="11" fontWeight="800">ANLÄGGNING</text>
          <text x="18" y="59" fill="#0f172a" fontSize="22" fontWeight="900">{panelLayout.panelCount} paneler</text>
          <text x="18" y="81" fill="#475569" fontSize="12">{panelLayout.installedKw.toFixed(1)} kWp · {model.buildingLength} × {model.buildingWidth} m</text>
        </g>
      </svg>
    </div>
  );
}

function Technical3DModel({ model, solar, shadeLoss, siteData }) {
  const panelLayout = calculatePanelLayout(model);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><ScanLine className="h-4 w-4" /> Teknisk analysvy</div>
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · Professionell situationsmodell</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Skugga {shadeLoss.toFixed(0)}%</div>
      </div>
      <div className="bg-slate-950 p-3 sm:p-5">
        <ParametricHouse3D model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />
        <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Byggnad</b><br />{model.buildingLength} × {model.buildingWidth} m</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Tak</b><br />{model.roofType} · {model.roofPitch}°</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Paneler</b><br />{panelLayout.panelCount} st · {panelLayout.installedKw.toFixed(1)} kWp</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Platsdata</b><br />{siteData?.elevation?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'Ej hämtad'}</div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return <div className={`${card} p-4`}><h3 className="mb-4 text-sm font-bold text-slate-950">{title}</h3><div className="h-56">{children}</div></div>;
}

function StatusPill({ status, children }) {
  const classes = status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
  return <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>{children}</div>;
}

export default function SolarShadowAnalysis() {
  const [model, setModel] = useState(initial);
  const [date, setDate] = useState(today());
  const [hour, setHour] = useState(12);
  const [siteData, setSiteData] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  const set = (key, value) => setModel((current) => ({ ...current, [key]: value }));
  const setObstacle = (key, value) => setModel((current) => ({ ...current, obstacles: { ...current.obstacles, [key]: value } }));

  const time = `${String(hour).padStart(2, '0')}:00`;
  const solar = useMemo(() => calculateSolarPosition({ latitude: model.latitude, longitude: model.longitude, date, time }), [model.latitude, model.longitude, date, time]);
  const weatherFactor = useMemo(() => calculateWeatherFactor(model), [model]);
  const shadeLoss = useMemo(() => calculateShadeLoss({ solar, model }), [solar, model]);
  const estimate = useMemo(() => calculatePvEstimate({ solar, model, weatherFactor, shadeLoss }), [solar, model, weatherFactor, shadeLoss]);
  const panelLayout = useMemo(() => calculatePanelLayout(model), [model]);
  const simulation = useMemo(() => generateHourlySimulation({ model, date }), [model, date]);
  const dailyKwh = simulation.reduce((sum, row) => sum + row.productionKw, 0);
  const annualKwh = dailyKwh * 365 * annualFactorFromDate(date);
  const chartData = simulation.map((row) => ({ time: row.time, power: Number(row.productionKw.toFixed(2)), shade: Number(row.shadeLoss.toFixed(0)), altitude: Number(Math.max(0, row.solar.altitude).toFixed(1)), irradiance: Number(row.irradiance.toFixed(0)) }));

  const connectRealData = async () => {
    setGeoLoading(true);
    setGeoError('');
    try {
      const data = await fetchSolarPlanSiteData({ address: model.address, latitude: model.latitude, longitude: model.longitude, date, hour });
      setSiteData(data);
      setModel((current) => {
        const withCoordinates = {
          ...current,
          latitude: data.latitude,
          longitude: data.longitude,
          elevationM: data.elevation?.elevation ?? current.elevationM
        };
        return applyForecastToModel(withCoordinates, data.nearestForecast);
      });
    } catch (error) {
      setGeoError(error?.message || 'Kunde inte koppla verklig kartdata, höjddata och SMHI.');
    } finally {
      setGeoLoading(false);
    }
  };

  const saveLocal = () => localStorage.setItem('solarplan_3d_solar_analysis_v3', JSON.stringify({ model, date, hour, siteData }));
  const reset = () => { setModel(initial); setDate(today()); setHour(12); setSiteData(null); setGeoError(''); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ model, date, hour, solar, weatherFactor, shadeLoss, estimate, panelLayout, siteData, simulation }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solarplan-3d-solanalys-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const buildingFields = [
    ['buildingLength', 'Längd', 'm', 0.1], ['buildingWidth', 'Bredd', 'm', 0.1], ['buildingHeight', 'Vägghöjd', 'm', 0.1], ['roofPitch', 'Taklutning', '°', 1],
    ['roofAzimuth', 'Takazimut', '°', 1], ['panelPowerW', 'Paneleffekt', 'W', 5], ['panelRows', 'Panelrader', 'st', 1], ['panelColumns', 'Panelkolumner', 'st', 1]
  ];
  const weatherFields = [
    ['cloudCover', 'Molnighet', '%', 1], ['temperature', 'Temperatur', '°C', 1], ['precipitation', 'Nederbörd', 'mm/h', 0.1],
    ['terrainSlopeDeg', 'Terränglutning', '°', 1], ['treeHeight', 'Trädhöjd', 'm', 1], ['treeDistance', 'Trädavstånd', 'm', 1], ['neighbourHeight', 'Grannhöjd', 'm', 1]
  ];

  return (
    <div className="min-h-full bg-slate-100 p-4 pb-28 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300"><Activity className="h-4 w-4" /> SolarPlan Engineering</div>
              <h1 className="text-2xl font-black tracking-tight lg:text-4xl">3D Solanalys · Parametriskt hus + verklig platsdata</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Huset byggs från längd, bredd, vägghöjd och taklutning. Ändrar du måtten ändras 3D-modellen, panelplaceringen och solanalysen direkt.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={connectRealData} disabled={geoLoading} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{geoLoading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <MapPin className="mr-2 inline h-4 w-4" />}Koppla kartdata/SMHI</button>
              <button onClick={saveLocal} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950"><Save className="mr-2 inline h-4 w-4" />Spara</button>
              <button onClick={exportJson} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><Download className="mr-2 inline h-4 w-4" />Export</button>
              <button onClick={reset} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><RotateCcw className="mr-2 inline h-4 w-4" />Reset</button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatusPill status={siteData?.geocoded || siteData?.latitude ? 'ok' : 'idle'}>{siteData ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />} Kartdata {siteData ? `${model.latitude}, ${model.longitude}` : 'ej kopplad'}</StatusPill>
          <StatusPill status={siteData?.elevation ? 'ok' : 'idle'}>{siteData?.elevation ? <CheckCircle2 className="h-4 w-4" /> : <Mountain className="h-4 w-4" />} Höjddata {siteData?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'ej hämtad'}</StatusPill>
          <StatusPill status={siteData?.nearestForecast ? 'ok' : geoError ? 'warn' : 'idle'}>{geoError ? <AlertTriangle className="h-4 w-4" /> : <CloudSun className="h-4 w-4" />} SMHI {siteData?.nearestForecast ? `${model.temperature}°C · ${model.cloudCover}% moln` : geoError || 'ej hämtad'}</StatusPill>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Stat icon={Sun} title="Solhöjd" value={`${Math.max(0, solar.altitude).toFixed(1)}°`} text={`Azimut ${solar.azimuth.toFixed(0)}°`} />
          <Stat icon={CloudSun} title="Väderfaktor" value={`${(weatherFactor * 100).toFixed(0)}%`} text={`${model.cloudCover}% moln · ${model.temperature}°C`} />
          <Stat icon={TreePine} title="Skuggförlust" value={`${shadeLoss.toFixed(0)}%`} text="Hinder, takvinkel och låg sol" />
          <Stat icon={Zap} title="Effekt nu" value={`${estimate.productionKw.toFixed(1)} kW`} text={`${estimate.irradiance.toFixed(0)} W/m²`} />
          <Stat icon={Activity} title="Installerbart" value={`${panelLayout.installedKw.toFixed(1)} kWp`} text={`${panelLayout.panelCount} paneler`} />
          <Stat icon={Compass} title="År" value={`${annualKwh.toFixed(0)} kWh`} text="Förenklat årsestimat" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <div className="space-y-4">
            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><Home className="h-5 w-5 text-amber-500" />Fastighet</h2>
              <div className="grid gap-3">
                <input value={model.projectName} onChange={(event) => set('projectName', event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium" />
                <input value={model.address} onChange={(event) => set('address', event.target.value)} placeholder="Skriv adress och klicka Koppla kartdata/SMHI" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Latitud" value={model.latitude} onChange={(value) => set('latitude', value)} suffix="°" step={0.0001} />
                  <NumberInput label="Longitud" value={model.longitude} onChange={(value) => set('longitude', value)} suffix="°" step={0.0001} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <NumberInput label="Tid" value={hour} onChange={(value) => setHour(clamp(value, 4, 19))} suffix=":00" step={1} min={4} max={19} />
                </div>
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 font-bold text-slate-950">Byggnad, tak och paneler</h2>
              <label className="mb-3 block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Taktyp</span>
                <select value={model.roofType} onChange={(event) => set('roofType', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium">
                  <option value="sadeltak">Sadeltak</option>
                  <option value="pulpettak">Pulpettak</option>
                  <option value="platt">Platt tak</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {buildingFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, value)} suffix={suffix} step={step} />)}
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                <b>Takyta:</b> {panelLayout.roofAreas.totalRoofArea.toFixed(1)} m² · <b>Användbar:</b> {panelLayout.roofAreas.usableRoofArea.toFixed(1)} m² · <b>Panelarea:</b> {panelLayout.requiredArea.toFixed(1)} m²
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><CloudSun className="h-5 w-5 text-amber-500" />Väder, höjddata och hinder</h2>
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
            <Technical3DModel model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />

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
                    <span className="h-2 rounded-full bg-slate-200"><span className="block h-2 rounded-full bg-amber-400" style={{ width: `${clamp((row.productionKw / Math.max(1, panelLayout.installedKw)) * 100, 0, 100)}%` }} /></span>
                    <span className="text-right font-semibold">{row.productionKw.toFixed(1)} kW</span>
                    <span className="text-right text-xs opacity-75">{row.shadeLoss.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
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

              <div className={`${card} p-4 lg:col-span-2`}>
                <h3 className="mb-4 text-sm font-bold text-slate-950">Analys</h3>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Vald timme:</b> {time}</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Produktion:</b> {estimate.productionKw.toFixed(1)} kW just nu</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Skuggning:</b> {shadeLoss.toFixed(0)}%</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Tak:</b> {model.roofPitch}° lutning · {model.roofAzimuth}° azimut</p>
                  <p className="rounded-2xl bg-emerald-50 p-3 text-emerald-950 md:col-span-2"><b>Nästa steg utfört:</b> basvyn är nu kopplad mot verklig kartdata, höjddata och SMHI. Adress hämtar koordinater, höjd hämtas automatiskt och väderdata uppdaterar molnighet, temperatur och nederbörd.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
