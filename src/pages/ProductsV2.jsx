import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Battery, Box, Building2, Cable, CheckCircle2, FileText, Package, Pencil, Plus, Search, Sun, ToggleLeft, Trash2, Wrench, Zap } from 'lucide-react';
import ProductFormModal from '@/components/products/ProductFormModal';
import ProductCatalogImporter from '@/components/products/ProductCatalogImporter';
import ProductVisual from '@/components/products/ProductVisual';
import { productDocuments, productMeta, resolveProductClampZone } from '@/lib/productDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canEditProduct, isStandardProduct, resolveAccessContext } from '@/lib/accessControl';
import { deleteTenantProduct, getTenantUser, listVisibleProducts } from '@/lib/tenantQueries';

const PENDING_META_KEY = 'solarplan:pending-mounting-product-meta';
const CATEGORY_CONFIG = {
  solpanel: { label: 'Solpanel', icon: Sun, color: 'bg-orange-100 text-orange-700' },
  batteri: { label: 'Batteri', icon: Battery, color: 'bg-green-100 text-green-700' },
  vaxelriktare: { label: 'Växelriktare', icon: Zap, color: 'bg-blue-100 text-blue-700' },
  optimerare: { label: 'Optimerare', icon: Zap, color: 'bg-purple-100 text-purple-700' },
  kabel: { label: 'Kabel', icon: Cable, color: 'bg-slate-100 text-slate-700' },
  montagesystem: { label: 'Montagesystem', icon: Box, color: 'bg-amber-100 text-amber-800' },
  brytare: { label: 'Brytare', icon: ToggleLeft, color: 'bg-orange-100 text-orange-800' },
  elcentral: { label: 'Elcentral', icon: Building2, color: 'bg-violet-100 text-violet-800' },
  ovrigt: { label: 'Övrigt', icon: Package, color: 'bg-slate-100 text-slate-700' },
};
const CATEGORY_ORDER = ['solpanel', 'batteri', 'vaxelriktare', 'optimerare', 'kabel', 'montagesystem', 'brytare', 'elcentral', 'ovrigt'];
const DOCUMENT_REQUIRED = new Set(['solpanel', 'vaxelriktare', 'batteri', 'optimerare', 'elbilsladdare', 'varmepump', 'värmepump']);

