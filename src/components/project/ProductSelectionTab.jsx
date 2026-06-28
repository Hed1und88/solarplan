import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Save, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import ProductVisual from '@/components/products/ProductVisual';
import { createProductSnapshot, productDocuments } from '@/lib/productDocuments';
import { listVisibleProducts } from '@/lib/tenantQueries';

const categoryLabels = { solpanel: 'Solpanel', batteri: 'Batteri', vaxelriktare: 'Växelriktare', optimerare: 'Optimerare', kabel: 'Kabel', montagesystem: 'Montagesystem', ovrigt: 'Övrigt' };
const categoryOrder = ['solpanel', 'vaxelriktare', 'batteri', 'optimerare', 'montagesystem', 'kabel', 'ovrigt'];

function productSnapshotFromSelection(item = {}) {
  return item.product_snapshot || item.snapshot || item.productSnapshot || null;
}

function normalizeSelectedProducts(items) {
  return Array.isArray(items) ? items.map(item => {
    const snapshot = productSnapshotFromSelection(item);
    return {
      product_id: item.product_id || snapshot?.product_id || snapshot?.id,
      product_name: item.product_name || snapshot?.name || '',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || Number(snapshot?.price) || 0,
      product_snapshot: snapshot || null,
      documents_snapshot: Array.isArray(item.documents_snapshot) ? item.documents_snapshot : (Array.isArray(snapshot?.documents_snapshot) ? snapshot.documents_snapshot : []),
      technical_snapshot: item.technical_snapshot || snapshot?.technical_data_snapshot || null,
      snapshot_created_at: item.snapshot_created_at || snapshot?.snapshot_created_at || '',
    };
  }).filter(item => item.product_id) : [];
}

function buildSelectedProduct(product, old = {}) {
  const snapshot = createProductSnapshot(product);
  return {
    product_id: product.id,
    product_name: product.name,
    quantity: Number(old.quantity) || 1,
    unit_price: Number(old.unit_price) || Number(product.price) || 0,
    product_snapshot: snapshot,
    documents_snapshot: snapshot?.documents_snapshot || productDocuments(product),
    technical_snapshot: snapshot?.technical_data_snapshot || null,
    snapshot_created_at: snapshot?.snapshot_created_at || new Date().toISOString(),
  };
}

function findCurrentProduct(products, productId) {
  return products.find(product => String(product.id) === String(productId)) || null;
}

function documentsOk(item = {}) {
  const docs = Array.isArray(item.documents_snapshot) ? item.documents_snapshot : [];
  return docs.some(doc => doc.type === 'datasheet') && docs.some(doc => doc.type === 'manual');
}

