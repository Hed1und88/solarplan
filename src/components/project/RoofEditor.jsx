import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, MousePointer, Minus, Plus, RotateCcw, Trash2, Pencil, Hand, Sun } from 'lucide-react';

// Solar panel SVG renderer
function SolarPanelSVG({ widthPx, heightPx, isSelected }) {
  const cols = 6;
  const rows = Math.max(2, Math.round((heightPx / widthPx) * cols));
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  const gap = Math.max(0.5, Math.min(1.5, widthPx / 80));
  const id = `sh-${Math.round(widthPx)}`;
  return (
    <svg width={widthPx} height={heightPx} style={{ display: 'block', opacity: 0.9 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.2} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="#1a2540" rx={1} />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect key={`${r}-${c}`}
            x={c * cellW + gap} y={r * cellH + gap}
            width={cellW - gap * 2} height={cellH - gap * 2}
            fill="#1e3560" stroke="#2a4070" strokeWidth={0.4} rx={0.5}
          />
        ))
      )}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill={`url(#${id})`} rx={1} />
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="none"
        stroke={isSelected ? '#60a5fa' : '#3a5070'}
        strokeWidth={isSelected ? 2.5 : 1} rx={1} />
    </svg>
  );
}

const TOOLS = {
  pan: 'pan',
  place: 'place',
  obstacle: 'obstacle',
};

const OBSTACLE_COLORS = ['#ef4444', '#f97316', '#eab308', '#8b5cf6'];

