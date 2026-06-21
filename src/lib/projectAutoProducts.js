import { createProductSnapshot, productMeta } from '@/lib/productDocuments';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function productById(products = [], id) {
  return products.find(product => String(product.id) === String(id)) || null;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function panelGroupCount(group = {}) {
  return Math.max(0, Math.round(toNumber(group.rows))) * Math.max(0, Math.round(toNumber(group.cols)));
}

function plannerFromProject(project = {}) {
  return safeJson(project.solar_roof_planner_data || project.panel_layout_data, { roofs: [] }) || { roofs: [] };
}

function panelWidthM(product = {}, orientation = 'Stående') {
  const width = (toNumber(product.width_mm, 1134) || 1134) / 1000;
  const height = (toNumber(product.height_mm, 1953) || 1953) / 1000;
  return String(orientation || '').toLowerCase().includes('ligg') ? height : width;
}

function buildSelectedProduct(product, quantity, source) {
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

function buildVirtualProduct(id, name, quantity, unit = 'st', systemSnapshot = null) {
  return {
    product_id: id,
    product_name: name,
    quantity: Math.max(0, Math.ceil(quantity || 0)),
    unit_price: 0,
    product_snapshot: {
      id,
      product_id: id,
      name,
      category: 'montagesystem',
      unit,
      price: 0,
      mounting_system_snapshot: systemSnapshot,
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

function collectPanelProducts(project = {}, products = []) {
  const planner = plannerFromProject(project);
  const counts = new Map();

  (planner.roofs || []).forEach(roof => {
    const productId = roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id;
    if (!productId) return;
    const count = (roof.panelGroups || []).reduce((sum, group) => sum + panelGroupCount(group), 0);
    if (!count) return;
    counts.set(productId, (counts.get(productId) || 0) + count);
  });

  return Array.from(counts.entries())
    .map(([productId, quantity]) => {
      const product = productById(products, productId);
      return product ? buildSelectedProduct(product, quantity, 'panels') : null;
    })
    .filter(Boolean);
}

function mountingProductForRoof(roof = {}, products = [], mounting = {}) {
  const perRoof = (mounting.perRoofSystems || []).find(item => String(item.roofId) === String(roof.id));
  const productId = roof.mountingSystemProductId
    || roof.mountingSystemProductSnapshot?.product_id
    || roof.mountingSystemProductSnapshot?.id
    || perRoof?.mountingSystemProductId
    || mounting.selectedMountingProductId
    || '';
  return {
    productId,
    product: productById(products, productId) || roof.mountingSystemProductSnapshot || mounting.selectedMountingProductSnapshot || null,
  };
}

function mountingKey(productId, product, fallbackName) {
  return String(productId || product?.id || product?.product_id || fallbackName || 'legacy').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
}

function collectMountingMaterials(project = {}, products = []) {
  const planner = plannerFromProject(project);
  const mounting = safeJson(project.mounting_data, {}) || {};
  const groups = new Map();

  (planner.roofs || []).forEach(roof => {
    const count = (roof.panelGroups || []).reduce((sum, group) => sum + panelGroupCount(group), 0);
    if (!count) return;
    const { productId, product } = mountingProductForRoof(roof, products, mounting);
    const fallbackName = [mounting.brandLabel, mounting.modelName].filter(Boolean).join(' ');
    if (!productId && !product && !fallbackName) return;
    const key = mountingKey(productId, product, fallbackName);
    if (!groups.has(key)) groups.set(key, { key, productId, product, fallbackName, roofs: [] });
    groups.get(key).roofs.push(roof);
  });

  if (!groups.size && mounting.modelName) {
    groups.set('legacy', {
      key: 'legacy',
      productId: mounting.selectedMountingProductId || '',
      product: productById(products, mounting.selectedMountingProductId) || mounting.selectedMountingProductSnapshot || null,
      fallbackName: [mounting.brandLabel, mounting.modelName].filter(Boolean).join(' '),
      roofs: planner.roofs || [],
    });
  }

  const result = [];

  groups.forEach(group => {
    const product = group.product;
    const meta = productMeta(product || {});
    const systemName = [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || group.fallbackName || 'Montagesystem';
    const systemSnapshot = product?.id ? createProductSnapshot(product) : product || null;
    const roofCount = Math.max(1, group.roofs.length);

    if (product?.id) result.push(buildSelectedProduct(product, roofCount, 'mounting-system'));

    const hookSpacingMm = toNumber(meta.max_hook_spacing_mm || meta.hook_spacing_mm || meta.hookSpacingMM || mounting.hookSpacing, 900);
    const railPieceLengthMm = toNumber(meta.rail_length_mm || meta.railLengthMm, 2400);
    const hookSpacingM = Math.max(0.4, hookSpacingMm / 1000);
    const railPieceLengthM = Math.max(0.5, railPieceLengthMm / 1000);
    let panelCount = 0;
    let railRuns = 0;
    let railLengthM = 0;
    let endClamps = 0;
    let midClamps = 0;

    group.roofs.forEach(roof => {
      const panelProduct = productById(products, roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id) || roof.panelProductSnapshot || {};
      (roof.panelGroups || []).forEach(panelGroup => {
        const rows = Math.max(0, Math.round(toNumber(panelGroup.rows)));
        const cols = Math.max(0, Math.round(toNumber(panelGroup.cols)));
        if (!rows || !cols) return;
        const railsPerRow = panelGroup.threeRails ? 3 : 2;
        const runWidthM = cols * panelWidthM(panelProduct, panelGroup.orientation) + Math.max(0, cols - 1) * 0.03 + 0.3;
        panelCount += rows * cols;
        railRuns += rows * railsPerRow;
        railLengthM += runWidthM * rows * railsPerRow;
        endClamps += rows * railsPerRow * 2;
        midClamps += Math.max(0, cols - 1) * rows * railsPerRow;
      });
    });

    if (!panelCount) return;
    const hooks = Math.ceil(railLengthM / hookSpacingM) + railRuns;
    const railPieces = Math.ceil(railLengthM / railPieceLengthM);
    const joints = Math.max(0, railPieces - railRuns);
    const screws = hooks * 2;
    const prefix = `auto:mounting:${group.key}`;

    result.push(
      buildVirtualProduct(`${prefix}:rails`, `Skenor – ${systemName}`, railPieces, 'st', systemSnapshot),
      buildVirtualProduct(`${prefix}:hooks`, `Fästen/krokar – ${systemName}`, hooks, 'st', systemSnapshot),
      buildVirtualProduct(`${prefix}:end-clamps`, `Ändklämmor – ${systemName}`, endClamps, 'st', systemSnapshot),
      buildVirtualProduct(`${prefix}:mid-clamps`, `Mittklämmor – ${systemName}`, midClamps, 'st', systemSnapshot),
      buildVirtualProduct(`${prefix}:joints`, `Skarvar – ${systemName}`, joints, 'st', systemSnapshot),
      buildVirtualProduct(`${prefix}:screws`, `Skruv – ${systemName}`, screws, 'st', systemSnapshot),
    );
  });

  return result.filter(item => item.quantity > 0);
}

export function mergeProjectAutoProducts(project = {}, products = []) {
  const manual = (Array.isArray(project.selected_products) ? project.selected_products : [])
    .filter(item => !item.auto_generated && item.auto_source !== 'panels' && item.auto_source !== 'mounting' && item.auto_source !== 'mounting-system');
  const auto = [
    ...collectPanelProducts(project, products),
    ...collectMountingMaterials(project, products),
  ];
  const selected_products = [...manual, ...auto];
  const total_cost = selected_products.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
  return { ...project, selected_products, total_cost };
}
