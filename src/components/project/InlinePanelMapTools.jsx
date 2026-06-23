import React, { useEffect, useRef, useState } from 'react';
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

function normalizedSvgPoint(event, width, height) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
  const matrix = svg?.getScreenCTM?.();
  if (!svg?.createSVGPoint || !matrix || !(width > 0) || !(height > 0)) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return {
    x: clamp(local.x / width, 0, 1),
    y: clamp(local.y / height, 0, 1),
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

function roofWithPolygonMetrics(roof, points, trace) {
  const dimensions = roofDimensions(points, trace);
  return {
    ...roof,
    mapPolygon: points,
    mapAreaM2: polygonArea(points, trace),
    ...(dimensions ? { widthM: Number(dimensions.widthM.toFixed(2)), roofFallM: Number(dimensions.roofFallM.toFixed(2)) } : {}),
  };
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
  const geometryDragRef = useRef(null);
  const canvasRef = useRef(null);
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
  const [obstacleStart, setObstacleStart] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadBlob, setUploadBlob] = useState(null);

  const selectedRoof = layout.roofs.find(roof => String(roof.id) === String(selectedRoofId)) || layout.roofs[0] || null;
  const mappedRoofs = layout.roofs.filter(roof => Array.isArray(roof.mapPolygon) && roof.mapPolygon.length >= 3);
  const address = projectAddress(project);
  const stageWidth = trace.naturalWidth || 1600;
  const stageHeight = trace.naturalHeight || 1000;

  useEffect(() => {
    const nextLayout = readLayout(project);
    const nextTrace = { ...DEFAULT_TRACE, ...(nextLayout.mapTrace || {}) };
    setLayout(nextLayout);
    setTrace(nextTrace);
    setSelectedRoofId(current => nextLayout.roofs.some(roof => String(roof.id) === String(current)) ? current : nextLayout.roofs?.[0]?.id || '');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  useEffect(() => {
    if (typeof window === 'undefined' || !project?.id) return;
    window.dispatchEvent(new CustomEvent('solarplan:map-layout-change', {
      detail: { projectId: String(project.id), layout },
    }));
  }, [layout, project?.id]);

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
      setZoom(0.8);
      setPan({ x: 0, y: 0 });
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
    updateRoof(targetRoof.id, roof => {
      const originalDimensions = roof.mapOriginalDimensions || (!roof.mapPolygon?.length ? {
        widthM: roof.widthM ?? '',
        roofFallM: roof.roofFallM ?? '',
        shape: roof.shape || 'Rektangel',
      } : null);
      const updated = roofWithPolygonMetrics({
        ...roof,
        shape: 'Fri polygon',
        ...(originalDimensions ? { mapOriginalDimensions: originalDimensions } : {}),
      }, points, trace);
      return updated;
    });
    setSelectedRoofId(targetRoof.id);
    setDraft([]);
    setTool('edit');
    setStatus(`${targetRoof.name} har ritats. Dra hörn, linjehandtag eller hela takytan för att justera ritningen.`);
  };

  const clearRoofDrawing = roofId => {
    const roof = layout.roofs.find(item => String(item.id) === String(roofId));
    if (!roof?.mapPolygon?.length) return;
    updateRoof(roofId, current => {
      const original = current.mapOriginalDimensions;
      const {
        mapPolygon,
        mapAreaM2,
        mapOriginalDimensions,
        obstacles,
        ...rest
      } = current;
      return {
        ...rest,
        widthM: original ? original.widthM : '',
        roofFallM: original ? original.roofFallM : '',
        shape: original?.shape || (current.shape === 'Fri polygon' ? 'Rektangel' : current.shape),
        obstacles: [],
      };
    });
    geometryDragRef.current = null;
    setDraft([]);
    setObstacleStart(null);
    setTool('draw');
    setStatus(`${roof.name}: takritning, kartmått och hinder har tagits bort. Själva taket och panelgrupperna finns kvar.`);
  };

  const handleCanvasClick = event => {
    if (!trace.imageUrl || geometryDragRef.current) return;
    const point = normalizedSvgPoint(event, stageWidth, stageHeight);
    if (!point) return;
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
      roofs: current.roofs.map(roof => roof.mapPolygon?.length ? roofWithPolygonMetrics(roof, roof.mapPolygon, calibrated) : roof),
    }));
    setTool('draw');
    setStatus(`Kalibrerat: ${metersPerPixel.toFixed(5)} meter per pixel.`);
  };

  const beginGeometryDrag = (event, type, roof, pointIndex = null) => {
    if (tool !== 'edit' || !roof?.mapPolygon?.length) return;
    const point = normalizedSvgPoint(event, stageWidth, stageHeight);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    geometryDragRef.current = {
      type,
      roofId: roof.id,
      pointIndex,
      start: point,
      original: roof.mapPolygon.map(item => ({ x: number(item.x), y: number(item.y) })),
    };
    setSelectedRoofId(roof.id);
  };

  const moveGeometryDrag = event => {
    const drag = geometryDragRef.current;
    if (!drag || tool !== 'edit') return;
    const point = normalizedSvgPoint(event, stageWidth, stageHeight);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    const rawDx = point.x - drag.start.x;
    const rawDy = point.y - drag.start.y;
    let nextPoints = drag.original.map(item => ({ ...item }));

    if (drag.type === 'point') {
      const originalPoint = drag.original[drag.pointIndex];
      nextPoints[drag.pointIndex] = {
        x: clamp(originalPoint.x + rawDx, 0, 1),
        y: clamp(originalPoint.y + rawDy, 0, 1),
      };
    } else {
      const indices = drag.type === 'edge'
        ? [drag.pointIndex, (drag.pointIndex + 1) % drag.original.length]
        : drag.original.map((_, index) => index);
      const indexedPoints = indices.map(index => drag.original[index]);
      const dx = clamp(rawDx, -Math.min(...indexedPoints.map(item => item.x)), 1 - Math.max(...indexedPoints.map(item => item.x)));
      const dy = clamp(rawDy, -Math.min(...indexedPoints.map(item => item.y)), 1 - Math.max(...indexedPoints.map(item => item.y)));
      nextPoints = nextPoints.map((item, index) => indices.includes(index) ? { x: item.x + dx, y: item.y + dy } : item);
    }

    updateRoof(drag.roofId, roof => roofWithPolygonMetrics(roof, nextPoints, trace));
  };

  const endGeometryDrag = event => {
    const drag = geometryDragRef.current;
    if (!drag) return;
    event?.stopPropagation?.();
    geometryDragRef.current = null;
    const roof = layout.roofs.find(item => String(item.id) === String(drag.roofId));
    setStatus(`${roof?.name || 'Takritningen'} har justerats.`);
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
      version: Math.max(12, Number(layout.version) || 0),
      mapTrace,
      roofs: layout.roofs,
      savedAt: new Date().toISOString(),
    };

    try {
      await onUpdate?.({
        solar_roof_planner_data: JSON.stringify(payload),
        panel_layout_data: JSON.stringify(payload),
        ...(remoteUrl ? { roof_image_url: remoteUrl } : {}),
        roof_width_m: payload.roofs?.[0]?.widthM || '',
        roof_height_m: payload.roofs?.[0]?.roofFallM || '',
      });
      setStatus(remoteUrl ? 'Kartbild, taklinjer, mått och paneler är sparade i projektet.' : 'Taklinjer, mått och paneler är sparade. Bilden sparades lokalt eftersom molnuppladdningen misslyckades.');
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

  const focusRoof = roof => {
    const bounds = polygonBounds(roof?.mapPolygon || []);
    const viewport = canvasRef.current;
    if (!bounds || !viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const roofWidthPx = Math.max(1, (bounds.maxX - bounds.minX) * stageWidth);
    const roofHeightPx = Math.max(1, (bounds.maxY - bounds.minY) * stageHeight);
    const padding = 56;
    const availableWidth = Math.max(80, viewportRect.width - padding * 2);
    const availableHeight = Math.max(80, viewportRect.height - padding * 2);
    const nextZoom = clamp(Math.min(availableWidth / roofWidthPx, availableHeight / roofHeightPx), 0.2, 8);
    const roofCenterX = ((bounds.minX + bounds.maxX) / 2) * stageWidth;
    const roofCenterY = ((bounds.minY + bounds.maxY) / 2) * stageHeight;

    setSelectedRoofId(roof.id);
    setZoom(nextZoom);
    setPan({
      x: -(roofCenterX - stageWidth / 2) * nextZoom,
      y: -(roofCenterY - stageHeight / 2) * nextZoom,
    });
    setStatus(`${roof.name} är fokuserat. Centrera bild för att visa hela kartan igen.`);
  };

  const toolbar = (
    <div className="flex flex-col items-center gap-1">
      <div className="my-1 h-px w-8 bg-slate-200" />
      <ToolbarButton title="Kartbild" active={mode === 'map'} onClick={() => setMode(current => current === 'map' ? 'panels' : 'map')}><MapIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Ladda upp eller klistra in kartbild" active={mode === 'map' && tool === 'image'} onClick={() => { setMode('map'); setTool('image'); fileInputRef.current?.click(); }}><ImagePlus className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Öppna projektadressen i Google Earth" onClick={openGoogleEarth}><Globe2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Panorera kartbild" active={mode === 'map' && tool === 'pan'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('pan'); }}><Hand className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Kalibrera känd sträcka" active={mode === 'map' && tool === 'calibrate'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('calibrate'); setCalibrationPoints([]); }}><Ruler className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Rita takpolygon" active={mode === 'map' && tool === 'draw'} disabled={!trace.imageUrl} onClick={() => { setMode('map'); setTool('draw'); setDraft([]); }}><Pentagon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Redigera eller flytta taklinjer" active={mode === 'map' && tool === 'edit'} disabled={!mappedRoofs.length} onClick={() => { setMode('map'); setTool('edit'); setStatus('Dra orange hörn, blå linjehandtag eller själva takytan.'); }}><MousePointer2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Lägg till hinder" active={mode === 'map' && tool === 'obstacle'} disabled={!selectedRoof?.mapPolygon?.length} onClick={() => { setMode('map'); setTool('obstacle'); setObstacleStart(null); }}><SquareDashed className="h-4 w-4" /></ToolbarButton>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => handleImage(event.target.files?.[0])} />
    </div>
  );

  const canvas = mode === 'map' ? (
    <div ref={canvasRef} className="absolute inset-0 z-40 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-inner" onPointerMove={movePan} onPointerUp={stopPan} onPointerLeave={stopPan}>
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
          className="absolute origin-center select-none"
          style={{
            width: stageWidth,
            height: stageHeight,
            left: `calc(50% + ${pan.x}px)`,
            top: `calc(50% + ${pan.y}px)`,
            transform: `translate(-50%, -50%) scale(${zoom})`,
          }}
          onPointerDown={beginPan}
        >
          <img src={trace.imageUrl} alt="Kartbild" draggable={false} className="absolute inset-0 h-full w-full" style={{ opacity: trace.opacity ?? 1 }} />
          <svg
            viewBox={`0 0 ${stageWidth} ${stageHeight}`}
            className="absolute inset-0 h-full w-full touch-none"
            onClick={handleCanvasClick}
            onPointerMove={moveGeometryDrag}
            onPointerUp={endGeometryDrag}
            onPointerCancel={endGeometryDrag}
            onPointerLeave={endGeometryDrag}
          >
            {mappedRoofs.map(roof => {
              const isSelectedRoof = String(roof.id) === String(selectedRoofId);
              return (
                <g key={roof.id} onClick={event => {
                  if (tool === 'edit') {
                    event.stopPropagation();
                    setSelectedRoofId(roof.id);
                    return;
                  }
                  event.stopPropagation();
                  focusRoof(roof);
                }}>
                  <polygon
                    className={tool === 'edit' ? 'cursor-move' : 'cursor-zoom-in'}
                    points={roof.mapPolygon.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')}
                    fill={isSelectedRoof ? 'rgba(249,115,22,.20)' : 'rgba(37,99,235,.16)'}
                    stroke={isSelectedRoof ? '#f97316' : '#2563eb'}
                    strokeWidth="4"
                    onPointerDown={event => beginGeometryDrag(event, 'polygon', roof)}
                  />
                  {roof.mapPolygon.map((point, index) => {
                    const next = roof.mapPolygon[(index + 1) % roof.mapPolygon.length];
                    const length = edgeLength(point, next, trace);
                    const x = point.x * stageWidth;
                    const y = point.y * stageHeight;
                    const nextX = next.x * stageWidth;
                    const nextY = next.y * stageHeight;
                    const middleX = (x + nextX) / 2;
                    const middleY = (y + nextY) / 2;
                    return (
                      <React.Fragment key={`${roof.id}-${index}`}>
                        {tool === 'edit' && isSelectedRoof && (
                          <>
                            <line
                              x1={x}
                              y1={y}
                              x2={nextX}
                              y2={nextY}
                              stroke="transparent"
                              strokeWidth="20"
                              className="cursor-move"
                              onPointerDown={event => beginGeometryDrag(event, 'edge', roof, index)}
                            />
                            <circle
                              cx={middleX}
                              cy={middleY}
                              r="8"
                              fill="#ffffff"
                              stroke="#2563eb"
                              strokeWidth="4"
                              className="cursor-move"
                              onPointerDown={event => beginGeometryDrag(event, 'edge', roof, index)}
                            />
                          </>
                        )}
                        {length != null && <text pointerEvents="none" x={middleX} y={middleY - 8} textAnchor="middle" fill="#fff" stroke="#0f172a" strokeWidth="4" paintOrder="stroke" fontSize="18" fontWeight="800">{length.toFixed(2)} m</text>}
                        {tool === 'edit' && isSelectedRoof && (
                          <circle
                            cx={x}
                            cy={y}
                            r="10"
                            fill="#fff"
                            stroke="#f97316"
                            strokeWidth="4"
                            className="cursor-move"
                            onClick={event => event.stopPropagation()}
                            onPointerDown={event => beginGeometryDrag(event, 'point', roof, index)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                  {(roof.obstacles || []).map(obstacle => <rect pointerEvents="none" key={obstacle.id} x={obstacle.x * stageWidth} y={obstacle.y * stageHeight} width={obstacle.width * stageWidth} height={obstacle.height * stageHeight} fill="rgba(220,38,38,.25)" stroke="#dc2626" strokeWidth="3" strokeDasharray="10 6" />)}
                </g>
              );
            })}
            {draft.length > 0 && <polyline points={draft.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')} fill="rgba(249,115,22,.12)" stroke="#f97316" strokeWidth="4" strokeDasharray="10 6" />}
            {draft.map((point, index) => <circle key={index} cx={point.x * stageWidth} cy={point.y * stageHeight} r="9" fill="#fff" stroke="#f97316" strokeWidth="4" />)}
            {calibrationPoints.length > 0 && <polyline points={calibrationPoints.map(point => `${point.x * stageWidth},${point.y * stageHeight}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="5" />}
            {calibrationPoints.map((point, index) => <circle key={index} cx={point.x * stageWidth} cy={point.y * stageHeight} r="10" fill="#fff" stroke="#22c55e" strokeWidth="4" />)}
          </svg>
        </div>
      )}
      <div className="absolute right-3 top-3 z-50 flex gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm">
        <ToolbarButton title="Zooma in" onClick={() => setZoom(current => Math.min(8, current + 0.15))}><ZoomIn className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Zooma ut" onClick={() => setZoom(current => Math.max(0.2, current - 0.15))}><ZoomOut className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Centrera bild" onClick={() => { setZoom(0.8); setPan({ x: 0, y: 0 }); }}><Crosshair className="h-4 w-4" /></ToolbarButton>
      </div>
      {status && <div className="absolute bottom-3 left-3 z-50 max-w-[620px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm">{status}</div>}
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
        <div className="mt-2 text-[11px] leading-4 text-slate-500">Välj redigeringsverktyget och dra orange hörn, blå linjehandtag eller hela takytan.</div>
        <div className="mt-2 space-y-1.5">
          {layout.roofs.map(roof => {
            const activeRoof = String(roof.id) === String(selectedRoofId);
            return (
              <div key={roof.id} className={`flex items-stretch overflow-hidden rounded-xl border ${activeRoof ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                <button type="button" onClick={() => roof.mapPolygon?.length ? focusRoof(roof) : setSelectedRoofId(roof.id)} className="min-w-0 flex-1 px-3 py-2 text-left text-xs">
                  <span className="block font-semibold">{roof.name}</span>
                  <span>{roof.mapPolygon?.length ? `${number(roof.widthM).toFixed(2)} × ${number(roof.roofFallM).toFixed(2)} m${roof.mapAreaM2 ? ` · ${roof.mapAreaM2.toFixed(1)} m²` : ''}` : 'Ingen polygon ritad'}</span>
                </button>
                {roof.mapPolygon?.length ? (
                  <button type="button" title="Ta bort takritning och kartmått" aria-label={`Ta bort takritning och kartmått för ${roof.name}`} onClick={() => clearRoofDrawing(roof.id)} className="flex w-10 items-center justify-center border-l border-current/10 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
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
