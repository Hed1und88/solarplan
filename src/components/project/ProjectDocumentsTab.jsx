import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, AlertTriangle, CheckCircle2, ShieldCheck, Database, Battery, Ruler, Zap } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, createProductSnapshot, hydrateProductWithMeta, productDocuments, productHasRequiredDocuments } from '@/lib/productDocuments';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function productById(products, id) {
  return products.find(product => String(product.id) === String(id)) || null;
}

function mergeProductData(base = {}, fallbackProduct = null) {
  const fromSnapshot = base?.technical_data_snapshot || {};
  const fallbackHydrated = fallbackProduct ? hydrateProductWithMeta(fallbackProduct) : {};
  return hydrateProductWithMeta({ ...fallbackHydrated, ...fromSnapshot, ...base });
}

function normalizeProjectProduct(entry = {}, fallbackProduct = null, source = 'Projekt') {
  const snapshot = entry.product_snapshot || entry.panelProductSnapshot || entry.snapshot || null;
  const base = snapshot || (fallbackProduct ? createProductSnapshot(fallbackProduct) : null) || entry;
  const productData = mergeProductData(base, fallbackProduct);
  const docs = productDocuments({ ...productData, documents_snapshot: entry.documents_snapshot || base.documents_snapshot });
  return {
    id: entry.product_id || entry.panelProductId || productData.product_id || productData.id || fallbackProduct?.id || `${source}-${entry.product_name || entry.name || 'produkt'}`,
    product_id: entry.product_id || entry.panelProductId || productData.product_id || productData.id || fallbackProduct?.id || '',
    name: entry.product_name || productData.name || fallbackProduct?.name || 'Produkt',
    brand: productData.brand || fallbackProduct?.brand || '',
    model: productData.model || fallbackProduct?.model || '',
    category: productData.category || fallbackProduct?.category || 'ovrigt',
    source,
    hasSnapshot: Boolean(snapshot || entry.product_snapshot || entry.documents_snapshot?.length),
    documents_snapshot: docs,
    product_data: productData,
  };
}

function pushUnique(list, entry) {
  const key = `${entry.product_id || entry.id}-${entry.source}`;
  if (!list.some(item => `${item.product_id || item.id}-${item.source}` === key)) list.push(entry);
}

function collectProjectProducts(project = {}, products = []) {
  const list = [];

  (Array.isArray(project?.selected_products) ? project.selected_products : []).forEach(item => {
    pushUnique(list, normalizeProjectProduct(item, productById(products, item.product_id), 'Produktfliken'));
  });

  const planner = safeJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  (planner?.roofs || []).forEach(roof => {
    if (!roof?.panelProductId && !roof?.panelProductSnapshot) return;
    pushUnique(list, normalizeProjectProduct({
      product_id: roof.panelProductId,
      product_name: roof.panelProductSnapshot?.name || roof.name,
      product_snapshot: roof.panelProductSnapshot,
    }, productById(products, roof.panelProductId), `Paneler / ${roof.name || 'Tak'}`));
  });

  const stringData = safeJson(project?.string_layout_data, null);
  (stringData?.strings || []).forEach(item => {
    if (!item?.panelProductId && !item?.panelProductSnapshot) return;
    pushUnique(list, normalizeProjectProduct({
      product_id: item.panelProductId,
      product_name: item.panelProductSnapshot?.name || item.name,
      product_snapshot: item.panelProductSnapshot,
    }, productById(products, item.panelProductId), `Slingor / ${item.name || 'Slinga'}`));
  });

  (stringData?.inverterConfigs || []).forEach((cfg, index) => {
    if (!cfg?.productId) return;
    const fallback = productById(products, cfg.productId);
    pushUnique(list, normalizeProjectProduct({
      product_id: cfg.productId,
      product_name: cfg.name || `Växelriktare ${index + 1}`,
      product_snapshot: fallback ? createProductSnapshot(fallback) : null,
    }, fallback, `Slingor / ${cfg.name || `Växelriktare ${index + 1}`}`));
  });

  const mounting = safeJson(project?.mounting_data, null);
  if (mounting?.selectedPanelId) {
    pushUnique(list, normalizeProjectProduct({ product_id: mounting.selectedPanelId, product_name: mounting.selectedPanelName }, productById(products, mounting.selectedPanelId), 'Montage'));
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

function ProductTechSummary({ product }) {
  const data = product.product_data || {};
  if (product.category === 'batteri') {
    const usable = usableBatteryKwh(data);
    const items = [
      data.capacity_kwh && `Nominell: ${data.capacity_kwh} kWh`,
      usable && `Användbar: ${usable} kWh vid ${data.dod_percent || 90}% DoD`,
      data.module_capacity_kwh && `Modul: ${data.module_capacity_kwh} kWh`,
      data.max_modules_per_stack && `Max stapel: ${data.max_modules_per_stack} moduler`,
      (data.width_mm || data.height_mm || data.depth_mm) && `Mått: ${[data.width_mm, data.height_mm, data.depth_mm].filter(Boolean).join(' × ')} mm`,
      (data.clearance_side_mm || data.clearance_top_mm) && `Avstånd: sida ${data.clearance_side_mm || '-'} mm, ovan ${data.clearance_top_mm || '-'} mm`,
      data.ip_rating && `IP-klass: ${data.ip_rating}`,
      data.installation_location && `Placering: ${data.installation_location}`,
    ].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Battery} title="Batteridata" items={items} />;
  }

  if (product.category === 'solpanel') {
    const items = [
      data.power_watts && `Effekt: ${data.power_watts} W`,
      (data.width_mm || data.height_mm) && `Mått: ${[data.width_mm, data.height_mm].filter(Boolean).join(' × ')} mm`,
      data.voc_v && `Voc: ${data.voc_v} V`,
      data.vmp_v && `Vmp: ${data.vmp_v} V`,
      data.isc_a && `Isc: ${data.isc_a} A`,
      data.imp_a && `Imp: ${data.imp_a} A`,
    ].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Ruler} title="Paneldata" items={items} />;
  }

  if (product.category === 'vaxelriktare') {
    const items = [
      data.power_watts && `AC-effekt: ${data.power_watts} W`,
      data.max_dc_voltage_v && `Max DC: ${data.max_dc_voltage_v} V`,
      data.startup_voltage_v && `Start: ${data.startup_voltage_v} V`,
      (data.mppt_voltage_min_v || data.mppt_voltage_max_v) && `MPPT: ${data.mppt_voltage_min_v || '-'}–${data.mppt_voltage_max_v || '-'} V`,
      data.mppt_count && `MPPT: ${data.mppt_count} st`,
      data.max_input_current_a && `Max ingångsström: ${data.max_input_current_a} A`,
    ].filter(Boolean);
    if (!items.length) return null;
    return <SummaryBox icon={Zap} title="Växelriktardata" items={items} />;
  }

  return null;
}

