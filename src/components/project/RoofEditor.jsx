import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Minus, Plus, RotateCcw, Trash2, Pencil, Hand, Sun } from 'lucide-react';

// Solar panel rendered with % width/height so it scales with the image
function SolarPanelSVG({ isSelected }) {
  return (
    <svg width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="panelGrad" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.22} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect x="0" y="0" width="100%" height="100%" fill="#1a2540" rx="2" />
      {/* Inner cells — 6 cols × auto rows via SVG pattern */}
      <pattern id="cells" x="0" y="0" width="16.666%" height="25%" patternUnits="objectBoundingBox">
        <rect x="5%" y="5%" width="90%" height="90%" fill="#1e3560" stroke="#2a4070" strokeWidth="0.5" rx="1" />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#cells)" />
      {/* Gloss */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#panelGrad)" rx="2" />
      {/* Border */}
      <rect x="0.5" y="0.5" width="99%" height="99%" fill="none"
        stroke={isSelected ? '#60a5fa' : '#3a5090'}
        strokeWidth={isSelected ? 2 : 1} rx="2" />
    </svg>
  );
}

const TOOLS = { pan: 'pan', obstacle: 'obstacle' };
const OBSTACLE_COLORS = ['#ef4444', '#f97316', '#eab308', '#8b5cf6'];

