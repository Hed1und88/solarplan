// @ts-nocheck
import { useMemo } from 'react';

const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';
const TILE_SIZE = 256;
const VIEW_W = 780;
const VIEW_H = 560;

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

function lonLatToTile(latitude, longitude, zoom) {
  const latRad = (latitude * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n);
  return { x, y, zoom };
}

function imageryTileUrl(x, y, z) {
  const protocol = 'https:';
  const host = 'server.arcgisonline.com';
  const service = 'ArcGIS/rest/services/World_Imagery/MapServer/tile';
  return `${protocol}//${host}/${service}/${z}/${y}/${x}`;
}

function buildTileGrid(latitude, longitude, zoom = 19) {
  const center = lonLatToTile(latitude, longitude, zoom);
  const tiles = [];
  for (let row = -1; row <= 1; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      const x = center.x + col;
      const y = center.y + row;
      tiles.push({ key: `${zoom}-${x}-${y}`, x, y, z: zoom, left: (col + 1) * TILE_SIZE, top: (row + 1) * TILE_SIZE, url: imageryTileUrl(x, y, zoom) });
    }
  }
  return tiles;
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
  const sourceW = Math.max(1, maxX - minX);
  const sourceH = Math.max(1, maxY - minY);
  const scale = Math.min(230 / sourceW, 160 / sourceH);
  return valid.map((point) => `${VIEW_W / 2 + ((point.x - minX - sourceW / 2) * scale)},${VIEW_H / 2 + ((point.y - minY - sourceH / 2) * scale)}`).join(' ');
}

function manualBuildingBox(building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const scale = Math.min(275 / length, 175 / width);
  const w = length * scale;
  const h = width * scale;
  return { x: VIEW_W / 2 - w / 2, y: VIEW_H / 2 - h / 2, w, h, length, width };
}

function status(label, state, detail) {
  return { label, state, detail };
}

function StatusPill({ state }) {
  const map = {
    ready: ['Klar', 'bg-emerald-100 text-emerald-800 border-emerald-200'],
    preview: ['Preview', 'bg-blue-100 text-blue-800 border-blue-200'],
    manual: ['Manuell', 'bg-amber-100 text-amber-900 border-amber-200'],
    missing: ['Saknas', 'bg-red-100 text-red-800 border-red-200'],
  };
  const [text, className] = map[state] || map.manual;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${className}`}>{text}</span>;
}

function Tool({ children, active = false }) {
  return <button type="button" className={`h-9 rounded-md px-3 text-xs font-bold ${active ? 'bg-cyan-500 text-white shadow' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{children}</button>;
}

function RoofOverlay({ building, box, footprintPoints, hasFootprint }) {
  const roofType = building.roofType || 'gable';
  if (hasFootprint) {
    return (
      <>
        <polygon points={footprintPoints} fill="rgba(14,165,233,0.25)" stroke="#22d3ee" strokeWidth="3" />
        <polygon points={footprintPoints} fill="rgba(100,116,139,0.62)" />
      </>
    );
  }

  if (roofType === 'hip') {
    return (
      <g>
        <polygon points={`${box.x},${box.y + box.h / 2} ${box.x + box.w * 0.16},${box.y} ${box.x + box.w * 0.84},${box.y} ${box.x + box.w},${box.y + box.h / 2} ${box.x + box.w * 0.84},${box.y + box.h} ${box.x + box.w * 0.16},${box.y + box.h}`} fill="#64748b" stroke="#0f172a" strokeWidth="3" />
        <line x1={box.x + box.w * 0.2} y1={box.y + box.h / 2} x2={box.x + box.w * 0.8} y2={box.y + box.h / 2} stroke="#22d3ee" strokeWidth="4" />
      </g>
    );
  }

  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#94a3b8" stroke="#0f172a" strokeWidth="3" />
      <rect x={box.x} y={box.y} width={box.w} height={box.h / 2} fill="#64748b" opacity="0.85" />
      <rect x={box.x} y={box.y + box.h / 2} width={box.w} height={box.h / 2} fill="#475569" opacity="0.9" />
      <line x1={box.x} y1={box.y + box.h / 2} x2={box.x + box.w} y2={box.y + box.h / 2} stroke="#22d3ee" strokeWidth="4" />
    </g>
  );
}

function Panels({ panelGroups, box }) {
  const panels = panelGroups.flatMap((group, groupIndex) => (group.panels || []).slice(0, 90).map((panel, panelIndex) => ({ panel, groupIndex, panelIndex, groupId: group.id })));
  return (
    <g>
      {panels.map(({ panel, groupIndex, panelIndex, groupId }) => {
        const x = box.x + 18 + safeNumber(panel.xM, panelIndex % 10) * 16;
        const y = box.y + 18 + safeNumber(panel.yM, Math.floor(panelIndex / 10)) * 20;
        return <rect key={`${groupId}-${panel.id || panelIndex}`} x={x} y={y} width={Math.max(11, safeNumber(panel.widthM, 1.1) * 18)} height={Math.max(16, safeNumber(panel.heightM, 1.7) * 18)} fill={groupIndex % 2 ? '#6d28d9' : '#1d4ed8'} stroke="#dbeafe" strokeWidth="1" opacity="0.92" />;
      })}
    </g>
  );
}

function GroundMountRows({ enabled }) {
  if (!enabled) return null;
  const rows = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 9; col += 1) rows.push(<rect key={`${row}-${col}`} x={75 + col * 25} y={370 + row * 23} width="20" height="13" fill="#1d4ed8" stroke="#bfdbfe" strokeWidth="1" />);
  }
  return <g>{rows}</g>;
}

