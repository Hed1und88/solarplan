import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, createProductSnapshot, productDocuments, productHasRequiredDocuments } from '@/lib/productDocuments';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function productById(products, id) {
  return products.find(product => String(product.id) === String(id)) || null;
}

function normalizeProjectProduct(entry = {}, fallbackProduct = null, source = 'Projekt') {
  const snapshot = entry.product_snapshot || entry.panelProductSnapshot || entry.snapshot || null;
  const base = snapshot || (fallbackProduct ? createProductSnapshot(fallbackProduct) : null) || entry;
  const docs = productDocuments({ ...base, documents_snapshot: entry.documents_snapshot || base.documents_snapshot });
  return {
    id: entry.product_id || entry.panelProductId || base.product_id || base.id || fallbackProduct?.id || `${source}-${entry.product_name || entry.name || 'produkt'}`,
    product_id: entry.product_id || entry.panelProductId || base.product_id || base.id || fallbackProduct?.id || '',
    name: entry.product_name || base.name || fallbackProduct?.name || 'Produkt',
    brand: base.brand || fallbackProduct?.brand || '',
    model: base.model || fallbackProduct?.model || '',
    category: base.category || fallbackProduct?.category || 'ovrigt',
    source,
    hasSnapshot: Boolean(snapshot || entry.product_snapshot || entry.documents_snapshot?.length),
    documents_snapshot: docs,
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
            Dokument visas i första hand från projektets sparade produktsnapshots. Äldre projekt som saknar snapshot använder aktuell produktdata som reserv så tidigare arbete inte tappas.
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
                  {missing.length} produkt(er) saknar manual eller datablad i snapshot/reservdata.
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
                            {product.hasSnapshot && <Badge className="bg-green-100 text-green-700 border-green-200"><ShieldCheck className="mr-1 h-3 w-3" />Snapshot</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ') || product.category}</p>
                          <p className="text-xs text-muted-foreground">Källa: {product.source}</p>
                        </div>
                        <Badge className={hasRequired ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                          {hasRequired ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                          {hasRequired ? 'Manual + datablad' : 'Dokument saknas'}
                        </Badge>
                      </div>

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
                        <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Inga uppladdade dokument på denna produkt.</p>
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
