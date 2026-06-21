import { geocodeAddress } from '@/lib/solarplan3d/dataSourceAdapters';

const BOVERKET_PORTAL = 'https://gis2.boverket.se/portal';
const CLIMATE_EXPERIENCE_ITEM_ID = 'ec290b8ec43d47e480e870bb8e1d5ded';
const SERVICE_CACHE_KEY = 'solarplan:boverket-climate-service-urls:v2';
const LAYER_CACHE_KEY = 'solarplan:boverket-climate-layers:v2';
const RESULT_CACHE_KEY = 'solarplan:project-climate-results:v2';
const REQUEST_TIMEOUT_MS = 15000;
const DISCOVERY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let serviceDiscoveryPromise = null;
let layerDiscoveryPromise = null;
const layerMetadataCache = new Map();

const toAscii = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const finiteNumber = (value, fallback = null) => {
  const parsed = Number(String(value ?? '').replace(',', '.').match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

const normalizedQueryKey = value => toAscii(value).replace(/\s+/g, '-');

function readCache(key, ttlMs) {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > ttlMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {}
}

function readResultCache(query) {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESULT_CACHE_KEY) || '{}');
    const item = parsed?.[normalizedQueryKey(query)];
    if (!item || Date.now() - Number(item.savedAt || 0) > RESULT_CACHE_TTL_MS) return null;
    return item.value || null;
  } catch {
    return null;
  }
}

function writeResultCache(query, value) {
  if (typeof window === 'undefined') return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESULT_CACHE_KEY) || '{}');
    parsed[normalizedQueryKey(query)] = { savedAt: Date.now(), value };
    const entries = Object.entries(parsed)
      .sort(([, a], [, b]) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0))
      .slice(0, 50);
    window.localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data?.error) throw new Error(data.error.message || 'ArcGIS-fel');
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

function portalRequest(path, params = {}) {
  const search = new URLSearchParams({ f: 'json', ...params });
  return fetchJson(`${BOVERKET_PORTAL}${path}?${search.toString()}`);
}

function normalizeServiceUrl(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw || !/(?:FeatureServer|MapServer)(?:\/\d+)?(?:\?.*)?$/i.test(raw)) return null;
  try {
    const absolute = new URL(raw, `${BOVERKET_PORTAL}/`).toString();
    return absolute.replace(/\?.*$/, '').replace(/\/$/, '');
  } catch {
    return null;
  }
}

