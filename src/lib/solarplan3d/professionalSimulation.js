const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degToRad = (value) => (numberOr(value) * Math.PI) / 180;
const radToDeg = (value) => (numberOr(value) * 180) / Math.PI;
const round = (value, digits = 2) => Math.round(numberOr(value) * 10 ** digits) / 10 ** digits;

export const formatSek = (value) => numberOr(value).toLocaleString('sv-SE', { maximumFractionDigits: 0 });
export const formatKwh = (value) => numberOr(value).toLocaleString('sv-SE', { maximumFractionDigits: 0 });

export function getPanelDimensionsM(panelModel = {}, orientation = 'portrait') {
  const widthM = numberOr(panelModel.widthMm, 1134) / 1000;
  const heightM = numberOr(panelModel.heightMm, 1722) / 1000;
  return orientation === 'landscape' ? { widthM: heightM, heightM: widthM } : { widthM, heightM };
}

export function normalizePanelGroupPanels(group = {}, panelModel = {}) {
  if (Array.isArray(group.panels) && group.panels.length > 0) return group.panels;
  const rows = Math.max(0, Math.round(numberOr(group.rows, 0)));
  const columns = Math.max(0, Math.round(numberOr(group.columns, 0)));
  const spacingM = numberOr(group.spacingMm, 30) / 1000;
  const dims = getPanelDimensionsM(panelModel, group.orientation);
  const panels = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      panels.push({
        id: `${group.id || 'group'}-${row + 1}-${column + 1}`,
        row: row + 1,
        column: column + 1,
        xM: round(numberOr(group.startXM, 0.5) + column * (dims.widthM + spacingM), 3),
        yM: round(numberOr(group.startYM, 0.5) + row * (dims.heightM + spacingM), 3),
        widthM: round(dims.widthM, 3),
        heightM: round(dims.heightM, 3),
      });
    }
  }
  return panels;
}

function dayOfYear(month, day = 15) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days.slice(0, clamp(Math.round(numberOr(month, 6)) - 1, 0, 11)).reduce((sum, item) => sum + item, 0) + clamp(Math.round(numberOr(day, 15)), 1, 31);
}

export function calculateSolarPosition({ latitude = 59.33, month = 6, hour = 12 }) {
  const latRad = degToRad(latitude);
  const n = dayOfYear(month);
  const declination = degToRad(23.45 * Math.sin(degToRad((360 * (284 + n)) / 365)));
  const hourAngle = degToRad(15 * (numberOr(hour, 12) - 12));
  const sinElevation = Math.sin(latRad) * Math.sin(declination) + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const elevationRad = Math.asin(clamp(sinElevation, -1, 1));
  const cosAz = (Math.sin(declination) - Math.sin(elevationRad) * Math.sin(latRad)) / Math.max(0.0001, Math.cos(elevationRad) * Math.cos(latRad));
  let azimuthDeg = radToDeg(Math.acos(clamp(cosAz, -1, 1)));
  if (hour > 12) azimuthDeg = 360 - azimuthDeg;
  return {
    elevationDeg: round(radToDeg(elevationRad), 2),
    azimuthDeg: round(azimuthDeg, 2),
  };
}

export function calculatePlaneOfArrayIrradiance({ ghi = 650, tiltDeg = 30, surfaceAzimuthDeg = 180, sunElevationDeg = 35, sunAzimuthDeg = 180 }) {
  if (sunElevationDeg <= 0) return 0;
  const tilt = degToRad(tiltDeg);
  const sunZenith = degToRad(90 - sunElevationDeg);
  const azimuthDelta = degToRad(sunAzimuthDeg - surfaceAzimuthDeg);
  const incidenceCos = Math.cos(sunZenith) * Math.cos(tilt) + Math.sin(sunZenith) * Math.sin(tilt) * Math.cos(azimuthDelta);
  const beam = ghi * Math.max(0, incidenceCos) / Math.max(0.08, Math.sin(degToRad(sunElevationDeg)));
  const diffuse = ghi * 0.16 * (1 + Math.cos(tilt)) / 2;
  const ground = ghi * 0.2 * (1 - Math.cos(tilt)) / 2;
  return round(Math.max(0, beam * 0.78 + diffuse + ground), 1);
}

