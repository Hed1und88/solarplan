import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Upload, Loader2, Sparkles, FileText, Trash2, AlertTriangle, CheckCircle2, Ruler, Zap, Battery } from 'lucide-react';
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
const INVERTER_FIELDS = ['max_dc_power_kw','max_dc_voltage_v','startup_voltage_v','mppt_voltage_min_v','mppt_voltage_max_v','nominal_dc_voltage_v','mppt_count','strings_per_mppt','max_input_current_a','max_short_circuit_current_a','battery_supported','phase_type','inverter_type'];
const PANEL_META_FIELDS = ['clampZoneMinMm', 'clampZoneMaxMm', 'railOffsetTopMm', 'railOffsetBottomMm', 'clampSource'];
const BATTERY_FIELDS = ['module_capacity_kwh','usable_capacity_kwh','dod_percent','modules_count','max_modules_per_stack','max_battery_modules','depth_mm','module_weight_kg','base_weight_kg','bms_weight_kg','clearance_front_mm','clearance_back_mm','clearance_side_mm','clearance_top_mm','clearance_bottom_mm','installation_location','ip_rating'];
const BATTERY_AUTO_FIELDS = ['name', 'brand', 'model', 'capacity_kwh', 'width_mm', 'height_mm', 'weight_kg', 'description', ...BATTERY_FIELDS];

const FIELD_LABELS = {
  name: 'produktnamn', brand: 'varumärke', model: 'modell', power_watts: 'effekt', capacity_kwh: 'nominell kWh', description: 'beskrivning',
  width_mm: 'bredd', height_mm: 'höjd', depth_mm: 'djup', weight_kg: 'vikt',
  voc_v: 'Voc', isc_a: 'Isc', vmp_v: 'Vmp', imp_a: 'Imp', temp_coeff_pmax_percent_c: 'tempkoeff. Pmax', temp_coeff_voc_percent_c: 'tempkoeff. Voc', temp_coeff_isc_percent_c: 'tempkoeff. Isc', noct_c: 'NOCT/NMOT', bifacial: 'bifacial',
  clampZoneMinMm: 'klämzon min', clampZoneMaxMm: 'klämzon max', railOffsetTopMm: 'skena från överkant', railOffsetBottomMm: 'skena från underkant', clampSource: 'källa för klämzon',
  module_capacity_kwh: 'kWh per modul', usable_capacity_kwh: 'användbar kWh', dod_percent: 'DoD %', modules_count: 'antal moduler', max_modules_per_stack: 'max moduler i stapel', max_battery_modules: 'max moduler totalt', module_weight_kg: 'modulvikt', base_weight_kg: 'basvikt', bms_weight_kg: 'BMS vikt', clearance_front_mm: 'avstånd framför', clearance_back_mm: 'avstånd bakom', clearance_side_mm: 'sidavstånd', clearance_top_mm: 'avstånd ovanför', clearance_bottom_mm: 'avstånd under', installation_location: 'installationsplats', ip_rating: 'IP-klass',
  max_dc_power_kw: 'max DC-effekt', max_dc_voltage_v: 'max DC-spänning', startup_voltage_v: 'startspänning', mppt_voltage_min_v: 'MPPT min', mppt_voltage_max_v: 'MPPT max', nominal_dc_voltage_v: 'nominell DC-spänning', mppt_count: 'antal MPPT', strings_per_mppt: 'strängar per MPPT', max_input_current_a: 'max ingångsström', max_short_circuit_current_a: 'max kortslutningsström', battery_supported: 'batteristöd', phase_type: 'fas', inverter_type: 'växelriktartyp',
};

