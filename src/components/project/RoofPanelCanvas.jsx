import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Trash2, MousePointer, ZoomIn, ZoomOut } from 'lucide-react';

function SolarPanelSVG({ widthPx, heightPx, isSelected }) {
  const cols = 6;
  const rows = Math.max(2, Math.round((heightPx / widthPx) * cols));
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  const gap = Math.max(0.5, Math.min(1.5, widthPx / 80));

  return (
    <svg
      width={widthPx}
      height={heightPx}
      style={{
        display: 'block',
        filter: isSelected
          ? 'drop-shadow(0 0 4px #60a5fa) brightness(1.15)'
          : 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
        opacity: 0.88,
      }}
    >
      <defs>
        <linearGradient id={`shine-${widthPx}`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.18} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Frame */}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="#1a2540" rx={1.5} />
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="none" stroke="#3a5070" strokeWidth={1} rx={1.5} />
      {/* Cells */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * cellW + gap}
            y={r * cellH + gap}
            width={cellW - gap * 2}
            height={cellH - gap * 2}
            fill="#1e3560"
            stroke="#2a4070"
            strokeWidth={0.4}
            rx={0.5}
          />
        ))
      )}
      {/* Shine */}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill={`url(#shine-${widthPx})`} rx={1.5} />
      {isSelected && (
        <rect x={0} y={0} width={widthPx} height={heightPx} fill="none" stroke="#60a5fa" strokeWidth={2} rx={1.5} />
      )}
    </svg>
  );
}

