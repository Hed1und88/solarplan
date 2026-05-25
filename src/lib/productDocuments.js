const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';

const DOC_TYPES = ['datasheet', 'manual'];
const PANEL_REQUIRED_FIELDS = ['power_watts', 'width_mm', 'height_mm', 'voc_v', 'vmp_v', 'isc_a', 'imp_a'];
const INVERTER_REQUIRED_FIELDS = ['power_watts', 'max_dc_voltage_v', 'mppt_voltage_min_v', 'mppt_voltage_max_v', 'mppt_count', 'max_input_current_a', 'max_short_circuit_current_a'];
const BATTERY_REQUIRED_FIELDS = ['capacity_kwh'];

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
    documentDataExtracted: Boolean(meta?.documentDataExtracted),
    documentDataSource: meta?.documentDataSource || '',
    documentDataExtractedAt: meta?.documentDataExtractedAt || '',
    updatedAt: new Date().toISOString(),
  };
  return `${String(cleanDescription || '').trim()}${META_START}${JSON.stringify(normalizedMeta)}${META_END}`.trim();
}

export function productMeta(product = {}) {
  const { meta } = splitProductDescription(product?.description || '');
  return meta || {};
}

export function productDescription(product = {}) {
  return splitProductDescription(product?.description || '').cleanDescription;
}

export function normalizeDocuments(documents = []) {
  return Array.isArray(documents)
    ? documents
        .map((doc, index) => ({
          id: doc.id || `${Date.now()}-${index}`,
          type: doc.type === 'manual' ? 'manual' : 'datasheet',
          name: doc.name || (doc.type === 'manual' ? 'Manual' : 'Datablad'),
          file_url: doc.file_url || doc.url || '',
          uploadedAt: doc.uploadedAt || new Date().toISOString(),
          extractedText: doc.extractedText || '',
          extractionStatus: doc.extractionStatus || (doc.extractedText ? 'extracted' : ''),
        }))
        .filter(doc => doc.file_url)
    : [];
}

export function productDocuments(product = {}) {
  return normalizeDocuments(productMeta(product).documents || []);
}

export function productHasRequiredDocuments(product = {}) {
  const docs = productDocuments(product);
  return DOC_TYPES.every(type => docs.some(doc => doc.type === type && doc.file_url));
}

export function productHasExtractedDocuments(product = {}) {
  const docs = productDocuments(product);
  return DOC_TYPES.every(type => docs.some(doc => doc.type === type && (doc.extractedText || doc.extractionStatus === 'extracted')));
}

