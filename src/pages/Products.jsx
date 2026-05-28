import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Package, Pencil, Trash2, Sun, Battery, Zap, Cable, Box, CheckCircle2, AlertTriangle, FileText, Ruler, Layers, Move3D, ListChecks, Wrench } from 'lucide-react';
import ProductFormModal from '@/components/products/ProductFormModal';
import ProductCatalogImporter from '@/components/products/ProductCatalogImporter';
import ProductVisual from '@/components/products/ProductVisual';
import { productDocuments, productMeta, resolveProductClampZone } from '@/lib/productDocuments';

const categoryConfig = {
  solpanel: { label: 'Solpanel', icon: Sun, color: 'bg-orange-100 text-orange-700' },
  batteri: { label: 'Batteri', icon: Battery, color: 'bg-green-100 text-green-700' },
  vaxelriktare: { label: 'Växelriktare', icon: Zap, color: 'bg-blue-100 text-blue-700' },
  optimerare: { label: 'Optimerare', icon: Zap, color: 'bg-purple-100 text-purple-700' },
  kabel: { label: 'Kabel', icon: Cable, color: 'bg-gray-100 text-gray-700' },
  montagesystem: { label: 'Montagesystem', icon: Box, color: 'bg-yellow-100 text-yellow-700' },
  ovrigt: { label: 'Övrigt', icon: Package, color: 'bg-gray-100 text-gray-700' },
};

const META_FIELDS = [
  'module_capacity_kwh',
  'usable_capacity_kwh',
  'dod_percent',
  'modules_count',
  'max_modules_per_stack',
  'max_battery_modules',
  'depth_mm',
  'module_weight_kg',
  'base_weight_kg',
  'bms_weight_kg',
  'clearance_front_mm',
  'clearance_back_mm',
  'clearance_side_mm',
  'clearance_top_mm',
  'clearance_bottom_mm',
  'installation_location',
  'ip_rating',
  'capacity_kwh',
  'width_mm',
  'height_mm',
  'weight_kg',
];

const qualityFilters = [
  { value: 'alla', label: 'Alla status' },
  { value: 'ofullstandiga', label: 'Ofullständiga' },
  { value: 'saknar_dokument', label: 'Saknar dokument' },
  { value: 'saknar_teknisk', label: 'Saknar teknisk data' },
  { value: 'saknar_klamzon', label: 'Saknar klämzon' },
  { value: 'saknar_batteridata', label: 'Saknar batteridata' },
];

function hydrateProduct(product = {}) {
  const meta = productMeta(product);
  const fromMeta = META_FIELDS.reduce((acc, key) => {
    if (product[key] === undefined || product[key] === null || product[key] === '') acc[key] = meta[key];
    return acc;
  }, {});
  return { ...product, ...fromMeta, _productMeta: meta };
}

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const number = Number(value);
    return Number.isFinite(number) ? number > 0 : value.trim().length > 0;
  }
  return true;
}

