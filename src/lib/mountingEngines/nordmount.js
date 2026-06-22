import { productMountingProfiles, resolveProductClampZone } from '@/lib/productDocuments';

const AIR_DENSITY_KG_M3 = 1.25;
const PANEL_GAP_M = 0.02;
const SNOW_POSITION_FACTOR = 1.089;
const MATERIAL_MARGIN = 1.03;
const FASTENER_DESIGN_RESISTANCE_N = 3036;
const RAIL_PIECE_LENGTH_M = 2.4;
const STANDARD_CC_M = 1.0;
const MAX_CC_TILE_M = 1.2;
const MAX_CC_FELT_M = 2.4;
const FASTENER_END_OFFSET_M = 0.11;

const TERRAIN = {
  '0': { z0: 0.003, zMin: 1 },
  I: { z0: 0.01, zMin: 1 },
  II: { z0: 0.05, zMin: 2 },
  III: { z0: 0.3, zMin: 5 },
  IV: { z0: 1.0, zMin: 10 },
};

const NORDMOUNT_COEFFICIENTS = {
  parallel: {
    middle: -0.571464,
    edge: -2.283123,
  },
};

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
const round = (value, decimals = 2) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const positive = (value, fallback = 0) => num(value, fallback) > 0 ? num(value, fallback) : fallback;
const normalize = value => String(value || '').trim().toLowerCase();

export function isNordmountProduct(product = {}) {
  return [product.brand, product.name, product.model]
    .filter(Boolean)
    .some(value => normalize(value).includes('nordmount') || normalize(value).includes('nord mount'));
}

function panelOrientation(group = {}) {
  return normalize(group.orientation).includes('ligg') ? 'landscape' : 'portrait';
}

function panelDimensions(product = {}, orientation = 'portrait') {
  const portrait = {
    widthM: positive(product.width_mm, 1134) / 1000,
    heightM: positive(product.height_mm, 1722) / 1000,
  };
  return orientation === 'landscape'
    ? { widthM: portrait.heightM, heightM: portrait.widthM }
    : portrait;
}

function groupPanelGapM(group = {}, config = {}) {
  const gapMm = positive(group.panelGapMm, positive(config.panelGapMm, PANEL_GAP_M * 1000));
  return gapMm / 1000;
}

function groupGeometry(group = {}, panelProduct = {}, config = {}) {
  const orientation = panelOrientation(group);
  const dimensions = panelDimensions(panelProduct, orientation);
  const rows = Math.max(0, Math.round(num(group.rows)));
  const cols = Math.max(0, Math.round(num(group.cols)));
  const gapM = groupPanelGapM(group, config);
  return {
    orientation,
    rows,
    cols,
    gapM,
    panelWidthM: dimensions.widthM,
    panelHeightM: dimensions.heightM,
    widthM: cols * dimensions.widthM + Math.max(0, cols - 1) * gapM,
    heightM: rows * dimensions.heightM + Math.max(0, rows - 1) * gapM,
    xM: num(group.xM),
    yM: num(group.yM),
    panelCount: rows * cols,
  };
}

function snowShapeCoefficient(angleDeg) {
  const angle = num(angleDeg, 30);
  if (angle <= 30) return 0.8;
  if (angle < 60) return 0.8 * (60 - angle) / 30;
  return 0;
}

export function calculateNordmountSnowLoad({ groundSnowKnM2, roofAngleDeg, exposureCoefficient = 1, thermalCoefficient = 1 }) {
  const mu1 = snowShapeCoefficient(roofAngleDeg);
  const eurocodePa = mu1 * positive(exposureCoefficient, 1) * positive(thermalCoefficient, 1) * positive(groundSnowKnM2) * 1000;
  const positionWeightedPa = eurocodePa * SNOW_POSITION_FACTOR;
  const designPa = positionWeightedPa * MATERIAL_MARGIN;
  return {
    mu1: round(mu1, 3),
    eurocodePa: round(eurocodePa),
    positionFactor: SNOW_POSITION_FACTOR,
    positionWeightedPa: round(positionWeightedPa),
    marginFactor: MATERIAL_MARGIN,
    designPa: round(designPa),
  };
}

