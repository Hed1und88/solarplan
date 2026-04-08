import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Minus, Plus, RotateCcw, Trash2, ZoomIn, RotateCw } from 'lucide-react';

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

// ── Long-press hook for corners ──────────────────────────────────────────────
// Returns handlers + isHeld state
function useCornerLongPress(onActivate, delay = 600) {
  const timer = useRef(null);
  const [holding, setHolding] = useState(false);

  const start = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setHolding(true);
    timer.current = setTimeout(() => {
      onActivate();
      setHolding(false);
    }, delay);
  }, [onActivate, delay]);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    setHolding(false);
  }, []);

  return { onMouseDown: start, onMouseUp: cancel, onMouseLeave: cancel, holding };
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RoofEditor({
  imageUrl, panels, onPanelsChange,
  obstacles, onObstaclesChange,
  selectedProduct, onClose,
  polygon: polygonProp = [], onPolygonChange,
  edgeLengths: edgeLengthsProp = {}, onEdgeLengthsChange,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });

  // Polygon
  const [polygon, setPolygon] = useState(polygonProp);
  const [polyDone, setPolyDone] = useState(polygonProp.length >= 3);
  const [edgeLengths, setEdgeLengths] = useState(edgeLengthsProp);

  // Panel rotation (0 = portrait, 90 = landscape)
  const [panelRotation, setPanelRotation] = useState(0);

  // Long-press for canvas (start drawing)
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const progressTimer = useRef(null);

  // Panning
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Panel drag
  const draggingId = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Corner drag — activated via long press on corner
  const [draggingCornerIdx, setDraggingCornerIdx] = useState(null);
  const draggingCornerRef = useRef(null);

  // Corner long-press progress per index
  const [cornerHoldIdx, setCornerHoldIdx] = useState(null);
  const [cornerHoldPct, setCornerHoldPct] = useState(0);
  const cornerHoldTimer = useRef(null);
  const cornerHoldProgress = useRef(null);

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
  useEffect(() => { draggingCornerRef.current = draggingCornerIdx; }, [draggingCornerIdx]);

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

  // ── Canvas long-press (start drawing) ────────────────────────────────────
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

  // ── Corner long-press ─────────────────────────────────────────────────────
  const startCornerHold = useCallback((idx, e) => {
    e.stopPropagation();
    e.preventDefault();
    isPanning.current = false; // lock canvas pan while holding a corner
    setCornerHoldIdx(idx);
    setCornerHoldPct(0);
    const startTime = Date.now();
    const HOLD_MS = 600;
    cornerHoldProgress.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startTime) / HOLD_MS) * 100);
      setCornerHoldPct(pct);
    }, 20);
    cornerHoldTimer.current = setTimeout(() => {
      clearInterval(cornerHoldProgress.current);
      setCornerHoldIdx(null);
      setCornerHoldPct(0);
      setDraggingCornerIdx(idx);
      draggingCornerRef.current = idx;
    }, HOLD_MS);
  }, []);

  const cancelCornerHold = useCallback(() => {
    clearTimeout(cornerHoldTimer.current);
    clearInterval(cornerHoldProgress.current);
    setCornerHoldIdx(null);
    setCornerHoldPct(0);
  }, []);

  // ── Add polygon point on click ────────────────────────────────────────────
  const handleCanvasClick = useCallback((cx, cy) => {
    if (!isDrawingModeRef.current || polyDoneRef.current) return;
    const poly = polygonRef.current;
    if (poly.length === 0) return;
    const pos = clientToImgPct(cx, cy);

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
    if (draggingCornerRef.current !== null) return;
    if (!isDrawingModeRef.current) {
      if (!polyDoneRef.current) startLongPress(e.clientX, e.clientY);
      // Only allow panning when not dragging a corner or panel
      if (draggingCornerRef.current === null && !draggingId.current) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        panOrigin.current = { ...panRef.current };
      }
    }
  }, [startLongPress]);

  const handleMouseMove = useCallback((e) => {
    if (draggingCornerRef.current !== null) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      const idx = draggingCornerRef.current;
      setPolygon(prev => {
        const next = prev.map((pt, i) => i === idx ? pos : pt);
        polygonRef.current = next;
        onPolygonChange?.(next);
        return next;
      });
      return;
    }
    if (isPanning.current && !isDrawingModeRef.current && draggingCornerRef.current === null && !draggingId.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
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
  }, [cancelLongPress, clientToImgPct, onPanelsChange, onPolygonChange]);

  const handleMouseUp = useCallback((e) => {
    cancelLongPress();
    cancelCornerHold();
    const wasPanning = isPanning.current;
    isPanning.current = false;
    draggingId.current = null;

    if (draggingCornerRef.current !== null) {
      setDraggingCornerIdx(null);
      draggingCornerRef.current = null;
      return;
    }

    if (isDrawingModeRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.hypot(dx, dy) < 8) handleCanvasClick(e.clientX, e.clientY);
    }
  }, [cancelLongPress, cancelCornerHold, handleCanvasClick]);

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
      if (Math.hypot(dx, dy) > 8) { cancelLongPress(); cancelCornerHold(); }
      if (draggingCornerRef.current !== null) {
        const pos = clientToImgPct(t.clientX, t.clientY);
        const idx = draggingCornerRef.current;
        setPolygon(prev => {
          const next = prev.map((pt, i) => i === idx ? pos : pt);
          polygonRef.current = next;
          onPolygonChange?.(next);
          return next;
        });
        lastTouch.current = { x: t.clientX, y: t.clientY };
        return;
      }
      if (!isDrawingModeRef.current && draggingCornerRef.current === null && !draggingId.current) {
        const next = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        setPan(next); panRef.current = next;
        lastTouch.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, [cancelLongPress, cancelCornerHold, clientToImgPct, onPolygonChange]);

  const handleTouchEnd = useCallback((e) => {
    cancelLongPress();
    cancelCornerHold();
    if (draggingCornerRef.current !== null) {
      setDraggingCornerIdx(null);
      draggingCornerRef.current = null;
    }
    if (e.changedTouches.length === 1 && isDrawingModeRef.current) {
      const t = e.changedTouches[0];
      const start = lastTouch.current || { x: t.clientX, y: t.clientY };
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) < 8) {
        handleCanvasClick(t.clientX, t.clientY);
      }
    }
    lastTouchDist.current = null;
  }, [cancelLongPress, cancelCornerHold, handleCanvasClick]);

  // ── Panel drag ────────────────────────────────────────────────────────────
  const handlePanelMouseDown = (e, panel) => {
    if (isDrawingMode) return;
    e.preventDefault(); e.stopPropagation();
    isPanning.current = false; // prevent canvas pan while dragging panel
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

  // ── Computed area ─────────────────────────────────────────────────────────
  const computedArea = (() => {
    const filledLengths = polygon.map((_, i) => parseFloat(edgeLengths[i]));
    if (filledLengths.some(isNaN) || filledLengths.length < 3) return null;
    const nat = imgNatRef.current;
    const aspectX = nat.w / 100;
    const aspectY = nat.h / 100;
    // Work in pixel space for correct distance measurement
    const polyPx = polygon.map(p => ({ x: p.x * aspectX, y: p.y * aspectY }));
    let pixPerim = 0, mPerim = 0;
    for (let i = 0; i < polyPx.length; i++) {
      const j = (i + 1) % polyPx.length;
      pixPerim += Math.hypot(polyPx[j].x - polyPx[i].x, polyPx[j].y - polyPx[i].y);
      mPerim += filledLengths[i];
    }
    if (pixPerim === 0) return null;
    const mPerPx = mPerim / pixPerim;
    // Shoelace in pixel space, convert to m²
    let area = 0;
    for (let i = 0; i < polyPx.length; i++) {
      const j = (i + 1) % polyPx.length;
      area += polyPx[i].x * polyPx[j].y - polyPx[j].x * polyPx[i].y;
    }
    return Math.abs(area) / 2 * mPerPx * mPerPx;
  })();

  // ── Fill polygon with panels ──────────────────────────────────────────────
  const fillWithPanels = useCallback(() => {
    if (!polyDone || polygon.length < 3 || !selectedProduct) return;

    const nat = imgNatRef.current;
    const aspectX = nat.w / 100; // pixels per % in X
    const aspectY = nat.h / 100; // pixels per % in Y

    // Convert polygon from % coords to pixel coords for accurate distance measurement
    const polyPx = polygon.map(p => ({ x: p.x * aspectX, y: p.y * aspectY }));

    const filledLengths = polygon.map((_, i) => parseFloat(edgeLengths[i]));
    let mPerPx = null; // meters per pixel
    if (!filledLengths.some(isNaN) && filledLengths.length >= 3) {
      let pixPerim = 0, mPerim = 0;
      for (let i = 0; i < polyPx.length; i++) {
        const j = (i + 1) % polyPx.length;
        pixPerim += Math.hypot(polyPx[j].x - polyPx[i].x, polyPx[j].y - polyPx[i].y);
        mPerim += filledLengths[i];
      }
      if (pixPerim > 0) mPerPx = mPerim / pixPerim;
    }
    if (!mPerPx) {
      // Fallback: assume bbox width = 10m
      const xs = polyPx.map(p => p.x);
      const bboxWpx = Math.max(...xs) - Math.min(...xs);
      mPerPx = bboxWpx > 0 ? 10 / bboxWpx : 0.01;
    }

    // Apply rotation: swap w/h if 90°
    const isRotated = panelRotation === 90;
    const physW_m = (isRotated ? selectedProduct.height_mm : selectedProduct.width_mm) / 1000;
    const physH_m = (isRotated ? selectedProduct.width_mm : selectedProduct.height_mm) / 1000;

    // Panel size in pixels
    const panelWpx = physW_m / mPerPx;
    const panelHpx = physH_m / mPerPx;

    // Convert back to % coords for rendering
    const panelWPct = panelWpx / aspectX;
    const panelHPct = panelHpx / aspectY;

    const xs = polygon.map(p => p.x);
    const ys = polygon.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);

    if (panelWPct <= 0 || panelHPct <= 0 || panelWPct > (maxX - minX) * 2 || panelHPct > (maxY - minY) * 2) return;

    const SAMPLES = [-0.8, 0, 0.8];
    const panelFits = (cx, cy) => {
      const hw = panelWPct / 2;
      const hh = panelHPct / 2;
      for (const dy of SAMPLES)
        for (const dx of SAMPLES)
          if (!pointInPolygon(cx + dx * hw, cy + dy * hh, polygon)) return false;
      return true;
    };

    const newPanels = [];
    let y = minY + panelHPct / 2;
    while (y <= maxY - panelHPct / 2 + 0.001) {
      let x = minX + panelWPct / 2;
      while (x <= maxX - panelWPct / 2 + 0.001) {
        if (panelFits(x, y)) {
          newPanels.push({
            id: `panel-${Date.now()}-${newPanels.length}`,
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            power_watts: selectedProduct.power_watts,
            width_mm: selectedProduct.width_mm,
            height_mm: selectedProduct.height_mm,
            w_pct: panelWPct,
            h_pct: panelHPct,
            rotation: panelRotation,
            x, y,
          });
        }
        x += panelWPct;
      }
      y += panelHPct;
    }
    onPanelsChange(newPanels);
  }, [polyDone, polygon, edgeLengths, selectedProduct, panelRotation, onPanelsChange]);

  // ── Fit view ──────────────────────────────────────────────────────────────
  const fitView = () => {
    if (!containerRef.current || imgNatural.w <= 1) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.92;
    setZoom(fit); zoomRef.current = fit;
    setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
  };

  const polyPoints = polygon.map(p => `${p.x},${p.y}`).join(' ');
  const imgW = imgNatural.w * zoom;
  const imgH = imgNatural.h * zoom;
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
            onClick={() => {
              setPolygon([]); polygonRef.current = [];
              setPolyDone(false); polyDoneRef.current = false;
              setIsDrawingMode(false); isDrawingModeRef.current = false;
              setEdgeLengths({}); onPanelsChange([]);
              onPolygonChange?.([]); onEdgeLengthsChange?.({});
            }}>
            <Trash2 className="w-3.5 h-3.5" /> Rensa takyta
          </button>
        )}

        {/* Panel rotation toggle */}
        {selectedProduct && (
          <button
            onClick={() => setPanelRotation(r => r === 0 ? 90 : 0)}
            className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium border transition-all ${panelRotation === 90 ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
            title="Rotera panelriktning"
          >
            <RotateCw className="w-3.5 h-3.5" />
            {panelRotation === 0 ? 'Stående' : 'Liggande'}
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
            {draggingCornerIdx !== null
              ? <span className="text-orange-400">● Drar hörn {draggingCornerIdx + 1} — släpp för att placera</span>
              : cornerHoldIdx !== null
              ? <span className="text-yellow-400">● Håll kvar för att flytta hörn {cornerHoldIdx + 1}...</span>
              : !selectedProduct
              ? <span className="text-yellow-400">— Välj en solpanel för att fylla ytan</span>
              : <span className="text-gray-400">— Håll ett hörn för att flytta det</span>
            }
          </>
        )}
        {longPressProgress > 0 && longPressProgress < 100 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-yellow-400">Håll kvar...</span>
            <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all" style={{ width: `${longPressProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Edge-length inputs ── */}
      {polyDone && (
        <EdgeInputs polygon={polygon} edgeLengths={edgeLengths} onEdgeLengthChange={handleEdgeLengthChange} />
      )}

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isDrawingMode ? 'crosshair' : (draggingCornerIdx !== null ? 'grabbing' : 'grab') }}
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

          {/* Polygon SVG overlay */}
          <svg style={{
            position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible',
            pointerEvents: polyDone ? 'auto' : 'none',
          }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {polyDone && polygon.length >= 3 && (
              <polygon points={polyPoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="0.3" />
            )}
            {!polyDone && polygon.length >= 2 && polygon.map((pt, i) => {
              if (i === 0) return null;
              const prev = polygon[i - 1];
              return <line key={i} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke="#facc15" strokeWidth="0.4" />;
            })}
            {/* Edge labels */}
            {polyDone && polygon.map((pt, i) => {
              const next = polygon[(i + 1) % polygon.length];
              const mx = (pt.x + next.x) / 2;
              const my = (pt.y + next.y) / 2;
              const len = edgeLengths[i];
              if (!len) return null;
              return (
                <text key={i} x={mx} y={my} fill="white" fontSize="2.5"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))', pointerEvents: 'none' }}>
                  {len}m
                </text>
              );
            })}
            {/* Corner points with long-press hold indicator */}
            {polygon.map((pt, i) => {
              const isDragging = draggingCornerIdx === i;
              const isHolding = cornerHoldIdx === i;
              const radius = isDragging ? 2.5 : 1.8;
              const color = isDragging ? '#f97316' : isHolding ? '#facc15' : (i === 0 ? '#22c55e' : '#facc15');
              // Arc for hold progress
              const HOLD_R = 3.5;
              const pct = isHolding ? cornerHoldPct / 100 : 0;
              const angle = pct * 2 * Math.PI - Math.PI / 2;
              const arcX = pt.x + HOLD_R * Math.cos(angle);
              const arcY = pt.y + HOLD_R * Math.sin(angle);
              const largeArc = pct > 0.5 ? 1 : 0;

              return (
                <g key={i}
                  style={{ cursor: isDragging ? 'grabbing' : (polyDone ? 'pointer' : 'default') }}
                  onMouseDown={polyDone && !isDragging ? (e) => startCornerHold(i, e) : undefined}
                  onMouseUp={cancelCornerHold}
                  onMouseLeave={cancelCornerHold}
                  onTouchStart={polyDone && !isDragging ? (e) => {
                    e.stopPropagation();
                    startCornerHold(i, e);
                  } : undefined}
                  onTouchEnd={cancelCornerHold}
                >
                  {/* Hit area */}
                  <circle cx={pt.x} cy={pt.y} r="4" fill="transparent" />
                  {/* Hold progress arc */}
                  {isHolding && pct > 0 && pct < 1 && (
                    <path
                      d={`M ${pt.x} ${pt.y - HOLD_R} A ${HOLD_R} ${HOLD_R} 0 ${largeArc} 1 ${arcX} ${arcY}`}
                      fill="none" stroke="#facc15" strokeWidth="0.8" opacity="0.9"
                    />
                  )}
                  {/* Visible dot */}
                  <circle cx={pt.x} cy={pt.y} r={radius} fill={color} stroke="white" strokeWidth="0.4" />
                  <text x={pt.x + 2} y={pt.y - 1.5} fill="white" fontSize="2"
                    style={{ filter: 'drop-shadow(0 0 2px black)', pointerEvents: 'none' }}>{i + 1}</text>
                </g>
              );
            })}
          </svg>

          {/* Panels */}
          {panels.map(panel => {
            const wPct = panel.w_pct || 8;
            const hPct = panel.h_pct || 13;
            const rot = panel.rotation || 0;
            const isDrag = draggingId.current === panel.id;
            return (
              <div key={panel.id} style={{
                position: 'absolute',
                left: `${panel.x}%`, top: `${panel.y}%`,
                width: `${wPct}%`, height: `${hPct}%`,
                transform: `translate(-50%, -50%) rotate(${rot}deg)`,
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