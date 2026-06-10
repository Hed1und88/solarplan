import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, AlertTriangle, CheckCircle2, ShieldCheck, Database, Battery, Ruler, Zap, RefreshCw } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, createProductSnapshot, hydrateProductWithMeta, productDocuments, productHasRequiredDocuments } from '@/lib/productDocuments';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function productIsActive(product = {}) {
  const status = String(product.status || product.state || '').toLowerCase();
  return !product.deleted && !product.archived && !product.is_deleted && !product.removed && !['deleted', 'archived', 'inactive', 'removed'].includes(status);
}

function productById(products, id) {
  return products.find(product => String(product.id) === String(id) && productIsActive(product)) || null;
}

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function productKey(item = {}) {
  if (item.product_id) return `id:${item.product_id}`;
  return `identity:${[item.category, item.brand, item.model, item.name].map(norm).filter(Boolean).join('|')}`;
}

function score(data = {}) {
  return Object.values(data).filter(value => value !== null && value !== undefined && value !== '').length;
}

function uniqueDocuments(documents = []) {
  const seen = new Set();
  return documents.filter(doc => {
    const key = [doc.type, doc.file_url || doc.url, doc.name || doc.title].map(norm).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeProductData(base = {}, fallbackProduct = null) {
  const fromSnapshot = base?.technical_data_snapshot || {};
  const fallbackHydrated = fallbackProduct ? hydrateProductWithMeta(fallbackProduct) : {};
  return hydrateProductWithMeta({ ...fallbackHydrated, ...fromSnapshot, ...base });
}

function normalizeProjectProduct(entry = {}, fallbackProduct = null, source = 'Projekt') {
  if (!fallbackProduct) return null;
  const snapshot = entry.product_snapshot || entry.panelProductSnapshot || entry.snapshot || null;
  const base = snapshot || createProductSnapshot(fallbackProduct) || entry;
  const productData = mergeProductData(base, fallbackProduct);
  const docs = productDocuments({ ...productData, documents_snapshot: entry.documents_snapshot || base.documents_snapshot });
  const item = {
    id: entry.product_id || entry.panelProductId || productData.product_id || productData.id || fallbackProduct.id || '',
    product_id: entry.product_id || entry.panelProductId || productData.product_id || productData.id || fallbackProduct.id || '',
    name: entry.product_name || productData.name || fallbackProduct.name || 'Produkt',
    brand: productData.brand || fallbackProduct.brand || '',
    model: productData.model || fallbackProduct.model || '',
    category: productData.category || fallbackProduct.category || 'ovrigt',
    sources: [source],
    source,
    hasSnapshot: Boolean(snapshot || entry.product_snapshot || entry.documents_snapshot?.length),
    documents_snapshot: uniqueDocuments(docs),
    product_data: productData,
  };
  item.product_key = productKey(item);
  return item;
}

function mergeDuplicate(existing, incoming) {
  const sources = Array.from(new Set([...(existing.sources || []), ...(incoming.sources || [])]));
  const documents = uniqueDocuments([...(existing.documents_snapshot || []), ...(incoming.documents_snapshot || [])]);
  const productData = score(incoming.product_data) > score(existing.product_data) ? incoming.product_data : existing.product_data;
  return {
    ...existing,
    name: existing.name || incoming.name,
    brand: existing.brand || incoming.brand,
    model: existing.model || incoming.model,
    category: existing.category || incoming.category,
    hasSnapshot: existing.hasSnapshot || incoming.hasSnapshot,
    sources,
    source: sources.join(', '),
    documents_snapshot: documents,
    product_data: productData,
  };
}

function pushUnique(list, entry) {
  if (!entry?.product_id) return;
  const key = entry.product_key || productKey(entry);
  const index = list.findIndex(item => (item.product_key || productKey(item)) === key);
  if (index === -1) list.push({ ...entry, product_key: key });
  else list[index] = mergeDuplicate(list[index], entry);
}

function collectProjectProducts(project = {}, products = []) {
  const list = [];

  (Array.isArray(project?.selected_products) ? project.selected_products : []).forEach(item => {
    const product = productById(products, item.product_id);
    pushUnique(list, normalizeProjectProduct(item, product, 'Produktfliken'));
  });

  const planner = safeJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  (planner?.roofs || []).forEach(roof => {
    const productId = roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id;
    const product = productById(products, productId);
    if (!product) return;
    pushUnique(list, normalizeProjectProduct({ product_id: productId, product_name: roof.panelProductSnapshot?.name || product.name, product_snapshot: roof.panelProductSnapshot }, product, `Paneler / ${roof.name || 'Tak'}`));
  });

  const stringData = safeJson(project?.string_layout_data, null);
  (stringData?.inverterConfigs || []).forEach((cfg, index) => {
    const productId = cfg.productId || cfg.productSnapshot?.product_id || cfg.productSnapshot?.id;
    const product = productById(products, productId);
    if (!product) return;
    pushUnique(list, normalizeProjectProduct({ product_id: productId, product_name: cfg.productSnapshot?.name || cfg.name || product.name || `Växelriktare ${index + 1}`, product_snapshot: cfg.productSnapshot }, product, `Slingor / ${cfg.name || `Växelriktare ${index + 1}`}`));
  });

  const mounting = safeJson(project?.mounting_data, null);
  if (mounting?.selectedPanelId) {
    const product = productById(products, mounting.selectedPanelId);
    pushUnique(list, normalizeProjectProduct({ product_id: mounting.selectedPanelId, product_name: mounting.selectedPanelName, product_snapshot: mounting.selectedPanelSnapshot }, product, 'Montage'));
  }

  return list;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function usableBatteryKwh(product = {}) {
  const explicit = num(product.usable_capacity_kwh);
  if (explicit) return explicit;
  const capacity = num(product.capacity_kwh);
  const dod = num(product.dod_percent) || 90;
  if (!capacity) return null;
  return Math.round(capacity * dod) / 100;
}

function snapshotFromProduct(products, productId) {
  const product = productById(products, productId);
  return product ? createProductSnapshot(product) : null;
}

function refreshProjectSnapshots(project = {}, products = []) {
  const patch = {};
  let updated = 0;

  if (Array.isArray(project.selected_products)) {
    patch.selected_products = project.selected_products.map(item => {
      const snapshot = snapshotFromProduct(products, item.product_id);
      if (!snapshot) return item;
      updated += 1;
      return { ...item, product_name: snapshot.name || item.product_name, product_snapshot: snapshot, documents_snapshot: snapshot.documents_snapshot || [], technical_snapshot: snapshot.technical_data_snapshot || {}, snapshot_created_at: snapshot.snapshot_created_at };
    });
  }

  const planner = safeJson(project.solar_roof_planner_data || project.panel_layout_data, null);
  if (planner?.roofs) {
    const nextPlanner = { ...planner, roofs: planner.roofs.map(roof => {
      const snapshot = snapshotFromProduct(products, roof.panelProductId);
      if (!snapshot) return roof;
      updated += 1;
      return { ...roof, panelProductSnapshot: snapshot };
    }) };
    const serialized = JSON.stringify(nextPlanner);
    if (project.solar_roof_planner_data !== undefined) patch.solar_roof_planner_data = serialized;
    else patch.panel_layout_data = serialized;
  }

  const stringData = safeJson(project.string_layout_data, null);
  if (stringData) {
    const nextStringData = {
      ...stringData,
      inverterConfigs: Array.isArray(stringData.inverterConfigs) ? stringData.inverterConfigs.map(item => {
        const snapshot = snapshotFromProduct(products, item.productId);
        if (!snapshot) return item;
        updated += 1;
        return { ...item, productSnapshot: snapshot };
      }) : stringData.inverterConfigs,
    };
    patch.string_layout_data = JSON.stringify(nextStringData);
  }

  const mounting = safeJson(project.mounting_data, null);
  if (mounting?.selectedPanelId) {
    const snapshot = snapshotFromProduct(products, mounting.selectedPanelId);
    if (snapshot) {
      updated += 1;
      patch.mounting_data = JSON.stringify({ ...mounting, selectedPanelSnapshot: snapshot });
    }
  }

  return { patch, updated };
}

function ProductTechSummary({ product }) {
  const data = product.product_data || {};
  if (product.category === 'batteri') {
    const usable = usableBatteryKwh(data);
    const items = [data.capacity_kwh && `Nominell: ${data.capacity_kwh} kWh`, usable && `Användbar: ${usable} kWh vid ${data.dod_percent || 90}% DoD`, data.module_capacity_kwh && `Modul: ${data.module_capacity_kwh} kWh`, data.max_modules_per_stack && `Max stapel: ${data.max_modules_per_stack} moduler`, (data.width_mm || data.height_mm || data.depth_mm) && `Mått: ${[data.width_mm, data.height_mm, data.depth_mm].filter(Boolean).join(' × ')} mm`, (data.clearance_side_mm || data.clearance_top_mm) && `Avstånd: sida ${data.clearance_side_mm || '-'} mm, ovan ${data.clearance_top_mm || '-'} mm`, data.ip_rating && `IP-klass: ${data.ip_rating}`, data.installation_location && `Placering: ${data.installation_location}`].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Battery} title="Batteridata" items={items} />;
  }
  if (product.category === 'solpanel') {
    const items = [data.power_watts && `Effekt: ${data.power_watts} W`, (data.width_mm || data.height_mm) && `Mått: ${[data.width_mm, data.height_mm].filter(Boolean).join(' × ')} mm`, data.voc_v && `Voc: ${data.voc_v} V`, data.vmp_v && `Vmp: ${data.vmp_v} V`, data.isc_a && `Isc: ${data.isc_a} A`, data.imp_a && `Imp: ${data.imp_a} A`].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Ruler} title="Paneldata" items={items} />;
  }
  if (product.category === 'vaxelriktare') {
    const items = [data.power_watts && `AC-effekt: ${data.power_watts} W`, data.max_dc_voltage_v && `Max DC: ${data.max_dc_voltage_v} V`, data.startup_voltage_v && `Start: ${data.startup_voltage_v} V`, (data.mppt_voltage_min_v || data.mppt_voltage_max_v) && `MPPT: ${data.mppt_voltage_min_v || '-'}–${data.mppt_voltage_max_v || '-'} V`, data.mppt_count && `MPPT: ${data.mppt_count} st`, data.max_input_current_a && `Max ingångsström: ${data.max_input_current_a} A`].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Zap} title="Växelriktardata" items={items} />;
  }
  return null;
}

function SummaryBox({ icon: Icon, title, items }) {
  return <div className="mt-3 rounded-xl border bg-muted/20 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</div><div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{items.map(item => <div key={item}>• {item}</div>)}</div></div>;
}

export default function ProjectDocumentsTab({ project, products = [], onUpdate }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const projectProducts = useMemo(() => collectProjectProducts(project, products), [project, products]);
  const missing = projectProducts.filter(product => !productHasRequiredDocuments({ documents_snapshot: product.documents_snapshot }));

  const handleRefreshSnapshots = async () => {
    if (!onUpdate) return;
    setRefreshing(true);
    setRefreshMsg('');
    const { patch, updated } = refreshProjectSnapshots(project, products);
    if (!updated || Object.keys(patch).length === 0) {
      setRefreshMsg('Inga snapshots kunde uppdateras. Kontrollera att produkterna fortfarande finns i Produktsortimentet.');
      setRefreshing(false);
      return;
    }
    await onUpdate(patch);
    setRefreshMsg(`${updated} snapshot(s) uppdaterade och sparade i projektet.`);
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" /> Dokument för projektets produkter</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Endast aktiva produkter som fortfarande finns i Produktsortimentet visas. Slingor räknas inte som produkter.</p>
            </div>
            <Button onClick={handleRefreshSnapshots} disabled={refreshing || !products.length || !projectProducts.length || !onUpdate} variant="outline" size="sm" className="gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Uppdaterar...' : 'Uppdatera projektsnapshots'}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {refreshMsg && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{refreshMsg}</div>}
          {projectProducts.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Inga aktiva produkter är kopplade till projektet ännu. Välj panel i Paneler/Montage eller lägg till produkter i Produktfliken.</div> : <>
            {missing.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{missing.length} unik(a) produkt(er) saknar manual eller datablad.</div>}
            <div className="space-y-3">
              {projectProducts.map(product => {
                const docs = product.documents_snapshot || [];
                const hasRequired = productHasRequiredDocuments({ documents_snapshot: docs });
                return <div key={product.product_key || product.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{product.name}</p>{product.hasSnapshot && <Badge className="bg-green-100 text-green-700 border-green-200"><Database className="mr-1 h-3 w-3" />Produktdata sparad</Badge>}{docs.length > 0 && <Badge variant="outline" className="text-xs"><ShieldCheck className="mr-1 h-3 w-3" />{docs.length} dokument</Badge>}</div>
                      <p className="text-sm text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ') || product.category}</p>
                      <p className="text-xs text-muted-foreground">Källor: {(product.sources || [product.source]).filter(Boolean).join(', ')}</p>
                    </div>
                    <Badge className={hasRequired ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>{hasRequired ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{hasRequired ? 'Dokument OK' : 'Dokument saknas'}</Badge>
                  </div>
                  <ProductTechSummary product={product} />
                  {docs.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{docs.map(doc => <a key={doc.id || `${doc.type}-${doc.file_url}`} href={doc.file_url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm hover:bg-muted"><span className="min-w-0"><span className="block font-medium truncate">{doc.name}</span><span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.type] || 'Dokument'}</span></span><FileText className="h-4 w-4 shrink-0 text-primary" /></a>)}</div> : <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Inga uppladdade dokument hittades för denna produkt. Lägg in manual/datablad i Produktsortimentet och uppdatera projektsnapshots.</p>}
                </div>;
              })}
            </div>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