export default function RoofEditor({
  imageUrl, panels, onPanelsChange,
  obstacles, onObstaclesChange,
  selectedProduct, roofWidthM, roofHeightM, onClose
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState(TOOLS.pan);
  const [obstacleColor, setObstacleColor] = useState(OBSTACLE_COLORS[0]);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  // Refs for mouse interactions (avoid stale closures)
  const isPanning = useRef(false);
  const panStartClient = useRef({ x: 0, y: 0 });
  const panOriginState = useRef({ x: 0, y: 0 });

  const isDrawing = useRef(false);
  const drawStartPct = useRef(null);
  const [drawPreview, setDrawPreview] = useState(null);

  const draggingId = useRef(null);
  const dragOffsetPct = useRef({ x: 0, y: 0 });

  // Store latest pan/zoom/imgNatural in refs so mouse handlers always see current values
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const imgNaturalRef = useRef({ w: 0, h: 0 });

  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { imgNaturalRef.current = imgNatural; }, [imgNatural]);

  const handleImgLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth;
      const h = imgRef.current.naturalHeight;
      setImgNatural({ w, h });
      imgNaturalRef.current = { w, h };
    }
  };

  // Fit image when natural size is known
  useEffect(() => {
    if (!containerRef.current || imgNatural.w === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.95;
    setZoom(fit);
    zoomRef.current = fit;
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, [imgNatural]);

  // Scroll zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.12 : 0.9;
      const next = Math.max(0.1, Math.min(10, zoomRef.current * delta));
      setZoom(next);
      zoomRef.current = next;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Helper: client coords → % of image
  const clientToImgPct = useCallback((clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const p = panRef.current;
    const z = zoomRef.current;
    const nat = imgNaturalRef.current;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const imgLeft = centerX + p.x - (nat.w * z) / 2;
    const imgTop  = centerY + p.y - (nat.h * z) / 2;
    return {
      x: ((clientX - imgLeft) / (nat.w * z)) * 100,
      y: ((clientY - imgTop)  / (nat.h * z)) * 100,
    };
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;

    if (tool === TOOLS.pan) {
      // Check if we clicked on a panel div (handled separately)
      isPanning.current = true;
      panStartClient.current = { x: e.clientX, y: e.clientY };
      panOriginState.current = { ...panRef.current };
      return;
    }

    if (tool === TOOLS.obstacle) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      isDrawing.current = true;
      drawStartPct.current = pos;
      setDrawPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }, [tool, clientToImgPct]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current) {
      const next = {
        x: panOriginState.current.x + (e.clientX - panStartClient.current.x),
        y: panOriginState.current.y + (e.clientY - panStartClient.current.y),
      };
      setPan(next);
      panRef.current = next;
      return;
    }

    if (isDrawing.current && drawStartPct.current) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      setDrawPreview({
        x: Math.min(drawStartPct.current.x, pos.x),
        y: Math.min(drawStartPct.current.y, pos.y),
        w: Math.abs(pos.x - drawStartPct.current.x),
        h: Math.abs(pos.y - drawStartPct.current.y),
      });
      return;
    }

    if (draggingId.current) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      const newX = pos.x - dragOffsetPct.current.x;
      const newY = pos.y - dragOffsetPct.current.y;
      onPanelsChange(prev => prev.map(p =>
        p.id === draggingId.current ? { ...p, x: newX, y: newY } : p
      ));
    }
  }, [clientToImgPct, onPanelsChange]);

  const handleMouseUp = useCallback((e) => {
    isPanning.current = false;

    if (draggingId.current) {
      draggingId.current = null;
      return;
    }

    if (isDrawing.current) {
      isDrawing.current = false;
      setDrawPreview(prev => {
        if (prev && prev.w > 0.5 && prev.h > 0.5) {
          onObstaclesChange(obs => [...obs, {
            id: Date.now().toString(),
            x: prev.x, y: prev.y, w: prev.w, h: prev.h,
            color: obstacleColor,
            label: 'Hinder',
          }]);
        }
        return null;
      });
      drawStartPct.current = null;
    }
  }, [obstacleColor, onObstaclesChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Panel drag start — compute offset in % space
  const handlePanelMouseDown = (e, panel) => {
    if (tool !== TOOLS.pan) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = clientToImgPct(e.clientX, e.clientY);
    dragOffsetPct.current = {
      x: pos.x - panel.x,
      y: pos.y - panel.y,
    };
    draggingId.current = panel.id;
  };

  // Touch pinch
  const lastTouchDist = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      lastTouchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && lastTouchDist.current) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const next = Math.max(0.1, Math.min(10, zoomRef.current * (dist / lastTouchDist.current)));
      setZoom(next);
      zoomRef.current = next;
      lastTouchDist.current = dist;
    }
  };

  // Panel size as % of image dimensions
  // panel.width_mm / 1000 = panel width in meters
  // roofWidthM = roof width in meters = 100% of image width
  // So panel width % = (panel.width_mm / 1000) / roofWidthM * 100
  const getPanelSizePct = (panel) => {
    const rw = roofWidthM || 10;
    const rh = roofHeightM || (rw * (imgNatural.h / imgNatural.w || 0.8));
    const wPct = panel.width_mm  ? (panel.width_mm  / 1000 / rw) * 100 : (1.1 / rw) * 100;
    const hPct = panel.height_mm ? (panel.height_mm / 1000 / rh) * 100 : (1.76 / rh) * 100;
    return { wPct, hPct };
  };

  const imgW = imgNatural.w * zoom;
  const imgH = imgNatural.h * zoom;

  const cursor = tool === TOOLS.obstacle ? 'crosshair' : (isPanning.current ? 'grabbing' : 'grab');

  const fitView = () => {
    if (!containerRef.current || imgNatural.w === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.95;
    setZoom(fit); zoomRef.current = fit;
    setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
        <span className="text-white font-semibold text-sm mr-2">Redigerare</span>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <ToolBtn active={tool === TOOLS.pan} onClick={() => setTool(TOOLS.pan)} title="Panorera / flytta paneler">
            <Hand className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn active={tool === TOOLS.obstacle} onClick={() => setTool(TOOLS.obstacle)} title="Rita hinder – håll och dra">
            <Pencil className="w-4 h-4" />
          </ToolBtn>
        </div>

        {tool === TOOLS.obstacle && (
          <div className="flex gap-1 items-center">
            <span className="text-gray-400 text-xs">Färg:</span>
            {OBSTACLE_COLORS.map(c => (
              <button key={c} onClick={() => setObstacleColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{ background: c, borderColor: obstacleColor === c ? 'white' : 'transparent' }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg overflow-hidden">
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => { const n = Math.max(0.1, zoom - 0.15); setZoom(n); zoomRef.current = n; }}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-white text-xs px-2 min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => { const n = Math.min(10, zoom + 0.15); setZoom(n); zoomRef.current = n; }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="text-gray-400 hover:text-white p-1.5 rounded" onClick={fitView} title="Återställ vy">
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:block">
            {tool === TOOLS.pan && 'Dra bilden för att panorera  •  Dra panel för att flytta'}
            {tool === TOOLS.obstacle && 'Håll nere och dra för att rita hinder'}
          </span>
          <button className="text-white bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1" onClick={onClose}>
            <X className="w-4 h-4" /> Stäng
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Centred image container */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: imgW,
          height: imgH,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
        }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Tak"
            draggable={false}
            onLoad={handleImgLoad}
            style={{ width: imgW, height: imgH, display: 'block', pointerEvents: 'none' }}
          />

          {/* ── PANELS ──
              Position and size both use % of the container (= % of image).
              width % = panel_width_m / roof_width_m * 100
              height % = panel_height_m / roof_height_m * 100
              This means they automatically scale with the image at any zoom.
          */}
          {panels.map(panel => {
            const { wPct, hPct } = getPanelSizePct(panel);
            const isDragging = draggingId.current === panel.id;
            return (
              <div
                key={panel.id}
                style={{
                  position: 'absolute',
                  left: `${panel.x}%`,
                  top: `${panel.y}%`,
                  width: `${wPct}%`,
                  height: `${hPct}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: 10,
                  boxSizing: 'border-box',
                }}
                onMouseDown={e => handlePanelMouseDown(e, panel)}
                onClick={e => e.stopPropagation()}
              >
                <SolarPanelSVG isSelected={isDragging} />
                {/* Delete button */}
                <button
                  style={{
                    position: 'absolute', top: 1, right: 1,
                    background: 'rgba(0,0,0,0.8)', border: 'none',
                    borderRadius: 2, cursor: 'pointer', padding: '1px 2px',
                    lineHeight: 1, zIndex: 20, display: 'flex',
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onPanelsChange(prev => prev.filter(p => p.id !== panel.id)); }}
                >
                  <Trash2 style={{ width: 9, height: 9, color: '#ef4444' }} />
                </button>
              </div>
            );
          })}

          {/* ── OBSTACLES ── */}
          {(obstacles || []).map(obs => (
            <div key={obs.id} style={{
              position: 'absolute',
              left: `${obs.x}%`, top: `${obs.y}%`,
              width: `${obs.w}%`, height: `${obs.h}%`,
              border: `2px solid ${obs.color}`,
              background: `${obs.color}33`,
              zIndex: 15,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              cursor: 'default',
            }}>
              <span style={{ fontSize: 9, color: obs.color, background: 'rgba(0,0,0,0.75)', padding: '1px 3px', borderRadius: 2 }}>
                {obs.label}
              </span>
              <button
                style={{ background: 'rgba(0,0,0,0.75)', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: 2, display: 'flex' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onObstaclesChange(prev => prev.filter(o => o.id !== obs.id)); }}
              >
                <Trash2 style={{ width: 9, height: 9, color: '#ef4444' }} />
              </button>
            </div>
          ))}

          {/* Draw preview */}
          {drawPreview && drawPreview.w > 0 && (
            <div style={{
              position: 'absolute',
              left: `${drawPreview.x}%`, top: `${drawPreview.y}%`,
              width: `${drawPreview.w}%`, height: `${drawPreview.h}%`,
              border: `2px dashed ${obstacleColor}`,
              background: `${obstacleColor}22`,
              pointerEvents: 'none', zIndex: 20,
            }} />
          )}
        </div>

        <div className="absolute bottom-4 right-4 text-xs text-gray-500 bg-gray-900/80 rounded px-2 py-1 pointer-events-none">
          Scrolla för att zooma • Nyp med två fingrar
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children, title, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700 disabled:opacity-30'}`}>
      {children}
    </button>
  );
}