import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';
const PENDING_MOUNTING_META_KEY = 'solarplan:pending-mounting-product-meta';
const PRODUCT_SAFE_FIELDS = new Set([
  'name', 'category', 'brand', 'model', 'price', 'unit', 'description', 'image_url', 'power_watts',
  'capacity_kwh', 'width_mm', 'height_mm', 'weight_kg', 'voc_v', 'isc_a', 'vmp_v', 'imp_a',
  'bifacial', 'battery_supported', 'is_active',
]);

function withFileUrl(result) {
  if (typeof result === 'string') return { file_url: result, url: result };
  const fileUrl = result?.file_url || result?.url || result?.fileUrl || result?.download_url ||
    result?.downloadUrl || result?.public_url || result?.publicUrl || result?.storage_url ||
    result?.storageUrl || result?.attachment_url || result?.attachmentUrl || result?.path ||
    result?.storage_path || result?.data?.file_url || result?.data?.url || result?.file?.file_url ||
    result?.file?.url || '';
  return fileUrl ? { ...result, file_url: fileUrl, url: result?.url || fileUrl } : result;
}

function splitDescription(description = '') {
  const text = String(description || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start === -1 || end === -1 || end <= start) return { clean: text.trim(), meta: {} };
  try {
    return { clean: text.slice(0, start).trim(), meta: JSON.parse(text.slice(start + META_START.length, end).trim()) || {} };
  } catch {
    return { clean: text.slice(0, start).trim(), meta: {} };
  }
}

function buildDescription(clean = '', meta = {}) {
  return `${String(clean || '').trim()}${META_START}${JSON.stringify(meta || {})}${META_END}`.trim();
}

function readPendingMountingMeta() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PENDING_MOUNTING_META_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      mounting_item_type: parsed.mounting_item_type === 'accessory' ? 'accessory' : 'mounting',
      mounting_system_name: String(parsed.mounting_system_name || '').trim(),
    };
  } catch {
    return null;
  }
}

function applyPendingMountingMeta(payload) {
  if (!payload || typeof payload !== 'object' || payload.category !== 'montagesystem') return payload;
  const pending = readPendingMountingMeta();
  if (!pending) return payload;
  const { clean, meta } = splitDescription(payload.description || '');
  return {
    ...payload,
    description: buildDescription(clean, {
      ...meta,
      mounting_item_type: pending.mounting_item_type,
      mounting_system_name: pending.mounting_system_name || payload.brand || meta.mounting_system_name || '',
    }),
  };
}

function clearPendingMountingMeta(payload) {
  if (typeof window === 'undefined' || payload?.category !== 'montagesystem') return;
  try { window.sessionStorage.removeItem(PENDING_MOUNTING_META_KEY); } catch {}
}

function normalizeProductDocuments(documents = []) {
  return Array.isArray(documents)
    ? documents.map((document, index) => {
        const fileUrl = document?.file_url || document?.url || '';
        const type = document?.type || document?.document_type || 'other';
        const name = document?.name || document?.title || document?.file_name || `Dokument ${index + 1}`;
        return {
          ...document,
          id: document?.id || `${Date.now()}-${type}-${index}`,
          type,
          document_type: type,
          name,
          title: document?.title || name,
          file_name: document?.file_name || name,
          file_url: fileUrl,
          url: fileUrl,
        };
      }).filter(document => document.file_url)
    : [];
}

function documentsFromDescription(description = '') {
  const { meta } = splitDescription(description);
  return normalizeProductDocuments(meta.documents || []);
}

function productDocumentsFromPayload(payload = {}) {
  return normalizeProductDocuments([
    ...(Array.isArray(payload.documents_snapshot) ? payload.documents_snapshot : []),
    ...(Array.isArray(payload.documents) ? payload.documents : []),
    ...(Array.isArray(payload.product_documents) ? payload.product_documents : []),
    ...documentsFromDescription(payload.description),
  ]).filter((document, index, list) => {
    const key = `${document.type}|${document.file_url}|${document.name}`.toLowerCase();
    return list.findIndex(candidate => `${candidate.type}|${candidate.file_url}|${candidate.name}`.toLowerCase() === key) === index;
  });
}

function enhancedProductPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const documents = productDocumentsFromPayload(payload);
  if (!documents.length) return payload;
  return { ...payload, documents_snapshot: documents, documents, product_documents: documents };
}

function safeProductPayload(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => PRODUCT_SAFE_FIELDS.has(key) && value !== undefined));
}

async function saveProductWithFallback(method, target, args) {
  const isCreate = method === 'create';
  const rawPayload = isCreate ? args[0] : args[1];
  const originalPayload = applyPendingMountingMeta(rawPayload);
  const enhanced = enhancedProductPayload(originalPayload);
  const invoke = payload => isCreate ? target.create(payload) : target.update(args[0], payload);

  try {
    const result = await invoke(enhanced);
    clearPendingMountingMeta(originalPayload);
    return result;
  } catch (enhancedError) {
    if (enhanced !== originalPayload) {
      try {
        const result = await invoke(originalPayload);
        clearPendingMountingMeta(originalPayload);
        return result;
      } catch {}
    }
    const fallback = safeProductPayload(originalPayload);
    if (!fallback.name && isCreate) throw enhancedError;
    try {
      const result = await invoke(fallback);
      clearPendingMountingMeta(originalPayload);
      return result;
    } catch (fallbackError) {
      fallbackError.cause = fallbackError.cause || enhancedError;
      throw fallbackError;
    }
  }
}

function wrapProductEntity(productEntity) {
  if (!productEntity || typeof productEntity !== 'object') return productEntity;
  return new Proxy(productEntity, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (!['create', 'update'].includes(property) || typeof value !== 'function') return value;
      return (...args) => saveProductWithFallback(property, target, args);
    },
  });
}

function wrapEntities(entities) {
  if (!entities || typeof entities !== 'object') return entities;
  return new Proxy(entities, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return property === 'Product' ? wrapProductEntity(value) : value;
    },
  });
}

function wrapCore(core) {
  if (!core || typeof core !== 'object') return core;
  return new Proxy(core, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'UploadFile' || typeof value !== 'function') return value;
      return async (...args) => withFileUrl(await value.apply(target, args));
    },
  });
}

function wrapIntegrations(integrations) {
  if (!integrations || typeof integrations !== 'object') return integrations;
  return new Proxy(integrations, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return property === 'Core' ? wrapCore(value) : value;
    },
  });
}

const client = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
});

export const base44 = new Proxy(client, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (property === 'integrations') return wrapIntegrations(value);
    if (property === 'entities') return wrapEntities(value);
    return value;
  },
});