function normalizeKey(...parts) {
  return parts.filter(Boolean).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

function labelFor(field) {
  return FIELD_LABELS[field] || field;
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

function numValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calculatedUsableKwh(form = {}) {
  const explicit = numValue(form.usable_capacity_kwh);
  if (explicit && explicit > 0) return explicit;
  const capacity = numValue(form.capacity_kwh);
  const dod = numValue(form.dod_percent) || 90;
  if (!capacity || capacity <= 0) return '';
  return Math.round(capacity * dod) / 100;
}

function requiredTechnicalFields(form = {}) {
  if (form.category === 'solpanel') {
    return [['power_watts', 'effekt'], ['width_mm', 'bredd'], ['height_mm', 'höjd'], ['voc_v', 'Voc'], ['vmp_v', 'Vmp'], ['isc_a', 'Isc'], ['imp_a', 'Imp']];
  }
  if (form.category === 'vaxelriktare') {
    return [['power_watts', 'AC-effekt'], ['max_dc_voltage_v', 'max DC-spänning'], ['startup_voltage_v', 'startspänning'], ['mppt_voltage_min_v', 'MPPT min'], ['mppt_voltage_max_v', 'MPPT max'], ['max_input_current_a', 'max ingångsström'], ['max_short_circuit_current_a', 'max kortslutningsström']];
  }
  if (form.category === 'batteri') {
    return [['capacity_kwh', 'nominell kWh'], ['module_capacity_kwh', 'kWh per modul'], ['max_modules_per_stack', 'max moduler i stapel'], ['width_mm', 'bredd'], ['height_mm', 'höjd'], ['depth_mm', 'djup'], ['clearance_side_mm', 'sidavstånd'], ['clearance_top_mm', 'avstånd ovanför']];
  }
  return [];
}

function completenessFor(form = {}, documents = []) {
  const hasDatasheet = documents.some(doc => doc.type === 'datasheet');
  const hasManual = documents.some(doc => doc.type === 'manual');
  const missingTechnical = requiredTechnicalFields(form).filter(([key]) => !hasValue(form[key])).map(([, label]) => label);
  const needsClamp = form.category === 'solpanel';
  const needsBatteryInstallationData = form.category === 'batteri';
  const clampOk = !needsClamp || (hasValue(form.clampZoneMinMm) && hasValue(form.clampZoneMaxMm));
  const docsOk = hasDatasheet && hasManual;
  const technicalOk = missingTechnical.length === 0;
  return { hasDatasheet, hasManual, docsOk, technicalOk, missingTechnical, needsClamp, needsBatteryInstallationData, clampOk, complete: docsOk && technicalOk && clampOk };
}

function schemaFor(fields) {
  return { type: 'object', properties: fields.reduce((acc, field) => { acc[field] = field === 'battery_supported' || field === 'bifacial' ? { type: 'boolean' } : { type: ['string', 'number', 'boolean', 'null'] }; return acc; }, {}) };
}

function categoryWarnings(form = {}) {
  const warnings = [];
  if (form.category === 'solpanel' && (!hasValue(form.clampZoneMinMm) || !hasValue(form.clampZoneMaxMm))) warnings.push('Klämzon hittades inte. Fyll manuellt från montage-/installationsdelen i manualen.');
  if (form.category === 'batteri') {
    if (!hasValue(form.max_modules_per_stack)) warnings.push('Max antal moduler i stapel hittades inte.');
    if (!hasValue(form.clearance_side_mm) || !hasValue(form.clearance_top_mm)) warnings.push('Installationsavstånd för batteriet saknas eller är ofullständigt.');
    if (!hasValue(form.capacity_kwh) || !hasValue(form.module_capacity_kwh)) warnings.push('Batterikapacitet eller modulkapacitet saknas.');
  }
  if (form.category === 'vaxelriktare') {
    if (!hasValue(form.mppt_voltage_min_v) || !hasValue(form.mppt_voltage_max_v)) warnings.push('MPPT-spänningsområde saknas eller är ofullständigt.');
    if (!hasValue(form.max_input_current_a) || !hasValue(form.max_short_circuit_current_a)) warnings.push('Strömgränser saknas eller är ofullständiga.');
  }
  return warnings;
}

function buildFetchReport(form = {}, documents = [], filledKeys = []) {
  const missingRequired = requiredTechnicalFields(form).filter(([key]) => !hasValue(form[key])).map(([, label]) => label);
  if (form.category === 'solpanel') {
    if (!hasValue(form.clampZoneMinMm)) missingRequired.push('klämzon min');
    if (!hasValue(form.clampZoneMaxMm)) missingRequired.push('klämzon max');
  }
  return {
    documentCount: documents.length,
    filled: Array.from(new Set(filledKeys)).map(labelFor),
    missing: Array.from(new Set(missingRequired)),
    warnings: categoryWarnings(form),
  };
}

function getAutoFetchConfig(category, query, docs) {
  const docList = docs.map(doc => `${doc.type}: ${doc.name} (${doc.file_url})`).join('\n');
  const baseInstruction = `Use ONLY these uploaded SolarPlan product documents. Do not use external websites or guessed public manuals. If a value is not present in the uploaded documents, return null.\n\nProduct: "${query}"\nUploaded documents:\n${docList || 'No documents uploaded.'}`;

  if (category === 'vaxelriktare') {
    const fields = [...COMMON_FIELDS, ...INVERTER_FIELDS];
    return { prompt: `${baseInstruction}\n\nExtract inverter specifications. Return ONLY a JSON object. Fields:\n${fields.join(', ')}.`, fields, schema: schemaFor(fields) };
  }
  if (category === 'solpanel') {
    const fields = [...COMMON_FIELDS, ...PANEL_FIELDS];
    return { prompt: `${baseInstruction}\n\nExtract solar module specifications and module mounting/clamp-zone data. Return ONLY a JSON object. Fields:\n${[...fields, ...PANEL_META_FIELDS].join(', ')}.\n\nClamp-zone rules:\n- clampZoneMinMm and clampZoneMaxMm must come from the product manual/datasheet mounting section.\n- Do not calculate 10%/33% here unless the document explicitly states it.\n- clampSource should be the short document section/table name if found.`, fields, metaFields: PANEL_META_FIELDS, schema: schemaFor([...fields, ...PANEL_META_FIELDS]) };
  }
  if (category === 'batteri') {
    return { prompt: `${baseInstruction}\n\nExtract battery product and installation specifications. Return ONLY a JSON object. Fields:\n${BATTERY_AUTO_FIELDS.join(', ')}.\n\nRules:\n- capacity_kwh = nominal battery capacity for the complete configured battery if stated.\n- module_capacity_kwh = capacity per battery module if stated.\n- usable_capacity_kwh = usable capacity if stated. If not stated, leave null.\n- dod_percent = depth of discharge percentage, default only if document explicitly says it.\n- max_modules_per_stack = maximum modules in one vertical stack.\n- clearance_*_mm = required installation clearances, not clamp zones.`, fields: BATTERY_AUTO_FIELDS, metaFields: BATTERY_FIELDS, schema: schemaFor(BATTERY_AUTO_FIELDS) };
  }
  const fields = ['name','brand','model','power_watts','width_mm','height_mm','voc_v','isc_a','vmp_v','imp_a','capacity_kwh','description'];
  return { prompt: `${baseInstruction}\n\nExtract technical datasheet specifications. Return ONLY a JSON object with fields: ${fields.join(', ')}`, fields, schema: schemaFor(fields) };
}

export default function ProductFormModal({ product, onSave, onClose, fixMode = false, hasNextProduct = false }) {
  const meta = productMeta(product || {});
  const [form, setForm] = useState({
    name: product?.name || '', category: product?.category || 'solpanel', brand: product?.brand || '', model: product?.model || '', price: product?.price || '', unit: product?.unit || 'st', power_watts: product?.power_watts || '', capacity_kwh: product?.capacity_kwh || meta.capacity_kwh || '', width_mm: product?.width_mm || meta.width_mm || '', height_mm: product?.height_mm || meta.height_mm || '', weight_kg: product?.weight_kg || meta.weight_kg || '', depth_mm: meta.depth_mm || product?.depth_mm || '', module_capacity_kwh: meta.module_capacity_kwh || product?.module_capacity_kwh || '', usable_capacity_kwh: meta.usable_capacity_kwh || product?.usable_capacity_kwh || '', dod_percent: meta.dod_percent || product?.dod_percent || 90, modules_count: meta.modules_count || product?.modules_count || '', max_modules_per_stack: meta.max_modules_per_stack || product?.max_modules_per_stack || '', max_battery_modules: meta.max_battery_modules || product?.max_battery_modules || '', module_weight_kg: meta.module_weight_kg || product?.module_weight_kg || '', base_weight_kg: meta.base_weight_kg || product?.base_weight_kg || '', bms_weight_kg: meta.bms_weight_kg || product?.bms_weight_kg || '', clearance_front_mm: meta.clearance_front_mm || product?.clearance_front_mm || '', clearance_back_mm: meta.clearance_back_mm || product?.clearance_back_mm || '', clearance_side_mm: meta.clearance_side_mm || product?.clearance_side_mm || '', clearance_top_mm: meta.clearance_top_mm || product?.clearance_top_mm || '', clearance_bottom_mm: meta.clearance_bottom_mm || product?.clearance_bottom_mm || '', installation_location: meta.installation_location || product?.installation_location || '', ip_rating: meta.ip_rating || product?.ip_rating || '', voc_v: product?.voc_v || '', isc_a: product?.isc_a || '', vmp_v: product?.vmp_v || '', imp_a: product?.imp_a || '', temp_coeff_pmax_percent_c: product?.temp_coeff_pmax_percent_c || '', temp_coeff_voc_percent_c: product?.temp_coeff_voc_percent_c || '', temp_coeff_isc_percent_c: product?.temp_coeff_isc_percent_c || '', noct_c: product?.noct_c || '', bifacial: product?.bifacial ?? false, max_dc_power_kw: product?.max_dc_power_kw || '', max_dc_voltage_v: product?.max_dc_voltage_v || '', startup_voltage_v: product?.startup_voltage_v || '', mppt_voltage_min_v: product?.mppt_voltage_min_v || '', mppt_voltage_max_v: product?.mppt_voltage_max_v || '', nominal_dc_voltage_v: product?.nominal_dc_voltage_v || '', mppt_count: product?.mppt_count || '', strings_per_mppt: product?.strings_per_mppt || '', max_input_current_a: product?.max_input_current_a || '', max_short_circuit_current_a: product?.max_short_circuit_current_a || '', battery_supported: product?.battery_supported ?? false, phase_type: product?.phase_type || '', inverter_type: product?.inverter_type || '', description: productDescription(product || {}), image_url: product?.image_url || '', clampZoneMinMm: meta.clampZoneMinMm || '', clampZoneMaxMm: meta.clampZoneMaxMm || '', railOffsetTopMm: meta.railOffsetTopMm || '', railOffsetBottomMm: meta.railOffsetBottomMm || '', clampSource: meta.clampSource || '',
  });
  const [documents, setDocuments] = useState(() => productDocuments(product || {}));
  const [uploading, setUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const [fetchReport, setFetchReport] = useState(null);
  const autoFetchedInverterKeyRef = useRef(product?.category === 'vaxelriktare' ? normalizeKey(product?.brand, product?.model) : '');
  const status = useMemo(() => completenessFor(form, documents), [form, documents]);
  const usableKwh = calculatedUsableKwh(form);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAutoFetch = async ({ automatic = false, categoryOverride, queryOverride } = {}) => {
    const activeCategory = categoryOverride || form.category;
    const query = queryOverride || [form.brand, form.model, form.name].filter(Boolean).join(' ');
    if (!query) return;
    if (!documents.length) { setFetchMsg('⚠ Lägg först upp manual/datablad. Data hämtas inte från externa länkar.'); return; }
    setFetching(true);
    setFetchMsg(automatic ? 'Hämtar data från uppladdade dokument...' : null);
    setFetchReport(null);
    try {
      const config = getAutoFetchConfig(activeCategory, query, documents);
      const result = await base44.integrations.Core.InvokeLLM({ prompt: config.prompt, add_context_from_internet: false, response_json_schema: config.schema });
      const nextForm = { ...form };
      const filledKeys = [];
      [...(config.fields || []), ...(config.metaFields || [])].forEach(k => {
        if (result?.[k] != null && result[k] !== '') { nextForm[k] = result[k]; filledKeys.push(k); }
      });
      if (activeCategory === 'vaxelriktare') autoFetchedInverterKeyRef.current = normalizeKey(result?.brand || nextForm.brand, result?.model || nextForm.model);
      setForm(nextForm);
      setFetchReport(buildFetchReport(nextForm, documents, filledKeys));
      setFetchMsg(filledKeys.length > 0 ? `✓ Fyllde i ${filledKeys.length} fält från uppladdade dokument` : '⚠ Dokumenten saknar läsbar teknisk data — fyll i manuellt');
    } catch (error) {
      console.error('Document data fetch failed', error);
      setFetchMsg('⚠ Kunde inte läsa data från dokumenten automatiskt');
      setFetchReport({ documentCount: documents.length, filled: [], missing: [], warnings: ['Dokumentläsningen misslyckades. Kontrollera dokumentfilen eller fyll i manuellt.'] });
    } finally { setFetching(false); }
  };

  useEffect(() => {
    if (form.category !== 'vaxelriktare') return;
    if (!form.brand?.trim() || !form.model?.trim()) return;
    if (fetching || !documents.length) return;
    const key = normalizeKey(form.brand, form.model);
    if (!key || key === autoFetchedInverterKeyRef.current) return;
    const timer = window.setTimeout(() => { autoFetchedInverterKeyRef.current = key; handleAutoFetch({ automatic: true, categoryOverride: 'vaxelriktare', queryOverride: `${form.brand.trim()} ${form.model.trim()}` }); }, 900);
    return () => window.clearTimeout(timer);
  }, [form.category, form.brand, form.model, fetching, documents.length]);

  const handleImage = async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); const { file_url } = await base44.integrations.Core.UploadFile({ file }); set('image_url', file_url); setUploading(false); };
  const handleDocumentUpload = async (event, type) => {
    const file = event.target.files?.[0]; if (!file) return; setDocUploading(type);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setDocuments(current => [...current.filter(doc => !(doc.type === type && doc.name === file.name)), { id: `${Date.now()}-${type}`, type, name: file.name, title: file.name, file_name: file.name, file_url, uploadedAt: new Date().toISOString(), uploaded_at: new Date().toISOString() }]); setFetchMsg('✓ Dokument uppladdat. Tryck Hämta från uppladdade dokument för att fylla tekniska data.'); setFetchReport(null); }
    finally { setDocUploading(null); event.target.value = ''; }
  };
  const removeDocument = id => { setDocuments(current => current.filter(doc => doc.id !== id)); setFetchReport(null); };

  const handleSave = async ({ continueToNext = false } = {}) => {
    setSaving(true);
    const numOrNull = v => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : undefined;
    const batteryMeta = BATTERY_FIELDS.reduce((acc, key) => { const raw = form[key]; if (raw === '' || raw === null || raw === undefined) return acc; acc[key] = ['installation_location', 'ip_rating'].includes(key) ? raw : numOrNull(raw); return acc; }, {});
    if (form.category === 'batteri') { ['capacity_kwh', 'width_mm', 'height_mm', 'weight_kg'].forEach(key => { const value = numOrNull(form[key]); if (value !== undefined) batteryMeta[key] = value; }); if (!batteryMeta.usable_capacity_kwh && usableKwh) batteryMeta.usable_capacity_kwh = usableKwh; }
    const metaPatch = { documents, clampZoneMinMm: numOrNull(form.clampZoneMinMm), clampZoneMaxMm: numOrNull(form.clampZoneMaxMm), railOffsetTopMm: numOrNull(form.railOffsetTopMm), railOffsetBottomMm: numOrNull(form.railOffsetBottomMm), clampSource: form.clampSource || '', ...batteryMeta };
    Object.keys(metaPatch).forEach(k => metaPatch[k] === undefined && delete metaPatch[k]);
    const data = { ...form, price: Number(form.price) || 0, description: buildProductDescription(form.description, metaPatch) };
    ['power_watts','capacity_kwh','width_mm','height_mm','weight_kg','voc_v','isc_a','vmp_v','imp_a','temp_coeff_pmax_percent_c','temp_coeff_voc_percent_c','temp_coeff_isc_percent_c','noct_c','max_dc_power_kw','max_dc_voltage_v','startup_voltage_v','mppt_voltage_min_v','mppt_voltage_max_v','nominal_dc_voltage_v','mppt_count','strings_per_mppt','max_input_current_a','max_short_circuit_current_a'].forEach(k => { data[k] = numOrNull(form[k]); });
    [...PANEL_META_FIELDS, ...BATTERY_FIELDS].forEach(k => delete data[k]);
    data.bifacial = Boolean(form.bifacial); data.battery_supported = Boolean(form.battery_supported); Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    if (product?.id) await base44.entities.Product.update(product.id, data); else await base44.entities.Product.create(data);
    setSaving(false); await onSave?.({ continueToNext, savedProductId: product?.id });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border"><div><h2 className="font-semibold text-foreground">{product ? 'Redigera produkt' : 'Ny produkt'}</h2>{fixMode && <p className="mt-1 text-xs text-muted-foreground">Fixläge: spara och gå vidare till nästa produkt som matchar filtren.</p>}</div><button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-4 h-4" /></button></div>
        <div className="p-5 space-y-4">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kategori</label><div className="flex flex-wrap gap-2">{categories.map(c => <button key={c.value} onClick={() => { set('category', c.value); if (c.value !== 'vaxelriktare') autoFetchedInverterKeyRef.current = ''; }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.category === c.value ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary/50 text-muted-foreground'}`}>{c.label}</button>)}</div></div>
          <ProductCompletenessBox status={status} />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Produkter ska ha både datablad och manual uppladdade. Solpaneler kräver klämzon från manual/datablad. Batterier kräver mått, installationsavstånd, modul-/stapeldata och användbar kapacitet.</div>
          <Field label="Produktnamn *" value={form.name} onChange={v => set('name', v)} placeholder={form.category === 'vaxelriktare' ? 'Fylls från dokument eller manuellt' : 'T.ex. JA Solar 415W'} />
          <div className="grid grid-cols-2 gap-3"><Field label="Varumärke" value={form.brand} onChange={v => set('brand', v)} placeholder="T.ex. LONGi" /><Field label="Modell" value={form.model} onChange={v => set('model', v)} placeholder="T.ex. LR5-72HPH" /></div>
          <DocumentUploadBlock documents={documents} hasDatasheet={status.hasDatasheet} hasManual={status.hasManual} docUploading={docUploading} onUpload={handleDocumentUpload} onRemove={removeDocument} />
          <div className="flex items-center gap-3 flex-wrap"><button type="button" onClick={() => handleAutoFetch()} disabled={fetching || (!form.brand && !form.model && !form.name) || !documents.length} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">{fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{fetching ? 'Hämtar data...' : 'Hämta från uppladdade dokument'}</button>{fetchMsg && <span className={`text-xs ${fetchMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>{fetchMsg}</span>}</div>
          <AutoFetchReport report={fetchReport} />
          <div className="grid grid-cols-2 gap-3"><Field label="Pris (SEK) *" type="number" value={form.price} onChange={v => set('price', v)} placeholder="0" /><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enhet</label><Select value={form.unit} onValueChange={v => set('unit', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="st">st</SelectItem><SelectItem value="m">m</SelectItem><SelectItem value="set">set</SelectItem><SelectItem value="paket">paket</SelectItem></SelectContent></Select></div></div>
          {(form.category === 'solpanel' || form.category === 'vaxelriktare' || form.category === 'optimerare') && <Field label={form.category === 'vaxelriktare' ? 'Nominell AC-effekt (W)' : 'Effekt (W)'} type="number" value={form.power_watts} onChange={v => set('power_watts', v)} placeholder={form.category === 'vaxelriktare' ? '15000' : '415'} />}
          {form.category === 'batteri' && <BatteryFields form={form} set={set} usableKwh={usableKwh} />}{form.category === 'solpanel' && <PanelFields form={form} set={set} />}{form.category === 'vaxelriktare' && <InverterFields form={form} set={set} />}
          <Field label="Beskrivning" value={form.description} onChange={v => set('description', v)} placeholder="Valfri beskrivning..." multiline />
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Produktbild</label>{form.image_url ? <div className="relative"><img src={form.image_url} alt="" className="w-full h-28 object-contain bg-muted rounded-xl" /><button onClick={() => set('image_url', '')} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"><X className="w-3 h-3" /></button></div> : <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">{uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <><Upload className="w-4 h-4 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground">Ladda upp bild</span></>}<input type="file" className="hidden" accept="image/*" onChange={handleImage} /></label>}</div>
        </div>
        <div className="flex flex-wrap gap-3 p-5 border-t border-border"><button onClick={onClose} className="flex-1 min-w-[130px] py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Avbryt</button>{fixMode && <button onClick={() => handleSave({ continueToNext: true })} disabled={saving || !form.name || !form.price} className="flex-1 min-w-[170px] py-2.5 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Spara och nästa</button>}<button onClick={() => handleSave({ continueToNext: false })} disabled={saving || !form.name || !form.price} className="flex-1 min-w-[150px] py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{product ? 'Spara ändringar' : 'Lägg till'}</button></div>
      </div>
    </div>
  );
}

function AutoFetchReport({ report }) {
  if (!report) return null;
  return <div className="rounded-xl border bg-muted/20 p-3 text-xs"><div className="mb-2 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Resultat från dokumentläsning</div><p className="text-muted-foreground">Läste {report.documentCount} uppladdade dokument. Internet/externdata: avstängt.</p>{report.filled.length > 0 && <div className="mt-2 text-green-700"><b>Hittade:</b> {report.filled.join(', ')}</div>}{report.filled.length === 0 && <div className="mt-2 text-amber-700"><b>Hittade:</b> inga säkra fält.</div>}{report.missing.length > 0 && <div className="mt-2 text-amber-700"><b>Saknas fortfarande:</b> {report.missing.join(', ')}</div>}{report.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-amber-800">{report.warnings.map(item => <li key={item}>{item}</li>)}</ul>}</div>;
}

function ProductCompletenessBox({ status }) {
  const missing = [];
  if (!status.hasDatasheet) missing.push('Datablad saknas'); if (!status.hasManual) missing.push('Manual saknas'); if (!status.technicalOk) missing.push(`Teknisk data saknas: ${status.missingTechnical.join(', ')}`); if (status.needsClamp && !status.clampOk) missing.push('Klämzon saknas från manual/datablad');
  return <div className={`rounded-xl border p-3 ${status.complete ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold">{status.complete ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}{status.complete ? 'Produkten är komplett' : 'Produkten är ofullständig'}</div><div className="flex flex-wrap gap-1.5"><StatusPill ok={status.hasDatasheet} label="Datablad" /><StatusPill ok={status.hasManual} label="Manual" /><StatusPill ok={status.technicalOk} label="Teknisk data" icon={Zap} />{status.needsBatteryInstallationData && <StatusPill ok={status.technicalOk} label="Batteridata" icon={Battery} />}{status.needsClamp && <StatusPill ok={status.clampOk} label="Klämzon" icon={Ruler} />}</div></div>{missing.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">{missing.map(item => <li key={item}>{item}</li>)}</ul>}{!status.complete && <p className="mt-2 text-xs">Produkten kan sparas, men bör inte användas i projekt förrän kraven är kompletta.</p>}</div>;
}

function PanelFields({ form, set }) { return <><div className="grid grid-cols-2 gap-3"><Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="1134" /><Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="1762" /></div><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Elektriska data (för slingkontroll)</label><div className="grid grid-cols-2 gap-3"><Field label="Voc (V)" type="number" value={form.voc_v} onChange={v => set('voc_v', v)} placeholder="49.5" /><Field label="Isc (A)" type="number" value={form.isc_a} onChange={v => set('isc_a', v)} placeholder="10.8" /><Field label="Vmp (V)" type="number" value={form.vmp_v} onChange={v => set('vmp_v', v)} placeholder="41.8" /><Field label="Imp (A)" type="number" value={form.imp_a} onChange={v => set('imp_a', v)} placeholder="9.93" /></div></div><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Temperaturdata</label><div className="grid grid-cols-2 gap-3"><Field label="Tempkoeff. Pmax (%/°C)" type="number" value={form.temp_coeff_pmax_percent_c} onChange={v => set('temp_coeff_pmax_percent_c', v)} placeholder="-0.35" /><Field label="Tempkoeff. Voc (%/°C)" type="number" value={form.temp_coeff_voc_percent_c} onChange={v => set('temp_coeff_voc_percent_c', v)} placeholder="-0.27" /><Field label="Tempkoeff. Isc (%/°C)" type="number" value={form.temp_coeff_isc_percent_c} onChange={v => set('temp_coeff_isc_percent_c', v)} placeholder="0.05" /><Field label="NOCT/NMOT (°C)" type="number" value={form.noct_c} onChange={v => set('noct_c', v)} placeholder="45" /></div><BooleanToggle label="Bifacial panel" checked={form.bifacial} onChange={v => set('bifacial', v)} /></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3"><div><p className="text-sm font-semibold text-blue-900">Klämzon från panelens manual/datablad</p><p className="text-xs text-blue-800">Detta gäller endast solpaneler. Lämna tomt om dokumentet inte anger zonen.</p></div><div className="grid grid-cols-2 gap-3"><Field label="Klämzon min (mm)" type="number" value={form.clampZoneMinMm} onChange={v => set('clampZoneMinMm', v)} placeholder="t.ex. 260" /><Field label="Klämzon max (mm)" type="number" value={form.clampZoneMaxMm} onChange={v => set('clampZoneMaxMm', v)} placeholder="t.ex. 520" /></div><div className="grid grid-cols-2 gap-3"><Field label="Skena från överkant (mm)" type="number" value={form.railOffsetTopMm} onChange={v => set('railOffsetTopMm', v)} placeholder="valfritt" /><Field label="Skena från underkant (mm)" type="number" value={form.railOffsetBottomMm} onChange={v => set('railOffsetBottomMm', v)} placeholder="valfritt" /></div><Field label="Källa i dokument" value={form.clampSource} onChange={v => set('clampSource', v)} placeholder="T.ex. Installation manual, Mounting methods" /></div></>; }
function InverterFields({ form, set }) { return <><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Växelriktardata</label><div className="grid grid-cols-2 gap-3"><Field label="Max DC-effekt (kW)" type="number" value={form.max_dc_power_kw} onChange={v => set('max_dc_power_kw', v)} placeholder="22.5" /><Field label="Max DC-spänning (V)" type="number" value={form.max_dc_voltage_v} onChange={v => set('max_dc_voltage_v', v)} placeholder="1000" /><Field label="Startspänning (V)" type="number" value={form.startup_voltage_v} onChange={v => set('startup_voltage_v', v)} placeholder="180" /><Field label="Nominell DC-spänning (V)" type="number" value={form.nominal_dc_voltage_v} onChange={v => set('nominal_dc_voltage_v', v)} placeholder="640" /></div></div><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">MPPT och strömgränser</label><div className="grid grid-cols-2 gap-3"><Field label="MPPT min (V)" type="number" value={form.mppt_voltage_min_v} onChange={v => set('mppt_voltage_min_v', v)} placeholder="160" /><Field label="MPPT max (V)" type="number" value={form.mppt_voltage_max_v} onChange={v => set('mppt_voltage_max_v', v)} placeholder="950" /><Field label="Antal MPPT" type="number" value={form.mppt_count} onChange={v => set('mppt_count', v)} placeholder="2" /><Field label="Strängar per MPPT" type="number" value={form.strings_per_mppt} onChange={v => set('strings_per_mppt', v)} placeholder="1" /><Field label="Max ingångsström (A)" type="number" value={form.max_input_current_a} onChange={v => set('max_input_current_a', v)} placeholder="16" /><Field label="Max kortslutningsström (A)" type="number" value={form.max_short_circuit_current_a} onChange={v => set('max_short_circuit_current_a', v)} placeholder="20" /></div></div><div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Typ och system</label><div className="grid grid-cols-2 gap-3"><Field label="Fas" value={form.phase_type} onChange={v => set('phase_type', v)} placeholder="3-fas" /><Field label="Växelriktartyp" value={form.inverter_type} onChange={v => set('inverter_type', v)} placeholder="Hybrid" /></div><BooleanToggle label="Batteristöd / hybrid" checked={form.battery_supported} onChange={v => set('battery_supported', v)} /></div></>; }
function BatteryFields({ form, set, usableKwh }) { return <div className="rounded-xl border border-green-100 bg-green-50 p-3 space-y-3"><div><p className="text-sm font-semibold text-green-900">Batteridata och installationskrav</p><p className="text-xs text-green-800">Här används inte klämzoner. Fyll i mått, avstånd, modul/stapeldata och kapacitet från manual/datablad.</p></div><div className="grid grid-cols-2 gap-3"><Field label="Nominell kapacitet (kWh)" type="number" value={form.capacity_kwh} onChange={v => set('capacity_kwh', v)} placeholder="t.ex. 3.6" /><Field label="kWh per modul" type="number" value={form.module_capacity_kwh} onChange={v => set('module_capacity_kwh', v)} placeholder="t.ex. 3.6" /><Field label="Antal moduler" type="number" value={form.modules_count} onChange={v => set('modules_count', v)} placeholder="valfritt" /><Field label="Max moduler i stapel" type="number" value={form.max_modules_per_stack} onChange={v => set('max_modules_per_stack', v)} placeholder="t.ex. 4" /><Field label="Max moduler totalt" type="number" value={form.max_battery_modules} onChange={v => set('max_battery_modules', v)} placeholder="valfritt" /><Field label="DoD (%)" type="number" value={form.dod_percent} onChange={v => set('dod_percent', v)} placeholder="90" /></div><div className="rounded-lg bg-white/70 p-2 text-xs text-green-900">Användbar kapacitet vid {form.dod_percent || 90}% DoD: <b>{usableKwh || '-'} kWh</b></div><div className="grid grid-cols-2 gap-3"><Field label="Bredd (mm)" type="number" value={form.width_mm} onChange={v => set('width_mm', v)} placeholder="510" /><Field label="Höjd (mm)" type="number" value={form.height_mm} onChange={v => set('height_mm', v)} placeholder="365" /><Field label="Djup (mm)" type="number" value={form.depth_mm} onChange={v => set('depth_mm', v)} placeholder="152" /><Field label="Vikt total/modul (kg)" type="number" value={form.weight_kg} onChange={v => set('weight_kg', v)} placeholder="30" /><Field label="Modulvikt (kg)" type="number" value={form.module_weight_kg} onChange={v => set('module_weight_kg', v)} placeholder="25" /><Field label="BMS vikt (kg)" type="number" value={form.bms_weight_kg} onChange={v => set('bms_weight_kg', v)} placeholder="13" /><Field label="Basvikt (kg)" type="number" value={form.base_weight_kg} onChange={v => set('base_weight_kg', v)} placeholder="10" /><Field label="IP-klass" value={form.ip_rating} onChange={v => set('ip_rating', v)} placeholder="IP66" /></div><div className="grid grid-cols-2 gap-3"><Field label="Avstånd sida (mm)" type="number" value={form.clearance_side_mm} onChange={v => set('clearance_side_mm', v)} placeholder="400" /><Field label="Avstånd ovanför (mm)" type="number" value={form.clearance_top_mm} onChange={v => set('clearance_top_mm', v)} placeholder="100" /><Field label="Avstånd framför (mm)" type="number" value={form.clearance_front_mm} onChange={v => set('clearance_front_mm', v)} placeholder="valfritt" /><Field label="Avstånd bakom (mm)" type="number" value={form.clearance_back_mm} onChange={v => set('clearance_back_mm', v)} placeholder="valfritt" /><Field label="Avstånd under (mm)" type="number" value={form.clearance_bottom_mm} onChange={v => set('clearance_bottom_mm', v)} placeholder="valfritt" /><Field label="Installationsplats" value={form.installation_location} onChange={v => set('installation_location', v)} placeholder="Inomhus/utomhus, undvik direkt sol/regn/snö" /></div></div>; }
function DocumentUploadBlock({ documents, hasDatasheet, hasManual, docUploading, onUpload, onRemove }) { return <div className="rounded-xl border p-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Produktdokument</p><p className="text-xs text-muted-foreground">Krav: minst ett datablad och en manual per produkt. Certifikat/CE kan läggas till som stödjande dokument.</p></div><div className="flex gap-2"><StatusPill ok={hasDatasheet} label="Datablad" /><StatusPill ok={hasManual} label="Manual" /></div></div><div className="grid grid-cols-2 gap-2">{DOCUMENT_UPLOAD_TYPES.map(item => <label key={item.type} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs hover:border-primary/60">{docUploading === item.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Ladda upp {item.label.toLowerCase()}<input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={event => onUpload(event, item.type)} /></label>)}</div>{documents.length > 0 && <div className="space-y-2">{documents.map(doc => <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"><div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate"><b>{DOCUMENT_TYPE_LABELS[doc.type] || 'Dokument'}:</b> {doc.name}</span></div><button type="button" onClick={() => onRemove(doc.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}</div>; }
function StatusPill({ ok, label, icon: Icon }) { return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{Icon && <Icon className="h-3 w-3" />}{label}: {ok ? 'OK' : 'Saknas'}</span>; }
function BooleanToggle({ label, checked, onChange }) { return <button type="button" onClick={() => onChange(!checked)} className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}><span className={`h-3 w-3 rounded-full ${checked ? 'bg-primary' : 'bg-muted-foreground/40'}`} />{label}: {checked ? 'Ja' : 'Nej'}</button>; }
function Field({ label, value, onChange, placeholder, type = 'text', multiline }) { return <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>{multiline ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />}</div>; }