function collectPortalReferences(value, references, keyHint = '') {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    const serviceUrl = normalizeServiceUrl(value);
    if (serviceUrl) references.serviceUrls.add(serviceUrl);

    const normalizedKey = toAscii(keyHint);
    if (/^[a-f0-9]{32}$/i.test(value) && /(item|portal|webmap|web map|source|data)/.test(normalizedKey)) {
      references.itemIds.add(value);
    }

    const embeddedUrls = value.match(/https?:[^"'\s]+\/(?:FeatureServer|MapServer)(?:\/\d+)?/gi) || [];
    embeddedUrls.forEach(url => {
      const normalized = normalizeServiceUrl(url.replace(/\\u002F/g, '/'));
      if (normalized) references.serviceUrls.add(normalized);
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectPortalReferences(item, references, keyHint));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => collectPortalReferences(nested, references, key));
  }
}

async function discoverClimateServiceUrlsUncached() {
  const references = { itemIds: new Set([CLIMATE_EXPERIENCE_ITEM_ID]), serviceUrls: new Set() };
  const visited = new Set();
  const queue = [{ itemId: CLIMATE_EXPERIENCE_ITEM_ID, depth: 0 }];

  while (queue.length && visited.size < 30) {
    const { itemId, depth } = queue.shift();
    if (!itemId || visited.has(itemId) || depth > 3) continue;
    visited.add(itemId);

    try {
      const [metadata, data] = await Promise.all([
        portalRequest(`/sharing/rest/content/items/${itemId}`),
        portalRequest(`/sharing/rest/content/items/${itemId}/data`),
      ]);
      collectPortalReferences(metadata, references, 'metadata');
      collectPortalReferences(data, references, 'data');
    } catch (error) {
      console.warn('Kunde inte läsa Boverkets ArcGIS-objekt:', itemId, error);
    }

    references.itemIds.forEach(nextId => {
      if (!visited.has(nextId)) queue.push({ itemId: nextId, depth: depth + 1 });
    });
  }

  const urls = Array.from(references.serviceUrls);
  if (urls.length) writeCache(SERVICE_CACHE_KEY, urls);
  return urls;
}

async function discoverClimateServiceUrls() {
  const cached = readCache(SERVICE_CACHE_KEY, DISCOVERY_CACHE_TTL_MS);
  if (Array.isArray(cached) && cached.length) return cached;
  if (!serviceDiscoveryPromise) {
    serviceDiscoveryPromise = discoverClimateServiceUrlsUncached().finally(() => {
      serviceDiscoveryPromise = null;
    });
  }
  return serviceDiscoveryPromise;
}

function climateKindFromText(value) {
  const text = toAscii(value);
  if (/(sno|snow)/.test(text)) return 'snow';
  if (/(vind|wind)/.test(text)) return 'wind';
  return null;
}

async function expandServiceLayers(serviceUrl) {
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(serviceUrl)) {
    const metadata = await fetchJson(`${serviceUrl}?f=json`);
    const name = metadata?.name || serviceUrl;
    return [{ url: serviceUrl, name, kind: climateKindFromText(name) }];
  }

  const metadata = await fetchJson(`${serviceUrl}?f=json`);
  const layers = Array.isArray(metadata?.layers) ? metadata.layers : [];
  return layers.map(layer => {
    const name = layer.name || `${metadata?.name || 'Klimatlager'} ${layer.id}`;
    return {
      url: `${serviceUrl}/${layer.id}`,
      name,
      kind: climateKindFromText(name),
    };
  });
}

async function discoverClimateLayersUncached() {
  const serviceUrls = await discoverClimateServiceUrls();
  if (!serviceUrls.length) return [];

  const groups = await Promise.all(serviceUrls.map(async serviceUrl => {
    try {
      return await expandServiceLayers(serviceUrl);
    } catch (error) {
      console.warn('Kunde inte läsa ArcGIS-tjänst:', serviceUrl, error);
      return [];
    }
  }));

  const layers = groups.flat();
  if (layers.length) writeCache(LAYER_CACHE_KEY, layers);
  return layers;
}

async function discoverClimateLayers() {
  const cached = readCache(LAYER_CACHE_KEY, DISCOVERY_CACHE_TTL_MS);
  if (Array.isArray(cached) && cached.length) return cached;
  if (!layerDiscoveryPromise) {
    layerDiscoveryPromise = discoverClimateLayersUncached().finally(() => {
      layerDiscoveryPromise = null;
    });
  }
  return layerDiscoveryPromise;
}

async function getLayerMetadata(layerUrl) {
  if (!layerMetadataCache.has(layerUrl)) {
    layerMetadataCache.set(layerUrl, fetchJson(`${layerUrl}?f=json`).catch(error => {
      layerMetadataCache.delete(layerUrl);
      throw error;
    }));
  }
  return layerMetadataCache.get(layerUrl);
}

function fieldScore({ kind, layerName, fieldName, alias, value }) {
  const label = toAscii(`${layerName} ${fieldName} ${alias}`);
  const field = toAscii(`${fieldName} ${alias}`);
  const number = finiteNumber(value, null);
  if (number === null || /(objectid|globalid|shape|created|updated|editor|fid|area|length)/.test(field)) return -Infinity;

  const snowPlausible = number >= 0.5 && number <= 10;
  const windPlausible = number >= 15 && number <= 40;
  if (kind === 'snow' && !snowPlausible) return -Infinity;
  if (kind === 'wind' && !windPlausible) return -Infinity;

  let score = 0;
  if (kind === 'snow' && /(sno|snow)/.test(label)) score += 14;
  if (kind === 'wind' && /(vind|wind)/.test(label)) score += 14;
  if (/(last|zon|zone|grund|referens|varde|value|hastighet|speed|ms|kn)/.test(label)) score += 5;
  if (climateKindFromText(layerName) === kind) score += 12;
  if (/^(value|varde|zon|zone|klass|class)$/.test(field)) score += 4;
  return score;
}

