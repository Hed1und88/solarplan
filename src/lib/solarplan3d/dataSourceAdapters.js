import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';

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
  const updated = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
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

const monthlyFromPvgis = (pvgis, peakPower = 1) => {
  const monthlyRows = pvgis?.outputs?.monthly?.fixed || [];
  return monthlyRows.map((row) => {
    const monthlyKwh = safeNumber(row?.E_m, 0) || 0;
    return round(monthlyKwh / Math.max(0.1, peakPower), 1);
  });
};

const annualFromPvgis = (pvgis, peakPower = 1) => {
  const total = safeNumber(pvgis?.outputs?.totals?.fixed?.E_y, null)
    ?? (pvgis?.outputs?.monthly?.fixed || []).reduce((sum, row) => sum + (safeNumber(row?.E_m, 0) || 0), 0);
  return total ? round(total / Math.max(0.1, peakPower), 0) : null;
};

const normalizeSolarDataResponse = (data, peakPower, address) => {
  const lat = safeNumber(data?.lat, null);
  const lon = safeNumber(data?.lon, null);
  const annualKwhPerKwp = annualFromPvgis(data?.pvgis, peakPower);
  const monthlyKwhPerKwp = monthlyFromPvgis(data?.pvgis, peakPower);
  const hasPvgis = Boolean(data?.pvgis && annualKwhPerKwp);
  const hasForecast = Boolean(data?.forecast);

  return createDefaultLocationData({
    status: hasPvgis || hasForecast || (lat !== null && lon !== null) ? (hasPvgis && hasForecast ? 'success' : 'partial') : 'error',
    message: hasPvgis || hasForecast
      ? 'Platsdata hämtad via Base44 solarData. Kontrollera statusraderna.'
      : `Platsdata kunde inte hämtas via Base44 solarData. ${data?.pvgisError || data?.forecastError || ''}`.trim(),
    latitude: lat,
    longitude: lon,
    geocodedAddress: data?.address || address || '',
    sources: {
      geocoding: {
        status: lat !== null && lon !== null ? 'connected' : 'error',
        message: lat !== null && lon !== null ? 'Ansluten via Base44 solarData' : 'Fel / Manuell',
      },
      map: {
        status: lat !== null && lon !== null ? 'connected' : 'manual',
        message: lat !== null && lon !== null ? 'Karta förberedd med koordinater / Flygbild ej ansluten' : 'Manuell / Ej ansluten',
      },
      elevation: {
        status: 'manual',
        message: 'Ej ansluten',
      },
      solarIrradiance: {
        status: hasPvgis ? 'connected' : 'error',
        message: hasPvgis ? 'Ansluten via PVGIS genom Base44 function' : 'Fel / Manuell',
      },
      weather: {
        status: hasForecast ? 'connected' : 'manual',
        message: hasForecast ? 'Ansluten via solarData/Forecast' : 'SMHI ej ansluten i frontend - använd serverfunktion/proxy',
      },
      climateLoad: {
        status: 'manual',
        message: 'Manuell kontroll krävs',
      },
    },
    pvgis: {
      annualKwhPerKwp,
      monthlyKwhPerKwp,
      raw: data?.pvgis || null,
    },
    forecast: data?.forecast || null,
  });
};

const fetchViaBase44SolarData = async ({ address, installedKwp = 1 }) => {
  const query = String(address || '').trim();
  if (!query) {
    return result(false, 'base44-solarData', null, 'Ange adress innan du hämtar platsdata.');
  }

  try {
    const peakPower = Math.max(0.1, safeNumber(installedKwp, 1) || 1);
    const response = await base44.functions.invoke('solarData', { address: query, peakPower });
    const data = response?.data || response;
    const locationData = normalizeSolarDataResponse(data, peakPower, query);
    return result(locationData.status !== 'error', 'base44-solarData', locationData, locationData.message, locationData.status === 'error' ? 'error' : 'connected');
  } catch (error) {
    return result(false, 'base44-solarData', { error: String(error?.message || error) }, `Base44 solarData kunde inte hämta platsdata: ${error?.message || error}`);
  }
};

