import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles } from 'lucide-react';
import { PRODUCT_SEED_CATALOG } from '@/data/productSeedCatalog';

const FIELDS = [
  'name','category','brand','model','power_watts','capacity_kwh','price','unit','width_mm','height_mm','voc_v','isc_a','vmp_v','imp_a','temp_coeff_pmax_percent_c','temp_coeff_voc_percent_c','temp_coeff_isc_percent_c','noct_c','bifacial','max_dc_power_kw','max_dc_voltage_v','startup_voltage_v','mppt_voltage_min_v','mppt_voltage_max_v','nominal_dc_voltage_v','mppt_count','strings_per_mppt','max_input_current_a','max_short_circuit_current_a','battery_supported','phase_type','inverter_type','image_url','description','is_active'
];

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map((field) => [field, { type: ['string','number','boolean','null'] }]))
};

function promptFor(item) {
  return [
    'Find official public product information for this solar product.',
    `Brand: ${item.brand}`,
    `Model: ${item.model}`,
    `Category: ${item.category}`,
    'Return only JSON. Use null for unknown values.',
    'Use direct public product image URL in image_url if available.',
    `Fields: ${FIELDS.join(', ')}`
  ].join('\n');
}

function clean(item, data = {}) {
  const result = { ...data };
  result.category = item.category;
  result.brand = result.brand || item.brand;
  result.model = result.model || item.model;
  result.name = result.name || `${item.brand} ${item.model}`;
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
    if (!confirm(`Hämta och importera ${PRODUCT_SEED_CATALOG.length} produkter?`)) return;
    setRunning(true);
    let created = 0;
    let skipped = 0;
    const existing = new Set(products.map((p) => `${p.category}|${p.brand}|${p.model}`.toLowerCase()));

    try {
      for (let i = 0; i < PRODUCT_SEED_CATALOG.length; i++) {
        const item = PRODUCT_SEED_CATALOG[i];
        const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
        setStatus(`${i + 1}/${PRODUCT_SEED_CATALOG.length}: ${item.brand} ${item.model}`);
        if (existing.has(key)) { skipped++; continue; }

        let enriched = {};
        try {
          enriched = await base44.integrations.Core.InvokeLLM({
            prompt: promptFor(item),
            add_context_from_internet: true,
            response_json_schema: SCHEMA,
          });
        } catch (error) {
          enriched = {};
        }

        await base44.entities.Product.create(clean(item, enriched));
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
        <Sparkles className="w-4 h-4" /> {running ? 'Importerar...' : 'Hämta produktkatalog'}
      </button>
      {status && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{status}</div>}
    </div>
  );
}
