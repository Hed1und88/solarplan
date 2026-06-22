export const JA_SOLAR_JAM54D41_440_LB_REVISION = 'ja-solar-jam54d41-440-lb-a16-v1';

const normalize = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[–—]/g, '-');

export function isJaSolarJam54D41_440Lb(product = {}) {
  const name = normalize(product.name);
  const model = normalize(product.model);
  return name === 'ja solar jam54d41-440/lb'
    || model === 'jam54d41-440/lb'
    || model === 'jam54d41-440-lb';
}

export const JA_SOLAR_JAM54D41_440_LB_MOUNTING_PROFILES = [
  {
    id: 'clamp-long-frame-rails-parallel-2',
    label: '2 skenor – skenor parallellt med långramen',
    installation_method: 'clamps',
    module_orientations: ['portrait', 'landscape'],
    clamped_frame_side: 'long',
    rail_direction_relative_to_long_frame: 'parallel',
    rail_count: 2,
    clamp_count: 4,
    position_reference: 'from_short_edge_along_long_frame',
    position_formula: 'S = L/4 ± 50 mm',
    module_length_mm: 1762,
    clamp_zone_min_mm: 390.5,
    clamp_zone_max_mm: 490.5,
    test_load_front_pa: 2400,
    test_load_back_pa: 2400,
    design_load_front_pa: 1600,
    design_load_back_pa: 1600,
    load_notation: '±2400 Pa testlast',
    source_document: 'JA Solar PV Bifacial Double-Glass Modules Installation Manual A/16',
    source_page_pdf: 9,
    source_page_printed: 7,
    source_table: 'Installation position and corresponding static loads – JAM54D41LB (1.6mm glass)',
  },
  {
    id: 'clamp-long-frame-rails-cross-2',
    label: '2 skenor – skenor tvärs långramen',
    installation_method: 'clamps',
    module_orientations: ['portrait', 'landscape'],
    clamped_frame_side: 'long',
    rail_direction_relative_to_long_frame: 'cross',
    rail_count: 2,
    clamp_count: 4,
    position_reference: 'from_short_edge_along_long_frame',
    position_formula: 'S = L/4 ± 50 mm',
    module_length_mm: 1762,
    clamp_zone_min_mm: 390.5,
    clamp_zone_max_mm: 490.5,
    test_load_front_pa: 5400,
    test_load_back_pa: 2400,
    design_load_front_pa: 3600,
    design_load_back_pa: 1600,
    load_notation: '+5400/-2400 Pa testlast',
    source_document: 'JA Solar PV Bifacial Double-Glass Modules Installation Manual A/16',
    source_page_pdf: 9,
    source_page_printed: 7,
    source_table: 'Installation position and corresponding static loads – JAM54D41LB (1.6mm glass)',
  },
];

export const JA_SOLAR_JAM54D41_440_LB_PRODUCT_DATA = {
  category: 'solpanel',
  brand: 'JA Solar',
  model: 'JAM54D41-440/LB',
  power_watts: 440,
  width_mm: 1134,
  height_mm: 1762,
  weight_kg: 22,
  voc_v: 38.9,
  vmp_v: 32.47,
  isc_a: 14.31,
  imp_a: 13.55,
  temp_coeff_pmax_percent_c: -0.29,
  temp_coeff_voc_percent_c: -0.25,
  temp_coeff_isc_percent_c: 0.045,
  noct_c: 45,
  bifacial: true,
};

export const JA_SOLAR_JAM54D41_440_LB_META = {
  clampProfileRevision: JA_SOLAR_JAM54D41_440_LB_REVISION,
  clampZoneMinMm: 390.5,
  clampZoneMaxMm: 490.5,
  railOffsetTopMm: 440.5,
  railOffsetBottomMm: 440.5,
  clampSource: 'JA Solar A/16 s.7: S=L/4±50. Skena parallellt långram: ±2400 Pa. Skena tvärs långram: +5400/-2400 Pa. Testlast; designlast = testlast/1,5.',
  frame_height_mm: 30,
  front_glass_mm: 1.6,
  back_glass_mm: 1.6,
  maximum_static_load_front_pa: 5400,
  maximum_static_load_back_pa: 2400,
  load_values_are_test_loads: true,
  test_to_design_load_factor: 1.5,
  mountingProfiles: JA_SOLAR_JAM54D41_440_LB_MOUNTING_PROFILES,
  clampHardware: {
    minimum_clamp_width_mm: 50,
    minimum_clamp_thickness_mm: 3,
    clamp_material: 'Aluminium 6063-T5',
    bolt: 'Rostfritt M8',
    nut: 'Rostfritt M8',
    washer: 'Rostfritt M8',
    torque_nm_min: 18,
    torque_nm_max: 24,
    frame_overlap_mm_min: 8,
    frame_overlap_mm_max: 12,
    rail_overlap_mm_min: 20,
  },
  threeRailCondition: {
    supported_as_separate_load_profile: false,
    note: 'Manualen anger att mittskenans kant ska ligga 30–50 mm från kopplingsboxens kant när tre horisontella skenor används. Ingen separat lastkapacitet anges för tre skenor i tabellen för JAM54D41LB.',
    source_page_pdf: 9,
    source_page_printed: 7,
  },
  sourceDocuments: [
    {
      type: 'manual',
      name: 'JA Solar PV Bifacial Double-Glass Modules Installation Manual A/16',
      relevant_pages_pdf: [7, 8, 9, 11, 17],
    },
    {
      type: 'datasheet',
      name: 'JA Solar JAM54D41 LB datasheet',
      relevant_pages_pdf: [2],
    },
  ],
};

export function getJaSolarJam54D41MountingProfiles(product = {}) {
  if (!isJaSolarJam54D41_440Lb(product)) return [];
  return JA_SOLAR_JAM54D41_440_LB_MOUNTING_PROFILES;
}

export function jaSolarJam54D41MigrationNeeded(product = {}, meta = {}) {
  if (!isJaSolarJam54D41_440Lb(product)) return false;
  if (meta.clampProfileRevision !== JA_SOLAR_JAM54D41_440_LB_REVISION) return true;
  return Number(product.power_watts) !== 440
    || Number(product.voc_v) !== 38.9
    || Number(product.vmp_v) !== 32.47
    || Number(product.isc_a) !== 14.31
    || Number(product.imp_a) !== 13.55
    || Number(meta.clampZoneMinMm) !== 390.5
    || Number(meta.clampZoneMaxMm) !== 490.5;
}
