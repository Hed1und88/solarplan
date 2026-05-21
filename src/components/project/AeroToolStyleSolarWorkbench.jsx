// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  Box,
  Building2,
  CheckCircle2,
  CircuitBoard,
  FileText,
  Gauge,
  Grid3X3,
  Layers3,
  Plus,
  RotateCcw,
  Save,
  Sun,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Project3DBuildingPreview from '@/components/project/Project3DBuildingPreview';
import { createSolarProject3D, deriveRoofSurfacesFromBuilding } from '@/lib/solarplan3d/model';
import { solarProject3DStorage } from '@/lib/solarplan3d/storage';
import { autoPlacePanels, calculateUsableRoofAreaM2 } from '@/lib/solarplan3d/layout';
import { calculateIndicativeShading } from '@/lib/solarplan3d/shading';
import { calculateStringDesigns, createDefaultStringDesign } from '@/lib/solarplan3d/electrical';
import { calculateInstalledKwp, calculateProductionEstimate } from '@/lib/solarplan3d/production';
import { calculateSolarEconomics } from '@/lib/solarplan3d/economics';

const projectTypes = { new_system: 'Ny anläggning', extension: 'Utbyggnad', offgrid: 'Off-grid' };
const roofTypes = { gable: 'Sadeltak', single_slope: 'Pulpettak', flat: 'Platt tak', hip: 'Valmat tak' };
const orientations = { portrait: 'Stående', landscape: 'Liggande' };
const weatherLabels = { sunny: 'Soligt', light_clouds: 'Lätta moln', cloudy: 'Molnigt', rain: 'Regn' };
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const workModes = [
  ['project', 'Projekt', FileText],
  ['building', 'Byggnad', Building2],
  ['roof', 'Takytor', Layers3],
  ['panels', 'Paneler', Grid3X3],
  ['electrical', 'Strängar', CircuitBoard],
  ['production', 'Produktion', Sun],
];

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const fmt = (value, digits = 0) => n(value).toLocaleString('sv-SE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const percent = (value) => `${fmt(value, 1)}%`;

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange, step = 0.1, min, unit }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type="number"
          min={min}
          step={step}
          value={value ?? ''}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-9 border-slate-700 bg-slate-950 pr-12 text-slate-100 focus-visible:ring-amber-400"
        />
        {unit && <span className="absolute right-3 top-2.5 text-xs text-slate-500">{unit}</span>}
      </div>
    </Field>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-slate-100 outline-none focus:border-amber-400"
      >
        {Object.entries(options).map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
      </select>
    </Field>
  );
}

