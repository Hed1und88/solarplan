import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import ProductVisual from '@/components/products/ProductVisual';
import { createProductSnapshot, productDocuments } from '@/lib/productDocuments';
import { mergeProjectAutoProducts } from '@/lib/projectAutoProducts';

const categoryLabels = {
  solpanel: 'Solpanel',
  batteri: 'Batteri',
  vaxelriktare: 'Växelriktare',
  brytare: 'Brytare',
  elcentral: 'Elcentral',
  optimerare: 'Optimerare',
  kabel: 'Kabel',
  montagesystem: 'Montagesystem',
  ovrigt: 'Övrigt',
};

const categoryOrder = ['solpanel', 'vaxelriktare', 'batteri', 'brytare', 'elcentral', 'optimerare', 'montagesystem', 'kabel', 'ovrigt'];

function normalize(items = []) {
  return Array.isArray(items) ? items.map(item => {
    const snapshot = item.product_snapshot || item.snapshot || item.productSnapshot || null;
    return {
      product_id: item.product_id || snapshot?.product_id || snapshot?.id,
      product_name: item.product_name || snapshot?.name || '',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || Number(snapshot?.price) || 0,
      product_snapshot: snapshot,
      documents_snapshot: Array.isArray(item.documents_snapshot) ? item.documents_snapshot : snapshot?.documents_snapshot || [],
      technical_snapshot: item.technical_snapshot || snapshot?.technical_data_snapshot || null,
      snapshot_created_at: item.snapshot_created_at || snapshot?.snapshot_created_at || '',
      auto_generated: Boolean(item.auto_generated),
      auto_source: item.auto_source || '',
    };
  }).filter(item => item.product_id) : [];
}

function buildManual(product, old = {}) {
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
    auto_generated: false,
    auto_source: '',
  };
}

function sameSelection(a = [], b = []) {
  const compact = items => normalize(items).map(item => ({
    id: String(item.product_id),
    q: Number(item.quantity) || 0,
    p: Number(item.unit_price) || 0,
    auto: Boolean(item.auto_generated),
    source: item.auto_source || '',
    docs: (item.documents_snapshot || []).map(doc => doc.file_url || doc.url || doc.name).sort(),
  })).sort((x, y) => x.id.localeCompare(y.id));
  return JSON.stringify(compact(a)) === JSON.stringify(compact(b));
}

function autoLabel(source) {
  if (source === 'battery-room') return 'Auto från Batteri';
  if (source === 'panels') return 'Auto från Paneler';
  if (source === 'mounting' || source === 'mounting-system') return 'Auto från Montage';
  return 'Automatisk';
}