function SummaryBox({ icon: Icon, title, items }) {
  return (
    <div className="mt-3 rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</div>
      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {items.map(item => <div key={item}>• {item}</div>)}
      </div>
    </div>
  );
}

export default function ProjectDocumentsTab({ project, products = [] }) {
  const projectProducts = useMemo(() => collectProjectProducts(project, products), [project, products]);
  const missing = projectProducts.filter(product => !productHasRequiredDocuments({ documents_snapshot: product.documents_snapshot }));

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" /> Dokument för projektets produkter
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Grön markering betyder att produktdata finns sparad i projektet. Dokumentstatus visas separat till höger. Om dokument saknas: lägg upp manual/datablad på produkten i Produktsortimentet och spara om produkten i projektet.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {projectProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Inga produkter är kopplade till projektet ännu. Välj panel i Paneler/Montage eller lägg till produkter i Produktfliken.
            </div>
          ) : (
            <>
              {missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {missing.length} produkt(er) saknar manual eller datablad. Produktdata kan vara sparad, men dokumenten saknas på produkten eller i projektets snapshot.
                </div>
              )}

              <div className="space-y-3">
                {projectProducts.map(product => {
                  const docs = product.documents_snapshot || [];
                  const hasRequired = productHasRequiredDocuments({ documents_snapshot: docs });
                  return (
                    <div key={`${product.id}-${product.source}`} className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{product.name}</p>
                            {product.hasSnapshot && <Badge className="bg-green-100 text-green-700 border-green-200"><Database className="mr-1 h-3 w-3" />Produktdata sparad</Badge>}
                            {docs.length > 0 && <Badge variant="outline" className="text-xs"><ShieldCheck className="mr-1 h-3 w-3" />{docs.length} dokument</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ') || product.category}</p>
                          <p className="text-xs text-muted-foreground">Källa: {product.source}</p>
                        </div>
                        <Badge className={hasRequired ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                          {hasRequired ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                          {hasRequired ? 'Dokument OK' : 'Dokument saknas'}
                        </Badge>
                      </div>

                      <ProductTechSummary product={product} />

                      {docs.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {docs.map(doc => (
                            <a key={doc.id || `${doc.type}-${doc.file_url}`} href={doc.file_url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm hover:bg-muted">
                              <span className="min-w-0">
                                <span className="block font-medium truncate">{doc.name}</span>
                                <span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.type] || 'Dokument'}</span>
                              </span>
                              <FileText className="h-4 w-4 shrink-0 text-primary" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Inga uppladdade dokument hittades för denna produkt. Lägg in manual/datablad i Produktsortimentet och spara om produkten i projektet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