export function calculateNordmountWindLoad({ referenceWindMs, ridgeHeightM, terrainCategory = 'II', systemVariant = 'parallel' }) {
  const terrain = TERRAIN[terrainCategory] || TERRAIN.II;
  const vb = positive(referenceWindMs);
  const qb = 0.5 * AIR_DENSITY_KG_M3 * vb ** 2;
  const z = Math.max(positive(ridgeHeightM, terrain.zMin), terrain.zMin);
  const kr = 0.19 * (terrain.z0 / 0.05) ** 0.07;
  const logarithm = Math.log(z / terrain.z0);
  const cr = kr * logarithm;
  const turbulenceIntensity = 1 / logarithm;
  const meanWindMs = cr * vb;
  const peakPressurePa = (1 + 7 * turbulenceIntensity) * 0.5 * AIR_DENSITY_KG_M3 * meanWindMs ** 2;
  const coefficients = NORDMOUNT_COEFFICIENTS[systemVariant];

  if (!coefficients) {
    return {
      supported: false,
      error: `Nordmount ${systemVariant} saknar verifierade vindtunnelkoefficienter i den inlagda datan.`,
      qbPa: round(qb),
      peakPressurePa: round(peakPressurePa),
    };
  }

  return {
    supported: true,
    terrainCategory,
    referenceWindMs: vb,
    calculationHeightM: z,
    qbPa: round(qb),
    roughnessFactor: round(cr, 4),
    turbulenceIntensity: round(turbulenceIntensity, 4),
    meanWindMs: round(meanWindMs, 2),
    peakPressurePa: round(peakPressurePa),
    middleCoefficient: coefficients.middle,
    edgeCoefficient: coefficients.edge,
    middlePa: round(coefficients.middle * peakPressurePa),
    edgePa: round(coefficients.edge * peakPressurePa),
  };
}

function edgeZones(roof = {}, ridgeHeightM) {
  const widthM = positive(roof.widthM);
  const roofFallM = positive(roof.roofFallM);
  const heightM = positive(ridgeHeightM);
  return {
    gableM: round(Math.min(widthM, 2 * heightM) / 10, 2),
    eaveRidgeM: round(Math.min(roofFallM, 2 * heightM) / 10, 2),
  };
}

function selectClampProfile(panelProduct = {}, group = {}, config = {}) {
  const profiles = productMountingProfiles(panelProduct);
  const desiredRailCount = group.threeRails ? 3 : Math.max(2, Math.round(positive(group.railCount, 2)));
  const desiredOrientation = panelOrientation(group);
  const desiredSide = group.clampedFrameSide || config.clampedFrameSide || 'long';
  const desiredDirection = group.railDirectionRelativeToLongFrame || config.railDirectionRelativeToLongFrame || 'cross';

  const compatible = profiles.filter(profile => {
    const orientationOk = !Array.isArray(profile.module_orientations) || profile.module_orientations.includes(desiredOrientation);
    const railCountOk = !profile.rail_count || Number(profile.rail_count) === desiredRailCount;
    const sideOk = !profile.clamped_frame_side || profile.clamped_frame_side === desiredSide;
    const directionOk = !profile.rail_direction_relative_to_long_frame || profile.rail_direction_relative_to_long_frame === desiredDirection;
    return orientationOk && railCountOk && sideOk && directionOk;
  });

  const candidates = compatible.length
    ? compatible
    : profiles.filter(profile => !profile.rail_count || Number(profile.rail_count) === desiredRailCount);

  const selected = [...candidates].sort((first, second) => {
    const firstCapacity = Math.min(positive(first.design_load_front_pa, positive(first.test_load_front_pa)), positive(first.design_load_back_pa, positive(first.test_load_back_pa)));
    const secondCapacity = Math.min(positive(second.design_load_front_pa, positive(second.test_load_front_pa)), positive(second.design_load_back_pa, positive(second.test_load_back_pa)));
    return secondCapacity - firstCapacity;
  })[0] || null;

  if (selected) return { profile: selected, exact: compatible.includes(selected), desiredRailCount, desiredOrientation, desiredSide, desiredDirection };

  const clamp = resolveProductClampZone(panelProduct);
  if (!clamp.hasProductZone) return { profile: null, exact: false, desiredRailCount, desiredOrientation, desiredSide, desiredDirection };
  return {
    exact: false,
    desiredRailCount,
    desiredOrientation,
    desiredSide,
    desiredDirection,
    profile: {
      id: 'generic-product-clamp-zone',
      label: 'Produktens klämzon',
      rail_count: desiredRailCount,
      clamped_frame_side: desiredSide,
      rail_direction_relative_to_long_frame: desiredDirection,
      clamp_zone_min_mm: clamp.minMm,
      clamp_zone_max_mm: clamp.maxMm,
      design_load_front_pa: null,
      design_load_back_pa: null,
      source_document: clamp.source,
    },
  };
}

