import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import ProductVisual from '@/components/products/ProductVisual';
import { productMeta } from '@/lib/productDocuments';

const MANUFACTURER_ORDER = ['Nordmount', 'K2', 'Weland Stål', 'Mafi', 'Renusol', 'Van der Valk', 'Schletter'];

function labelFor(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Produkt';
}

function ProductThumb({ product }) {
  return <ProductVisual product={product} className="h-10 w-10" compact />;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();
}

function listValue(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return text.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
}

function canonicalRoof(value) {
  const text = normalize(value);
  if (text.includes('tegel')) return 'tegelpannor';
  if (text.includes('betong')) return 'betongpannor';
  if (text.includes('duk') || text.includes('membran')) return 'duktak';
  if (text.includes('papp') || text.includes('bitumen')) return 'papptak';
  if (text.includes('fals')) return 'falsat';
  if (text.includes('plegel')) return 'plegel';
  if (text.includes('plat')) return 'plattak';
  return text;
}

function mountingItemType(product) {
  const meta = productMeta(product || {});
  const stored = meta.mounting_item_type || product?.mounting_item_type;
  if (stored === 'accessory' || stored === 'mounting') return stored;
  const text = normalize(`${product?.name || ''} ${product?.model || ''}`);
  return /(epdm|rulle|duk|skruv|bult|mutter|bricka|tatning|kabelklamma|andlock|tillbehor)/.test(text) ? 'accessory' : 'mounting';
}

function manufacturerFor(product) {
  const meta = productMeta(product || {});
  return String(product?.brand || meta.manufacturer || meta.mounting_manufacturer || meta.mounting_system_name || product?.mounting_system_name || 'Övrigt').trim();
}

function compatibilityScore(product, roofMaterial) {
  const meta = productMeta(product || {});
  const roof = canonicalRoof(roofMaterial);
  const explicit = [
    product?.compatible_roof_types,
    product?.roof_types,
    product?.roof_materials,
    product?.mounting_roof_types,
    meta.compatible_roof_types,
    meta.compatibleRoofTypes,
    meta.roof_types,
    meta.roofMaterials,
    meta.mounting_roof_types,
  ].flatMap(listValue).map(canonicalRoof).filter(Boolean);

  if (explicit.length) return explicit.includes(roof) ? 3 : -1;

  const text = normalize([
    product?.name,
    product?.brand,
    product?.model,
    meta.mounting_system_name,
    meta.system_name,
  ].filter(Boolean).join(' '));

  if (text.includes('flow') || text.includes('ballast')) return ['duktak', 'papptak'].includes(roof) ? 2 : -1;
  if (text.includes('hyper meta') || text.includes('takpann') || text.includes('tegel') || text.includes('betong')) return ['tegelpannor', 'betongpannor'].includes(roof) ? 2 : -1;
  if (text.includes('fals')) return roof === 'falsat' ? 2 : -1;
  if (text.includes('plegel')) return roof === 'plegel' ? 2 : -1;
  if (text.includes('plat')) return ['plattak', 'plegel', 'falsat'].includes(roof) ? 2 : -1;
  if (text.includes('papp') || text.includes('bitumen')) return roof === 'papptak' ? 2 : -1;
  if (text.includes('duk') || text.includes('membran')) return roof === 'duktak' ? 2 : -1;
  return 0;
}

function attachmentOptions(product, roofMaterial) {
  if (!product) return [];
  const meta = productMeta(product || {});
  const stored = meta.attachment_methods || meta.mounting_attachment_methods || meta.attachmentMethods || meta.system_variants || meta.systemVariants;
  const explicit = listValue(stored).map((item, index) => {
    if (item && typeof item === 'object') {
      const label = item.label || item.name || item.attachmentMethod || item.value || `Alternativ ${index + 1}`;
      return {
        value: String(item.value || item.id || normalize(label).replace(/ /g, '_')),
        label,
        systemVariant: item.systemVariant || item.system_variant || item.variant || 'parallel',
      };
    }
    const label = String(item || '').trim();
    return label ? { value: normalize(label).replace(/ /g, '_'), label, systemVariant: 'parallel' } : null;
  }).filter(Boolean);
  if (explicit.length) return explicit;

  const roof = canonicalRoof(roofMaterial);
  const text = normalize(`${product.name || ''} ${product.brand || ''} ${product.model || ''} ${meta.mounting_system_name || ''}`);
  if (text.includes('flow') || (manufacturerFor(product).toLowerCase().includes('nordmount') && ['duktak', 'papptak'].includes(roof))) {
    return [
      { value: 'flow_parallel_ballasted', label: 'Parallellt ballasterat', systemVariant: 'flow_parallel_ballasted' },
      { value: 'flow_east_west_ballasted', label: 'Öst/Väst', systemVariant: 'flow_east_west_ballasted' },
      { value: 'flow_south_ballasted', label: 'Syd', systemVariant: 'flow_south_ballasted' },
      { value: 'flow_welded_hybrid', label: 'Svetsad/Hybrid', systemVariant: 'flow_welded_hybrid' },
    ];
  }
  if (text.includes('hyper meta') || ['tegelpannor', 'betongpannor'].includes(roof)) {
    return [
      { value: 'barlakt', label: 'Bärläkt', systemVariant: 'parallel' },
      { value: 'raspant_vant_faste', label: 'Råspånt Vänt Fäste', systemVariant: 'parallel' },
      { value: 'raspant_utan_vandning', label: 'Råspånt Utan vändning', systemVariant: 'parallel' },
    ];
  }
  return [{ value: normalize(roofMaterial).replace(/ /g, '_') || 'parallel', label: roofMaterial || 'Standardinfästning', systemVariant: 'parallel' }];
}

