import {
  calculateNordmountRoof as calculateLegacyNordmountRoof,
  isNordmountProduct,
} from '@/lib/mountingEngines/nordmount';

const AIR_DENSITY = 1.25;
const CP_MID = -0.58;
const CP_EDGE = -2.32;
const MATERIAL_MARGIN = 1.03;
const FASTENER_DESIGN_RESISTANCE_N = 3036;
const STANDARD_CC_M = 1.0;
const MAX_CC_TILE_M = 1.2;
const MAX_CC_FELT_M = 2.4;
const FASTENER_END_OFFSET_M = 0.11;
const RAIL_PIECE_LENGTH_M = 2.4;

const TERRAIN = {
  '0': { z0: 0.003, zmin: 1 },
  I: { z0: 0.01, zmin: 1 },
  II: { z0: 0.05, zmin: 2 },
  III: { z0: 0.3, zmin: 5 },
  IV: { z0: 1.0, zmin: 10 },
};

const G_TABLE = [
  { a: 15, g: 1.503 },
  { a: 18, g: 1.539 },
  { a: 25, g: 1.448 },
  { a: 30, g: 1.186 },
  { a: 35, g: 1.122 },
  { a: 45, g: 0.969 },
];

const UNIT_WEIGHTS_KG = {
  fastener: 58.62 / 60,
  rail: 84.72 / 24,
  joint: 6.9 / 23,
  screw: 1.21 / 212,
  clamp: 12.15 / 54,
  endCap: 0.42 / 12,
};

const MATERIAL_PRODUCTS = {
  fastener: { article: '1357', name: 'NM Hyper Meta Läktfäste / Råspontfäste', eNumber: '2741659' },
  rail: { article: '1916', name: 'NM Hyper Rail Skena', eNumber: '2741825' },
  joint: { article: '1919', name: 'NM Hyper Joint Rail Skenskarv', eNumber: '2740970' },
  screw: { article: '63190300', name: 'NM Screw (Silver) Plåtskruv', eNumber: '1533849' },
  clamp: { article: '3132', name: 'NM Hyper Mid/End Clamp Clips', eNumber: '2740965' },
  endCap: { article: '2919', name: 'NM Hyper End Cap Ändlock', eNumber: '2740963' },
};

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const round = (value, decimals = 2) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const normalize = value => String(value || '').trim().toLowerCase();

export { isNordmountProduct };

function snowShapeFactor(angleDeg) {
  const angle = Number(angleDeg);
  if (angle <= 30) return 0.8;
  if (angle < 60) return 0.8 * (60 - angle) / 30;
  return 0;
}

function snowSurcharge(angleDeg) {
  const angle = Number(angleDeg);
  if (angle <= G_TABLE[0].a) return { g: G_TABLE[0].g, preliminary: angle < G_TABLE[0].a };
  const last = G_TABLE[G_TABLE.length - 1];
  if (angle >= last.a) return { g: last.g, preliminary: angle > last.a };

  for (let index = 0; index < G_TABLE.length - 1; index += 1) {
    const start = G_TABLE[index];
    const end = G_TABLE[index + 1];
    if (angle >= start.a && angle <= end.a) {
      const interpolation = (angle - start.a) / (end.a - start.a);
      return {
        g: start.g + interpolation * (end.g - start.g),
        preliminary: false,
      };
    }
  }
  return { g: 1, preliminary: true };
}

export function calculateNordmountSnowLoad({ groundSnowKnM2, roofAngleDeg }) {
  const mu1 = snowShapeFactor(roofAngleDeg);
  const { g, preliminary } = snowSurcharge(roofAngleDeg);
  const eurocodePa = positive(groundSnowKnM2) * 1000 * mu1;
  return {
    mu1: round(mu1, 3),
    surchargeFactor: round(g, 4),
    eurocodePa: round(eurocodePa),
    designPa: round(eurocodePa * g),
    preliminary,
  };
}

