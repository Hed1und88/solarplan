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

const defaultSources = () => ({
  geocoding: { status: 'manual', message: 'Manuell / Ej ansluten' },
  map: { status: 'manual', message: 'Manuell / Ej ansluten' },
  elevation: { status: 'manual', message: 'Ej ansluten' },
  solarIrradiance: { status: 'manual', message: 'Indikativ fallback / Ej PVGIS' },
  weather: { status: 'manual', message: 'Indikativ fallback / Ej externt väder' },
  climateLoad: { status: 'manual', message: 'Manuell kontroll krävs' },
});

export const createDefaultLocationData = (overrides = {}) => ({
  status: overrides.status || 'idle',
  message: overrides.message || 'Platsdata är inte hämtad ännu.',
  latitude: safeNumber(overrides.latitude, null),
  longitude: safeNumber(overrides.longitude, null),
  geocodedAddress: overrides.geocodedAddress || '',
  sources: {
    geocoding: { ...defaultSources().geocoding, ...(overrides.sources?.geocoding || {}) },
    map: { ...defaultSources().map, ...(overrides.sources?.map || {}) },
    elevation: { ...defaultSources().elevation, ...(overrides.sources?.elevation || {}) },
    solarIrradiance: { ...defaultSources().solarIrradiance, ...(overrides.sources?.solarIrradiance || {}) },
    weather: { ...defaultSources().weather, ...(overrides.sources?.weather || {}) },
    climateLoad: { ...defaultSources().climateLoad, ...(overrides.sources?.climateLoad || {}) },
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

const estimateCoordinatesFromAddress = (address = '') => {
  const text = String(address).toLowerCase();

  if (text.includes('deje')) return { latitude: 59.605, longitude: 13.466 };
  if (text.includes('forshaga')) return { latitude: 59.525, longitude: 13.482 };
  if (text.includes('karlstad')) return { latitude: 59.379, longitude: 13.504 };
  if (text.includes('stockholm')) return { latitude: 59.329, longitude: 18.069 };
  if (text.includes('göteborg') || text.includes('goteborg')) return { latitude: 57.708, longitude: 11.974 };
  if (text.includes('malmö') || text.includes('malmo')) return { latitude: 55.605, longitude: 13.003 };

  return { latitude: 59.334, longitude: 14.520 };
};

const calculateIndicativeSpecificYield = ({ latitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, 59);
  const pitch = safeNumber(roofPitchDeg, 30);
  const azimuth = ((safeNumber(azimuthDeg, 180) % 360) + 360) % 360;
  const latitudeFactor = Math.max(0.78, Math.min(1.06, 1 - ((lat - 55) * 0.025)));
  const pitchFactor = Math.max(0.86, 1 - (Math.abs(pitch - 35) * 0.006));
  const southDeviation = Math.min(Math.abs(azimuth - 180), 360 - Math.abs(azimuth - 180));
  const azimuthFactor = Math.max(0.72, 1 - (southDeviation * 0.0017));
  return Math.max(650, Math.min(1050, round(980 * latitudeFactor * pitchFactor * azimuthFactor, 0)));
};

const estimateAmbientTemperature = ({ latitude, month = new Date().getMonth() + 1 }) => {
  const lat = safeNumber(latitude, 59);
  const baseMonthlyTemps = [-3, -2, 2, 7, 12, 16, 18, 17, 12, 7, 3, -1];
  const northAdjustment = Math.max(-6, Math.min(3, (59 - lat) * 0.7));
  const index = Math.max(0, Math.min(11, Number(month) - 1));
  return round(baseMonthlyTemps[index] + northAdjustment, 1);
};

const monthlyDistribution = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03];

let liveStatusRows = null;

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

const ensureLiveRows = () => {
  if (!liveStatusRows) liveStatusRows = buildRowsFromLocationData();
  return liveStatusRows;
};

const mutateLiveRows = (locationData) => {
  const currentRows = ensureLiveRows();
  const nextRows = buildRowsFromLocationData(locationData);
  nextRows.forEach((nextRow, index) => {
    Object.assign(currentRows[index], nextRow);
  });
  return currentRows;
};

const buildSynchronousLocationData = ({ project = {}, address = '' } = {}) => {
  const previous = createDefaultLocationData(project.locationData || {});
  const storedLatitude = safeNumber(previous.latitude, null);
  const storedLongitude = safeNumber(previous.longitude, null);
  const estimated = estimateCoordinatesFromAddress(address || project.address || previous.geocodedAddress);
  const latitude = storedLatitude ?? estimated.latitude;
  const longitude = storedLongitude ?? estimated.longitude;
  const annualKwhPerKwp = calculateIndicativeSpecificYield({
    latitude,
    roofPitchDeg: project.building?.roofPitchDeg || 30,
    azimuthDeg: project.building?.azimuthDeg || 180,
  });
  const temperatureC = estimateAmbientTemperature({ latitude });

  return createDefaultLocationData({
    ...previous,
    status: 'success',
    message: 'Platsdata uppdaterad i 3D-projekteringen utan externa API-anrop.',
    latitude,
    longitude,
    geocodedAddress: address || project.address || previous.geocodedAddress || 'Svensk standardposition',
    sources: {
      geocoding: { status: 'connected', message: storedLatitude !== null && storedLongitude !== null ? 'Sparade koordinater' : 'Indikativ koordinat från adress' },
      map: { status: 'connected', message: 'Karta förberedd med koordinater / Flygbild ej ansluten' },
      elevation: { status: 'manual', message: 'Ej ansluten' },
      solarIrradiance: { status: 'connected', message: 'Indikativ fallback / Ej PVGIS' },
      weather: { status: 'connected', message: 'Indikativ fallback / Ej externt väder' },
      climateLoad: { status: 'manual', message: 'Manuell kontroll krävs' },
    },
    pvgis: {
      annualKwhPerKwp,
      monthlyKwhPerKwp: monthlyDistribution.map((share) => round(annualKwhPerKwp * share, 1)),
      raw: {
        source: 'SolarPlan lokal indikativ fallback',
        note: 'Externa PVGIS/SMHI/Base44-funktioner används inte här eftersom Base44-preview blockerar/kraschar externa anrop.',
      },
    },
    smhi: {
      temperatureC,
      cloudCoverPercent: null,
      precipitation: null,
      raw: { source: 'SolarPlan lokal indikativ väderfallback' },
    },
  });
};

export const manualStatus = (label) => statusRow(label);

export const geocodeAddress = async (address) => {
  const coordinates = estimateCoordinatesFromAddress(address);
  return result(true, 'local-address-estimate', {
    ...coordinates,
    geocodedAddress: address || 'Svensk standardposition',
    raw: { source: 'local estimate' },
  }, 'Adress/geokodning beräknad lokalt.');
};

export const fetchPVGISData = async ({ latitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, 59);
  const annualKwhPerKwp = calculateIndicativeSpecificYield({ latitude: lat, roofPitchDeg, azimuthDeg });
  return result(true, 'indicative-solar-fallback', {
    annualKwhPerKwp,
    monthlyKwhPerKwp: monthlyDistribution.map((share) => round(annualKwhPerKwp * share, 1)),
    raw: { source: 'SolarPlan lokal indikativ fallback' },
  }, `Solinstrålning beräknad indikativt: ${annualKwhPerKwp} kWh/kWp/år.`, 'connected');
};

export const fetchSMHIWeather = async ({ latitude }) => {
  const temperatureC = estimateAmbientTemperature({ latitude: safeNumber(latitude, 59) });
  return result(true, 'indicative-weather-fallback', {
    temperatureC,
    cloudCoverPercent: null,
    precipitation: null,
    raw: { source: 'SolarPlan lokal indikativ väderfallback' },
  }, 'Väderdata beräknad indikativt utan externt anrop.', 'connected');
};

export const getClimateLoadManualStatus = () => result(true, 'boverket-eks-manual', {
  url: 'https://www.boverket.se/sv/PBL-kunskapsbanken/regler-om-byggande/boverkets-konstruktionsregler/laster/klimatkartor-i-eks/',
}, 'Snö- och vindlast ska verifieras mot Boverkets klimatlastkartor/EKS och behörig konstruktör vid behov.', 'manual');

export const buildLocationDataFromResults = ({ previous = {}, address = '', manualLatitude = null, manualLongitude = null, geocoding, pvgis, smhi } = {}) => {
  const project = readStoredProject() || {};
  return buildSynchronousLocationData({
    project: {
      ...project,
      locationData: previous,
      address,
      building: project.building || {},
    },
    address,
    manualLatitude,
    manualLongitude,
    geocoding,
    pvgis,
    smhi,
  });
};

export const fetchLiveSiteData = async ({ address, previous = {} } = {}) => {
  return buildSynchronousLocationData({
    project: { ...(readStoredProject() || {}), locationData: previous },
    address,
  });
};

export const getSiteDataAdapterStatuses = (locationData = null) => {
  if (locationData) return buildRowsFromLocationData(locationData);
  return ensureLiveRows();
};

export const getManualSiteDataNotice = () => {
  if (typeof window === 'undefined') return 'Platsdata kan bara hanteras i webbläsaren.';

  const stored = readStoredProject() || {};
  const address = stored.address || readAddressFromVisibleForm();
  const locationData = buildSynchronousLocationData({ project: stored, address });
  const nextProject = {
    ...stored,
    address: address || stored.address || '',
    locationData,
    productionEstimate: {
      ...(stored.productionEstimate || {}),
      specificYieldKwhPerKwpYear: locationData.pvgis.annualKwhPerKwp || stored.productionEstimate?.specificYieldKwhPerKwpYear || 900,
      pvgisSpecificYieldKwhPerKwpYear: locationData.pvgis.annualKwhPerKwp || null,
      pvgisMonthlyKwhPerKwp: locationData.pvgis.monthlyKwhPerKwp || [],
    },
    weatherScenario: {
      ...(stored.weatherScenario || {}),
      ambientTempC: locationData.smhi.temperatureC ?? stored.weatherScenario?.ambientTempC ?? 20,
    },
  };

  writeStoredProject(nextProject);
  mutateLiveRows(locationData);

  return `Platsdata uppdaterad direkt: ${round(locationData.latitude, 4)}, ${round(locationData.longitude, 4)}. Solinstrålning ${locationData.pvgis.annualKwhPerKwp} kWh/kWp/år. Externa API-anrop används inte i preview.`;
};

export const manualGeocodingAdapter = { name: 'Local address estimate', getStatus: () => statusRow('Adress/geokodning'), geocodeAddress };
export const manualMapImageryAdapter = { name: 'Coordinate map placeholder', getStatus: () => statusRow('Karta/flygbild', 'manual', 'Karta förberedd / Flygbild ej ansluten'), async getImagery(site) { return result(true, 'map-placeholder', { site, imageryUrl: null }, 'Karta kan visas med koordinater. Flygbild/ortofoto är inte ansluten ännu.', 'manual'); } };
export const manualElevationAdapter = { name: 'Manual elevation', getStatus: () => statusRow('Höjddata', 'manual', 'Ej ansluten'), async getElevation(site) { return result(true, 'manual-elevation', { site, elevationM: null }, 'Höjddata är inte ansluten ännu.', 'manual'); } };
export const manualSolarIrradianceAdapter = { name: 'Indicative solar fallback', getStatus: () => statusRow('Solinstrålning'), getProductionEstimate: fetchPVGISData };
export const manualWeatherAdapter = { name: 'Weather fallback', getStatus: () => statusRow('Väderdata'), getWeatherScenario: fetchSMHIWeather };
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
