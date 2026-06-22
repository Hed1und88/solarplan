import { createProductSnapshot, productMeta } from '@/lib/productDocuments';

const safeJson = (raw, fallback = null) => { try { return JSON.parse(raw || '') || fallback; } catch { return fallback; } };
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const byId = (products, id) => products.find(product => String(product.id) === String(id)) || null;
const planner = project => safeJson(project.solar_roof_planner_data || project.panel_layout_data, { roofs: [] }) || { roofs: [] };
const countGroup = group => Math.max(0, Math.round(num(group.rows))) * Math.max(0, Math.round(num(group.cols)));

function selectedProduct(product, quantity, source) {
  const snapshot = createProductSnapshot(product);
  return {
    product_id: product.id,
    product_name: product.name || product.model || 'Produkt',
    quantity: Math.max(1, Math.round(quantity || 1)),
    unit_price: Number(product.price) || 0,
    product_snapshot: snapshot,
    documents_snapshot: snapshot?.documents_snapshot || [],
    technical_snapshot: snapshot?.technical_data_snapshot || null,
    snapshot_created_at: snapshot?.snapshot_created_at || new Date().toISOString(),
    auto_generated: true,
    auto_source: source,
  };
}

function virtualProduct(item, systemSnapshot = null) {
  return {
    product_id: item.productId,
    product_name: item.name,
    quantity: Math.max(0, Math.ceil(Number(item.quantity || 0))),
    unit_price: 0,
    product_snapshot: {
      id: item.productId,
      product_id: item.productId,
      name: item.name,
      article_number: item.articleNumber || '',
      e_number: item.eNumber || '',
      category: 'montagesystem',
      unit: item.unit || 'st',
      price: 0,
      mounting_system_snapshot: systemSnapshot,
      mounting_engine_id: item.engineId || '',
      mounting_calculation_version: item.engineVersion || '',
      snapshot_created_at: new Date().toISOString(),
      auto_generated: true,
    },
    documents_snapshot: systemSnapshot?.documents_snapshot || [],
    technical_snapshot: systemSnapshot?.technical_data_snapshot || null,
    snapshot_created_at: new Date().toISOString(),
    auto_generated: true,
    auto_source: 'mounting',
  };
}

function panelProducts(project, products) {
  const quantities = new Map();
  (planner(project).roofs || []).forEach(roof => {
    const id = roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id;
    const quantity = (roof.panelGroups || []).reduce((sum, group) => sum + countGroup(group), 0);
    if (id && quantity) quantities.set(id, (quantities.get(id) || 0) + quantity);
  });
  return [...quantities.entries()].map(([id, quantity]) => {
    const product = byId(products, id);
    return product ? selectedProduct(product, quantity, 'panels') : null;
  }).filter(Boolean);
}

function engineMaterials(mounting) {
  const grouped = new Map();
  let hasEngineResult = false;
  (mounting.perRoofSystems || []).forEach(system => {
    const calculation = system?.calculation;
    if (calculation?.status === 'blocked' || !Array.isArray(calculation?.materials?.materials)) return;
    hasEngineResult = true;
    calculation.materials.materials.forEach(material => {
      const id = material.productId || `${calculation.engineId}:${material.articleNumber || material.name}`;
      const current = grouped.get(id) || {
        ...material,
        productId: id,
        quantity: 0,
        engineId: calculation.engineId,
        engineVersion: calculation.engineVersion,
      };
      current.quantity += Number(material.quantity || 0);
      grouped.set(id, current);
    });
  });
  if (!hasEngineResult) return null;
  return [...grouped.values()].map(item => virtualProduct(item, mounting.selectedMountingProductSnapshot || null));
}