function peakVelocityPressurePa(referenceWindMs, ridgeHeightM, terrainType) {
  const terrain = TERRAIN[String(terrainType)] || TERRAIN.II;
  const z = Math.max(Number(ridgeHeightM) || terrain.zmin, terrain.zmin);
  const kr = 0.19 * Math.pow(terrain.z0 / 0.05, 0.07);
  const logarithm = Math.log(z / terrain.z0);
  const cr = kr * logarithm;
  const meanWindMs = cr * positive(referenceWindMs);
  const turbulenceIntensity = 1 / logarithm;
  return {
    z,
    cr,
    meanWindMs,
    turbulenceIntensity,
    peakPressurePa: (1 + 7 * turbulenceIntensity) * 0.5 * AIR_DENSITY * meanWindMs * meanWindMs,
  };
}

export function calculateNordmountWindLoad({
  referenceWindMs,
  ridgeHeightM,
  terrainCategory = 'II',
}) {
  const pressure = peakVelocityPressurePa(referenceWindMs, ridgeHeightM, terrainCategory);
  return {
    supported: true,
    terrainCategory,
    referenceWindMs: positive(referenceWindMs),
    calculationHeightM: pressure.z,
    qbPa: round(0.5 * AIR_DENSITY * positive(referenceWindMs) ** 2),
    roughnessFactor: round(pressure.cr, 4),
    turbulenceIntensity: round(pressure.turbulenceIntensity, 4),
    meanWindMs: round(pressure.meanWindMs, 2),
    peakPressurePa: round(pressure.peakPressurePa),
    middleCoefficient: CP_MID,
    edgeCoefficient: CP_EDGE,
    middlePa: round(CP_MID * pressure.peakPressurePa),
    edgePa: round(CP_EDGE * pressure.peakPressurePa),
  };
}

function isBallastSystem(systemVariant, mountingProduct = {}, config = {}) {
  const text = [
    systemVariant,
    config.mountingType,
    config.attachmentMethod,
    mountingProduct.name,
    mountingProduct.model,
  ].map(normalize).join(' ');
  return ['ballast', 'duktak', 'duk tak', 'flat roof', 'platt tak'].some(token => text.includes(token));
}

function isFeltRoof(config = {}, roof = {}) {
  return normalize(config.attachmentMethod || roof.roofType || roof.material).includes('papp');
}

function positionZone({ xM, yM }, roof, zones) {
  const edge = xM <= zones.gableM
    || xM >= positive(roof.widthM) - zones.gableM
    || yM <= zones.eaveRidgeM
    || yM >= positive(roof.roofFallM) - zones.eaveRidgeM;
  return edge ? 'edge' : 'middle';
}

function placeFasteners(line, roof, zones, loads, config) {
  const maxCcM = isFeltRoof(config, roof) ? MAX_CC_FELT_M : MAX_CC_TILE_M;
  const preferredCcM = isFeltRoof(config, roof) ? Math.min(2, maxCcM) : STANDARD_CC_M;
  const worstPressurePa = Math.max(loads.snow.designPa, Math.abs(loads.wind.edgePa));
  const capacityCcM = worstPressurePa > 0
    ? 0.95 * FASTENER_DESIGN_RESISTANCE_N / (worstPressurePa * line.tributaryWidthM)
    : preferredCcM;
  const targetCcM = Math.max(0.4, Math.floor(Math.min(maxCcM, preferredCcM, capacityCcM) * 10) / 10);
  const endOffsetM = Math.min(FASTENER_END_OFFSET_M, Math.max(0, line.lengthM / 2));
  const usableM = Math.max(0, line.lengthM - 2 * endOffsetM);
  const intervals = Math.max(1, Math.ceil(usableM / targetCcM));
  const actualCcM = usableM / intervals;
  const fasteners = [];
  let maxUtilization = 0;

  for (let index = 0; index <= intervals; index += 1) {
    const alongM = line.startM + endOffsetM + actualCcM * index;
    const point = line.orientation === 'horizontal'
      ? { xM: alongM, yM: line.coordinateM }
      : { xM: line.coordinateM, yM: alongM };
    const zone = positionZone(point, roof, zones);
    const windPressurePa = Math.abs(zone === 'edge' ? loads.wind.edgePa : loads.wind.middlePa);
    const governingPressurePa = Math.max(loads.snow.designPa, windPressurePa);
    const utilization = governingPressurePa * line.tributaryWidthM * actualCcM / FASTENER_DESIGN_RESISTANCE_N;
    maxUtilization = Math.max(maxUtilization, utilization);
    fasteners.push({
      index: index + 1,
      ...point,
      zone,
      governingPressurePa: round(governingPressurePa),
      utilizationPercent: round(utilization * 100, 1),
    });
  }

  return {
    ...line,
    targetCcM: round(targetCcM, 2),
    actualCcM: round(actualCcM, 3),
    maxCcM,
    endOffsetM: round(endOffsetM, 3),
    maxUtilizationPercent: round(maxUtilization * 100, 1),
    fasteners,
  };
}

