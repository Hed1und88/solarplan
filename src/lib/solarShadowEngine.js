export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

const rad = (deg) => (Number(deg) * Math.PI) / 180;
const deg = (radians) => (Number(radians) * 180) / Math.PI;
const normalAzimuth = (value) => ((value % 360) + 360) % 360;

export function azimuthDiff(a, b) {
  const diff = Math.abs(normalAzimuth(a) - normalAzimuth(b));
  return Math.min(diff, 360 - diff);
}

function dayOfYear(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function hourFromTime(time) {
  const [h = 12, m = 0] = String(time || '12:00').split(':').map(Number);
  return h + m / 60;
}

export function calculateSolarPosition({ latitude, longitude, date, time }) {
  const lat = clamp(latitude, -89.9, 89.9);
  const lon = clamp(longitude, -180, 180);
  const n = dayOfYear(date);
  const hour = hourFromTime(time);
  const gamma = (2 * Math.PI / 365) * (n - 1 + (hour - 12) / 24);
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const timezoneOffset = Math.round(lon / 15);
  const trueSolarTime = ((hour * 60 + equationOfTime + 4 * lon - 60 * timezoneOffset) % 1440 + 1440) % 1440;
  const hourAngle = rad(trueSolarTime / 4 - 180);
  const latRad = rad(lat);
  const cosZenith = Math.sin(latRad) * Math.sin(declination) + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const zenith = Math.acos(clamp(cosZenith, -1, 1));
  const altitude = 90 - deg(zenith);
  const azimuthRad = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(declination) * Math.cos(latRad));
  const azimuth = normalAzimuth(deg(azimuthRad) + 180);
  const altitudeRad = rad(Math.max(altitude, -8));
  return {
    altitude,
    azimuth,
    sunVector: {
      x: Math.sin(rad(azimuth)) * Math.cos(altitudeRad),
      y: Math.sin(altitudeRad),
      z: Math.cos(rad(azimuth)) * Math.cos(altitudeRad)
    }
  };
}

export function calculateWeatherFactor({ cloudCover = 0, precipitation = 0, temperature = 20 }) {
  const cloudFactor = 1 - clamp(cloudCover, 0, 100) * 0.0067;
  const rainFactor = 1 - Math.min(0.28, clamp(precipitation, 0, 20) * 0.055);
  const temp = Number(temperature);
  const tempFactor = temp > 25 ? 1 - Math.min(0.16, (temp - 25) * 0.004) : 1 + Math.min(0.06, (25 - temp) * 0.0015);
  return clamp(cloudFactor * rainFactor * tempFactor, 0.05, 1.08);
}

export function calculateShadeLoss({ solar, model }) {
  if (!solar || solar.altitude <= 0) return 100;
  const roofAzimuth = Number(model.roofAzimuth);
  const roofPitch = Number(model.roofPitch);
  const obstacles = model.obstacles || {};
  const alignmentLoss = clamp(azimuthDiff(solar.azimuth, roofAzimuth) / 120, 0, 1) * 24;
  const lowSunLoss = solar.altitude < 12 ? (12 - solar.altitude) * 3.5 : 0;
  const pitchLoss = clamp((Math.abs(roofPitch - solar.altitude) - 15) * 0.35, 0, 14);
  let obstacleLoss = 0;

  if (obstacles.chimney) obstacleLoss += solar.altitude < 45 ? 8 + (45 - solar.altitude) * 0.18 : 4;

  if (obstacles.tree) {
    const len = Number(model.treeHeight) / Math.tan(rad(Math.max(3, solar.altitude)));
    if (len > Number(model.treeDistance) * 0.65) obstacleLoss += clamp((len - Number(model.treeDistance) * 0.65) * 1.8, 4, 38);
  }

  if (obstacles.neighbour) {
    const len = Number(model.neighbourHeight) / Math.tan(rad(Math.max(3, solar.altitude)));
    if (len > Number(model.neighbourDistance) * 0.75) obstacleLoss += clamp((len - Number(model.neighbourDistance) * 0.75) * 1.4, 3, 32);
  }

  return clamp(alignmentLoss + lowSunLoss + pitchLoss + obstacleLoss, 0, 100);
}

export function calculatePvEstimate({ solar, model, weatherFactor, shadeLoss }) {
  if (!solar || solar.altitude <= 0) return { irradiance: 0, productionKw: 0, factor: 0 };
  const altitudeFactor = Math.sin(rad(solar.altitude));
  const azimuthFactor = clamp(1 - azimuthDiff(solar.azimuth, Number(model.roofAzimuth)) / 155, 0.12, 1);
  const pitchFactor = clamp(1 - Math.abs(Number(model.roofPitch) - solar.altitude) / 95, 0.24, 1);
  const shadeFactor = 1 - clamp(shadeLoss, 0, 100) / 100;
  const factor = clamp(altitudeFactor * azimuthFactor * pitchFactor * weatherFactor * shadeFactor, 0, 1.15);
  return { irradiance: 1000 * factor, productionKw: Number(model.panelKw) * factor, factor };
}

export function generateHourlySimulation({ model, date }) {
  return Array.from({ length: 16 }, (_, i) => i + 4).map((hour) => {
    const time = `${String(hour).padStart(2, '0')}:00`;
    const solar = calculateSolarPosition({ latitude: model.latitude, longitude: model.longitude, date, time });
    const weatherFactor = calculateWeatherFactor({ cloudCover: model.cloudCover, precipitation: model.precipitation, temperature: model.temperature });
    const shadeLoss = calculateShadeLoss({ solar, model });
    const estimate = calculatePvEstimate({ solar, model, weatherFactor, shadeLoss });
    return { time, solar, weatherFactor, shadeLoss, ...estimate };
  });
}

export function annualFactorFromDate(dateString) {
  const month = new Date(`${dateString}T12:00:00`).getMonth() + 1;
  if ([12, 1, 2].includes(month)) return 0.42;
  if ([3, 4, 5].includes(month)) return 0.78;
  if ([6, 7, 8].includes(month)) return 1;
  return 0.64;
}
