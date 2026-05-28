import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Upload, Loader2, Sparkles, FileText, Trash2, AlertTriangle, CheckCircle2, Ruler, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildProductDescription, DOCUMENT_TYPE_LABELS, productDescription, productDocuments, productMeta } from '@/lib/productDocuments';

const categories = [
  { value: 'solpanel', label: 'Solpanel' },
  { value: 'batteri', label: 'Batteri' },
  { value: 'vaxelriktare', label: 'Växelriktare' },
  { value: 'optimerare', label: 'Optimerare' },
  { value: 'kabel', label: 'Kabel' },
  { value: 'montagesystem', label: 'Montagesystem' },
  { value: 'ovrigt', label: 'Övrigt' },
];

const DOCUMENT_UPLOAD_TYPES = [
  { type: 'datasheet', label: 'Datablad' },
  { type: 'manual', label: 'Manual' },
  { type: 'certificate', label: 'Certifikat' },
  { type: 'ce_approval', label: 'CE' },
  { type: 'installation_guide', label: 'Installationsguide' },
  { type: 'warranty', label: 'Garanti' },
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
const DOCUMENT_FIELDS = ['clampZoneMinMm', 'clampZoneMaxMm', 'railOffsetTopMm', 'railOffsetBottomMm', 'clampSource'];

function normalizeKey(...parts) {
  return parts.filter(Boolean).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n > 0 : value.trim().length > 0;
  }
  return true;
}

function requiredTechnicalFields(form = {}) {
  if (form.category === 'solpanel') {
    return [
      ['power_watts', 'effekt'],
      ['width_mm', 'bredd'],
      ['height_mm', 'höjd'],
      ['voc_v', 'Voc'],
      ['vmp_v', 'Vmp'],
      ['isc_a', 'Isc'],
      ['imp_a', 'Imp'],
    ];
  }
  if (form.category === 'vaxelriktare') {
    return [
      ['power_watts', 'AC-effekt'],
      ['max_dc_voltage_v', 'max DC-spänning'],
      ['startup_voltage_v', 'startspänning'],
      ['mppt_voltage_min_v', 'MPPT min'],
      ['mppt_voltage_max_v', 'MPPT max'],
      ['max_input_current_a', 'max ingångsström'],
      ['max_short_circuit_current_a', 'max kortslutningsström'],
    ];
  }
  if (form.category === 'batteri') {
    return [
      ['capacity_kwh', 'kapacitet'],
      ['width_mm', 'bredd'],
      ['height_mm', 'höjd'],
      ['weight_kg', 'vikt'],
    ];
  }
  return [];
}

function completenessFor(form = {}, documents = []) {
  const hasDatasheet = documents.some(doc => doc.type === 'datasheet');
  const hasManual = documents.some(doc => doc.type === 'manual');
  const missingTechnical = requiredTechnicalFields(form).filter(([key]) => !hasValue(form[key])).map(([, label]) => label);
  const needsClamp = form.category === 'solpanel';
  const clampOk = !needsClamp || (hasValue(form.clampZoneMinMm) && hasValue(form.clampZoneMaxMm));
  const docsOk = hasDatasheet && hasManual;
  const technicalOk = missingTechnical.length === 0;
  return {
    hasDatasheet,
    hasManual,
    docsOk,
    technicalOk,
    missingTechnical,
    needsClamp,
    clampOk,
    complete: docsOk && technicalOk && clampOk,
  };
}