function materialRow(type, quantity) {
  const product = MATERIAL_PRODUCTS[type];
  return {
    type,
    productId: `nordmount:${product.article}`,
    articleNumber: product.article,
    eNumber: product.eNumber,
    name: product.name,
    quantity: Math.max(0, Math.ceil(quantity)),
    unit: 'st',
    unitWeightKg: UNIT_WEIGHTS_KG[type],
    totalWeightKg: round(Math.max(0, quantity) * UNIT_WEIGHTS_KG[type], 2),
  };
}

function calculateMaterials(railLines, previousMaterials = {}) {
  const railLengthM = railLines.reduce((sum, line) => sum + line.lengthM, 0);
  const fastenerCount = railLines.reduce((sum, line) => sum + line.fasteners.length, 0);
  const railPieces = Math.ceil(railLengthM * MATERIAL_MARGIN / RAIL_PIECE_LENGTH_M);
  const joints = Math.max(0, railPieces - 1);
  const endClamps = railLines.length * 2;
  const middleClamps = railLines.reduce((sum, line) => sum + Math.max(0, line.panelsAlongLine - 1), 0);
  const clampClips = endClamps + middleClamps;
  const endCaps = railLines.length * 2;
  const screws = fastenerCount * 2 + joints * 4;
  const materials = [
    materialRow('fastener', fastenerCount),
    materialRow('rail', railPieces),
    materialRow('joint', joints),
    materialRow('screw', screws),
    materialRow('clamp', clampClips),
    materialRow('endCap', endCaps),
  ];
  const mountingWeightKg = materials.reduce((sum, item) => sum + item.totalWeightKg, 0);
  const panelWeightKg = positive(previousMaterials.panelWeightKg);
  return {
    ...previousMaterials,
    railLengthM: round(railLengthM, 2),
    railPieceLengthM: RAIL_PIECE_LENGTH_M,
    fastenerCount,
    endClamps,
    middleClamps,
    clampClips,
    railPieces,
    joints,
    screws,
    endCaps,
    materials,
    mountingWeightKg: round(mountingWeightKg, 2),
    panelWeightKg: round(panelWeightKg, 2),
    systemWeightKg: round(mountingWeightKg + panelWeightKg, 2),
  };
}

function panelProfileCheck(profile, snowPa, windEdgePa) {
  if (!profile) return { known: false, approved: false, message: 'Panelens lastklassade klämprofil saknas.' };
  const front = positive(profile.design_load_front_pa, positive(profile.test_load_front_pa));
  const back = positive(profile.design_load_back_pa, positive(profile.test_load_back_pa));
  if (!front || !back) {
    return {
      known: false,
      approved: false,
      message: 'Klämzonen finns men panelens positiva/negativa lastkapacitet saknas.',
    };
  }
  const snowUtilization = snowPa / front;
  const windUtilization = Math.abs(windEdgePa) / back;
  const utilization = Math.max(snowUtilization, windUtilization);
  return {
    known: true,
    approved: utilization <= 1,
    frontCapacityPa: front,
    backCapacityPa: back,
    snowUtilizationPercent: round(snowUtilization * 100, 1),
    windUtilizationPercent: round(windUtilization * 100, 1),
    utilizationPercent: round(utilization * 100, 1),
    message: utilization <= 1
      ? 'Panelens valda klämprofil klarar de beräknade lasterna.'
      : 'Panelens valda klämprofil klarar inte projektets beräknade last.',
  };
}

