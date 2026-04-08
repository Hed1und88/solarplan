import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Upload, Loader2 } from 'lucide-react';

const categories = [
  { value: 'solpanel', label: 'Solpanel' },
  { value: 'batteri', label: 'Batteri' },
  { value: 'vaxelriktare', label: 'Växelriktare' },
  { value: 'optimerare', label: 'Optimerare' },
  { value: 'kabel', label: 'Kabel' },
  { value: 'montagesystem', label: 'Montagesystem' },
  { value: 'ovrigt', label: 'Övrigt' },
];

export default function ProductFormModal({ product, onSave, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'solpanel',
    brand: product?.brand || '',
    model: product?.model || '',
    price: product?.price || '',
    unit: product?.unit || 'st',
    power_watts: product?.power_watts || '',
    capacity_kwh: product?.capacity_kwh || '',
    width_mm: product?.width_mm || '',
    height_mm: product?.height_mm || '',
    description: product?.description || '',
    image_url: product?.image_url || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set('image_url', file_url);
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, price: Number(form.price) || 0 };
    if (form.power_watts) data.power_watts = Number(form.power_watts);
    if (form.capacity_kwh) data.capacity_kwh = Number(form.capacity_kwh);
    if (form.width_mm) data.width_mm = Number(form.width_mm);
    if (form.height_mm) data.height_mm = Number(form.height_mm);

    if (product?.id) {
      await base44.entities.Product.update(product.id, data);
    } else {
      await base44.entities.Product.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">{product ? 'Redigera produkt' : 'Ny produkt'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button
                  key={c.value}
                  onClick={() => set('category', c.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${form.category === c.value ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary/50 text-muted-foreground'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Produktnamn *" value={form.name} onChange={v => set('name', v)} placeholder="T.ex. JA Solar 415W" />
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Varumärke" value={form.brand} onChange={v => set('brand', v)} placeholder="T.ex. JA Solar" />
            <Field label="Modell" value={form.model} onChange={v => set('model', v)} placeholder="T.ex. JAM54S30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pris (SEK) *" type="number" value={form.price} onChange={v => set('price', v)} placeholder="0" />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enhet</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="st">st</option>
                <option value="m">m</option>
                <option value="set">set</option>
                <option value="paket">paket</option>
              </select>
            </div>
          </div>

          {(form.category === 'solpanel' || form.category === 'vaxelriktare' || form.category === 'optimerare') && (
            <Field label="Effekt (W)" type="number" value={form.power_watts} onChange={v => set('power_watts', v)} placeholder="415" />
          )}
          {form.category === 'batteri' && (
            <Field label="Kapacitet (kWh)" type="number" value={form.capacity_kwh} onChange={v => set('capacity_kwh', v)} placeholder="10" />
          )}
          {form.category === 'solpanel' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="1134" />
              <Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="1762" />
            </div>
          )}

          <Field label="Beskrivning" value={form.description} onChange={v => set('description', v)} placeholder="Valfri beskrivning..." multiline />

          {/* Image upload */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Produktbild</label>
            {form.image_url ? (
              <div className="relative">
                <img src={form.image_url} alt="" className="w-full h-28 object-contain bg-muted rounded-xl" />
                <button onClick={() => set('image_url', '')} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
                  <>
                    <Upload className="w-4 h-4 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Ladda upp bild</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleImage} />
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.price}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {product ? 'Spara ändringar' : 'Lägg till'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', multiline }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
    </div>
  );
}