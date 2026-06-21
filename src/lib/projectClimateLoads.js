import { geocodeAddress } from '@/lib/solarplan3d/dataSourceAdapters';

const BOVERKET_PORTAL = 'https://gis2.boverket.se/portal';
const CLIMATE_EXPERIENCE_ITEM_ID = 'ec290b8ec43d47e480e870bb8e1d5ded';
const SERVICE_CACHE_KEY = 'solarplan:boverket-climate-service-urls:v1';
const REQUEST_TIMEOUT_MS = 20000;

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
  const raw = String(value || '').trim();
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

function readCachedServiceUrls() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SERVICE_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.urls)) return [];
    if (Date.now() - Number(parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) return [];
    return parsed.urls.filter(Boolean);
  } catch {
    return [];
  }
}

function cacheServiceUrls(urls) {
  if (typeof window === 'undefined' || !urls.length) return;
  try {
    window.localStorage.setItem(SERVICE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), urls }));
  } catch {}
}

async function discoverClimateServiceUrls() {
  const cached = readCachedServiceUrls();
  if (cached.length) return cached;

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
  cacheServiceUrls(urls);
  return urls;
}

function climateKindFromText(value) {
  const text = toAscii(value);
  if (/\b(sno|snow|snolast|snozon)\b/.test(text)) return 'snow';
  if (/\b(vind|wind|vindlast|referensvind)\b/.test(text)) return 'wind';
  return null;
}

async function expandServiceLayers(serviceUrl) {
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(serviceUrl)) return [{ url: serviceUrl, name: serviceUrl }];

  const metadata = await fetchJson(`${serviceUrl}?f=json`);
  const layers = Array.isArray(metadata?.layers) ? metadata.layers : [];
  return layers.map(layer => ({
    url: `${serviceUrl}/${layer.id}`,
    name: layer.name || `${metadata?.name || 'Klimatlager'} ${layer.id}`,
  }));
}

function fieldScore({ kind, layerName, fieldName, alias, value }) {
  const label = toAscii(`${layerName} ${fieldName} ${alias}`);
  const field = toAscii(`${fieldName} ${alias}`);
  const number = finiteNumber(value, null);
  if (number === null || /(objectid|globalid|shape|created|updated|editor|fid)/.test(field)) return -Infinity;

  const snowPlausible = number >= 0.5 && number <= 10;
  const windPlausible = number >= 15 && number <= 40;
  if (kind === 'snow' && !snowPlausible) return -Infinity;
  if (kind === 'wind' && !windPlausible) return -Infinity;

  let score = 0;
  if (kind === 'snow' && /(sno|snow)/.test(label)) score += 12;
  if (kind === 'wind' && /(vind|wind)/.test(label)) score += 12;
  if (/(last|zon|zone|grund|referens|varde|value|ms|kn)/.test(label)) score += 4;
  if (climateKindFromText(layerName) === kind) score += 10;
  if (/^(value|varde|zon|zone|klass|class)$/.test(field)) score += 4;
  if (Number.isInteger(number) && number > 100) score -= 20;
  return score;
}

function extractValueFromFeature(kind, layerName, metadata, attributes) {
  const fields = Array.isArray(metadata?.fields) ? metadata.fields : [];
  const aliases = Object.fromEntries(fields.map(field => [field.name, field.alias || field.name]));
  const candidates = Object.entries(attributes || {})
    .map(([fieldName, value]) => ({
      value: finiteNumber(value, null),
      score: fieldScore({ kind, layerName, fieldName, alias: aliases[fieldName] || '', value }),
      fieldName,
    }))
    .filter(candidate => candidate.value !== null && Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.score > 0 ? candidates[0] : null;
}

async function queryLayer(layer, latitude, longitude) {
  const metadata = await fetchJson(`${layer.url}?f=json`);
  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
  });
  const result = await fetchJson(`${layer.url}/query?${params.toString()}`);
  const feature = result?.features?.[0];
  if (!feature?.attributes) return null;

  return {
    layerName: layer.name || metadata?.name || '',
    snow: extractValueFromFeature('snow', layer.name || metadata?.name || '', metadata, feature.attributes),
    wind: extractValueFromFeature('wind', layer.name || metadata?.name || '', metadata, feature.attributes),
  };
}

async function queryBoverketClimateLoads(latitude, longitude) {
  const serviceUrls = await discoverClimateServiceUrls();
  if (!serviceUrls.length) throw new Error('Boverkets klimatlastlager kunde inte hittas.');

  const layers = [];
  for (const serviceUrl of serviceUrls) {
    try {
      const expanded = await expandServiceLayers(serviceUrl);
      layers.push(...expanded);
    } catch (error) {
      console.warn('Kunde inte läsa ArcGIS-tjänst:', serviceUrl, error);
    }
  }

  const preferred = layers
    .map(layer => ({ ...layer, kind: climateKindFromText(layer.name) }))
    .sort((a, b) => Number(Boolean(b.kind)) - Number(Boolean(a.kind)))
    .slice(0, 40);

  let snow = null;
  let wind = null;
  let snowLayer = '';
  let windLayer = '';

  for (const layer of preferred) {
    if (snow && wind) break;
    try {
      const result = await queryLayer(layer, latitude, longitude);
      if (!snow && result?.snow) {
        snow = result.snow.value;
        snowLayer = result.layerName;
      }
      if (!wind && result?.wind) {
        wind = result.wind.value;
        windLayer = result.layerName;
      }
    } catch (error) {
      console.warn('Kunde inte fråga Boverkets klimatlastlager:', layer.url, error);
    }
  }

  if (!Number.isFinite(snow) || !Number.isFinite(wind)) {
    throw new Error('Snö- eller vindlast saknades för den valda platsen.');
  }

  return {
    snowLoadKnM2: round(snow, 2),
    windLoadMs: round(wind, 1),
    source: `Boverkets digitala klimatlastkartor${snowLayer || windLayer ? ` (${[snowLayer, windLayer].filter(Boolean).join(' / ')})` : ''}`,
  };
}

export async function resolveProjectClimateLoads(address) {
  const query = String(address || '').trim();
  if (query.length < 5) throw new Error('Ange en fullständig adress.');

  const geocoding = await geocodeAddress(query);
  const latitude = finiteNumber(geocoding?.data?.latitude, null);
  const longitude = finiteNumber(geocoding?.data?.longitude, null);
  if (!geocoding?.ok || latitude === null || longitude === null) {
    throw new Error(geocoding?.message || 'Adressen kunde inte hittas.');
  }

  const climate = await queryBoverketClimateLoads(latitude, longitude);
  return {
    address: geocoding.data.geocodedAddress || query,
    latitude,
    longitude,
    ...climate,
    updatedAt: new Date().toISOString(),
  };
}
