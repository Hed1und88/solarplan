import { productMeta } from '@/lib/productDocuments';

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function normalizeId(value) {
  return value === null || value === undefined ? '' : String(value);
}

function mergeMeta(product) {
  if (!product) return null;
  return { ...productMeta(product), ...product };
}

function findById(products, id) {
  const key = normalizeId(id);
  if (!key) return null;
  return products.find(product => normalizeId(product?.id || product?.product_id) === key) || null;
}

function ensureExactProduct(products, source, exactId) {
  if (!source) return products;
  const id = exactId || source.id || source.product_id;
  if (id === null || id === undefined || id === '') return products;
  if (products.some(product => product.id === id)) return products;
  return [...products, { ...mergeMeta(source), id }];
}

function buildPanelMap(project, products) {
  const planner = safeJson(project?.solar_roof_planner_data || project?.panel_layout_data, {});
  const panelMap = new Map();

  (planner?.roofs || []).forEach((roof, roofIndex) => {
    const roofId = roof.id ?? roofIndex;
    const productId = roof.panelProductId || roof.panelProductSnapshot?.product_id || roof.panelProductSnapshot?.id;
    const product = mergeMeta(findById(products, productId) || roof.panelProductSnapshot || null);

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupId = group.id ?? groupIndex;
      const rows = Math.max(0, Math.round(Number(group.rows) || 0));
      const cols = Math.max(0, Math.round(Number(group.cols) || 0));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          panelMap.set(`${roofId}-${groupId}-${row}-${col}`, {
            productId,
            productSnapshot: product,
            panelGroupId: groupId,
            roofId,
          });
        }
      }
    });
  });

  return panelMap;
}

export function normalizeStringProductContext(project = {}, sourceProducts = []) {
  let products = (sourceProducts || []).map(mergeMeta).filter(Boolean);
  const data = safeJson(project?.string_layout_data, {});
  const panelMap = buildPanelMap(project, products);

  const configsSource = Array.isArray(data.inverterConfigs) && data.inverterConfigs.length
    ? data.inverterConfigs
    : [{
        id: 'default-inverter',
        name: 'Växelriktare 1',
        productId: data.inverterProductId || data.inverterProductSnapshot?.id || data.inverterProductSnapshot?.product_id || '',
        productSnapshot: data.inverterProductSnapshot || null,
      }];

  const inverterConfigs = configsSource.map((config, index) => {
    const requestedId = config.productId || config.product_id || config.productSnapshot?.id || config.productSnapshot?.product_id || (index === 0 ? data.inverterProductId : '');
    const source = mergeMeta(findById(products, requestedId) || config.productSnapshot || (index === 0 ? data.inverterProductSnapshot : null));
    const exactId = requestedId || source?.id || source?.product_id || '';
    products = ensureExactProduct(products, source, exactId);
    return {
      ...config,
      id: config.id || `inverter-${index + 1}`,
      name: config.name || source?.name || `Växelriktare ${index + 1}`,
      productId: exactId,
      productSnapshot: source || config.productSnapshot || null,
    };
  });

  const strings = (Array.isArray(data.strings) ? data.strings : []).map(item => {
    const panelNode = (item.nodes || []).find(node => panelMap.has(node?.panelId));
    const mapped = panelNode ? panelMap.get(panelNode.panelId) : null;
    const requestedId = item.panelProductId || item.panel_product_id || item.panelProductSnapshot?.id || item.panelProductSnapshot?.product_id || mapped?.productId || '';
    const source = mergeMeta(findById(products, requestedId) || item.panelProductSnapshot || mapped?.productSnapshot || null);
    const exactId = requestedId || source?.id || source?.product_id || '';
    products = ensureExactProduct(products, source, exactId);
    return {
      ...item,
      panelProductId: exactId,
      panelProductSnapshot: source || item.panelProductSnapshot || mapped?.productSnapshot || null,
      panelGroupId: item.panelGroupId || mapped?.panelGroupId || '',
      roofId: item.roofId || mapped?.roofId || '',
    };
  });

  const firstPanelString = strings.find(item => item.panelProductId || item.panelProductSnapshot);
  const panelProductId = data.panelProductId || firstPanelString?.panelProductId || '';
  const firstConfig = inverterConfigs[0];

  const normalizedData = {
    ...data,
    inverterConfigs,
    inverterProductId: firstConfig?.productId || data.inverterProductId || '',
    inverterProductSnapshot: firstConfig?.productSnapshot || data.inverterProductSnapshot || null,
    panelProductId,
    panelProductSnapshot: firstPanelString?.panelProductSnapshot || data.panelProductSnapshot || null,
    strings,
  };

  return {
    products,
    data: normalizedData,
    project: { ...project, string_layout_data: JSON.stringify(normalizedData) },
  };
}

export function resolveContextProduct(products = [], id, snapshot = null) {
  return mergeMeta(findById(products, id) || snapshot || null);
}
