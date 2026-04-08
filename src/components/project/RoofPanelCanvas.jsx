import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Trash2, MousePointer } from 'lucide-react';

// Renders a single solar panel SVG that looks realistic
function SolarPanelSVG({ widthPx, heightPx, isSelected }) {
  const cols = 6;
  const rows = Math.round((heightPx / widthPx) * cols) || 10;
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  const gap = 1.5;

  return (
    <svg
      width={widthPx}
      height={heightPx}
      style={{ display: 'block', filter: isSelected ? 'drop-shadow(0 0 6px #60a5fa)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
    >
      {/* Panel background */}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="#1a2744" rx={2} />
      {/* Frame */}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="none" stroke="#4a6080" strokeWidth={1.5} rx={2} />
      {/* Cells */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * cellW + gap}
            y={r * cellH + gap}
            width={cellW - gap * 2}
            height={cellH - gap * 2}
            fill="#1e3a6e"
            stroke="#2a4a8a"
            strokeWidth={0.5}
            rx={1}
          />
        ))
      )}
      {/* Shine overlay */}
      <rect x={0} y={0} width={widthPx} height={heightPx / 3} fill="url(#shine)" opacity={0.15} rx={2} />
      <defs>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.8} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      {isSelected && (
        <rect x={0} y={0} width={widthPx} height={heightPx} fill="none" stroke="#60a5fa" strokeWidth={2.5} rx={2} />
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
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasDims, setCanvasDims] = useState({ w: 1, h: 1 });
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedPanel, setSelectedPanelId] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);

  // Track canvas pixel size
  useEffect(() => {
    if (!canvasRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasDims({ w: width, h: height });
    });
    obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [imageLoaded]);

  // pixels per meter on canvas
  const pxPerMeter = roofWidthM > 0 ? canvasDims.w / roofWidthM : canvasDims.w / 10;

  // Panel pixel dimensions
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

  // Click on canvas to place panel
  const handleCanvasClick = (e) => {
    if (dragging) return;
    if (!placementMode || !selectedProduct) return;
    if (e.target !== e.currentTarget && e.target.tagName !== 'IMG') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newPanel = {
      id: Date.now().toString(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      power_watts: selectedProduct.power_watts,
      width_mm: selectedProduct.width_mm,
      height_mm: selectedProduct.height_mm,
      // Store as percentage
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    };
    onPanelsChange(prev => [...prev, newPanel]);
  };

  // Drag panels
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
      p.id === dragging ? { ...p, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) } : p
    ));
  }, [dragging, dragOffset, panels, onPanelsChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Touch drag
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
      p.id === dragging ? { ...p, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) } : p
    ));
  }, [dragging, dragOffset, panels, onPanelsChange]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [dragging, handleTouchMove, handleMouseUp]);

  const removeSelected = () => {
    if (!selectedPanel) return;
    onPanelsChange(prev => prev.filter(p => p.id !== selectedPanel));
    setSelectedPanelId(null);
  };

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

  return (
    <div className="space-y-3">
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
            className={`gap-1 ${placementMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
            onClick={() => setPlacementMode(v => !v)}
          >
            <MousePointer className="w-3.5 h-3.5" />
            {placementMode ? 'Klickläge ON – klicka på taket' : 'Klickläge'}
          </Button>
        )}

        {selectedPanel && (
          <Button size="sm" variant="destructive" className="gap-1" onClick={removeSelected}>
            <Trash2 className="w-3.5 h-3.5" /> Ta bort vald
          </Button>
        )}

        <p className="text-xs text-muted-foreground ml-auto">
          {placementMode ? '👆 Klicka på taket för att placera panel' : 'Dra paneler för att flytta'}
        </p>
      </div>

      <div
        ref={canvasRef}
        className={`relative rounded-xl overflow-hidden shadow-lg bg-black select-none ${placementMode ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ touchAction: 'none' }}
        onClick={handleCanvasClick}
      >
        <img
          src={imageUrl}
          alt="Tak"
          className="w-full h-auto block"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
          onClick={e => { if (!placementMode) e.stopPropagation(); }}
        />

        {imageLoaded && panels.map(panel => {
          // Use panel's own dimensions if stored, else from selectedProduct
          const pw = panel.width_mm
            ? (panel.width_mm / 1000) * pxPerMeter
            : panelWidthPx;
          const ph = panel.height_mm
            ? (panel.height_mm / 1000) * pxPerMeter
            : panelHeightPx;

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
                zIndex: selectedPanel === panel.id ? 20 : 10,
              }}
              onMouseDown={e => handleMouseDown(e, panel.id)}
              onTouchStart={e => handleTouchStart(e, panel.id)}
              onClick={e => { e.stopPropagation(); setSelectedPanelId(panel.id); }}
            >
              <SolarPanelSVG
                widthPx={pw}
                heightPx={ph}
                isSelected={selectedPanel === panel.id}
              />
            </div>
          );
        })}
      </div>

      {!roofWidthM && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ Ange takmåtten ovan för att panelerna ska ritas i rätt skala.
        </p>
      )}
      {selectedProduct && roofWidthM && (
        <p className="text-xs text-muted-foreground">
          Panel: {selectedProduct.width_mm}×{selectedProduct.height_mm} mm → {Math.round(panelWidthPx)}×{Math.round(panelHeightPx)} px på canvas
        </p>
      )}
    </div>
  );
}