function extractValueFromFeature(kind, layer, metadata, attributes) {
  if (layer.kind && layer.kind !== kind) return null;
  const fields = Array.isArray(metadata?.fields) ? metadata.fields : [];
  const aliases = Object.fromEntries(fields.map(field => [field.name, field.alias || field.name]));
  const candidates = Object.entries(attributes || {})
    .map(([fieldName, value]) => ({
      value: finiteNumber(value, null),
      score: fieldScore({ kind, layerName: layer.name, fieldName, alias: aliases[fieldName] || '', value }),
    }))
    .filter(candidate => candidate.value !== null && Number.isFinite(candidate.score) && candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.value ?? null;
}

async function queryLayer(layer, latitude, longitude) {
  const [metadata, result] = await Promise.all([
    getLayerMetadata(layer.url),
    fetchJson(`${layer.url}/query?${new URLSearchParams({
      f: 'json',
      where: '1=1',
      geometry: `${longitude},${latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'false',
    }).toString()}`),
  ]);

  const feature = result?.features?.[0];
  if (!feature?.attributes) return null;

  return {
    layerName: layer.name || metadata?.name || '',
    snow: extractValueFromFeature('snow', layer, metadata, feature.attributes),
    wind: extractValueFromFeature('wind', layer, metadata, feature.attributes),
  };
}

async function queryBoverketClimateLoads(latitude, longitude) {
  const layers = await discoverClimateLayers();
  if (!layers.length) throw new Error('Boverkets klimatlastlager kunde inte hittas.');

  const namedClimateLayers = layers.filter(layer => layer.kind);
  const preferred = (namedClimateLayers.length ? namedClimateLayers : layers).slice(0, 20);
  const results = await Promise.all(preferred.map(async layer => {
    try {
      return await queryLayer(layer, latitude, longitude);
    } catch (error) {
      console.warn('Kunde inte fråga Boverkets klimatlastlager:', layer.url, error);
      return null;
    }
  }));

  const snowResult = results.find(result => Number.isFinite(result?.snow));
  const windResult = results.find(result => Number.isFinite(result?.wind));
  if (!snowResult || !windResult) throw new Error('Snö- eller vindlast saknades för den valda platsen.');

  return {
    snowLoadKnM2: round(snowResult.snow, 2),
    windLoadMs: round(windResult.wind, 1),
    source: `Boverkets digitala klimatlastkartor (${[snowResult.layerName, windResult.layerName].filter(Boolean).join(' / ')})`,
  };
}

export function preloadProjectClimateLookup() {
  discoverClimateLayers().catch(error => {
    console.warn('Förladdning av klimatlastdata misslyckades:', error);
  });
}

export async function resolveProjectClimateLoads(address) {
  const query = String(address || '').trim();
  if (query.length < 5) throw new Error('Ange postnummer och postort.');

  const cached = readResultCache(query);
  if (cached) return { ...cached, fromCache: true };

  const geocoding = await geocodeAddress(query);
  const latitude = finiteNumber(geocoding?.data?.latitude, null);
  const longitude = finiteNumber(geocoding?.data?.longitude, null);
  if (!geocoding?.ok || latitude === null || longitude === null) {
    throw new Error(geocoding?.message || 'Postnumret och postorten kunde inte hittas.');
  }

  const climate = await queryBoverketClimateLoads(latitude, longitude);
  const result = {
    address: geocoding.data.geocodedAddress || query,
    latitude,
    longitude,
    ...climate,
    updatedAt: new Date().toISOString(),
  };
  writeResultCache(query, result);
  return result;
}