function railOrientationForProfile(group = {}, profile = {}) {
  const longAxis = panelOrientation(group) === 'portrait' ? 'vertical' : 'horizontal';
  const direction = profile.rail_direction_relative_to_long_frame || group.railDirectionRelativeToLongFrame || 'cross';
  if (direction === 'parallel') return longAxis;
  return longAxis === 'vertical' ? 'horizontal' : 'vertical';
}

function railOffsetsM(railCount, perpendicularPanelM, profile = {}) {
  const minMm = num(profile.clamp_zone_min_mm, null);
  const maxMm = num(profile.clamp_zone_max_mm, null);
  const preferredM = minMm != null && maxMm != null
    ? ((minMm + maxMm) / 2) / 1000
    : perpendicularPanelM / 4;
  const clamped = Math.max(0.05, Math.min(perpendicularPanelM / 2, preferredM));
  if (railCount === 3) return [clamped, perpendicularPanelM / 2, perpendicularPanelM - clamped];
  return [clamped, perpendicularPanelM - clamped];
}

function buildRailLines(group, panelProduct, profileSelection, config) {
  const geometry = groupGeometry(group, panelProduct, config);
  if (!geometry.panelCount || !profileSelection.profile) return [];
  const railCount = profileSelection.desiredRailCount;
  const orientation = railOrientationForProfile(group, profileSelection.profile);
  const perpendicularPanelM = orientation === 'horizontal' ? geometry.panelHeightM : geometry.panelWidthM;
  const offsets = railOffsetsM(railCount, perpendicularPanelM, profileSelection.profile);
  const lines = [];

  if (orientation === 'horizontal') {
    for (let row = 0; row < geometry.rows; row += 1) {
      const panelTopM = geometry.yM + row * (geometry.panelHeightM + geometry.gapM);
      offsets.forEach((offsetM, railIndex) => lines.push({
        id: `${group.id}:r${row}:rail${railIndex}`,
        groupId: group.id,
        groupName: group.name,
        orientation,
        coordinateM: panelTopM + offsetM,
        startM: geometry.xM,
        lengthM: geometry.widthM,
        groupStartPerpendicularM: geometry.yM,
        groupEndPerpendicularM: geometry.yM + geometry.heightM,
        panelsAlongLine: geometry.cols,
        railCount,
      }));
    }
  } else {
    for (let col = 0; col < geometry.cols; col += 1) {
      const panelLeftM = geometry.xM + col * (geometry.panelWidthM + geometry.gapM);
      offsets.forEach((offsetM, railIndex) => lines.push({
        id: `${group.id}:c${col}:rail${railIndex}`,
        groupId: group.id,
        groupName: group.name,
        orientation,
        coordinateM: panelLeftM + offsetM,
        startM: geometry.yM,
        lengthM: geometry.heightM,
        groupStartPerpendicularM: geometry.xM,
        groupEndPerpendicularM: geometry.xM + geometry.widthM,
        panelsAlongLine: geometry.rows,
        railCount,
      }));
    }
  }
  return lines;
}

