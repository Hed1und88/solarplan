const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';
const LAST_MESSAGE_KEY = 'solarplan:solarplan-3d-projektering:last-location-message';

const safeNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 2) => {
  const number = safeNumber(value, 0);
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const statusRow = (label, status = 'manual', message = 'Manuell / Ej ansluten') => ({
  label,
  status,
  mode: status === 'connected' ? 'automatic' : 'manual',
  connected: status === 'connected',
  statusText: message,
  message,
});

const result = (ok, source, data = null, message = '', status = ok ? 'connected' : 'error') => ({
  ok,
  source,
  mode: ok ? 'automatic' : 'manual',
  connected: ok,
  status,
  message,
  data,
});

const canUseBrowserStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readStoredProject = () => {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.project || parsed;
  } catch (error) {
    console.warn('Could not read stored SolarPlan 3D project', error);
    return null;
  }
};

const writeStoredProject = (project) => {
  if (!canUseBrowserStorage() || !project) return;
  const updated = { ...project, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, project: updated }));
};

const readAddressFromVisibleForm = () => {
  if (typeof document === 'undefined') return '';
  const inputs = Array.from(document.querySelectorAll('input'));
  const candidate = inputs
    .map((input) => String(input.value || '').trim())
    .find((value) => /\d/.test(value) && /[a-zåäö]/i.test(value) && !value.toLowerCase().includes('nytt 3d-projekt'));
  return candidate || '';
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const normalizeCompassToOpenMeteoAzimuth = (azimuthDeg = 180) => {
  const compass = ((safeNumber(azimuthDeg, 180) % 360) + 360) % 360;
  let openMeteo = compass - 180;
  if (openMeteo > 180) openMeteo -= 360;
  if (openMeteo < -180) openMeteo += 360;
  return round(openMeteo, 0);
};

export const createDefaultLocationData = (overrides = {}) => ({
  status: overrides.status || 'idle',
  message: overrides.message || 'Platsdata är inte hämtad ännu.',
  latitude: safeNumber(overrides.latitude, null),
  longitude: safeNumber(overrides.longitude, null),
  geocodedAddress: overrides.geocodedAddress || '',
  sources: {
    geocoding: { status: 'manual', message: 'Manuell / Ej ansluten', ...(overrides.sources?.geocoding || {}) },
    map: { status: 'manual', message: 'Manuell / Ej ansluten', ...(overrides.sources?.map || {}) },
    elevation: { status: 'manual', message: 'Ej ansluten', ...(overrides.sources?.elevation || {}) },
    solarIrradiance: { status: 'manual', message: 'Manuell / Ej ansluten', ...(overrides.sources?.solarIrradiance || {}) },
    weather: { status: 'manual', message: 'Manuell / Ej ansluten', ...(overrides.sources?.weather || {}) },
    climateLoad: { status: 'manual', message: 'Manuell kontroll krävs', ...(overrides.sources?.climateLoad || {}) },
  },
  pvgis: {
    annualKwhPerKwp: safeNumber(overrides.pvgis?.annualKwhPerKwp, null),
    monthlyKwhPerKwp: Array.isArray(overrides.pvgis?.monthlyKwhPerKwp) ? overrides.pvgis.monthlyKwhPerKwp : [],
    raw: overrides.pvgis?.raw || null,
  },
  smhi: {
    temperatureC: safeNumber(overrides.smhi?.temperatureC, null),
    cloudCoverPercent: safeNumber(overrides.smhi?.cloudCoverPercent, null),
    precipitation: safeNumber(overrides.smhi?.precipitation, null),
    raw: overrides.smhi?.raw || null,
  },
  forecast: overrides.forecast || null,
  climateLoad: {
    snowLoadZone: overrides.climateLoad?.snowLoadZone || '',
    windLoadZone: overrides.climateLoad?.windLoadZone || '',
    designMinTempC: safeNumber(overrides.climateLoad?.designMinTempC, null),
    designMaxTempC: safeNumber(overrides.climateLoad?.designMaxTempC, null),
  },
});

export const manualStatus = (label) => statusRow(label);

const addressSearchTerms = (address = '') => {
  const normalized = String(address || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const terms = [];
  if (normalized) terms.push(normalized);

  const postalMatch = normalized.match(/(\d{3}\s?\d{2})\s+([A-Za-zÅÄÖåäö\-]+)/);
  if (postalMatch) {
    terms.push(`${postalMatch[1]} ${postalMatch[2]}`);
    terms.push(postalMatch[2]);
  }

  const words = normalized.split(' ').filter(Boolean);
  const lastWord = words[words.length - 1];
  if (lastWord && /[a-zåäö]/i.test(lastWord)) terms.push(lastWord);

  return Array.from(new Set(terms.filter((term) => term.length >= 2)));
};

export const geocodeAddress = async (address) => {
  const terms = addressSearchTerms(address);
  if (terms.length === 0) return result(false, 'open-meteo-geocoding', null, 'Ange adress innan du hämtar platsdata.');

  for (const term of terms) {
    try {
      const params = new URLSearchParams({
        name: term,
        count: '5',
        language: 'sv',
        format: 'json',
        countryCode: 'SE',
      });
      const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, { timeoutMs: 12000 });
      const first = Array.isArray(data?.results) ? data.results[0] : null;
      const latitude = safeNumber(first?.latitude, null);
      const longitude = safeNumber(first?.longitude, null);
      if (latitude !== null && longitude !== null) {
        const parts = [first.name, first.admin2, first.admin1, first.country_code].filter(Boolean);
        return result(true, 'open-meteo-geocoding', {
          latitude,
          longitude,
          geocodedAddress: parts.join(', '),
          elevationM: safeNumber(first.elevation, null),
          timezone: first.timezone || 'Europe/Stockholm',
          raw: first,
        }, `Adress/geokodning ansluten via Open-Meteo: ${parts.join(', ')}`);
      }
    } catch (error) {
      console.warn('Open-Meteo geocoding failed for term:', term, error);
    }
  }

  return result(false, 'open-meteo-geocoding', null, 'Adress kunde inte geokodas via Open-Meteo. Ange ort/postnummer tydligare eller manuella koordinater senare.');
};

const monthlyFromHourlyGti = (times = [], values = [], performanceRatio = 0.85) => {
  const monthly = Array.from({ length: 12 }, () => 0);
  values.forEach((value, index) => {
    const irradianceWm2 = safeNumber(value, null);
    if (irradianceWm2 === null) return;
    const date = new Date(times[index]);
    const month = Number.isFinite(date.getMonth()) ? date.getMonth() : 0;
    monthly[month] += (irradianceWm2 / 1000) * performanceRatio;
  });
  return monthly.map((value) => round(value, 1));
};

const fallbackSpecificYield = ({ latitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, 59);
  const pitch = safeNumber(roofPitchDeg, 30);
  const azimuth = ((safeNumber(azimuthDeg, 180) % 360) + 360) % 360;
  const latitudeFactor = Math.max(0.78, Math.min(1.06, 1 - ((lat - 55) * 0.025)));
  const pitchFactor = Math.max(0.86, 1 - (Math.abs(pitch - 35) * 0.006));
  const southDeviation = Math.min(Math.abs(azimuth - 180), 360 - Math.abs(azimuth - 180));
  const azimuthFactor = Math.max(0.72, 1 - (southDeviation * 0.0017));
  return Math.max(650, Math.min(1050, round(980 * latitudeFactor * pitchFactor * azimuthFactor, 0)));
};

const monthlyDistribution = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03];

