import { createDefaultLocationData } from './dataSourceAdapters';

const now = () => new Date().toISOString();

export const SOLARPLAN_3D_STORAGE_VERSION = 1;

const numberOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value, 0) * factor) / factor;
};

const normalizeDeg = (value) => ((numberOr(value, 0) % 360) + 360) % 360;

export const deriveRoofSurfacesFromBuilding = (building = {}) => {
  const lengthM = Math.max(1, numberOr(building.lengthM, 12));
  const widthM = Math.max(1, numberOr(building.widthM, 8));
  const pitchDeg = Math.max(0, Math.min(75, numberOr(building.roofPitchDeg, 27)));
  const roofType = building.roofType || 'gable';
  const azimuthDeg = normalizeDeg(building.azimuthDeg ?? 180);
  const ridgeDirectionDeg = normalizeDeg(building.ridgeDirectionDeg ?? 90);
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const slopeLength = (runM) => runM / Math.max(0.18, Math.cos(pitchRad));
  const usable = (area) => round(area * 0.82, 1);
  const surface = (id, name, orientationDeg, tiltDeg, width, height, area) => ({
    id,
    name,
    orientationDeg: round(normalizeDeg(orientationDeg), 0),
    tiltDeg: round(tiltDeg, 0),
    widthM: round(width, 2),
    heightM: round(height, 2),
    usableAreaM2: usable(area),
    excludedZones: [],
  });

  if (roofType === 'flat') return [surface('roof-flat', 'Platt takyta', azimuthDeg, 0, lengthM, widthM, lengthM * widthM)];
  if (roofType === 'single_slope') {
    const roofDepth = slopeLength(widthM);
    return [surface('roof-single-slope', 'Pulpettak', azimuthDeg, pitchDeg, lengthM, roofDepth, lengthM * roofDepth)];
  }
  if (roofType === 'hip') {
    const run = widthM / 2;
    const slopedDepth = slopeLength(run);
    const mainRidgeLength = Math.max(0.1, lengthM - widthM);
    const sideArea = ((lengthM + mainRidgeLength) / 2) * slopedDepth;
    const endArea = (widthM * slopedDepth) / 2;
    return [
      surface('roof-hip-a', 'Valmat takyta A', ridgeDirectionDeg + 90, pitchDeg, lengthM, slopedDepth, sideArea),
      surface('roof-hip-b', 'Valmat takyta B', ridgeDirectionDeg + 270, pitchDeg, lengthM, slopedDepth, sideArea),
      surface('roof-hip-c', 'Valm gavel 1', ridgeDirectionDeg, pitchDeg, widthM, slopedDepth, endArea),
      surface('roof-hip-d', 'Valm gavel 2', ridgeDirectionDeg + 180, pitchDeg, widthM, slopedDepth, endArea),
    ];
  }

  const gableDepth = slopeLength(widthM / 2);
  return [
    surface('roof-gable-a', 'Sadeltak sida A', ridgeDirectionDeg + 90, pitchDeg, lengthM, gableDepth, lengthM * gableDepth),
    surface('roof-gable-b', 'Sadeltak sida B', ridgeDirectionDeg + 270, pitchDeg, lengthM, gableDepth, lengthM * gableDepth),
  ];
};