function numberOr(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasNumber(product, field) {
  return Number.isFinite(Number(product?.[field]));
}

function requiredFieldsForCategory(category) {
  if (category === 'solpanel') return PANEL_REQUIRED_FIELDS;
  if (category === 'vaxelriktare') return INVERTER_REQUIRED_FIELDS;
  if (category === 'batteri') return BATTERY_REQUIRED_FIELDS;
  return [];
}

export function missingRequiredProductFields(product = {}) {
  return requiredFieldsForCategory(product?.category).filter(field => !hasNumber(product, field));
}

export function productClampData(product = {}) {
  const meta = productMeta(product);
  return {
    clampZoneMinMm: numberOr(product.clamp_zone_min_mm, numberOr(meta.clampZoneMinMm, null)),
    clampZoneMaxMm: numberOr(product.clamp_zone_max_mm, numberOr(meta.clampZoneMaxMm, null)),
    railOffsetTopMm: numberOr(product.rail_offset_top_mm, numberOr(meta.railOffsetTopMm, null)),
    railOffsetBottomMm: numberOr(product.rail_offset_bottom_mm, numberOr(meta.railOffsetBottomMm, null)),
    clampSource: product.clamp_source || meta.clampSource || '',
  };
}

export function productHasDocumentBackedData(product = {}) {
  const meta = productMeta(product);
  const missingFields = missingRequiredProductFields(product);
  const hasRequiredDocs = productHasRequiredDocuments(product);
  const hasExtractedDocs = productHasExtractedDocuments(product) || Boolean(meta.documentDataExtracted);
  const hasRequiredFields = missingFields.length === 0;

  if (product?.category === 'solpanel') {
    const clamp = productClampData(product);
    return hasRequiredDocs && hasExtractedDocs && hasRequiredFields && clamp.clampZoneMinMm != null && clamp.clampZoneMaxMm != null;
  }

  return hasRequiredDocs && hasExtractedDocs && hasRequiredFields;
}

export function productValidationStatus(product = {}) {
  const missingFields = missingRequiredProductFields(product);
  const docs = productDocuments(product);
  const missingDocs = DOC_TYPES.filter(type => !docs.some(doc => doc.type === type && doc.file_url));
  const missingExtractedDocs = DOC_TYPES.filter(type => !docs.some(doc => doc.type === type && (doc.extractedText || doc.extractionStatus === 'extracted')));
  const clamp = productClampData(product);
  const missingClamp = product?.category === 'solpanel' && (clamp.clampZoneMinMm == null || clamp.clampZoneMaxMm == null);
  const ready = productHasDocumentBackedData(product);

  return {
    ready,
    missingDocs,
    missingExtractedDocs,
    missingFields,
    missingClamp,
    hasRequiredDocs: missingDocs.length === 0,
    hasExtractedDocs: missingExtractedDocs.length === 0,
    message: ready
      ? 'Klar för kalkyl: manual, datablad och data är sparade från dokument.'
      : [
          missingDocs.length ? `Saknar ${missingDocs.map(type => type === 'manual' ? 'manual' : 'datablad').join(', ')}` : '',
          missingExtractedDocs.length ? `Dokumentdata ej extraherad för ${missingExtractedDocs.map(type => type === 'manual' ? 'manual' : 'datablad').join(', ')}` : '',
          missingFields.length ? `Saknar tekniska fält: ${missingFields.join(', ')}` : '',
          missingClamp ? 'Saknar klämzon från panelens manual/datablad' : '',
        ].filter(Boolean).join('. '),
  };
}

export function resolveProductClampZone(product = {}) {
  const data = productClampData(product);
  const hasProductZone = data.clampZoneMinMm != null && data.clampZoneMaxMm != null;
  const minMm = hasProductZone ? data.clampZoneMinMm : null;
  const maxMm = hasProductZone ? data.clampZoneMaxMm : null;
  const preferredMm = minMm != null && maxMm != null ? Math.round((minMm + maxMm) / 2) : null;

  return {
    minMm,
    maxMm,
    preferredMm,
    railOffsetTopMm: data.railOffsetTopMm ?? preferredMm,
    railOffsetBottomMm: data.railOffsetBottomMm ?? preferredMm,
    hasProductZone,
    source: hasProductZone ? (data.clampSource || 'Produktens sparade manual/datablad') : 'SAKNAS: Klämzon måste hämtas från panelens uppladdade manual/datablad innan montagekalkyl används.',
    label: minMm != null && maxMm != null ? `${Math.round(minMm)}–${Math.round(maxMm)} mm` : 'Saknas – dokument krävs',
  };
}

export function selectedProjectProductIds(project = {}) {
  const ids = new Set();
  (Array.isArray(project?.selected_products) ? project.selected_products : []).forEach(item => item?.product_id && ids.add(item.product_id));

  try {
    const planner = JSON.parse(project?.solar_roof_planner_data || project?.panel_layout_data || '{}');
    (planner?.roofs || []).forEach(roof => {
      if (roof.panelProductId) ids.add(roof.panelProductId);
    });
  } catch {}

  try {
    const mounting = JSON.parse(project?.mounting_data || '{}');
    if (mounting?.selectedPanelId) ids.add(mounting.selectedPanelId);
  } catch {}

  return Array.from(ids);
}
