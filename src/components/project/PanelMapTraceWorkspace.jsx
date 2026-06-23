import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
  FileImage,
  Globe2,
  Hand,
  ImagePlus,
  Map as MapIcon,
  MousePointer2,
  PanelTop,
  Pentagon,
  Ruler,
  Save,
  SquareDashed,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import ExistingSolarRoofPlanner from './SolarRoofPlannerV2.jsx';

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const DEFAULT_TRACE = {
  imageUrl: '',
  imageName: '',
  naturalWidth: 0,
  naturalHeight: 0,
  metersPerPixel: 0,
  calibration: null,
  opacity: 1,
  savedAt: '',
};

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const distance = (a, b) => Math.hypot(n(a?.x) - n(b?.x), n(a?.y) - n(b?.y));

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function readLayout(project) {
  const candidates = [project?.solar_roof_planner_data, project?.panel_layout_data];
  for (const raw of candidates) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  if (typeof window !== 'undefined' && project?.id) {
    const local = safeJson(window.localStorage.getItem(`solarplan:project:${project.id}:solar_roof_planner_data`), null);
    if (local && Array.isArray(local.roofs)) return local;
  }
  return { version: 10, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

function addressFor(project = {}) {
  return project.address || [project.street_address, project.postal_code, project.postal_city].filter(Boolean).join(', ');
}

function defaultRoof(index) {
  return {
    id: uid('roof'),
    name: `Tak ${index + 1}`,
    widthM: 8,
    roofFallM: 6,
    angleDeg: 10,
    shape: 'Rektangel',
    material: 'Plåttak',
    mountingSystemProductId: '',
    mountingSystemProductSnapshot: null,
    panelProductId: '',
    panelProductSnapshot: null,
    panelGroups: [],
    obstacles: [],
  };
}

function pointToCanvas(point) {
  return { x: point.x * CANVAS_WIDTH, y: point.y * CANVAS_HEIGHT };
}

function canvasToPoint(x, y) {
  return { x: clamp(x / CANVAS_WIDTH, 0, 1), y: clamp(y / CANVAS_HEIGHT, 0, 1) };
}

function polygonBounds(points = []) {
  if (!points.length) return null;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function roofDimensions(points, trace) {
  const bounds = polygonBounds(points);
  if (!bounds || !trace?.metersPerPixel || !trace?.naturalWidth || !trace?.naturalHeight) return null;
  return {
    widthM: (bounds.maxX - bounds.minX) * trace.naturalWidth * trace.metersPerPixel,
    roofFallM: (bounds.maxY - bounds.minY) * trace.naturalHeight * trace.metersPerPixel,
  };
}

function polygonAreaM2(points, trace) {
  if (!points?.length || !trace?.metersPerPixel || !trace?.naturalWidth || !trace?.naturalHeight) return null;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const x1 = current.x * trace.naturalWidth * trace.metersPerPixel;
    const y1 = current.y * trace.naturalHeight * trace.metersPerPixel;
    const x2 = next.x * trace.naturalWidth * trace.metersPerPixel;
    const y2 = next.y * trace.naturalHeight * trace.metersPerPixel;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function edgeLengthM(a, b, trace) {
  if (!trace?.metersPerPixel || !trace?.naturalWidth || !trace?.naturalHeight) return null;
  return Math.hypot(
    (a.x - b.x) * trace.naturalWidth,
    (a.y - b.y) * trace.naturalHeight,
  ) * trace.metersPerPixel;
}

function IconButton({ title, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-orange-300 bg-orange-50 text-orange-600 shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

function MapWorkspace({ project, layout, setLayout, trace, setTrace, onSave, saving }) {
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [selectedRoofId, setSelectedRoofId] = useState(layout.roofs?.[0]?.id || '');
  const [dragPoint, setDragPoint] = useState(null);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [calibrationMeters, setCalibrationMeters] = useState('');
  const [obstacleStart, setObstacleStart] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const selectedRoof = layout.roofs.find(roof => String(roof.id) === String(selectedRoofId)) || null;
  const address = addressFor(project);

  useEffect(() => {
    if (selectedRoofId && layout.roofs.some(roof => String(roof.id) === String(selectedRoofId))) return;
    setSelectedRoofId(layout.roofs?.[0]?.id || '');
  }, [layout.roofs, selectedRoofId]);

  useEffect(() => {
    const handlePaste = event => {
      const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith('image/'));
      if (file) uploadImage(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const uploadImage = async file => {
    if (!file) return;
    setUploading(true);
    setMessage('Laddar upp kartbild...');
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const url = result?.file_url || result?.url || result?.fileUrl || result?.data?.file_url || result?.data?.url;
      if (!url) throw new Error('Filuppladdningen returnerade ingen bildadress.');
      setTrace(current => ({ ...current, imageUrl: url, imageName: file.name || 'inklistrad-kartbild', savedAt: new Date().toISOString() }));
      setMessage('Kartbilden är uppladdad. Kalibrera en känd sträcka innan du ritar tak.');
      setTool('calibrate');
    } catch (error) {
      setMessage(error?.message || 'Kartbilden kunde inte laddas upp.');
    } finally {
      setUploading(false);
    }
  };

  const openGoogleEarth = () => {
    const query = address || `${project?.latitude || ''},${project?.longitude || ''}`;
    if (!query.trim()) {
      setMessage('Projektet saknar adress och koordinater.');
      return;
    }
    window.open(`https://earth.google.com/web/search/${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  };

  const eventPoint = event => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    return canvasToPoint(x, y);
  };

  const finishRoof = points => {
    if (points.length < 3) return;
    const dimensions = roofDimensions(points, trace);
    const unlinked = layout.roofs.find(roof => !Array.isArray(roof.mapPolygon) || roof.mapPolygon.length < 3);
    const roof = unlinked || defaultRoof(layout.roofs.length);
    const updatedRoof = {
      ...roof,
      ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
      shape: 'Fri polygon',
      mapPolygon: points,
      mapAreaM2: polygonAreaM2(points, trace),
    };
    const roofs = unlinked
      ? layout.roofs.map(item => String(item.id) === String(unlinked.id) ? updatedRoof : item)
      : [...layout.roofs, updatedRoof];
    setLayout(current => ({ ...current, roofs }));
    setSelectedRoofId(updatedRoof.id);
    setDraft([]);
    setTool('edit');
    setMessage(`${updatedRoof.name} skapades från kartbilden.`);
  };

  const handleCanvasClick = event => {
    if (!trace.imageUrl) return;
    const point = eventPoint(event);
    if (tool === 'draw') {
      if (draft.length >= 3 && distance(point, draft[0]) < 0.018) finishRoof(draft);
      else setDraft(current => [...current, point]);
      return;
    }
    if (tool === 'calibrate') {
      setCalibrationPoints(current => current.length >= 2 ? [point] : [...current, point]);
      return;
    }
    if (tool === 'obstacle') {
      if (!obstacleStart) setObstacleStart(point);
      else {
        const obstacle = {
          id: uid('obstacle'),
          type: 'Hinder',
          x: Math.min(obstacleStart.x, point.x),
          y: Math.min(obstacleStart.y, point.y),
          width: Math.abs(point.x - obstacleStart.x),
          height: Math.abs(point.y - obstacleStart.y),
        };
        setLayout(current => ({
          ...current,
          roofs: current.roofs.map(roof => String(roof.id) === String(selectedRoofId)
            ? { ...roof, obstacles: [...(roof.obstacles || []), obstacle] }
            : roof),
        }));
        setObstacleStart(null);
        setMessage('Hindret är tillagt på valt tak.');
      }
    }
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || !(Number(calibrationMeters) > 0) || !trace.naturalWidth || !trace.naturalHeight) return;
    const [a, b] = calibrationPoints;
    const pixels = Math.hypot(
      (a.x - b.x) * trace.naturalWidth,
      (a.y - b.y) * trace.naturalHeight,
    );
    if (!(pixels > 0)) return;
    const metersPerPixel = Number(calibrationMeters) / pixels;
    const calibratedTrace = { ...trace, metersPerPixel };
    setTrace(current => ({
      ...current,
      metersPerPixel,
      calibration: { points: calibrationPoints, meters: Number(calibrationMeters) },
      savedAt: new Date().toISOString(),
    }));
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => {
        if (!roof.mapPolygon?.length) return roof;
        const dimensions = roofDimensions(roof.mapPolygon, calibratedTrace);
        return dimensions ? {
          ...roof,
          widthM: Number(dimensions.widthM.toFixed(2)),
          roofFallM: Number(dimensions.roofFallM.toFixed(2)),
          mapAreaM2: polygonAreaM2(roof.mapPolygon, calibratedTrace),
        } : roof;
      }),
    }));
    setMessage(`Kalibrering sparad: ${metersPerPixel.toFixed(5)} meter per pixel.`);
    setTool('draw');
  };

  const startPan = event => {
    if (tool !== 'pan') return;
    dragRef.current = { x: event.clientX, y: event.clientY, pan };
  };

  const movePan = event => {
    if (!dragRef.current || tool !== 'pan') return;
    setPan({
      x: dragRef.current.pan.x + event.clientX - dragRef.current.x,
      y: dragRef.current.pan.y + event.clientY - dragRef.current.y,
    });
  };

  const stopPan = () => { dragRef.current = null; };

  const moveRoofPoint = (roofId, pointIndex, point) => {
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => {
        if (String(roof.id) !== String(roofId)) return roof;
        const mapPolygon = roof.mapPolygon.map((item, index) => index === pointIndex ? point : item);
        const dimensions = roofDimensions(mapPolygon, trace);
        return {
          ...roof,
          mapPolygon,
          ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
          mapAreaM2: polygonAreaM2(mapPolygon, trace),
        };
      }),
    }));
  };

  const removeSelectedRoofTrace = () => {
    if (!selectedRoof) return;
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => String(roof.id) === String(selectedRoof.id)
        ? { ...roof, mapPolygon: [], mapAreaM2: null, obstacles: [] }
        : roof),
    }));
  };

  const mappedRoofs = layout.roofs.filter(roof => Array.isArray(roof.mapPolygon) && roof.mapPolygon.length >= 3);

  return (
    <div className="flex min-h-[760px] overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 shadow-sm">
      <aside className="flex w-[58px] shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 px-2 py-3">
        <IconButton title="Panorera kartbild" active={tool === 'pan'} onClick={() => setTool('pan')}><Hand className="h-4 w-4" /></IconButton>
        <IconButton title="Ladda upp kartbild" active={tool === 'image'} onClick={() => fileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></IconButton>
        <IconButton title="Öppna projektadressen i Google Earth" onClick={openGoogleEarth}><Globe2 className="h-4 w-4" /></IconButton>
        <div className="my-1 h-px w-8 bg-slate-200" />
        <IconButton title="Kalibrera känd sträcka" active={tool === 'calibrate'} disabled={!trace.imageUrl} onClick={() => { setTool('calibrate'); setCalibrationPoints([]); }}><Ruler className="h-4 w-4" /></IconButton>
        <IconButton title="Rita nytt tak" active={tool === 'draw'} disabled={!trace.imageUrl} onClick={() => { setTool('draw'); setDraft([]); }}><Pentagon className="h-4 w-4" /></IconButton>
        <IconButton title="Redigera hörnpunkter" active={tool === 'edit'} disabled={!mappedRoofs.length} onClick={() => setTool('edit')}><MousePointer2 className="h-4 w-4" /></IconButton>
        <IconButton title="Lägg till hinder" active={tool === 'obstacle'} disabled={!selectedRoof?.mapPolygon?.length} onClick={() => { setTool('obstacle'); setObstacleStart(null); }}><SquareDashed className="h-4 w-4" /></IconButton>
        <div className="mt-auto flex flex-col gap-1">
          <IconButton title="Zooma in" onClick={() => setZoom(value => Math.min(3, value + 0.15))}><ZoomIn className="h-4 w-4" /></IconButton>
          <IconButton title="Zooma ut" onClick={() => setZoom(value => Math.max(0.25, value - 0.15))}><ZoomOut className="h-4 w-4" /></IconButton>
          <IconButton title="Återställ vy" onClick={() => { setZoom(0.75); setPan({ x: 0, y: 0 }); }}><Crosshair className="h-4 w-4" /></IconButton>
          <IconButton title="Spara kartbild och tak" active={saving} disabled={saving} onClick={onSave}><Save className="h-4 w-4" /></IconButton>
        </div>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => uploadImage(event.target.files?.[0])} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold"><MapIcon className="h-4 w-4 text-orange-500" />Kartbild och takpolygoner</div>
            <div className="mt-1 text-[11px] text-slate-500">{address || 'Projektadress saknas'} · {mappedRoofs.length} ritade tak · zoom {Math.round(zoom * 100)}%</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openGoogleEarth} className="gap-2"><ExternalLink className="h-4 w-4" />Öppna Google Earth</Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />{uploading ? 'Laddar upp...' : 'Ladda upp skärmbild'}</Button>
          </div>
        </header>

        {message && <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-900">{message}</div>}

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-200" onPointerMove={movePan} onPointerUp={stopPan} onPointerLeave={stopPan}>
          {!trace.imageUrl ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <FileImage className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <div className="font-semibold text-slate-900">Lägg in en kartbild</div>
                <div className="mt-2 text-sm text-slate-500">Öppna projektadressen i Google Earth, ta en skärmbild och ladda upp eller klistra in bilden här.</div>
                <div className="mt-4 flex justify-center gap-2"><Button onClick={openGoogleEarth} variant="outline">Öppna Google Earth</Button><Button onClick={() => fileInputRef.current?.click()}>Ladda upp bild</Button></div>
              </div>
            </div>
          ) : (
            <div
              className="absolute left-1/2 top-1/2 origin-center select-none"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
              onPointerDown={startPan}
            >
              <img
                src={trace.imageUrl}
                alt="Kartbild för projektering"
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain"
                style={{ opacity: trace.opacity ?? 1 }}
                onLoad={event => setTrace(current => ({ ...current, naturalWidth: event.currentTarget.naturalWidth, naturalHeight: event.currentTarget.naturalHeight }))}
              />
              <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="absolute inset-0 h-full w-full touch-none" onClick={handleCanvasClick}>
                {mappedRoofs.map((roof, roofIndex) => {
                  const points = roof.mapPolygon.map(pointToCanvas);
                  return (
                    <g key={roof.id} onClick={event => { event.stopPropagation(); setSelectedRoofId(roof.id); }}>
                      <polygon points={points.map(point => `${point.x},${point.y}`).join(' ')} fill={String(roof.id) === String(selectedRoofId) ? 'rgba(249,115,22,0.20)' : 'rgba(37,99,235,0.15)'} stroke={String(roof.id) === String(selectedRoofId) ? '#f97316' : '#2563eb'} strokeWidth="4" />
                      <text x={points[0]?.x + 8} y={points[0]?.y - 10} fill="#fff" stroke="#0f172a" strokeWidth="4" paintOrder="stroke" fontSize="24" fontWeight="800">{roof.name || `Tak ${roofIndex + 1}`}</text>
                      {roof.mapPolygon.map((point, pointIndex) => {
                        const canvasPoint = pointToCanvas(point);
                        const next = roof.mapPolygon[(pointIndex + 1) % roof.mapPolygon.length];
                        const nextCanvas = pointToCanvas(next);
                        const lengthM = edgeLengthM(point, next, trace);
                        return (
                          <React.Fragment key={`${roof.id}-${pointIndex}`}>
                            {lengthM != null && <text x={(canvasPoint.x + nextCanvas.x) / 2} y={(canvasPoint.y + nextCanvas.y) / 2 - 8} textAnchor="middle" fill="#fff" stroke="#0f172a" strokeWidth="4" paintOrder="stroke" fontSize="18" fontWeight="700">{lengthM.toFixed(2)} m</text>}
                            {tool === 'edit' && <circle cx={canvasPoint.x} cy={canvasPoint.y} r="10" fill="#fff" stroke="#f97316" strokeWidth="4" onPointerDown={event => { event.stopPropagation(); setDragPoint({ roofId: roof.id, pointIndex }); event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerMove={event => { if (!dragPoint || dragPoint.roofId !== roof.id || dragPoint.pointIndex !== pointIndex) return; moveRoofPoint(roof.id, pointIndex, eventPoint(event)); }} onPointerUp={() => setDragPoint(null)} />}
                          </React.Fragment>
                        );
                      })}
                      {(roof.obstacles || []).map(obstacle => <rect key={obstacle.id} x={obstacle.x * CANVAS_WIDTH} y={obstacle.y * CANVAS_HEIGHT} width={obstacle.width * CANVAS_WIDTH} height={obstacle.height * CANVAS_HEIGHT} fill="rgba(220,38,38,0.28)" stroke="#dc2626" strokeWidth="3" strokeDasharray="10 6" />)}
                    </g>
                  );
                })}

                {draft.length > 0 && <polyline points={draft.map(pointToCanvas).map(point => `${point.x},${point.y}`).join(' ')} fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="4" strokeDasharray="10 6" />}
                {draft.map((point, index) => { const p = pointToCanvas(point); return <circle key={index} cx={p.x} cy={p.y} r="9" fill="#fff" stroke="#f97316" strokeWidth="4" />; })}
                {calibrationPoints.length > 0 && <polyline points={calibrationPoints.map(pointToCanvas).map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="5" />}
                {calibrationPoints.map((point, index) => { const p = pointToCanvas(point); return <circle key={index} cx={p.x} cy={p.y} r="10" fill="#fff" stroke="#22c55e" strokeWidth="4" />; })}
                {obstacleStart && (() => { const p = pointToCanvas(obstacleStart); return <circle cx={p.x} cy={p.y} r="10" fill="#fff" stroke="#dc2626" strokeWidth="4" />; })()}
              </svg>
            </div>
          )}
        </div>
      </main>

      <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Kartinställningar</div>
        <div className="space-y-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-sm font-semibold">Bild</div>
            <div className="mt-2 space-y-2 text-xs text-slate-600">
              <div className="truncate">{trace.imageName || 'Ingen bild'}</div>
              <label className="block">Genomskinlighet<input type="range" min="0.2" max="1" step="0.05" value={trace.opacity ?? 1} onChange={event => setTrace(current => ({ ...current, opacity: Number(event.target.value) }))} className="mt-1 w-full" /></label>
              <div>{trace.naturalWidth && trace.naturalHeight ? `${trace.naturalWidth} × ${trace.naturalHeight} px` : 'Bildmått saknas'}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4" />Manuell kalibrering</div>
            <div className="mt-2 text-xs text-slate-500">Välj kalibreringsverktyget, klicka på två punkter och ange det verkliga måttet.</div>
            <div className="mt-3 flex gap-2"><input type="number" min="0" step="0.01" value={calibrationMeters} onChange={event => setCalibrationMeters(event.target.value)} placeholder="Meter" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /><Button size="sm" onClick={applyCalibration} disabled={calibrationPoints.length !== 2 || !(Number(calibrationMeters) > 0)}>Använd</Button></div>
            <div className="mt-2 text-xs font-medium text-slate-600">{trace.metersPerPixel ? `${trace.metersPerPixel.toFixed(5)} m/pixel` : 'Inte kalibrerad'}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold">Tak på kartbilden</div><span className="text-xs text-slate-500">{mappedRoofs.length} st</span></div>
            <div className="mt-2 space-y-1.5">{layout.roofs.map(roof => <button key={roof.id} type="button" onClick={() => setSelectedRoofId(roof.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${String(roof.id) === String(selectedRoofId) ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600'}`}><span className="block font-semibold">{roof.name}</span><span>{roof.mapPolygon?.length ? `${n(roof.widthM).toFixed(2)} × ${n(roof.roofFallM).toFixed(2)} m${roof.mapAreaM2 ? ` · ${roof.mapAreaM2.toFixed(1)} m²` : ''}` : 'Ingen polygon ritad'}</span></button>)}</div>
            {selectedRoof?.mapPolygon?.length > 0 && <Button variant="ghost" size="sm" onClick={removeSelectedRoofTrace} className="mt-2 w-full gap-2 text-red-600"><Trash2 className="h-4 w-4" />Ta bort kartpolygon och hinder</Button>}
          </section>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">Takmåtten från kalibrerad polygon synkas till befintliga fält för bredd och takfall. Taktyp, lutning, paneler och montagesystem ändras fortsatt i den vanliga Paneler-vyn.</div>
          <Button onClick={onSave} disabled={saving} className="w-full gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara kartprojektering'}</Button>
        </div>
      </aside>
    </div>
  );
}

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  const initialLayout = useMemo(() => readLayout(project), [project?.id]);
  const [layout, setLayout] = useState(initialLayout);
  const [trace, setTrace] = useState(() => ({ ...DEFAULT_TRACE, ...(initialLayout.mapTrace || {}), imageUrl: initialLayout.mapTrace?.imageUrl || project?.roof_image_url || '' }));
  const [mode, setMode] = useState(trace.imageUrl ? 'map' : 'panels');
  const [saving, setSaving] = useState(false);
  const [mountingContext, setMountingContext] = useState(false);

  useEffect(() => {
    const readActiveTab = () => {
      const active = Array.from(document.querySelectorAll('[role="tab"][data-state="active"]')).find(tab => /Paneler|Montage/i.test(tab.textContent || ''));
      setMountingContext(/Montage/i.test(active?.textContent || ''));
    };
    readActiveTab();
    const observer = new MutationObserver(readActiveTab);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const next = readLayout(project);
    setLayout(next);
    setTrace(current => ({ ...DEFAULT_TRACE, ...current, ...(next.mapTrace || {}), imageUrl: next.mapTrace?.imageUrl || project?.roof_image_url || current.imageUrl || '' }));
  }, [project?.id]);

  const mergedPayload = (sourceLayout = layout, sourceTrace = trace) => ({
    ...sourceLayout,
    version: Math.max(11, Number(sourceLayout.version) || 0),
    mapTrace: { ...sourceTrace, savedAt: new Date().toISOString() },
    roofs: sourceLayout.roofs || [],
    savedAt: new Date().toISOString(),
  });

  const saveMap = async () => {
    setSaving(true);
    const payload = mergedPayload();
    try {
      if (typeof window !== 'undefined' && project?.id) window.localStorage.setItem(`solarplan:project:${project.id}:solar_roof_planner_data`, JSON.stringify(payload));
      await onUpdate?.({
        roof_image_url: trace.imageUrl || project?.roof_image_url || '',
        solar_roof_planner_data: JSON.stringify(payload),
        panel_layout_data: JSON.stringify(payload),
        roof_width_m: payload.roofs?.[0]?.widthM || project?.roof_width_m || '',
        roof_height_m: payload.roofs?.[0]?.roofFallM || project?.roof_height_m || '',
      });
    } finally {
      setSaving(false);
    }
  };

  const plannerUpdate = async patch => {
    const nextPatch = { ...patch };
    if (patch?.solar_roof_planner_data !== undefined || patch?.panel_layout_data !== undefined) {
      const parsed = safeJson(patch.solar_roof_planner_data || patch.panel_layout_data, layout);
      const payload = mergedPayload(parsed, trace);
      nextPatch.solar_roof_planner_data = JSON.stringify(payload);
      nextPatch.panel_layout_data = JSON.stringify(payload);
      if (trace.imageUrl) nextPatch.roof_image_url = trace.imageUrl;
      setLayout(payload);
    }
    return onUpdate?.(nextPatch);
  };

  if (mountingContext) return <ExistingSolarRoofPlanner project={project} onUpdate={onUpdate} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode('panels')} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'panels' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><PanelTop className="h-4 w-4" />Panelplacering</button>
          <button type="button" onClick={() => setMode('map')} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'map' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><MapIcon className="h-4 w-4" />Kartbild och tak</button>
        </div>
        {trace.imageUrl && <div className="text-xs text-slate-500">Kartbild sparad · {layout.roofs.filter(roof => roof.mapPolygon?.length >= 3).length} ritade tak</div>}
      </div>
      {mode === 'map'
        ? <MapWorkspace project={project} layout={layout} setLayout={setLayout} trace={trace} setTrace={setTrace} onSave={saveMap} saving={saving} />
        : <ExistingSolarRoofPlanner project={{ ...project, solar_roof_planner_data: JSON.stringify(mergedPayload()) }} onUpdate={plannerUpdate} />}
    </div>
  );
}