function blockedResult({ input, message }) {
  return {
    engineId: 'nordmount',
    engineVersion: '2.0.0-validated-parallel-loads',
    systemVariant: normalize(input.config?.systemVariant || input.roof?.mountingSystemVariant || 'parallel'),
    mountingProductId: input.mountingProduct?.id || input.mountingProduct?.product_id || '',
    mountingProductName: [
      input.mountingProduct?.brand,
      input.mountingProduct?.model,
    ].filter(Boolean).join(' ') || input.mountingProduct?.name || 'Nordmount',
    state: 'blocked',
    status: {
      loadsValidated: false,
      preliminaryAngle: false,
      capacityValidated: false,
    },
    errors: [message],
    warnings: [],
    loads: null,
    railLines: [],
    materials: null,
    calculatedAt: new Date().toISOString(),
  };
}

export function calculateNordmountRoof(input = {}) {
  const systemVariant = normalize(input.config?.systemVariant || input.roof?.mountingSystemVariant || 'parallel');
  if (isBallastSystem(systemVariant, input.mountingProduct, input.config)) {
    return blockedResult({ input, message: 'Kräver Nordmounts ballast- och cp-data' });
  }
  if (systemVariant !== 'parallel') {
    return blockedResult({ input, message: 'Kräver Nordmounts Cross-data' });
  }

  const legacy = calculateLegacyNordmountRoof(input);
  const ridgeHeightM = positive(input.config?.ridgeHeightM, positive(input.roof?.ridgeHeightM));
  const terrainCategory = input.config?.terrainCategory || input.roof?.terrainCategory || 'II';
  const snow = calculateNordmountSnowLoad({
    groundSnowKnM2: input.project?.snow_load_kn_m2,
    roofAngleDeg: input.roof?.angleDeg,
  });
  const wind = calculateNordmountWindLoad({
    referenceWindMs: input.project?.wind_load_ms,
    ridgeHeightM,
    terrainCategory,
  });
  const errors = [...(legacy.errors || [])];
  const warnings = [...(legacy.warnings || [])];
  if (snow.preliminary) {
    warnings.push('Taklutningen ligger utanför 15–45°. Snölasten är preliminär.');
  }

  const railLines = (legacy.railLines || []).map(line => placeFasteners(
    line,
    input.roof || {},
    legacy.zones || { gableM: 0, eaveRidgeM: 0 },
    { snow, wind },
    input.config || {},
  ));
  const materials = calculateMaterials(railLines, legacy.materials || {});
  const groupResults = (legacy.groupResults || []).map(group => ({
    ...group,
    profileCheck: panelProfileCheck(group.profileSelection?.profile, snow.designPa, wind.edgePa),
  }));
  const utilizationPercent = railLines.reduce(
    (maximum, line) => Math.max(maximum, line.maxUtilizationPercent),
    0,
  );
  const panelProfilesApproved = groupResults.every(group => group.profileCheck.approved);
  const state = errors.length ? 'blocked' : 'calculated';

  return {
    ...legacy,
    engineVersion: '2.0.0-validated-parallel-loads',
    state,
    status: {
      loadsValidated: !snow.preliminary,
      preliminaryAngle: Boolean(snow.preliminary),
      capacityValidated: false,
    },
    errors,
    warnings,
    loads: { snow, wind },
    groupResults,
    railLines,
    materials,
    utilizationPercent: round(utilizationPercent, 1),
    panelProfilesApproved,
    verification: {
      loadModel: 'Nordmount Parallel 15–45°',
      capacityModel: 'Preliminär – ej tillverkarverifierad',
    },
    calculatedAt: new Date().toISOString(),
  };
}