export default function Project3DBuildingPreview({ building, roofSurfaces, panelGroups = [], obstacles = [] }) {
  const storedProject = readStoredProject();
  const locationData = storedProject?.locationData || null;
  const geo3D = storedProject?.geo3D || {};
  const groundMount = storedProject?.groundMount || {};
  const latitude = safeNumber(locationData?.latitude, 59.6052);
  const longitude = safeNumber(locationData?.longitude, 13.4661);
  const hasLatLon = Number.isFinite(Number(locationData?.latitude)) && Number.isFinite(Number(locationData?.longitude));
  const tiles = useMemo(() => buildTileGrid(latitude, longitude, 19), [latitude, longitude]);
  const footprint = locationData?.buildingFootprint || null;
  const footprintPoints = normalizeFootprint(footprint?.points || []);
  const hasFootprint = Boolean(footprintPoints);
  const box = manualBuildingBox(building);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM) * safeNumber(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, group) => sum + safeNumber(group.panelCount), 0);
    return { roofArea, usableArea, panelCount };
  }, [roofSurfaces, panelGroups]);

  const layers = [
    status('Flygbild / ortofoto', 'preview', 'Aktivt preview-lager via Web Mercator tiles. Byt till licensierad svensk ortofoto före produktion.'),
    status('Byggnadsfotavtryck', hasFootprint ? 'ready' : 'manual', hasFootprint ? footprint?.source || 'Hämtat fotavtryck' : 'Manuella mått nu. Nästa steg är ritad takkontur.'),
    status('DTM markmodell', geo3D?.dataLayers?.terrainModel?.status === 'ready' ? 'ready' : 'missing', 'Krävs för markställning och marklutning.'),
    status('DSM / LiDAR', geo3D?.dataLayers?.surfaceModel?.status === 'ready' ? 'ready' : 'missing', 'Krävs för träd, hinder och verklig skuggning.'),
    status('Fastighetsgräns', geo3D?.dataLayers?.propertyBoundary?.status === 'ready' ? 'ready' : 'missing', 'Krävs för placering mot tomtgräns.'),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <Tool active>Geo/3D</Tool><Tool>Flygbild</Tool><Tool>Byggnad</Tool><Tool>Takytor</Tool><Tool>Markställning</Tool><Tool>Paneler</Tool><Tool>Skuggning</Tool>
          </div>
          <div className="text-xs font-semibold text-slate-300">SolarPlan Geo/3D Engine</div>
        </div>

        <div className="relative h-[620px] overflow-hidden bg-slate-950">
          <div className="absolute left-1/2 top-1/2 h-[768px] w-[768px] -translate-x-1/2 -translate-y-1/2 rotate-[-7deg] scale-[1.18] shadow-2xl">
            {tiles.map((tile) => <img key={tile.key} src={tile.url} alt="" draggable={false} className="absolute h-64 w-64 select-none object-cover" style={{ left: tile.left, top: tile.top }} />)}
            <div className="absolute inset-0 bg-slate-900/10" />
          </div>

          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 z-20 h-full w-full" role="img" aria-label="SolarPlan Geo 3D projekteringsvy">
            <rect x="34" y="34" width="712" height="492" rx="12" fill="rgba(15,23,42,0.12)" stroke="rgba(125,211,252,0.75)" strokeWidth="2" />
            <text x="52" y="62" fill="#f8fafc" fontSize="14" fontWeight="700">N ↑ · {hasLatLon ? `Lat ${latitude.toFixed(6)} / Lon ${longitude.toFixed(6)}` : 'Koordinater saknas - hämta platsdata först'}</text>
            <RoofOverlay building={building} box={box} footprintPoints={footprintPoints} hasFootprint={hasFootprint} />
            <Panels panelGroups={panelGroups} box={box} />
            <GroundMountRows enabled={Boolean(groundMount?.enabled)} />
            {obstacles.map((obstacle) => <rect key={obstacle.id} x={box.x + safeNumber(obstacle.xM, 0) * 18} y={box.y + safeNumber(obstacle.yM, 0) * 18} width={Math.max(8, safeNumber(obstacle.widthM, 0.6) * 18)} height={Math.max(8, safeNumber(obstacle.depthM, 0.6) * 18)} fill="#ef4444" opacity="0.85" />)}
            <text x="52" y="530" fill="#fbbf24" fontSize="13">{hasFootprint ? 'Fotavtryck finns. Kontrollera taktyp, nock och lutning.' : 'Manuell byggnadsmodell. Rita/importera takkontur för verifierad geometri.'}</text>
          </svg>
        </div>
      </div>

      <aside className="space-y-4 rounded-xl border bg-background p-4">
        <div><h3 className="text-base font-bold">Geo/3D lagerstatus</h3><p className="mt-1 text-sm text-muted-foreground">Funktionell Base44-vy med verkligt kartlager, takmodell, paneloverlay och datastatus.</p></div>
        <div className="space-y-2">{layers.map((layer) => <div key={layer.label} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold">{layer.label}</div><StatusPill state={layer.state} /></div><div className="mt-1 text-xs text-muted-foreground">{layer.detail}</div></div>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Total takyta</div><div className="text-lg font-bold">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Användbar yta</div><div className="text-lg font-bold">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-lg font-bold">{totals.panelCount}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Markställning</div><div className="text-sm font-bold">{groundMount?.enabled ? 'Aktiv' : 'Ej aktiv'}</div></div>
        </div>
      </aside>
    </div>
  );
}