function Metric({ label, value, tone = 'slate', sub }) {
  const classes = {
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    blue: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
    red: 'border-red-400/30 bg-red-400/10 text-red-200',
    slate: 'border-slate-700 bg-slate-900/80 text-slate-100',
  };
  return (
    <div className={`rounded-2xl border p-3 ${classes[tone] || classes.slate}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] opacity-70">{sub}</div>}
    </div>
  );
}

function ModeButton({ mode, activeMode, label, Icon, onClick }) {
  const active = mode === activeMode;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${active ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function StatusPill({ status }) {
  if (status === 'saved') return <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-200"><CheckCircle2 className="h-4 w-4" />Sparad</span>;
  if (status === 'saving') return <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-200"><Gauge className="h-4 w-4 animate-pulse" />Sparar</span>;
  if (status === 'error') return <span className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-black text-red-200"><AlertTriangle className="h-4 w-4" />Fel vid sparning</span>;
  return <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-200"><AlertTriangle className="h-4 w-4" />Osparade ändringar</span>;
}

function RoofPlan({ roofSurface, panelGroups, obstacles, activeGroupId, setActiveGroupId }) {
  const width = 460;
  const height = 260;
  const rw = Math.max(1, n(roofSurface?.widthM, 12));
  const rh = Math.max(1, n(roofSurface?.heightM, 5));
  const scale = Math.min((width - 60) / rw, (height - 60) / rh);
  const ox = (width - rw * scale) / 2;
  const oy = (height - rh * scale) / 2;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        <span>Planvy takyta</span>
        <span>{roofSurface?.name || 'Takyta'}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full">
        <defs>
          <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#cadGrid)" />
        <rect x={ox} y={oy} width={rw * scale} height={rh * scale} rx="8" fill="#0f172a" stroke="#f59e0b" strokeWidth="2.5" />
        <text x={ox + 10} y={oy + 22} fill="#fef3c7" fontSize="12" fontWeight="900">{fmt(rw, 1)} x {fmt(rh, 1)} m</text>
        {panelGroups.filter((group) => group.roofSurfaceId === roofSurface?.id).map((group, index) => {
          const active = group.id === activeGroupId;
          const gx = ox + n(group.startXM, 0) * scale;
          const gy = oy + n(group.startYM, 0) * scale;
          const cols = Math.max(1, n(group.columns, 1));
          const rows = Math.max(1, n(group.rows, 1));
          const cellW = group.orientation === 'landscape' ? 30 : 18;
          const cellH = group.orientation === 'landscape' ? 18 : 30;
          return (
            <g key={group.id} onClick={() => setActiveGroupId(group.id)} className="cursor-pointer">
              {Array.from({ length: Math.min(120, rows * cols) }).map((_, panelIndex) => {
                const col = panelIndex % cols;
                const row = Math.floor(panelIndex / cols);
                return <rect key={panelIndex} x={gx + col * (cellW + 3)} y={gy + row * (cellH + 3)} width={cellW} height={cellH} rx="2" fill={active ? '#f59e0b' : index % 2 ? '#38bdf8' : '#2563eb'} stroke="#020617" strokeWidth="1" />;
              })}
              <text x={gx} y={gy - 8} fill={active ? '#fbbf24' : '#cbd5e1'} fontSize="11" fontWeight="900">{group.name} · {group.panelCount || rows * cols} st</text>
            </g>
          );
        })}
        {(obstacles || []).filter((item) => item.roofSurfaceId === roofSurface?.id).map((obstacle) => (
          <g key={obstacle.id}>
            <rect x={ox + n(obstacle.xM) * scale} y={oy + n(obstacle.yM) * scale} width={Math.max(10, n(obstacle.widthM, 0.6) * scale)} height={Math.max(10, n(obstacle.depthM, 0.6) * scale)} rx="3" fill="#ef4444" stroke="#fee2e2" />
            <text x={ox + n(obstacle.xM) * scale} y={oy + n(obstacle.yM) * scale - 4} fill="#fecaca" fontSize="10" fontWeight="900">{obstacle.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StringStatus({ status }) {
  if (status === 'ok') return <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-black text-emerald-200">OK</span>;
  if (status === 'error') return <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-xs font-black text-red-200">FEL</span>;
  return <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-black text-amber-200">VARNING</span>;
}

function WorkPanel({ mode, project, patchProject, patchBuilding, patchPanelModel, patchInverter, patchWeather, roofSurface, patchRoofSurface, activeGroup, patchPanelGroup, addPanelGroup, autoPlaceActiveGroup, obstacles, addObstacle, patchObstacle, activeString, patchStringById, addString, roofSurfaces, panelGroups, setSelectedRoofSurfaceId }) {
  if (mode === 'project') {
    return (
      <div className="space-y-3">
        <Field label="Projektnamn"><Input value={project.name || ''} onChange={(event) => patchProject({ name: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
        <Field label="Kund"><Input value={project.customerName || ''} onChange={(event) => patchProject({ customerName: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
        <Field label="Adress"><Input value={project.address || ''} onChange={(event) => patchProject({ address: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
        <Field label="Elnätsområde"><Input value={project.gridArea || ''} onChange={(event) => patchProject({ gridArea: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
        <SelectField label="Projekttyp" value={project.projectType} onChange={(value) => patchProject({ projectType: value })} options={projectTypes} />
      </div>
    );
  }

  if (mode === 'building') {
    return (
      <div className="space-y-3">
        <SelectField label="Taktyp" value={project.building.roofType} onChange={(value) => patchBuilding({ roofType: value })} options={roofTypes} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Längd" value={project.building.lengthM} onChange={(value) => patchBuilding({ lengthM: value })} unit="m" />
          <NumberField label="Bredd" value={project.building.widthM} onChange={(value) => patchBuilding({ widthM: value })} unit="m" />
          <NumberField label="Takfotshöjd" value={project.building.heightM} onChange={(value) => patchBuilding({ heightM: value })} unit="m" />
          <NumberField label="Taklutning" value={project.building.roofPitchDeg} onChange={(value) => patchBuilding({ roofPitchDeg: value })} step={1} unit="°" />
          <NumberField label="Takazimut" value={project.building.azimuthDeg} onChange={(value) => patchBuilding({ azimuthDeg: value })} step={1} unit="°" />
          <NumberField label="Nockriktning" value={project.building.ridgeDirectionDeg} onChange={(value) => patchBuilding({ ridgeDirectionDeg: value })} step={1} unit="°" />
        </div>
      </div>
    );
  }

  if (mode === 'roof') {
    return (
      <div className="space-y-3">
        <SelectField label="Aktiv takyta" value={roofSurface?.id} onChange={setSelectedRoofSurfaceId} options={Object.fromEntries(roofSurfaces.map((surface) => [surface.id, surface.name]))} />
        <NumberField label="Riktning" value={roofSurface?.orientationDeg} onChange={(value) => patchRoofSurface(roofSurface.id, { orientationDeg: value })} step={1} unit="°" />
        <NumberField label="Lutning" value={roofSurface?.tiltDeg} onChange={(value) => patchRoofSurface(roofSurface.id, { tiltDeg: value })} step={1} unit="°" />
        <NumberField label="Användbar yta" value={roofSurface?.usableAreaM2} onChange={(value) => patchRoofSurface(roofSurface.id, { usableAreaM2: value })} unit="m²" />
        <Button onClick={addObstacle} variant="outline" className="w-full border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900"><Plus className="h-4 w-4" />Lägg till hinder</Button>
        <div className="space-y-2">
          {obstacles.filter((item) => item.roofSurfaceId === roofSurface?.id).map((obstacle) => (
            <div key={obstacle.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <Field label="Hinder"><Input value={obstacle.name} onChange={(event) => patchObstacle(obstacle.id, { name: event.target.value })} className="border-slate-700 bg-slate-900 text-slate-100" /></Field>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField label="X" value={obstacle.xM} onChange={(value) => patchObstacle(obstacle.id, { xM: value })} unit="m" />
                <NumberField label="Y" value={obstacle.yM} onChange={(value) => patchObstacle(obstacle.id, { yM: value })} unit="m" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'panels') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">Panelmodell och panelgrupp påverkar taklayout, kWp, produktion och strängkontroll.</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tillverkare"><Input value={project.panelModel.manufacturer || ''} onChange={(event) => patchPanelModel({ manufacturer: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
          <Field label="Modell"><Input value={project.panelModel.model || ''} onChange={(event) => patchPanelModel({ model: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
          <NumberField label="Effekt" value={project.panelModel.powerWp} onChange={(value) => patchPanelModel({ powerWp: value })} step={5} unit="Wp" />
          <NumberField label="Voc" value={project.panelModel.voc} onChange={(value) => patchPanelModel({ voc: value })} unit="V" />
          <NumberField label="Bredd" value={project.panelModel.widthMm} onChange={(value) => patchPanelModel({ widthMm: value })} step={1} unit="mm" />
          <NumberField label="Höjd" value={project.panelModel.heightMm} onChange={(value) => patchPanelModel({ heightMm: value })} step={1} unit="mm" />
        </div>
        <Button onClick={addPanelGroup} className="w-full bg-amber-400 font-black text-slate-950 hover:bg-amber-300"><Plus className="h-4 w-4" />Ny panelgrupp</Button>
        {activeGroup && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <Field label="Panelgrupp"><Input value={activeGroup.name} onChange={(event) => patchPanelGroup(activeGroup.id, { name: event.target.value })} className="border-slate-700 bg-slate-900 text-slate-100" /></Field>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <NumberField label="Rader" value={activeGroup.rows} onChange={(value) => patchPanelGroup(activeGroup.id, { rows: value, panelCount: value * n(activeGroup.columns) })} step={1} />
              <NumberField label="Kolumner" value={activeGroup.columns} onChange={(value) => patchPanelGroup(activeGroup.id, { columns: value, panelCount: n(activeGroup.rows) * value })} step={1} />
              <NumberField label="Start X" value={activeGroup.startXM} onChange={(value) => patchPanelGroup(activeGroup.id, { startXM: value })} unit="m" />
              <NumberField label="Start Y" value={activeGroup.startYM} onChange={(value) => patchPanelGroup(activeGroup.id, { startYM: value })} unit="m" />
            </div>
            <SelectField label="Orientering" value={activeGroup.orientation} onChange={(value) => patchPanelGroup(activeGroup.id, { orientation: value })} options={orientations} />
            <Button onClick={autoPlaceActiveGroup} variant="outline" className="mt-3 w-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800">Autoplacera på takyta</Button>
            <div className="mt-3 space-y-1 text-xs text-slate-300">
              <div className="font-black uppercase tracking-[0.12em] text-slate-500">Parallellkoppling</div>
              {panelGroups.filter((group) => group.id !== activeGroup.id).map((group) => (
                <label key={group.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={(activeGroup.isParallelWithGroupIds || []).includes(group.id)}
                    onChange={(event) => {
                      const current = activeGroup.isParallelWithGroupIds || [];
                      patchPanelGroup(activeGroup.id, { isParallelWithGroupIds: event.target.checked ? Array.from(new Set([...current, group.id])) : current.filter((id) => id !== group.id) });
                    }}
                  />
                  {activeGroup.name} parallell med {group.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'electrical') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Växelriktare"><Input value={project.inverterModel.manufacturer || ''} onChange={(event) => patchInverter({ manufacturer: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
          <Field label="Modell"><Input value={project.inverterModel.model || ''} onChange={(event) => patchInverter({ model: event.target.value })} className="border-slate-700 bg-slate-950 text-slate-100" /></Field>
          <NumberField label="MPPT" value={project.inverterModel.mpptCount} onChange={(value) => patchInverter({ mpptCount: value })} step={1} />
          <NumberField label="Strängar/MPPT" value={project.inverterModel.stringsPerMppt} onChange={(value) => patchInverter({ stringsPerMppt: value })} step={1} />
          <NumberField label="Max DC V" value={project.inverterModel.maxDcVoltage} onChange={(value) => patchInverter({ maxDcVoltage: value })} step={10} unit="V" />
          <NumberField label="Max A/MPPT" value={project.inverterModel.maxCurrentPerMppt} onChange={(value) => patchInverter({ maxCurrentPerMppt: value })} unit="A" />
        </div>
        <Button onClick={addString} className="w-full bg-amber-400 font-black text-slate-950 hover:bg-amber-300"><Plus className="h-4 w-4" />Ny sträng</Button>
        {activeString && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="MPPT" value={activeString.mpptIndex} onChange={(value) => patchStringById(activeString.id, { mpptIndex: value })} step={1} />
              <NumberField label="Paneler i serie" value={activeString.panelCount} onChange={(value) => patchStringById(activeString.id, { panelCount: value })} step={1} />
            </div>
            <Field label="Panelgrupp">
              <select value={activeString.panelGroupId || ''} onChange={(event) => patchStringById(activeString.id, { panelGroupId: event.target.value })} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100">
                {panelGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SelectField label="Väder" value={project.weatherScenario.weather} onChange={(value) => patchWeather({ weather: value })} options={weatherLabels} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Månad" value={project.weatherScenario.month} onChange={(value) => patchWeather({ month: value })} step={1} min={1} />
        <NumberField label="Timme" value={project.weatherScenario.hour} onChange={(value) => patchWeather({ hour: value })} step={1} min={0} />
        <NumberField label="Temp" value={project.weatherScenario.ambientTempC} onChange={(value) => patchWeather({ ambientTempC: value })} step={1} unit="°C" />
        <NumberField label="Specifik yield" value={project.productionEstimate.specificYieldKwhPerKwpYear} onChange={(value) => patchProject({ productionEstimate: { ...project.productionEstimate, specificYieldKwhPerKwpYear: value } })} step={10} unit="kWh/kWp" />
      </div>
    </div>
  );
}

export default function AeroToolStyleSolarWorkbench() {
  const [project, setProject] = useState(() => createSolarProject3D());
  const [status, setStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [mode, setMode] = useState('building');
  const [selectedRoofSurfaceId, setSelectedRoofSurfaceId] = useState('');
  const [activeGroupId, setActiveGroupId] = useState('panel-group-1');
  const [activeStringId, setActiveStringId] = useState('string-1');

  useEffect(() => {
    solarProject3DStorage.loadLatest().then((loaded) => {
      setProject(loaded);
      setSelectedRoofSurfaceId(loaded.roofSurfaces[0]?.id || '');
      setActiveGroupId(loaded.panelGroups[0]?.id || '');
      setActiveStringId(loaded.strings[0]?.id || '');
      setLastSavedAt(loaded.updatedAt || '');
      setStatus('saved');
    });
  }, []);

  const roofSurface = project.roofSurfaces.find((surface) => surface.id === selectedRoofSurfaceId) || project.roofSurfaces[0];
  const activeGroup = project.panelGroups.find((group) => group.id === activeGroupId) || project.panelGroups[0];
  const activeString = project.strings.find((item) => item.id === activeStringId) || project.strings[0];
  const installedSummary = useMemo(() => calculateInstalledKwp(project.panelGroups, project.panelModel), [project.panelGroups, project.panelModel]);
  const shadingAnalysis = useMemo(() => calculateIndicativeShading({ panelGroups: project.panelGroups, obstacles: project.obstacles, month: project.weatherScenario.month, hour: project.weatherScenario.hour }), [project.panelGroups, project.obstacles, project.weatherScenario]);
  const strings = useMemo(() => calculateStringDesigns({
    panelModel: project.panelModel,
    inverterModel: project.inverterModel,
    strings: project.strings,
    panelGroups: project.panelGroups,
    roofSurfaces: project.roofSurfaces,
    coldTempC: project.stringTemperatureScenario?.coldTempC ?? -20,
    operatingTempC: project.stringTemperatureScenario?.operatingTempC ?? 45,
  }), [project.panelModel, project.inverterModel, project.strings, project.panelGroups, project.roofSurfaces, project.stringTemperatureScenario]);
  const production = useMemo(() => calculateProductionEstimate({
    panelGroups: project.panelGroups,
    panelModel: project.panelModel,
    specificYieldKwhPerKwpYear: project.productionEstimate.specificYieldKwhPerKwpYear ?? 900,
    shadingLossPercent: shadingAnalysis.shadingLossPercent,
    weather: project.weatherScenario.weather,
    ambientTempC: project.weatherScenario.ambientTempC,
  }), [project.panelGroups, project.panelModel, project.productionEstimate.specificYieldKwhPerKwpYear, shadingAnalysis.shadingLossPercent, project.weatherScenario.weather, project.weatherScenario.ambientTempC]);
  const economy = useMemo(() => calculateSolarEconomics({
    annualProductionKwh: production.annualKwh,
    annualElectricityConsumptionKwh: project.economics.annualElectricityConsumptionKwh,
    electricityPriceSekKwh: project.economics.electricityPriceSekKwh,
    gridFeeSekKwh: project.economics.gridFeeSekKwh,
    taxesAndFeesSekKwh: project.economics.taxesAndFeesSekKwh,
    sellPriceSekKwh: project.economics.sellPriceSekKwh,
    selfConsumptionPercent: project.economics.selfConsumptionPercent ?? project.productionEstimate.selfConsumptionPercent,
    systemCostSek: project.economics.systemCostSek,
    greenDeductionSek: project.economics.greenDeductionSek,
  }), [production.annualKwh, project.economics, project.productionEstimate.selfConsumptionPercent]);

  const setDirty = () => setStatus('idle');
  const patchProject = (patch) => { setProject((current) => ({ ...current, ...patch })); setDirty(); };
  const patchBuilding = (patch) => {
    setProject((current) => {
      const building = { ...current.building, ...patch };
      const roofSurfaces = deriveRoofSurfacesFromBuilding(building);
      return { ...current, building, roofSurfaces, panelGroups: [], obstacles: [] };
    });
    setSelectedRoofSurfaceId('');
    setActiveGroupId('');
    setDirty();
  };
  const patchPanelModel = (patch) => { setProject((current) => ({ ...current, panelModel: { ...current.panelModel, ...patch } })); setDirty(); };
  const patchInverter = (patch) => { setProject((current) => ({ ...current, inverterModel: { ...current.inverterModel, ...patch } })); setDirty(); };
  const patchWeather = (patch) => { setProject((current) => ({ ...current, weatherScenario: { ...current.weatherScenario, ...patch } })); setDirty(); };
  const patchRoofSurface = (id, patch) => { setProject((current) => ({ ...current, roofSurfaces: current.roofSurfaces.map((surface) => surface.id === id ? { ...surface, ...patch, usableAreaM2: patch.usableAreaM2 ?? calculateUsableRoofAreaM2({ ...surface, ...patch }) } : surface) })); setDirty(); };
  const patchPanelGroup = (id, patch) => { setProject((current) => ({ ...current, panelGroups: current.panelGroups.map((group) => group.id === id ? { ...group, ...patch } : group) })); setDirty(); };
  const patchObstacle = (id, patch) => { setProject((current) => ({ ...current, obstacles: current.obstacles.map((obstacle) => obstacle.id === id ? { ...obstacle, ...patch } : obstacle) })); setDirty(); };
  const patchStringById = (id, patch) => { setProject((current) => ({ ...current, strings: current.strings.map((item) => item.id === id ? { ...item, ...patch } : item) })); setDirty(); };

  const addPanelGroup = () => {
    const id = `panel-group-${Date.now()}`;
    setProject((current) => ({ ...current, panelGroups: [...current.panelGroups, { id, roofSurfaceId: roofSurface?.id || current.roofSurfaces[0]?.id, panelModelId: current.panelModel?.id || 'panel-standard', name: `Panelgrupp ${current.panelGroups.length + 1}`, orientation: 'portrait', panelCount: 0, rows: 2, columns: 6, startXM: 0.5, startYM: 0.5, spacingMm: 30, edgeMarginMm: 300, isParallelWithGroupIds: [], usedAreaM2: 0, panels: [] }] }));
    setActiveGroupId(id);
    setMode('panels');
    setDirty();
  };
  const autoPlaceActiveGroup = () => {
    if (!activeGroup || !roofSurface) return;
    const result = autoPlacePanels({ roofSurface, panelModel: project.panelModel, settings: activeGroup });
    patchPanelGroup(activeGroup.id, { ...result, panelModelId: project.panelModel.id || 'panel-standard' });
  };
  const addObstacle = () => {
    const id = `obstacle-${Date.now()}`;
    setProject((current) => ({ ...current, obstacles: [...current.obstacles, { id, type: 'chimney', name: 'Hinder', roofSurfaceId: roofSurface?.id || current.roofSurfaces[0]?.id, xM: 1, yM: 1, widthM: 0.6, heightM: 1, depthM: 0.6, shadowRelevant: true }] }));
    setDirty();
  };
  const addString = () => {
    const id = `string-${Date.now()}`;
    setProject((current) => ({ ...current, strings: [...current.strings, createDefaultStringDesign({ id, mpptIndex: 1, panelGroupId: current.panelGroups[0]?.id || '', panelCount: current.panelGroups[0]?.panelCount || 0 })] }));
    setActiveStringId(id);
    setDirty();
  };

  const saveProject = async () => {
    setStatus('saving');
    try {
      const saved = await solarProject3DStorage.save({ ...project, strings, productionEstimate: { ...project.productionEstimate, ...production }, economics: { ...project.economics, ...economy }, shadingAnalysis });
      setProject(saved);
      setLastSavedAt(saved.updatedAt || '');
      setStatus('saved');
    } catch (error) {
      console.error('Could not save 3D workbench', error);
      setStatus('error');
    }
  };

  const loadLatest = async () => {
    const loaded = await solarProject3DStorage.loadLatest();
    setProject(loaded);
    setSelectedRoofSurfaceId(loaded.roofSurfaces[0]?.id || '');
    setActiveGroupId(loaded.panelGroups[0]?.id || '');
    setActiveStringId(loaded.strings[0]?.id || '');
    setLastSavedAt(loaded.updatedAt || '');
    setStatus('saved');
  };

  const worstStringStatus = strings.some((item) => item.status === 'error') ? 'error' : strings.some((item) => item.status === 'warning') ? 'warning' : 'ok';

  return (
    <div className="min-h-full bg-[#070b12] text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950 px-4 py-3 lg:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-300"><Box className="h-6 w-6" /></div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.26em] text-amber-300">SolarPlan Engineering Workbench</div>
              <h1 className="text-2xl font-black tracking-tight text-white">3D projektering · tak · paneler · strängkontroll</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>{project.name}</span>
                <span>•</span>
                <span>{project.customerName || 'Kund saknas'}</span>
                <span>•</span>
                <span>{project.address || 'Adress saknas'}</span>
                {lastSavedAt && <><span>•</span><span>Sparad {new Date(lastSavedAt).toLocaleString('sv-SE')}</span></>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <Button variant="outline" onClick={loadLatest} className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"><RotateCcw className="h-4 w-4" />Ladda senaste</Button>
            <Button onClick={saveProject} disabled={status === 'saving'} className="bg-amber-400 font-black text-slate-950 hover:bg-amber-300"><Save className="h-4 w-4" />Spara</Button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1800px] gap-4 p-4 lg:grid-cols-[270px_minmax(0,1fr)_360px] lg:p-6">
        <aside className="space-y-3">
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100 shadow-2xl">
            <CardContent className="space-y-2 p-3">
              {workModes.map(([value, label, Icon]) => <ModeButton key={value} mode={value} activeMode={mode} label={label} Icon={Icon} onClick={() => setMode(value)} />)}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-slate-100 shadow-2xl">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><Gauge className="h-4 w-4 text-amber-300" />Indata</div>
              <WorkPanel
                mode={mode}
                project={project}
                patchProject={patchProject}
                patchBuilding={patchBuilding}
                patchPanelModel={patchPanelModel}
                patchInverter={patchInverter}
                patchWeather={patchWeather}
                roofSurface={roofSurface}
                patchRoofSurface={patchRoofSurface}
                activeGroup={activeGroup}
                patchPanelGroup={patchPanelGroup}
                addPanelGroup={addPanelGroup}
                autoPlaceActiveGroup={autoPlaceActiveGroup}
                obstacles={project.obstacles}
                addObstacle={addObstacle}
                patchObstacle={patchObstacle}
                activeString={activeString}
                patchStringById={patchStringById}
                addString={addString}
                roofSurfaces={project.roofSurfaces}
                panelGroups={project.panelGroups}
                setSelectedRoofSurfaceId={setSelectedRoofSurfaceId}
              />
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="Installerat" value={`${fmt(installedSummary.installedKwp, 2)} kWp`} tone="amber" sub={`${installedSummary.totalPanels || 0} paneler`} />
            <Metric label="Årsproduktion" value={`${fmt(production.annualKwh)} kWh`} tone="emerald" sub={`${project.productionEstimate.specificYieldKwhPerKwpYear} kWh/kWp`} />
            <Metric label="Skuggförlust" value={percent(shadingAnalysis.shadingLossPercent)} tone={shadingAnalysis.shadingLossPercent > 15 ? 'red' : 'blue'} sub="indikativ kontroll" />
            <Metric label="Strängstatus" value={worstStringStatus === 'ok' ? 'OK' : worstStringStatus === 'error' ? 'FEL' : 'VARNING'} tone={worstStringStatus === 'ok' ? 'emerald' : worstStringStatus === 'error' ? 'red' : 'amber'} sub={`${strings.length} strängar`} />
            <Metric label="Ekonomi" value={`${fmt(economy.annualSavingsSek)} kr/år`} tone="slate" sub={economy.paybackYears ? `${fmt(economy.paybackYears, 1)} år återbetalning` : 'kostnad saknas'} />
          </div>

          <Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} panelModel={project.panelModel} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <RoofPlan roofSurface={roofSurface} panelGroups={project.panelGroups} obstacles={project.obstacles} activeGroupId={activeGroupId} setActiveGroupId={setActiveGroupId} />
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><CircuitBoard className="h-4 w-4 text-amber-300" />MPPT / strängkontroll</div>
              <div className="space-y-2">
                {strings.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => { setActiveStringId(item.id); setMode('electrical'); }} className={`w-full rounded-xl border p-3 text-left transition ${activeStringId === item.id ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-black">Slinga {index + 1} · MPPT {item.mpptIndex || 1}</div>
                      <StringStatus status={item.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-slate-400">
                      <span>Paneler {item.panelCount || 0}</span>
                      <span>Voc {fmt(item.calculatedVocCold, 0)} V</span>
                      <span>Vmp {fmt(item.calculatedVmpOperating, 0)} V</span>
                      <span>DC {fmt(n(item.calculatedDcPowerW) / 1000, 2)} kW</span>
                    </div>
                    {Array.isArray(item.messages) && item.messages.length > 0 && <div className="mt-2 text-xs text-amber-200">{item.messages[0]}</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><Sun className="h-4 w-4 text-amber-300" />Månadsproduktion</div>
              <div className="text-xs text-slate-500">Efter skugg-, väder- och temperaturförluster</div>
            </div>
            <div className="grid grid-cols-12 gap-2">
              {(production.monthlyKwh || []).map((value, index) => {
                const max = Math.max(...(production.monthlyKwh || [1]).map((item) => n(item, 0)), 1);
                return (
                  <div key={monthLabels[index]} className="flex h-44 flex-col justify-end gap-2">
                    <div className="text-center text-[10px] font-bold text-slate-500">{fmt(value)}</div>
                    <div className="mx-auto w-full rounded-t-md bg-gradient-to-t from-amber-500 to-yellow-200" style={{ height: `${Math.max(4, (n(value) / max) * 132)}px` }} />
                    <div className="text-center text-[10px] font-black text-slate-400">{monthLabels[index]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/70 text-slate-100 shadow-2xl">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><Zap className="h-4 w-4 text-amber-300" />Teknisk kontroll</div>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Panel</div><div className="font-black">{project.panelModel.manufacturer} {project.panelModel.model}</div><div className="text-xs text-slate-400">{project.panelModel.powerWp} Wp · Voc {project.panelModel.voc} V · Imp {project.panelModel.imp} A</div></div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Växelriktare</div><div className="font-black">{project.inverterModel.manufacturer} {project.inverterModel.model}</div><div className="text-xs text-slate-400">{project.inverterModel.mpptCount} MPPT · max {project.inverterModel.maxDcVoltage} V · {project.inverterModel.maxCurrentPerMppt} A/MPPT</div></div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Aktiv takyta</div><div className="font-black">{roofSurface?.name}</div><div className="text-xs text-slate-400">{fmt(roofSurface?.orientationDeg, 0)}° · {fmt(roofSurface?.tiltDeg, 0)}° · {fmt(roofSurface?.usableAreaM2, 1)} m² användbar yta</div></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-slate-100 shadow-2xl">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><Layers3 className="h-4 w-4 text-amber-300" />Panelgrupper</div>
              <div className="space-y-2">
                {project.panelGroups.length === 0 && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Inga panelgrupper. Lägg till en grupp och autoplacera den.</div>}
                {project.panelGroups.map((group) => (
                  <button key={group.id} type="button" onClick={() => { setActiveGroupId(group.id); setMode('panels'); }} className={`w-full rounded-xl border p-3 text-left text-sm transition ${activeGroupId === group.id ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                    <div className="font-black">{group.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{group.rows || 0} x {group.columns || 0} · {group.panelCount || 0} paneler · {group.orientation === 'landscape' ? 'liggande' : 'stående'}</div>
                    {(group.isParallelWithGroupIds || []).length > 0 && <div className="mt-1 text-xs text-amber-200">Parallell med {(group.isParallelWithGroupIds || []).length} grupp(er)</div>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-slate-100 shadow-2xl">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-300"><Battery className="h-4 w-4 text-amber-300" />Rapportunderlag</div>
              <div className="space-y-2 text-sm text-slate-300">
                <div className="flex justify-between border-b border-slate-800 py-2"><span>Total takyta</span><b>{fmt(project.roofSurfaces.reduce((sum, surface) => sum + n(surface.widthM) * n(surface.heightM), 0), 1)} m²</b></div>
                <div className="flex justify-between border-b border-slate-800 py-2"><span>Användbar takyta</span><b>{fmt(project.roofSurfaces.reduce((sum, surface) => sum + n(surface.usableAreaM2), 0), 1)} m²</b></div>
                <div className="flex justify-between border-b border-slate-800 py-2"><span>Paneler</span><b>{installedSummary.totalPanels || 0} st</b></div>
                <div className="flex justify-between border-b border-slate-800 py-2"><span>Årsproduktion</span><b>{fmt(production.annualKwh)} kWh</b></div>
                <div className="flex justify-between py-2"><span>Årsnytta</span><b>{fmt(economy.annualSavingsSek)} kr</b></div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