const unique = values => Array.from(new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sv'));
const hasValue = value => value !== null && value !== undefined && value !== '' && (typeof value !== 'number' || (Number.isFinite(value) && value > 0));
const modelName = product => String(product.model || product.name || '').trim();

function inferMountingType(product = {}, meta = productMeta(product)) {
  const stored = meta.mounting_item_type || product.mounting_item_type;
  if (stored === 'accessory' || stored === 'mounting') return stored;
  const text = `${product.name || ''} ${product.model || ''}`.toLowerCase();
  return /(epdm|rulle|duk|skruv|bult|mutter|bricka|tät|kabelkläm|ändlock|tillbehör)/.test(text) ? 'accessory' : 'mounting';
}

function hydrate(product = {}) {
  const meta = productMeta(product);
  return {
    ...product,
    module_capacity_kwh: product.module_capacity_kwh || meta.module_capacity_kwh,
    max_modules_per_stack: product.max_modules_per_stack || meta.max_modules_per_stack,
    depth_mm: product.depth_mm || meta.depth_mm,
    clearance_side_mm: product.clearance_side_mm || meta.clearance_side_mm,
    clearance_top_mm: product.clearance_top_mm || meta.clearance_top_mm,
    mounting_item_type: inferMountingType(product, meta),
    mounting_system_name: meta.mounting_system_name || product.mounting_system_name || product.brand || 'Övrigt system',
  };
}

function requiredFields(product) {
  if (product.category === 'solpanel') return ['power_watts', 'width_mm', 'height_mm', 'voc_v', 'vmp_v', 'isc_a', 'imp_a'];
  if (product.category === 'vaxelriktare') return ['power_watts', 'max_dc_voltage_v', 'startup_voltage_v', 'mppt_voltage_min_v', 'mppt_voltage_max_v', 'max_input_current_a', 'max_short_circuit_current_a'];
  if (product.category === 'batteri') return ['capacity_kwh', 'module_capacity_kwh', 'max_modules_per_stack', 'width_mm', 'height_mm', 'depth_mm', 'clearance_side_mm', 'clearance_top_mm'];
  if (product.category === 'montagesystem') return ['mounting_system_name', 'model'];
  return [];
}

function productStatus(product) {
  const documents = productDocuments(product);
  const requiresDocuments = DOCUMENT_REQUIRED.has(String(product.category || '').toLowerCase());
  const hasDatasheet = documents.some(document => document.type === 'datasheet');
  const hasManual = documents.some(document => document.type === 'manual');
  const technicalOk = requiredFields(product).every(field => hasValue(product[field]));
  const needsClamp = product.category === 'solpanel';
  const clampOk = !needsClamp || resolveProductClampZone(product).hasProductZone;
  const docsOk = !requiresDocuments || (hasDatasheet && hasManual);
  return { requiresDocuments, hasDatasheet, hasManual, technicalOk, needsClamp, clampOk, docsOk, complete: docsOk && technicalOk && clampOk };
}

function qualityMatches(filter, status) {
  if (filter === 'incomplete') return !status.complete;
  if (filter === 'missing-docs') return !status.docsOk;
  if (filter === 'missing-technical') return !status.technicalOk;
  if (filter === 'missing-clamp') return status.needsClamp && !status.clampOk;
  return true;
}

function FilterSelect({ label, value, onChange, children }) {
  return <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{children}</SelectContent></Select></div>;
}

function StatusPill({ ok, children }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{children}</span>;
}

export default function ProductsV2() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [fixMode, setFixMode] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('all');
  const [brand, setBrand] = useState('all');
  const [model, setModel] = useState('all');
  const [mountingKind, setMountingKind] = useState('all');
  const [mountingSystem, setMountingSystem] = useState('all');
  const [quality, setQuality] = useState('all');
  const [search, setSearch] = useState('');
  const [mountingMeta, setMountingMeta] = useState({ mounting_item_type: 'mounting', mounting_system_name: '' });
  const [user, setUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, tenantUser] = await Promise.all([
        listVisibleProducts('-created_date'),
        getTenantUser(),
      ]);
      setUser(tenantUser);
      setProducts(rows || []);
      return rows || [];
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!showModal) return;
    window.sessionStorage.setItem(PENDING_META_KEY, JSON.stringify(mountingMeta));
    return () => window.sessionStorage.removeItem(PENDING_META_KEY);
  }, [showModal, mountingMeta]);

  const rows = useMemo(() => products.map(raw => { const product = hydrate(raw); return { raw, product, status: productStatus(product) }; }), [products]);
  const categoryRows = category === 'all' ? rows : rows.filter(row => row.product.category === category);
  const brandOptions = unique(categoryRows.map(row => row.product.brand));
  const mountingKindRows = categoryRows.filter(row => mountingKind === 'all' || row.product.mounting_item_type === mountingKind);
  const mountingSystemOptions = unique(mountingKindRows.map(row => row.product.mounting_system_name));
  const brandRows = categoryRows.filter(row => brand === 'all' || row.product.brand === brand);
  const systemRows = mountingKindRows.filter(row => mountingSystem === 'all' || row.product.mounting_system_name === mountingSystem);
  const modelOptions = unique((category === 'montagesystem' ? systemRows : brandRows).map(row => modelName(row.product)));

  const filteredRows = rows.filter(({ product, status }) => {
    if (category !== 'all' && product.category !== category) return false;
    if (category === 'montagesystem') {
      if (mountingKind !== 'all' && product.mounting_item_type !== mountingKind) return false;
      if (mountingSystem !== 'all' && product.mounting_system_name !== mountingSystem) return false;
    } else if (brand !== 'all' && product.brand !== brand) return false;
    if (model !== 'all' && modelName(product) !== model) return false;
    if (!qualityMatches(quality, status)) return false;
    const query = search.trim().toLowerCase();
    return !query || [product.name, product.brand, product.model, product.article_number, product.mounting_system_name].filter(Boolean).join(' ').toLowerCase().includes(query);
  });

  const stats = {
    total: rows.length,
    complete: rows.filter(row => row.status.complete).length,
    incomplete: rows.filter(row => !row.status.complete).length,
    missingDocs: rows.filter(row => !row.status.docsOk).length,
  };

  const clearDependent = () => { setBrand('all'); setModel('all'); setMountingKind('all'); setMountingSystem('all'); };
  const clearFilters = () => { setCategory('all'); clearDependent(); setQuality('all'); setSearch(''); };
  const openNew = () => { setEditProduct(null); setFixMode(false); setMountingMeta({ mounting_item_type: 'mounting', mounting_system_name: '' }); setShowModal(true); };
  const openEdit = raw => {
    const meta = productMeta(raw);
    setEditProduct(raw);
    setFixMode(false);
    setMountingMeta({ mounting_item_type: inferMountingType(raw, meta), mounting_system_name: meta.mounting_system_name || raw.brand || '' });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditProduct(null); setFixMode(false); window.sessionStorage.removeItem(PENDING_META_KEY); };

  const deleteProduct = async product => {
    if (!canEditProduct(user || {}, product)) return;
    if (!window.confirm('Ta bort produkten?')) return;
    await deleteTenantProduct(product);
    setProducts(current => current.filter(item => item.id !== product.id));
  };

  const afterSave = async ({ continueToNext = false, savedProductId } = {}) => {
    const fresh = await load();
    if (continueToNext) {
      const incomplete = fresh.map(raw => ({ raw, product: hydrate(raw) })).map(row => ({ ...row, status: productStatus(row.product) })).filter(row => !row.status.complete);
      const currentIndex = incomplete.findIndex(row => row.raw.id === savedProductId);
      const next = currentIndex >= 0 ? incomplete[currentIndex + 1] : incomplete[0];
      if (next) { openEdit(next.raw); setFixMode(true); return; }
      setMessage('Klart. Inga fler ofullständiga produkter finns.');
    }
    closeModal();
  };

  const openFirstIncomplete = () => {
    const first = rows.find(row => !row.status.complete && canEditProduct(user || {}, row.raw));
    if (!first) { setMessage('Inga ofullständiga produkter hittades.'); return; }
    openEdit(first.raw);
    setFixMode(true);
  };

  const access = resolveAccessContext(user || {});
  const canCreateProduct = access.isSuperadmin || access.isCompanyAdmin;
  const canFixIncomplete = rows.some(row => !row.status.complete && canEditProduct(user || {}, row.raw));

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-2xl font-bold">Produktsortiment</h1><p className="mt-1 text-sm text-muted-foreground">{products.length} produkter totalt</p></div>
        <div className="flex flex-wrap gap-2"><ProductCatalogImporter products={products} onDone={load} /><Button variant="outline" onClick={openFirstIncomplete} disabled={!canFixIncomplete} className="gap-2"><Wrench className="h-4 w-4" />Fixa ofullständig</Button>{canCreateProduct && <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />Lägg till produkt</Button>}</div>
      </div>

      {message && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={stats.total} label="Totalt" />
        <Stat value={stats.complete} label="Kompletta" tone="green" />
        <Stat value={stats.incomplete} label="Ofullständiga" tone="amber" />
        <Stat value={stats.missingDocs} label="Saknar dokument" tone="amber" />
      </div>

      <div className="mb-5 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterSelect label="Kategori" value={category} onChange={value => { setCategory(value); clearDependent(); }}><SelectItem value="all">Alla kategorier</SelectItem>{CATEGORY_ORDER.map(key => <SelectItem key={key} value={key}>{CATEGORY_CONFIG[key].label}</SelectItem>)}</FilterSelect>
          {category !== 'all' && category !== 'montagesystem' && <FilterSelect label="Märke" value={brand} onChange={value => { setBrand(value); setModel('all'); }}><SelectItem value="all">Alla märken</SelectItem>{brandOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</FilterSelect>}
          {category === 'montagesystem' && <FilterSelect label="Produkttyp" value={mountingKind} onChange={value => { setMountingKind(value); setMountingSystem('all'); setModel('all'); }}><SelectItem value="all">Montage och tillbehör</SelectItem><SelectItem value="mounting">Montage</SelectItem><SelectItem value="accessory">Tillbehör</SelectItem></FilterSelect>}
          {category === 'montagesystem' && mountingKind !== 'all' && <FilterSelect label="System" value={mountingSystem} onChange={value => { setMountingSystem(value); setModel('all'); }}><SelectItem value="all">Alla system</SelectItem>{mountingSystemOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</FilterSelect>}
          {category !== 'all' && ((category !== 'montagesystem' && brand !== 'all') || (category === 'montagesystem' && mountingKind !== 'all' && mountingSystem !== 'all')) && <FilterSelect label="Modell" value={model} onChange={setModel}><SelectItem value="all">Alla modeller</SelectItem>{modelOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</FilterSelect>}
          <FilterSelect label="Status" value={quality} onChange={setQuality}><SelectItem value="all">Alla status</SelectItem><SelectItem value="incomplete">Ofullständiga</SelectItem><SelectItem value="missing-docs">Saknar dokument</SelectItem><SelectItem value="missing-technical">Saknar teknisk data</SelectItem><SelectItem value="missing-clamp">Saknar klämzon</SelectItem></FilterSelect>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök produkt, märke, modell eller artikelnummer..." className="pl-9" /></div><Button variant="outline" onClick={clearFilters}>Rensa filter</Button></div>
      </div>

      <div className="mb-4 text-xs text-muted-foreground">Visar {filteredRows.length} av {products.length} produkter.</div>
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(index => <div key={index} className="h-44 animate-pulse rounded-2xl bg-muted" />)}</div> : filteredRows.length === 0 ? <div className="rounded-2xl border bg-card py-16 text-center"><Package className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" /><p className="text-muted-foreground">Inga produkter matchar filtren.</p></div> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filteredRows.map(({ raw, product, status }) => <ProductCard key={product.id} raw={raw} product={product} status={status} canEdit={canEditProduct(user || {}, raw)} onEdit={() => openEdit(raw)} onDelete={() => deleteProduct(raw)} />)}</div>
      )}

      {showModal && <>
        <ProductFormModal product={editProduct} onSave={afterSave} onClose={closeModal} fixMode={fixMode} hasNextProduct={stats.incomplete > 1} />
        <div className="fixed bottom-4 right-4 z-[70] w-[330px] rounded-2xl border border-orange-200 bg-white p-4 shadow-2xl">
          <div className="text-sm font-semibold text-slate-900">Klassificering för montagesystem</div>
          <p className="mt-1 text-xs text-slate-500">Använd dessa fält när kategorin i produktformuläret är Montagesystem.</p>
          <div className="mt-3 space-y-3">
            <FilterSelect label="Produkttyp" value={mountingMeta.mounting_item_type} onChange={value => setMountingMeta(current => ({ ...current, mounting_item_type: value }))}><SelectItem value="mounting">Montage</SelectItem><SelectItem value="accessory">Tillbehör</SelectItem></FilterSelect>
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">System/familj</span><Input value={mountingMeta.mounting_system_name} onChange={event => setMountingMeta(current => ({ ...current, mounting_system_name: event.target.value }))} placeholder="T.ex. Nordmount" /></label>
            <p className="text-[11px] text-slate-500">EPDM-rullar, dukar, skruvar, tätningar, ändlock och kabelklämmor ska klassas som Tillbehör.</p>
          </div>
        </div>
      </>}
    </div>
  );
}