function panelRect(panel = {}) {
  return {
    x1: numberOr(panel.xM),
    y1: numberOr(panel.yM),
    x2: numberOr(panel.xM) + numberOr(panel.widthM, 1),
    y2: numberOr(panel.yM) + numberOr(panel.heightM, 1),
  };
}

function obstacleRect(obstacle = {}) {
  return {
    x1: numberOr(obstacle.xM),
    y1: numberOr(obstacle.yM),
    x2: numberOr(obstacle.xM) + numberOr(obstacle.widthM, 0.6),
    y2: numberOr(obstacle.yM) + numberOr(obstacle.depthM, obstacle.heightM || 0.6),
    heightM: numberOr(obstacle.heightM, 1),
  };
}

function overlapArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const yOverlap = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return xOverlap * yOverlap;
}

export function calculatePanelShadingLoss({ panel, roofSurface, obstacles = [], sunElevationDeg, sunAzimuthDeg }) {
  if (sunElevationDeg <= 3 || !panel) return 1;
  const p = panelRect(panel);
  const panelArea = Math.max(0.01, numberOr(panel.widthM, 1) * numberOr(panel.heightM, 1));
  const sunAngle = degToRad(sunAzimuthDeg - numberOr(roofSurface?.orientationDeg, 180));
  const shadowLengthFactor = 1 / Math.max(0.16, Math.tan(degToRad(sunElevationDeg)));
  let shadedArea = 0;

  obstacles.filter((obstacle) => !obstacle.roofSurfaceId || obstacle.roofSurfaceId === roofSurface?.id).forEach((obstacle) => {
    const o = obstacleRect(obstacle);
    const dx = -Math.sin(sunAngle) * o.heightM * shadowLengthFactor;
    const dy = -Math.cos(sunAngle) * o.heightM * shadowLengthFactor;
    const shadow = {
      x1: Math.min(o.x1, o.x1 + dx, o.x2, o.x2 + dx),
      y1: Math.min(o.y1, o.y1 + dy, o.y2, o.y2 + dy),
      x2: Math.max(o.x1, o.x1 + dx, o.x2, o.x2 + dx),
      y2: Math.max(o.y1, o.y1 + dy, o.y2, o.y2 + dy),
    };
    shadedArea += overlapArea(p, shadow);
  });

  return clamp(shadedArea / panelArea, 0, 0.95);
}

const monthFactor = [0.22, 0.37, 0.62, 0.82, 1.0, 1.08, 1.05, 0.9, 0.68, 0.43, 0.25, 0.18];
const weatherFactor = { sunny: 1, light_clouds: 0.78, cloudy: 0.52, rain: 0.28 };

