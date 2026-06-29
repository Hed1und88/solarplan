import { createProductSnapshot, productMeta } from '@/lib/productDocuments';
import { calculateMountingRoof, resolveMountingEngine } from '@/lib/mountingEngines';

const safeJson = (raw, fallback = null) => { try { return JSON.parse(raw || '') || fallback; } catch { return fallback; } };
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const byId = (products, id) => products.find(product => String(product.id) === String(id)) || null;
const planner = project => safeJson(project.solar_roof_planner_data || project.panel_layout_data, { roofs: [] }) || { roofs: [] };
const batteryPlanner = project => safeJson(project.battery_layout_data, { devices: [] }) || { devices: [] };
const countGroup = group => Math.max(0, Math.round(num(group.rows))) * Math.max(0, Math.round(num(group.cols)));
const countRoofPanels = roof => (roof.panelGroups || []).reduce((sum, group) => sum + countGroup(group), 0);
const productLabel = product => [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.product_name || 'Produkt';

function snapshotDocuments(snapshot = {}) {
  if (Array.isArray(snapshot.documents_snapshot)) return snapshot.documents_snapshot;
  if (Array.isArray(snapshot.product_snapshot?.documents_snapshot)) return snapshot.product_snapshot.documents_snapshot;
  return [];
}

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

function selectedSnapshot(snapshot, quantity, source, fallbackId = '') {
  const productId = snapshot?.product_id || snapshot?.id || fallbackId;
  if (!productId) return null;
  return {
    product_id: productId,
    product_name: snapshot?.name || snapshot?.product_name || snapshot?.model || 'Produkt',
    quantity: Math.max(1, Math.round(quantity || 1)),
    unit_price: Number(snapshot?.price) || 0,
    product_snapshot: snapshot,
    documents_snapshot: snapshotDocuments(snapshot),
    technical_snapshot: snapshot?.technical_data_snapshot || snapshot?.technical_snapshot || null,
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

function addProductQuantity(quantities, snapshots, rawId, quantity = 1, snapshot = null) {
  const id = rawId || snapshot?.product_id || snapshot?.id;
  const amount = Math.max(0, Math.round(num(quantity, 0)));
  if (!id || !amount) return;
  const key = String(id);
  quantities.set(key, (quantities.get(key) || 0) + amount);
  if (snapshot) snapshots.set(key, snapshot);
}

function mapSelectedProducts(quantities, snapshots, products, source, allowedCategories = null) {
  return [...quantities.entries()].map(([id, quantity]) => {
    const product = byId(products, id);
    if (allowedCategories && product && !allowedCategories.includes(product.category)) return null;
    if (allowedCategories && !product) return null;
    return product ? selectedProduct(product, quantity, source) : selectedSnapshot(snapshots.get(id), quantity, source, id);
  }).filter(Boolean);
}

function panelProducts(project, products) {
  const quantities = new Map();
  const snapshots = new Map();
  (planner(project).roofs || []).forEach(roof => {
    const snapshot = roof.panelProductSnapshot || null;
    const id = roof.panelProductId || snapshot?.product_id || snapshot?.id;
    addProductQuantity(quantities, snapshots, id, countRoofPanels(roof), snapshot);
  });
  return mapSelectedProducts(quantities, snapshots, products, 'panels', ['solpanel']);
}

function batteryRoomProducts(project, products) {
  const layout = batteryPlanner(project);
  const quantities = new Map();
  const snapshots = new Map();
  const devices = Array.isArray(layout.devices) ? layout.devices : [];

  devices.forEach(device => {
    const snapshot = device?.productSnapshot || device?.product_snapshot || null;
    const id = device?.productId || device?.product_id || snapshot?.product_id || snapshot?.id;
    const product = byId(products, id);
    const category = product?.category || device?.category || snapshot?.category || '';
    if (!['batteri', 'brytare', 'elcentral'].includes(category)) return;
    addProductQuantity(quantities, snapshots, id, device?.quantity || 1, snapshot);
  });

  return mapSelectedProducts(quantities, snapshots, products, 'battery-room', ['batteri', 'brytare', 'elcentral']);
}

function stringProducts(project, products) {
  const data = safeJson(project.string_layout_data, {}) || {};
  const quantities = new Map();
  const snapshots = new Map();
  const candidates = Array.isArray(data.inverterConfigs) ? data.inverterConfigs : [];

  candidates.forEach(item => {
    const snapshot = item?.productSnapshot || item?.product_snapshot || null;
    const id = item?.productId || item?.product_id || snapshot?.product_id || snapshot?.id;
    const product = byId(products, id);
    if (!product || product.category !== 'vaxelriktare') return;
    addProductQuantity(quantities, snapshots, id, item?.quantity || 1, snapshot);
  });

  return mapSelectedProducts(quantities, snapshots, products, 'strings', ['vaxelriktare']);
}

function storedMountingSelection(project, roof, roofIndex) {
  if (typeof window === 'undefined' || !project?.id) return null;
  try {
    const data = JSON.parse(window.localStorage.getItem(`solarplan:mounting-selection:${project.id}`) || '{}');
    const direct = data[`${roofIndex}:${roof.name || 'tak'}`];
    if (direct) return direct;
    return Object.values(data).find(item => item?.roofName === roof.name || Number(item?.roofIndex) === Number(roofIndex)) || null;
  } catch {
    return null;
  }
}

function mountingWithAutomaticCalculations(project, products, mounting) {
  const roofs = planner(project).roofs || [];
  const existing = Array.isArray(mounting.perRoofSystems) ? mounting.perRoofSystems : [];
  const perRoofSystems = roofs.map((roof, roofIndex) => {
    const saved = existing.find(item => String(item.roofId) === String(roof.id)) || {};
    const stored = storedMountingSelection(project, roof, roofIndex) || {};
    const mountingProductId = roof.mountingSystemProductId || saved.mountingSystemProductId || mounting.selectedMountingProductId || '';
    const system = byId(products, mountingProductId) || roof.mountingSystemProductSnapshot || mounting.selectedMountingProductSnapshot || null;
    const panel = byId(products, roof.panelProductId) || roof.panelProductSnapshot || null;
    const systemVariant = roof.mountingSystemVariant || stored.systemVariant || saved.systemVariant || 'parallel';
    const attachmentMethod = stored.attachmentMethod || saved.attachmentMethod || roof.roofType || roof.material || '';
    const panelCount = countRoofPanels(roof);
    const config = {
      ...saved,
      mountingProductId,
      systemVariant,
      terrainCategory: saved.terrainCategory || roof.terrainCategory || 'II',
      ridgeHeightM: saved.ridgeHeightM ?? roof.ridgeHeightM ?? '',
      attachmentMethod,
      panelGapMm: saved.panelGapMm ?? roof.panelGapMm ?? 20,
      clampedFrameSide: saved.clampedFrameSide || 'long',
      railDirectionRelativeToLongFrame: saved.railDirectionRelativeToLongFrame || 'cross',
    };

    let calculation = saved.calculation || null;
    const calculationPanelCount = Number(saved.panelCount || 0);
    const calculationMatches = calculation
      && String(saved.mountingSystemProductId || '') === String(mountingProductId || '')
      && String(saved.systemVariant || '') === String(systemVariant || '')
      && String(saved.attachmentMethod || '') === String(attachmentMethod || '')
      && calculationPanelCount === panelCount;

    if (!calculationMatches && panelCount > 0 && system) {
      try {
        calculation = calculateMountingRoof({ project, roof, panelProduct: panel || {}, mountingProduct: system, config });
      } catch (error) {
        calculation = {
          engineId: resolveMountingEngine(system || {})?.id || null,
          state: 'blocked',
          status: { loadsValidated: false, capacityValidated: false },
          errors: [error?.message || 'Montageberäkningen kunde inte genomföras.'],
          warnings: [],
          materials: null,
        };
      }
    }

    return {
      ...saved,
      roofId: roof.id,
      roofName: roof.name,
      panelCount,
      panelProductId: roof.panelProductId || '',
      panelProductName: productLabel(panel),
      mountingSystemProductId: mountingProductId,
      mountingSystemProductName: productLabel(system),
      engineId: resolveMountingEngine(system || {})?.id || calculation?.engineId || null,
      ...config,
      calculation,
    };
  });

  const primary = perRoofSystems.find(item => item.panelCount > 0 && item.mountingSystemProductId) || perRoofSystems[0];
  const primarySystem = primary ? byId(products, primary.mountingSystemProductId) : null;
  const primaryRoof = primary ? roofs.find(roof => String(roof.id) === String(primary.roofId)) : null;
  const primaryPanel = primaryRoof ? byId(products, primaryRoof.panelProductId) || primaryRoof.panelProductSnapshot : null;

  return {
    ...mounting,
    source: 'paneler-automatic-mounting',
    engineId: primary?.engineId || mounting.engineId || null,
    selectedMountingProductId: primary?.mountingSystemProductId || mounting.selectedMountingProductId || '',
    selectedMountingProductName: primary?.mountingSystemProductName || mounting.selectedMountingProductName || '',
    selectedMountingProductSnapshot: primarySystem ? createProductSnapshot(primarySystem) : mounting.selectedMountingProductSnapshot || null,
    selectedPanelId: primaryRoof?.panelProductId || mounting.selectedPanelId || '',
    selectedPanelName: productLabel(primaryPanel),
    selectedPanelSnapshot: primaryPanel?.id ? createProductSnapshot(primaryPanel) : mounting.selectedPanelSnapshot || null,
    panelCount: roofs.reduce((sum, roof) => sum + countRoofPanels(roof), 0),
    perRoofSystems,
  };
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
    else if (snapshot) result.push(selectedSnapshot(snapshot, systemRoofs.length, 'mounting-system'));

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
        const railCount = group.threeRails ? 3 : 2;
        const gapM = num(group.panelGapMm, num(roof.panelGapMm, 20)) / 1000;
        const runM = cols * panelWidthM + Math.max(0, cols - 1) * gapM + 0.3;
        railLengthM += runM * rows * railCount;
        railRuns += rows * railCount;
        endClamps += rows * railCount * 2;
        midClamps += Math.max(0, cols - 1) * rows * railCount;
      });
    });

    const systemName = [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Montagesystem';
    const railPieceM = num(meta.rail_length_mm || meta.railLengthMm) / 1000;
    const hookSpacingM = num(meta.max_hook_spacing_mm || meta.hook_spacing_mm || meta.hookSpacingMM || mounting.hookSpacing) / 1000;
    const rails = railPieceM > 0 ? Math.ceil(railLengthM / railPieceM) : 0;
    const hooks = hookSpacingM > 0 ? Math.ceil(railLengthM / hookSpacingM) + railRuns : 0;
    const railJoints = rails > 0 ? Math.max(0, rails - railRuns) : 0;
    const screwsPerFastener = Math.max(1, Math.round(num(meta.screws_per_fastener || meta.screwsPerFastener, 2)));
    const screwsPerJoint = Math.max(0, Math.round(num(meta.screws_per_rail_joint || meta.screwsPerRailJoint, 4)));
    const screws = hooks > 0 ? hooks * screwsPerFastener + railJoints * screwsPerJoint : 0;
    const prefix = `auto:mounting:${String(key).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}`;
    result.push(virtualProduct({ productId: `${prefix}:rail-length`, name: `Skenlängd – ${systemName}`, quantity: Math.ceil(railLengthM), unit: 'm' }, snapshot));
    result.push(virtualProduct({ productId: `${prefix}:end-clamps`, name: `Ändklämmor – ${systemName}`, quantity: endClamps, unit: 'st' }, snapshot));
    result.push(virtualProduct({ productId: `${prefix}:mid-clamps`, name: `Mittklämmor – ${systemName}`, quantity: midClamps, unit: 'st' }, snapshot));
    if (rails) result.push(virtualProduct({ productId: `${prefix}:rails`, name: `Skenor – ${systemName}`, quantity: rails, unit: 'st' }, snapshot));
    if (hooks) result.push(virtualProduct({ productId: `${prefix}:hooks`, name: `Fästen/krokar – ${systemName}`, quantity: hooks, unit: 'st' }, snapshot));
    if (screws) result.push(virtualProduct({ productId: `${prefix}:screws`, name: `Skruv – ${systemName}`, quantity: screws, unit: 'st' }, snapshot));
  });

  return result.filter(item => item.quantity > 0);
}

