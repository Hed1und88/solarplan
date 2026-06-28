import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Image, Sparkles } from 'lucide-react';
import { PRODUCT_SEED_CATALOG } from '@/data/productSeedCatalog';
import { SWEDEN_EXTRA_PRODUCT_CATALOG } from '@/data/productSeedCatalogSwedenExtra';
import { getCompanyContext } from '@/lib/companyContext';
import { createStandardProduct, updateTenantProduct } from '@/lib/tenantQueries';

const ALL_PRODUCTS = [...PRODUCT_SEED_CATALOG, ...SWEDEN_EXTRA_PRODUCT_CATALOG];

function clean(item) {
  const result = { ...item };
  result.price = Number(result.price) || 0;
  result.unit = result.unit || 'st';
  result.is_active = true;
  result.is_standard = true;
  result.company_id = '';
  result.image_url = result.image_url || '';
  Object.keys(result).forEach((key) => {
    if (result[key] === null || result[key] === undefined) delete result[key];
  });
  return result;
}

function imagePrompt(product) {
  return `Find a real public product image URL for this exact product. Return ONLY JSON with image_url and source_url. Requirements: image_url must be a direct HTTPS image URL ending in .jpg, .jpeg, .png or .webp when possible. Prefer official manufacturer product page, datasheet product image, or reputable distributor product image. Do not return logos, icons, generated images, SVG data URLs, or placeholder images. Product: ${product.brand || ''} ${product.model || product.name || ''}. Category: ${product.category || ''}.`;
}

const IMAGE_SCHEMA = {
  type: 'object',
  properties: {
    image_url: { type: 'string' },
    source_url: { type: 'string' },
  },
};

function hasRealImage(product) {
  const url = String(product?.image_url || '');
  return url.startsWith('https://') && !url.includes('placeholder') && !url.includes('data:image/svg');
}

export default function ProductCatalogImporter({ products = [], onDone }) {
  const [running, setRunning] = useState(false);
  const [imageRunning, setImageRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [tenantContext, setTenantContext] = useState(null);

  useEffect(() => {
    getCompanyContext().then(setTenantContext).catch(() => setTenantContext(null));
  }, []);

  if (!tenantContext?.isSuperAdmin) return null;

  const run = async () => {
    if (!confirm(`Lägg in ${ALL_PRODUCTS.length} färdiga produkter i produktsortimentet?`)) return;
    setRunning(true);
    let created = 0;
    let skipped = 0;
    let backfilled = 0;
    const existing = new Map(products.map((product) => [`${product.category}|${product.brand}|${product.model}`.toLowerCase(), product]));

    try {
      for (let i = 0; i < ALL_PRODUCTS.length; i++) {
        const item = ALL_PRODUCTS[i];
        const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
        setStatus(`${i + 1}/${ALL_PRODUCTS.length}: ${item.brand} ${item.model}`);
        const existingProduct = existing.get(key);
        if (existingProduct) {
          if (existingProduct.is_standard !== true || existingProduct.company_id) {
            await updateTenantProduct(existingProduct, { is_standard: true, company_id: '' });
            backfilled++;
          }
          skipped++;
          continue;
        }
        await createStandardProduct(clean(item));
        created++;
      }
      setStatus(`Klar. Skapade ${created}, backfillade ${backfilled}, hoppade över ${skipped}.`);
      await onDone?.();
    } finally {
      setRunning(false);
    }
  };

  const fetchRealImages = async () => {
    const targetProducts = products.filter((product) => !hasRealImage(product));
    if (!targetProducts.length) {
      setStatus('Alla produkter har redan riktig https-bild.');
      return;
    }
    if (!confirm(`Hämta riktiga produktbilder från internet till ${targetProducts.length} produkter?`)) return;

    setImageRunning(true);
    let updated = 0;
    let missing = 0;

    try {
      for (let i = 0; i < targetProducts.length; i++) {
        const product = targetProducts[i];
        setStatus(`${i + 1}/${targetProducts.length}: hämtar bild till ${product.brand || ''} ${product.model || product.name || ''}`);

        let imageUrl = '';
        let sourceUrl = '';
        try {
          const result = await base44.integrations.Core.InvokeLLM({
            prompt: imagePrompt(product),
            add_context_from_internet: true,
            response_json_schema: IMAGE_SCHEMA,
          });
          imageUrl = String(result?.image_url || '').trim();
          sourceUrl = String(result?.source_url || '').trim();
        } catch (error) {
          imageUrl = '';
        }

        if (imageUrl.startsWith('https://')) {
          await updateTenantProduct(product, {
            image_url: imageUrl,
            image_source_url: sourceUrl,
          });
          updated++;
        } else {
          await updateTenantProduct(product, {
            image_url: '',
            image_source_url: '',
          });
          missing++;
        }
      }
      setStatus(`Klar. Riktiga produktbilder: ${updated}. Saknar fortfarande bild: ${missing}.`);
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
        <button onClick={fetchRealImages} disabled={running || imageRunning} className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <Image className="w-4 h-4" /> {imageRunning ? 'Hämtar produktbilder...' : 'Hämta riktiga produktbilder'}
        </button>
      </div>
      {status && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{status}</div>}
    </div>
  );
}