function addTributaryWidths(lines = []) {
  const byGroupAndOrientation = new Map();
  lines.forEach(line => {
    const key = `${line.groupId}:${line.orientation}`;
    if (!byGroupAndOrientation.has(key)) byGroupAndOrientation.set(key, []);
    byGroupAndOrientation.get(key).push(line);
  });

  const result = [];
  byGroupAndOrientation.forEach(groupLines => {
    const sorted = [...groupLines].sort((a, b) => a.coordinateM - b.coordinateM);
    sorted.forEach((line, index) => {
      const previous = sorted[index - 1];
      const next = sorted[index + 1];
      const lower = previous ? (line.coordinateM - previous.coordinateM) / 2 : line.coordinateM - line.groupStartPerpendicularM;
      const upper = next ? (next.coordinateM - line.coordinateM) / 2 : line.groupEndPerpendicularM - line.coordinateM;
      result.push({ ...line, tributaryWidthM: Math.max(0.05, lower + upper) });
    });
  });
  return result;
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

function calculateMaterials({ railLines, panelCount, panelWeightKg }) {
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
  return {
    panelCount,
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
    panelWeightKg: round(panelCount * positive(panelWeightKg), 2),
    systemWeightKg: round(mountingWeightKg + panelCount * positive(panelWeightKg), 2),
  };
}

function panelProfileCheck(profile, snowPa, windEdgePa) {
  if (!profile) return { known: false, approved: false, message: 'Panelens lastklassade klämprofil saknas.' };
  const front = positive(profile.design_load_front_pa, positive(profile.test_load_front_pa));
  const back = positive(profile.design_load_back_pa, positive(profile.test_load_back_pa));
  if (!front || !back) return { known: false, approved: false, message: 'Klämzonen finns men panelens positiva/negativa lastkapacitet saknas.' };
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
    message: utilization <= 1 ? 'Panelens valda klämprofil klarar de beräknade lasterna.' : 'Panelens valda klämprofil klarar inte projektets beräknade last.',
  };
}

