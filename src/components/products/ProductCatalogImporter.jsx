import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Image, Sparkles } from 'lucide-react';
import { PRODUCT_SEED_CATALOG } from '@/data/productSeedCatalog';
import { SWEDEN_EXTRA_PRODUCT_CATALOG } from '@/data/productSeedCatalogSwedenExtra';

const ALL_PRODUCTS = [...PRODUCT_SEED_CATALOG, ...SWEDEN_EXTRA_PRODUCT_CATALOG];

function svgImage(item) {
  const type = item.category === 'solpanel' ? 'SOLPANEL' : item.category === 'vaxelriktare' ? 'VÄXELRIKTARE' : item.category === 'batteri' ? 'BATTERI' : 'MONTAGE';
  const value = item.power_watts ? `${item.power_watts} W` : item.capacity_kwh ? `${item.capacity_kwh} kWh` : 'SYSTEM';
  const brand = String(item.brand || '').replace(/[<>&]/g, '');
  const model = String(item.model || '').replace(/[<>&]/g, '');
  const color = item.category === 'solpanel' ? '#f97316' : item.category === 'vaxelriktare' ? '#2563eb' : item.category === 'batteri' ? '#16a34a' : '#ca8a04';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="36" fill="#f8fafc"/><rect x="32" y="32" width="576" height="296" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/><rect x="56" y="56" width="180" height="44" rx="22" fill="${color}"/><text x="146" y="85" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="white">${type}</text><text x="56" y="160" font-family="Arial" font-size="42" font-weight="800" fill="#0f172a">${brand}</text><text x="56" y="208" font-family="Arial" font-size="28" font-weight="600" fill="#334155">${model}</text><text x="56" y="278" font-family="Arial" font-size="34" font-weight="800" fill="${color}">${value}</text><circle cx="530" cy="248" r="58" fill="${color}" opacity="0.14"/><circle cx="530" cy="248" r="34" fill="${color}" opacity="0.28"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clean(item) {
  const result = { ...item };
  result.price = Number(result.price) || 0;
  result.unit = result.unit || 'st';
  result.is_active = true;
  result.image_url = result.image_url || svgImage(result);
  Object.keys(result).forEach((key) => {
    if (result[key] === null || result[key] === undefined || result[key] === '') delete result[key];
  });
  return result;
}

export default function ProductCatalogImporter({ products = [], onDone }) {
  const [running, setRunning] = useState(false);
  const [imageRunning, setImageRunning] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    if (!confirm(`Lägg in ${ALL_PRODUCTS.length} färdiga produkter i produktsortimentet?`)) return;
    setRunning(true);
    let created = 0;
    let skipped = 0;
    const existing = new Set(products.map((product) => `${product.category}|${product.brand}|${product.model}`.toLowerCase()));

    try {
      for (let i = 0; i < ALL_PRODUCTS.length; i++) {
        const item = ALL_PRODUCTS[i];
        const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
        setStatus(`${i + 1}/${ALL_PRODUCTS.length}: ${item.brand} ${item.model}`);
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

  const backfillImages = async () => {
    const missing = products.filter((product) => !product.image_url);
    if (!missing.length) {
      setStatus('Alla befintliga produkter har redan bild.');
      return;
    }
    if (!confirm(`Lägg in genererade bilder på ${missing.length} befintliga produkter?`)) return;
    setImageRunning(true);
    let updated = 0;
    try {
      for (let i = 0; i < missing.length; i++) {
        const product = missing[i];
        setStatus(`${i + 1}/${missing.length}: bild till ${product.brand || ''} ${product.model || product.name || ''}`);
        await base44.entities.Product.update(product.id, { image_url: svgImage(product) });
        updated++;
      }
      setStatus(`Klar. Lade in bilder på ${updated} befintliga produkter.`);
      await onDone?.();
    } finally {
      setImageRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={run} disabled={running || imageRunning} className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> {running ? 'Lägger in produkter...' : `Lägg in ${ALL_PRODUCTS.length} produkter`}
        </button>
        <button onClick={backfillImages} disabled={running || imageRunning} className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <Image className="w-4 h-4" /> {imageRunning ? 'Lägger in bilder...' : 'Lägg in bilder på befintliga'}
        </button>
      </div>
      {status && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{status}</div>}
    </div>
  );
}
