import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

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
    return property === 'integrations' ? wrapIntegrations(value) : value;
  },
});
