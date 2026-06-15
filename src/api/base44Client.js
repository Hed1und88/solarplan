import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const META_START = '\n\n---SOLARPLAN_PRODUCT_META_START---\n';
const META_END = '\n---SOLARPLAN_PRODUCT_META_END---';

function withFileUrl(result) {
  if (typeof result === 'string') return { file_url: result, url: result };

  const fileUrl =
    result?.file_url ||
    result?.url ||
    result?.fileUrl ||
    result?.download_url ||
    result?.public_url ||
    result?.storage_url ||
    result?.attachment_url ||
    result?.data?.file_url ||
    result?.data?.url ||
    result?.file?.file_url ||
    result?.file?.url ||
    '';

  return fileUrl ? { ...result, file_url: fileUrl, url: result?.url || fileUrl } : result;
}

function docsFromDescription(description = '') {
  const text = String(description || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const meta = JSON.parse(text.slice(start + META_START.length, end).trim()) || {};
    return Array.isArray(meta.documents) ? meta.documents.filter(doc => doc?.file_url || doc?.url) : [];
  } catch {
    return [];
  }
}

function compactDocument(doc = {}) {
  return {
    type: doc.type || doc.document_type || 'other',
    name: String(doc.name || doc.title || doc.file_name || 'Dokument').slice(0, 40),
    file_url: doc.file_url || doc.url || '',
  };
}

function compactProductDescription(description = '', category = '') {
  const text = String(description || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start === -1 || end === -1 || end <= start) return text;

  const cleanDescription = text.slice(0, start).trim() || 'Produktdokument';
  const rawMeta = text.slice(start + META_START.length, end).trim();

  try {
    const meta = JSON.parse(rawMeta) || {};
    const documents = Array.isArray(meta.documents)
      ? meta.documents.filter(doc => doc?.file_url || doc?.url).map(compactDocument)
      : [];

    if (String(category || '').toLowerCase() === 'montagesystem') {
      return `Produktdokument${META_START}${JSON.stringify({ documents })}${META_END}`;
    }

    const compactMeta = { ...meta, documents, updatedAt: new Date().toISOString() };
    delete compactMeta.name;
    delete compactMeta.brand;
    delete compactMeta.model;
    delete compactMeta.category;
    delete compactMeta.price;

    return `${cleanDescription.slice(0, 80)}${META_START}${JSON.stringify(compactMeta)}${META_END}`;
  } catch {
    return text;
  }
}

function withProductDocumentsPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const compactDescription = compactProductDescription(payload.description, payload.category);
  const docs = Array.isArray(payload.documents_snapshot) && payload.documents_snapshot.length
    ? payload.documents_snapshot.map(compactDocument)
    : docsFromDescription(compactDescription).map(compactDocument);
  if (!docs.length) return { ...payload, description: compactDescription };
  return {
    ...payload,
    description: compactDescription,
    documents_snapshot: docs,
    documents: docs,
    product_documents: docs,
  };
}

function wrapProductEntity(productEntity) {
  if (!productEntity || typeof productEntity !== 'object') return productEntity;

  return new Proxy(productEntity, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if ((property !== 'create' && property !== 'update') || typeof value !== 'function') return value;

      return async (...args) => {
        if (property === 'create') return value.call(target, withProductDocumentsPayload(args[0]));
        if (property === 'update') return value.call(target, args[0], withProductDocumentsPayload(args[1]));
        return value.apply(target, args);
      };
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
