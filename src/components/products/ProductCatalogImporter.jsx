import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { PRODUCT_SEED_CATALOG } from '@/data/productSeedCatalog';
import { SWEDEN_EXTRA_PRODUCT_CATALOG } from '@/data/productSeedCatalogSwedenExtra';
import { productHasDocumentBackedData } from '@/lib/productDocuments';

const ALL_PRODUCTS = [...PRODUCT_SEED_CATALOG, ...SWEDEN_EXTRA_PRODUCT_CATALOG];

function clean(item) {
  const result = { ...item };
  result.price = Number(result.price) || 0;
  result.unit = result.unit || 'st';
  result.is_active = false;
  result.image_url = result.image_url || '';
  Object.keys(result).forEach((key) => {
    if (result[key] === null || result[key] === undefined) delete result[key];
  });
  return result;
}

export default function ProductCatalogImporter({ products = [], onDone }) {
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    if (!confirm(`Lägg in ${ALL_PRODUCTS.length} produktmallar? De blir inaktiva tills manual + datablad är uppladdade och data har hämtats från dokumenten.`)) return;
    setRunning(true);
    let created = 0;
    let skipped = 0;
    const existing = new Set(products.map((product) => `${product.category}|${product.brand}|${product.model}`.toLowerCase()));

    try {
      for (let i = 0; i < ALL_PRODUCTS.length; i++) {
        const item = ALL_PRODUCTS[i];
        const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
        setStatus(`${i + 1}/${ALL_PRODUCTS.length}: lägger in mall ${item.brand} ${item.model}`);
        if (existing.has(key)) {
          skipped++;
          continue;
        }
        await base44.entities.Product.create(clean(item));
        created++;
      }
      setStatus(`Klar. Skapade ${created} inaktiva produktmallar, hoppade över ${skipped}. Ladda upp manual + datablad på varje produkt och hämta data från dokumenten innan kalkyl.`);
      await onDone?.();
    } finally {
      setRunning(false);
    }
  };

  const deactivateProductsWithoutDocs = async () => {
    const targetProducts = products.filter((product) => product.is_active !== false && !productHasDocumentBackedData(product));
    if (!targetProducts.length) {
      setStatus('Alla aktiva produkter har komplett dokumentunderlag, eller är redan inaktiva.');
      return;
    }
    if (!confirm(`Sätt ${targetProducts.length} produkter som inaktiva eftersom de saknar komplett dokumentunderlag?`)) return;

    setChecking(true);
    let updated = 0;
    try {
      for (let i = 0; i < targetProducts.length; i++) {
        const product = targetProducts[i];
        setStatus(`${i + 1}/${targetProducts.length}: sätter inaktiv ${product.brand || ''} ${product.model || product.name || ''}`);
        await base44.entities.Product.update(product.id, { is_active: false });
        updated++;
      }
      setStatus(`Klar. Satte ${updated} produkter som inaktiva tills dokumentunderlag finns.`);
      await onDone?.();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={run} disabled={running || checking} className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> {running ? 'Lägger in mallar...' : `Lägg in ${ALL_PRODUCTS.length} produktmallar`}
        </button>
        <button onClick={deactivateProductsWithoutDocs} disabled={running || checking} className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-2.5 rounded-xl text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50">
          <ShieldAlert className="w-4 h-4" /> {checking ? 'Kontrollerar produkter...' : 'Sätt produkter utan dokument som inaktiva'}
        </button>
      </div>
      {status && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{status}</div>}
    </div>
  );
}