export const geocodeAddress = async (address) => {
  const base44Result = await fetchViaBase44SolarData({ address, installedKwp: 1 });
  if (base44Result.ok && base44Result.data?.latitude !== null && base44Result.data?.longitude !== null) {
    return result(true, 'base44-solarData-geocoding', {
      latitude: base44Result.data.latitude,
      longitude: base44Result.data.longitude,
      geocodedAddress: base44Result.data.geocodedAddress || address,
      raw: base44Result.data,
    }, 'Adress/geokodning ansluten via Base44 solarData.');
  }
  return result(false, 'base44-solarData-geocoding', base44Result.data, base44Result.message || 'Adress kunde inte geokodas automatiskt.');
};

export const fetchPVGISData = async ({ latitude, longitude }) => {
  if (latitude === null || longitude === null) {
    return result(false, 'pvgis', null, 'PVGIS hämtas via Base44 solarData från adress. Koordinater saknar separat proxy här.');
  }
  return result(false, 'pvgis', null, 'PVGIS direktanrop är avstängt i frontend för att undvika CORS. Använd Hämta platsdata via adress.');
};

export const fetchSMHIWeather = async ({ latitude, longitude }) => {
  if (latitude === null || longitude === null) {
    return result(false, 'weather', null, 'Väderdata kräver koordinater.');
  }
  return result(false, 'weather', null, 'SMHI direktanrop är avstängt i frontend för att undvika CORS. Använd serverfunktion/proxy.');
};

export const getClimateLoadManualStatus = () => result(true, 'boverket-eks-manual', {
  url: 'https://www.boverket.se/sv/PBL-kunskapsbanken/regler-om-byggande/boverkets-konstruktionsregler/laster/klimatkartor-i-eks/',
}, 'Snö- och vindlast ska verifieras mot Boverkets klimatlastkartor/EKS och behörig konstruktör vid behov.', 'manual');

export const buildLocationDataFromResults = ({ previous = {}, address = '', manualLatitude = null, manualLongitude = null, geocoding, pvgis, smhi } = {}) => {
  const base = createDefaultLocationData(previous);
  return createDefaultLocationData({
    ...base,
    status: geocoding?.ok ? 'partial' : 'error',
    message: geocoding?.message || 'Platsdata kunde inte hämtas automatiskt.',
    latitude: geocoding?.data?.latitude ?? safeNumber(manualLatitude, base.latitude),
    longitude: geocoding?.data?.longitude ?? safeNumber(manualLongitude, base.longitude),
    geocodedAddress: geocoding?.data?.geocodedAddress || base.geocodedAddress || address,
    pvgis: pvgis?.data || base.pvgis,
    smhi: smhi?.data || base.smhi,
  });
};

export const fetchLiveSiteData = async ({ address, installedKwp = 1, previous = {} } = {}) => {
  const base44Result = await fetchViaBase44SolarData({ address, installedKwp });
  if (base44Result.ok && base44Result.data) {
    return createDefaultLocationData({
      ...previous,
      ...base44Result.data,
      climateLoad: previous.climateLoad,
    });
  }

  return createDefaultLocationData({
    ...previous,
    status: 'error',
    message: base44Result.message || 'Platsdata kunde inte hämtas automatiskt. Kontrollera adressen eller anslut backend-proxy.',
    sources: {
      geocoding: { status: 'error', message: 'Fel / Manuell' },
      map: { status: 'manual', message: 'Manuell / Ej ansluten' },
      elevation: { status: 'manual', message: 'Ej ansluten' },
      solarIrradiance: { status: 'error', message: 'Fel / Manuell' },
      weather: { status: 'manual', message: 'Ej ansluten' },
      climateLoad: { status: 'manual', message: 'Manuell kontroll krävs' },
    },
  });
};