function genericMountingMaterials(project, products, mounting) {
  const roofs = planner(project).roofs || [];
  const result = [];
  const groups = new Map();

  roofs.forEach(roof => {
    const saved = (mounting.perRoofSystems || []).find(item => String(item.roofId) === String(roof.id));
    const id = roof.mountingSystemProductId || saved?.mountingSystemProductId || mounting.selectedMountingProductId || '';
    const product = byId(products, id) || roof.mountingSystemProductSnapshot || mounting.selectedMountingProductSnapshot || null;
    if (!id && !product) return;
    const key = id || product?.name || 'mounting';
    if (!groups.has(key)) groups.set(key, { product, roofs: [] });
    groups.get(key).roofs.push(roof);
  });

  groups.forEach(({ product, roofs: systemRoofs }, key) => {
    const snapshot = product?.id ? createProductSnapshot(product) : product;
    const meta = productMeta(product || {});
    if (product?.id) result.push(selectedProduct(product, systemRoofs.length, 'mounting-system'));

    let railLengthM = 0;
    let railRuns = 0;
    let endClamps = 0;
    let midClamps = 0;
    systemRoofs.forEach(roof => {
      const panel = byId(products, roof.panelProductId) || roof.panelProductSnapshot || {};
      const panelWidthM = (String(roof.orientation || '').toLowerCase().includes('ligg') ? num(panel.height_mm, 1953) : num(panel.width_mm, 1134)) / 1000;
      (roof.panelGroups || []).forEach(group => {
        const rows = Math.max(0, Math.round(num(group.rows)));
        const cols = Math.max(0, Math.round(num(group.cols)));
        const rails = group.threeRails ? 3 : 2;
        const gapM = num(group.panelGapMm, num(roof.panelGapMm, 20)) / 1000;
        const runM = cols * panelWidthM + Math.max(0, cols - 1) * gapM + 0.3;
        railLengthM += runM * rows * rails;
        railRuns += rows * rails;
        endClamps += rows * rails * 2;
        midClamps += Math.max(0, cols - 1) * rows * rails;
      });
    });

    const systemName = [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Montagesystem';
    const railPieceM = num(meta.rail_length_mm || meta.railLengthMm) / 1000;
    const hookSpacingM = num(meta.max_hook_spacing_mm || meta.hook_spacing_mm || meta.hookSpacingMM || mounting.hookSpacing) / 1000;
    const rails = railPieceM > 0 ? Math.ceil(railLengthM / railPieceM) : 0;
    const hooks = hookSpacingM > 0 ? Math.ceil(railLengthM / hookSpacingM) + railRuns : 0;
    const prefix = `auto:mounting:${String(key).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}`;
    result.push(virtualProduct({ productId: `${prefix}:rail-length`, name: `Skenlängd – ${systemName}`, quantity: Math.ceil(railLengthM), unit: 'm' }, snapshot));
    result.push(virtualProduct({ productId: `${prefix}:end-clamps`, name: `Ändklämmor – ${systemName}`, quantity: endClamps, unit: 'st' }, snapshot));
    result.push(virtualProduct({ productId: `${prefix}:mid-clamps`, name: `Mittklämmor – ${systemName}`, quantity: midClamps, unit: 'st' }, snapshot));
    if (rails) result.push(virtualProduct({ productId: `${prefix}:rails`, name: `Skenor – ${systemName}`, quantity: rails, unit: 'st' }, snapshot));
    if (hooks) result.push(virtualProduct({ productId: `${prefix}:hooks`, name: `Fästen/krokar – ${systemName}`, quantity: hooks, unit: 'st' }, snapshot));
  });

  return result.filter(item => item.quantity > 0);
}

function mountingProducts(project, products) {
  const mounting = safeJson(project.mounting_data, {}) || {};
  const exact = engineMaterials(mounting);
  if (exact) {
    const system = byId(products, mounting.selectedMountingProductId);
    return [...(system ? [selectedProduct(system, 1, 'mounting-system')] : []), ...exact];
  }
  return genericMountingMaterials(project, products, mounting);
}

export function mergeProjectAutoProducts(project = {}, products = []) {
  const manual = (Array.isArray(project.selected_products) ? project.selected_products : [])
    .filter(item => !item.auto_generated && !['panels', 'mounting', 'mounting-system'].includes(item.auto_source));
  const selected_products = [...manual, ...panelProducts(project, products), ...mountingProducts(project, products)];
  const total_cost = selected_products.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
  return { ...project, selected_products, total_cost };
}
