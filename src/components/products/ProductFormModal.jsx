import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Upload, Loader2, Sparkles } from 'lucide-react';

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
    voc_v: product?.voc_v || '',
    isc_a: product?.isc_a || '',
    vmp_v: product?.vmp_v || '',
    imp_a: product?.imp_a || '',
    description: product?.description || '',
    image_url: product?.image_url || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);

  const handleAutoFetch = async () => {
    const query = [form.brand, form.model, form.name].filter(Boolean).join(' ');
    if (!query) return;
    setFetching(true);
    setFetchMsg(null);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Find the complete technical datasheet specifications for the solar product: "${query}".
Return ONLY a JSON object with these fields (use null if unknown):
name, brand, model, power_watts, width_mm, height_mm, voc_v, isc_a, vmp_v, imp_a, capacity_kwh, description`,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string' },
          model: { type: 'string' },
          power_watts: { type: 'number' },
          width_mm: { type: 'number' },
          height_mm: { type: 'number' },
          voc_v: { type: 'number' },
          isc_a: { type: 'number' },
          vmp_v: { type: 'number' },
          imp_a: { type: 'number' },
          capacity_kwh: { type: 'number' },
          description: { type: 'string' },
        }
      }
    });
    const fields = ['name','brand','model','power_watts','width_mm','height_mm','voc_v','isc_a','vmp_v','imp_a','capacity_kwh','description'];
    let filled = 0;
    setForm(f => {
      const next = { ...f };
      fields.forEach(k => {
        if (result[k] != null && result[k] !== '') {
          next[k] = result[k];
          filled++;
        }
      });
      return next;
    });
    setFetchMsg(filled > 0 ? `✓ Fyllde i ${filled} fält automatiskt` : '⚠ Hittade ingen data — fyll i manuellt');
    setFetching(false);
  };

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
    const numOrNull = v => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : undefined;
    const data = { ...form, price: Number(form.price) || 0 };
    data.power_watts = numOrNull(form.power_watts);
    data.capacity_kwh = numOrNull(form.capacity_kwh);
    data.width_mm = numOrNull(form.width_mm);
    data.height_mm = numOrNull(form.height_mm);
    data.voc_v = numOrNull(form.voc_v);
    data.isc_a = numOrNull(form.isc_a);
    data.vmp_v = numOrNull(form.vmp_v);
    data.imp_a = numOrNull(form.imp_a);
    // Remove undefined keys to avoid sending invalid data
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

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

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAutoFetch}
              disabled={fetching || (!form.brand && !form.model && !form.name)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {fetching ? 'Hämtar data...' : 'Hämta data automatiskt'}
            </button>
            {fetchMsg && <span className={`text-xs ${fetchMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>{fetchMsg}</span>}
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
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="1134" />
                <Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="1762" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Elektriska data (för slingkontroll)</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Voc (V)" type="number" value={form.voc_v} onChange={v => set('voc_v', v)} placeholder="49.5" />
                  <Field label="Isc (A)" type="number" value={form.isc_a} onChange={v => set('isc_a', v)} placeholder="10.8" />
                  <Field label="Vmp (V)" type="number" value={form.vmp_v} onChange={v => set('vmp_v', v)} placeholder="41.8" />
                  <Field label="Imp (A)" type="number" value={form.imp_a} onChange={v => set('imp_a', v)} placeholder="9.93" />
                </div>
              </div>
            </>
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