export default function ProductSelectionTab({ project, onUpdate }) {
  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => listVisibleProducts(),
  });
  const mergedProject = useMemo(() => mergeProjectAutoProducts(project || {}, products), [project, products]);
  const [selectedProducts, setSelectedProducts] = useState(() => normalize(mergedProject.selected_products));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const autoSaveRef = useRef('');

  useEffect(() => {
    setSelectedProducts(normalize(mergedProject.selected_products));
  }, [mergedProject.selected_products]);

  useEffect(() => {
    if (!products.length || !onUpdate) return;
    if (sameSelection(project?.selected_products, mergedProject.selected_products)) return;
    const signature = JSON.stringify(normalize(mergedProject.selected_products).map(item => [item.product_id, item.quantity, item.auto_source]));
    if (autoSaveRef.current === signature) return;
    autoSaveRef.current = signature;
    onUpdate({ selected_products: mergedProject.selected_products, total_cost: mergedProject.total_cost });
  }, [products.length, project?.battery_layout_data, project?.solar_roof_planner_data, project?.panel_layout_data, project?.mounting_data, project?.selected_products, mergedProject.selected_products, mergedProject.total_cost, onUpdate]);

  const filtered = products.filter(product => {
    const text = [product.name, product.brand, product.model, product.article_number].filter(Boolean).join(' ').toLowerCase();
    return (category === 'all' || (product.category || 'ovrigt') === category) && (!search.trim() || text.includes(search.trim().toLowerCase()));
  });

  const groups = categoryOrder.map(key => ({
    key,
    label: categoryLabels[key],
    items: filtered.filter(product => (product.category || 'ovrigt') === key),
  })).filter(group => group.items.length);

  const total = selectedProducts.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);

  const addProduct = product => {
    setSelectedProducts(current => {
      const existing = current.find(item => String(item.product_id) === String(product.id));
      if (existing) {
        if (existing.auto_generated) return current;
        return current.map(item => String(item.product_id) === String(product.id) ? buildManual(product, { ...item, quantity: item.quantity + 1 }) : item);
      }
      return [...current, buildManual(product)];
    });
  };

  const changeQuantity = (id, delta) => setSelectedProducts(current => current.map(item => {
    if (String(item.product_id) !== String(id) || item.auto_generated) return item;
    return { ...item, quantity: Math.max(1, Number(item.quantity || 1) + delta) };
  }));

  const removeProduct = id => setSelectedProducts(current => current.filter(item => item.auto_generated || String(item.product_id) !== String(id)));

  const refreshSnapshots = () => {
    setSelectedProducts(current => current.map(item => {
      const product = products.find(candidate => String(candidate.id) === String(item.product_id));
      if (!product) return item;
      const snapshot = createProductSnapshot(product);
      return {
        ...item,
        product_name: product.name || item.product_name,
        unit_price: Number(product.price) || item.unit_price || 0,
        product_snapshot: snapshot,
        documents_snapshot: snapshot?.documents_snapshot || [],
        technical_snapshot: snapshot?.technical_data_snapshot || null,
        snapshot_created_at: snapshot?.snapshot_created_at || new Date().toISOString(),
      };
    }));
    setMessage('Snapshots och dokument har uppdaterats från Produktsortimentet.');
  };

  const save = async () => {
    setSaving(true);
    await onUpdate({ selected_products: selectedProducts, total_cost: total });
    setSaving(false);
    setMessage('Produktlistan är sparad. Batterier och växelriktare från Batteri-sidan synkas automatiskt.');
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Valda produkter</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Paneler, batterier, växelriktare, brytare, elcentraler och montageprodukter läggs till automatiskt från respektive projektsida.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshSnapshots} disabled={!selectedProducts.length}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera snapshots</Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara'}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {message && <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{message}</div>}
          {!selectedProducts.length ? <div className="py-8 text-center text-sm text-muted-foreground">Inga produkter valda.</div> : (
            <div className="space-y-3">
              {selectedProducts.map(item => (
                <div key={`${item.product_id}-${item.auto_source}`} className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.product_name}</span>
                      {item.auto_generated ? <Badge className="border-blue-200 bg-blue-100 text-blue-700">{autoLabel(item.auto_source)}</Badge> : <Badge className="border-green-200 bg-green-100 text-green-700"><ShieldCheck className="mr-1 h-3 w-3" />Manuell</Badge>}
                      {(item.documents_snapshot || []).length > 0 && <Badge variant="outline">{item.documents_snapshot.length} dokument</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{Number(item.unit_price || 0).toLocaleString('sv-SE')} SEK/st</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" disabled={item.auto_generated} onClick={() => changeQuantity(item.product_id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center font-semibold">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" disabled={item.auto_generated} onClick={() => changeQuantity(item.product_id, 1)}><Plus className="h-3 w-3" /></Button>
                    <span className="w-28 text-right font-semibold">{(Number(item.unit_price || 0) * Number(item.quantity || 0)).toLocaleString('sv-SE')} SEK</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={item.auto_generated} onClick={() => removeProduct(item.product_id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-4"><span className="text-lg font-semibold">Totalt</span><span className="text-2xl font-bold text-primary">{total.toLocaleString('sv-SE')} SEK</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Produktsortiment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_220px]">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök produkt, märke eller modell..." className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <select value={category} onChange={event => setCategory(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="all">Alla kategorier</option>{categoryOrder.map(key => <option key={key} value={key}>{categoryLabels[key]}</option>)}</select>
          </div>
          {groups.map(group => (
            <div key={group.key} className="space-y-2">
              <div className="text-sm font-semibold">{group.label}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map(product => (
                  <button key={product.id} type="button" onClick={() => addProduct(product)} className="rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-sm">
                    <ProductVisual product={product} className="mb-2 h-20 w-full" />
                    <div className="font-medium">{product.name}</div>
                    <div className="text-xs text-muted-foreground">{[product.brand, product.model].filter(Boolean).join(' ')}</div>
                    <div className="mt-2 text-sm font-semibold text-primary">{Number(product.price || 0).toLocaleString('sv-SE')} SEK</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
