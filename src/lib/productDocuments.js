const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';

export const DOCUMENT_TYPE_LABELS = {
  datasheet: 'Datablad',
  manual: 'Manual',
  certificate: 'Certifikat',
  ce_approval: 'CE Approval',
  warranty: 'Garanti',
  installation_guide: 'Installationsguide',
  other: 'Övrigt dokument',
};

const TECHNICAL_SNAPSHOT_FIELDS = [
  'category',
  'name',
  'brand',
  'model',
  'article_number',
  'price',
  'unit',
  'power_watts',
  'capacity_kwh',
  'module_capacity_kwh',
  'usable_capacity_kwh',
  'dod_percent',
  'modules_count',
  'max_modules_per_stack',
  'max_battery_modules',
  'width_mm',
  'height_mm',
  'depth_mm',
  'thickness_mm',
  'weight_kg',
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
  'voc_v',
  'isc_a',
  'vmp_v',
  'imp_a',
  'temp_coeff_pmax_percent_c',
  'temp_coeff_voc_percent_c',
  'temp_coeff_isc_percent_c',
  'noct_c',
  'bifacial',
  'max_dc_power_kw',
  'max_dc_voltage_v',
  'startup_voltage_v',
  'mppt_voltage_min_v',
  'mppt_voltage_max_v',
  'nominal_dc_voltage_v',
  'mppt_count',
  'strings_per_mppt',
  'max_input_current_a',
  'max_short_circuit_current_a',
  'battery_supported',
  'phase_type',
  'inverter_type',
  'pv_inputs_per_mppt',
  'pv_inputs_count',
  'total_pv_inputs',
];

function documentIdFallback(index, doc = {}) {
  const base = [doc.type, doc.name, doc.file_url || doc.url].filter(Boolean).join('-');
  return base || `doc-${index}`;
}

export function normalizeDocumentType(type) {
  const value = String(type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['datasheet', 'data_sheet', 'datablad', 'data'].includes(value)) return 'datasheet';
  if (['manual', 'user_manual', 'installationsmanual'].includes(value)) return 'manual';
  if (['certificate', 'certifikat', 'cert'].includes(value)) return 'certificate';
  if (['ce', 'ce_approval', 'ce_declaration', 'declaration_of_conformity'].includes(value)) return 'ce_approval';
  if (['warranty', 'garanti'].includes(value)) return 'warranty';
  if (['installation_guide', 'installationsguide', 'installation', 'guide'].includes(value)) return 'installation_guide';
  return value || 'other';
}

export function splitProductDescription(description = '') {
  const text = String(description || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start === -1 || end === -1 || end <= start) return { cleanDescription: text.trim(), meta: {} };

  const cleanDescription = text.slice(0, start).trim();
  const raw = text.slice(start + META_START.length, end).trim();
  try {
    return { cleanDescription, meta: JSON.parse(raw) || {} };
  } catch {
    return { cleanDescription, meta: {} };
  }
}

export function buildProductDescription(cleanDescription = '', meta = {}) {
  const normalizedMeta = {
    ...(meta || {}),
    documents: normalizeDocuments(meta?.documents || []),
    updatedAt: new Date().toISOString(),
  };
  return `${String(cleanDescription || '').trim()}${META_START}${JSON.stringify(normalizedMeta)}${META_END}`.trim();
}

export function productMeta(product = {}) {
  if (product?.product_meta_snapshot && typeof product.product_meta_snapshot === 'object') return product.product_meta_snapshot;
  if (product?.meta && typeof product.meta === 'object') return product.meta;
  const { meta } = splitProductDescription(product?.description || '');
  return meta || {};
}

export function productDescription(product = {}) {
  return splitProductDescription(product?.description || '').cleanDescription;
}

export function normalizeDocuments(documents = []) {
  return Array.isArray(documents)
    ? documents
        .map((doc, index) => {
          const type = normalizeDocumentType(doc?.type || doc?.document_type);
          const fileUrl = doc?.file_url || doc?.url || '';
          return {
            id: doc?.id || documentIdFallback(index, { ...doc, type, file_url: fileUrl }),
            type,
            document_type: type,
            name: doc?.name || doc?.title || DOCUMENT_TYPE_LABELS[type] || 'Dokument',
            title: doc?.title || doc?.name || DOCUMENT_TYPE_LABELS[type] || 'Dokument',
            file_url: fileUrl,
            file_name: doc?.file_name || doc?.name || doc?.title || '',
            file_size: doc?.file_size,
            language: doc?.language || '',
            version: doc?.version || '',
            uploadedAt: doc?.uploadedAt || doc?.uploaded_at || new Date().toISOString(),
            uploaded_at: doc?.uploaded_at || doc?.uploadedAt || new Date().toISOString(),
            source: doc?.source || '',
          };
        })
        .filter(doc => doc.file_url)
    : [];
}

export function productDocuments(product = {}) {
  if (Array.isArray(product?.documents_snapshot)) return normalizeDocuments(product.documents_snapshot);
  if (Array.isArray(product?.documents)) return normalizeDocuments(product.documents);
  if (Array.isArray(product?.product_documents)) return normalizeDocuments(product.product_documents);
  const meta = productMeta(product);
  return normalizeDocuments(meta.documents || []);
}

export function productHasRequiredDocuments(product = {}) {
  const docs = productDocuments(product);
  return docs.some(doc => doc.type === 'datasheet') && docs.some(doc => doc.type === 'manual');
}

