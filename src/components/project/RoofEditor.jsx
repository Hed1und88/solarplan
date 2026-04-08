import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Minus, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut, Check } from 'lucide-react';

// ── Solar panel SVG ──────────────────────────────────────────────────────────
function SolarPanelSVG({ isSelected }) {
  return (
    <svg width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.15} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="#1a2540" rx="2" />
      <pattern id="pc" x="0" y="0" width="16.666%" height="25%" patternUnits="objectBoundingBox">
        <rect x="5%" y="5%" width="90%" height="90%" fill="#1e3560" stroke="#2a4070" strokeWidth="0.5" rx="1" />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#pc)" />
      <rect x="0" y="0" width="100%" height="100%" fill="url(#pg)" rx="2" />
      <rect x="0.5" y="0.5" width="99%" height="99%" fill="none"
        stroke={isSelected ? '#60a5fa' : '#3a5090'} strokeWidth={isSelected ? 2 : 1} rx="2" />
    </svg>
  );
}

// ── Point-in-polygon (ray casting) ──────────────────────────────────────────
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// ── Edge-length input row ────────────────────────────────────────────────────
function EdgeInputs({ polygon, edgeLengths, onEdgeLengthChange }) {
  if (polygon.length < 2) return null;
  const edges = polygon.map((pt, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return { i, label: `Sida ${i + 1}→${(i + 1) % polygon.length + 1}`, from: pt, to: next };
  });
  return (
    <div className="flex flex-wrap gap-2 items-center px-3 py-2 bg-gray-800 border-t border-gray-700">
      <span className="text-xs text-gray-400 shrink-0">Sidlängder (m):</span>
      {edges.map(edge => (
        <div key={edge.i} className="flex items-center gap-1">
          <span className="text-xs text-gray-500">{edge.label}:</span>
          <input
            type="number" min="0.1" step="0.1"
            value={edgeLengths[edge.i] || ''}
            onChange={e => onEdgeLengthChange(edge.i, e.target.value)}
            placeholder="m"
            className="w-16 bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RoofEditor({
  imageUrl, panels, onPanelsChange,
  obstacles, onObstaclesChange,
  selectedProduct, onClose,
  // Controlled polygon + edge lengths
  polygon: polygonProp = [], onPolygonChange,
  edgeLengths: edgeLengthsProp = {}, onEdgeLengthsChange,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });

  // Polygon state — controlled via props
  const [polygon, setPolygon] = useState(polygonProp);
  const [polyDone, setPolyDone] = useState(polygonProp.length >= 3);
  const [edgeLengths, setEdgeLengths] = useState(edgeLengthsProp);

  // Long-press detection
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0); // 0-100
  const progressTimer = useRef(null);

  // Pan drag
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Drag panel
  const draggingId = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Always-current refs
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const imgNatRef = useRef({ w: 1, h: 1 });
  const polygonRef = useRef([]);
  const polyDoneRef = useRef(false);
  const isDrawingModeRef = useRef(false);

  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { imgNatRef.current = imgNatural; }, [imgNatural]);
  useEffect(() => { polygonRef.current = polygon; }, [polygon]);
  useEffect(() => { polyDoneRef.current = polyDone; }, [polyDone]);
  useEffect(() => { isDrawingModeRef.current = isDrawingMode; }, [isDrawingMode]);

  // ── Image load ────────────────────────────────────────────────────────────
  const handleImgLoad = () => {
    if (!imgRef.current) return;
    const w = imgRef.current.naturalWidth;
    const h = imgRef.current.naturalHeight;
    setImgNatural({ w, h });
    imgNatRef.current = { w, h };
  };

  useEffect(() => {
    if (!containerRef.current || imgNatural.w <= 1) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.92;
    setZoom(fit); zoomRef.current = fit;
    setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
  }, [imgNatural]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const n = Math.max(0.1, Math.min(10, zoomRef.current * (e.deltaY < 0 ? 1.12 : 0.9)));
      setZoom(n); zoomRef.current = n;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── clientXY → % of image ─────────────────────────────────────────────────
  const clientToImgPct = useCallback((cx, cy) => {
    const rect = containerRef.current.getBoundingClientRect();
    const p = panRef.current; const z = zoomRef.current; const nat = imgNatRef.current;
    const imgLeft = rect.left + rect.width / 2 + p.x - (nat.w * z) / 2;
    const imgTop  = rect.top  + rect.height / 2 + p.y - (nat.h * z) / 2;
    return {
      x: ((cx - imgLeft) / (nat.w * z)) * 100,
      y: ((cy - imgTop)  / (nat.h * z)) * 100,
    };
  }, []);

  // ── Long-press handlers ───────────────────────────────────────────────────
  const startLongPress = useCallback((cx, cy) => {
    longPressFired.current = false;
    setLongPressProgress(0);
    const startTime = Date.now();
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setLongPressProgress(Math.min(100, (elapsed / 2000) * 100));
    }, 30);
    longPressTimer.current = setTimeout(() => {
      clearInterval(progressTimer.current);
      setLongPressProgress(100);
      longPressFired.current = true;
      const pos = clientToImgPct(cx, cy);
      setIsDrawingMode(true);
      isDrawingModeRef.current = true;
      setPolyDone(false);
      polyDoneRef.current = false;
      setPolygon([pos]);
      polygonRef.current = [pos];
      setTimeout(() => setLongPressProgress(0), 300);
    }, 2000);
  }, [clientToImgPct]);

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
    clearInterval(progressTimer.current);
    setLongPressProgress(0);
  }, []);

  // ── Click on canvas → add polygon point ──────────────────────────────────
  const handleCanvasClick = useCallback((cx, cy) => {
    if (!isDrawingModeRef.current || polyDoneRef.current) return;
    const poly = polygonRef.current;
    if (poly.length === 0) return;
    const pos = clientToImgPct(cx, cy);

    // Check if clicking near the first point to close polygon
    if (poly.length >= 3) {
      const first = poly[0];
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
      if (dist < 3) {
        setPolyDone(true);
        polyDoneRef.current = true;
        setIsDrawingMode(false);
        isDrawingModeRef.current = false;
        onPolygonChange?.(poly);
        return;
      }
    }
    const next = [...poly, pos];
    setPolygon(next);
    polygonRef.current = next;
  }, [clientToImgPct, onPolygonChange]);

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (draggingId.current) return;
    if (!isDrawingModeRef.current) {
      // Start long-press if NOT already in drawing mode
      if (!polyDoneRef.current) {
        startLongPress(e.clientX, e.clientY);
      }
      // Also allow panning
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...panRef.current };
    }
  }, [startLongPress]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current && !isDrawingModeRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      // Cancel long press if dragging
      if (Math.hypot(dx, dy) > 8) cancelLongPress();
      const next = { x: panOrigin.current.x + dx, y: panOrigin.current.y + dy };
      setPan(next); panRef.current = next;
    }
    if (draggingId.current) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      onPanelsChange(prev => prev.map(p =>
        p.id === draggingId.current
          ? { ...p, x: pos.x - dragOffset.current.x, y: pos.y - dragOffset.current.y }
          : p
      ));
    }
  }, [cancelLongPress, clientToImgPct, onPanelsChange]);

  const handleMouseUp = useCallback((e) => {
    cancelLongPress();
    const wasPanning = isPanning.current;
    isPanning.current = false;
    draggingId.current = null;

    if (isDrawingModeRef.current) {
      // In drawing mode, every click adds a point
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.hypot(dx, dy) < 8) {
        handleCanvasClick(e.clientX, e.clientY);
      }
    }
  }, [cancelLongPress, handleCanvasClick]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── Touch events ──────────────────────────────────────────────────────────
  const lastTouch = useRef(null);
  const lastTouchDist = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      lastTouchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      cancelLongPress();
      return;
    }
    const t = e.touches[0];
    lastTouch.current = { x: t.clientX, y: t.clientY };
    if (!isDrawingModeRef.current && !polyDoneRef.current) {
      startLongPress(t.clientX, t.clientY);
    }
  }, [startLongPress, cancelLongPress]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && lastTouchDist.current) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const n = Math.max(0.1, Math.min(10, zoomRef.current * (dist / lastTouchDist.current)));
      setZoom(n); zoomRef.current = n;
      lastTouchDist.current = dist;
      return;
    }
    if (e.touches.length === 1 && lastTouch.current) {
      const t = e.touches[0];
      const dx = t.clientX - lastTouch.current.x;
      const dy = t.clientY - lastTouch.current.y;
      if (Math.hypot(dx, dy) > 8) cancelLongPress();
      if (!isDrawingModeRef.current) {
        const next = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        setPan(next); panRef.current = next;
        lastTouch.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, [cancelLongPress]);

  const handleTouchEnd = useCallback((e) => {
    cancelLongPress();
    if (e.changedTouches.length === 1 && isDrawingModeRef.current) {
      const t = e.changedTouches[0];
      const start = lastTouch.current || { x: t.clientX, y: t.clientY };
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) < 8) {
        handleCanvasClick(t.clientX, t.clientY);
      }
    }
    lastTouchDist.current = null;
  }, [cancelLongPress, handleCanvasClick]);

  // ── Panel dragging ────────────────────────────────────────────────────────
  const handlePanelMouseDown = (e, panel) => {
    if (isDrawingMode) return;
    e.preventDefault(); e.stopPropagation();
    const pos = clientToImgPct(e.clientX, e.clientY);
    dragOffset.current = { x: pos.x - panel.x, y: pos.y - panel.y };
    draggingId.current = panel.id;
  };

  // ── Edge length input ─────────────────────────────────────────────────────
  const handleEdgeLengthChange = (idx, val) => {
    const next = { ...edgeLengths, [idx]: val };
    setEdgeLengths(next);
    onEdgeLengthsChange?.(next);
  };

  // ── Compute polygon area from edge lengths ────────────────────────────────
  // Uses the pixel-polygon aspect ratio to distribute lengths properly
  const computedArea = (() => {
    const filledLengths = polygon.map((_, i) => parseFloat(edgeLengths[i]));
    if (filledLengths.some(isNaN) || filledLengths.length < 3) return null;
    // Shoelace on the pixel polygon to get pixel-area, then scale
    // Scale factor: total perimeter in meters / total perimeter in % units
    const pixPoly = polygon;
    let pixPerim = 0;
    let mPerim = 0;
    for (let i = 0; i < pixPoly.length; i++) {
      const j = (i + 1) % pixPoly.length;
      const dpx = Math.hypot(pixPoly[j].x - pixPoly[i].x, pixPoly[j].y - pixPoly[i].y);
      pixPerim += dpx;
      mPerim += filledLengths[i];
    }
    if (pixPerim === 0) return null;
    const mPerPct = mPerim / pixPerim; // meters per % unit
    // Shoelace area in % units
    let area = 0;
    for (let i = 0; i < pixPoly.length; i++) {
      const j = (i + 1) % pixPoly.length;
      area += pixPoly[i].x * pixPoly[j].y - pixPoly[j].x * pixPoly[i].y;
    }
    area = Math.abs(area) / 2;
    return area * mPerPct * mPerPct; // convert % units² → m²
  })();

  // ── Fill polygon with panels ──────────────────────────────────────────────
  const fillWithPanels = useCallback(() => {
    if (!polyDone || polygon.length < 3 || !selectedProduct) return;

    // Determine scale: meters per % unit
    const filledLengths = polygon.map((_, i) => parseFloat(edgeLengths[i]));
    let mPerPct = null;
    if (!filledLengths.some(isNaN) && filledLengths.length >= 3) {
      let pixPerim = 0, mPerim = 0;
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        pixPerim += Math.hypot(polygon[j].x - polygon[i].x, polygon[j].y - polygon[i].y);
        mPerim += filledLengths[i];
      }
      if (pixPerim > 0) mPerPct = mPerim / pixPerim;
    }
    // Fallback: use roofWidthM
    if (!mPerPct) mPerPct = 10 / 100;

    const panelWPct = (selectedProduct.width_mm / 1000) / mPerPct;
    const panelHPct = (selectedProduct.height_mm / 1000) / mPerPct;

    // Bounding box of polygon
    const xs = polygon.map(p => p.x);
    const ys = polygon.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);

    const MARGIN = 0.5; // % margin
    const newPanels = [];
    let y = minY + panelHPct / 2 + MARGIN;
    while (y + panelHPct / 2 <= maxY - MARGIN) {
      let x = minX + panelWPct / 2 + MARGIN;
      while (x + panelWPct / 2 <= maxX - MARGIN) {
        // Check all four corners + center are inside polygon
        const testPts = [
          { x, y },
          { x: x - panelWPct / 2 + 0.2, y: y - panelHPct / 2 + 0.2 },
          { x: x + panelWPct / 2 - 0.2, y: y - panelHPct / 2 + 0.2 },
          { x: x - panelWPct / 2 + 0.2, y: y + panelHPct / 2 - 0.2 },
          { x: x + panelWPct / 2 - 0.2, y: y + panelHPct / 2 - 0.2 },
        ];
        if (testPts.every(pt => pointInPolygon(pt.x, pt.y, polygon))) {
          newPanels.push({
            id: `${Date.now()}-${newPanels.length}`,
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            power_watts: selectedProduct.power_watts,
            width_mm: selectedProduct.width_mm,
            height_mm: selectedProduct.height_mm,
            w_pct: panelWPct,
            h_pct: panelHPct,
            x, y,
          });
        }
        x += panelWPct;
      }
      y += panelHPct;
    }
    onPanelsChange(newPanels);
  }, [polyDone, polygon, edgeLengths, selectedProduct, onPanelsChange]);

  // ── Fit view ──────────────────────────────────────────────────────────────
  const fitView = () => {
    if (!containerRef.current || imgNatural.w <= 1) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.92;
    setZoom(fit); zoomRef.current = fit;
    setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
  };

  // ── Polygon SVG overlay ───────────────────────────────────────────────────
  const polyPoints = polygon.map(p => `${p.x},${p.y}`).join(' ');
  const imgW = imgNatural.w * zoom;
  const imgH = imgNatural.h * zoom;

  // ── Panel size ────────────────────────────────────────────────────────────
  const getPanelSizePct = (panel) => ({
    wPct: panel.w_pct || 8,
    hPct: panel.h_pct || 13,
  });

  const hasEdgeLengths = polygon.length >= 3 && !polygon.map((_, i) => parseFloat(edgeLengths[i])).some(isNaN);

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" style={{ userSelect: 'none' }}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700 flex-wrap gap-y-2">
        <span className="text-white font-semibold text-sm">Takplanerare</span>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg overflow-hidden ml-2">
          <button className="px-2 py-1.5 text-white hover:bg-gray-700"
            onClick={() => { const n = Math.max(0.1, zoom - 0.15); setZoom(n); zoomRef.current = n; }}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-white text-xs px-1 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1.5 text-white hover:bg-gray-700"
            onClick={() => { const n = Math.min(10, zoom + 0.15); setZoom(n); zoomRef.current = n; }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="text-gray-400 hover:text-white p-1.5 rounded" onClick={fitView} title="Anpassa vy">
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Reset polygon */}
        {polygon.length > 0 && (
          <button className="text-xs text-red-400 hover:text-red-300 bg-gray-800 px-2 py-1 rounded-lg flex items-center gap-1"
            onClick={() => { setPolygon([]); polygonRef.current = []; setPolyDone(false); polyDoneRef.current = false; setIsDrawingMode(false); isDrawingModeRef.current = false; setEdgeLengths({}); onPanelsChange([]); onPolygonChange?.([]); onEdgeLengthsChange?.({}); }}>
            <Trash2 className="w-3.5 h-3.5" /> Rensa takyta
          </button>
        )}

        {/* Fill panels */}
        {polyDone && selectedProduct && (
          <button
            onClick={fillWithPanels}
            className="text-xs bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium">
            <ZoomIn className="w-3.5 h-3.5" />
            Fyll med paneler
            {hasEdgeLengths && computedArea ? ` (${computedArea.toFixed(1)} m²)` : ''}
          </button>
        )}

        {/* Close */}
        <div className="ml-auto">
          <button className="text-white bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1" onClick={onClose}>
            <X className="w-4 h-4" /> Stäng
          </button>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-300 flex items-center gap-3">
        {!isDrawingMode && !polyDone && polygon.length === 0 && (
          <span>🖱️ <strong>Håll 2 sek</strong> på taket för att starta ritning av takyta</span>
        )}
        {isDrawingMode && (
          <>
            <span className="text-green-400 font-medium animate-pulse">● Ritar takyta</span>
            <span>Klicka för att lägga till hörn •{polygon.length >= 3 ? ' Klicka på första punkten för att avsluta' : ` ${3 - polygon.length} hörn till`}</span>
          </>
        )}
        {polyDone && (
          <>
            <span className="text-blue-400 font-medium">✓ Takyta klar ({polygon.length} hörn)</span>
            {!selectedProduct && <span className="text-yellow-400">— Välj en solpanel för att fylla ytan</span>}
          </>
        )}
        {/* Long-press progress */}
        {longPressProgress > 0 && longPressProgress < 100 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-yellow-400">Håll kvar...</span>
            <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all" style={{ width: `${longPressProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Edge-length inputs (shown when polygon is done) ── */}
      {polyDone && (
        <EdgeInputs polygon={polygon} edgeLengths={edgeLengths} onEdgeLengthChange={handleEdgeLengthChange} />
      )}

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isDrawingMode ? 'crosshair' : 'grab' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: imgW, height: imgH,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
        }}>
          {/* Image */}
          <img ref={imgRef} src={imageUrl} alt="Tak" draggable={false}
            onLoad={handleImgLoad}
            style={{ width: imgW, height: imgH, display: 'block', pointerEvents: 'none' }} />

          {/* Polygon overlay (SVG in % coordinates) */}
          <svg style={{
            position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none'
          }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Filled polygon */}
            {polyDone && polygon.length >= 3 && (
              <polygon points={polyPoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="0.3" />
            )}
            {/* Lines (in progress) */}
            {!polyDone && polygon.length >= 2 && polygon.map((pt, i) => {
              if (i === 0) return null;
              const prev = polygon[i - 1];
              return <line key={i} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke="#facc15" strokeWidth="0.4" />;
            })}
            {/* Edge length labels */}
            {polyDone && polygon.map((pt, i) => {
              const next = polygon[(i + 1) % polygon.length];
              const mx = (pt.x + next.x) / 2;
              const my = (pt.y + next.y) / 2;
              const len = edgeLengths[i];
              if (!len) return null;
              return (
                <text key={i} x={mx} y={my} fill="white" fontSize="2.5"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}>
                  {len}m
                </text>
              );
            })}
            {/* Points */}
            {polygon.map((pt, i) => (
              <g key={i}>
                {i === 0 && polyDone ? (
                  <circle cx={pt.x} cy={pt.y} r="1.5" fill="#22c55e" stroke="white" strokeWidth="0.3" />
                ) : i === 0 ? (
                  <circle cx={pt.x} cy={pt.y} r="2" fill="none" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="0.5 0.5">
                    {/* Pulsing target for first point */}
                  </circle>
                ) : null}
                <circle cx={pt.x} cy={pt.y} r="1" fill={i === 0 ? '#22c55e' : '#facc15'} stroke="white" strokeWidth="0.2" />
                <text x={pt.x + 1.5} y={pt.y - 1} fill="white" fontSize="2" style={{ filter: 'drop-shadow(0 0 2px black)' }}>{i + 1}</text>
              </g>
            ))}
          </svg>

          {/* Panels */}
          {panels.map(panel => {
            const { wPct, hPct } = getPanelSizePct(panel);
            const isDrag = draggingId.current === panel.id;
            return (
              <div key={panel.id} style={{
                position: 'absolute',
                left: `${panel.x}%`, top: `${panel.y}%`,
                width: `${wPct}%`, height: `${hPct}%`,
                transform: 'translate(-50%, -50%)',
                cursor: isDrag ? 'grabbing' : 'grab',
                zIndex: 10,
              }}
                onMouseDown={e => handlePanelMouseDown(e, panel)}
                onClick={e => e.stopPropagation()}
              >
                <SolarPanelSVG isSelected={isDrag} />
                <button style={{
                  position: 'absolute', top: 1, right: 1,
                  background: 'rgba(0,0,0,0.8)', border: 'none',
                  borderRadius: 2, cursor: 'pointer', padding: '1px 2px',
                  display: 'flex', zIndex: 20,
                }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onPanelsChange(prev => prev.filter(p => p.id !== panel.id)); }}
                >
                  <Trash2 style={{ width: 9, height: 9, color: '#ef4444' }} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="absolute bottom-3 right-3 text-xs text-gray-500 bg-gray-900/80 rounded px-2 py-1 pointer-events-none">
          Scrolla = zoom • Nyp = zoom (mobil)
        </div>
      </div>
    </div>
  );
}