export const createSolarProject3D = (overrides = {}) => {
  const timestamp = now();
  const id = overrides.id || `solarplan-3d-${Date.now()}`;
  const building = {
    lengthM: 12,
    widthM: 8,
    heightM: 4.2,
    roofType: 'gable',
    roofPitchDeg: 27,
    azimuthDeg: 180,
    ridgeDirectionDeg: 90,
    ...(overrides.building || {}),
  };
  const roofSurfaces = overrides.roofSurfaces || deriveRoofSurfacesFromBuilding(building);

  return {
    id,
    name: overrides.name || 'Nytt 3D-projekt',
    customerName: overrides.customerName || '',
    address: overrides.address || '',
    gridArea: overrides.gridArea || '',
    projectType: overrides.projectType || 'new_system',
    createdAt: overrides.createdAt || timestamp,
    updatedAt: overrides.updatedAt || timestamp,
    building,
    roofSurfaces,
    locationData: createDefaultLocationData(overrides.locationData || {}),
    obstacles: overrides.obstacles || [],
    panelModel: {
      id: 'panel-standard',
      manufacturer: 'Generic',
      model: '440 W Standard',
      powerWp: 440,
      widthMm: 1134,
      heightMm: 1722,
      voc: 41,
      vmp: 34,
      isc: 13.5,
      imp: 12.9,
      tempCoeffVocPercentPerC: -0.28,
      tempCoeffPmaxPercentPerC: -0.35,
      ...(overrides.panelModel || {}),
    },
    panelGroups: overrides.panelGroups || [
      {
        id: 'panel-group-1',
        roofSurfaceId: roofSurfaces[0]?.id || 'roof-1',
        name: 'Panelgrupp 1',
        orientation: 'portrait',
        panelCount: 0,
        rows: 0,
        columns: 0,
        startXM: 0.7,
        startYM: 0.7,
        spacingMm: 30,
        edgeMarginMm: 300,
        isParallelWithGroupIds: [],
        usedAreaM2: 0,
        panels: [],
        panelModelId: 'panel-standard',
      },
    ],
    inverterModel: {
      id: 'inverter-standard',
      manufacturer: 'Generic',
      model: 'Hybrid 10 kW',
      maxDcVoltage: 1000,
      startupVoltage: 150,
      mpptVoltageMin: 180,
      mpptVoltageMax: 850,
      maxCurrentPerMppt: 16,
      maxShortCircuitCurrentPerMppt: 20,
      maxDcPowerW: 15000,
      mpptCount: 2,
      stringsPerMppt: 2,
      ...(overrides.inverterModel || {}),
    },
    strings: overrides.strings || [
      {
        id: 'string-1',
        mpptIndex: 1,
        panelGroupId: 'panel-group-1',
        panelCount: 0,
        parallelGroupIds: [],
        calculatedVocCold: 0,
        calculatedVmpOperating: 0,
        calculatedIsc: 0,
        calculatedDcPowerW: 0,
        status: 'warning',
        messages: ['Välj panelgrupp och antal paneler i serie.'],
      },
    ],
    stringTemperatureScenario: {
      coldTempC: -20,
      operatingTempC: 45,
      ...(overrides.stringTemperatureScenario || {}),
    },
    weatherScenario: {
      month: 6,
      hour: 12,
      weather: 'sunny',
      ambientTempC: 20,
      ...(overrides.weatherScenario || {}),
    },
    productionEstimate: {
      annualKwh: 0,
      monthlyKwh: Array.from({ length: 12 }, () => 0),
      specificYieldKwhPerKwpYear: 900,
      installedKwp: 0,
      grossAnnualKwh: 0,
      netAfterLossesKwh: 0,
      shadingLossPercent: 0,
      weatherLossPercent: 0,
      temperatureLossPercent: 0,
      selfConsumptionPercent: 50,
      ...(overrides.productionEstimate || {}),
    },
    economics: {
      annualElectricityConsumptionKwh: 18000,
      electricityPriceSekKwh: 1.5,
      gridFeeSekKwh: 0.45,
      taxesAndFeesSekKwh: 0.55,
      totalElectricityCostSekKwh: 2.5,
      sellPriceSekKwh: 0.6,
      selfConsumptionPercent: 50,
      adjustedSelfConsumptionPercent: 50,
      annualProductionKwh: 0,
      selfConsumedKwh: 0,
      soldSurplusKwh: 0,
      selfConsumptionSavingsSek: 0,
      soldElectricityRevenueSek: 0,
      totalSolarBenefitSek: 0,
      systemCostSek: 0,
      greenDeductionSek: 0,
      netSystemCostSek: 0,
      annualSavingsSek: 0,
      paybackYears: 0,
      includeBattery: false,
      batteryCapacityKwh: 0,
      batteryCostSek: 0,
      batterySelfConsumptionIncreasePercent: 15,
      adjustedAnnualBenefitSek: 0,
      ...(overrides.economics || {}),
      heatPumpReplacement: {
        currentHeatingConsumptionKwh: 0,
        currentCOP: 1,
        newCOP: 3,
        electricityCostSekKwh: 2.5,
        investmentSek: 0,
        newConsumptionKwh: 0,
        savedKwh: 0,
        savedSek: 0,
        paybackYears: 0,
        ...(overrides.economics?.heatPumpReplacement || {}),
      },
    },
    reportSettings: {
      include3DImage: true,
      includePanelLayout: true,
      includeStringDiagram: true,
      includeMaterialList: true,
      includeEconomics: true,
      ...(overrides.reportSettings || {}),
    },
  };
};

export const normalizeSolarProject3D = (project) => {
  if (!project || typeof project !== 'object') return createSolarProject3D();
  return createSolarProject3D({
    ...project,
    building: project.building || {},
    roofSurfaces: Array.isArray(project.roofSurfaces) ? project.roofSurfaces : undefined,
    locationData: project.locationData || {},
    obstacles: Array.isArray(project.obstacles) ? project.obstacles : undefined,
    panelModel: project.panelModel || {},
    panelGroups: Array.isArray(project.panelGroups) ? project.panelGroups : undefined,
    inverterModel: project.inverterModel || {},
    strings: Array.isArray(project.strings) ? project.strings : undefined,
    stringTemperatureScenario: project.stringTemperatureScenario || {},
    weatherScenario: project.weatherScenario || {},
    productionEstimate: project.productionEstimate || {},
    economics: project.economics || {},
    reportSettings: project.reportSettings || {},
  });
};

export const touchSolarProject3D = (project) => ({
  ...normalizeSolarProject3D(project),
  updatedAt: now(),
});

export const createPersistedSolarProject3D = (project) => ({
  version: SOLARPLAN_3D_STORAGE_VERSION,
  project: touchSolarProject3D(project),
});
