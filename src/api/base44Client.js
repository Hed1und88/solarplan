import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';
const PRODUCT_SAFE_FIELDS = new Set([
  'name',
  'category',
  'brand',
  'model',
  'price',
  'unit',
  'description',
  'image_url',
  'power_watts',
  'capacity_kwh',
  'width_mm',
  'height_mm',
  'weight_kg',
  'voc_v',
  'isc_a',
  'vmp_v',
  'imp_a',
  'bifacial',
  'battery_supported',
  'is_active',
]);

function withFileUrl(result) {
  if (typeof result === 'string') return { file_url: result, url: result };

  const fileUrl =
    result?.file_url ||
    result?.url ||
    result?.fileUrl ||
    result?.download_url ||
    result?.downloadUrl ||
    result?.public_url ||
    result?.publicUrl ||
    result?.storage_url ||
    result?.storageUrl ||
    result?.attachment_url ||
    result?.attachmentUrl ||
    result?.path ||
    result?.storage_path ||
    result?.data?.file_url ||
    result?.data?.url ||
    result?.file?.file_url ||
    result?.file?.url ||
    '';

  return fileUrl ? { ...result, file_url: fileUrl, url: result?.url || fileUrl } : result;
}

function normalizeProductDocuments(documents = []) {
  return Array.isArray(documents)
    ? documents
        .map((document, index) => {
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
        })
        .filter(document => document.file_url)
    : [];
}

function documentsFromDescription(description = '') {
  const text = String(description || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const meta = JSON.parse(text.slice(start + META_START.length, end).trim()) || {};
    return normalizeProductDocuments(meta.documents || []);
  } catch {
    return [];
  }
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
  return {
    ...payload,
    documents_snapshot: documents,
    documents,
    product_documents: documents,
  };
}

function safeProductPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => PRODUCT_SAFE_FIELDS.has(key) && value !== undefined),
  );
}

async function saveProductWithFallback(method, target, args) {
  const isCreate = method === 'create';
  const originalPayload = isCreate ? args[0] : args[1];
  const enhanced = enhancedProductPayload(originalPayload);
  const invoke = payload => isCreate
    ? target.create(payload)
    : target.update(args[0], payload);

  try {
    return await invoke(enhanced);
  } catch (enhancedError) {
    if (enhanced !== originalPayload) {
      try {
        return await invoke(originalPayload);
      } catch {}
    }

    const fallback = safeProductPayload(originalPayload);
    if (!fallback.name && isCreate) throw enhancedError;
    try {
      return await invoke(fallback);
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
