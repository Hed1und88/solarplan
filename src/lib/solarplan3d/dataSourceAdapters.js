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

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
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
    solarIrradiance: { status: 'manual', message: 'Indikativ fallback / Ej PVGIS', ...(overrides.sources?.solarIrradiance || {}) },
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

export const geocodeAddress = async (address) => {
  const query = String(address || '').trim();
  if (!query) return result(false, 'geocoding', null, 'Ange adress innan du hämtar platsdata.');

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      countrycodes: 'se',
      q: query,
    });
    const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const first = Array.isArray(data) ? data[0] : null;
    const latitude = safeNumber(first?.lat, null);
    const longitude = safeNumber(first?.lon, null);
    if (latitude === null || longitude === null) {
      return result(false, 'geocoding', null, 'Adress kunde inte geokodas automatiskt. Kontrollera adressen.');
    }
    return result(true, 'nominatim-geocoding', {
      latitude,
      longitude,
      geocodedAddress: first?.display_name || query,
      raw: first,
    }, 'Adress/geokodning ansluten.');
  } catch (error) {
    return result(false, 'geocoding', { error: String(error?.message || error) }, 'Adress kunde inte geokodas automatiskt. Kontrollera adressen.');
  }
};

const calculateIndicativeSpecificYield = ({ latitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, 59);
  const pitch = safeNumber(roofPitchDeg, 30);
  const azimuth = ((safeNumber(azimuthDeg, 180) % 360) + 360) % 360;

  const latitudeFactor = Math.max(0.78, Math.min(1.06, 1 - ((lat - 55) * 0.025)));
  const pitchFactor = Math.max(0.86, 1 - (Math.abs(pitch - 35) * 0.006));
  const southDeviation = Math.min(Math.abs(azimuth - 180), 360 - Math.abs(azimuth - 180));
  const azimuthFactor = Math.max(0.72, 1 - (southDeviation * 0.0017));
  const baseSwedenYield = 980;

  return Math.max(650, Math.min(1050, round(baseSwedenYield * latitudeFactor * pitchFactor * azimuthFactor, 0)));
};

const estimateAmbientTemperature = ({ latitude, month = new Date().getMonth() + 1 }) => {
  const lat = safeNumber(latitude, 59);
  const baseMonthlyTemps = [-3, -2, 2, 7, 12, 16, 18, 17, 12, 7, 3, -1];
  const northAdjustment = Math.max(-6, Math.min(3, (59 - lat) * 0.7));
  const index = Math.max(0, Math.min(11, Number(month) - 1));
  return round(baseMonthlyTemps[index] + northAdjustment, 1);
};

const monthlyDistribution = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03];

export const fetchPVGISData = async ({ latitude, roofPitchDeg = 30, azimuthDeg = 180 }) => {
  const lat = safeNumber(latitude, null);
  if (lat === null) return result(false, 'solar-fallback', null, 'Solberäkning kräver latitud.');

  const annualKwhPerKwp = calculateIndicativeSpecificYield({ latitude: lat, roofPitchDeg, azimuthDeg });
  return result(true, 'indicative-solar-fallback', {
    annualKwhPerKwp,
    monthlyKwhPerKwp: monthlyDistribution.map((share) => round(annualKwhPerKwp * share, 1)),
    raw: {
      source: 'SolarPlan indikativ svensk fallback',
      note: 'Externa PVGIS-anrop är avstängda i frontend. Anslut riktig PVGIS via stabil Base44-serverfunktion/proxy senare.',
    },
  }, `Solinstrålning beräknad indikativt: ${annualKwhPerKwp} kWh/kWp/år.`, 'connected');
};

export const fetchSMHIWeather = async ({ latitude }) => {
  const lat = safeNumber(latitude, null);
  if (lat === null) return result(false, 'weather-fallback', null, 'Väderfallback kräver latitud.');

  const temperatureC = estimateAmbientTemperature({ latitude: lat });
  return result(true, 'indicative-weather-fallback', {
    temperatureC,
    cloudCoverPercent: null,
    precipitation: null,
    raw: {
      source: 'SolarPlan indikativ väderfallback',
      note: 'Externa väderanrop är avstängda i 3D-projektering för att undvika CORS/serverfel i Base44-preview.',
    },
  }, 'Väderdata beräknad indikativt utan externt anrop.', 'connected');
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
    message: successCount >= 3 ? 'Platsdata hämtad. Kontrollera statusraderna.' : successCount > 0 ? 'Platsdata delvis hämtad. Kontrollera statusraderna.' : 'Platsdata kunde inte hämtas automatiskt. Kontrollera adressen.',
    latitude,
    longitude,
    geocodedAddress,
    sources: {
      geocoding: {
        status: latitude !== null && longitude !== null ? 'connected' : 'error',
        message: latitude !== null && longitude !== null ? 'Ansluten' : 'Fel / Manuell',
      },
      map: {
        status: latitude !== null && longitude !== null ? 'connected' : 'manual',
        message: latitude !== null && longitude !== null ? 'Karta förberedd med koordinater / Flygbild ej ansluten' : 'Manuell / Ej ansluten',
      },
      elevation: { status: 'manual', message: 'Ej ansluten' },
      solarIrradiance: {
        status: pvgis?.ok ? 'connected' : 'manual',
        message: pvgis?.ok ? 'Indikativ fallback / Ej PVGIS' : 'Manuell',
      },
      weather: {
        status: smhi?.ok ? 'connected' : 'manual',
        message: smhi?.ok ? 'Indikativ fallback / Ej externt väder' : 'Manuell / Ej ansluten',
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
  const pvgis = lat !== null ? await fetchPVGISData({ latitude: lat, installedKwp, roofPitchDeg, azimuthDeg }) : result(false, 'solar-fallback', null, 'Solberäkning hoppades över eftersom koordinater saknas.');
  const smhi = lat !== null ? await fetchSMHIWeather({ latitude: lat, longitude: lon }) : result(false, 'weather', null, 'Väderdata hoppades över eftersom koordinater saknas.');

  return buildLocationDataFromResults({ previous, address, manualLatitude, manualLongitude, geocoding, pvgis, smhi });
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
  if (typeof window === 'undefined') return 'Platsdata kan bara hämtas i webbläsaren.';

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

  return 'Hämtar platsdata. Externa PVGIS/SMHI-anrop är avstängda i frontend för att undvika CORS/serverfel. Sidan uppdateras automatiskt.';
};

export const manualGeocodingAdapter = { name: 'Nominatim geocoding', getStatus: () => statusRow('Adress/geokodning'), geocodeAddress };
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
