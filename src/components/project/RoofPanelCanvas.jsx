import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Maximize2, MousePointer, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import RoofEditor from './RoofEditor';

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
          <stop offset="0%" stopColor="white" stopOpacity={0.18} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="#1a2540" rx={1.5} />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <rect key={`${r}-${c}`}
            x={c * cellW + gap} y={r * cellH + gap}
            width={cellW - gap * 2} height={cellH - gap * 2}
            fill="#1e3560" stroke="#2a4070" strokeWidth={0.4} rx={0.5}
          />
        ))
      )}
      <rect x={0} y={0} width={widthPx} height={heightPx} fill={`url(#${id})`} rx={1.5} />
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="none"
        stroke={isSelected ? '#60a5fa' : '#3a5070'}
        strokeWidth={isSelected ? 2.5 : 1} rx={1.5}
      />
    </svg>
  );
}

export default function RoofPanelCanvas({
  imageUrl, panels, onPanelsChange, onImageUpload,
  selectedProduct, roofWidthM, roofHeightM,
  obstacles = [], onObstaclesChange,
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasW, setCanvasW] = useState(800);
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleResize = (entries) => {
    setCanvasW(entries[0].contentRect.width);
  };

  const attachObserver = (el) => {
    if (!el) return;
    const obs = new ResizeObserver(handleResize);
    obs.observe(el);
  };

  // pxPerMeter in preview: canvas width / roof width
  // scaleFactor is a manual override so users can adjust preview size
  const pxPerMeter = roofWidthM > 0
    ? (canvasW / roofWidthM) * scaleFactor
    : (canvasW / 10) * scaleFactor;

  const getPanelPx = (panel) => ({
    pw: panel.width_mm ? (panel.width_mm / 1000) * pxPerMeter : pxPerMeter * 1.1,
    ph: panel.height_mm ? (panel.height_mm / 1000) * pxPerMeter : pxPerMeter * 1.7,
  });

  // Derive natural image aspect ratio from loaded img element
  const [imgAspect, setImgAspect] = useState(1.5);
  const handleImgLoad = () => {
    if (imgRef.current) {
      setImgAspect(imgRef.current.naturalWidth / imgRef.current.naturalHeight);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => onImageUpload(ev.target.result, file);
    reader.readAsDataURL(file);
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
    <>
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
          <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setEditorOpen(true)}>
            <Maximize2 className="w-3.5 h-3.5" /> Öppna redigerare
          </Button>

          {/* Panel scale */}
          <div className="flex items-center gap-1 ml-auto border border-border rounded-lg overflow-hidden">
            <button className="px-2 py-1 text-xs hover:bg-muted transition-colors"
              onClick={() => setScaleFactor(s => Math.max(0.2, +(s - 0.1).toFixed(1)))}>
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-1 text-xs font-medium bg-muted/50 min-w-[40px] text-center">
              {(scaleFactor * 100).toFixed(0)}%
            </span>
            <button className="px-2 py-1 text-xs hover:bg-muted transition-colors"
              onClick={() => setScaleFactor(s => Math.min(3.0, +(s + 0.1).toFixed(1)))}>
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Klicka på <strong>Öppna redigerare</strong> för att placera paneler och markera hinder i helskärm med zoom.
        </p>

        {/* Preview canvas */}
        <div
          ref={el => { canvasRef.current = el; attachObserver(el); }}
          className="relative rounded-xl overflow-hidden shadow-lg select-none cursor-pointer"
          onClick={() => setEditorOpen(true)}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Tak"
            className="w-full h-auto block"
            onLoad={() => { setImageLoaded(true); handleImgLoad(); }}
            draggable={false}
          />

          {/* Preview panels */}
          {imageLoaded && panels.map(panel => {
            const { pw, ph } = getPanelPx(panel);
            return (
              <div key={panel.id} style={{
                position: 'absolute',
                left: `${panel.x}%`,
                top: `${panel.y}%`,
                width: pw,
                height: ph,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 10,
              }}>
                <SolarPanelSVG widthPx={pw} heightPx={ph} isSelected={false} />
              </div>
            );
          })}

          {/* Preview obstacles */}
          {imageLoaded && obstacles.map(obs => (
            <div key={obs.id} style={{
              position: 'absolute',
              left: `${obs.x}%`,
              top: `${obs.y}%`,
              width: `${obs.w}%`,
              height: `${obs.h}%`,
              border: `2px solid ${obs.color}`,
              background: `${obs.color}33`,
              pointerEvents: 'none',
              zIndex: 11,
            }} />
          ))}

          {/* Click overlay hint */}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="bg-black/50 text-white text-sm px-3 py-1.5 rounded-full opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
              Klicka för att redigera
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen editor */}
      {editorOpen && (
        <RoofEditor
          imageUrl={imageUrl}
          panels={panels}
          onPanelsChange={onPanelsChange}
          obstacles={obstacles}
          onObstaclesChange={onObstaclesChange}
          selectedProduct={selectedProduct}
          roofWidthM={roofWidthM}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}