function Stat({ value, label, tone = 'neutral' }) {
  const cls = tone === 'green' ? 'border-green-200 bg-green-50 text-green-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'bg-card';
  return <div className={`rounded-2xl border p-3 ${cls}`}><div className="text-2xl font-bold">{value}</div><div className="text-xs">{label}</div></div>;
}

function ProductCard({ raw, product, status, canEdit, onEdit, onDelete }) {
  const config = CATEGORY_CONFIG[product.category] || CATEGORY_CONFIG.ovrigt;
  const Icon = config.icon;
  return <article className={`rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md ${status.complete ? 'border-green-200' : 'border-amber-200'}`}>
    <div className="mb-3 flex items-start justify-between gap-2"><div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}><Icon className="h-3 w-3" />{config.label}</span>{isStandardProduct(raw) && <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Standard</span>}{product.category === 'montagesystem' && <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${product.mounting_item_type === 'accessory' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{product.mounting_item_type === 'accessory' ? 'Tillbehör' : 'Montage'}</span>}</div><div className="flex items-center gap-1"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${status.complete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{status.complete ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{status.complete ? 'Komplett' : 'Ofullständig'}</span>{canEdit && <><button type="button" onClick={onEdit} className="rounded-lg p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={onDelete} className="rounded-lg p-1.5 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button></>}</div></div>
    <ProductVisual product={raw} className="mb-3 h-28 w-full" />
    <h3 className="text-sm font-semibold">{product.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ')}</p>{product.category === 'montagesystem' && <p className="mt-1 text-xs font-medium text-amber-800">System: {product.mounting_system_name}</p>}
    <div className="mt-3 flex items-center justify-between"><span className="text-lg font-bold text-primary">{Number(product.price || 0).toLocaleString('sv-SE')} kr</span><span className="text-xs text-muted-foreground">/{product.unit || 'st'}</span></div>
    <div className="mt-4 flex flex-wrap gap-1.5">{status.requiresDocuments && <StatusPill ok={status.hasDatasheet}><FileText className="h-3 w-3" />Datablad</StatusPill>}{status.requiresDocuments && <StatusPill ok={status.hasManual}><FileText className="h-3 w-3" />Manual</StatusPill>}<StatusPill ok={status.technicalOk}><Zap className="h-3 w-3" />Teknisk data</StatusPill>{status.needsClamp && <StatusPill ok={status.clampOk}>Klämzon</StatusPill>}</div>
  </article>;
}
