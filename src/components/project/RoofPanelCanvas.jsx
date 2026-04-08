import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Maximize2 } from 'lucide-react';
import RoofEditor from './RoofEditor';

// Preview panel — pure % sizing so it matches the image
function PreviewPanel({ panel, roofWidthM, roofHeightM }) {
  const rw = roofWidthM || 10;
  const rh = roofHeightM || 8;
  const wPct = panel.width_mm  ? (panel.width_mm  / 1000 / rw) * 100 : (1.1 / rw) * 100;
  const hPct = panel.height_mm ? (panel.height_mm / 1000 / rh) * 100 : (1.76 / rh) * 100;
  return (
    <div style={{
      position: 'absolute',
      left: `${panel.x}%`,
      top: `${panel.y}%`,
      width: `${wPct}%`,
      height: `${hPct}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 10,
      background: '#1a2540',
      border: '1px solid #3a5090',
      opacity: 0.88,
    }}>
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <pattern id="previewCells" x="0" y="0" width="16.666%" height="25%" patternUnits="objectBoundingBox">
          <rect x="5%" y="5%" width="90%" height="90%" fill="#1e3560" stroke="#2a4070" strokeWidth="0.5" rx="1" />
        </pattern>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#previewCells)" />
      </svg>
    </div>
  );
}

export default function RoofPanelCanvas({
  imageUrl, panels, onPanelsChange, onImageUpload,
  selectedProduct, roofWidthM, roofHeightM,
  obstacles = [], onObstaclesChange,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

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
        </div>

        <p className="text-xs text-muted-foreground">
          Klicka på <strong>Öppna redigerare</strong> för att placera paneler och markera hinder i helskärm med zoom.
        </p>

        {/* Preview */}
        <div
          className="relative rounded-xl overflow-hidden shadow-lg select-none cursor-pointer"
          onClick={() => setEditorOpen(true)}
        >
          <img
            src={imageUrl}
            alt="Tak"
            className="w-full h-auto block"
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />

          {imageLoaded && panels.map(panel => (
            <PreviewPanel
              key={panel.id}
              panel={panel}
              roofWidthM={roofWidthM}
              roofHeightM={roofHeightM}
            />
          ))}

          {imageLoaded && obstacles.map(obs => (
            <div key={obs.id} style={{
              position: 'absolute',
              left: `${obs.x}%`, top: `${obs.y}%`,
              width: `${obs.w}%`, height: `${obs.h}%`,
              border: `2px solid ${obs.color}`,
              background: `${obs.color}33`,
              pointerEvents: 'none', zIndex: 11,
            }} />
          ))}

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/50 text-white text-sm px-3 py-1.5 rounded-full opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
              Klicka för att redigera
            </div>
          </div>
        </div>
      </div>

      {editorOpen && (
        <RoofEditor
          imageUrl={imageUrl}
          panels={panels}
          onPanelsChange={onPanelsChange}
          obstacles={obstacles}
          onObstaclesChange={onObstaclesChange}
          selectedProduct={selectedProduct}
          roofWidthM={roofWidthM}
          roofHeightM={roofHeightM}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}