export const fetchPVGISData = async ({ latitude, longitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, null);
  const lon = safeNumber(longitude, null);
  if (lat === null || lon === null) return result(false, 'open-meteo-archive', null, 'Soldata kräver latitud och longitud.');

  const endDate = addDays(new Date(), -7);
  const startDate = addDays(endDate, -364);
  const tilt = Math.max(0, Math.min(90, safeNumber(roofPitchDeg, 30)));
  const azimuth = normalizeCompassToOpenMeteoAzimuth(azimuthDeg);
  const performanceRatio = 0.85;

  try {
    const params = new URLSearchParams({
      latitude: String(round(lat, 6)),
      longitude: String(round(lon, 6)),
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      hourly: 'global_tilted_irradiance',
      tilt: String(tilt),
      azimuth: String(azimuth),
      timezone: 'Europe/Stockholm',
    });
    const data = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`, { timeoutMs: 30000 });
    const times = data?.hourly?.time || [];
    const values = data?.hourly?.global_tilted_irradiance || [];
    const monthlyKwhPerKwp = monthlyFromHourlyGti(times, values, performanceRatio);
    const annualKwhPerKwp = round(monthlyKwhPerKwp.reduce((sum, value) => sum + value, 0), 0);

    if (!annualKwhPerKwp || annualKwhPerKwp < 300) {
      const fallback = fallbackSpecificYield({ latitude: lat, roofPitchDeg, azimuthDeg });
      return result(true, 'solarplan-fallback', {
        annualKwhPerKwp: fallback,
        monthlyKwhPerKwp: monthlyDistribution.map((share) => round(fallback * share, 1)),
        raw: { source: 'Fallback efter tom Open-Meteo solar response', openMeteo: data },
      }, `Open-Meteo soldata saknade användbara värden. Indikativ fallback används: ${fallback} kWh/kWp/år.`, 'connected');
    }

    return result(true, 'open-meteo-archive-gti', {
      annualKwhPerKwp,
      monthlyKwhPerKwp,
      raw: {
        source: 'Open-Meteo Historical Weather API, hourly global_tilted_irradiance',
        performanceRatio,
        tilt,
        azimuth,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        response: data,
      },
    }, `Solinstrålning ansluten via Open-Meteo GTI: ${annualKwhPerKwp} kWh/kWp/år.`);
  } catch (error) {
    const fallback = fallbackSpecificYield({ latitude: lat, roofPitchDeg, azimuthDeg });
    return result(true, 'solarplan-fallback', {
      annualKwhPerKwp: fallback,
      monthlyKwhPerKwp: monthlyDistribution.map((share) => round(fallback * share, 1)),
      raw: { source: 'Fallback efter Open-Meteo-fel', error: String(error?.message || error) },
    }, `Open-Meteo soldata kunde inte hämtas. Indikativ fallback används: ${fallback} kWh/kWp/år.`, 'connected');
  }
};

export const fetchSMHIWeather = async ({ latitude, longitude }) => {
  const lat = safeNumber(latitude, null);
  const lon = safeNumber(longitude, null);
  if (lat === null || lon === null) return result(false, 'open-meteo-forecast', null, 'Väderdata kräver latitud och longitud.');

  try {
    const params = new URLSearchParams({
      latitude: String(round(lat, 6)),
      longitude: String(round(lon, 6)),
      current: 'temperature_2m,cloud_cover,precipitation',
      daily: 'shortwave_radiation_sum',
      forecast_days: '7',
      timezone: 'Europe/Stockholm',
    });
    const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { timeoutMs: 15000 });
    return result(true, 'open-meteo-forecast', {
      temperatureC: safeNumber(data?.current?.temperature_2m, null),
      cloudCoverPercent: safeNumber(data?.current?.cloud_cover, null),
      precipitation: safeNumber(data?.current?.precipitation, null),
      raw: data,
    }, 'Väderdata ansluten via Open-Meteo Forecast.');
  } catch (error) {
    return result(false, 'open-meteo-forecast', { error: String(error?.message || error) }, 'Väderdata kunde inte hämtas via Open-Meteo.');
  }
};

export const getClimateLoadManualStatus = () => result(true, 'boverket-eks-manual', {
  url: 'https://www.boverket.se/sv/PBL-kunskapsbanken/regler-om-byggande/boverkets-konstruktionsregler/laster/klimatkartor-i-eks/',
}, 'Snö- och vindlast ska verifieras mot Boverkets klimatlastkartor/EKS och behörig konstruktör vid behov.', 'manual');

export const buildLocationDataFromResults = ({ previous = {}, address = '', manualLatitude = null, manualLongitude = null, geocoding, pvgis, smhi } = {}) => {
  const base = createDefaultLocationData(previous);
  const latitude = safeNumber(geocoding?.data?.latitude, safeNumber(manualLatitude, base.latitude));
  const longitude = safeNumber(geocoding?.data?.longitude, safeNumber(manualLongitude, base.longitude));
  const geocodedAddress = geocoding?.data?.geocodedAddress || base.geocodedAddress || address;
  const successCount = [geocoding?.ok || (latitude !== null && longitude !== null), pvgis?.ok, smhi?.ok].filter(Boolean).length;

  return createDefaultLocationData({
    ...base,
    status: successCount >= 3 ? 'success' : successCount > 0 ? 'partial' : 'error',
    message: successCount >= 3
      ? 'Platsdata hämtad via Open-Meteo. Kontrollera statusraderna.'
      : successCount > 0
        ? 'Platsdata delvis hämtad. Kontrollera statusraderna.'
        : 'Platsdata kunde inte hämtas automatiskt. Kontrollera adressen.',
    latitude,
    longitude,
    geocodedAddress,
    sources: {
      geocoding: {
        status: latitude !== null && longitude !== null ? 'connected' : 'error',
        message: latitude !== null && longitude !== null ? 'Ansluten via Open-Meteo geocoding' : 'Fel / Manuell',
      },
      map: {
        status: latitude !== null && longitude !== null ? 'connected' : 'manual',
        message: latitude !== null && longitude !== null ? 'Karta förberedd med koordinater / Flygbild ej ansluten' : 'Manuell / Ej ansluten',
      },
      elevation: {
        status: geocoding?.data?.elevationM !== null && geocoding?.data?.elevationM !== undefined ? 'connected' : 'manual',
        message: geocoding?.data?.elevationM !== null && geocoding?.data?.elevationM !== undefined ? `${round(geocoding.data.elevationM, 0)} m via geokodning` : 'Ej ansluten',
      },
      solarIrradiance: {
        status: pvgis?.ok ? 'connected' : 'error',
        message: pvgis?.ok ? pvgis.message : 'Fel / Manuell',
      },
      weather: {
        status: smhi?.ok ? 'connected' : 'manual',
        message: smhi?.ok ? 'Ansluten via Open-Meteo Forecast' : 'Manuell / Ej ansluten',
      },
      climateLoad: { status: 'manual', message: 'Manuell kontroll krävs' },
    },
    pvgis: {
      annualKwhPerKwp: pvgis?.data?.annualKwhPerKwp ?? base.pvgis.annualKwhPerKwp,
      monthlyKwhPerKwp: pvgis?.data?.monthlyKwhPerKwp || base.pvgis.monthlyKwhPerKwp,
      raw: pvgis?.data?.raw || base.pvgis.raw,
    },
    smhi: {
      temperatureC: smhi?.data?.temperatureC ?? base.smhi.temperatureC,
      cloudCoverPercent: smhi?.data?.cloudCoverPercent ?? base.smhi.cloudCoverPercent,
      precipitation: smhi?.data?.precipitation ?? base.smhi.precipitation,
      raw: smhi?.data?.raw || base.smhi.raw,
    },
    forecast: smhi?.data?.raw || base.forecast,
  });
};

export const fetchLiveSiteData = async ({ address, latitude, longitude, installedKwp = 1, roofPitchDeg = 30, azimuthDeg = 180, previous = {} } = {}) => {
  const manualLatitude = safeNumber(latitude, null);
  const manualLongitude = safeNumber(longitude, null);
  const geocoding = manualLatitude !== null && manualLongitude !== null
    ? result(true, 'manual-coordinates', { latitude: manualLatitude, longitude: manualLongitude, geocodedAddress: address || `${manualLatitude}, ${manualLongitude}` }, 'Manuella koordinater används.')
    : await geocodeAddress(address);

  const lat = safeNumber(geocoding?.data?.latitude, manualLatitude);
  const lon = safeNumber(geocoding?.data?.longitude, manualLongitude);
  const [pvgis, smhi] = await Promise.all([
    lat !== null && lon !== null ? fetchPVGISData({ latitude: lat, longitude: lon, installedKwp, roofPitchDeg, azimuthDeg }) : Promise.resolve(result(false, 'open-meteo-archive', null, 'Soldata hoppades över eftersom koordinater saknas.')),
    lat !== null && lon !== null ? fetchSMHIWeather({ latitude: lat, longitude: lon }) : Promise.resolve(result(false, 'open-meteo-forecast', null, 'Väderdata hoppades över eftersom koordinater saknas.')),
  ]);

  return buildLocationDataFromResults({ previous, address, manualLatitude, manualLongitude, geocoding, pvgis, smhi });
};

const buildRowsFromLocationData = (locationData = null) => {
  const data = createDefaultLocationData(locationData || readStoredProject()?.locationData || {});
  return [
    statusRow('Adress/geokodning', data.sources.geocoding.status, data.sources.geocoding.message),
    statusRow('Karta/flygbild', data.sources.map.status, data.sources.map.message),
    statusRow('Höjddata', data.sources.elevation.status, data.sources.elevation.message),
    statusRow('Solinstrålning', data.sources.solarIrradiance.status, data.sources.solarIrradiance.message),
    statusRow('Väderdata', data.sources.weather.status, data.sources.weather.message),
    statusRow('Snö/vindlast', data.sources.climateLoad.status, data.sources.climateLoad.message),
  ];
};

let liveStatusRows = null;
const ensureLiveRows = () => {
  if (!liveStatusRows) liveStatusRows = buildRowsFromLocationData();
  return liveStatusRows;
};
const mutateLiveRows = (locationData) => {
  const rows = ensureLiveRows();
  buildRowsFromLocationData(locationData).forEach((nextRow, index) => Object.assign(rows[index], nextRow));
  return rows;
};

const fetchAndPersistFromStoredProject = async () => {
  const stored = readStoredProject() || {};
  const address = stored.address || readAddressFromVisibleForm();
  const currentLocation = createDefaultLocationData(stored.locationData || {});
  const nextLocationData = await fetchLiveSiteData({
    address,
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    installedKwp: stored.productionEstimate?.installedKwp || 1,
    roofPitchDeg: stored.building?.roofPitchDeg || 30,
    azimuthDeg: stored.building?.azimuthDeg || 180,
    previous: currentLocation,
  });
  const nextProject = {
    ...stored,
    address: address || stored.address || '',
    locationData: nextLocationData,
    productionEstimate: {
      ...(stored.productionEstimate || {}),
      specificYieldKwhPerKwpYear: nextLocationData.pvgis?.annualKwhPerKwp || stored.productionEstimate?.specificYieldKwhPerKwpYear || 900,
      pvgisSpecificYieldKwhPerKwpYear: nextLocationData.pvgis?.annualKwhPerKwp || null,
      pvgisMonthlyKwhPerKwp: nextLocationData.pvgis?.monthlyKwhPerKwp || [],
    },
    weatherScenario: {
      ...(stored.weatherScenario || {}),
      ambientTempC: nextLocationData.smhi?.temperatureC ?? stored.weatherScenario?.ambientTempC ?? 20,
    },
  };
  writeStoredProject(nextProject);
  mutateLiveRows(nextLocationData);
  return nextLocationData;
};

export const getSiteDataAdapterStatuses = (locationData = null) => {
  if (locationData) return buildRowsFromLocationData(locationData);
  return ensureLiveRows();
};

export const getManualSiteDataNotice = () => {
  if (typeof window === 'undefined') return 'Platsdata kan bara hämtas i webbläsaren.';

  fetchAndPersistFromStoredProject()
    .then((locationData) => {
      window.localStorage.setItem(LAST_MESSAGE_KEY, locationData.message || 'Platsdata hämtad.');
      window.setTimeout(() => window.location.reload(), 150);
    })
    .catch((error) => {
      const stored = readStoredProject() || {};
      const errorLocationData = createDefaultLocationData({
        ...(stored.locationData || {}),
        status: 'error',
        message: `Platsdata kunde inte hämtas: ${error?.message || error}`,
      });
      writeStoredProject({ ...stored, locationData: errorLocationData });
      window.localStorage.setItem(LAST_MESSAGE_KEY, errorLocationData.message);
      window.setTimeout(() => window.location.reload(), 150);
    });

  return 'Hämtar verklig platsdata via Open-Meteo geokodning, historisk solinstrålning och väderprognos...';
};

export const manualGeocodingAdapter = { name: 'Open-Meteo Geocoding', getStatus: () => statusRow('Adress/geokodning'), geocodeAddress };
export const manualMapImageryAdapter = { name: 'Coordinate map placeholder', getStatus: () => statusRow('Karta/flygbild', 'manual', 'Karta förberedd / Flygbild ej ansluten'), async getImagery(site) { return result(true, 'map-placeholder', { site, imageryUrl: null }, 'Karta kan visas med koordinater. Flygbild/ortofoto är inte ansluten ännu.', 'manual'); } };
export const manualElevationAdapter = { name: 'Open-Meteo geocoding elevation', getStatus: () => statusRow('Höjddata', 'manual', 'Höjd via geokodning när tillgänglig'), async getElevation(site) { return result(true, 'geocoding-elevation', { site, elevationM: null }, 'Höjddata hämtas från geokodningssvaret när den finns.', 'manual'); } };
export const manualSolarIrradianceAdapter = { name: 'Open-Meteo Historical GTI', getStatus: () => statusRow('Solinstrålning'), getProductionEstimate: fetchPVGISData };
export const manualWeatherAdapter = { name: 'Open-Meteo Forecast', getStatus: () => statusRow('Väderdata'), getWeatherScenario: fetchSMHIWeather };
export const manualClimateLoadAdapter = { name: 'Boverket/EKS manual climate load', getStatus: () => statusRow('Snö/vindlast', 'manual', 'Manuell kontroll krävs'), async getClimateLoadData(site) { return result(true, 'boverket-eks-manual', { site, snowLoad: null, windLoad: null }, 'Snö- och vindlast ska verifieras manuellt mot Boverket/EKS.', 'manual'); } };

export const siteDataAdapters = {
  geocoding: manualGeocodingAdapter,
  mapImagery: manualMapImageryAdapter,
  elevation: manualElevationAdapter,
  solarIrradiance: manualSolarIrradianceAdapter,
  weather: manualWeatherAdapter,
  climateLoad: manualClimateLoadAdapter,
};

export const pvgisAdapter = manualSolarIrradianceAdapter;
export const smhiAdapter = manualWeatherAdapter;
export const boverketEksClimateLoadAdapter = manualClimateLoadAdapter;
export const mapGeodataAdapter = manualMapImageryAdapter;
