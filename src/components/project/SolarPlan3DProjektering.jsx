// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Box, CheckCircle2, Clock3, FileText, Printer, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Project3DBuildingPreview from '@/components/project/Project3DBuildingPreview';
import { createSolarProject3D, deriveRoofSurfacesFromBuilding } from '@/lib/solarplan3d/model';
import { solarProject3DStorage } from '@/lib/solarplan3d/storage';
import { autoPlacePanels, calculateUsableRoofAreaM2, zoneOutsideRoof } from '@/lib/solarplan3d/layout';
import { calculateIndicativeShading } from '@/lib/solarplan3d/shading';
import { calculateStringDesigns, createDefaultStringDesign } from '@/lib/solarplan3d/electrical';
import { calculateInstalledKwp, calculateProductionEstimate } from '@/lib/solarplan3d/production';
import { calculateHeatPumpReplacementSavings, calculateSolarEconomics } from '@/lib/solarplan3d/economics';
import { getManualSiteDataNotice, getSiteDataAdapterStatuses } from '@/lib/solarplan3d/dataSourceAdapters';

const tabs = [
  ['projekt', 'Projekt'],
  ['byggnad', 'Byggnad'],
  ['takytor', 'Takytor'],
  ['paneler', 'Paneler'],
  ['hinder', 'Hinder & skuggning'],
  ['vaxelriktare', 'Växelriktare & strängar'],
  ['produktion', 'Produktion'],
  ['ekonomi', 'Ekonomi'],
  ['rapport', 'Rapport'],
];