function requiredTechnicalFields(product = {}) {
  if (product.category === 'solpanel') {
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
  if (product.category === 'vaxelriktare') {
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
  if (product.category === 'batteri') {
    return [
      ['capacity_kwh', 'nominell kWh'],
      ['module_capacity_kwh', 'kWh per modul'],
      ['max_modules_per_stack', 'max moduler i stapel'],
      ['width_mm', 'bredd'],
      ['height_mm', 'höjd'],
      ['depth_mm', 'djup'],
      ['clearance_side_mm', 'sidavstånd'],
      ['clearance_top_mm', 'avstånd ovanför'],
    ];
  }
  if (product.category === 'kabel') return [['length_m', 'längd']].filter(([key]) => product[key] !== undefined);
  return [];
}

function usableBatteryKwh(product = {}) {
  const explicit = Number(product.usable_capacity_kwh);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const capacity = Number(product.capacity_kwh);
  const dod = Number(product.dod_percent || 90);
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  return Math.round(capacity * (Number.isFinite(dod) ? dod : 90)) / 100;
}

function productCompleteness(rawProduct = {}) {
  const product = hydrateProduct(rawProduct);
  const docs = productDocuments(product);
  const hasManual = docs.some(doc => doc.type === 'manual');
  const hasDatasheet = docs.some(doc => doc.type === 'datasheet');
  const technicalFields = requiredTechnicalFields(product);
  const missingTechnical = technicalFields.filter(([key]) => !hasValue(product[key])).map(([, label]) => label);
  const clamp = resolveProductClampZone(product);
  const needsClamp = product.category === 'solpanel';
  const technicalOk = missingTechnical.length === 0;
  const docsOk = hasManual && hasDatasheet;
  const clampOk = !needsClamp || clamp.hasProductZone;
  return { docs, hasManual, hasDatasheet, docsOk, technicalOk, missingTechnical, needsClamp, clampOk, clamp, complete: docsOk && technicalOk && clampOk };
}

function issueFlags(product = {}, status = {}) {
  return {
    incomplete: !status.complete,
    missingDocs: !status.docsOk,
    missingTechnical: !status.technicalOk,
    missingClamp: status.needsClamp && !status.clampOk,
    missingBatteryData: product.category === 'batteri' && !status.technicalOk,
  };
}

function qualityMatches(filter, product, status) {
  const flags = issueFlags(product, status);
  if (filter === 'ofullstandiga') return flags.incomplete;
  if (filter === 'saknar_dokument') return flags.missingDocs;
  if (filter === 'saknar_teknisk') return flags.missingTechnical;
  if (filter === 'saknar_klamzon') return flags.missingClamp;
  if (filter === 'saknar_batteridata') return flags.missingBatteryData;
  return true;
}

function countBy(products, predicate) {
  return products.reduce((sum, item) => sum + (predicate(item) ? 1 : 0), 0);
}

function StatusPill({ ok, children, icon: Icon }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{Icon && <Icon className="h-3 w-3" />}{children}</span>;
}

function QualityStat({ label, value, tone = 'neutral', onClick }) {
  const toneClass = tone === 'green' ? 'border-green-200 bg-green-50 text-green-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-border bg-card text-foreground';
  return <button onClick={onClick} className={`rounded-2xl border p-3 text-left transition-colors hover:bg-muted/40 ${toneClass}`}><div className="text-2xl font-bold leading-none">{value}</div><div className="mt-1 text-xs font-medium">{label}</div></button>;
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [filterCat, setFilterCat] = useState('alla');
  const [filterQuality, setFilterQuality] = useState('alla');
  const [fixMode, setFixMode] = useState(false);
  const [fixMessage, setFixMessage] = useState('');

  const load = async () => {
    const data = await base44.entities.Product.list('-created_date');
    setProducts(data);
    setLoading(false);
    return data;
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Ta bort produkt?')) return;
    await base44.entities.Product.delete(id);
    setProducts(p => p.filter(x => x.id !== id));
  };

  const buildRows = (items) => items.map(rawProduct => {
    const product = hydrateProduct(rawProduct);
    const status = productCompleteness(product);
    return { rawProduct, product, status };
  });

  const productRows = buildRows(products);

  const filteredRows = productRows.filter(({ product, status }) => {
    const catOk = filterCat === 'alla' || product.category === filterCat;
    return catOk && qualityMatches(filterQuality, product, status);
  });

  const fixRows = filteredRows.filter(row => !row.status.complete);

  const openFixProduct = (row) => {
    if (!row) return;
    setFixMode(true);
    setEditProduct(row.rawProduct);
    setShowModal(true);
    setFixMessage('');
  };

  const openFirstFixProduct = () => {
    if (!fixRows.length) {
      setFixMessage('Inga ofullständiga produkter matchar aktiva filter.');
      return;
    }
    openFixProduct(fixRows[0]);
  };

  const openNextFixProduct = (freshProducts, savedProductId) => {
    const freshRows = buildRows(freshProducts).filter(({ product, status }) => {
      const catOk = filterCat === 'alla' || product.category === filterCat;
      return catOk && qualityMatches(filterQuality, product, status) && !status.complete;
    });
    const currentIndex = freshRows.findIndex(row => row.rawProduct.id === savedProductId);
    const next = currentIndex >= 0 ? freshRows[currentIndex + 1] : freshRows[0];
    if (next) {
      setEditProduct(next.rawProduct);
      setShowModal(true);
      setFixMode(true);
      setFixMessage(`Nästa produkt öppnad: ${next.product.name}`);
    } else {
      setShowModal(false);
      setEditProduct(null);
      setFixMode(false);
      setFixMessage('Klart. Inga fler ofullständiga produkter matchar aktiva filter.');
    }
  };

  const handleSave = async ({ continueToNext = false, savedProductId } = {}) => {
    const freshProducts = await load();
    if (continueToNext) {
      openNextFixProduct(freshProducts, savedProductId);
      return;
    }
    setShowModal(false);
    setEditProduct(null);
    setFixMode(false);
  };

  const stats = {
    total: productRows.length,
    complete: countBy(productRows, row => row.status.complete),
    incomplete: countBy(productRows, row => !row.status.complete),
    missingDocs: countBy(productRows, row => !row.status.docsOk),
    missingTechnical: countBy(productRows, row => !row.status.technicalOk),
    missingClamp: countBy(productRows, row => row.status.needsClamp && !row.status.clampOk),
    missingBatteryData: countBy(productRows, row => row.product.category === 'batteri' && !row.status.technicalOk),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div><h1 className="text-2xl font-bold">Produktsortiment</h1><p className="text-muted-foreground text-sm mt-1">{products.length} produkter totalt</p></div>
        <div className="flex flex-wrap justify-end gap-2">
          <ProductCatalogImporter products={products} onDone={load} />
          <button onClick={openFirstFixProduct} disabled={!fixRows.length} className="flex items-center gap-2 border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"><Wrench className="w-4 h-4" /> Fixa första ofullständiga</button>
          <button onClick={() => { setEditProduct(null); setFixMode(false); setShowModal(true); }} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"><Plus className="w-4 h-4" /> Lägg till produkt</button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Produkter bör inte användas i projekt förrän manual, datablad och produktspecifik teknisk data är komplett. Klämzon krävs bara för solpaneler.</div>
      {fixMessage && <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{fixMessage}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <QualityStat label="Totalt" value={stats.total} onClick={() => setFilterQuality('alla')} />
        <QualityStat label="Kompletta" value={stats.complete} tone="green" onClick={() => setFilterQuality('alla')} />
        <QualityStat label="Ofullständiga" value={stats.incomplete} tone="amber" onClick={() => setFilterQuality('ofullstandiga')} />
        <QualityStat label="Saknar dokument" value={stats.missingDocs} tone="amber" onClick={() => setFilterQuality('saknar_dokument')} />
        <QualityStat label="Saknar teknisk" value={stats.missingTechnical} tone="amber" onClick={() => setFilterQuality('saknar_teknisk')} />
        <QualityStat label="Saknar klämzon" value={stats.missingClamp} tone="red" onClick={() => setFilterQuality('saknar_klamzon')} />
        <QualityStat label="Saknar batteridata" value={stats.missingBatteryData} tone="red" onClick={() => setFilterQuality('saknar_batteridata')} />
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {['alla', ...Object.keys(categoryConfig)].map(cat => <button key={cat} onClick={() => setFilterCat(cat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${filterCat === cat ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}>{cat === 'alla' ? 'Alla kategorier' : categoryConfig[cat].label}</button>)}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {qualityFilters.map(filter => <button key={filter.value} onClick={() => setFilterQuality(filter.value)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${filterQuality === filter.value ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:border-primary/50'}`}><ListChecks className="h-3.5 w-3.5" /> {filter.label}</button>)}
        {(filterCat !== 'alla' || filterQuality !== 'alla') && <button onClick={() => { setFilterCat('alla'); setFilterQuality('alla'); }} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Rensa filter</button>}
      </div>

      <div className="mb-4 text-xs text-muted-foreground">Visar {filteredRows.length} av {products.length} produkter. {fixRows.length > 0 && `${fixRows.length} behöver fixas i denna vy.`}</div>

      {loading ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />)}</div> : filteredRows.length === 0 ? <div className="text-center py-16 bg-card rounded-2xl border border-border"><Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground">Inga produkter matchar filtren</p></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRows.map(({ rawProduct, product, status }) => {
            const cat = categoryConfig[product.category] || categoryConfig.ovrigt;
            const Icon = cat.icon;
            const usableKwh = product.category === 'batteri' ? usableBatteryKwh(product) : null;
            return <div key={product.id} className={`bg-card rounded-2xl border p-4 hover:shadow-md transition-shadow group ${status.complete ? 'border-green-200' : 'border-amber-200'}`}>
              <div className="flex items-start justify-between mb-3 gap-2"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cat.color}`}><Icon className="w-3 h-3" />{cat.label}</span><div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${status.complete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{status.complete ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{status.complete ? 'Komplett' : 'Ofullständig'}</span><div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditProduct(rawProduct); setFixMode(false); setShowModal(true); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button><button onClick={() => handleDelete(product.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button></div></div></div>
              <ProductVisual product={rawProduct} className="w-full h-28 mb-3" />
              <h3 className="font-semibold text-sm text-foreground leading-snug">{product.name}</h3>
              {product.brand && <p className="text-xs text-muted-foreground mt-0.5">{product.brand} {product.model}</p>}
              <div className="mt-3 flex items-center justify-between"><p className="text-lg font-bold text-primary">{product.price?.toLocaleString('sv-SE')} kr</p><p className="text-xs text-muted-foreground">/{product.unit || 'st'}</p></div>
              {(product.power_watts || product.capacity_kwh) && <div className="mt-2 flex flex-wrap gap-3">{product.power_watts && <span className="text-xs text-muted-foreground">{product.power_watts}W</span>}{product.capacity_kwh && <span className="text-xs text-muted-foreground">{product.capacity_kwh}kWh nominellt</span>}{usableKwh && <span className="text-xs text-green-700">{usableKwh}kWh vid {product.dod_percent || 90}% DoD</span>}</div>}
              {product.category === 'batteri' && <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">{product.module_capacity_kwh && <span>Modul: {product.module_capacity_kwh} kWh</span>}{product.max_modules_per_stack && <span>Max stapel: {product.max_modules_per_stack} moduler</span>}{(product.width_mm || product.height_mm || product.depth_mm) && <span className="col-span-2">Mått: {[product.width_mm, product.height_mm, product.depth_mm].filter(Boolean).join(' × ')} mm</span>}{(product.clearance_side_mm || product.clearance_top_mm) && <span className="col-span-2">Avstånd: sida {product.clearance_side_mm || '-'} mm, ovan {product.clearance_top_mm || '-'} mm</span>}</div>}
              <div className="mt-4 flex flex-wrap gap-1.5"><StatusPill ok={status.hasDatasheet} icon={FileText}>Datablad</StatusPill><StatusPill ok={status.hasManual} icon={FileText}>Manual</StatusPill><StatusPill ok={status.technicalOk} icon={Zap}>Teknisk data</StatusPill>{product.category === 'batteri' && <StatusPill ok={hasValue(product.max_modules_per_stack)} icon={Layers}>Stapel</StatusPill>}{product.category === 'batteri' && <StatusPill ok={hasValue(product.clearance_side_mm) || hasValue(product.clearance_top_mm)} icon={Move3D}>Avstånd</StatusPill>}{status.needsClamp && <StatusPill ok={status.clampOk} icon={Ruler}>Klämzon</StatusPill>}</div>
              {!status.complete && <div className="mt-3 rounded-xl bg-muted/40 p-2 text-[11px] text-muted-foreground">{!status.hasDatasheet && <div>• Datablad saknas</div>}{!status.hasManual && <div>• Manual saknas</div>}{!status.technicalOk && <div>• Teknisk data saknas: {status.missingTechnical.join(', ')}</div>}{status.needsClamp && !status.clampOk && <div>• Klämzon saknas från manual/datablad</div>}<button onClick={() => openFixProduct({ rawProduct, product, status })} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"><Wrench className="h-3 w-3" /> Fixa</button></div>}
            </div>;
          })}
        </div>
      )}

      {showModal && <ProductFormModal product={editProduct} onSave={handleSave} onClose={() => { setShowModal(false); setEditProduct(null); setFixMode(false); }} fixMode={fixMode} hasNextProduct={fixRows.length > 1} />}
    </div>
  );
}
