import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Camera, Trash2, Loader2, ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

export default function RoofPanelEditor({ project, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [panels, setPanels] = useState(() => {
    try { return JSON.parse(project.panel_layout_data || '[]'); } catch { return []; }
  });
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    base44.entities.Product.filter({ category: 'solpanel' }).then(data => {
      setProducts(data);
      if (data.length > 0) setSelectedProduct(data[0]);
    });
  }, []);

  const saveLayout = useCallback(async (newPanels) => {
    setSaving(true);
    await onUpdate({ panel_layout_data: JSON.stringify(newPanels) });
    setSaving(false);
  }, [onUpdate]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await onUpdate({ roof_image_url: file_url });
    setUploading(false);
  };

  const handleCanvasClick = (e) => {
    if (!project.roof_image_url) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newPanel = {
      id: Date.now().toString(),
      x: Math.max(0, Math.min(95, x)),
      y: Math.max(0, Math.min(90, y)),
      productId: selectedProduct?.id,
      productName: selectedProduct?.name,
      watts: selectedProduct?.power_watts,
      color: '#f97316',
    };
    const updated = [...panels, newPanel];
    setPanels(updated);
    saveLayout(updated);
  };

  const removePanel = (id) => {
    const updated = panels.filter(p => p.id !== id);
    setPanels(updated);
    saveLayout(updated);
    setSelectedPanel(null);
  };

  const clearAll = () => {
    setPanels([]);
    saveLayout([]);
    setSelectedPanel(null);
  };

  const totalWatts = panels.reduce((s, p) => s + (p.watts || 0), 0);

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border p-4 flex-shrink-0 bg-card overflow-y-auto">
        <h3 className="font-semibold text-sm mb-3">Solpanel att placera</h3>

        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-muted rounded-xl p-3">
            Lägg till solpaneler i Produktsortiment först
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all
                  ${selectedProduct?.id === p.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.power_watts}W · {p.price?.toLocaleString('sv-SE')} kr</p>
              </button>
            ))}
          </div>
        )}

        {panels.length > 0 && (
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-3">
            <p className="text-sm font-semibold text-orange-800">{panels.length} paneler</p>
            <p className="text-xs text-orange-600">{(totalWatts / 1000).toFixed(1)} kWp total</p>
          </div>
        )}

        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-xs font-medium cursor-pointer hover:bg-primary/90 transition-colors">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {project.roof_image_url ? 'Byt bild' : 'Ladda upp tak'}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
          {panels.length > 0 && (
            <button onClick={clearAll} className="px-3 py-2 rounded-xl border border-border hover:bg-red-50 hover:border-red-200 transition-colors">
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Klicka på taket för att placera paneler. Klicka på en panel för att ta bort den.
        </p>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden bg-muted/30 flex items-center justify-center p-4" ref={containerRef}>
        {!project.roof_image_url ? (
          <label className="flex flex-col items-center justify-center w-full max-w-md h-64 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 bg-card transition-colors">
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-sm">Ladda upp bild på taket</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, HEIC</p>
              </>
            )}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
        ) : (
          <div
            className="relative cursor-crosshair rounded-xl overflow-hidden shadow-xl max-w-full max-h-full"
            style={{ display: 'inline-block' }}
            onClick={handleCanvasClick}
          >
            <img
              ref={imageRef}
              src={project.roof_image_url}
              alt="Tak"
              className="block max-w-full max-h-[calc(100vh-16rem)] object-contain select-none"
              draggable={false}
            />
            {/* Panel overlays */}
            {panels.map(panel => (
              <div
                key={panel.id}
                className="absolute group"
                style={{
                  left: `${panel.x}%`,
                  top: `${panel.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={e => { e.stopPropagation(); removePanel(panel.id); }}
              >
                <div className="relative bg-orange-500/80 border-2 border-orange-400 rounded-sm w-8 h-10 flex items-center justify-center shadow-md hover:bg-red-500/80 hover:border-red-400 transition-colors cursor-pointer">
                  <div className="grid grid-cols-2 gap-px w-5 h-7">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="bg-orange-200/40 rounded-[1px]" />
                    ))}
                  </div>
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {panel.watts}W · Ta bort
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}