const projectTypes = { new_system: 'Ny anläggning', extension: 'Utbyggnad', offgrid: 'Off-grid' };
const roofTypes = { gable: 'Sadeltak', single_slope: 'Pulpettak', flat: 'Platt tak', hip: 'Valmat tak' };
const weatherLabels = { sunny: 'Soligt', light_clouds: 'Lätta moln', cloudy: 'Molnigt', rain: 'Regn' };
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const obstacleTypes = {
  chimney: 'Skorsten',
  roof_window: 'Takfönster',
  vent: 'Ventilation',
  tree: 'Träd',
  nearby_building: 'Intilliggande byggnad',
  antenna: 'Antenn',
  roof_ladder: 'Takstege',
  snow_guard: 'Snörasskydd',
  custom: 'Anpassat hinder',
};
const saveStatus = {
  idle: { label: 'Ej sparad', className: 'border-amber-200 bg-amber-50 text-amber-800', icon: Clock3 },
  saving: { label: 'Sparar...', className: 'border-blue-200 bg-blue-50 text-blue-800', icon: Clock3 },
  saved: { label: 'Sparad', className: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
  error: { label: 'Fel vid sparning', className: 'border-red-200 bg-red-50 text-red-800', icon: AlertTriangle },
};

function Field({ label, children }) {
  return <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function SelectField({ value, onChange, options }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
      {Object.entries(options).map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function NumberInput({ value, onChange, min, step = 0.1 }) {
  return <Input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />;
}

function SectionCard({ title, children }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function ReportSection({ title, children }) {
  return (
    <section className="break-inside-avoid rounded-xl border bg-white p-5">
      <h3 className="mb-3 text-lg font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function ReportGrid({ items }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
          <div className="mt-1 font-medium text-slate-950">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            {columns.map((column) => <th key={column} className="px-3 py-2 font-semibold text-slate-700">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join('-')}-${index}`} className="border-b last:border-0">
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2 align-top text-slate-800">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function selectObject(items, id, fallback) {
  return items.find((item) => item.id === id) || items[0] || fallback;
}

export default function SolarPlan3DProjektering() {
  const [activeTab, setActiveTab] = useState('projekt');
  const [project, setProject] = useState(() => createSolarProject3D());
  const [status, setStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [selectedRoofSurfaceId, setSelectedRoofSurfaceId] = useState('');
  const [showReportPreview, setShowReportPreview] = useState(true);
  const [siteDataMessage, setSiteDataMessage] = useState('');

  useEffect(() => {
    solarProject3DStorage.loadLatest().then((loaded) => {
      setProject(loaded);
      setSelectedRoofSurfaceId(loaded.roofSurfaces[0]?.id || '');
      setLastSavedAt(loaded.updatedAt || '');
      setStatus('saved');
    });
  }, []);

  const defaultProject = useMemo(() => createSolarProject3D(), []);
  const roofSurface = selectObject(project.roofSurfaces, selectedRoofSurfaceId, defaultProject.roofSurfaces[0]);
  const shadingAnalysis = useMemo(() => calculateIndicativeShading({
    panelGroups: project.panelGroups,
    obstacles: project.obstacles,
    month: project.weatherScenario.month,
    hour: project.weatherScenario.hour,
  }), [project.panelGroups, project.obstacles, project.weatherScenario.month, project.weatherScenario.hour]);
  const calculatedStrings = useMemo(() => calculateStringDesigns({
    panelModel: project.panelModel,
    inverterModel: project.inverterModel,
    strings: project.strings,
    panelGroups: project.panelGroups,
    roofSurfaces: project.roofSurfaces,
    coldTempC: project.stringTemperatureScenario?.coldTempC ?? -20,
    operatingTempC: project.stringTemperatureScenario?.operatingTempC ?? 45,
  }), [project.panelModel, project.inverterModel, project.strings, project.panelGroups, project.roofSurfaces, project.stringTemperatureScenario]);

  const installedSummary = useMemo(() => calculateInstalledKwp(project.panelGroups, project.panelModel), [project.panelGroups, project.panelModel]);
  const installedKwp = installedSummary.installedKwp;
  const productionEstimate = useMemo(() => calculateProductionEstimate({
    panelGroups: project.panelGroups,
    panelModel: project.panelModel,
    specificYieldKwhPerKwpYear: project.productionEstimate.specificYieldKwhPerKwpYear ?? 900,
    shadingLossPercent: shadingAnalysis.shadingLossPercent,
    weather: project.weatherScenario.weather,
    ambientTempC: project.weatherScenario.ambientTempC,
  }), [project.panelGroups, project.panelModel, project.productionEstimate.specificYieldKwhPerKwpYear, shadingAnalysis.shadingLossPercent, project.weatherScenario.weather, project.weatherScenario.ambientTempC]);
  const economyEstimate = useMemo(() => calculateSolarEconomics({
    annualProductionKwh: productionEstimate.annualKwh,
    annualElectricityConsumptionKwh: project.economics.annualElectricityConsumptionKwh,
    electricityPriceSekKwh: project.economics.electricityPriceSekKwh,
    gridFeeSekKwh: project.economics.gridFeeSekKwh,
    taxesAndFeesSekKwh: project.economics.taxesAndFeesSekKwh,
    sellPriceSekKwh: project.economics.sellPriceSekKwh,
    selfConsumptionPercent: project.economics.selfConsumptionPercent ?? project.productionEstimate.selfConsumptionPercent,
    systemCostSek: project.economics.systemCostSek,
    greenDeductionSek: project.economics.greenDeductionSek,
    includeBattery: project.economics.includeBattery,
    batteryCostSek: project.economics.batteryCostSek,
    batterySelfConsumptionIncreasePercent: project.economics.batterySelfConsumptionIncreasePercent,
  }), [productionEstimate.annualKwh, project.economics, project.productionEstimate.selfConsumptionPercent]);
  const heatPumpEstimate = useMemo(() => calculateHeatPumpReplacementSavings({
    currentHeatingConsumptionKwh: project.economics.heatPumpReplacement?.currentHeatingConsumptionKwh,
    currentCOP: project.economics.heatPumpReplacement?.currentCOP,
    newCOP: project.economics.heatPumpReplacement?.newCOP,
    electricityCostSekKwh: project.economics.heatPumpReplacement?.electricityCostSekKwh ?? economyEstimate.totalElectricityCostSekKwh,
    investmentSek: project.economics.heatPumpReplacement?.investmentSek,
  }), [project.economics.heatPumpReplacement, economyEstimate.totalElectricityCostSekKwh]);
  const totalUsableRoofAreaM2 = useMemo(() => project.roofSurfaces.reduce((sum, surface) => sum + Number(surface.usableAreaM2 || 0), 0), [project.roofSurfaces]);
  const materialList = useMemo(() => {
    const materials = [
      ['Paneler', `${installedSummary.totalPanels} st ${project.panelModel.manufacturer} ${project.panelModel.model}`],
      ['Växelriktare', `${project.inverterModel.manufacturer} ${project.inverterModel.model}`],
      ['Montagesystem', 'Placeholder - dimensioneras efter taktyp och infästning'],
      ['Optimerare', 'Placeholder - läggs till vid behov'],
      ['Kabel', 'Placeholder - dimensioneras efter strängdragning'],
      ['Brytare/skydd', 'Placeholder - dimensioneras enligt vald eldesign'],
    ];
    if (project.economics.includeBattery) materials.push(['Batteri', `${project.economics.batteryCapacityKwh || 0} kWh, kostnad ${Number(project.economics.batteryCostSek || 0).toLocaleString('sv-SE')} SEK`]);
    return materials;
  }, [installedSummary.totalPanels, project.panelModel, project.inverterModel, project.economics.includeBattery, project.economics.batteryCapacityKwh, project.economics.batteryCostSek]);
  const siteDataStatuses = useMemo(() => getSiteDataAdapterStatuses(), []);

  const setDirty = () => setStatus('idle');
  const patchProject = (patch) => { setProject((current) => ({ ...current, ...patch })); setDirty(); };
  const patchBuilding = (patch) => {
    setProject((current) => {
      const building = { ...current.building, ...patch };
      const roofSurfaces = deriveRoofSurfacesFromBuilding(building);
      setSelectedRoofSurfaceId(roofSurfaces[0]?.id || '');
      return { ...current, building, roofSurfaces, panelGroups: [], obstacles: [] };
    });
    setDirty();
  };
  const patchRoofSurface = (roofSurfaceId, patch) => {
    setProject((current) => ({
      ...current,
      roofSurfaces: current.roofSurfaces.map((surface) => {
        if (surface.id !== roofSurfaceId) return surface;
        const next = { ...surface, ...patch };
        return { ...next, usableAreaM2: calculateUsableRoofAreaM2(next) };
      }),
    }));
    setDirty();
  };
  const patchPanelModel = (patch) => { setProject((current) => ({ ...current, panelModel: { ...current.panelModel, ...patch } })); setDirty(); };
  const patchPanelGroup = (groupId, patch) => {
    setProject((current) => ({
      ...current,
      panelGroups: current.panelGroups.map((group) => group.id === groupId ? { ...group, ...patch } : group),
    }));
    setDirty();
  };
  const patchObstacle = (obstacleId, patch) => {
    setProject((current) => ({ ...current, obstacles: current.obstacles.map((obstacle) => obstacle.id === obstacleId ? { ...obstacle, ...patch } : obstacle) }));
    setDirty();
  };
  const patchWeather = (patch) => { setProject((current) => ({ ...current, weatherScenario: { ...current.weatherScenario, ...patch } })); setDirty(); };
  const patchProduction = (patch) => { setProject((current) => ({ ...current, productionEstimate: { ...current.productionEstimate, ...patch } })); setDirty(); };
  const patchEconomics = (patch) => { setProject((current) => ({ ...current, economics: { ...current.economics, ...patch } })); setDirty(); };
  const patchHeatPump = (patch) => { setProject((current) => ({ ...current, economics: { ...current.economics, heatPumpReplacement: { ...current.economics.heatPumpReplacement, ...patch } } })); setDirty(); };
  const patchReport = (patch) => { setProject((current) => ({ ...current, reportSettings: { ...current.reportSettings, ...patch } })); setDirty(); };
  const patchInverter = (patch) => { setProject((current) => ({ ...current, inverterModel: { ...current.inverterModel, ...patch } })); setDirty(); };
  const patchTemperatureScenario = (patch) => { setProject((current) => ({ ...current, stringTemperatureScenario: { ...current.stringTemperatureScenario, ...patch } })); setDirty(); };
  const patchStringById = (stringId, patch) => { setProject((current) => ({ ...current, strings: current.strings.map((item) => item.id === stringId ? { ...item, ...patch } : item) })); setDirty(); };
  const addString = () => {
    setProject((current) => ({
      ...current,
      strings: [...current.strings, createDefaultStringDesign({
        id: `string-${Date.now()}`,
        mpptIndex: 1,
        panelGroupId: current.panelGroups[0]?.id || '',
        panelCount: current.panelGroups[0]?.panelCount || 0,
      })],
    }));
    setDirty();
  };

  const addExcludedZone = () => {
    patchRoofSurface(roofSurface.id, {
      excludedZones: [...(roofSurface.excludedZones || []), {
        id: `excluded-${Date.now()}`,
        roofSurfaceId: roofSurface.id,
        name: 'Ny exkluderad zon',
        xM: 1,
        yM: 1,
        widthM: 1,
        heightM: 1,
      }],
    });
  };
  const patchExcludedZone = (zoneId, patch) => patchRoofSurface(roofSurface.id, {
    excludedZones: (roofSurface.excludedZones || []).map((zone) => zone.id === zoneId ? { ...zone, ...patch } : zone),
  });

  const addPanelGroup = () => {
    setProject((current) => ({
      ...current,
      panelGroups: [...current.panelGroups, {
        id: `panel-group-${Date.now()}`,
        roofSurfaceId: roofSurface.id,
        panelModelId: current.panelModel?.id || 'panel-standard',
        name: `Panelgrupp ${current.panelGroups.length + 1}`,
        orientation: 'portrait',
        panelCount: 0,
        rows: 0,
        columns: 0,
        startXM: 0.3,
        startYM: 0.3,
        spacingMm: 30,
        edgeMarginMm: 300,
        isParallelWithGroupIds: [],
        usedAreaM2: 0,
        panels: [],
      }],
    }));
    setDirty();
  };
  const autoPlacePanelGroup = (groupId) => {
    const group = project.panelGroups.find((item) => item.id === groupId);
    const surface = project.roofSurfaces.find((item) => item.id === group?.roofSurfaceId);
    if (!group || !surface) return;
    const result = autoPlacePanels({ roofSurface: surface, panelModel: project.panelModel, settings: group });
    patchPanelGroup(groupId, { ...result, panelModelId: project.panelModel.id || 'panel-standard' });
  };
  const toggleParallelGroup = (groupId, parallelGroupId, checked) => {
    const group = project.panelGroups.find((item) => item.id === groupId);
    const current = group?.isParallelWithGroupIds || [];
    patchPanelGroup(groupId, { isParallelWithGroupIds: checked ? Array.from(new Set([...current, parallelGroupId])) : current.filter((id) => id !== parallelGroupId) });
  };
  const addObstacle = () => {
    setProject((current) => ({
      ...current,
      obstacles: [...current.obstacles, {
        id: `obstacle-${Date.now()}`,
        type: 'chimney',
        name: 'Nytt hinder',
        roofSurfaceId: roofSurface.id,
        xM: 1,
        yM: 1,
        widthM: 0.6,
        heightM: 1,
        depthM: 0.6,
        shadowRelevant: true,
      }],
    }));
    setDirty();
  };

  const saveProject = async () => {
    setStatus('saving');
    try {
      const projectToSave = {
        ...project,
        strings: calculatedStrings,
        productionEstimate: { ...project.productionEstimate, ...productionEstimate },
        economics: {
          ...project.economics,
          ...economyEstimate,
          heatPumpReplacement: { ...project.economics.heatPumpReplacement, ...heatPumpEstimate },
        },
        shadingAnalysis,
      };
      const saved = await solarProject3DStorage.save(projectToSave);
      setProject(saved);
      setLastSavedAt(saved.updatedAt);
      setStatus('saved');
    } catch (error) {
      console.error('Could not save SolarPlan 3D project', error);
      setStatus('error');
    }
  };
  const loadLatest = async () => {
    const loaded = await solarProject3DStorage.loadLatest();
    setProject(loaded);
    setSelectedRoofSurfaceId(loaded.roofSurfaces[0]?.id || '');
    setLastSavedAt(loaded.updatedAt || '');
    setStatus('saved');
  };
  const printReport = () => {
    setShowReportPreview(true);
    window.setTimeout(() => window.print(), 50);
  };
  const fetchPreparedSiteData = () => {
    setSiteDataMessage(getManualSiteDataNotice());
  };

  const statusConfig = saveStatus[status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-full bg-muted/40 p-4 pb-24 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Box className="h-4 w-4" />SolarPlan 3D Projektering</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{project.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{project.customerName || 'Ingen kund angiven'} · {project.address || 'Ingen adress angiven'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{projectTypes[project.projectType]}</span>
                <span>Installerad effekt: {installedKwp.toFixed(2)} kWp</span>
                {lastSavedAt && <span>Senast sparad: {new Date(lastSavedAt).toLocaleString('sv-SE')}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.className}`}><StatusIcon className="h-4 w-4" />{statusConfig.label}</div>
              <Button variant="outline" onClick={loadLatest}><RotateCcw className="h-4 w-4" />Ladda senaste</Button>
              <Button onClick={saveProject} disabled={status === 'saving'}><Save className="h-4 w-4" />Spara projekt</Button>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl p-1">
            {tabs.map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-9 flex-1 basis-[140px] text-xs sm:flex-none">{label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="projekt">
            <SectionCard title="Projektuppgifter">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Projektnamn"><Input value={project.name} onChange={(event) => patchProject({ name: event.target.value })} /></Field>
                  <Field label="Kund"><Input value={project.customerName} onChange={(event) => patchProject({ customerName: event.target.value })} /></Field>
                  <Field label="Adress"><Input value={project.address} onChange={(event) => patchProject({ address: event.target.value })} /></Field>
                  <Field label="Elnätsområde"><Input value={project.gridArea} onChange={(event) => patchProject({ gridArea: event.target.value })} /></Field>
                  <Field label="Projekttyp"><SelectField value={project.projectType} onChange={(value) => patchProject({ projectType: value })} options={projectTypes} /></Field>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Platsdata - kommande datakällor</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Manuell projektering är aktiv. Framtida datakällor är förberedda som adaptrar utan API-nycklar eller externa frontend-anrop.</p>
                    </div>
                    <Button variant="outline" onClick={fetchPreparedSiteData}>Hämta platsdata</Button>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {siteDataStatuses.map((item) => (
                      <div key={item.label} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">{item.statusText}</span>
                      </div>
                    ))}
                  </div>
                  {siteDataMessage && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{siteDataMessage}</div>}
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="byggnad">
            <SectionCard title="Byggnad">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Längd (m)"><NumberInput value={project.building.lengthM} onChange={(value) => patchBuilding({ lengthM: value })} min={1} /></Field>
                  <Field label="Bredd (m)"><NumberInput value={project.building.widthM} onChange={(value) => patchBuilding({ widthM: value })} min={1} /></Field>
                  <Field label="Byggnadshöjd (m)"><NumberInput value={project.building.heightM} onChange={(value) => patchBuilding({ heightM: value })} min={1} /></Field>
                  <Field label="Taktyp"><SelectField value={project.building.roofType} onChange={(value) => patchBuilding({ roofType: value })} options={roofTypes} /></Field>
                  <Field label="Taklutning (°)"><NumberInput value={project.building.roofPitchDeg} onChange={(value) => patchBuilding({ roofPitchDeg: value })} min={0} step={1} /></Field>
                  <Field label="Takriktning / azimut (°)"><NumberInput value={project.building.azimuthDeg} onChange={(value) => patchBuilding({ azimuthDeg: value })} min={0} step={1} /></Field>
                  <Field label="Nockriktning (°)"><NumberInput value={project.building.ridgeDirectionDeg} onChange={(value) => patchBuilding({ ridgeDirectionDeg: value })} min={0} step={1} /></Field>
                </div>
                <Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} shadingAnalysis={shadingAnalysis} />
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="takytor">
            <SectionCard title="Takytor">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Välj takyta"><select value={roofSurface.id} onChange={(event) => setSelectedRoofSurfaceId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">{project.roofSurfaces.map((surface) => <option key={surface.id} value={surface.id}>{surface.name}</option>)}</select></Field>
                  <Field label="Namn"><Input value={roofSurface.name} onChange={(event) => patchRoofSurface(roofSurface.id, { name: event.target.value })} /></Field>
                  <Field label="Orientering (°)"><NumberInput value={roofSurface.orientationDeg} onChange={(value) => patchRoofSurface(roofSurface.id, { orientationDeg: value })} min={0} step={1} /></Field>
                  <Field label="Lutning (°)"><NumberInput value={roofSurface.tiltDeg} onChange={(value) => patchRoofSurface(roofSurface.id, { tiltDeg: value })} min={0} step={1} /></Field>
                  <Field label="Bredd (m)"><NumberInput value={roofSurface.widthM} onChange={(value) => patchRoofSurface(roofSurface.id, { widthM: value })} min={0} /></Field>
                  <Field label="Höjd/takfall (m)"><NumberInput value={roofSurface.heightM} onChange={(value) => patchRoofSurface(roofSurface.id, { heightM: value })} min={0} /></Field>
                  <Field label="Användbar yta (m²)"><Input value={roofSurface.usableAreaM2} readOnly className="bg-muted" /></Field>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div><h3 className="font-semibold">Exkluderade zoner</h3><p className="text-sm text-muted-foreground">Zoner minskar placerbar yta och blockar autoplacering.</p></div>
                    <Button variant="outline" onClick={addExcludedZone}>Lägg till zon</Button>
                  </div>
                  <div className="space-y-3">
                    {(roofSurface.excludedZones || []).length === 0 && <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Inga exkluderade zoner på vald takyta.</div>}
                    {(roofSurface.excludedZones || []).map((zone) => {
                      const outside = zoneOutsideRoof(zone, roofSurface);
                      return (
                        <div key={zone.id} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-5 ${outside ? 'border-amber-300 bg-amber-50' : 'bg-muted/20'}`}>
                          <Field label="Namn"><Input value={zone.name} onChange={(event) => patchExcludedZone(zone.id, { name: event.target.value })} /></Field>
                          <Field label="X (m)"><NumberInput value={zone.xM} onChange={(value) => patchExcludedZone(zone.id, { xM: value })} min={0} /></Field>
                          <Field label="Y (m)"><NumberInput value={zone.yM} onChange={(value) => patchExcludedZone(zone.id, { yM: value })} min={0} /></Field>
                          <Field label="Bredd (m)"><NumberInput value={zone.widthM} onChange={(value) => patchExcludedZone(zone.id, { widthM: value })} min={0} /></Field>
                          <Field label="Höjd (m)"><NumberInput value={zone.heightM} onChange={(value) => patchExcludedZone(zone.id, { heightM: value })} min={0} /></Field>
                          {outside && <div className="md:col-span-5 text-sm font-medium text-amber-800">Varning: zonen ligger helt eller delvis utanför takytan.</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} shadingAnalysis={shadingAnalysis} />
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="paneler">
            <SectionCard title="Paneler">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Tillverkare"><Input value={project.panelModel.manufacturer} onChange={(event) => patchPanelModel({ manufacturer: event.target.value })} /></Field>
                  <Field label="Modell"><Input value={project.panelModel.model} onChange={(event) => patchPanelModel({ model: event.target.value })} /></Field>
                  <Field label="Effekt (Wp)"><NumberInput value={project.panelModel.powerWp} onChange={(value) => patchPanelModel({ powerWp: value })} min={0} step={5} /></Field>
                  <Field label="Bredd (mm)"><NumberInput value={project.panelModel.widthMm} onChange={(value) => patchPanelModel({ widthMm: value })} min={0} step={1} /></Field>
                  <Field label="Höjd (mm)"><NumberInput value={project.panelModel.heightMm} onChange={(value) => patchPanelModel({ heightMm: value })} min={0} step={1} /></Field>
                  <Field label="Voc"><NumberInput value={project.panelModel.voc} onChange={(value) => patchPanelModel({ voc: value })} min={0} /></Field>
                  <Field label="Vmp"><NumberInput value={project.panelModel.vmp} onChange={(value) => patchPanelModel({ vmp: value })} min={0} /></Field>
                  <Field label="Isc"><NumberInput value={project.panelModel.isc} onChange={(value) => patchPanelModel({ isc: value })} min={0} /></Field>
                  <Field label="Imp"><NumberInput value={project.panelModel.imp} onChange={(value) => patchPanelModel({ imp: value })} min={0} /></Field>
                </div>
                <div className="flex justify-end"><Button onClick={addPanelGroup}>Skapa panelgrupp</Button></div>
                <div className="space-y-4">
                  {project.panelGroups.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Skapa en panelgrupp och klicka Autoplacera paneler.</div>}
                  {project.panelGroups.map((group) => (
                    <div key={group.id} className="rounded-xl border bg-background p-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <Field label="Gruppnamn"><Input value={group.name} onChange={(event) => patchPanelGroup(group.id, { name: event.target.value })} /></Field>
                        <Field label="Takyta"><select value={group.roofSurfaceId} onChange={(event) => patchPanelGroup(group.id, { roofSurfaceId: event.target.value, panels: [], panelCount: 0 })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">{project.roofSurfaces.map((surface) => <option key={surface.id} value={surface.id}>{surface.name}</option>)}</select></Field>
                        <Field label="Orientering"><SelectField value={group.orientation} onChange={(value) => patchPanelGroup(group.id, { orientation: value })} options={{ portrait: 'Stående', landscape: 'Liggande' }} /></Field>
                        <Field label="Kantavstånd (mm)"><NumberInput value={group.edgeMarginMm} onChange={(value) => patchPanelGroup(group.id, { edgeMarginMm: value })} min={0} step={1} /></Field>
                        <Field label="Avstånd mellan paneler (mm)"><NumberInput value={group.spacingMm} onChange={(value) => patchPanelGroup(group.id, { spacingMm: value })} min={0} step={1} /></Field>
                        <Field label="Start X (m)"><NumberInput value={group.startXM} onChange={(value) => patchPanelGroup(group.id, { startXM: value })} min={0} /></Field>
                        <Field label="Start Y (m)"><NumberInput value={group.startYM} onChange={(value) => patchPanelGroup(group.id, { startYM: value })} min={0} /></Field>
                        <div className="flex items-end"><Button onClick={() => autoPlacePanelGroup(group.id)} className="w-full">Autoplacera paneler</Button></div>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-4">
                        <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Rader</div><div className="text-xl font-bold">{group.rows}</div></div>
                        <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Kolumner</div><div className="text-xl font-bold">{group.columns}</div></div>
                        <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-xl font-bold">{group.panelCount}</div></div>
                        <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Effekt / yta</div><div className="text-xl font-bold">{((group.panelCount || 0) * project.panelModel.powerWp / 1000).toFixed(2)} kWp · {(group.usedAreaM2 || 0).toFixed(1)} m²</div></div>
                      </div>
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
                        <b>MPPT/sträng:</b> {calculatedStrings.filter((item) => item.panelGroupId === group.id || (item.parallelGroupIds || []).includes(group.id)).map((item) => `MPPT ${item.mpptIndex} (${item.status})`).join(', ') || 'Ej tilldelad'}
                      </div>
                      {project.panelGroups.length > 1 && (
                        <div className="mt-4 rounded-lg border p-3">
                          <div className="mb-2 text-sm font-semibold">Parallellkoppling</div>
                          <div className="flex flex-wrap gap-3">
                            {project.panelGroups.filter((item) => item.id !== group.id).map((other) => (
                              <label key={other.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={(group.isParallelWithGroupIds || []).includes(other.id)} onChange={(event) => toggleParallelGroup(group.id, other.id, event.target.checked)} />
                                {group.name} är parallell med {other.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} shadingAnalysis={shadingAnalysis} />
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="hinder">
            <SectionCard title="Hinder & skuggning">
              <div className="space-y-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <b>{shadingAnalysis.label}</b>
                  <div className="mt-1">Solriktning {shadingAnalysis.sun.azimuthDeg}° · solhöjd {shadingAnalysis.sun.altitudeDeg}° · skuggförlust {shadingAnalysis.shadingLossPercent}%</div>
                  <div className="mt-1">{shadingAnalysis.messages.join(' ')}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Månad"><NumberInput value={project.weatherScenario.month} onChange={(value) => patchWeather({ month: value })} min={1} step={1} /></Field>
                  <Field label="Timme"><NumberInput value={project.weatherScenario.hour} onChange={(value) => patchWeather({ hour: value })} min={0} step={1} /></Field>
                  <div className="flex items-end"><Button variant="outline" onClick={addObstacle} className="w-full">Lägg till hinder</Button></div>
                </div>
                <div className="space-y-3">
                  {project.obstacles.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Inga hinder tillagda ännu.</div>}
                  {project.obstacles.map((obstacle) => (
                    <div key={obstacle.id} className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-4">
                      <Field label="Namn"><Input value={obstacle.name} onChange={(event) => patchObstacle(obstacle.id, { name: event.target.value })} /></Field>
                      <Field label="Typ"><SelectField value={obstacle.type} onChange={(value) => patchObstacle(obstacle.id, { type: value })} options={obstacleTypes} /></Field>
                      <Field label="Takyta"><select value={obstacle.roofSurfaceId} onChange={(event) => patchObstacle(obstacle.id, { roofSurfaceId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">{project.roofSurfaces.map((surface) => <option key={surface.id} value={surface.id}>{surface.name}</option>)}</select></Field>
                      <Field label="X (m)"><NumberInput value={obstacle.xM} onChange={(value) => patchObstacle(obstacle.id, { xM: value })} min={0} /></Field>
                      <Field label="Y (m)"><NumberInput value={obstacle.yM} onChange={(value) => patchObstacle(obstacle.id, { yM: value })} min={0} /></Field>
                      <Field label="Bredd (m)"><NumberInput value={obstacle.widthM} onChange={(value) => patchObstacle(obstacle.id, { widthM: value })} min={0} /></Field>
                      <Field label="Höjd (m)"><NumberInput value={obstacle.heightM} onChange={(value) => patchObstacle(obstacle.id, { heightM: value })} min={0} /></Field>
                      <Field label="Djup (m)"><NumberInput value={obstacle.depthM} onChange={(value) => patchObstacle(obstacle.id, { depthM: value })} min={0} /></Field>
                      <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" checked={obstacle.shadowRelevant} onChange={(event) => patchObstacle(obstacle.id, { shadowRelevant: event.target.checked })} />Skuggningsrelevant</label>
                    </div>
                  ))}
                </div>
                <Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} shadingAnalysis={shadingAnalysis} />
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="vaxelriktare">
            <SectionCard title="Växelriktarmodell och strängdesign">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Tillverkare"><Input value={project.inverterModel.manufacturer} onChange={(event) => patchInverter({ manufacturer: event.target.value })} /></Field>
                  <Field label="Modell"><Input value={project.inverterModel.model} onChange={(event) => patchInverter({ model: event.target.value })} /></Field>
                  <Field label="Max DC-spänning (V)"><NumberInput value={project.inverterModel.maxDcVoltage} onChange={(value) => patchInverter({ maxDcVoltage: value })} min={0} step={1} /></Field>
                  <Field label="Startspänning (V)"><NumberInput value={project.inverterModel.startupVoltage} onChange={(value) => patchInverter({ startupVoltage: value })} min={0} step={1} /></Field>
                  <Field label="MPPT minspänning (V)"><NumberInput value={project.inverterModel.mpptVoltageMin} onChange={(value) => patchInverter({ mpptVoltageMin: value })} min={0} step={1} /></Field>
                  <Field label="MPPT maxspänning (V)"><NumberInput value={project.inverterModel.mpptVoltageMax} onChange={(value) => patchInverter({ mpptVoltageMax: value })} min={0} step={1} /></Field>
                  <Field label="Max ström per MPPT (A)"><NumberInput value={project.inverterModel.maxCurrentPerMppt} onChange={(value) => patchInverter({ maxCurrentPerMppt: value })} min={0} /></Field>
                  <Field label="Max kortslutningsström per MPPT (A)"><NumberInput value={project.inverterModel.maxShortCircuitCurrentPerMppt} onChange={(value) => patchInverter({ maxShortCircuitCurrentPerMppt: value })} min={0} /></Field>
                  <Field label="Max DC-effekt (W)"><NumberInput value={project.inverterModel.maxDcPowerW} onChange={(value) => patchInverter({ maxDcPowerW: value })} min={0} step={100} /></Field>
                  <Field label="Antal MPPT"><NumberInput value={project.inverterModel.mpptCount} onChange={(value) => patchInverter({ mpptCount: value })} min={1} step={1} /></Field>
                  <Field label="Strängar per MPPT"><NumberInput value={project.inverterModel.stringsPerMppt} onChange={(value) => patchInverter({ stringsPerMppt: value })} min={1} step={1} /></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Min dimensionerande temperatur (°C)"><NumberInput value={project.stringTemperatureScenario?.coldTempC ?? -20} onChange={(value) => patchTemperatureScenario({ coldTempC: value })} step={1} /></Field>
                  <Field label="Driftstemperatur (°C)"><NumberInput value={project.stringTemperatureScenario?.operatingTempC ?? 45} onChange={(value) => patchTemperatureScenario({ operatingTempC: value })} step={1} /></Field>
                  <div className="flex items-end"><Button variant="outline" onClick={addString} className="w-full">Lägg till sträng</Button></div>
                </div>
                <div className="space-y-4">
                  {calculatedStrings.map((stringItem) => (
                    <div key={stringItem.id} className={`rounded-xl border p-4 ${stringItem.status === 'error' ? 'border-red-200 bg-red-50' : stringItem.status === 'warning' ? 'border-amber-200 bg-amber-50' : 'bg-background'}`}>
                      <div className="grid gap-4 md:grid-cols-4">
                        <Field label="MPPT"><NumberInput value={stringItem.mpptIndex} onChange={(value) => patchStringById(stringItem.id, { mpptIndex: value })} min={1} step={1} /></Field>
                        <Field label="Panelgrupp">
                          <select value={stringItem.panelGroupId} onChange={(event) => patchStringById(stringItem.id, { panelGroupId: event.target.value, panelCount: project.panelGroups.find((group) => group.id === event.target.value)?.panelCount || stringItem.panelCount })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
                            <option value="">Välj panelgrupp</option>
                            {project.panelGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Paneler i serie"><NumberInput value={stringItem.panelCount} onChange={(value) => patchStringById(stringItem.id, { panelCount: value })} min={1} step={1} /></Field>
                        <div className="rounded-lg bg-white/70 p-3 text-sm"><b>Status:</b> {stringItem.status === 'ok' ? 'OK' : stringItem.status === 'warning' ? 'Varning' : 'Fel'}</div>
                      </div>
                      <div className="mt-4 rounded-lg border bg-white/70 p-3">
                        <div className="mb-2 text-sm font-semibold">Parallella panelgrupper</div>
                        <div className="flex flex-wrap gap-3">
                          {project.panelGroups.filter((group) => group.id !== stringItem.panelGroupId).map((group) => (
                            <label key={group.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={(stringItem.parallelGroupIds || []).includes(group.id)} onChange={(event) => patchStringById(stringItem.id, { parallelGroupIds: event.target.checked ? Array.from(new Set([...(stringItem.parallelGroupIds || []), group.id])) : (stringItem.parallelGroupIds || []).filter((id) => id !== group.id) })} />
                              {project.panelGroups.find((item) => item.id === stringItem.panelGroupId)?.name || 'Vald panelgrupp'} är parallell med {group.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-5">
                        <div className="rounded-lg bg-white/70 p-3"><div className="text-xs text-muted-foreground">Voc kallt</div><div className="font-bold">{stringItem.calculatedVocCold} V</div></div>
                        <div className="rounded-lg bg-white/70 p-3"><div className="text-xs text-muted-foreground">Vmp drift</div><div className="font-bold">{stringItem.calculatedVmpOperating} V</div></div>
                        <div className="rounded-lg bg-white/70 p-3"><div className="text-xs text-muted-foreground">Isc</div><div className="font-bold">{stringItem.calculatedIsc} A</div></div>
                        <div className="rounded-lg bg-white/70 p-3"><div className="text-xs text-muted-foreground">DC-effekt</div><div className="font-bold">{stringItem.calculatedDcPowerW} W</div></div>
                        <div className="rounded-lg bg-white/70 p-3"><div className="text-xs text-muted-foreground">Driftström</div><div className="font-bold">{stringItem.calculatedOperatingCurrent} A</div></div>
                      </div>
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{stringItem.messages.map((message) => <li key={message}>{message}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="produktion">
            <SectionCard title="Produktion">
              <div className="space-y-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Produktionsberäkningen är indikativ och ska verifieras mot platsdata, skuggning, växelriktare och lokala förutsättningar.
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Installerat system</h3>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Metric label="Total paneler" value={installedSummary.totalPanels} />
                    <Metric label="Total kWp" value={`${productionEstimate.installedKwp.toFixed(2)} kWp`} />
                    <Metric label="Panelgrupper" value={project.panelGroups.length} />
                    <Metric label="Växelriktare" value={`${project.inverterModel.manufacturer} ${project.inverterModel.model}`} />
                    <Metric label="MPPT/strängstatus" value={calculatedStrings.some((item) => item.status === 'error') ? 'Fel' : calculatedStrings.some((item) => item.status === 'warning') ? 'Varning' : 'OK'} />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Väderscenario</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Månad"><NumberInput value={project.weatherScenario.month} onChange={(value) => patchWeather({ month: value })} min={1} step={1} /></Field>
                    <Field label="Tid på dygnet"><NumberInput value={project.weatherScenario.hour} onChange={(value) => patchWeather({ hour: value })} min={0} step={1} /></Field>
                    <Field label="Väder"><SelectField value={project.weatherScenario.weather} onChange={(value) => patchWeather({ weather: value })} options={weatherLabels} /></Field>
                    <Field label="Omgivningstemperatur °C"><NumberInput value={project.weatherScenario.ambientTempC} onChange={(value) => patchWeather({ ambientTempC: value })} step={1} /></Field>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Produktionsinställningar</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Specifik produktion kWh/kWp/år"><NumberInput value={project.productionEstimate.specificYieldKwhPerKwpYear ?? 900} onChange={(value) => patchProduction({ specificYieldKwhPerKwpYear: value })} min={0} step={10} /></Field>
                    <Field label="Skuggförlust (%)"><Input value={productionEstimate.shadingLossPercent} readOnly className="bg-muted" /></Field>
                    <Field label="Väderförlust (%)"><Input value={productionEstimate.weatherLossPercent} readOnly className="bg-muted" /></Field>
                    <Field label="Temperaturförlust (%)"><Input value={productionEstimate.temperatureLossPercent} readOnly className="bg-muted" /></Field>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Resultat</h3>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Metric label="Beräknad årsproduktion" value={`${productionEstimate.annualKwh.toLocaleString('sv-SE')} kWh`} />
                    <Metric label="Förlust skuggning" value={`${productionEstimate.shadingLossPercent}%`} />
                    <Metric label="Förlust väder" value={`${productionEstimate.weatherLossPercent}%`} />
                    <Metric label="Förlust temperatur" value={`${productionEstimate.temperatureLossPercent}%`} />
                    <Metric label="Netto efter förluster" value={`${productionEstimate.netAfterLossesKwh.toLocaleString('sv-SE')} kWh`} />
                  </div>
                  <div className="mt-4 rounded-xl border bg-background p-4">
                    <div className="mb-3 text-sm font-semibold">Beräknad månadsproduktion</div>
                    <div className="grid gap-2 md:grid-cols-6">
                      {productionEstimate.monthlyKwh.map((kwh, index) => (
                        <div key={monthLabels[index]} className="rounded-lg bg-muted/50 px-3 py-2">
                          <div className="text-xs text-muted-foreground">{monthLabels[index]}</div>
                          <div className="font-semibold">{kwh.toLocaleString('sv-SE')} kWh</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="ekonomi">
            <SectionCard title="Ekonomi">
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Elpris och förbrukning</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Årlig elförbrukning kWh"><NumberInput value={project.economics.annualElectricityConsumptionKwh} onChange={(value) => patchEconomics({ annualElectricityConsumptionKwh: value })} min={0} step={100} /></Field>
                    <Field label="Elpris SEK/kWh"><NumberInput value={project.economics.electricityPriceSekKwh} onChange={(value) => patchEconomics({ electricityPriceSekKwh: value })} min={0} /></Field>
                    <Field label="Elnätsavgift SEK/kWh"><NumberInput value={project.economics.gridFeeSekKwh} onChange={(value) => patchEconomics({ gridFeeSekKwh: value })} min={0} /></Field>
                    <Field label="Skatt/moms/övrigt SEK/kWh"><NumberInput value={project.economics.taxesAndFeesSekKwh} onChange={(value) => patchEconomics({ taxesAndFeesSekKwh: value })} min={0} /></Field>
                    <Field label="Total använd kalkylkostnad SEK/kWh"><Input value={economyEstimate.totalElectricityCostSekKwh} readOnly className="bg-muted" /></Field>
                    <Field label="Egenanvändning %"><NumberInput value={project.economics.selfConsumptionPercent} onChange={(value) => patchEconomics({ selfConsumptionPercent: value })} min={0} step={1} /></Field>
                    <Field label="Ersättning för såld el SEK/kWh"><NumberInput value={project.economics.sellPriceSekKwh} onChange={(value) => patchEconomics({ sellPriceSekKwh: value })} min={0} /></Field>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Solcellsbesparing</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Beräknad årsproduktion" value={`${economyEstimate.annualProductionKwh.toLocaleString('sv-SE')} kWh`} />
                    <Metric label="Egenanvänd solel" value={`${economyEstimate.selfConsumedKwh.toLocaleString('sv-SE')} kWh`} />
                    <Metric label="Såld överskottsel" value={`${economyEstimate.soldSurplusKwh.toLocaleString('sv-SE')} kWh`} />
                    <Metric label="Besparing egenanvänd el" value={`${economyEstimate.selfConsumptionSavingsSek.toLocaleString('sv-SE')} SEK/år`} />
                    <Metric label="Intäkt såld el" value={`${economyEstimate.soldElectricityRevenueSek.toLocaleString('sv-SE')} SEK/år`} />
                    <Metric label="Total solcellsnytta" value={`${economyEstimate.totalSolarBenefitSek.toLocaleString('sv-SE')} SEK/år`} />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Investering</h3>
                  <div className="grid gap-4 md:grid-cols-5">
                    <Field label="Systemkostnad SEK"><NumberInput value={project.economics.systemCostSek} onChange={(value) => patchEconomics({ systemCostSek: value })} min={0} step={1000} /></Field>
                    <Field label="Grönt avdrag SEK"><NumberInput value={project.economics.greenDeductionSek} onChange={(value) => patchEconomics({ greenDeductionSek: value })} min={0} step={1000} /></Field>
                    <Metric label="Nettokostnad" value={`${economyEstimate.netSystemCostSek.toLocaleString('sv-SE')} SEK`} />
                    <Metric label="Årlig nytta" value={`${economyEstimate.annualSavingsSek.toLocaleString('sv-SE')} SEK`} />
                    <Metric label="Återbetalningstid" value={economyEstimate.paybackYears > 0 ? `${economyEstimate.paybackYears} år` : 'Ej beräknad'} />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Batteri</h3>
                  <div className="grid gap-4 md:grid-cols-5">
                    <label className="flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-medium"><input type="checkbox" checked={project.economics.includeBattery} onChange={(event) => patchEconomics({ includeBattery: event.target.checked })} />Inkludera batteri</label>
                    <Field label="Batterikapacitet kWh"><NumberInput value={project.economics.batteryCapacityKwh} onChange={(value) => patchEconomics({ batteryCapacityKwh: value })} min={0} /></Field>
                    <Field label="Batterikostnad SEK"><NumberInput value={project.economics.batteryCostSek} onChange={(value) => patchEconomics({ batteryCostSek: value })} min={0} step={1000} /></Field>
                    <Field label="Uppskattad ökad egenanvändning %"><NumberInput value={project.economics.batterySelfConsumptionIncreasePercent} onChange={(value) => patchEconomics({ batterySelfConsumptionIncreasePercent: value })} min={0} step={1} /></Field>
                    <Metric label="Justerad egenanvändning" value={`${economyEstimate.adjustedSelfConsumptionPercent}%`} />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Metric label="Justerad solcellsnytta" value={`${economyEstimate.totalSolarBenefitSek.toLocaleString('sv-SE')} SEK/år`} />
                    <Metric label="Återbetalning med batteri" value={economyEstimate.paybackYears > 0 ? `${economyEstimate.paybackYears} år` : 'Ej beräknad'} />
                  </div>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold">Besparing vid värmepumpsbyte</h3>
                  <p className="mb-3 text-sm text-muted-foreground">Förenklad kalkyl som beror på verklig byggnad, uppvärmningssystem, dimensionering och driftprofil.</p>
                  <div className="grid gap-4 md:grid-cols-5">
                    <Field label="Aktuell uppvärmningsförbrukning kWh/år"><NumberInput value={project.economics.heatPumpReplacement?.currentHeatingConsumptionKwh ?? 0} onChange={(value) => patchHeatPump({ currentHeatingConsumptionKwh: value })} min={0} step={100} /></Field>
                    <Field label="Nuvarande system COP/verkningsgrad"><NumberInput value={project.economics.heatPumpReplacement?.currentCOP ?? 1} onChange={(value) => patchHeatPump({ currentCOP: value })} min={0.1} /></Field>
                    <Field label="Ny värmepump COP/SCOP"><NumberInput value={project.economics.heatPumpReplacement?.newCOP ?? 3} onChange={(value) => patchHeatPump({ newCOP: value })} min={0.1} /></Field>
                    <Field label="Elpris SEK/kWh"><NumberInput value={project.economics.heatPumpReplacement?.electricityCostSekKwh ?? economyEstimate.totalElectricityCostSekKwh} onChange={(value) => patchHeatPump({ electricityCostSekKwh: value })} min={0} /></Field>
                    <Field label="Investering värmepump SEK"><NumberInput value={project.economics.heatPumpReplacement?.investmentSek ?? 0} onChange={(value) => patchHeatPump({ investmentSek: value })} min={0} step={1000} /></Field>
                    <Metric label="Beräknad ny förbrukning" value={`${heatPumpEstimate.newConsumptionKwh.toLocaleString('sv-SE')} kWh/år`} />
                    <Metric label="Beräknad besparing" value={`${heatPumpEstimate.savedKwh.toLocaleString('sv-SE')} kWh/år`} />
                    <Metric label="Beräknad besparing" value={`${heatPumpEstimate.savedSek.toLocaleString('sv-SE')} SEK/år`} />
                    <Metric label="Återbetalningstid" value={heatPumpEstimate.paybackYears > 0 ? `${heatPumpEstimate.paybackYears} år` : 'Ej beräknad'} />
                  </div>
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="rapport">
            <SectionCard title="Rapport">
              <style>{`@media print { body * { visibility: hidden; } #solarplan-3d-report, #solarplan-3d-report * { visibility: visible; } #solarplan-3d-report { position: absolute; inset: 0; width: 100%; } .solarplan-no-print { display: none !important; } }`}</style>
              <div className="space-y-6">
                <div className="solarplan-no-print grid gap-3 md:grid-cols-2">
                  {[
                    ['include3DImage', 'Inkludera 3D-bild'],
                    ['includePanelLayout', 'Inkludera panellayout'],
                    ['includeStringDiagram', 'Inkludera strängschema'],
                    ['includeMaterialList', 'Inkludera materiallista'],
                    ['includeEconomics', 'Inkludera ekonomi'],
                  ].map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium">{label}<input type="checkbox" checked={project.reportSettings[key]} onChange={(event) => patchReport({ [key]: event.target.checked })} /></label>)}
                </div>
                <div className="solarplan-no-print flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setShowReportPreview(true)}><FileText className="mr-2 h-4 w-4" />Förhandsgranska rapport</Button>
                  <Button onClick={printReport}><Printer className="mr-2 h-4 w-4" />Skriv ut / Exportera PDF</Button>
                </div>

                {showReportPreview && (
                  <div id="solarplan-3d-report" className="space-y-5 rounded-xl bg-white p-6 text-slate-900 shadow-sm print:shadow-none">
                    <header className="border-b pb-5">
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">SolarPlan 3D Projektering</div>
                      <h2 className="mt-1 text-3xl font-bold">{project.name}</h2>
                      <div className="mt-2 text-sm text-slate-600">Rapport skapad {new Date().toLocaleDateString('sv-SE')}</div>
                    </header>

                    <ReportSection title="1. Projektinformation">
                      <ReportGrid items={[
                        ['Projekt', project.name],
                        ['Kund', project.customerName || 'Ej angiven'],
                        ['Adress', project.address || 'Ej angiven'],
                        ['Projekttyp', projectTypes[project.projectType] || project.projectType],
                        ['Datum', new Date(project.updatedAt || project.createdAt).toLocaleDateString('sv-SE')],
                      ]} />
                    </ReportSection>

                    <ReportSection title="2. Byggnad">
                      <ReportGrid items={[
                        ['Mått', `${project.building.lengthM} x ${project.building.widthM} x ${project.building.heightM} m`],
                        ['Taktyp', roofTypes[project.building.roofType] || project.building.roofType],
                        ['Taklutning', `${project.building.roofPitchDeg}°`],
                        ['Takriktning', `${project.building.azimuthDeg}°`],
                        ['Takytor', `${project.roofSurfaces.length} st`],
                        ['Användbar takarea', `${totalUsableRoofAreaM2.toFixed(1)} m²`],
                      ]} />
                      <div className="mt-4">
                        <ReportTable columns={['Takyta', 'Riktning', 'Lutning', 'Area']} rows={project.roofSurfaces.map((surface) => [surface.name, `${surface.orientationDeg}°`, `${surface.tiltDeg}°`, `${surface.usableAreaM2} m² användbar`])} />
                      </div>
                    </ReportSection>

                    <ReportSection title="3. Panelplacering">
                      <ReportGrid items={[
                        ['Panelmodell', `${project.panelModel.manufacturer} ${project.panelModel.model}`],
                        ['Antal paneler', `${installedSummary.totalPanels} st`],
                        ['Total kWp', `${installedKwp.toFixed(2)} kWp`],
                        ['Panelgrupper', `${project.panelGroups.length} st`],
                        ['Hinder', `${project.obstacles.length} st`],
                        ['Exkluderade zoner', `${project.roofSurfaces.reduce((sum, surface) => sum + (surface.excludedZones?.length || 0), 0)} st`],
                      ]} />
                      {project.reportSettings.include3DImage && <div className="mt-4"><Project3DBuildingPreview building={project.building} roofSurfaces={project.roofSurfaces} panelGroups={project.panelGroups} obstacles={project.obstacles} shadingAnalysis={shadingAnalysis} /></div>}
                      {project.reportSettings.includePanelLayout && (
                        <div className="mt-4">
                          <ReportTable columns={['Panelgrupp', 'Takyta', 'Paneler', 'Rader/kolumner', 'Parallell med']} rows={project.panelGroups.map((group) => [
                            group.name,
                            project.roofSurfaces.find((surface) => surface.id === group.roofSurfaceId)?.name || 'Ej vald',
                            `${group.panelCount} st`,
                            `${group.rows} / ${group.columns}`,
                            (group.isParallelWithGroupIds || []).map((id) => project.panelGroups.find((item) => item.id === id)?.name).filter(Boolean).join(', ') || '-',
                          ])} />
                        </div>
                      )}
                    </ReportSection>

                    <ReportSection title="4. Skuggning">
                      <ReportGrid items={[
                        ['Analys', 'Indikativ skuggningsanalys'],
                        ['Beräknad skuggningsförlust', `${shadingAnalysis.shadingLossPercent}%`],
                        ['Solriktning', `${shadingAnalysis.sun.azimuthDeg}°`],
                        ['Solhöjd', `${shadingAnalysis.sun.altitudeDeg}°`],
                      ]} />
                      <div className="mt-4">
                        <ReportTable columns={['Hinder', 'Typ', 'Takyta', 'Skuggrelevant']} rows={(project.obstacles.length ? project.obstacles : [{ name: 'Inga hinder registrerade', type: '-', roofSurfaceId: '', shadowRelevant: false }]).map((obstacle) => [
                          obstacle.name,
                          obstacleTypes[obstacle.type] || obstacle.type,
                          project.roofSurfaces.find((surface) => surface.id === obstacle.roofSurfaceId)?.name || '-',
                          obstacle.shadowRelevant ? 'Ja' : 'Nej',
                        ])} />
                      </div>
                    </ReportSection>

                    <ReportSection title="5. Växelriktare & strängar">
                      <ReportGrid items={[
                        ['Växelriktarmodell', `${project.inverterModel.manufacturer} ${project.inverterModel.model}`],
                        ['MPPT', `${project.inverterModel.mpptCount} st`],
                        ['Strängar per MPPT', `${project.inverterModel.stringsPerMppt} st`],
                      ]} />
                      {project.reportSettings.includeStringDiagram && (
                        <div className="mt-4">
                          <ReportTable columns={['MPPT', 'Panelgrupp', 'Paneler', 'Voc kallt', 'Vmp drift', 'Isc', 'DC-effekt', 'Status', 'Varningar/fel']} rows={calculatedStrings.map((stringItem) => [
                            stringItem.mpptIndex,
                            project.panelGroups.find((group) => group.id === stringItem.panelGroupId)?.name || 'Ej vald',
                            stringItem.panelCount,
                            `${stringItem.calculatedVocCold} V`,
                            `${stringItem.calculatedVmpOperating} V`,
                            `${stringItem.calculatedIsc} A`,
                            `${stringItem.calculatedDcPowerW} W`,
                            stringItem.status,
                            stringItem.messages.join(' '),
                          ])} />
                        </div>
                      )}
                    </ReportSection>

                    <ReportSection title="6. Produktion">
                      <ReportGrid items={[
                        ['Årsproduktion', `${productionEstimate.annualKwh.toLocaleString('sv-SE')} kWh`],
                        ['Väderscenario', `${weatherLabels[project.weatherScenario.weather]}, månad ${project.weatherScenario.month}, timme ${project.weatherScenario.hour}`],
                        ['Omgivningstemperatur', `${project.weatherScenario.ambientTempC} °C`],
                        ['Skuggförlust', `${productionEstimate.shadingLossPercent}%`],
                        ['Väderförlust', `${productionEstimate.weatherLossPercent}%`],
                        ['Temperaturförlust', `${productionEstimate.temperatureLossPercent}%`],
                      ]} />
                      <div className="mt-4">
                        <ReportTable columns={monthLabels} rows={[productionEstimate.monthlyKwh.map((kwh) => `${kwh.toLocaleString('sv-SE')} kWh`)]} />
                      </div>
                    </ReportSection>

                    {project.reportSettings.includeEconomics && (
                      <ReportSection title="7. Ekonomi">
                        <ReportGrid items={[
                          ['Årlig besparing', `${economyEstimate.selfConsumptionSavingsSek.toLocaleString('sv-SE')} SEK/år`],
                          ['Intäkt såld el', `${economyEstimate.soldElectricityRevenueSek.toLocaleString('sv-SE')} SEK/år`],
                          ['Total solcellsnytta', `${economyEstimate.totalSolarBenefitSek.toLocaleString('sv-SE')} SEK/år`],
                          ['Återbetalningstid', economyEstimate.paybackYears > 0 ? `${economyEstimate.paybackYears} år` : 'Ej beräknad'],
                          ['Batteri', project.economics.includeBattery ? `${project.economics.batteryCapacityKwh} kWh` : 'Ej valt'],
                          ['Värmepumpsbyte', heatPumpEstimate.savedSek > 0 ? `${heatPumpEstimate.savedSek.toLocaleString('sv-SE')} SEK/år, återbetalning ${heatPumpEstimate.paybackYears} år` : 'Ej ifyllt'],
                        ]} />
                      </ReportSection>
                    )}

                    {project.reportSettings.includeMaterialList && (
                      <ReportSection title="8. Materiallista">
                        <ReportTable columns={['Post', 'Beskrivning']} rows={materialList} />
                      </ReportSection>
                    )}

                    <ReportSection title="9. Ansvarsnotis">
                      <p className="text-sm leading-6 text-slate-800">
                        Denna rapport är ett projekteringsunderlag. Resultat för produktion, skuggning, ekonomi, laster och eldimensionering är indikativa och ska verifieras mot verkliga platsförhållanden, gällande regler, produktblad och behörig installatör/konstruktör innan installation.
                      </p>
                    </ReportSection>
                  </div>
                )}
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