export function calculateNordmountRoof({ project = {}, roof = {}, panelProduct = {}, mountingProduct = {}, config = {} }) {
  const errors = [];
  const warnings = [];
  const ridgeHeightM = positive(config.ridgeHeightM, positive(roof.ridgeHeightM));
  const terrainCategory = config.terrainCategory || roof.terrainCategory || 'II';
  const systemVariant = normalize(config.systemVariant || roof.mountingSystemVariant || 'parallel');
  const groundSnowKnM2 = positive(project.snow_load_kn_m2);
  const referenceWindMs = positive(project.wind_load_ms);

  if (!isNordmountProduct(mountingProduct)) errors.push('Vald produkt identifieras inte som Nordmount.');
  if (!positive(roof.widthM)) errors.push('Takbredd saknas.');
  if (!positive(roof.roofFallM)) errors.push('Takfall saknas.');
  if (!ridgeHeightM) errors.push('Nockhöjd saknas.');
  if (!groundSnowKnM2) errors.push('Projektets snözon saknas.');
  if (!referenceWindMs) errors.push('Projektets referensvindhastighet saknas.');
  if (!['Sadel', 'Pult', 'Sadeltak', 'Pulpettak', 'Rektangel'].some(value => normalize(roof.shape).includes(normalize(value)))) warnings.push('Nordmount-underlaget är verifierat för sadel- och pulpettak. Kontrollera avvikande takgeometri.');

  const snow = calculateNordmountSnowLoad({ groundSnowKnM2, roofAngleDeg: roof.angleDeg });
  const wind = calculateNordmountWindLoad({ referenceWindMs, ridgeHeightM, terrainCategory, systemVariant });
  if (!wind.supported) errors.push(wind.error);
  const zones = edgeZones(roof, ridgeHeightM);

  const groupResults = [];
  let allLines = [];
  let panelCount = 0;
  let weightedPanelWeight = 0;

  (roof.panelGroups || []).forEach(group => {
    const geometry = groupGeometry(group, panelProduct, config);
    if (!geometry.panelCount) return;
    const profileSelection = selectClampProfile(panelProduct, group, config);
    if (!profileSelection.profile) {
      errors.push(`${group.name || 'Panelgrupp'} saknar klämzon/lastprofil i panelprodukten.`);
      return;
    }
    if (profileSelection.desiredRailCount === 3 && Number(profileSelection.profile.rail_count || 0) !== 3) {
      errors.push(`${group.name || 'Panelgrupp'} använder tre skenor men panelprodukten saknar en godkänd treskensprofil.`);
      return;
    }
    if (!profileSelection.exact) warnings.push(`${group.name || 'Panelgrupp'} använder närmaste tillgängliga klämprofil. Kontrollera skenriktning och klämsida.`);
    const lines = buildRailLines(group, panelProduct, profileSelection, config);
    allLines.push(...lines);
    panelCount += geometry.panelCount;
    weightedPanelWeight += geometry.panelCount * positive(panelProduct.weight_kg);
    groupResults.push({
      groupId: group.id,
      groupName: group.name,
      geometry,
      profileSelection,
      profileCheck: panelProfileCheck(profileSelection.profile, snow.designPa, wind.edgePa),
      railLineIds: lines.map(line => line.id),
    });
  });

  if (!panelCount) errors.push('Inga paneler finns utlagda på taket.');
  allLines = addTributaryWidths(allLines);
  const calculatedLines = wind.supported
    ? allLines.map(line => placeFasteners(line, roof, zones, { snow, wind }, config))
    : [];
  const materials = calculateMaterials({
    railLines: calculatedLines,
    panelCount,
    panelWeightKg: panelCount ? weightedPanelWeight / panelCount : positive(panelProduct.weight_kg),
  });
  const utilizationPercent = calculatedLines.reduce((max, line) => Math.max(max, line.maxUtilizationPercent), 0);
  const panelProfilesApproved = groupResults.every(group => group.profileCheck.approved);
  const status = errors.length ? 'blocked' : panelProfilesApproved ? 'approved' : 'warning';

  return {
    engineId: 'nordmount',
    engineVersion: '1.0.0-helgetorp-verified',
    systemVariant,
    mountingProductId: mountingProduct.id || mountingProduct.product_id || '',
    mountingProductName: [mountingProduct.brand, mountingProduct.model].filter(Boolean).join(' ') || mountingProduct.name || 'Nordmount',
    status,
    errors,
    warnings,
    input: {
      roofWidthM: positive(roof.widthM),
      roofFallM: positive(roof.roofFallM),
      ridgeHeightM,
      roofAngleDeg: num(roof.angleDeg),
      roofShape: roof.shape || '',
      roofType: config.attachmentMethod || roof.roofType || roof.material || '',
      terrainCategory,
      groundSnowKnM2,
      referenceWindMs,
      panelGapMm: positive(config.panelGapMm, PANEL_GAP_M * 1000),
    },
    loads: { snow, wind },
    zones,
    groupResults,
    railLines: calculatedLines,
    materials,
    utilizationPercent: round(utilizationPercent, 1),
    panelProfilesApproved,
    rules: {
      maxCcTileM: MAX_CC_TILE_M,
      maxCcFeltM: MAX_CC_FELT_M,
      standardCcM: STANDARD_CC_M,
      maxRailOverhangM: 0.35,
      fastenerAdjustmentM: isFeltRoof(config, roof) ? 0.1 : 0.15,
      screwsPerFastener: 2,
      screwsPerJoint: 4,
      materialMarginPercent: 3,
    },
    verification: {
      reference: 'Nordmount Helgetorp 2026-06-22',
      expected: { snowPa: 1122, windEdgePa: -1670, windMiddlePa: -418, fasteners: 60, rails: 24, joints: 23, screws: 212, clamps: 54, endCaps: 12 },
    },
    calculatedAt: new Date().toISOString(),
  };
}
