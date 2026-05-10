import { useMemo, useRef, useState } from 'react';
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
  fasciaHeight: 4.2,
  nockHeight: 6.3,
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

function ParametricHouse3D({ model, solar, shadeLoss, siteData, onModelChange }) {
  const svgRef = useRef(null);
  const [activeHandle, setActiveHandle] = useState(null);
  const panelLayout = calculatePanelLayout(model);
  const length = Number(model.buildingLength) || 12;
  const width = Number(model.buildingWidth) || 8;
  const nockHeight = Number(model.nockHeight || model.buildingHeight + 2.1);
  const fasciaHeight = Number(model.fasciaHeight || model.buildingHeight || 4.2);
  const roofRise = Math.max(0.2, nockHeight - fasciaHeight);

  const plan = { x: 96, y: 94, w: 360, h: 230 };
  const elev = { x: 548, y: 104, w: 260, h: 220 };
  const maxLength = 24;
  const maxWidth = 16;
  const maxHeight = 10;
  const planW = clamp((length / maxLength) * plan.w, 110, plan.w);
  const planH = clamp((width / maxWidth) * plan.h, 76, plan.h);
  const planX = plan.x + (plan.w - planW) / 2;
  const planY = plan.y + (plan.h - planH) / 2;
  const ridgeX = planX + planW / 2;

  const eaveY = elev.y + elev.h - clamp((fasciaHeight / maxHeight) * elev.h, 58, elev.h - 24);
  const ridgeY = elev.y + elev.h - clamp((nockHeight / maxHeight) * elev.h, 78, elev.h - 12);
  const baseY = elev.y + elev.h;
  const roofPitch = Math.round(Math.atan(roofRise / Math.max(0.1, width / 2)) * 180 / Math.PI);

  const updateModel = (patch) => {
    const next = { ...model, ...patch };
    const nextFascia = Number(next.fasciaHeight || next.buildingHeight || fasciaHeight);
    const nextNock = Math.max(nextFascia + 0.2, Number(next.nockHeight || nockHeight));
    const nextWidth = Number(next.buildingWidth || width);
    const nextPitch = Math.round(Math.atan((nextNock - nextFascia) / Math.max(0.1, nextWidth / 2)) * 180 / Math.PI);
    onModelChange?.({ ...next, nockHeight: nextNock, fasciaHeight: nextFascia, buildingHeight: nextFascia, roofPitch: clamp(nextPitch, 1, 60) });
  };

  const svgPoint = (event) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 900,
      y: ((event.clientY - rect.top) / rect.height) * 520,
    };
  };

  const applyDrag = (event, handle = activeHandle) => {
    if (!handle) return;
    const point = svgPoint(event);
    if (handle === 'length') {
      const newLength = clamp(((point.x - planX) / plan.w) * maxLength, 4, maxLength);
      updateModel({ buildingLength: Number(newLength.toFixed(1)) });
    }
    if (handle === 'width') {
      const newWidth = clamp(((point.y - planY) / plan.h) * maxWidth, 3, maxWidth);
      updateModel({ buildingWidth: Number(newWidth.toFixed(1)) });
    }
    if (handle === 'ridge') {
      const newNock = clamp(((baseY - point.y) / elev.h) * maxHeight, fasciaHeight + 0.3, maxHeight);
      updateModel({ nockHeight: Number(newNock.toFixed(1)) });
    }
    if (handle === 'fascia') {
      const newFascia = clamp(((baseY - point.y) / elev.h) * maxHeight, 2.2, nockHeight - 0.3);
      updateModel({ fasciaHeight: Number(newFascia.toFixed(1)), buildingHeight: Number(newFascia.toFixed(1)) });
    }
  };

  const startDrag = (event, handle) => {
    event.preventDefault();
    setActiveHandle(handle);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    applyDrag(event, handle);
  };

  const endDrag = () => setActiveHandle(null);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
      <svg
        ref={svgRef}
        viewBox="0 0 900 520"
        className="h-[520px] w-full select-none touch-none bg-gradient-to-b from-slate-50 to-white"
        onPointerMove={applyDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label="Parametrisk husmodell med dragbara linjer for bredd, langd, nockhojd och vindskivehojd"
      >
        <defs>
          <linearGradient id="roofPreview" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#8b4a34" />
            <stop offset="1" stopColor="#5a2f24" />
          </linearGradient>
          <linearGradient id="panelPreview" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#0f3454" />
            <stop offset="1" stopColor="#020817" />
          </linearGradient>
          <pattern id="facadeLines" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 0V10" stroke="#d4cec3" strokeWidth="1" opacity="0.55" />
          </pattern>
        </defs>

        <rect x="28" y="28" width="844" height="464" rx="24" fill="#f8fafc" stroke="#dbe3ee" />
        <text x="56" y="66" fill="#0f172a" fontSize="18" fontWeight="800">Bygg huset med mått och dragbara linjer</text>
        <text x="56" y="90" fill="#64748b" fontSize="12">Dra höger linje för längd, nedre linje för bredd, nockpunkt och vindskivehöjd i gaveln.</text>

        <g>
          <text x={plan.x} y={plan.y - 18} fill="#334155" fontSize="13" fontWeight="800">Planvy</text>
          <rect x={plan.x} y={plan.y} width={plan.w} height={plan.h} rx="14" fill="#eef3f8" stroke="#cbd5e1" />
          <rect x={planX} y={planY} width={planW} height={planH} rx="6" fill="#f4efe7" stroke="#334155" strokeWidth="2" />
          <rect x={planX} y={planY} width={planW} height={planH} fill="url(#facadeLines)" opacity="0.55" />
          <path d={`M ${planX} ${planY} L ${ridgeX} ${planY - planH * 0.18} L ${planX + planW} ${planY} L ${planX + planW} ${planY + planH} L ${ridgeX} ${planY + planH + planH * 0.18} L ${planX} ${planY + planH} Z`} fill="url(#roofPreview)" opacity="0.9" stroke="#4a2a20" strokeWidth="2" />
          <line x1={ridgeX} y1={planY - planH * 0.18} x2={ridgeX} y2={planY + planH + planH * 0.18} stroke="#fff7ed" strokeWidth="3" opacity="0.75" />
          <rect x={ridgeX - planW * 0.22} y={planY + planH * 0.28} width={planW * 0.44} height={planH * 0.24} rx="3" fill="url(#panelPreview)" stroke="#111827" strokeWidth="3" />

          <line x1={planX + planW} y1={planY} x2={planX + planW} y2={planY + planH} stroke="#f59e0b" strokeWidth="5" cursor="ew-resize" onPointerDown={(event) => startDrag(event, 'length')} />
          <circle cx={planX + planW} cy={planY + planH / 2} r="11" fill="#f59e0b" stroke="white" strokeWidth="3" cursor="ew-resize" onPointerDown={(event) => startDrag(event, 'length')} />
          <line x1={planX} y1={planY + planH} x2={planX + planW} y2={planY + planH} stroke="#0ea5e9" strokeWidth="5" cursor="ns-resize" onPointerDown={(event) => startDrag(event, 'width')} />
          <circle cx={planX + planW / 2} cy={planY + planH} r="11" fill="#0ea5e9" stroke="white" strokeWidth="3" cursor="ns-resize" onPointerDown={(event) => startDrag(event, 'width')} />
          <text x={planX + planW + 18} y={planY + planH / 2 + 5} fill="#92400e" fontSize="12" fontWeight="800">{length.toFixed(1)} m</text>
          <text x={planX + planW / 2 - 22} y={planY + planH + 28} fill="#075985" fontSize="12" fontWeight="800">{width.toFixed(1)} m</text>
        </g>

        <g>
          <text x={elev.x} y={elev.y - 18} fill="#334155" fontSize="13" fontWeight="800">Gavel / höjder</text>
          <rect x={elev.x} y={elev.y} width={elev.w} height={elev.h} rx="14" fill="#eef3f8" stroke="#cbd5e1" />
          <path d={`M ${elev.x + 36} ${baseY} L ${elev.x + 36} ${eaveY} L ${elev.x + elev.w / 2} ${ridgeY} L ${elev.x + elev.w - 36} ${eaveY} L ${elev.x + elev.w - 36} ${baseY} Z`} fill="#f4efe7" stroke="#334155" strokeWidth="2" />
          <path d={`M ${elev.x + 36} ${eaveY} L ${elev.x + elev.w / 2} ${ridgeY} L ${elev.x + elev.w - 36} ${eaveY}`} fill="none" stroke="url(#roofPreview)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={elev.x + elev.w / 2} y1={ridgeY} x2={elev.x + elev.w / 2} y2={baseY} stroke="#94a3b8" strokeDasharray="5 5" />
          <line x1={elev.x + 36} y1={eaveY} x2={elev.x + elev.w - 36} y2={eaveY} stroke="#0ea5e9" strokeWidth="5" cursor="ns-resize" onPointerDown={(event) => startDrag(event, 'fascia')} />
          <circle cx={elev.x + elev.w / 2} cy={ridgeY} r="12" fill="#f59e0b" stroke="white" strokeWidth="3" cursor="ns-resize" onPointerDown={(event) => startDrag(event, 'ridge')} />
          <circle cx={elev.x + elev.w - 36} cy={eaveY} r="11" fill="#0ea5e9" stroke="white" strokeWidth="3" cursor="ns-resize" onPointerDown={(event) => startDrag(event, 'fascia')} />
          <text x={elev.x + elev.w / 2 + 16} y={ridgeY + 4} fill="#92400e" fontSize="12" fontWeight="800">Nock {nockHeight.toFixed(1)} m</text>
          <text x={elev.x + elev.w - 20} y={eaveY - 12} fill="#075985" fontSize="12" fontWeight="800">Vindskiva {fasciaHeight.toFixed(1)} m</text>
          <text x={elev.x + 40} y={baseY + 30} fill="#475569" fontSize="12" fontWeight="700">Taklutning {roofPitch}°</text>
        </g>

        <g transform="translate(56 414)">
          {[
            ['Längd', `${length.toFixed(1)} m`],
            ['Bredd', `${width.toFixed(1)} m`],
            ['Nockhöjd', `${nockHeight.toFixed(1)} m`],
            ['Vindskivehöjd', `${fasciaHeight.toFixed(1)} m`],
            ['Paneler', `${panelLayout.panelCount} st`],
          ].map(([label, value], index) => (
            <g key={label} transform={`translate(${index * 158} 0)`}>
              <rect width="142" height="58" rx="14" fill="white" stroke="#dbe3ee" />
              <text x="14" y="22" fill="#64748b" fontSize="10" fontWeight="800" letterSpacing="1.2">{label.toUpperCase()}</text>
              <text x="14" y="44" fill="#0f172a" fontSize="18" fontWeight="900">{value}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
function Technical3DModel({ model, solar, shadeLoss, siteData, onModelChange }) {
  const panelLayout = calculatePanelLayout(model);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><ScanLine className="h-4 w-4" /> Teknisk analysvy</div>
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · Premium takvisualisering</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Skugga {shadeLoss.toFixed(0)}%</div>
      </div>
      <div className="bg-slate-50 p-3 sm:p-5">
        <ParametricHouse3D model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} onModelChange={onModelChange} />
        <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Byggnad</b><br />{model.buildingLength} x {model.buildingWidth} m</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Tak</b><br />{model.roofType} · {model.roofPitch}°</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Paneler</b><br />{panelLayout.panelCount} st · {panelLayout.installedKw.toFixed(1)} kWp</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Platsdata</b><br />{siteData?.elevation?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'Ej hämtad'}</div>
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

  const setBuildingDimension = (key, value) => {
    setModel((current) => {
      const next = { ...current, [key]: value };
      if (key === 'fasciaHeight') next.buildingHeight = value;
      const fascia = Number(next.fasciaHeight || next.buildingHeight || 4.2);
      const nock = Math.max(fascia + 0.2, Number(next.nockHeight || fascia + 2));
      const widthM = Math.max(0.1, Number(next.buildingWidth || 8));
      const pitch = Math.round(Math.atan((nock - fascia) / (widthM / 2)) * 180 / Math.PI);
      return { ...next, fasciaHeight: fascia, nockHeight: nock, buildingHeight: fascia, roofPitch: clamp(pitch, 1, 60) };
    });
  };

  const buildingFields = [
    ['buildingLength', 'Längd', 'm', 0.1], ['buildingWidth', 'Bredd', 'm', 0.1],
    ['nockHeight', 'Nockhöjd', 'm', 0.1], ['fasciaHeight', 'Vindskivehöjd', 'm', 0.1],
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
                {buildingFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => setBuildingDimension(key, value)} suffix={suffix} step={step} />)}
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
            <Technical3DModel model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} onModelChange={setModel} />

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
