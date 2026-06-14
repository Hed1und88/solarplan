import { createProductSnapshot } from '@/lib/productDocuments';

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

function panelWidthM(product = {}) {
  return (toNumber(product.width_mm, 1134) || 1134) / 1000;
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

function buildVirtualProduct(id, name, quantity, unit = 'st') {
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
      snapshot_created_at: new Date().toISOString(),
      auto_generated: true,
    },
    documents_snapshot: [],
    technical_snapshot: null,
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
    const panelCount = (roof.panelGroups || []).reduce((sum, group) => sum + panelGroupCount(group), 0);
    if (!panelCount) return;
    counts.set(productId, (counts.get(productId) || 0) + panelCount);
  });

  return Array.from(counts.entries())
    .map(([productId, quantity]) => {
      const product = productById(products, productId);
      return product ? buildSelectedProduct(product, quantity, 'panels') : null;
    })
    .filter(Boolean);
}

function collectMountingMaterials(project = {}, products = []) {
  const mounting = safeJson(project.mounting_data, null);
  if (!mounting?.modelName) return [];

  const planner = plannerFromProject(project);
  const hookSpacingM = Math.max(0.4, toNumber(mounting.hookSpacing, 900) / 1000);
  let panelCount = 0;
  let railRuns = 0;
  let railLengthM = 0;
  let endClamps = 0;
  let midClamps = 0;

  (planner.roofs || []).forEach(roof => {
    const roofProduct = productById(products, roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id) || roof.panelProductSnapshot || {};
    const widthM = panelWidthM(roofProduct);
    (roof.panelGroups || []).forEach(group => {
      const rows = Math.max(0, Math.round(toNumber(group.rows)));
      const cols = Math.max(0, Math.round(toNumber(group.cols)));
      if (!rows || !cols) return;
      panelCount += rows * cols;
      railRuns += rows * 2;
      const runLengthM = cols * widthM + Math.max(0, cols - 1) * 0.03 + 0.3;
      railLengthM += runLengthM * rows * 2;
      endClamps += rows * 4;
      midClamps += Math.max(0, cols - 1) * rows * 2;
    });
  });

  if (!panelCount) panelCount = toNumber(mounting.panelCount, 0);
  if (!panelCount) return [];
  if (!railRuns) railRuns = Math.max(2, Math.ceil(panelCount / 10) * 2);
  if (!railLengthM) railLengthM = panelCount * 1.2 * 2;
  if (!endClamps) endClamps = railRuns * 2;
  if (!midClamps) midClamps = Math.max(0, panelCount - railRuns) * 2;

  const hooks = Math.ceil(railLengthM / hookSpacingM) + railRuns;
  const railPieces = Math.ceil(railLengthM / 2.4);
  const joints = Math.max(0, railPieces - railRuns);
  const screws = hooks * 2;

  return [
    buildVirtualProduct('auto:mounting:rails', `Skenor ${mounting.brandLabel || ''} ${mounting.modelName}`.trim(), railPieces),
    buildVirtualProduct('auto:mounting:hooks', 'Fästen/krokar', hooks),
    buildVirtualProduct('auto:mounting:end-clamps', 'Ändklämmor', endClamps),
    buildVirtualProduct('auto:mounting:mid-clamps', 'Mittklämmor', midClamps),
    buildVirtualProduct('auto:mounting:joints', 'Skarvar', joints),
    buildVirtualProduct('auto:mounting:screws', 'Skruv', screws),
  ].filter(item => item.quantity > 0);
}

export function mergeProjectAutoProducts(project = {}, products = []) {
  const manual = (Array.isArray(project.selected_products) ? project.selected_products : [])
    .filter(item => !item.auto_generated && item.auto_source !== 'panels' && item.auto_source !== 'mounting');
  const auto = [
    ...collectPanelProducts(project, products),
    ...collectMountingMaterials(project, products),
  ];
  const selected_products = [...manual, ...auto];
  const total_cost = selected_products.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
  return { ...project, selected_products, total_cost };
}