const fetchAndPersistFromStoredProject = async () => {
  const stored = readStoredProject() || {};
  const address = stored.address || readAddressFromVisibleForm();
  const currentLocation = createDefaultLocationData(stored.locationData || {});
  const nextLocationData = await fetchLiveSiteData({
    address,
    installedKwp: stored.productionEstimate?.installedKwp || 1,
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
  };

  writeStoredProject(nextProject);
  return nextLocationData;
};

export const getSiteDataAdapterStatuses = (locationData = null) => {
  const stored = !locationData ? readStoredProject() : null;
  const data = createDefaultLocationData(locationData || stored?.locationData || {});
  return [
    statusRow('Adress/geokodning', data.sources.geocoding.status, data.sources.geocoding.message),
    statusRow('Karta/flygbild', data.sources.map.status, data.sources.map.message),
    statusRow('Höjddata', data.sources.elevation.status, data.sources.elevation.message),
    statusRow('Solinstrålning', data.sources.solarIrradiance.status, data.sources.solarIrradiance.message),
    statusRow('Väderdata', data.sources.weather.status, data.sources.weather.message),
    statusRow('Snö/vindlast', data.sources.climateLoad.status, data.sources.climateLoad.message),
  ];
};

export const getManualSiteDataNotice = () => {
  if (typeof window === 'undefined') {
    return 'Platsdata kan bara hämtas i webbläsaren.';
  }

  fetchAndPersistFromStoredProject()
    .then((locationData) => {
      window.localStorage.setItem('solarplan:solarplan-3d-projektering:last-location-message', locationData.message || 'Platsdata hämtad.');
      window.setTimeout(() => window.location.reload(), 250);
    })
    .catch((error) => {
      const stored = readStoredProject() || {};
      const errorLocationData = createDefaultLocationData({
        ...(stored.locationData || {}),
        status: 'error',
        message: `Platsdata kunde inte hämtas automatiskt: ${error?.message || error}`,
      });
      writeStoredProject({ ...stored, locationData: errorLocationData });
      window.localStorage.setItem('solarplan:solarplan-3d-projektering:last-location-message', errorLocationData.message);
      window.setTimeout(() => window.location.reload(), 250);
    });

  return 'Hämtar platsdata via Base44 solarData-serverfunktion... Sidan uppdateras automatiskt.';
};

export const manualGeocodingAdapter = {
  name: 'Base44 solarData geocoding',
  getStatus: () => statusRow('Adress/geokodning'),
  geocodeAddress,
};

export const manualMapImageryAdapter = {
  name: 'Coordinate map placeholder',
  getStatus: () => statusRow('Karta/flygbild', 'manual', 'Karta förberedd / Flygbild ej ansluten'),
  async getImagery(site) {
    return result(true, 'map-placeholder', { site, imageryUrl: null }, 'Karta kan visas med koordinater. Flygbild/ortofoto är inte ansluten ännu.', 'manual');
  },
};

export const manualElevationAdapter = {
  name: 'Manual elevation',
  getStatus: () => statusRow('Höjddata', 'manual', 'Ej ansluten'),
  async getElevation(site) {
    return result(true, 'manual-elevation', { site, elevationM: null }, 'Höjddata är inte ansluten ännu.', 'manual');
  },
};

export const manualSolarIrradianceAdapter = {
  name: 'PVGIS via Base44 solarData',
  getStatus: () => statusRow('Solinstrålning'),
  getProductionEstimate: fetchPVGISData,
};

export const manualWeatherAdapter = {
  name: 'Weather via Base44 solarData/Forecast',
  getStatus: () => statusRow('Väderdata'),
  getWeatherScenario: fetchSMHIWeather,
};

export const manualClimateLoadAdapter = {
  name: 'Boverket/EKS manual climate load',
  getStatus: () => statusRow('Snö/vindlast', 'manual', 'Manuell kontroll krävs'),
  async getClimateLoadData(site) {
    return result(true, 'boverket-eks-manual', { site, snowLoad: null, windLoad: null }, 'Snö- och vindlast ska verifieras manuellt mot Boverket/EKS.', 'manual');
  },
};

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
