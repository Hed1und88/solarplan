import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Crosshair,
  ExternalLink,
  Globe2,
  Hand,
  ImagePlus,
  Map as MapIcon,
  MousePointer2,
  Pentagon,
  Ruler,
  Save,
  SquareDashed,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const DB_NAME = 'solarplan-map-images';
const STORE_NAME = 'images';
const MAX_IMAGE_SIDE = 2400;
const DEFAULT_TRACE = {
  imageUrl: '',
  imageKey: '',
  imageName: '',
  naturalWidth: 0,
  naturalHeight: 0,
  metersPerPixel: 0,
  calibration: null,
  opacity: 1,
};

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function readLayout(project) {
  for (const raw of [project?.solar_roof_planner_data, project?.panel_layout_data]) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  return { version: 10, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

function projectAddress(project = {}) {
  return project.address || [project.street_address, project.postal_code, project.postal_city].filter(Boolean).join(', ');
}

function openImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putLocalImage(key, blob) {
  const db = await openImageDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(blob, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getLocalImage(key) {
  if (!key) return null;
  const db = await openImageDb();
  const result = await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function removeLocalImage(key) {
  if (!key) return;
  const db = await openImageDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function compressImage(file) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Bilden kunde inte komprimeras.')), 'image/jpeg', 0.84));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function normalizedPoint(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function pointDistance(a, b) {
  return Math.hypot(number(a?.x) - number(b?.x), number(a?.y) - number(b?.y));
}

function polygonBounds(points = []) {
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y)),
  };
}

function polygonArea(points, trace) {
  if (!points?.length || !trace.metersPerPixel || !trace.naturalWidth || !trace.naturalHeight) return null;
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

function roofDimensions(points, trace) {
  const bounds = polygonBounds(points);
  if (!bounds || !trace.metersPerPixel || !trace.naturalWidth || !trace.naturalHeight) return null;
  return {
    widthM: (bounds.maxX - bounds.minX) * trace.naturalWidth * trace.metersPerPixel,
    roofFallM: (bounds.maxY - bounds.minY) * trace.naturalHeight * trace.metersPerPixel,
  };
}

function edgeLength(a, b, trace) {
  if (!trace.metersPerPixel || !trace.naturalWidth || !trace.naturalHeight) return null;
  return Math.hypot(
    (a.x - b.x) * trace.naturalWidth,
    (a.y - b.y) * trace.naturalHeight,
  ) * trace.metersPerPixel;
}

function ToolbarButton({ title, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'border-orange-300 bg-orange-50 text-orange-600 shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

export default function InlinePanelMapTools({ project, onUpdate, toolbarTarget, canvasTarget, settingsTarget }) {
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const [layout, setLayout] = useState(() => readLayout(project));
  const [trace, setTrace] = useState(() => ({ ...DEFAULT_TRACE, ...(readLayout(project).mapTrace || {}) }));
  const [mode, setMode] = useState('panels');
  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [calibrationMeters, setCalibrationMeters] = useState('');
  const [selectedRoofId, setSelectedRoofId] = useState(() => readLayout(project).roofs?.[0]?.id || '');
  const [dragPoint, setDragPoint] = useState(null);
  const [obstacleStart, setObstacleStart] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadBlob, setUploadBlob] = useState(null);

  const selectedRoof = layout.roofs.find(roof => String(roof.id) === String(selectedRoofId)) || layout.roofs[0] || null;
  const mappedRoofs = layout.roofs.filter(roof => Array.isArray(roof.mapPolygon) && roof.mapPolygon.length >= 3);
  const address = projectAddress(project);

  useEffect(() => {
    const nextLayout = readLayout(project);
    const nextTrace = { ...DEFAULT_TRACE, ...(nextLayout.mapTrace || {}) };
    setLayout(nextLayout);
    setTrace(nextTrace);
    setSelectedRoofId(current => nextLayout.roofs.some(roof => String(roof.id) === String(current)) ? current : nextLayout.roofs?.[0]?.id || '');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  useEffect(() => {
    let objectUrl = '';
    if (!trace.imageUrl && trace.imageKey) {
      getLocalImage(trace.imageKey).then(blob => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setTrace(current => ({ ...current, imageUrl: objectUrl }));
      }).catch(() => {});
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [trace.imageKey]);

  useEffect(() => {
    const handlePaste = event => {
      const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith('image/'));
      if (file) handleImage(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const openGoogleEarth = () => {
    const query = address || [project?.latitude, project?.longitude].filter(value => value !== undefined && value !== '').join(',');
    if (!query) {
      setStatus('Projektet saknar adress och koordinater.');
      return;
    }
    window.open(`https://earth.google.com/web/search/${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  };

  const handleImage = async file => {
    if (!file) return;
    setMode('map');
    setTool('calibrate');
    setStatus('Bearbetar bilden...');
    try {
      const { blob, width, height } = await compressImage(file);
      const key = `project-${project.id}-map`;
      await putLocalImage(key, blob);
      const localUrl = URL.createObjectURL(blob);
      setUploadBlob(blob);
      setTrace(current => ({
        ...current,
        imageUrl: localUrl,
        imageKey: key,
        imageName: file.name || 'kartbild.jpg',
        naturalWidth: width,
        naturalHeight: height,
      }));
      setStatus(`Bilden är klar (${width} × ${height}px). Markera en känd sträcka för kalibrering.`);
    } catch (error) {
      setStatus(error?.message || 'Bilden kunde inte läsas.');
    }
  };

  const updateRoof = (roofId, updater) => {
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => String(roof.id) === String(roofId) ? updater(roof) : roof),
    }));
  };

  const finishPolygon = points => {
    if (points.length < 3) return;
    const targetRoof = selectedRoof || layout.roofs.find(roof => !roof.mapPolygon?.length) || layout.roofs[0];
    if (!targetRoof) return;
    const dimensions = roofDimensions(points, trace);
    updateRoof(targetRoof.id, roof => ({
      ...roof,
      shape: 'Fri polygon',
      mapPolygon: points,
      mapAreaM2: polygonArea(points, trace),
      ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
    }));
    setSelectedRoofId(targetRoof.id);
    setDraft([]);
    setTool('edit');
    setStatus(`${targetRoof.name} har ritats på kartbilden.`);
  };

  const handleCanvasClick = event => {
    if (!trace.imageUrl) return;
    const point = normalizedPoint(event);
    if (tool === 'draw') {
      if (draft.length >= 3 && pointDistance(point, draft[0]) < 0.025) finishPolygon(draft);
      else setDraft(current => [...current, point]);
      return;
    }
    if (tool === 'calibrate') {
      setCalibrationPoints(current => current.length >= 2 ? [point] : [...current, point]);
      return;
    }
    if (tool === 'obstacle' && selectedRoof) {
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
        updateRoof(selectedRoof.id, roof => ({ ...roof, obstacles: [...(roof.obstacles || []), obstacle] }));
        setObstacleStart(null);
        setStatus('Hindret är tillagt.');
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
    const calibrated = { ...trace, metersPerPixel, calibration: { points: calibrationPoints, meters: Number(calibrationMeters) } };
    setTrace(calibrated);
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => {
        if (!roof.mapPolygon?.length) return roof;
        const dimensions = roofDimensions(roof.mapPolygon, calibrated);
        return {
          ...roof,
          mapAreaM2: polygonArea(roof.mapPolygon, calibrated),
          ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
        };
      }),
    }));
    setTool('draw');
    setStatus(`Kalibrerat: ${metersPerPixel.toFixed(5)} meter per pixel.`);
  };

  const moveRoofPoint = (roofId, pointIndex, point) => {
    updateRoof(roofId, roof => {
      const mapPolygon = roof.mapPolygon.map((item, index) => index === pointIndex ? point : item);
      const dimensions = roofDimensions(mapPolygon, trace);
      return {
        ...roof,
        mapPolygon,
        mapAreaM2: polygonArea(mapPolygon, trace),
        ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
      };
    });
  };

  const save = async () => {
    setSaving(true);
    setStatus('Sparar kartprojekteringen...');
    let remoteUrl = trace.imageUrl?.startsWith('blob:') ? '' : trace.imageUrl;
    if (uploadBlob) {
      try {
        const file = new File([uploadBlob], trace.imageName || 'kartbild.jpg', { type: 'image/jpeg' });
        const result = await base44.integrations.Core.UploadFile({ file });
        remoteUrl = result?.file_url || result?.url || result?.fileUrl || result?.data?.file_url || result?.data?.url || '';
      } catch {
        remoteUrl = '';
      }
    }

    const mapTrace = {
      ...trace,
      imageUrl: remoteUrl,
      savedAt: new Date().toISOString(),
    };
    const payload = {
      ...layout,
      version: Math.max(11, Number(layout.version) || 0),
      mapTrace,
      roofs: layout.roofs,
      savedAt: new Date().toISOString(),
    };

    try {
      await onUpdate?.({
        solar_roof_planner_data: JSON.stringify(payload),
        panel_layout_data: JSON.stringify(payload),
        ...(remoteUrl ? { roof_image_url: remoteUrl } : {}),
        roof_width_m: payload.roofs?.[0]?.widthM || project?.roof_width_m || '',
        roof_height_m: payload.roofs?.[0]?.roofFallM || project?.roof_height_m || '',
      });
      setStatus(remoteUrl ? 'Kartbild och tak är sparade i projektet.' : 'Tak och kalibrering är sparade. Bilden sparades lokalt eftersom molnuppladdningen misslyckades.');
    } catch (error) {
      setStatus(error?.message || 'Kartprojekteringen kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async () => {
    await removeLocalImage(trace.imageKey).catch(() => {});
    setUploadBlob(null);
    setTrace({ ...DEFAULT_TRACE });
    setDraft([]);
    setCalibrationPoints([]);
    setStatus('Kartbilden är borttagen.');
  };

  const beginPan = event => {
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

  const toolbar = (
    <div className="flex flex-col items-center gap-1">
      <div className="my-1 h-px w-8 bg-slate-200" />
      <ToolbarButton title="Kartbild" active={mode === 'map'} onClick={() => setMode(current => current === 'map' ? 'panels' : 'map')}><MapIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Ladda upp eller klistra in kartbild" active={mode === 'map' && tool === 'image'} onClick={() => { setMode('map'); setTool('image'); fileInputRef.current?.click(); }}><ImagePlus className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Öppna projektadressen i Google Earth" onClick={openGoogleEarth}><Globe2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Panorera kartbild" active={mode === 'map' && tool === 'pan'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('pan'); }}><Hand className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Kalibrera känd sträcka" active={mode === 'map' && tool === 'calibrate'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('calibrate'); setCalibrationPoints([]); }}><Ruler className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Rita takpolygon" active={mode === 'map' && tool === 'draw'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('draw'); setDraft([]); }}><Pentagon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Redigera hörnpunkter" active={mode === 'map' && tool === 'edit'} disabled={!mappedRoofs.length} onClick={() => { setMode('map'); setTool('edit'); }}><MousePointer2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Lägg till hinder" active={mode === 'map' && tool === 'obstacle'} disabled={!selectedRoof?.mapPolygon?.length} onClick={() => { setMode('map'); setTool('obstacle'); setObstacleStart(null); }}><SquareDashed className="h-4 w-4" /></ToolbarButton>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => handleImage(event.target.files?.[0])} />
    </div>
  );

  const stageWidth = trace.naturalWidth || 1600;
  const stageHeight = trace.naturalHeight || 1000;

  const canvas = mode === 'map' ? (
    <div className="absolute inset-0 z-40 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-inner" onPointerMove={movePan} onPointerUp={stopPan} onPointerLeave={stopPan}>
      {!trace.imageUrl ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center shadow-sm">
            <MapIcon className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <div className="font-semibold text-slate-900">Kartbild i befintlig Paneler-vy</div>
            <div className="mt-2 text-sm text-slate-500">Öppna projektadressen i Google Earth, ta en skärmbild och ladda upp eller klistra in den här.</div>
            <div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={openGoogleEarth}><ExternalLink className="mr-2 h-4 w-4" />Google Earth</Button><Button onClick={() => fileInputRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Ladda upp</Button></div>
          </div>
        </div>
      ) : (
        <div
          className="absolute left-1/2 top-1/2 origin-center select-none"
          style={{ width: stageWidth, height: stageHeight, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
          onPointerDown={beginPan}
        >
          <img src={trace.imageUrl} alt="Kartbild" draggable={false} className="absolute inset-0 h-full w-full" style={{ opacity: trace.opacity ?? 1 }} />
          <svg viewBox={`0 0 ${stageWidth} ${stageHeight}`} className="absolute inset-0 h-full w-full touch-none" onClick={handleCanvasClick}>
            {mappedRoofs.map(roof => (
              <g key={roof.id} onClick={event => { event.stopPropagation(); setSelectedRoofId(roof.id); }}>
                <polygon points={roof.mapPolygon.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')} fill={String(roof.id) === String(selectedRoofId) ? 'rgba(249,115,22,.20)' : 'rgba(37,99,235,.16)'} stroke={String(roof.id) === String(selectedRoofId) ? '#f97316' : '#2563eb'} strokeWidth="4" />
                {roof.mapPolygon.map((point, index) => {
                  const next = roof.mapPolygon[(index + 1) % roof.mapPolygon.length];
                  const length = edgeLength(point, next, trace);
                  const x = point.x * stageWidth;
                  const y = point.y * stageHeight;
                  return (
                    <React.Fragment key={`${roof.id}-${index}`}>
                      {length != null && <text x={(point.x + next.x) * stageWidth / 2} y={(point.y + next.y) * stageHeight / 2 - 8} textAnchor="middle" fill="#fff" stroke="#0f172a" strokeWidth="4" paintOrder="stroke" fontSize="18" fontWeight="800">{length.toFixed(2)} m</text>}
                      {tool === 'edit' && <circle cx={x} cy={y} r="10" fill="#fff" stroke="#f97316" strokeWidth="4" onPointerDown={event => { event.stopPropagation(); setDragPoint({ roofId: roof.id, pointIndex: index }); event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerMove={event => { if (!dragPoint || dragPoint.roofId !== roof.id || dragPoint.pointIndex !== index) return; moveRoofPoint(roof.id, index, normalizedPoint(event)); }} onPointerUp={() => setDragPoint(null)} />}
                    </React.Fragment>
                  );
                })}
                {(roof.obstacles || []).map(obstacle => <rect key={obstacle.id} x={obstacle.x * stageWidth} y={obstacle.y * stageHeight} width={obstacle.width * stageWidth} height={obstacle.height * stageHeight} fill="rgba(220,38,38,.25)" stroke="#dc2626" strokeWidth="3" strokeDasharray="10 6" />)}
              </g>
            ))}
            {draft.length > 0 && <polyline points={draft.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')} fill="rgba(249,115,22,.12)" stroke="#f97316" strokeWidth="4" strokeDasharray="10 6" />}
            {draft.map((point, index) => <circle key={index} cx={point.x * stageWidth} cy={point.y * stageHeight} r="9" fill="#fff" stroke="#f97316" strokeWidth="4" />)}
            {calibrationPoints.length > 0 && <polyline points={calibrationPoints.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="5" />}
            {calibrationPoints.map((point, index) => <circle key={index} cx={point.x * stageWidth} cy={point.y * stageHeight} r="10" fill="#fff" stroke="#22c55e" strokeWidth="4" />)}
          </svg>
        </div>
      )}
      <div className="absolute right-3 top-3 z-50 flex gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm">
        <ToolbarButton title="Zooma in" onClick={() => setZoom(current => Math.min(3, current + 0.15))}><ZoomIn className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Zooma ut" onClick={() => setZoom(current => Math.max(0.2, current - 0.15))}><ZoomOut className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Centrera bild" onClick={() => { setZoom(0.8); setPan({ x: 0, y: 0 }); }}><Crosshair className="h-4 w-4" /></ToolbarButton>
      </div>
      {status && <div className="absolute bottom-3 left-3 z-50 max-w-[520px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm">{status}</div>}
    </div>
  ) : null;

  const settings = mode === 'map' ? (
    <div className="space-y-3">
      <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MapIcon className="h-4 w-4 text-orange-500" />Kartbild</div><button type="button" onClick={() => setMode('panels')} className="text-xs font-semibold text-orange-700">Panelvy</button></div>
        <div className="mt-2 text-xs text-slate-600">{trace.imageName || 'Ingen kartbild vald'}</div>
        <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={openGoogleEarth}><Globe2 className="mr-1.5 h-4 w-4" />Google Earth</Button><Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><ImagePlus className="mr-1.5 h-4 w-4" />Bild</Button></div>
        {trace.imageUrl && <button type="button" onClick={removeImage} className="mt-2 inline-flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" />Ta bort kartbild</button>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4" />Manuell kalibrering</div>
        <div className="mt-2 text-xs text-slate-500">Klicka två punkter i bilden och ange verkligt avstånd.</div>
        <div className="mt-3 flex gap-2"><input type="number" min="0" step="0.01" value={calibrationMeters} onChange={event => setCalibrationMeters(event.target.value)} placeholder="Meter" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /><Button size="sm" onClick={applyCalibration} disabled={calibrationPoints.length !== 2 || !(Number(calibrationMeters) > 0)}>Använd</Button></div>
        <div className="mt-2 text-xs font-medium text-slate-600">{trace.metersPerPixel ? `${trace.metersPerPixel.toFixed(5)} m/pixel` : 'Inte kalibrerad'}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between"><div className="text-sm font-semibold">Takpolygoner</div><span className="text-xs text-slate-500">{mappedRoofs.length} st</span></div>
        <div className="mt-2 space-y-1.5">{layout.roofs.map(roof => <button key={roof.id} type="button" onClick={() => setSelectedRoofId(roof.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${String(roof.id) === String(selectedRoofId) ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600'}`}><span className="block font-semibold">{roof.name}</span><span>{roof.mapPolygon?.length ? `${number(roof.widthM).toFixed(2)} × ${number(roof.roofFallM).toFixed(2)} m${roof.mapAreaM2 ? ` · ${roof.mapAreaM2.toFixed(1)} m²` : ''}` : 'Ingen polygon ritad'}</span></button>)}</div>
      </section>

      <Button onClick={save} disabled={saving} className="w-full gap-2 bg-orange-500 text-white hover:bg-orange-600"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara kartprojektering'}</Button>
    </div>
  ) : null;

  return (
    <>
      {toolbarTarget && createPortal(toolbar, toolbarTarget)}
      {canvasTarget && canvas && createPortal(canvas, canvasTarget)}
      {settingsTarget && settings && createPortal(settings, settingsTarget)}
    </>
  );
}
