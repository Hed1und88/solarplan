const roundCoord = (value, digits = 6) => Number(Number(value).toFixed(digits));
const isFiniteNumber = (value) => Number.isFinite(Number(value));

export function normaliseCoordinate(value, fallback = 0) {
  return isFiniteNumber(value) ? Number(value) : fallback;
}

export function lonLatToTile({ latitude, longitude, zoom = 17 }) {
  const lat = normaliseCoordinate(latitude);
  const lon = normaliseCoordinate(longitude);
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y, z: zoom, url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png` };
}

export async function geocodeAddress(address) {
  const query = String(address || '').trim();
  if (!query) return null;

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    countrycodes: 'se',
    'accept-language': 'sv'
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Kunde inte geokoda adressen (${response.status})`);

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) return null;

  return {
    latitude: roundCoord(first.lat),
    longitude: roundCoord(first.lon),
    displayName: first.display_name,
    boundingBox: first.boundingbox || null,
    source: 'OpenStreetMap Nominatim'
  };
}

export async function fetchElevationData({ latitude, longitude }) {
  const lat = roundCoord(latitude);
  const lon = roundCoord(longitude);
  const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!response.ok) throw new Error(`Kunde inte hämta höjddata (${response.status})`);

  const json = await response.json();
  const elevation = Array.isArray(json.elevation) ? json.elevation[0] : json.elevation;
  if (!isFiniteNumber(elevation)) return null;

  return {
    elevation: Number(elevation),
    source: 'Open-Meteo elevation 90 m DEM'
  };
}

function valueFromLegacyParameters(entry, names) {
  const parameters = Array.isArray(entry?.parameters) ? entry.parameters : [];
  const parameter = parameters.find((item) => names.includes(item.name));
  const value = Array.isArray(parameter?.values) ? parameter.values[0] : parameter?.value;
  return isFiniteNumber(value) && Number(value) !== 9999 ? Number(value) : null;
}

function valueFromSnowData(entry, names) {
  const data = entry?.data || {};
  for (const name of names) {
    const value = data[name];
    if (isFiniteNumber(value) && Number(value) !== 9999) return Number(value);
  }
  return null;
}

function normaliseCloudCover(value) {
  if (!isFiniteNumber(value)) return null;
  const number = Number(value);
  if (number <= 8) return Math.max(0, Math.min(100, number * 12.5));
  return Math.max(0, Math.min(100, number));
}

function normaliseForecastEntry(entry, mode = 'snow1g') {
  const time = entry?.time || entry?.validTime;
  if (!time) return null;

  const read = mode === 'legacy' ? valueFromLegacyParameters : valueFromSnowData;
  const temperature = read(entry, ['air_temperature', 't']);
  const cloudCoverRaw = read(entry, ['total_cloud_cover', 'cloud_area_fraction', 'tcc_mean', 'tcc']);
  const precipitation = read(entry, ['precipitation_amount_mean', 'precipitation_amount_median', 'pmean', 'pmedian', 'pmin', 'pmax']);
  const windSpeed = read(entry, ['wind_speed', 'ws']);
  const symbolCode = read(entry, ['symbol_code', 'Wsymb2']);

  return {
    time,
    temperature,
    cloudCover: normaliseCloudCover(cloudCoverRaw),
    precipitation: isFiniteNumber(precipitation) ? Number(precipitation) : 0,
    windSpeed,
    symbolCode
  };
}

export async function fetchSmhiForecast({ latitude, longitude }) {
  const lat = roundCoord(latitude);
  const lon = roundCoord(longitude);
  const snowUrl = `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`;
  const legacyUrl = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`;

  let response = await fetch(snowUrl);
  let source = 'SMHI SNOW1gv1';
  let mode = 'snow1g';

  if (!response.ok) {
    response = await fetch(legacyUrl);
    source = 'SMHI PMP3gv2 fallback';
    mode = 'legacy';
  }

  if (!response.ok) throw new Error(`Kunde inte hämta SMHI-prognos (${response.status})`);

  const json = await response.json();
  const forecast = (json.timeSeries || [])
    .map((entry) => normaliseForecastEntry(entry, mode))
    .filter(Boolean);

  return {
    source,
    referenceTime: json.referenceTime || json.approvedTime || null,
    geometry: json.geometry || null,
    forecast
  };
}

export function findNearestForecast(forecast, { date, hour }) {
  if (!Array.isArray(forecast) || forecast.length === 0) return null;
  const target = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  if (Number.isNaN(target.getTime())) return forecast[0];

  return forecast.reduce((nearest, item) => {
    const currentDiff = Math.abs(new Date(item.time).getTime() - target.getTime());
    const nearestDiff = Math.abs(new Date(nearest.time).getTime() - target.getTime());
    return currentDiff < nearestDiff ? item : nearest;
  }, forecast[0]);
}

export function applyForecastToModel(model, forecastPoint) {
  if (!forecastPoint) return model;
  return {
    ...model,
    temperature: isFiniteNumber(forecastPoint.temperature) ? Number(forecastPoint.temperature.toFixed(1)) : model.temperature,
    cloudCover: isFiniteNumber(forecastPoint.cloudCover) ? Number(forecastPoint.cloudCover.toFixed(0)) : model.cloudCover,
    precipitation: isFiniteNumber(forecastPoint.precipitation) ? Number(forecastPoint.precipitation.toFixed(1)) : model.precipitation
  };
}

export async function fetchSolarPlanSiteData({ address, latitude, longitude, date, hour }) {
  const geocoded = address ? await geocodeAddress(address) : null;
  const resolvedLatitude = geocoded?.latitude ?? normaliseCoordinate(latitude, 59.3793);
  const resolvedLongitude = geocoded?.longitude ?? normaliseCoordinate(longitude, 13.5036);

  const [elevation, smhi] = await Promise.allSettled([
    fetchElevationData({ latitude: resolvedLatitude, longitude: resolvedLongitude }),
    fetchSmhiForecast({ latitude: resolvedLatitude, longitude: resolvedLongitude })
  ]);

  const smhiData = smhi.status === 'fulfilled' ? smhi.value : null;
  const nearestForecast = findNearestForecast(smhiData?.forecast, { date, hour });

  return {
    latitude: resolvedLatitude,
    longitude: resolvedLongitude,
    geocoded,
    tile: lonLatToTile({ latitude: resolvedLatitude, longitude: resolvedLongitude, zoom: 17 }),
    elevation: elevation.status === 'fulfilled' ? elevation.value : null,
    smhi: smhiData,
    nearestForecast,
    errors: {
      elevation: elevation.status === 'rejected' ? elevation.reason?.message : null,
      smhi: smhi.status === 'rejected' ? smhi.reason?.message : null
    }
  };
}
