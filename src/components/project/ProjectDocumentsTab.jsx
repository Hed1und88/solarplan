import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Database, FileText, RefreshCw } from 'lucide-react';
import { createProductSnapshot, DOCUMENT_TYPE_LABELS, productDocuments } from '@/lib/productDocuments';
import { mergeProjectAutoProducts } from '@/lib/projectAutoProducts';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueDocuments(documents = []) {
  const seen = new Set();
  return documents.filter(document => {
    const key = [document.type, document.file_url || document.url, document.name || document.title].map(norm).join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productById(products, id) {
  return products.find(product => String(product.id) === String(id)) || null;
}

function collectProjectProducts(project = {}, products = []) {
  const merged = mergeProjectAutoProducts(project, products);
  const rows = [];
  const seen = new Map();

  (merged.selected_products || []).forEach(item => {
    const sourceProduct = productById(products, item.product_id);
    const snapshot = item.product_snapshot || (sourceProduct ? createProductSnapshot(sourceProduct) : null);
    const documents = uniqueDocuments([
      ...(Array.isArray(item.documents_snapshot) ? item.documents_snapshot : []),
      ...(snapshot?.documents_snapshot || []),
      ...(sourceProduct ? productDocuments(sourceProduct) : []),
    ]);
    const key = String(item.product_id || snapshot?.product_id || snapshot?.id || item.product_name);
    const sourceLabel = item.auto_source === 'battery-room'
      ? 'Batteri-sidan'
      : item.auto_source === 'panels'
        ? 'Paneler-sidan'
        : item.auto_source === 'mounting' || item.auto_source === 'mounting-system'
          ? 'Montage-sidan'
          : 'Produkter-sidan';

    const incoming = {
      key,
      product_id: item.product_id,
      name: item.product_name || snapshot?.name || sourceProduct?.name || 'Produkt',
      brand: snapshot?.brand || sourceProduct?.brand || '',
      model: snapshot?.model || sourceProduct?.model || '',
      category: snapshot?.category || sourceProduct?.category || 'ovrigt',
      quantity: Number(item.quantity) || 1,
      documents,
      sources: [sourceLabel],
      snapshot,
    };

    if (!seen.has(key)) {
      seen.set(key, incoming);
      rows.push(incoming);
    } else {
      const existing = seen.get(key);
      existing.documents = uniqueDocuments([...existing.documents, ...documents]);
      existing.sources = Array.from(new Set([...existing.sources, sourceLabel]));
      existing.quantity = Math.max(existing.quantity, incoming.quantity);
    }
  });

  return { merged, rows };
}

function DocumentList({ documents }) {
  if (!documents.length) return <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Inga uppladdade dokument hittades för produkten.</div>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {documents.map((document, index) => {
        const url = document.file_url || document.url || '';
        const title = document.title || document.name || DOCUMENT_TYPE_LABELS[document.type] || `Dokument ${index + 1}`;
        return (
          <a key={`${url}-${title}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border bg-white p-3 transition hover:border-primary/50 hover:shadow-sm">
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[document.type] || document.type || 'Dokument'}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

export default function ProjectDocumentsTab({ project, products = [], onUpdate }) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const { merged, rows } = useMemo(() => collectProjectProducts(project, products), [project, products]);
  const missing = rows.filter(row => row.documents.length === 0);

  const refresh = async () => {
    if (!onUpdate) return;
    setRefreshing(true);
    setMessage('');
    await onUpdate({ selected_products: merged.selected_products, total_cost: merged.total_cost });
    setMessage(`${rows.length} projektprodukt(er) och deras dokument har synkats från Produktsortimentet.`);
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />Dokument för projektets produkter</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Dokument hämtas automatiskt från alla produkter som används i Paneler, Batteri, Montage och Produkter.</p>
            </div>
            <Button variant="outline" onClick={refresh} disabled={refreshing || !rows.length}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Synkar...' : 'Synka produkter och dokument'}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</div>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/30 p-3"><div className="text-2xl font-bold">{rows.length}</div><div className="text-xs text-muted-foreground">Projektprodukter</div></div>
            <div className="rounded-xl border bg-muted/30 p-3"><div className="text-2xl font-bold">{rows.reduce((sum, row) => sum + row.documents.length, 0)}</div><div className="text-xs text-muted-foreground">Dokument</div></div>
            <div className={`rounded-xl border p-3 ${missing.length ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}><div className="text-2xl font-bold">{missing.length}</div><div className="text-xs">Produkter utan dokument</div></div>
          </div>
          {missing.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{missing.length} produkt(er) saknar uppladdade dokument i Produktsortimentet.</div>}
        </CardContent>
      </Card>

      {!rows.length ? (
        <Card className="border-0 shadow-sm"><CardContent className="py-12 text-center"><Database className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><div className="font-medium">Inga projektprodukter hittades</div><div className="mt-1 text-sm text-muted-foreground">Lägg till produkter på Paneler-, Batteri-, Montage- eller Produkter-sidan.</div></CardContent></Card>
      ) : rows.map(row => (
        <Card key={row.key} className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{row.name}</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">{[row.brand, row.model].filter(Boolean).join(' ')} · Antal: {row.quantity}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{row.sources.map(source => <Badge key={source} variant="outline">{source}</Badge>)}</div>
              </div>
              {row.documents.length ? <Badge className="border-green-200 bg-green-100 text-green-700"><CheckCircle2 className="mr-1 h-3 w-3" />{row.documents.length} dokument</Badge> : <Badge className="border-amber-200 bg-amber-100 text-amber-700"><AlertTriangle className="mr-1 h-3 w-3" />Saknar dokument</Badge>}
            </div>
          </CardHeader>
          <CardContent><DocumentList documents={row.documents} /></CardContent>
        </Card>
      ))}
    </div>
  );
}