function mountingProducts(project, products, mounting) {
  // Do not push raw engine material rows into Products yet. Some Flow/Nordmount engine
  // outputs are design primitives and can explode into hundreds of product rows.
  return genericMountingMaterials(project, products, mounting);
}

function deduplicate(items = []) {
  const result = [];
  items.forEach(item => {
    if (!item?.product_id) return;
    const index = result.findIndex(existing => String(existing.product_id) === String(item.product_id) && String(existing.auto_source || '') === String(item.auto_source || ''));
    if (index === -1) result.push(item);
    else result[index] = { ...item, quantity: Number(result[index].quantity || 0) + Number(item.quantity || 0) };
  });
  return result;
}

export function mergeProjectAutoProducts(project = {}, products = []) {
  const rawMounting = safeJson(project.mounting_data, {}) || {};
  const mounting = mountingWithAutomaticCalculations(project, products, rawMounting);
  const manual = (Array.isArray(project.selected_products) ? project.selected_products : [])
    .filter(item => !item.auto_generated && !['panels', 'strings', 'battery-room', 'mounting', 'mounting-system'].includes(item.auto_source));
  const selected_products = deduplicate([
    ...manual,
    ...panelProducts(project, products),
    ...stringProducts(project, products),
    ...batteryRoomProducts(project, products),
    ...mountingProducts(project, products, mounting),
  ]);
  const total_cost = selected_products.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
  return { ...project, mounting_data: JSON.stringify(mounting), selected_products, total_cost };
}
