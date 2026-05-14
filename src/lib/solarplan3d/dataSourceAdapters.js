const manualStatus = (label) => ({
  label,
  mode: 'manual',
  connected: false,
  statusText: 'Manuell / Ej ansluten',
});

const notConnectedResult = (source, data = null) => ({
  ok: true,
  source,
  mode: 'manual',
  connected: false,
  message: 'Automatisk platsdata är förberedd men inte ansluten ännu.',
  data,
});

/**
 * @typedef {Object} GeocodingAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(address: string) => Promise<ReturnType<typeof notConnectedResult>>} geocodeAddress
 */

/**
 * @typedef {Object} MapImageryAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(site: object) => Promise<ReturnType<typeof notConnectedResult>>} getImagery
 */

/**
 * @typedef {Object} ElevationAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(site: object) => Promise<ReturnType<typeof notConnectedResult>>} getElevation
 */

/**
 * @typedef {Object} SolarIrradianceAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(site: object) => Promise<ReturnType<typeof notConnectedResult>>} getProductionEstimate
 */

/**
 * @typedef {Object} WeatherAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(site: object) => Promise<ReturnType<typeof notConnectedResult>>} getWeatherScenario
 */

/**
 * @typedef {Object} ClimateLoadAdapter
 * @property {string} name
 * @property {() => ReturnType<typeof manualStatus>} getStatus
 * @property {(site: object) => Promise<ReturnType<typeof notConnectedResult>>} getClimateLoadData
 */

/** @type {GeocodingAdapter} */
export const manualGeocodingAdapter = {
  name: 'Manual geocoding',
  getStatus: () => manualStatus('Adress/geokodning'),
  async geocodeAddress(address) {
    // TODO: Connect to a backend-proxied geocoding provider. Do not expose API keys in the frontend.
    return notConnectedResult('manual-geocoding', { address, coordinates: null });
  },
};

/** @type {MapImageryAdapter} */
export const manualMapImageryAdapter = {
  name: 'Manual map imagery',
  getStatus: () => manualStatus('Karta/flygbild'),
  async getImagery(site) {
    // TODO: Connect to safe orthophoto/satellite imagery through a backend proxy or approved tile service.
    return notConnectedResult('manual-map-imagery', { site, imageryUrl: null });
  },
};

/** @type {ElevationAdapter} */
export const manualElevationAdapter = {
  name: 'Manual elevation',
  getStatus: () => manualStatus('Höjddata'),
  async getElevation(site) {
    // TODO: Connect to elevation/height data through a safe service adapter.
    return notConnectedResult('manual-elevation', { site, elevationM: null });
  },
};

/** @type {SolarIrradianceAdapter} */
export const manualSolarIrradianceAdapter = {
  name: 'Manual PVGIS solar irradiance',
  getStatus: () => manualStatus('Solinstrålning'),
  async getProductionEstimate(site) {
    // TODO: Connect PVGIS through a backend proxy or another existing safe API pattern.
    return notConnectedResult('manual-solar-irradiance', { site, annualKwh: null, monthlyKwh: null });
  },
};

/** @type {WeatherAdapter} */
export const manualWeatherAdapter = {
  name: 'Manual SMHI weather',
  getStatus: () => manualStatus('Väderdata'),
  async getWeatherScenario(site) {
    // TODO: Connect SMHI weather through a safe service layer without frontend secrets.
    return notConnectedResult('manual-weather', { site, weatherScenario: null });
  },
};

/** @type {ClimateLoadAdapter} */
export const manualClimateLoadAdapter = {
  name: 'Manual Boverket/EKS climate load',
  getStatus: () => manualStatus('Snö/vindlast'),
  async getClimateLoadData(site) {
    // TODO: Connect Boverket/EKS climate load data through a maintained source/service adapter.
    return notConnectedResult('manual-climate-load', { site, snowLoad: null, windLoad: null });
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

export const getSiteDataAdapterStatuses = () => Object.values(siteDataAdapters).map((adapter) => adapter.getStatus());

export const getManualSiteDataNotice = () => 'Automatisk platsdata är förberedd men inte ansluten ännu.';

export const pvgisAdapter = manualSolarIrradianceAdapter;
export const smhiAdapter = manualWeatherAdapter;
export const boverketEksClimateLoadAdapter = manualClimateLoadAdapter;
export const mapGeodataAdapter = manualMapImageryAdapter;
