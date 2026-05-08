import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Upload, Loader2, Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const categories = [
  { value: 'solpanel', label: 'Solpanel' },
  { value: 'batteri', label: 'Batteri' },
  { value: 'vaxelriktare', label: 'Växelriktare' },
  { value: 'optimerare', label: 'Optimerare' },
  { value: 'kabel', label: 'Kabel' },
  { value: 'montagesystem', label: 'Montagesystem' },
  { value: 'ovrigt', label: 'Övrigt' },
];

const COMMON_FIELDS = ['name', 'brand', 'model', 'power_watts', 'capacity_kwh', 'description'];
const PANEL_FIELDS = ['width_mm', 'height_mm', 'voc_v', 'isc_a', 'vmp_v', 'imp_a', 'temp_coeff_pmax_percent_c', 'temp_coeff_voc_percent_c', 'temp_coeff_isc_percent_c', 'noct_c', 'bifacial'];
const INVERTER_FIELDS = [
  'max_dc_power_kw',
  'max_dc_voltage_v',
  'startup_voltage_v',
  'mppt_voltage_min_v',
  'mppt_voltage_max_v',
  'nominal_dc_voltage_v',
  'mppt_count',
  'strings_per_mppt',
  'max_input_current_a',
  'max_short_circuit_current_a',
  'battery_supported',
  'phase_type',
  'inverter_type',
];

