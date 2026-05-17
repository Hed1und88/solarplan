// @ts-nocheck
import { useMemo } from 'react';

const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';
const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readStoredLocationData() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed.project || parsed)?.locationData || null;
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
  const scale = Math.min(680 / width, 420 / height);

  return valid
    .map((point) => `${80 + ((point.x - minX) * scale)},${60 + ((point.y - minY) * scale)}`)
    .join(' ');
}

function manualRectangle(building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const scale = Math.min(520 / length, 320 / width);
  const rectW = length * scale;
  const rectH = width * scale;
  const x = 400 - rectW / 2;
  const y = 250 - rectH / 2;
  return { x, y, rectW, rectH };
}

export default function Project3DBuildingPreview({ building, roofSurfaces, panelGroups = [], obstacles = [] }) {
  const locationData = readStoredLocationData();
  const footprint = locationData?.buildingFootprint || null;
  const footprintPoints = normalizeFootprint(footprint?.points || []);
  const hasRealFootprint = Boolean(footprintPoints);
  const rect = manualRectangle(building);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM) * safeNumber(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, group) => sum + safeNumber(group.panelCount), 0);
    return { roofArea, usableArea, panelCount };
  }, [roofSurfaces, panelGroups]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-xl border bg-slate-50 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-cyan-700">Mätvy</span>
            <span className={`rounded-full px-3 py-1 ${hasRealFootprint ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {hasRealFootprint ? 'Verkligt OSM-fotavtryck' : 'Manuell byggnadsmodell'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Takytor</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Paneler</span>
          </div>
          <span className="text-slate-500">Skalbar planvy</span>
        </div>

        {!hasRealFootprint && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Exakt byggnadsfotavtryck saknas i hämtad kartdata. Vyn visar bara manuellt angivna mått och är inte en bekräftad verklig modell. Ange rätt mått eller lägg till rit-/importfunktion för takkontur.
          </div>
        )}

        <div className="h-[520px] bg-slate-100 p-4">
          <svg viewBox="0 0 800 500" className="h-full w-full rounded-lg bg-white shadow-inner" role="img" aria-label="Planvy för byggnadsfotavtryck och takprojektering">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
              <linearGradient id="roof" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9aa4ab" />
                <stop offset="100%" stopColor="#6b7680" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="800" height="500" fill="url(#grid)" />
            <text x="24" y="34" fill="#64748b" fontSize="14">Norr ↑ · 1 ruta ≈ projekteringsskala</text>

            {hasRealFootprint ? (
              <>
                <polygon points={footprintPoints} fill="#dbeafe" stroke="#2563eb" strokeWidth="3" />
                <polygon points={footprintPoints} fill="url(#roof)" opacity="0.62" />
                <text x="24" y="470" fill="#2563eb" fontSize="14">Byggnadsfotavtryck hämtat från kartdata. Kontrollera takform/lutning manuellt.</text>
              </>
            ) : (
              <>
                <rect x={rect.x} y={rect.y} width={rect.rectW} height={rect.rectH} fill="url(#roof)" stroke="#334155" strokeWidth="3" />
                <line x1={rect.x} y1={rect.y + rect.rectH / 2} x2={rect.x + rect.rectW} y2={rect.y + rect.rectH / 2} stroke="#0ea5e9" strokeWidth="3" />
                <text x="24" y="470" fill="#92400e" fontSize="14">Manuell modell: {building.lengthM} x {building.widthM} m, taktyp {building.roofType}. Inte verifierad mot verklig flygbild.</text>
              </>
            )}

            {panelGroups.map((group, index) => {
              const panels = group.panels || [];
              return panels.slice(0, 80).map((panel, panelIndex) => {
                const px = rect.x + safeNumber(panel.xM, 0) * 18;
                const py = rect.y + safeNumber(panel.yM, 0) * 18;
                const pw = Math.max(10, safeNumber(panel.widthM, 1) * 18);
                const ph = Math.max(10, safeNumber(panel.heightM, 1.7) * 18);
                return <rect key={`${group.id}-${panel.id || panelIndex}`} x={px} y={py} width={pw} height={ph} fill={index % 2 ? '#075985' : '#1d4ed8'} stroke="#bfdbfe" strokeWidth="1" opacity="0.9" />;
              });
            })}

            {obstacles.map((obstacle) => (
              <rect key={obstacle.id} x={rect.x + safeNumber(obstacle.xM, 0) * 18} y={rect.y + safeNumber(obstacle.yM, 0) * 18} width={Math.max(8, safeNumber(obstacle.widthM, 0.6) * 18)} height={Math.max(8, safeNumber(obstacle.depthM, 0.6) * 18)} fill="#ef4444" opacity="0.75" />
            ))}
          </svg>
        </div>
      </div>

      <aside className="rounded-xl border bg-background p-4">
        <div className="mb-4">
          <h3 className="font-semibold">Takyteberäkning</h3>
          <p className="text-sm text-muted-foreground">
            {hasRealFootprint ? 'Byggnadsfotavtryck finns. Taktyp, nock och lutning måste verifieras.' : 'Verklig byggnadsgeometri saknas. Mät in huset manuellt innan seriös projektering.'}
          </p>
        </div>

        {footprint && (
          <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="font-semibold">Hämtat fotavtryck</div>
            <div className="mt-1 text-muted-foreground">Källa: {footprint.source || 'kartdata'}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <span>Längd</span><b className="text-right">{footprint.suggestedBuilding?.lengthM || '-'} m</b>
              <span>Bredd</span><b className="text-right">{footprint.suggestedBuilding?.widthM || '-'} m</b>
              <span>Nockriktning</span><b className="text-right">{footprint.suggestedBuilding?.ridgeDirectionDeg || '-'}°</b>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Total takyta</div><div className="text-lg font-bold">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Användbar yta</div><div className="text-lg font-bold">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-lg font-bold">{totals.panelCount}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Geometrikälla</div><div className="text-sm font-bold">{hasRealFootprint ? 'Kartdata' : 'Manuell'}</div></div>
        </div>

        <div className="mt-4 space-y-2">
          {roofSurfaces.map((surface) => (
            <div key={surface.id} className="rounded-lg border p-3 text-sm">
              <div className="font-semibold">{surface.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Orientering</span><b className="text-right text-foreground">{surface.orientationDeg}°</b>
                <span>Lutning</span><b className="text-right text-foreground">{surface.tiltDeg}°</b>
                <span>Mått</span><b className="text-right text-foreground">{surface.widthM} x {surface.heightM} m</b>
                <span>Användbar yta</span><b className="text-right text-foreground">{surface.usableAreaM2} m²</b>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
