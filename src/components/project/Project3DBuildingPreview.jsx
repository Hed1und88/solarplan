// @ts-nocheck
import { useMemo } from 'react';

const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';
const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readStoredProject() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.project || parsed;
  } catch {
    return null;
  }
}

function normalizeFootprint(points = []) {
  const valid = points
    .map((point) => ({ x: safeNumber(point.x, null), y: safeNumber(point.y, null) }))
    .filter((point) => point.x !== null && point.y !== null);
  if (valid.length < 3) return null;

  const minX = Math.min(...valid.map((point) => point.x));
  const maxX = Math.max(...valid.map((point) => point.x));
  const minY = Math.min(...valid.map((point) => point.y));
  const maxY = Math.max(...valid.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(560 / width, 340 / height);

  return valid
    .map((point) => `${390 + ((point.x - minX - width / 2) * scale)},${250 + ((point.y - minY - height / 2) * scale)}`)
    .join(' ');
}

function manualBuildingBox(building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const scale = Math.min(300 / length, 190 / width);
  const w = length * scale;
  const h = width * scale;
  return { x: 390 - w / 2, y: 250 - h / 2, w, h, length, width };
}

function layerState(label, status, detail) {
  return { label, status, detail };
}

function StatusPill({ status }) {
  const classes = {
    ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    missing: 'bg-red-100 text-red-800 border-red-200',
    manual: 'bg-amber-100 text-amber-900 border-amber-200',
  };
  const text = { ready: 'Klar', missing: 'Saknas', manual: 'Manuell' };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${classes[status] || classes.manual}`}>{text[status] || status}</span>;
}

function ToolbarButton({ label, active = false }) {
  return <button type="button" className={`h-9 rounded-md px-3 text-xs font-bold ${active ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{label}</button>;
}

function RoofShape({ building, box, hasFootprint }) {
  const roofType = building.roofType || 'gable';
  if (hasFootprint) return null;

  if (roofType === 'flat') {
    return <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#64748b" stroke="#0f172a" strokeWidth="3" />;
  }

  if (roofType === 'hip') {
    return (
      <g>
        <polygon points={`${box.x},${box.y + box.h / 2} ${box.x + box.w * 0.16},${box.y} ${box.x + box.w * 0.84},${box.y} ${box.x + box.w},${box.y + box.h / 2} ${box.x + box.w * 0.84},${box.y + box.h} ${box.x + box.w * 0.16},${box.y + box.h}`} fill="#6b7280" stroke="#0f172a" strokeWidth="3" />
        <line x1={box.x + box.w * 0.22} y1={box.y + box.h / 2} x2={box.x + box.w * 0.78} y2={box.y + box.h / 2} stroke="#06b6d4" strokeWidth="4" />
      </g>
    );
  }

  if (roofType === 'single_slope') {
    return (
      <g>
        <polygon points={`${box.x},${box.y} ${box.x + box.w},${box.y + 18} ${box.x + box.w},${box.y + box.h} ${box.x},${box.y + box.h - 18}`} fill="#64748b" stroke="#0f172a" strokeWidth="3" />
        <line x1={box.x} y1={box.y + box.h / 2} x2={box.x + box.w} y2={box.y + box.h / 2} stroke="#06b6d4" strokeWidth="4" />
      </g>
    );
  }

  return (
    <g>
      <polygon points={`${box.x},${box.y} ${box.x + box.w},${box.y} ${box.x + box.w},${box.y + box.h} ${box.x},${box.y + box.h}`} fill="#94a3b8" stroke="#0f172a" strokeWidth="3" />
      <polygon points={`${box.x},${box.y} ${box.x + box.w},${box.y} ${box.x + box.w},${box.y + box.h / 2} ${box.x},${box.y + box.h / 2}`} fill="#6b7280" opacity="0.85" />
      <polygon points={`${box.x},${box.y + box.h / 2} ${box.x + box.w},${box.y + box.h / 2} ${box.x + box.w},${box.y + box.h} ${box.x},${box.y + box.h}`} fill="#4b5563" opacity="0.9" />
      <line x1={box.x} y1={box.y + box.h / 2} x2={box.x + box.w} y2={box.y + box.h / 2} stroke="#06b6d4" strokeWidth="4" />
    </g>
  );
}

function PanelOverlay({ panelGroups, box }) {
  const panels = panelGroups.flatMap((group, groupIndex) => (group.panels || []).slice(0, 80).map((panel, panelIndex) => ({ panel, groupIndex, panelIndex, groupId: group.id })));
  if (panels.length === 0) return null;

  return (
    <g>
      {panels.map(({ panel, groupIndex, panelIndex, groupId }) => {
        const x = box.x + 20 + safeNumber(panel.xM, panelIndex % 10) * 16;
        const y = box.y + 20 + safeNumber(panel.yM, Math.floor(panelIndex / 10)) * 20;
        const width = Math.max(10, safeNumber(panel.widthM, 1.1) * 18);
        const height = Math.max(14, safeNumber(panel.heightM, 1.7) * 18);
        return <rect key={`${groupId}-${panel.id || panelIndex}`} x={x} y={y} width={width} height={height} fill={groupIndex % 2 ? '#6d28d9' : '#1d4ed8'} stroke="#dbeafe" strokeWidth="1" opacity="0.92" />;
      })}
    </g>
  );
}

function GroundMountPreview({ enabled }) {
  if (!enabled) return null;
  const rows = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      rows.push(<rect key={`${row}-${col}`} x={92 + col * 26} y={342 + row * 24} width="21" height="13" fill="#1d4ed8" stroke="#bfdbfe" strokeWidth="1" />);
    }
  }
  return <g>{rows}</g>;
}