export default function ProductSelectionTab({ project, onUpdate }) {
  const [selectedProducts, setSelectedProducts] = useState(() => normalizeSelectedProducts(project.selected_products));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelectedProducts(normalizeSelectedProducts(project.selected_products));
    setMessage('');
  }, [project?.id, project?.selected_products]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listVisibleProducts(),
  });

  const addProduct = (product) => {
    const existing = selectedProducts.find(sp => sp.product_id === product.id);
    setMessage('');
    if (existing) {
      setSelectedProducts(prev => prev.map(sp =>
        sp.product_id === product.id
          ? buildSelectedProduct(product, { ...sp, quantity: sp.quantity + 1 })
          : sp
      ));
    } else {
      setSelectedProducts(prev => [...prev, buildSelectedProduct(product)]);
    }
  };

  const updateQuantity = (productId, delta) => {
    setSelectedProducts(prev => prev.map(sp => {
      if (sp.product_id !== productId) return sp;
      const newQty = sp.quantity + delta;
      return newQty > 0 ? { ...sp, quantity: newQty } : sp;
    }));
  };

  const removeProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(sp => sp.product_id !== productId));
  };

  const refreshOneSnapshot = (productId) => {
    const existing = selectedProducts.find(item => item.product_id === productId);
    const product = findCurrentProduct(products, productId);
    if (!existing || !product) {
      setMessage('Produkten kunde inte uppdateras eftersom den inte hittades i Produktsortimentet.');
      return;
    }
    setSelectedProducts(prev => prev.map(item => item.product_id === productId ? buildSelectedProduct(product, item) : item));
    setMessage(`Snapshot uppdaterad för ${product.name}. Tryck Spara för att spara i projektet.`);
  };

  const refreshAllSnapshots = () => {
    let updated = 0;
    let skipped = 0;
    setSelectedProducts(prev => prev.map(item => {
      const product = findCurrentProduct(products, item.product_id);
      if (!product) {
        skipped += 1;
        return item;
      }
      updated += 1;
      return buildSelectedProduct(product, item);
    }));
    setMessage(`${updated} snapshot(s) uppdaterade. ${skipped ? `${skipped} produkt(er) hittades inte i sortimentet. ` : ''}Tryck Spara för att spara i projektet.`);
  };

  const totalCost = selectedProducts.reduce((sum, sp) => sum + (Number(sp.unit_price) || 0) * (Number(sp.quantity) || 0), 0);
  const groupedProducts = categoryOrder
    .map(category => ({
      category,
      label: categoryLabels[category] || categoryLabels.ovrigt,
      items: products.filter(product => (product.category || 'ovrigt') === category),
    }))
    .filter(group => group.items.length);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      selected_products: selectedProducts,
      total_cost: totalCost,
    });
    setSaving(false);
    setMessage('Produktlistan är sparad i projektet.');
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Valda produkter</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">När en produkt sparas i projektet sparas även en snapshot av teknisk data och dokument, så gamla projekt inte tappar data om produktsortimentet ändras senare.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={refreshAllSnapshots} disabled={!selectedProducts.length || !products.length} variant="outline" className="gap-2" size="sm">
              <RefreshCw className="w-4 h-4" /> Uppdatera alla snapshots
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {message && <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{message}</div>}
          {selectedProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Inga produkter valda. Lägg till produkter från sortimentet nedan.</p>
          ) : (
            <div className="space-y-3">
              {selectedProducts.map(sp => {
                const sourceProduct = findCurrentProduct(products, sp.product_id);
                return (
                  <div key={sp.product_id} className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{sp.product_name}</p>
                        {sp.product_snapshot && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><ShieldCheck className="mr-1 h-3 w-3" />Snapshot</Badge>}
                        <Badge className={documentsOk(sp) ? 'bg-green-100 text-green-700 border-green-200 text-xs' : 'bg-amber-100 text-amber-700 border-amber-200 text-xs'}>
                          {documentsOk(sp) ? 'Dokument OK' : 'Dokument saknas'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{sp.unit_price?.toLocaleString('sv-SE')} SEK/st</p>
                      {sp.snapshot_created_at && <p className="text-[11px] text-muted-foreground">Produktdata låst {new Date(sp.snapshot_created_at).toLocaleString('sv-SE')}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => refreshOneSnapshot(sp.product_id)} disabled={!sourceProduct}>
                        <RefreshCw className="w-3.5 h-3.5" /> Uppdatera
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(sp.product_id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center font-semibold">{sp.quantity}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(sp.product_id, 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <span className="font-semibold w-24 text-right">{(sp.unit_price * sp.quantity).toLocaleString('sv-SE')} SEK</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeProduct(sp.product_id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-center pt-4 border-t">
                <span className="font-semibold text-lg">Totalt</span>
                <span className="font-bold text-2xl text-primary">{totalCost.toLocaleString('sv-SE')} SEK</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Produktsortiment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {groupedProducts.map(group => (
              <section key={group.category} className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                  <span className="text-xs font-medium text-muted-foreground">{group.items.length} produkter</span>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {group.items.map(product => {
                    const inProject = selectedProducts.find(sp => sp.product_id === product.id);
                    return (
                      <div key={product.id} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/30">
                        <ProductVisual product={product} className="h-20 w-24" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{product.name}</p>
                            {inProject && <Badge variant="secondary" className="shrink-0 text-xs">{inProject.quantity}st</Badge>}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{product.brand} {product.model}</p>
                          <p className="mt-1 text-sm font-semibold">{product.price?.toLocaleString('sv-SE')} SEK</p>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => addProduct(product)}>
                          <Plus className="h-3.5 w-3.5" /> Lägg till
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