function getAutoFetchConfig(category, query, docs) {
  const docList = docs.map(doc => `${doc.type}: ${doc.name} (${doc.file_url})`).join('\n');
  const baseInstruction = `Use ONLY these uploaded SolarPlan product documents. Do not use external websites or guessed public manuals. If a value is not present in the uploaded documents, return null.\n\nProduct: "${query}"\nUploaded documents:\n${docList || 'No documents uploaded.'}`;

  if (category === 'vaxelriktare') {
    return {
      prompt: `${baseInstruction}\n\nExtract inverter specifications. Return ONLY a JSON object. Fields:\nname, brand, model, power_watts, max_dc_power_kw, max_dc_voltage_v, startup_voltage_v, mppt_voltage_min_v, mppt_voltage_max_v, nominal_dc_voltage_v, mppt_count, strings_per_mppt, max_input_current_a, max_short_circuit_current_a, battery_supported, phase_type, inverter_type, description.`,
      fields: [...COMMON_FIELDS, ...INVERTER_FIELDS],
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' }, power_watts: { type: 'number' }, max_dc_power_kw: { type: 'number' }, max_dc_voltage_v: { type: 'number' }, startup_voltage_v: { type: 'number' }, mppt_voltage_min_v: { type: 'number' }, mppt_voltage_max_v: { type: 'number' }, nominal_dc_voltage_v: { type: 'number' }, mppt_count: { type: 'number' }, strings_per_mppt: { type: 'number' }, max_input_current_a: { type: 'number' }, max_short_circuit_current_a: { type: 'number' }, battery_supported: { type: 'boolean' }, phase_type: { type: 'string' }, inverter_type: { type: 'string' }, description: { type: 'string' },
        },
      },
    };
  }

  if (category === 'solpanel') {
    return {
      prompt: `${baseInstruction}\n\nExtract solar module specifications and module mounting/clamp-zone data. Return ONLY a JSON object. Fields:\nname, brand, model, power_watts, width_mm, height_mm, voc_v, isc_a, vmp_v, imp_a, temp_coeff_pmax_percent_c, temp_coeff_voc_percent_c, temp_coeff_isc_percent_c, noct_c, bifacial, description, clampZoneMinMm, clampZoneMaxMm, railOffsetTopMm, railOffsetBottomMm, clampSource.\n\nClamp-zone rules:\n- clampZoneMinMm and clampZoneMaxMm must come from the product manual/datasheet mounting section.\n- Do not calculate 10%/33% here unless the document explicitly states it.\n- clampSource should be the short document section/table name if found.`,
      fields: [...COMMON_FIELDS, ...PANEL_FIELDS],
      metaFields: DOCUMENT_FIELDS,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' }, power_watts: { type: 'number' }, width_mm: { type: 'number' }, height_mm: { type: 'number' }, voc_v: { type: 'number' }, isc_a: { type: 'number' }, vmp_v: { type: 'number' }, imp_a: { type: 'number' }, temp_coeff_pmax_percent_c: { type: 'number' }, temp_coeff_voc_percent_c: { type: 'number' }, temp_coeff_isc_percent_c: { type: 'number' }, noct_c: { type: 'number' }, bifacial: { type: 'boolean' }, description: { type: 'string' }, clampZoneMinMm: { type: 'number' }, clampZoneMaxMm: { type: 'number' }, railOffsetTopMm: { type: 'number' }, railOffsetBottomMm: { type: 'number' }, clampSource: { type: 'string' },
        },
      },
    };
  }

  return {
    prompt: `${baseInstruction}\n\nExtract technical datasheet specifications. Return ONLY a JSON object with fields: name, brand, model, power_watts, width_mm, height_mm, voc_v, isc_a, vmp_v, imp_a, capacity_kwh, description`,
    fields: ['name','brand','model','power_watts','width_mm','height_mm','voc_v','isc_a','vmp_v','imp_a','capacity_kwh','description'],
    schema: { type: 'object', properties: { name: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' }, power_watts: { type: 'number' }, width_mm: { type: 'number' }, height_mm: { type: 'number' }, voc_v: { type: 'number' }, isc_a: { type: 'number' }, vmp_v: { type: 'number' }, imp_a: { type: 'number' }, capacity_kwh: { type: 'number' }, description: { type: 'string' } } },
  };
}

export default function ProductFormModal({ product, onSave, onClose }) {
  const meta = productMeta(product || {});
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
    weight_kg: product?.weight_kg || '',
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
    description: productDescription(product || {}),
    image_url: product?.image_url || '',
    clampZoneMinMm: meta.clampZoneMinMm || '',
    clampZoneMaxMm: meta.clampZoneMaxMm || '',
    railOffsetTopMm: meta.railOffsetTopMm || '',
    railOffsetBottomMm: meta.railOffsetBottomMm || '',
    clampSource: meta.clampSource || '',
  });
  const [documents, setDocuments] = useState(() => productDocuments(product || {}));
  const [uploading, setUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const autoFetchedInverterKeyRef = useRef(product?.category === 'vaxelriktare' ? normalizeKey(product?.brand, product?.model) : '');
  const status = useMemo(() => completenessFor(form, documents), [form, documents]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAutoFetch = async ({ automatic = false, categoryOverride, queryOverride } = {}) => {
    const activeCategory = categoryOverride || form.category;
    const query = queryOverride || [form.brand, form.model, form.name].filter(Boolean).join(' ');
    if (!query) return;
    if (!documents.length) {
      setFetchMsg('⚠ Lägg först upp manual/datablad. Data hämtas inte från externa länkar.');
      return;
    }

    setFetching(true);
    setFetchMsg(automatic ? 'Hämtar data från uppladdade dokument...' : null);

    try {
      const config = getAutoFetchConfig(activeCategory, query, documents);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: config.prompt,
        add_context_from_internet: false,
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
        (config.metaFields || []).forEach(k => {
          if (result?.[k] != null && result[k] !== '') {
            next[k] = result[k];
            filled++;
          }
        });
        if (activeCategory === 'vaxelriktare') autoFetchedInverterKeyRef.current = normalizeKey(result?.brand || next.brand, result?.model || next.model);
        return next;
      });
      setFetchMsg(filled > 0 ? `✓ Fyllde i ${filled} fält från uppladdade dokument` : '⚠ Dokumenten saknar läsbar teknisk data — fyll i manuellt');
    } catch (error) {
      console.error('Document data fetch failed', error);
      setFetchMsg('⚠ Kunde inte läsa data från dokumenten automatiskt');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (form.category !== 'vaxelriktare') return;
    if (!form.brand?.trim() || !form.model?.trim()) return;
    if (fetching || !documents.length) return;
    const key = normalizeKey(form.brand, form.model);
    if (!key || key === autoFetchedInverterKeyRef.current) return;
    const timer = window.setTimeout(() => {
      autoFetchedInverterKeyRef.current = key;
      handleAutoFetch({ automatic: true, categoryOverride: 'vaxelriktare', queryOverride: `${form.brand.trim()} ${form.model.trim()}` });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [form.category, form.brand, form.model, fetching, documents.length]);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set('image_url', file_url);
    setUploading(false);
  };

  const handleDocumentUpload = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocUploading(type);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setDocuments(current => [
        ...current.filter(doc => !(doc.type === type && doc.name === file.name)),
        { id: `${Date.now()}-${type}`, type, name: file.name, title: file.name, file_name: file.name, file_url, uploadedAt: new Date().toISOString(), uploaded_at: new Date().toISOString() },
      ]);
      setFetchMsg('✓ Dokument uppladdat. Tryck Hämta från uppladdade dokument för att fylla tekniska data.');
    } finally {
      setDocUploading(null);
      event.target.value = '';
    }
  };

  const removeDocument = id => setDocuments(current => current.filter(doc => doc.id !== id));

  const handleSave = async () => {
    setSaving(true);
    const numOrNull = v => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : undefined;
    const metaPatch = {
      documents,
      clampZoneMinMm: numOrNull(form.clampZoneMinMm),
      clampZoneMaxMm: numOrNull(form.clampZoneMaxMm),
      railOffsetTopMm: numOrNull(form.railOffsetTopMm),
      railOffsetBottomMm: numOrNull(form.railOffsetBottomMm),
      clampSource: form.clampSource || '',
    };
    Object.keys(metaPatch).forEach(k => metaPatch[k] === undefined && delete metaPatch[k]);

    const data = {
      ...form,
      price: Number(form.price) || 0,
      description: buildProductDescription(form.description, metaPatch),
    };

    [
      'power_watts','capacity_kwh','width_mm','height_mm','weight_kg','voc_v','isc_a','vmp_v','imp_a','temp_coeff_pmax_percent_c','temp_coeff_voc_percent_c','temp_coeff_isc_percent_c','noct_c','max_dc_power_kw','max_dc_voltage_v','startup_voltage_v','mppt_voltage_min_v','mppt_voltage_max_v','nominal_dc_voltage_v','mppt_count','strings_per_mppt','max_input_current_a','max_short_circuit_current_a',
    ].forEach(k => { data[k] = numOrNull(form[k]); });

    ['clampZoneMinMm','clampZoneMaxMm','railOffsetTopMm','railOffsetBottomMm','clampSource'].forEach(k => delete data[k]);
    data.bifacial = Boolean(form.bifacial);
    data.battery_supported = Boolean(form.battery_supported);
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    if (product?.id) await base44.entities.Product.update(product.id, data);
    else await base44.entities.Product.create(data);
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">{product ? 'Redigera produkt' : 'Ny produkt'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button key={c.value} onClick={() => { set('category', c.value); if (c.value !== 'vaxelriktare') autoFetchedInverterKeyRef.current = ''; }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.category === c.value ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary/50 text-muted-foreground'}`}>{c.label}</button>
              ))}
            </div>
          </div>

          <ProductCompletenessBox status={status} />

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Produkter ska ha både datablad och manual uppladdade. Teknisk data och klämzon ska hämtas från dessa dokument, inte från externa länkar.
          </div>

          <Field label="Produktnamn *" value={form.name} onChange={v => set('name', v)} placeholder={form.category === 'vaxelriktare' ? 'Fylls från dokument eller manuellt' : 'T.ex. JA Solar 415W'} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Varumärke" value={form.brand} onChange={v => set('brand', v)} placeholder="T.ex. LONGi" />
            <Field label="Modell" value={form.model} onChange={v => set('model', v)} placeholder="T.ex. LR5-72HPH" />
          </div>

          <DocumentUploadBlock documents={documents} hasDatasheet={status.hasDatasheet} hasManual={status.hasManual} docUploading={docUploading} onUpload={handleDocumentUpload} onRemove={removeDocument} />

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => handleAutoFetch()} disabled={fetching || (!form.brand && !form.model && !form.name) || !documents.length} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">
              {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {fetching ? 'Hämtar data...' : 'Hämta från uppladdade dokument'}
            </button>
            {fetchMsg && <span className={`text-xs ${fetchMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>{fetchMsg}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pris (SEK) *" type="number" value={form.price} onChange={v => set('price', v)} placeholder="0" />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enhet</label>
              <Select value={form.unit} onValueChange={v => set('unit', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="st">st</SelectItem><SelectItem value="m">m</SelectItem><SelectItem value="set">set</SelectItem><SelectItem value="paket">paket</SelectItem></SelectContent></Select>
            </div>
          </div>

          {(form.category === 'solpanel' || form.category === 'vaxelriktare' || form.category === 'optimerare') && <Field label={form.category === 'vaxelriktare' ? 'Nominell AC-effekt (W)' : 'Effekt (W)'} type="number" value={form.power_watts} onChange={v => set('power_watts', v)} placeholder={form.category === 'vaxelriktare' ? '15000' : '415'} />}
          {form.category === 'batteri' && <Field label="Kapacitet (kWh)" type="number" value={form.capacity_kwh} onChange={v => set('capacity_kwh', v)} placeholder="10" />}

          {form.category === 'solpanel' && (
            <>
              <div className="grid grid-cols-2 gap-3"><Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="1134" /><Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="1762" /></div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Elektriska data (för slingkontroll)</label>
                <div className="grid grid-cols-2 gap-3"><Field label="Voc (V)" type="number" value={form.voc_v} onChange={v => set('voc_v', v)} placeholder="49.5" /><Field label="Isc (A)" type="number" value={form.isc_a} onChange={v => set('isc_a', v)} placeholder="10.8" /><Field label="Vmp (V)" type="number" value={form.vmp_v} onChange={v => set('vmp_v', v)} placeholder="41.8" /><Field label="Imp (A)" type="number" value={form.imp_a} onChange={v => set('imp_a', v)} placeholder="9.93" /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Temperaturdata</label>
                <div className="grid grid-cols-2 gap-3"><Field label="Tempkoeff. Pmax (%/°C)" type="number" value={form.temp_coeff_pmax_percent_c} onChange={v => set('temp_coeff_pmax_percent_c', v)} placeholder="-0.35" /><Field label="Tempkoeff. Voc (%/°C)" type="number" value={form.temp_coeff_voc_percent_c} onChange={v => set('temp_coeff_voc_percent_c', v)} placeholder="-0.27" /><Field label="Tempkoeff. Isc (%/°C)" type="number" value={form.temp_coeff_isc_percent_c} onChange={v => set('temp_coeff_isc_percent_c', v)} placeholder="0.05" /><Field label="NOCT/NMOT (°C)" type="number" value={form.noct_c} onChange={v => set('noct_c', v)} placeholder="45" /></div>
                <BooleanToggle label="Bifacial panel" checked={form.bifacial} onChange={v => set('bifacial', v)} />
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                <div><p className="text-sm font-semibold text-blue-900">Klämzon från panelens manual/datablad</p><p className="text-xs text-blue-800">Detta ersätter det gamla fasta värdet. Lämna tomt om dokumentet inte anger zonen.</p></div>
                <div className="grid grid-cols-2 gap-3"><Field label="Klämzon min (mm)" type="number" value={form.clampZoneMinMm} onChange={v => set('clampZoneMinMm', v)} placeholder="t.ex. 260" /><Field label="Klämzon max (mm)" type="number" value={form.clampZoneMaxMm} onChange={v => set('clampZoneMaxMm', v)} placeholder="t.ex. 520" /></div>
                <div className="grid grid-cols-2 gap-3"><Field label="Skena från överkant (mm)" type="number" value={form.railOffsetTopMm} onChange={v => set('railOffsetTopMm', v)} placeholder="valfritt" /><Field label="Skena från underkant (mm)" type="number" value={form.railOffsetBottomMm} onChange={v => set('railOffsetBottomMm', v)} placeholder="valfritt" /></div>
                <Field label="Källa i dokument" value={form.clampSource} onChange={v => set('clampSource', v)} placeholder="T.ex. Installation manual, Mounting methods" />
              </div>
            </>
          )}

          {form.category === 'vaxelriktare' && (
            <>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Växelriktardata</label><div className="grid grid-cols-2 gap-3"><Field label="Max DC-effekt (kW)" type="number" value={form.max_dc_power_kw} onChange={v => set('max_dc_power_kw', v)} placeholder="22.5" /><Field label="Max DC-spänning (V)" type="number" value={form.max_dc_voltage_v} onChange={v => set('max_dc_voltage_v', v)} placeholder="1000" /><Field label="Startspänning (V)" type="number" value={form.startup_voltage_v} onChange={v => set('startup_voltage_v', v)} placeholder="180" /><Field label="Nominell DC-spänning (V)" type="number" value={form.nominal_dc_voltage_v} onChange={v => set('nominal_dc_voltage_v', v)} placeholder="640" /></div></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">MPPT och strömgränser</label><div className="grid grid-cols-2 gap-3"><Field label="MPPT min (V)" type="number" value={form.mppt_voltage_min_v} onChange={v => set('mppt_voltage_min_v', v)} placeholder="160" /><Field label="MPPT max (V)" type="number" value={form.mppt_voltage_max_v} onChange={v => set('mppt_voltage_max_v', v)} placeholder="950" /><Field label="Antal MPPT" type="number" value={form.mppt_count} onChange={v => set('mppt_count', v)} placeholder="2" /><Field label="Strängar per MPPT" type="number" value={form.strings_per_mppt} onChange={v => set('strings_per_mppt', v)} placeholder="1" /><Field label="Max ingångsström (A)" type="number" value={form.max_input_current_a} onChange={v => set('max_input_current_a', v)} placeholder="16" /><Field label="Max kortslutningsström (A)" type="number" value={form.max_short_circuit_current_a} onChange={v => set('max_short_circuit_current_a', v)} placeholder="20" /></div></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Typ och system</label><div className="grid grid-cols-2 gap-3"><Field label="Fas" value={form.phase_type} onChange={v => set('phase_type', v)} placeholder="3-fas" /><Field label="Växelriktartyp" value={form.inverter_type} onChange={v => set('inverter_type', v)} placeholder="Hybrid" /></div><BooleanToggle label="Batteristöd / hybrid" checked={form.battery_supported} onChange={v => set('battery_supported', v)} /></div>
            </>
          )}

          {form.category === 'batteri' && (
            <div className="grid grid-cols-2 gap-3"><Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="valfritt" /><Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="valfritt" /><Field label="Vikt (kg)" type="number" value={form.weight_kg} onChange={v => set('weight_kg', v)} placeholder="valfritt" /></div>
          )}

          <Field label="Beskrivning" value={form.description} onChange={v => set('description', v)} placeholder="Valfri beskrivning..." multiline />

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Produktbild</label>
            {form.image_url ? <div className="relative"><img src={form.image_url} alt="" className="w-full h-28 object-contain bg-muted rounded-xl" /><button onClick={() => set('image_url', '')} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"><X className="w-3 h-3" /></button></div> : <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">{uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <><Upload className="w-4 h-4 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground">Ladda upp bild</span></>}<input type="file" className="hidden" accept="image/*" onChange={handleImage} /></label>}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Avbryt</button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.price} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{product ? 'Spara ändringar' : 'Lägg till'}</button>
        </div>
      </div>
    </div>
  );
}

function ProductCompletenessBox({ status }) {
  const missing = [];
  if (!status.hasDatasheet) missing.push('Datablad saknas');
  if (!status.hasManual) missing.push('Manual saknas');
  if (!status.technicalOk) missing.push(`Teknisk data saknas: ${status.missingTechnical.join(', ')}`);
  if (status.needsClamp && !status.clampOk) missing.push('Klämzon saknas från manual/datablad');

  return (
    <div className={`rounded-xl border p-3 ${status.complete ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {status.complete ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
          {status.complete ? 'Produkten är komplett' : 'Produkten är ofullständig'}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill ok={status.hasDatasheet} label="Datablad" />
          <StatusPill ok={status.hasManual} label="Manual" />
          <StatusPill ok={status.technicalOk} label="Teknisk data" icon={Zap} />
          {status.needsClamp && <StatusPill ok={status.clampOk} label="Klämzon" icon={Ruler} />}
        </div>
      </div>
      {missing.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">{missing.map(item => <li key={item}>{item}</li>)}</ul>}
      {!status.complete && <p className="mt-2 text-xs">Produkten kan sparas, men bör inte användas i projekt förrän kraven är kompletta.</p>}
    </div>
  );
}

function DocumentUploadBlock({ documents, hasDatasheet, hasManual, docUploading, onUpload, onRemove }) {
  return (
    <div className="rounded-xl border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">Produktdokument</p><p className="text-xs text-muted-foreground">Krav: minst ett datablad och en manual per produkt. Certifikat/CE kan läggas till som stödjande dokument.</p></div>
        <div className="flex gap-2"><StatusPill ok={hasDatasheet} label="Datablad" /><StatusPill ok={hasManual} label="Manual" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DOCUMENT_UPLOAD_TYPES.map(item => (
          <label key={item.type} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs hover:border-primary/60">
            {docUploading === item.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Ladda upp {item.label.toLowerCase()}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={event => onUpload(event, item.type)} />
          </label>
        ))}
      </div>
      {documents.length > 0 && <div className="space-y-2">{documents.map(doc => <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"><div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate"><b>{DOCUMENT_TYPE_LABELS[doc.type] || 'Dokument'}:</b> {doc.name}</span></div><button type="button" onClick={() => onRemove(doc.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    </div>
  );
}

function StatusPill({ ok, label, icon: Icon }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{Icon && <Icon className="h-3 w-3" />}{label}: {ok ? 'OK' : 'Saknas'}</span>;
}

function BooleanToggle({ label, checked, onChange }) {
  return <button type="button" onClick={() => onChange(!checked)} className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}><span className={`h-3 w-3 rounded-full ${checked ? 'bg-primary' : 'bg-muted-foreground/40'}`} />{label}: {checked ? 'Ja' : 'Nej'}</button>;
}

function Field({ label, value, onChange, placeholder, type = 'text', multiline }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {multiline ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />}
    </div>
  );
}