export default function Project3DBuildingPreview({ building, roofSurfaces, panelGroups = [], obstacles = [] }) {
  const storedProject = readStoredProject();
  const locationData = storedProject?.locationData || null;
  const geo3D = storedProject?.geo3D || {};
  const groundMount = storedProject?.groundMount || {};
  const footprint = locationData?.buildingFootprint || null;
  const footprintPoints = normalizeFootprint(footprint?.points || []);
  const hasFootprint = Boolean(footprintPoints);
  const hasLatLon = Number.isFinite(Number(locationData?.latitude)) && Number.isFinite(Number(locationData?.longitude));
  const box = manualBuildingBox(building);

  const layers = [
    layerState('Flygbild / ortofoto', geo3D?.map?.imageryStatus === 'ready' ? 'ready' : 'missing', geo3D?.map?.provider || 'Ingen kartleverantör ansluten'),
    layerState('Byggnadsfotavtryck', hasFootprint ? 'ready' : 'manual', hasFootprint ? footprint?.source || 'Hämtat fotavtryck' : 'Manuella mått / rita takkontur krävs'),
    layerState('DTM markmodell', geo3D?.dataLayers?.terrainModel?.status === 'ready' ? 'ready' : 'missing', 'Krävs för markställning och marklutning'),
    layerState('DSM / LiDAR', geo3D?.dataLayers?.surfaceModel?.status === 'ready' ? 'ready' : 'missing', 'Krävs för träd, hinder och verklig skuggning'),
    layerState('Fastighetsgräns', geo3D?.dataLayers?.propertyBoundary?.status === 'ready' ? 'ready' : 'missing', 'Krävs för placering mot tomtgräns'),
  ];

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM) * safeNumber(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, group) => sum + safeNumber(group.panelCount), 0);
    return { roofArea, usableArea, panelCount };
  }, [roofSurfaces, panelGroups]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <ToolbarButton label="Geo/3D" active />
            <ToolbarButton label="Flygbild" />
            <ToolbarButton label="Byggnad" />
            <ToolbarButton label="Takytor" />
            <ToolbarButton label="Markställning" />
            <ToolbarButton label="Paneler" />
            <ToolbarButton label="Skuggning" />
          </div>
          <div className="text-xs font-semibold text-slate-300">SolarPlan Geo/3D Engine</div>
        </div>

        <div className="relative bg-slate-900 p-4">
          <svg viewBox="0 0 780 500" className="h-[560px] w-full rounded-lg border border-slate-700 bg-slate-800 shadow-inner" role="img" aria-label="SolarPlan Geo 3D projekteringsvy">
            <defs>
              <pattern id="geoGrid" width="22" height="22" patternUnits="userSpaceOnUse">
                <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#334155" strokeWidth="1" opacity="0.65" />
              </pattern>
              <linearGradient id="manualRoof" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="780" height="500" fill="#0f172a" />
            <rect x="24" y="24" width="732" height="452" rx="12" fill="url(#geoGrid)" stroke="#475569" strokeWidth="1" />

            <text x="42" y="54" fill="#e2e8f0" fontSize="14" fontWeight="700">N ↑ · Koordinatbaserad projekteringsyta</text>
            <text x="42" y="76" fill="#94a3b8" fontSize="12">{hasLatLon ? `Lat ${Number(locationData.latitude).toFixed(6)} / Lon ${Number(locationData.longitude).toFixed(6)}` : 'Koordinater saknas - hämta platsdata först'}</text>

            {geo3D?.map?.imageryStatus === 'ready' ? (
              <rect x="24" y="24" width="732" height="452" rx="12" fill="#1e293b" opacity="0.35" />
            ) : (
              <g>
                <rect x="220" y="34" width="340" height="38" rx="8" fill="#7f1d1d" opacity="0.9" />
                <text x="242" y="58" fill="#fee2e2" fontSize="13" fontWeight="700">Flygbild/ortofoto saknas - anslut kartleverantör</text>
              </g>
            )}

            {hasFootprint ? (
              <>
                <polygon points={footprintPoints} fill="#0ea5e9" opacity="0.24" stroke="#22d3ee" strokeWidth="3" />
                <polygon points={footprintPoints} fill="url(#manualRoof)" opacity="0.7" />
                <text x="42" y="454" fill="#67e8f9" fontSize="13">Byggnadsfotavtryck aktivt. Verifiera taktyp, lutning och nock manuellt.</text>
              </>
            ) : (
              <>
                <RoofShape building={building} box={box} hasFootprint={false} />
                <text x="42" y="454" fill="#fbbf24" fontSize="13">Manuell byggnadsmodell. Rita/importera takkontur för verifierad geometri.</text>
              </>
            )}

            <PanelOverlay panelGroups={panelGroups} box={box} />
            <GroundMountPreview enabled={Boolean(groundMount?.enabled)} />

            {obstacles.map((obstacle) => (
              <rect key={obstacle.id} x={box.x + safeNumber(obstacle.xM, 0) * 18} y={box.y + safeNumber(obstacle.yM, 0) * 18} width={Math.max(8, safeNumber(obstacle.widthM, 0.6) * 18)} height={Math.max(8, safeNumber(obstacle.depthM, 0.6) * 18)} fill="#ef4444" opacity="0.8" />
            ))}
          </svg>
        </div>
      </div>

      <aside className="space-y-4 rounded-xl border bg-background p-4">
        <div>
          <h3 className="text-base font-bold">Geo/3D lagerstatus</h3>
          <p className="mt-1 text-sm text-muted-foreground">Visar exakt vilka datalager som krävs för tak, markställning och verklig skuggning.</p>
        </div>

        <div className="space-y-2">
          {layers.map((layer) => (
            <div key={layer.label} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{layer.label}</div>
                <StatusPill status={layer.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{layer.detail}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Total takyta</div><div className="text-lg font-bold">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Användbar yta</div><div className="text-lg font-bold">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-lg font-bold">{totals.panelCount}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Markställning</div><div className="text-sm font-bold">{groundMount?.enabled ? 'Aktiv' : 'Ej aktiv'}</div></div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Professionell geometri kräver:</b> licensierad ortofoto/flygbild, byggnadsfotavtryck eller ritad takkontur, DTM för markställning och DSM/LiDAR för hinder/skuggning.
        </div>
      </aside>
    </div>
  );
}