function numberOr(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function productClampData(product = {}) {
  const meta = productMeta(product);
  const clampSnapshot = product?.clamp_data_snapshot || product?.mounting_data_snapshot?.clampData || {};
  return {
    clampZoneMinMm: numberOr(product.clamp_zone_min_mm, numberOr(product.clampZoneMinMm, numberOr(clampSnapshot.clampZoneMinMm, numberOr(meta.clampZoneMinMm, null)))),
    clampZoneMaxMm: numberOr(product.clamp_zone_max_mm, numberOr(product.clampZoneMaxMm, numberOr(clampSnapshot.clampZoneMaxMm, numberOr(meta.clampZoneMaxMm, null)))),
    railOffsetTopMm: numberOr(product.rail_offset_top_mm, numberOr(product.railOffsetTopMm, numberOr(clampSnapshot.railOffsetTopMm, numberOr(meta.railOffsetTopMm, null)))),
    railOffsetBottomMm: numberOr(product.rail_offset_bottom_mm, numberOr(product.railOffsetBottomMm, numberOr(clampSnapshot.railOffsetBottomMm, numberOr(meta.railOffsetBottomMm, null)))),
    clampSource: product.clamp_source || product.clampSource || clampSnapshot.clampSource || meta.clampSource || '',
  };
}

export function productHasClampZone(product = {}) {
  const data = productClampData(product);
  return data.clampZoneMinMm != null && data.clampZoneMaxMm != null;
}

export function resolveProductClampZone(product = {}) {
  const heightMm = numberOr(product?.height_mm, 0) || 0;
  const data = productClampData(product);
  const hasProductZone = data.clampZoneMinMm != null && data.clampZoneMaxMm != null;
  const fallbackMin = heightMm ? Math.round(heightMm * 0.1) : null;
  const fallbackMax = heightMm ? Math.round(heightMm * 0.33) : null;
  const minMm = hasProductZone ? data.clampZoneMinMm : null;
  const maxMm = hasProductZone ? data.clampZoneMaxMm : null;
  const preferredMm = minMm != null && maxMm != null ? Math.round((minMm + maxMm) / 2) : null;

  return {
    minMm,
    maxMm,
    preferredMm,
    fallbackMinMm: fallbackMin,
    fallbackMaxMm: fallbackMax,
    railOffsetTopMm: hasProductZone ? (data.railOffsetTopMm ?? preferredMm) : null,
    railOffsetBottomMm: hasProductZone ? (data.railOffsetBottomMm ?? preferredMm) : null,
    hasProductZone,
    hasFallbackEstimate: !hasProductZone && fallbackMin != null && fallbackMax != null,
    source: hasProductZone ? (data.clampSource || 'Produktens sparade manual/datablad') : 'Klämzon saknas. Lägg in manual/datablad och fyll klämzonen från dokumentet.',
    label: hasProductZone ? `${Math.round(minMm)}–${Math.round(maxMm)} mm` : 'Saknas',
  };
}

function pickDefined(source = {}, fields = []) {
  return fields.reduce((acc, field) => {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') acc[field] = source[field];
    return acc;
  }, {});
}

export function hydrateProductWithMeta(product = {}) {
  const meta = productMeta(product);
  return { ...meta, ...product, product_meta_snapshot: meta };
}

export function createProductSnapshot(product = {}) {
  if (!product?.id) return null;
  const hydrated = hydrateProductWithMeta(product);
  const docs = productDocuments(hydrated);
  const meta = productMeta(product);
  const clampData = productClampData(hydrated);
  const technical = pickDefined(hydrated, TECHNICAL_SNAPSHOT_FIELDS);

  return {
    id: product.id,
    product_id: product.id,
    category: hydrated.category || 'ovrigt',
    name: hydrated.name || '',
    brand: hydrated.brand || '',
    model: hydrated.model || '',
    article_number: hydrated.article_number || '',
    price: hydrated.price,
    unit: hydrated.unit || 'st',
    image_url: hydrated.image_url || '',
    description: product.description || '',
    clean_description: productDescription(product),
    technical_data_snapshot: technical,
    documents_snapshot: docs,
    product_meta_snapshot: meta,
    clamp_data_snapshot: clampData,
    mounting_data_snapshot: {
      clampData,
      hasProductZone: productHasClampZone(hydrated),
    },
    source_product_updated_at: product.updated_date || product.updated_at || product.modified_date || '',
    snapshot_created_at: new Date().toISOString(),
  };
}

export function selectedProjectProductIds(project = {}) {
  const ids = new Set();
  (Array.isArray(project?.selected_products) ? project.selected_products : []).forEach(item => {
    if (item?.product_id) ids.add(item.product_id);
    if (item?.product_snapshot?.product_id) ids.add(item.product_snapshot.product_id);
    if (item?.product_snapshot?.id) ids.add(item.product_snapshot.id);
  });

  try {
    const planner = JSON.parse(project?.solar_roof_planner_data || project?.panel_layout_data || '{}');
    (planner?.roofs || []).forEach(roof => {
      if (roof.panelProductId) ids.add(roof.panelProductId);
      if (roof.panelProductSnapshot?.id) ids.add(roof.panelProductSnapshot.id);
      if (roof.panelProductSnapshot?.product_id) ids.add(roof.panelProductSnapshot.product_id);
    });
  } catch {}

  try {
    const strings = JSON.parse(project?.string_layout_data || '{}');
    (strings?.strings || []).forEach(item => {
      if (item.panelProductId) ids.add(item.panelProductId);
      if (item.panelProductSnapshot?.id) ids.add(item.panelProductSnapshot.id);
      if (item.panelProductSnapshot?.product_id) ids.add(item.panelProductSnapshot.product_id);
    });
    (strings?.inverterConfigs || []).forEach(item => item?.productId && ids.add(item.productId));
  } catch {}

  try {
    const mounting = JSON.parse(project?.mounting_data || '{}');
    if (mounting?.selectedPanelId) ids.add(mounting.selectedPanelId);
  } catch {}

  return Array.from(ids);
}
