import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles } from 'lucide-react';
import { PRODUCT_SEED_CATALOG } from '@/data/productSeedCatalog';

function clean(item) {
  const result = { ...item };
  result.price = Number(result.price) || 0;
  result.unit = result.unit || 'st';
  result.is_active = true;
  Object.keys(result).forEach((key) => {
    if (result[key] === null || result[key] === undefined || result[key] === '') delete result[key];
  });
  return result;
}

export default function ProductCatalogImporter({ products = [], onDone }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    if (!confirm(`Lägg in ${PRODUCT_SEED_CATALOG.length} färdiga produkter i produktsortimentet?`)) return;
    setRunning(true);
    let created = 0;
    let skipped = 0;
    const existing = new Set(products.map((product) => `${product.category}|${product.brand}|${product.model}`.toLowerCase()));

    try {
      for (let i = 0; i < PRODUCT_SEED_CATALOG.length; i++) {
        const item = PRODUCT_SEED_CATALOG[i];
        const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
        setStatus(`${i + 1}/${PRODUCT_SEED_CATALOG.length}: ${item.brand} ${item.model}`);
        if (existing.has(key)) {
          skipped++;
          continue;
        }
        await base44.entities.Product.create(clean(item));
        created++;
      }
      setStatus(`Klar. Skapade ${created}, hoppade över ${skipped}.`);
      await onDone?.();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={running} className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
        <Sparkles className="w-4 h-4" /> {running ? 'Lägger in produkter...' : 'Lägg in färdig produktdata'}
      </button>
      {status && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{status}</div>}
    </div>
  );
}