export default function RoofEditor({ imageUrl, panels, onPanelsChange, obstacles, onObstaclesChange, selectedProduct, roofWidthM, onClose }) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState(TOOLS.pan);
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [selectedObstacleId, setSelectedObstacleId] = useState(null);
  const [obstacleColor, setObstacleColor] = useState(OBSTACLE_COLORS[0]);

  // Drawing state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });

  // Obstacle drawing
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);

  // Panel dragging
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Image natural size
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 1200, h: 800 });

  // px per meter in image-space
  const pxPerMeter = roofWidthM > 0 ? imgSize.w / roofWidthM : imgSize.w / 10;
  const panelWidthPx = selectedProduct?.width_mm ? (selectedProduct.width_mm / 1000) * pxPerMeter : pxPerMeter * 1.1;
  const panelHeightPx = selectedProduct?.height_mm ? (selectedProduct.height_mm / 1000) * pxPerMeter : pxPerMeter * 1.7;

  // Convert screen coords → image-space coords (percentage)
  const screenToImagePct = useCallback((sx, sy) => {
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const imgX = ((sx - cx - pan.x) / zoom / imgSize.w) * 100;
    const imgY = ((sy - cy - pan.y) / zoom / imgSize.h) * 100;
    return { x: imgX, y: imgY };
  }, [zoom, pan, imgSize]);

  // Image-space px → screen coords (for hit testing panels)
  const imagePctToScreen = useCallback((xPct, yPct) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { sx: 0, sy: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const sx = cx + pan.x + (xPct / 100) * imgSize.w * zoom - (imgSize.w * zoom) / 2;
    const sy = cy + pan.y + (yPct / 100) * imgSize.h * zoom - (imgSize.h * zoom) / 2;
    return { sx, sy };
  }, [zoom, pan, imgSize]);

  const handleImgLoad = () => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  };

  // Fit image on open
  useEffect(() => {
    if (!containerRef.current || imgSize.w === 1) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / imgSize.w;
    const scaleY = rect.height / imgSize.h;
    const fit = Math.min(scaleX, scaleY) * 0.95;
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  }, [imgSize]);

  // Zoom with wheel
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.max(0.2, Math.min(8, z * delta)));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch pinch zoom
  const lastTouchDist = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && lastTouchDist.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / lastTouchDist.current;
      setZoom(z => Math.max(0.2, Math.min(8, z * ratio)));
      lastTouchDist.current = dist;
    }
  };

  // Mouse down on background
  const handleBgMouseDown = (e) => {
    if (e.button !== 0) return;

    if (tool === TOOLS.pan) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanOrigin({ ...pan });
      return;
    }

    if (tool === TOOLS.place && selectedProduct) {
      const pos = screenToImagePct(e.clientX, e.clientY);
      onPanelsChange(prev => [...prev, {
        id: Date.now().toString(),
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        power_watts: selectedProduct.power_watts,
        width_mm: selectedProduct.width_mm,
        height_mm: selectedProduct.height_mm,
        x: pos.x,
        y: pos.y,
      }]);
      return;
    }

    if (tool === TOOLS.obstacle) {
      const pos = screenToImagePct(e.clientX, e.clientY);
      setDrawing(true);
      setDrawStart(pos);
      setDrawCurrent(pos);
    }
  };

  const handleBgMouseMove = useCallback((e) => {
    if (isPanning) {
      setPan({
        x: panOrigin.x + (e.clientX - panStart.x),
        y: panOrigin.y + (e.clientY - panStart.y),
      });
      return;
    }
    if (drawing) {
      const pos = screenToImagePct(e.clientX, e.clientY);
      setDrawCurrent(pos);
    }
    if (draggingPanel) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const imgX = ((e.clientX - cx - pan.x - dragOffset.x) / zoom / imgSize.w) * 100;
      const imgY = ((e.clientY - cy - pan.y - dragOffset.y) / zoom / imgSize.h) * 100;
      onPanelsChange(panels.map(p =>
        p.id === draggingPanel ? { ...p, x: imgX, y: imgY } : p
      ));
    }
  }, [isPanning, panOrigin, panStart, drawing, screenToImagePct, draggingPanel, dragOffset, zoom, pan, imgSize, panels, onPanelsChange]);

  const handleBgMouseUp = useCallback((e) => {
    setIsPanning(false);
    setDraggingPanel(null);
    if (drawing && drawStart && drawCurrent) {
      const minX = Math.min(drawStart.x, drawCurrent.x);
      const minY = Math.min(drawStart.y, drawCurrent.y);
      const maxX = Math.max(drawStart.x, drawCurrent.x);
      const maxY = Math.max(drawStart.y, drawCurrent.y);
      if (Math.abs(maxX - minX) > 0.5 || Math.abs(maxY - minY) > 0.5) {
        onObstaclesChange(prev => [...prev, {
          id: Date.now().toString(),
          x: minX, y: minY,
          w: maxX - minX,
          h: maxY - minY,
          color: obstacleColor,
          label: 'Hinder',
        }]);
      }
      setDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
    }
  }, [drawing, drawStart, drawCurrent, obstacleColor, onObstaclesChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleBgMouseMove);
    window.addEventListener('mouseup', handleBgMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleBgMouseMove);
      window.removeEventListener('mouseup', handleBgMouseUp);
    };
  }, [handleBgMouseMove, handleBgMouseUp]);

  // Panel mouse down (drag)
  const handlePanelMouseDown = (e, panelId) => {
    e.preventDefault();
    e.stopPropagation();
    if (tool !== TOOLS.pan && tool !== TOOLS.place) return;

    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // offset in image-space pixels
    const imgX = (panel.x / 100) * imgSize.w;
    const imgY = (panel.y / 100) * imgSize.h;
    const screenX = cx + pan.x + imgX * zoom - (imgSize.w * zoom) / 2;
    const screenY = cy + pan.y + imgY * zoom - (imgSize.h * zoom) / 2;

    setDragOffset({
      x: e.clientX - screenX,
      y: e.clientY - screenY,
    });
    setDraggingPanel(panelId);
    setSelectedPanelId(panelId);
  };

  const imgW = imgSize.w * zoom;
  const imgH = imgSize.h * zoom;

  // Draw rectangle for obstacle preview in screen space
  const getObstacleScreenRect = (obs) => {
    const x1 = obs.x / 100 * imgSize.w;
    const y1 = obs.y / 100 * imgSize.h;
    const x2 = (obs.x + obs.w) / 100 * imgSize.w;
    const y2 = (obs.y + obs.h) / 100 * imgSize.h;
    return { x1, y1, x2, y2 };
  };

  const cursor = {
    [TOOLS.pan]: isPanning ? 'grabbing' : 'grab',
    [TOOLS.place]: 'crosshair',
    [TOOLS.obstacle]: 'crosshair',
  }[tool];

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
        <span className="text-white font-semibold text-sm mr-2">Redigerare</span>

        {/* Tools */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <ToolBtn active={tool === TOOLS.pan} onClick={() => setTool(TOOLS.pan)} title="Panorera / flytta paneler">
            <Hand className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn active={tool === TOOLS.place} onClick={() => setTool(TOOLS.place)} title="Placera panel (klicka)" disabled={!selectedProduct}>
            <Sun className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn active={tool === TOOLS.obstacle} onClick={() => setTool(TOOLS.obstacle)} title="Rita hinder (dra rektangel)">
            <Pencil className="w-4 h-4" />
          </ToolBtn>
        </div>

        {/* Obstacle colors */}
        {tool === TOOLS.obstacle && (
          <div className="flex gap-1">
            {OBSTACLE_COLORS.map(c => (
              <button key={c} onClick={() => setObstacleColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{ background: c, borderColor: obstacleColor === c ? 'white' : 'transparent' }}
              />
            ))}
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-1 ml-2 bg-gray-800 rounded-lg overflow-hidden">
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-white text-xs px-2 min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => setZoom(z => Math.min(8, z + 0.2))}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="text-gray-400 hover:text-white p-1.5 rounded" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Återställ vy">
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Delete selected */}
        {(selectedPanelId || selectedObstacleId) && (
          <button className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs px-2 py-1.5 bg-gray-800 rounded-lg ml-1"
            onClick={() => {
              if (selectedPanelId) { onPanelsChange(p => p.filter(x => x.id !== selectedPanelId)); setSelectedPanelId(null); }
              if (selectedObstacleId) { onObstaclesChange(o => o.filter(x => x.id !== selectedObstacleId)); setSelectedObstacleId(null); }
            }}>
            <Trash2 className="w-3.5 h-3.5" /> Ta bort
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:block">
            {tool === TOOLS.pan && 'Dra för att panorera • Dra paneler för att flytta'}
            {tool === TOOLS.place && 'Klicka för att placera panel'}
            {tool === TOOLS.obstacle && 'Dra för att markera hinder'}
          </span>
          <button className="text-white bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1" onClick={onClose}>
            <X className="w-4 h-4" /> Stäng
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor }}
        onMouseDown={handleBgMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Image + overlays positioned relative to center */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: imgW,
            height: imgH,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Tak"
            draggable={false}
            onLoad={handleImgLoad}
            style={{ width: imgW, height: imgH, display: 'block', pointerEvents: 'none' }}
          />

          {/* Obstacles */}
          {obstacles.map(obs => {
            const isSelected = selectedObstacleId === obs.id;
            return (
              <div
                key={obs.id}
                style={{
                  position: 'absolute',
                  left: `${obs.x}%`,
                  top: `${obs.y}%`,
                  width: `${obs.w}%`,
                  height: `${obs.h}%`,
                  border: `2px solid ${obs.color}`,
                  background: `${obs.color}33`,
                  boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${obs.color}` : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                }}
                onClick={(e) => { e.stopPropagation(); setSelectedObstacleId(obs.id); setSelectedPanelId(null); }}
              >
                <span style={{ fontSize: 10, color: obs.color, background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 2 }}>
                  {obs.label}
                </span>
              </div>
            );
          })}

          {/* Draw-in-progress obstacle */}
          {drawing && drawStart && drawCurrent && (
            <div style={{
              position: 'absolute',
              left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
              top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
              width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
              height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
              border: `2px dashed ${obstacleColor}`,
              background: `${obstacleColor}22`,
              pointerEvents: 'none',
            }} />
          )}

          {/* Panels */}
          {panels.map(panel => {
            const pw = panel.width_mm ? (panel.width_mm / 1000) * pxPerMeter * zoom : panelWidthPx * zoom;
            const ph = panel.height_mm ? (panel.height_mm / 1000) * pxPerMeter * zoom : panelHeightPx * zoom;
            const isSelected = selectedPanelId === panel.id;
            return (
              <div
                key={panel.id}
                style={{
                  position: 'absolute',
                  left: `${panel.x}%`,
                  top: `${panel.y}%`,
                  width: pw,
                  height: ph,
                  transform: 'translate(-50%, -50%)',
                  cursor: draggingPanel === panel.id ? 'grabbing' : 'grab',
                  zIndex: isSelected ? 20 : 10,
                }}
                onMouseDown={e => handlePanelMouseDown(e, panel.id)}
                onClick={e => { e.stopPropagation(); setSelectedPanelId(panel.id); setSelectedObstacleId(null); }}
              >
                <SolarPanelSVG widthPx={pw} heightPx={ph} isSelected={isSelected} />
              </div>
            );
          })}
        </div>

        {/* Zoom hint */}
        <div className="absolute bottom-4 right-4 text-xs text-gray-500 bg-gray-900/80 rounded px-2 py-1 pointer-events-none">
          Scrolla för att zooma • Nyp med två fingrar
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children, title, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700 disabled:opacity-30'}`}
    >
      {children}
    </button>
  );
}