function sectionByTitle(scope, title) {
  return Array.from(scope?.querySelectorAll('section') || []).find(section => {
    const heading = section.firstElementChild?.textContent || '';
    return heading.trim().startsWith(title);
  }) || null;
}

function readPlannerContext(root) {
  const scope = root?.closest('aside');
  if (!scope) return { roofName: '', roofIndex: 0, material: '', angle: '', panel: '' };
  const roofSection = sectionByTitle(scope, 'Tak');
  const roofButtons = Array.from(roofSection?.querySelectorAll('button') || []).filter(button => (button.textContent || '').trim());
  const activeRoofButton = roofButtons.find(button => String(button.className).includes('bg-orange-50')) || roofButtons[0];
  const roofIndex = Math.max(0, roofButtons.indexOf(activeRoofButton));
  const roofName = activeRoofButton?.querySelector('span')?.textContent?.trim() || activeRoofButton?.textContent?.trim() || '';

  const materialSection = sectionByTitle(scope, 'Taktyp');
  const materialButton = Array.from(materialSection?.querySelectorAll('button') || []).find(button => String(button.className).includes('bg-orange-50'));
  const material = materialButton?.textContent?.trim() || '';

  const angleSection = sectionByTitle(scope, 'Lutning');
  const angle = angleSection?.querySelector('input[type="number"]')?.value || '';

  const panelSection = sectionByTitle(scope, 'Solpanel');
  const panel = panelSection?.querySelector('button')?.textContent?.trim() || '';
  return { roofName, roofIndex, material, angle, panel };
}

function currentProjectId() {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/\/projects\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function selectionStorageKey() {
  const projectId = currentProjectId();
  return projectId ? `solarplan:mounting-selection:${projectId}` : '';
}

function roofSelectionKey(context) {
  return `${context.roofIndex}:${context.roofName || 'tak'}`;
}

function readStoredSelection(context) {
  const key = selectionStorageKey();
  if (!key || typeof window === 'undefined') return null;
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || '{}');
    return data[roofSelectionKey(context)] || Object.values(data).find(item => item?.roofName === context.roofName || Number(item?.roofIndex) === Number(context.roofIndex)) || null;
  } catch {
    return null;
  }
}