export default function RoofPanelCanvas({
  imageUrl,
  panels,
  onPanelsChange,
  onImageUpload,
  selectedProduct,
  roofWidthM,
  roofHeightM,
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasDims, setCanvasDims] = useState({ w: 800, h: 500 });
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);
  // User-controllable scale factor (default 1.0 = auto from roof dims)
  const [scaleFactor, setScaleFactor] = useState(1.0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const obs = new ResizeObserver(entries => {
      const el = entries[0].target;
      setCanvasDims({ w: el.offsetWidth, h: el.offsetHeight });
    });
    obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [imageLoaded]);

  // Key insight: map roof width (meters) → canvas image width (pixels)
  // But the image may show the full roof or just part of it.
  // We use roofWidthM to define scale: canvasDims.w pixels = roofWidthM meters
  const pxPerMeter = roofWidthM > 0
    ? (canvasDims.w / roofWidthM) * scaleFactor
    : (canvasDims.w / 10) * scaleFactor;

  const panelWidthPx = selectedProduct?.width_mm
    ? (selectedProduct.width_mm / 1000) * pxPerMeter
    : pxPerMeter * 1.1;
  const panelHeightPx = selectedProduct?.height_mm
    ? (selectedProduct.height_mm / 1000) * pxPerMeter
    : pxPerMeter * 1.7;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => onImageUpload(ev.target.result, file);
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = (e) => {
    if (dragging) return;
    if (!placementMode || !selectedProduct) return;
    if (e.target !== e.currentTarget && e.target !== imgRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onPanelsChange(prev => [...prev, {
      id: Date.now().toString(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      power_watts: selectedProduct.power_watts,
      width_mm: selectedProduct.width_mm,
      height_mm: selectedProduct.height_mm,
      x, y,
    }]);
  };

  const getItemPx = (panel) => {
    const pw = panel.width_mm ? (panel.width_mm / 1000) * pxPerMeter : panelWidthPx;
    const ph = panel.height_mm ? (panel.height_mm / 1000) * pxPerMeter : panelHeightPx;
    return { pw, ph };
  };

  const handleMouseDown = (e, panelId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    setDragOffset({
      x: e.clientX - rect.left - (panel.x / 100) * rect.width,
      y: e.clientY - rect.top - (panel.y / 100) * rect.height,
    });
    setDragging(panelId);
    setSelectedPanelId(panelId);
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    onPanelsChange(panels.map(p =>
      p.id === dragging ? { ...p, x: Math.max(0, Math.min(98, x)), y: Math.max(0, Math.min(98, y)) } : p
    ));
  }, [dragging, dragOffset, panels, onPanelsChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleTouchStart = (e, panelId) => {
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    setDragOffset({
      x: touch.clientX - rect.left - (panel.x / 100) * rect.width,
      y: touch.clientY - rect.top - (panel.y / 100) * rect.height,
    });
    setDragging(panelId);
    setSelectedPanelId(panelId);
  };

  const handleTouchMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((touch.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((touch.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    onPanelsChange(panels.map(p =>
      p.id === dragging ? { ...p, x: Math.max(0, Math.min(98, x)), y: Math.max(0, Math.min(98, y)) } : p
    ));
  }, [dragging, dragOffset, panels, onPanelsChange]);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragging, handleTouchMove, handleMouseUp]);

  if (!imageUrl) {
    return (
      <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/30">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Upload className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Ladda upp bild på taket</h3>
        <p className="text-sm text-muted-foreground mb-4">Ta ett foto eller välj en bild från enheten</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Välj från galleri
          </Button>
          <Button className="gap-2" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="w-4 h-4" /> Ta foto
          </Button>
        </div>
      </div>
    );
  }

  const panelSizePct = roofWidthM && selectedProduct?.width_mm
    ? ((selectedProduct.width_mm / 1000) / roofWidthM * 100 * scaleFactor).toFixed(1)
    : null;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Button variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> Galleri
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => cameraInputRef.current?.click()}>
          <Camera className="w-3.5 h-3.5" /> Kamera
        </Button>

        {selectedProduct && (
          <Button
            size="sm"
            variant={placementMode ? 'default' : 'outline'}
            className={placementMode ? 'bg-blue-600 hover:bg-blue-700 text-white gap-1' : 'gap-1'}
            onClick={() => setPlacementMode(v => !v)}
          >
            <MousePointer className="w-3.5 h-3.5" />
            {placementMode ? '✦ Klickläge PÅ' : 'Klickläge'}
          </Button>
        )}

        {selectedPanelId && (
          <Button size="sm" variant="destructive" className="gap-1" onClick={() => {
            onPanelsChange(prev => prev.filter(p => p.id !== selectedPanelId));
            setSelectedPanelId(null);
          }}>
            <Trash2 className="w-3.5 h-3.5" /> Ta bort vald
          </Button>
        )}

        {/* Scale controls */}
        <div className="flex items-center gap-1 ml-auto border border-border rounded-lg overflow-hidden">
          <button
            className="px-2 py-1 text-xs hover:bg-muted transition-colors"
            onClick={() => setScaleFactor(s => Math.max(0.2, +(s - 0.1).toFixed(1)))}
            title="Minska panelstorlek"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 py-1 text-xs font-medium bg-muted/50 min-w-[40px] text-center">
            {(scaleFactor * 100).toFixed(0)}%
          </span>
          <button
            className="px-2 py-1 text-xs hover:bg-muted transition-colors"
            onClick={() => setScaleFactor(s => Math.min(3.0, +(s + 0.1).toFixed(1)))}
            title="Öka panelstorlek"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scale info */}
      {roofWidthM && selectedProduct?.width_mm && (
        <p className="text-xs text-muted-foreground">
          Panelbredd = {panelSizePct}% av bildbredden &nbsp;·&nbsp;
          {Math.round(panelWidthPx)}×{Math.round(panelHeightPx)} px &nbsp;·&nbsp;
          Justera skalan med +/− om panelerna ser för stora/små
        </p>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`relative rounded-xl overflow-hidden shadow-lg select-none ${placementMode ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ touchAction: 'none' }}
        onClick={handleCanvasClick}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Tak"
          className="w-full h-auto block"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {imageLoaded && panels.map(panel => {
          const { pw, ph } = getItemPx(panel);
          const isSelected = selectedPanelId === panel.id;
          return (
            <div
              key={panel.id}
              className="absolute"
              style={{
                left: `${panel.x}%`,
                top: `${panel.y}%`,
                width: pw,
                height: ph,
                transform: 'translate(-50%, -50%)',
                cursor: dragging === panel.id ? 'grabbing' : 'grab',
                zIndex: isSelected ? 20 : 10,
              }}
              onMouseDown={e => handleMouseDown(e, panel.id)}
              onTouchStart={e => handleTouchStart(e, panel.id)}
              onClick={e => { e.stopPropagation(); setSelectedPanelId(panel.id); }}
            >
              <SolarPanelSVG widthPx={pw} heightPx={ph} isSelected={isSelected} />
            </div>
          );
        })}

        {placementMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
            Klicka på taket för att placera panel
          </div>
        )}
      </div>
    </div>
  );
}