export function runHourlyPvSimulation({ project, roofSurfaces = [], latitude = 59.33 }) {
  const panelModel = project?.panelModel || {};
  const panelAreaM2 = (numberOr(panelModel.widthMm, 1134) / 1000) * (numberOr(panelModel.heightMm, 1722) / 1000);
  const powerWp = numberOr(panelModel.powerWp, 440);
  const efficiency = clamp(powerWp / Math.max(1, panelAreaM2 * 1000), 0.08, 0.26);
  const gamma = Math.abs(numberOr(panelModel.tempCoeffPmaxPercentPerC, -0.35)) / 100;
  const weather = project?.weatherScenario?.weather || 'sunny';
  const annualHours = [];
  const monthlyKwh = Array.from({ length: 12 }, () => 0);
  let totalUnshadedKwh = 0;
  let totalShadedKwh = 0;
  let clippedKwh = 0;

  for (let month = 1; month <= 12; month += 1) {
    for (let hour = 5; hour <= 21; hour += 1) {
      const sun = calculateSolarPosition({ latitude, month, hour });
      const ghi = Math.max(0, 870 * monthFactor[month - 1] * Math.sin(degToRad(Math.max(0, sun.elevationDeg))) * (weatherFactor[weather] || 1));
      let hourUnshadedKwh = 0;
      let hourShadedKwh = 0;
      let panelCount = 0;
      let averageShading = 0;

      (project?.panelGroups || []).forEach((group) => {
        const roofSurface = roofSurfaces.find((surface) => surface.id === group.roofSurfaceId) || roofSurfaces[0] || {};
        const poa = calculatePlaneOfArrayIrradiance({
          ghi,
          tiltDeg: roofSurface.tiltDeg ?? project?.building?.roofPitchDeg ?? 30,
          surfaceAzimuthDeg: roofSurface.orientationDeg ?? project?.building?.azimuthDeg ?? 180,
          sunElevationDeg: sun.elevationDeg,
          sunAzimuthDeg: sun.azimuthDeg,
        });
        normalizePanelGroupPanels(group, panelModel).forEach((panel) => {
          const cellTempC = numberOr(project?.weatherScenario?.ambientTempC, 20) + (poa / 800) * 24;
          const tempFactor = 1 - gamma * (cellTempC - 25);
          const unshadedKw = (poa * panelAreaM2 * efficiency * tempFactor) / 1000;
          const shadingLoss = calculatePanelShadingLoss({ panel, roofSurface, obstacles: project?.obstacles || [], sunElevationDeg: sun.elevationDeg, sunAzimuthDeg: sun.azimuthDeg });
          hourUnshadedKwh += Math.max(0, unshadedKw);
          hourShadedKwh += Math.max(0, unshadedKw * (1 - shadingLoss));
          averageShading += shadingLoss;
          panelCount += 1;
        });
      });

      const inverterLimitKw = Math.max(0.1, numberOr(project?.inverterModel?.maxDcPowerW, 15000) / 1000);
      const clippedHourKwh = Math.max(0, hourShadedKwh - inverterLimitKw);
      const finalHourKwh = Math.min(hourShadedKwh, inverterLimitKw);
      const weightedMonthly = finalHourKwh * 30.4;
      monthlyKwh[month - 1] += weightedMonthly;
      totalUnshadedKwh += hourUnshadedKwh * 30.4;
      totalShadedKwh += finalHourKwh * 30.4;
      clippedKwh += clippedHourKwh * 30.4;
      annualHours.push({
        month,
        hour,
        sunElevationDeg: sun.elevationDeg,
        sunAzimuthDeg: sun.azimuthDeg,
        ghi: round(ghi, 1),
        kwh: round(finalHourKwh, 3),
        shadingLossPercent: panelCount ? round((averageShading / panelCount) * 100, 2) : 0,
      });
    }
  }

  return {
    annualKwh: round(totalShadedKwh, 0),
    unshadedAnnualKwh: round(totalUnshadedKwh, 0),
    monthlyKwh: monthlyKwh.map((value) => round(value, 0)),
    shadingLossPercent: totalUnshadedKwh > 0 ? round((1 - totalShadedKwh / totalUnshadedKwh) * 100, 2) : 0,
    clippingLossKwh: round(clippedKwh, 0),
    sampleHours: annualHours.filter((item) => [3, 6, 9, 12].includes(item.month) && [9, 12, 15].includes(item.hour)),
  };
}

