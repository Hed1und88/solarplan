const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';

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
        }))
        .filter(doc => doc.file_url)
    : [];
}

export function productDocuments(product = {}) {
  return normalizeDocuments(productMeta(product).documents || []);
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
  return {
    clampZoneMinMm: numberOr(product.clamp_zone_min_mm, numberOr(meta.clampZoneMinMm, null)),
    clampZoneMaxMm: numberOr(product.clamp_zone_max_mm, numberOr(meta.clampZoneMaxMm, null)),
    railOffsetTopMm: numberOr(product.rail_offset_top_mm, numberOr(meta.railOffsetTopMm, null)),
    railOffsetBottomMm: numberOr(product.rail_offset_bottom_mm, numberOr(meta.railOffsetBottomMm, null)),
    clampSource: product.clamp_source || meta.clampSource || '',
  };
}

export function resolveProductClampZone(product = {}) {
  const heightMm = numberOr(product?.height_mm, 0) || 0;
  const data = productClampData(product);
  const hasProductZone = data.clampZoneMinMm != null && data.clampZoneMaxMm != null;
  const fallbackMin = heightMm ? Math.round(heightMm * 0.1) : null;
  const fallbackMax = heightMm ? Math.round(heightMm * 0.33) : null;
  const minMm = hasProductZone ? data.clampZoneMinMm : fallbackMin;
  const maxMm = hasProductZone ? data.clampZoneMaxMm : fallbackMax;
  const preferredMm = minMm != null && maxMm != null ? Math.round((minMm + maxMm) / 2) : null;

  return {
    minMm,
    maxMm,
    preferredMm,
    railOffsetTopMm: data.railOffsetTopMm ?? preferredMm,
    railOffsetBottomMm: data.railOffsetBottomMm ?? preferredMm,
    hasProductZone,
    source: hasProductZone ? (data.clampSource || 'Produktens sparade manual/datablad') : 'Fallback: 10–33 % av panelhöjd. Lägg in manual/datablad för exakt klämzon.',
    label: minMm != null && maxMm != null ? `${Math.round(minMm)}–${Math.round(maxMm)} mm` : 'Saknas',
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