function writeStoredSelection(context, selection) {
  const key = selectionStorageKey();
  if (!key || typeof window === 'undefined') return;
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || '{}');
    data[roofSelectionKey(context)] = { ...selection, roofName: context.roofName, roofIndex: context.roofIndex, material: context.material, savedAt: new Date().toISOString() };
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function ChoiceRow({ checked, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${checked ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
      <span className="min-w-0 truncate">{children}</span>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${checked ? 'border-slate-950 bg-slate-950' : 'border-slate-400 bg-white'}`}>
        {checked && <span className="h-1.5 w-2.5 rotate-[-45deg] border-b-2 border-l-2 border-white" />}
      </span>
    </button>
  );
}

function MountingWorkflow({ products, value, onChange }) {
  const rootRef = useRef(null);
  const [context, setContext] = useState({ roofName: '', roofIndex: 0, material: '', angle: '', panel: '' });
  const [manufacturer, setManufacturer] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const selected = products.find(product => String(product.id) === String(value)) || null;

  useEffect(() => {
    const root = rootRef.current;
    const scope = root?.closest('aside');
    if (!root || !scope) return undefined;
    const sync = () => {
      const next = readPlannerContext(root);
      setContext(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] });
    scope.addEventListener('click', sync, true);
    scope.addEventListener('input', sync, true);
    scope.addEventListener('change', sync, true);
    return () => {
      observer.disconnect();
      scope.removeEventListener('click', sync, true);
      scope.removeEventListener('input', sync, true);
      scope.removeEventListener('change', sync, true);
    };
  }, []);

  const mountingProducts = useMemo(() => products.filter(product => product?.is_active !== false && mountingItemType(product) !== 'accessory'), [products]);
  const compatibleProducts = useMemo(() => {
    const scored = mountingProducts.map(product => ({ product, score: compatibilityScore(product, context.material) }));
    const matched = scored.filter(item => item.score > 0).map(item => item.product);
    return matched.length ? matched : scored.filter(item => item.score >= 0).map(item => item.product);
  }, [mountingProducts, context.material]);

  const manufacturers = useMemo(() => {
    const values = Array.from(new Set(compatibleProducts.map(manufacturerFor).filter(Boolean)));
    return values.sort((a, b) => {
      const ai = MANUFACTURER_ORDER.findIndex(item => normalize(item) === normalize(a));
      const bi = MANUFACTURER_ORDER.findIndex(item => normalize(item) === normalize(b));
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b, 'sv');
    });
  }, [compatibleProducts]);

  const selectedManufacturer = selected ? manufacturerFor(selected) : manufacturer;
  const systems = compatibleProducts.filter(product => !selectedManufacturer || normalize(manufacturerFor(product)) === normalize(selectedManufacturer));
  const methods = useMemo(() => attachmentOptions(selected, context.material), [selected, context.material]);

  useEffect(() => {
    if (selected && !compatibleProducts.some(product => String(product.id) === String(selected.id))) {
      onChange('');
      setManufacturer('');
      setSelectedMethod('');
      return;
    }
    if (selected) setManufacturer(manufacturerFor(selected));
  }, [context.material, selected?.id, compatibleProducts, onChange]);

  useEffect(() => {
    const stored = readStoredSelection(context);
    if (stored && String(stored.productId || '') === String(value || '')) setSelectedMethod(stored.attachmentValue || '');
    else if (!selected) setSelectedMethod('');
  }, [context.roofName, context.roofIndex, context.material, value, selected]);

  const updateHiddenVariant = variant => {
    const section = rootRef.current?.closest('section');
    const select = section?.querySelector('select');
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(select, variant);
    else select.value = variant;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const chooseMethod = (method, productId = value) => {
    setSelectedMethod(method.value);
    updateHiddenVariant(method.systemVariant);
    writeStoredSelection(context, {
      productId,
      attachmentValue: method.value,
      attachmentMethod: method.label,
      systemVariant: method.systemVariant,
    });
  };

  const chooseManufacturer = nextManufacturer => {
    setManufacturer(nextManufacturer);
    setSelectedMethod('');
    if (!selected || normalize(manufacturerFor(selected)) !== normalize(nextManufacturer)) onChange('');
  };

  const chooseProduct = product => {
    onChange(product.id);
    setManufacturer(manufacturerFor(product));
    const options = attachmentOptions(product, context.material);
    if (options[0]) chooseMethod(options[0], product.id);
  };

  return (
    <div ref={rootRef} data-mounting-workflow="true" className="space-y-3">
      <style>{`[data-mounting-workflow="true"] + label { display: none !important; }`}</style>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-slate-500">Tillverkare</div>
        <div className="rounded-xl border border-slate-200 bg-white p-1">
          {manufacturers.length ? manufacturers.map(item => <ChoiceRow key={item} checked={normalize(selectedManufacturer) === normalize(item)} onClick={() => chooseManufacturer(item)}>{item}</ChoiceRow>) : <div className="px-2.5 py-3 text-xs text-slate-500">Inga kompatibla tillverkare finns för vald taktyp.</div>}
        </div>
      </div>

      {selectedManufacturer && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-500">System</div>
          <div className="rounded-xl border border-slate-200 bg-white p-1">
            {systems.length ? systems.map(product => <ChoiceRow key={product.id} checked={String(product.id) === String(value)} onClick={() => chooseProduct(product)}>{labelFor(product)}</ChoiceRow>) : <div className="px-2.5 py-3 text-xs text-slate-500">Tillverkaren saknar kompatibla system för vald taktyp.</div>}
          </div>
        </div>
      )}

      {selected && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-500">Infästning</div>
          <div className="rounded-xl border border-slate-200 bg-white p-1">
            {methods.map(method => <ChoiceRow key={method.value} checked={selectedMethod === method.value} onClick={() => chooseMethod(method)}>{method.label}</ChoiceRow>)}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <div className="font-semibold">Automatiskt materialunderlag</div>
        <div className="mt-0.5 text-blue-700">Skenor, klämmor, skruvar och fästen räknas ut när panelritningen sparas och läggs i projektets produkter.</div>
      </div>
    </div>
  );
}

export default function ProductSearchSelect({ label, products = [], value, onChange, placeholder = 'Sök eller välj produkt' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = products.find(product => String(product.id) === String(value)) || null;
  const isMountingWorkflow = /montagesystem för aktivt tak/i.test(String(label || ''));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(product => [product.name, product.brand, product.model, product.category].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [products, query]);

  if (isMountingWorkflow) return <MountingWorkflow products={products} value={value} onChange={onChange} />;

  return (
    <div className="relative space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground">
        {selected ? <ProductThumb product={selected} /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Search className="h-4 w-4 text-muted-foreground" /></div>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{selected ? labelFor(selected) : placeholder}</span>
          {selected && <span className="block truncate text-xs text-muted-foreground">{selected.name || selected.category}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Sök på märke, modell eller namn..." className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-72 overflow-auto p-1">
            {filtered.length === 0 ? <div className="px-3 py-4 text-sm text-muted-foreground">Ingen produkt hittades.</div> : filtered.map(product => (
              <button key={product.id} type="button" onClick={() => { onChange(product.id); setOpen(false); setQuery(''); }} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted ${String(product.id) === String(value) ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                <ProductThumb product={product} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{labelFor(product)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{product.name || product.category}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
