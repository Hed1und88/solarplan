const toRad = (deg) => (Number(deg) * Math.PI) / 180;
const toDeg = (rad) => (Number(rad) * 180) / Math.PI;
const clampLat = (lat) => Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
const clampLon = (lon) => Math.max(-180, Math.min(180, Number(lon) || 0));

export const OPEN_SOURCE_SOLARPLAN_STACK = {
  rendering: 'Three.js',
  interaction: 'Three.js TransformControls',
  mapTiles: 'XYZ tile schema compatible with OSM, MapLibre, OpenLayers and Leaflet',
  geocoding: 'Configurable Nominatim-compatible endpoint',
  weather: 'Configurable Open-Meteo-compatible endpoint',
  computerVision: 'Future OpenCV.js guided tracing layer',
};

export function lonLatToTile({ longitude, latitude, zoom = 19 }) {
  const z = Math.max(0, Math.min(22, Math.round(Number(zoom) || 19)));
  const lat = clampLat(latitude);
  const lon = clampLon(longitude);
  const tileCount = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  const latRad = toRad(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount);
  return { x, y, z };
}

export function tileToLonLat({ x, y, z }) {
  const tileCount = 2 ** Number(z);
  const longitude = (Number(x) / tileCount) * 360 - 180;
  const latitude = toDeg(Math.atan(Math.sinh(Math.PI * (1 - (2 * Number(y)) / tileCount))));
  return { latitude, longitude };
}

export function buildTileUrl({ tileUrlTemplate, latitude, longitude, zoom = 19 }) {
  if (!tileUrlTemplate) return '';
  const { x, y, z } = lonLatToTile({ latitude, longitude, zoom });
  return tileUrlTemplate.replaceAll('{x}', String(x)).replaceAll('{y}', String(y)).replaceAll('{z}', String(z));
}

export function createMapTextureSettings(map = {}) {
  const latitude = Number(map.latitude ?? 59.33);
  const longitude = Number(map.longitude ?? 18.06);
  const zoom = Number(map.zoom ?? 19);
  const tileUrl = buildTileUrl({ tileUrlTemplate: map.tileUrlTemplate || '', latitude, longitude, zoom });
  return {
    enabled: Boolean(tileUrl),
    latitude,
    longitude,
    zoom,
    tileUrl,
    attribution: map.attribution || '',
    satellite: Boolean(map.satellite),
  };
}
