import { productDocuments, productMeta, resolveProductClampZone } from '@/lib/productDocuments';

const META_FIELDS = [
  'module_capacity_kwh',
  'usable_capacity_kwh',
  'dod_percent',
  'modules_count',
  'max_modules_per_stack',
  'max_battery_modules',
  'depth_mm',
  'module_weight_kg',
  'base_weight_kg',
  'bms_weight_kg',
  'clearance_front_mm',
  'clearance_back_mm',
  'clearance_side_mm',
  'clearance_top_mm',
  'clearance_bottom_mm',
  'installation_location',
  'ip_rating',
  'capacity_kwh',
  'width_mm',
  'height_mm',
  'weight_kg',
];

const DOCUMENT_REQUIRED_CATEGORIES = new Set([
  'solpanel',
  'vaxelriktare',
  'batteri',
  'optimerare',
  'elbilsladdare',
  'varmepump',
  'värmepump',
]);

export function productRequiresDocuments(rawProduct = {}) {
  const category = String(rawProduct?.category || '').trim().toLowerCase();
  return DOCUMENT_REQUIRED_CATEGORIES.has(category);
}

export function hasProductValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const number = Number(value);
    return Number.isFinite(number) ? number > 0 : value.trim().length > 0;
  }
  return true;
}

export function hydrateProductQualityData(product = {}) {
  const meta = productMeta(product);
  const technical = product?.technical_data_snapshot || product?.technical_snapshot || {};
  const fromMeta = META_FIELDS.reduce((acc, key) => {
    if (product[key] === undefined || product[key] === null || product[key] === '') acc[key] = meta[key];
    return acc;
  }, {});
  return { ...meta, ...technical, ...product, ...fromMeta, _productMeta: meta };
}

export function requiredProductTechnicalFields(rawProduct = {}) {
  const product = hydrateProductQualityData(rawProduct);
  if (product.category === 'solpanel') {
    return [
      ['power_watts', 'effekt'],
      ['width_mm', 'bredd'],
      ['height_mm', 'höjd'],
      ['voc_v', 'Voc'],
      ['vmp_v', 'Vmp'],
      ['isc_a', 'Isc'],
      ['imp_a', 'Imp'],
    ];
  }
  if (product.category === 'vaxelriktare') {
    return [
      ['power_watts', 'AC-effekt'],
      ['max_dc_voltage_v', 'max DC-spänning'],
      ['startup_voltage_v', 'startspänning'],
      ['mppt_voltage_min_v', 'MPPT min'],
      ['mppt_voltage_max_v', 'MPPT max'],
      ['max_input_current_a', 'max ingångsström'],
      ['max_short_circuit_current_a', 'max kortslutningsström'],
    ];
  }
  if (product.category === 'batteri') {
    return [
      ['capacity_kwh', 'nominell kWh'],
      ['module_capacity_kwh', 'kWh per modul'],
      ['max_modules_per_stack', 'max moduler i stapel'],
      ['width_mm', 'bredd'],
      ['height_mm', 'höjd'],
      ['depth_mm', 'djup'],
      ['clearance_side_mm', 'sidavstånd'],
      ['clearance_top_mm', 'avstånd ovanför'],
    ];
  }
  return [];
}

export function productQualityStatus(rawProduct = {}) {
  const product = hydrateProductQualityData(rawProduct);
  const docs = productDocuments(product);
  const requiresDocuments = productRequiresDocuments(product);
  const hasManual = docs.some(doc => doc.type === 'manual');
  const hasDatasheet = docs.some(doc => doc.type === 'datasheet');
  const missingTechnical = requiredProductTechnicalFields(product)
    .filter(([key]) => !hasProductValue(product[key]))
    .map(([, label]) => label);
  const clamp = resolveProductClampZone(product);
  const needsClamp = product.category === 'solpanel';
  const docsOk = !requiresDocuments || (hasManual && hasDatasheet);
  const technicalOk = missingTechnical.length === 0;
  const clampOk = !needsClamp || clamp.hasProductZone;

  return {
    product,
    docs,
    requiresDocuments,
    hasManual,
    hasDatasheet,
    docsOk,
    technicalOk,
    missingTechnical,
    needsClamp,
    clampOk,
    clamp,
    complete: docsOk && technicalOk && clampOk,
  };
}

export function productQualityIssues(rawProduct = {}) {
  const status = productQualityStatus(rawProduct);
  const issues = [];
  if (status.requiresDocuments && !status.hasDatasheet) issues.push('Datablad saknas');
  if (status.requiresDocuments && !status.hasManual) issues.push('Manual saknas');
  if (!status.technicalOk) issues.push(`Teknisk data saknas: ${status.missingTechnical.join(', ')}`);
  if (status.needsClamp && !status.clampOk) issues.push('Klämzon saknas');
  return issues;
}

function firstNonEmptyDocuments(...sources) {
  return sources.find(source => Array.isArray(source) && source.length > 0) || [];
}

export function selectedProductQualityInput(selected = {}, sourceProduct = null) {
  const snapshot = selected.product_snapshot || selected.snapshot || selected.productSnapshot || {};
  const technical = selected.technical_snapshot || snapshot.technical_data_snapshot || {};
  const docs = firstNonEmptyDocuments(
    selected.documents_snapshot,
    snapshot.documents_snapshot,
    sourceProduct?.documents_snapshot,
    sourceProduct?.documents,
    sourceProduct?.product_documents,
  );
  return {
    ...(sourceProduct || {}),
    ...snapshot,
    ...technical,
    category: snapshot.category || technical.category || sourceProduct?.category,
    name: selected.product_name || snapshot.name || sourceProduct?.name,
    documents_snapshot: docs,
    technical_data_snapshot: technical,
    product_meta_snapshot: snapshot.product_meta_snapshot || sourceProduct?.product_meta_snapshot,
  };
}