function normalizeKey(...parts) {
  return parts.filter(Boolean).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getAutoFetchConfig(category, query) {
  if (category === 'vaxelriktare') {
    return {
      prompt: `Find the complete official datasheet specifications for this photovoltaic inverter: "${query}".
Prioritize manufacturer datasheets and product manuals. Return ONLY a JSON object. Use null if unknown.
Fields:
name, brand, model, power_watts, max_dc_power_kw, max_dc_voltage_v, startup_voltage_v, mppt_voltage_min_v, mppt_voltage_max_v, nominal_dc_voltage_v, mppt_count, strings_per_mppt, max_input_current_a, max_short_circuit_current_a, battery_supported, phase_type, inverter_type, description.

Important unit rules:
- power_watts = nominal AC power in watts.
- max_dc_power_kw = maximum PV/DC input power in kW.
- voltage fields are volts.
- current fields are amperes per MPPT/input according to datasheet.
- mppt_count and strings_per_mppt must be numbers.
- battery_supported must be true or false.
- phase_type should be for example "1-fas" or "3-fas".
- inverter_type should be for example "String", "Hybrid", "Mikro", or "Hybrid-ready".`,
      fields: [...COMMON_FIELDS, ...INVERTER_FIELDS],
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string' },
          model: { type: 'string' },
          power_watts: { type: 'number' },
          max_dc_power_kw: { type: 'number' },
          max_dc_voltage_v: { type: 'number' },
          startup_voltage_v: { type: 'number' },
          mppt_voltage_min_v: { type: 'number' },
          mppt_voltage_max_v: { type: 'number' },
          nominal_dc_voltage_v: { type: 'number' },
          mppt_count: { type: 'number' },
          strings_per_mppt: { type: 'number' },
          max_input_current_a: { type: 'number' },
          max_short_circuit_current_a: { type: 'number' },
          battery_supported: { type: 'boolean' },
          phase_type: { type: 'string' },
          inverter_type: { type: 'string' },
          description: { type: 'string' },
        },
      },
    };
  }

  if (category === 'solpanel') {
    return {
      prompt: `Find the complete official datasheet specifications for this photovoltaic solar panel/module: "${query}".
Prioritize manufacturer datasheets. Return ONLY a JSON object. Use null if unknown.
Fields:
name, brand, model, power_watts, width_mm, height_mm, voc_v, isc_a, vmp_v, imp_a, temp_coeff_pmax_percent_c, temp_coeff_voc_percent_c, temp_coeff_isc_percent_c, noct_c, bifacial, description.

Important unit rules:
- power_watts = STC module power in watts.
- width_mm and height_mm are module dimensions in millimeters.
- voc_v, vmp_v are volts.
- isc_a, imp_a are amperes.
- temperature coefficients are percent per °C, for example -0.35.
- noct_c is °C.
- bifacial must be true or false.`,
      fields: [...COMMON_FIELDS, ...PANEL_FIELDS],
      schema: {
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
          temp_coeff_pmax_percent_c: { type: 'number' },
          temp_coeff_voc_percent_c: { type: 'number' },
          temp_coeff_isc_percent_c: { type: 'number' },
          noct_c: { type: 'number' },
          bifacial: { type: 'boolean' },
          description: { type: 'string' },
        },
      },
    };
  }

  return {
    prompt: `Find the complete technical datasheet specifications for this solar product: "${query}".
Return ONLY a JSON object with these fields. Use null if unknown:
name, brand, model, power_watts, width_mm, height_mm, voc_v, isc_a, vmp_v, imp_a, capacity_kwh, description`,
    fields: ['name','brand','model','power_watts','width_mm','height_mm','voc_v','isc_a','vmp_v','imp_a','capacity_kwh','description'],
    schema: {
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
      },
    },
  };
}

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
    temp_coeff_pmax_percent_c: product?.temp_coeff_pmax_percent_c || '',
    temp_coeff_voc_percent_c: product?.temp_coeff_voc_percent_c || '',
    temp_coeff_isc_percent_c: product?.temp_coeff_isc_percent_c || '',
    noct_c: product?.noct_c || '',
    bifacial: product?.bifacial ?? false,
    max_dc_power_kw: product?.max_dc_power_kw || '',
    max_dc_voltage_v: product?.max_dc_voltage_v || '',
    startup_voltage_v: product?.startup_voltage_v || '',
    mppt_voltage_min_v: product?.mppt_voltage_min_v || '',
    mppt_voltage_max_v: product?.mppt_voltage_max_v || '',
    nominal_dc_voltage_v: product?.nominal_dc_voltage_v || '',
    mppt_count: product?.mppt_count || '',
    strings_per_mppt: product?.strings_per_mppt || '',
    max_input_current_a: product?.max_input_current_a || '',
    max_short_circuit_current_a: product?.max_short_circuit_current_a || '',
    battery_supported: product?.battery_supported ?? false,
    phase_type: product?.phase_type || '',
    inverter_type: product?.inverter_type || '',
    description: product?.description || '',
    image_url: product?.image_url || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const autoFetchedInverterKeyRef = useRef(product?.category === 'vaxelriktare' ? normalizeKey(product?.brand, product?.model) : '');

  const handleAutoFetch = async ({ automatic = false, categoryOverride, queryOverride } = {}) => {
    const activeCategory = categoryOverride || form.category;
    const query = queryOverride || [form.brand, form.model, form.name].filter(Boolean).join(' ');
    if (!query) return;

    setFetching(true);
    setFetchMsg(automatic ? 'Hämtar växelriktardata automatiskt...' : null);

    try {
      const config = getAutoFetchConfig(activeCategory, query);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: config.prompt,
        add_context_from_internet: true,
        response_json_schema: config.schema,
      });

      let filled = 0;
      setForm(f => {
        const next = { ...f };
        config.fields.forEach(k => {
          if (result?.[k] != null && result[k] !== '') {
            next[k] = result[k];
            filled++;
          }
        });

        if (activeCategory === 'vaxelriktare') {
          autoFetchedInverterKeyRef.current = normalizeKey(result?.brand || next.brand, result?.model || next.model);
        }

        return next;
      });
      setFetchMsg(filled > 0 ? `✓ Fyllde i ${filled} fält automatiskt` : '⚠ Hittade ingen data — fyll i manuellt');
    } catch (error) {
      console.error('Auto fetch failed', error);
      setFetchMsg('⚠ Kunde inte hämta data automatiskt');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (form.category !== 'vaxelriktare') return;
    if (!form.brand?.trim() || !form.model?.trim()) return;
    if (fetching) return;

    const key = normalizeKey(form.brand, form.model);
    if (!key || key === autoFetchedInverterKeyRef.current) return;

    const timer = window.setTimeout(() => {
      autoFetchedInverterKeyRef.current = key;
      handleAutoFetch({
        automatic: true,
        categoryOverride: 'vaxelriktare',
        queryOverride: `${form.brand.trim()} ${form.model.trim()}`,
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [form.category, form.brand, form.model, fetching]);

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

    [
      'power_watts',
      'capacity_kwh',
      'width_mm',
      'height_mm',
      'voc_v',
      'isc_a',
      'vmp_v',
      'imp_a',
      'temp_coeff_pmax_percent_c',
      'temp_coeff_voc_percent_c',
      'temp_coeff_isc_percent_c',
      'noct_c',
      'max_dc_power_kw',
      'max_dc_voltage_v',
      'startup_voltage_v',
      'mppt_voltage_min_v',
      'mppt_voltage_max_v',
      'nominal_dc_voltage_v',
      'mppt_count',
      'strings_per_mppt',
      'max_input_current_a',
      'max_short_circuit_current_a',
    ].forEach(k => {
      data[k] = numOrNull(form[k]);
    });

    data.bifacial = Boolean(form.bifacial);
    data.battery_supported = Boolean(form.battery_supported);

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
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">{product ? 'Redigera produkt' : 'Ny produkt'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button
                  key={c.value}
                  onClick={() => {
                    set('category', c.value);
                    if (c.value !== 'vaxelriktare') autoFetchedInverterKeyRef.current = '';
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${form.category === c.value ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary/50 text-muted-foreground'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Produktnamn *" value={form.name} onChange={v => set('name', v)} placeholder={form.category === 'vaxelriktare' ? 'Fylls automatiskt efter märke + modell' : 'T.ex. JA Solar 415W'} />
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Varumärke" value={form.brand} onChange={v => set('brand', v)} placeholder={form.category === 'vaxelriktare' ? 'T.ex. SolaX' : 'T.ex. JA Solar'} />
            <Field label="Modell" value={form.model} onChange={v => set('model', v)} placeholder={form.category === 'vaxelriktare' ? 'T.ex. X3-Hybrid-15.0-D G4' : 'T.ex. JAM54S30'} />
          </div>

          {form.category === 'vaxelriktare' && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Skriv in varumärke och modell. När båda fälten är ifyllda hämtas teknisk växelriktardata automatiskt.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleAutoFetch()}
              disabled={fetching || (!form.brand && !form.model && !form.name)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {fetching ? 'Hämtar data...' : form.category === 'vaxelriktare' ? 'Hämta igen' : 'Hämta data automatiskt'}
            </button>
            {fetchMsg && <span className={`text-xs ${fetchMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>{fetchMsg}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pris (SEK) *" type="number" value={form.price} onChange={v => set('price', v)} placeholder="0" />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enhet</label>
              <Select value={form.unit} onValueChange={v => set('unit', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="st">st</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                  <SelectItem value="set">set</SelectItem>
                  <SelectItem value="paket">paket</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(form.category === 'solpanel' || form.category === 'vaxelriktare' || form.category === 'optimerare') && (
            <Field label={form.category === 'vaxelriktare' ? 'Nominell AC-effekt (W)' : 'Effekt (W)'} type="number" value={form.power_watts} onChange={v => set('power_watts', v)} placeholder={form.category === 'vaxelriktare' ? '15000' : '415'} />
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
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Temperaturdata</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tempkoeff. Pmax (%/°C)" type="number" value={form.temp_coeff_pmax_percent_c} onChange={v => set('temp_coeff_pmax_percent_c', v)} placeholder="-0.35" />
                  <Field label="Tempkoeff. Voc (%/°C)" type="number" value={form.temp_coeff_voc_percent_c} onChange={v => set('temp_coeff_voc_percent_c', v)} placeholder="-0.27" />
                  <Field label="Tempkoeff. Isc (%/°C)" type="number" value={form.temp_coeff_isc_percent_c} onChange={v => set('temp_coeff_isc_percent_c', v)} placeholder="0.05" />
                  <Field label="NOCT/NMOT (°C)" type="number" value={form.noct_c} onChange={v => set('noct_c', v)} placeholder="45" />
                </div>
                <BooleanToggle label="Bifacial panel" checked={form.bifacial} onChange={v => set('bifacial', v)} />
              </div>
            </>
          )}

          {form.category === 'vaxelriktare' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Växelriktardata</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max DC-effekt (kW)" type="number" value={form.max_dc_power_kw} onChange={v => set('max_dc_power_kw', v)} placeholder="22.5" />
                  <Field label="Max DC-spänning (V)" type="number" value={form.max_dc_voltage_v} onChange={v => set('max_dc_voltage_v', v)} placeholder="1000" />
                  <Field label="Startspänning (V)" type="number" value={form.startup_voltage_v} onChange={v => set('startup_voltage_v', v)} placeholder="180" />
                  <Field label="Nominell DC-spänning (V)" type="number" value={form.nominal_dc_voltage_v} onChange={v => set('nominal_dc_voltage_v', v)} placeholder="640" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">MPPT och strömgränser</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="MPPT min (V)" type="number" value={form.mppt_voltage_min_v} onChange={v => set('mppt_voltage_min_v', v)} placeholder="160" />
                  <Field label="MPPT max (V)" type="number" value={form.mppt_voltage_max_v} onChange={v => set('mppt_voltage_max_v', v)} placeholder="950" />
                  <Field label="Antal MPPT" type="number" value={form.mppt_count} onChange={v => set('mppt_count', v)} placeholder="2" />
                  <Field label="Strängar per MPPT" type="number" value={form.strings_per_mppt} onChange={v => set('strings_per_mppt', v)} placeholder="1" />
                  <Field label="Max ingångsström (A)" type="number" value={form.max_input_current_a} onChange={v => set('max_input_current_a', v)} placeholder="16" />
                  <Field label="Max kortslutningsström (A)" type="number" value={form.max_short_circuit_current_a} onChange={v => set('max_short_circuit_current_a', v)} placeholder="20" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Typ och system</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fas" value={form.phase_type} onChange={v => set('phase_type', v)} placeholder="3-fas" />
                  <Field label="Växelriktartyp" value={form.inverter_type} onChange={v => set('inverter_type', v)} placeholder="Hybrid" />
                </div>
                <BooleanToggle label="Batteristöd / hybrid" checked={form.battery_supported} onChange={v => set('battery_supported', v)} />
              </div>
            </>
          )}

          <Field label="Beskrivning" value={form.description} onChange={v => set('description', v)} placeholder="Valfri beskrivning..." multiline />

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

function BooleanToggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
    >
      <span className={`h-3 w-3 rounded-full ${checked ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
      {label}: {checked ? 'Ja' : 'Nej'}
    </button>
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
