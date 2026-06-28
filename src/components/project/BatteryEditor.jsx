import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, Trash2, Battery, Info } from 'lucide-react';
import { useEffect } from 'react';
import { filterVisibleProducts } from '@/lib/tenantQueries';

export default function BatteryEditor({ project, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [batteries, setBatteries] = useState(() => {
    try { return JSON.parse(project.battery_layout_data || '[]'); } catch { return []; }
  });
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    filterVisibleProducts({ category: 'batteri' }).then(data => {
      setProducts(data);
      if (data.length > 0) setSelectedProduct(data[0]);
    });
  }, []);

  const saveLayout = useCallback(async (data) => {
    setSaving(true);
    await onUpdate({ battery_layout_data: JSON.stringify(data) });
    setSaving(false);
  }, [onUpdate]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await onUpdate({ battery_image_url: file_url });
    setUploading(false);
  };

  const handleCanvasClick = (e) => {
    if (!project.battery_image_url || !selectedProduct) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newBattery = {
      id: Date.now().toString(),
      x: Math.max(0, Math.min(95, x)),
      y: Math.max(0, Math.min(90, y)),
      productId: selectedProduct?.id,
      productName: selectedProduct?.name,
      kwh: selectedProduct?.capacity_kwh,
    };
    const updated = [...batteries, newBattery];
    setBatteries(updated);
    saveLayout(updated);
  };

  const removeBattery = (id) => {
    const updated = batteries.filter(b => b.id !== id);
    setBatteries(updated);
    saveLayout(updated);
  };

  const clearAll = () => { setBatteries([]); saveLayout([]); };

  const totalKwh = batteries.reduce((s, b) => s + (b.kwh || 0), 0);

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border p-4 flex-shrink-0 bg-card overflow-y-auto">
        <h3 className="font-semibold text-sm mb-3">Batterimodell</h3>

        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-muted rounded-xl p-3">
            Lägg till batterier i Produktsortiment först
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
                <p className="text-xs text-muted-foreground">{p.capacity_kwh}kWh · {p.price?.toLocaleString('sv-SE')} kr</p>
              </button>
            ))}
          </div>
        )}

        {batteries.length > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
            <p className="text-sm font-semibold text-green-800">{batteries.length} batterier</p>
            <p className="text-xs text-green-600">{totalKwh.toFixed(1)} kWh total</p>
          </div>
        )}

        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-xs font-medium cursor-pointer hover:bg-primary/90">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {project.battery_image_url ? 'Byt bild' : 'Ladda upp bild'}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
          {batteries.length > 0 && (
            <button onClick={clearAll} className="px-3 py-2 rounded-xl border border-border hover:bg-red-50 hover:border-red-200">
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Välj batterimodell, ladda upp en bild på platsen och klicka för att visualisera var batteriet ska installeras.
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-muted/30 flex items-center justify-center p-4">
        {!project.battery_image_url ? (
          <label className="flex flex-col items-center justify-center w-full max-w-md h-64 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 bg-card">
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Battery className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-sm">Ladda upp bild för batteriplacering</p>
                <p className="text-xs text-muted-foreground mt-1">T.ex. foto på tekniskt rum eller garage</p>
              </>
            )}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
        ) : (
          <div
            className="relative rounded-xl overflow-hidden shadow-xl inline-block cursor-crosshair"
            onClick={handleCanvasClick}
          >
            <img
              src={project.battery_image_url}
              alt="Batteriplacering"
              className="block max-w-full max-h-[calc(100vh-16rem)] object-contain select-none"
              draggable={false}
            />
            {batteries.map(battery => (
              <div
                key={battery.id}
                className="absolute group"
                style={{
                  left: `${battery.x}%`,
                  top: `${battery.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={e => { e.stopPropagation(); removeBattery(battery.id); }}
              >
                <div className="relative bg-green-600/85 border-2 border-green-400 rounded-lg w-10 h-14 flex flex-col items-center justify-center shadow-lg hover:bg-red-500/85 hover:border-red-400 transition-colors cursor-pointer">
                  <div className="w-4 h-1.5 bg-green-200/60 rounded-full mb-1" />
                  <Battery className="w-5 h-5 text-white" />
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {battery.kwh}kWh · Ta bort
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