export function simulateBatterySoc({ monthlyKwh = [], annualLoadKwh = 18000, capacityKwh = 10, maxPowerKw = 5, roundTripEfficiency = 0.9, initialSocPercent = 40 }) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const capacity = Math.max(0.1, numberOr(capacityKwh, 10));
  const maxPower = Math.max(0.1, numberOr(maxPowerKw, 5));
  const eta = Math.sqrt(clamp(numberOr(roundTripEfficiency, 0.9), 0.5, 1));
  const dailyLoad = Math.max(0, numberOr(annualLoadKwh, 18000)) / 365;
  let soc = capacity * clamp(numberOr(initialSocPercent, 40), 0, 100) / 100;
  const points = [];
  let selfConsumedKwh = 0;
  let exportedKwh = 0;
  let importedKwh = 0;

  monthlyKwh.forEach((monthEnergy, monthIndex) => {
    const dailyPv = Math.max(0, numberOr(monthEnergy)) / days[monthIndex];
    for (let day = 1; day <= days[monthIndex]; day += 1) {
      const pvDayProfile = [0, 0, 0, 0, 0, 0.03, 0.08, 0.16, 0.29, 0.45, 0.62, 0.78, 0.88, 0.82, 0.66, 0.46, 0.27, 0.12, 0.04, 0, 0, 0, 0, 0];
      const pvProfileSum = pvDayProfile.reduce((sum, item) => sum + item, 0) || 1;
      for (let hour = 0; hour < 24; hour += 1) {
        const loadFactor = hour < 6 ? 0.55 : hour < 9 ? 1.1 : hour < 16 ? 0.72 : hour < 22 ? 1.34 : 0.82;
        const loadKwh = (dailyLoad / 24) * loadFactor;
        const pvKwh = dailyPv * (pvDayProfile[hour] / pvProfileSum);
        const surplus = pvKwh - loadKwh;
        if (surplus >= 0) {
          const charge = Math.min(surplus * eta, maxPower, capacity - soc);
          soc += charge;
          selfConsumedKwh += loadKwh;
          exportedKwh += Math.max(0, surplus - charge / eta);
        } else {
          const discharge = Math.min(Math.abs(surplus) / eta, maxPower, soc);
          soc -= discharge;
          selfConsumedKwh += pvKwh + discharge * eta;
          importedKwh += Math.max(0, Math.abs(surplus) - discharge * eta);
        }
      }
      points.push({ month: monthIndex + 1, day, socKwh: round(soc, 2), socPercent: round((soc / capacity) * 100, 1) });
    }
  });

  return {
    points,
    finalSocKwh: round(soc, 2),
    finalSocPercent: round((soc / capacity) * 100, 1),
    selfConsumedKwh: round(selfConsumedKwh, 0),
    exportedKwh: round(exportedKwh, 0),
    importedKwh: round(importedKwh, 0),
    selfConsumptionPercent: round((selfConsumedKwh / Math.max(1, monthlyKwh.reduce((sum, item) => sum + numberOr(item), 0))) * 100, 1),
  };
}

export function buildPvReportText({ project, pvSimulation, batterySimulation, strings }) {
  const lines = [];
  lines.push('SOLARPLAN PROJEKTERINGSRAPPORT');
  lines.push('================================');
  lines.push(`Projekt: ${project?.name || '-'}`);
  lines.push(`Kund: ${project?.customerName || '-'}`);
  lines.push(`Adress: ${project?.address || '-'}`);
  lines.push(`Skapad: ${new Date().toLocaleString('sv-SE')}`);
  lines.push('');
  lines.push('BYGGNAD');
  lines.push(`Taktyp: ${project?.building?.roofType || '-'}`);
  lines.push(`Längd/bredd: ${numberOr(project?.building?.lengthM)} m x ${numberOr(project?.building?.widthM)} m`);
  lines.push(`Takfot/nock: ${numberOr(project?.building?.heightM)} m / lutning ${numberOr(project?.building?.roofPitchDeg)}°`);
  lines.push('');
  lines.push('PV-SIMULERING');
  lines.push(`Årsproduktion: ${formatKwh(pvSimulation?.annualKwh)} kWh`);
  lines.push(`Oskuggad årsproduktion: ${formatKwh(pvSimulation?.unshadedAnnualKwh)} kWh`);
  lines.push(`Skuggförlust: ${numberOr(pvSimulation?.shadingLossPercent).toFixed(1)} %`);
  lines.push(`Clipping: ${formatKwh(pvSimulation?.clippingLossKwh)} kWh`);
  lines.push('');
  lines.push('MÅNADSPRODUKTION');
  (pvSimulation?.monthlyKwh || []).forEach((value, index) => lines.push(`${index + 1}: ${formatKwh(value)} kWh`));
  lines.push('');
  lines.push('BATTERI');
  lines.push(`Slut-SoC: ${numberOr(batterySimulation?.finalSocPercent).toFixed(1)} %`);
  lines.push(`Självanvändning: ${numberOr(batterySimulation?.selfConsumptionPercent).toFixed(1)} %`);
  lines.push(`Import: ${formatKwh(batterySimulation?.importedKwh)} kWh`);
  lines.push(`Export: ${formatKwh(batterySimulation?.exportedKwh)} kWh`);
  lines.push('');
  lines.push('STRÄNGKONTROLL');
  (strings || []).forEach((item, index) => {
    lines.push(`Sträng ${index + 1}: MPPT ${item.mpptIndex}, ${item.panelCount} paneler, Voc ${numberOr(item.calculatedVocCold).toFixed(0)} V, status ${item.status}`);
    (item.messages || []).forEach((message) => lines.push(`  - ${message}`));
  });
  return lines.join('\n');
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
