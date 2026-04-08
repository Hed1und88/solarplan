import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Minus, Plus, RotateCcw, Trash2, Pencil, Hand, Sun } from 'lucide-react';

function SolarPanelSVG({ widthPx, heightPx, isSelected }) {
  const cols = 6;
  const rows = Math.max(2, Math.round((heightPx / widthPx) * cols));
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  const gap = Math.max(0.5, Math.min(1.5, widthPx / 80));
  const id = `sh-${Math.round(widthPx)}-${Math.round(heightPx)}`;
  return (
    <svg width={widthPx} height={heightPx} style={{ display: 'block' }}>
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

const TOOLS = { pan: 'pan', place: 'place', obstacle: 'obstacle' };
const OBSTACLE_COLORS = ['#ef4444', '#f97316', '#eab308', '#8b5cf6'];

export default function RoofEditor({
  imageUrl, panels, onPanelsChange,
  obstacles, onObstaclesChange,
  selectedProduct, roofWidthM, onClose
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState(TOOLS.pan);
  const [obstacleColor, setObstacleColor] = useState(OBSTACLE_COLORS[0]);
  const [imgNatural, setImgNatural] = useState({ w: 1200, h: 800 });

  // Panning
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Obstacle drawing
  const isDrawing = useRef(false);
  const [drawPreview, setDrawPreview] = useState(null); // { x,y,w,h }
  const drawStart = useRef(null);

  // Panel dragging
  const draggingId = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // px per meter — based on natural image width
  const pxPerMeter = roofWidthM > 0 ? imgNatural.w / roofWidthM : imgNatural.w / 10;
  const panelW_img = selectedProduct?.width_mm ? (selectedProduct.width_mm / 1000) * pxPerMeter : pxPerMeter * 1.1;
  const panelH_img = selectedProduct?.height_mm ? (selectedProduct.height_mm / 1000) * pxPerMeter : pxPerMeter * 1.7;

  const handleImgLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth;
      const h = imgRef.current.naturalHeight;
      setImgNatural({ w, h });
    }
  };

  // Fit on load
  useEffect(() => {
    if (!containerRef.current || imgNatural.w === 1200) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.95;
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  }, [imgNatural]);

  // Scroll zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.max(0.1, Math.min(10, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Convert client coords → image-space percentage
  const clientToImgPct = useCallback((cx, cy) => {
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // image top-left in screen space
    const imgLeft = centerX + pan.x - (imgNatural.w * zoom) / 2;
    const imgTop = centerY + pan.y - (imgNatural.h * zoom) / 2;
    const xPct = ((cx - imgLeft) / (imgNatural.w * zoom)) * 100;
    const yPct = ((cy - imgTop) / (imgNatural.h * zoom)) * 100;
    return { x: xPct, y: yPct };
  }, [pan, zoom, imgNatural]);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;

    if (tool === TOOLS.pan) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      return;
    }

    if (tool === TOOLS.place && selectedProduct) {
      const pos = clientToImgPct(e.clientX, e.clientY);
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
      const pos = clientToImgPct(e.clientX, e.clientY);
      isDrawing.current = true;
      drawStart.current = pos;
      setDrawPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }, [tool, pan, selectedProduct, clientToImgPct, onPanelsChange]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current) {
      setPan({
        x: panOrigin.current.x + (e.clientX - panStart.current.x),
        y: panOrigin.current.y + (e.clientY - panStart.current.y),
      });
      return;
    }

    if (isDrawing.current && drawStart.current) {
      const pos = clientToImgPct(e.clientX, e.clientY);
      setDrawPreview({
        x: Math.min(drawStart.current.x, pos.x),
        y: Math.min(drawStart.current.y, pos.y),
        w: Math.abs(pos.x - drawStart.current.x),
        h: Math.abs(pos.y - drawStart.current.y),
      });
      return;
    }

    if (draggingId.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const imgLeft = centerX + pan.x - (imgNatural.w * zoom) / 2;
      const imgTop = centerY + pan.y - (imgNatural.h * zoom) / 2;
      const xPct = ((e.clientX - dragOffset.current.x - imgLeft) / (imgNatural.w * zoom)) * 100;
      const yPct = ((e.clientY - dragOffset.current.y - imgTop) / (imgNatural.h * zoom)) * 100;
      onPanelsChange(prev => prev.map(p =>
        p.id === draggingId.current ? { ...p, x: xPct, y: yPct } : p
      ));
    }
  }, [clientToImgPct, pan, zoom, imgNatural, onPanelsChange]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    draggingId.current = null;

    if (isDrawing.current && drawPreview && drawPreview.w > 0.5 && drawPreview.h > 0.5) {
      onObstaclesChange(prev => [...prev, {
        id: Date.now().toString(),
        x: drawPreview.x,
        y: drawPreview.y,
        w: drawPreview.w,
        h: drawPreview.h,
        color: obstacleColor,
        label: 'Hinder',
      }]);
    }
    isDrawing.current = false;
    drawStart.current = null;
    setDrawPreview(null);
  }, [drawPreview, obstacleColor, onObstaclesChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handlePanelMouseDown = useCallback((e, panel) => {
    if (tool !== TOOLS.pan && tool !== TOOLS.place) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const imgLeft = centerX + pan.x - (imgNatural.w * zoom) / 2;
    const imgTop = centerY + pan.y - (imgNatural.h * zoom) / 2;

    // panel center in screen coords
    const panelScreenX = imgLeft + (panel.x / 100) * imgNatural.w * zoom;
    const panelScreenY = imgTop + (panel.y / 100) * imgNatural.h * zoom;

    dragOffset.current = {
      x: e.clientX - panelScreenX,
      y: e.clientY - panelScreenY,
    };
    draggingId.current = panel.id;
  }, [tool, pan, zoom, imgNatural]);

  // Touch pinch zoom
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
      setZoom(z => Math.max(0.1, Math.min(10, z * (dist / lastTouchDist.current))));
      lastTouchDist.current = dist;
    }
  };

  const cursor = {
    [TOOLS.pan]: isPanning.current ? 'grabbing' : 'grab',
    [TOOLS.place]: 'crosshair',
    [TOOLS.obstacle]: 'crosshair',
  }[tool];

  const imgDisplayW = imgNatural.w * zoom;
  const imgDisplayH = imgNatural.h * zoom;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
        <span className="text-white font-semibold text-sm mr-2">Redigerare</span>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <ToolBtn active={tool === TOOLS.pan} onClick={() => setTool(TOOLS.pan)} title="Panorera / flytta paneler">
            <Hand className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn active={tool === TOOLS.place} onClick={() => setTool(TOOLS.place)} title="Placera panel" disabled={!selectedProduct}>
            <Sun className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn active={tool === TOOLS.obstacle} onClick={() => setTool(TOOLS.obstacle)} title="Rita hinder (dra rektangel)">
            <Pencil className="w-4 h-4" />
          </ToolBtn>
        </div>

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

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg overflow-hidden">
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => setZoom(z => Math.max(0.1, z - 0.15))}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-white text-xs px-2 min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1.5 text-white hover:bg-gray-700" onClick={() => setZoom(z => Math.min(10, z + 0.15))}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="text-gray-400 hover:text-white p-1.5 rounded" onClick={() => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const fit = Math.min(rect.width / imgNatural.w, rect.height / imgNatural.h) * 0.95;
          setZoom(fit); setPan({ x: 0, y: 0 });
        }} title="Återställ vy">
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:block">
            {tool === TOOLS.pan && 'Dra bilden för att panorera • Dra panel för att flytta'}
            {tool === TOOLS.place && 'Klicka på taket för att placera panel'}
            {tool === TOOLS.obstacle && 'Håll nere och dra för att markera hinder'}
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
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Image + overlays */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: imgDisplayW,
            height: imgDisplayH,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Tak"
            draggable={false}
            onLoad={handleImgLoad}
            style={{ width: imgDisplayW, height: imgDisplayH, display: 'block', pointerEvents: 'none' }}
          />

          {/* Obstacles */}
          {(obstacles || []).map(obs => (
            <div key={obs.id} style={{
              position: 'absolute',
              left: `${obs.x}%`,
              top: `${obs.y}%`,
              width: `${obs.w}%`,
              height: `${obs.h}%`,
              border: `2px solid ${obs.color}`,
              background: `${obs.color}33`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <span style={{ fontSize: 10, color: obs.color, background: 'rgba(0,0,0,0.7)', padding: '1px 4px', borderRadius: 2 }}>
                {obs.label}
              </span>
              <button
                style={{ background: 'rgba(0,0,0,0.7)', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 2 }}
                onClick={(e) => { e.stopPropagation(); onObstaclesChange(prev => prev.filter(o => o.id !== obs.id)); }}
              >
                <Trash2 style={{ width: 10, height: 10, color: '#ef4444' }} />
              </button>
            </div>
          ))}

          {/* Draw preview */}
          {drawPreview && drawPreview.w > 0 && (
            <div style={{
              position: 'absolute',
              left: `${drawPreview.x}%`,
              top: `${drawPreview.y}%`,
              width: `${drawPreview.w}%`,
              height: `${drawPreview.h}%`,
              border: `2px dashed ${obstacleColor}`,
              background: `${obstacleColor}22`,
              pointerEvents: 'none',
            }} />
          )}

          {/* Panels — size is in image-space pixels, no zoom multiplication */}
          {panels.map(panel => {
            const pw = panel.width_mm ? (panel.width_mm / 1000) * pxPerMeter * zoom : panelW_img * zoom;
            const ph = panel.height_mm ? (panel.height_mm / 1000) * pxPerMeter * zoom : panelH_img * zoom;
            return (
              <div key={panel.id} style={{
                position: 'absolute',
                left: `${panel.x}%`,
                top: `${panel.y}%`,
                width: pw,
                height: ph,
                transform: 'translate(-50%, -50%)',
                cursor: 'grab',
                zIndex: 10,
              }}
                onMouseDown={e => handlePanelMouseDown(e, panel)}
                onClick={e => e.stopPropagation()}
              >
                <SolarPanelSVG widthPx={pw} heightPx={ph} isSelected={false} />
                {/* Trash button on each panel */}
                <button
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'rgba(0,0,0,0.75)',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    padding: '2px 3px',
                    lineHeight: 1,
                    zIndex: 20,
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onPanelsChange(prev => prev.filter(p => p.id !== panel.id));
                  }}
                >
                  <Trash2 style={{ width: Math.max(8, Math.min(14, pw * 0.15)), height: Math.max(8, Math.min(14, pw * 0.15)), color: '#ef4444' }} />
                </button>
              </div>
            );
          })}
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