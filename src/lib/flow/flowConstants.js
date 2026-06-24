// Validerade/härledda konstanter ur Nordmount-manualer + Planner-rapporter.
export const FLOW = {
  tiltDeg: 10,                       // panellutning Tower/Wing
  frictionCoefficient: 0.6,          // KÄLLA: Planner-rapport (ej manual)
  sideGapMm: 20,                     // bekräftat 2 vägar (klämma + bredd)
  // Parallellt ballasterat
  parallelDockPositionsMm: [730, 980, 1110],   // Flow Dock fasta hållägen
  parallelMaxRailOverhangMm: 350,
  parallelEndCapOverhangMinMm: 35,
  parallelEndCapOverhangMaxMm: 63,
  // Öst/väst (härlett ur Terräng-4-rapport, Tak 2, 20 paneler)
  eastWestValleyGapMm: 240,
  eastWestNockGapMm: 31.5,
  // Snö – gFlow validerat ENBART vid 5° takvinkel
  snowGByRoofAngle: { 5: 1.24 },
};

// Tillåtna panelbredder för Tower/Wing (mm)
export const FLOW_PANEL_WIDTH_RANGES = [
  { mode: 1, minMm: 984,  maxMm: 1040 },
  { mode: 2, minMm: 1118, maxMm: 1174 },
];

// Produktdata (mått i mm, vikt i kg)
export const FLOW_PRODUCTS = {
  tower:  { article: '8000', name: 'NM Flow Tower',  L: 734,   W: 283,  H: 249,  kg: 3.200 },
  wing:   { article: '8001', name: 'NM Flow Wing',   L: 950,   W: 283,  H: 67.5, kg: 3.000 },
  link:   { article: '8002', name: 'NM Flow Link',   L: 117.5, W: 55.8, H: 60,   kg: 0.176 }, // mittklämma ÖV/syd
  clamp:  { article: '8003', name: 'NM Flow Clamp',  L: 60,    W: 60,   H: 32.3, kg: 0.111 }, // ändklämma ÖV/syd
  setter: { article: '8011', name: 'NM Flow Setter', L: 2000,  W: 40,   H: 75,   kg: 1.300 },
  // Parallellt använder Hyper Mid/End Clamp i stället för Link/Clamp:
  hyperClamp: { article: '3132', name: 'NM Hyper Mid/End Clamp', L: 117.5, W: 55.8, H: 60, kg: 0.176 },
};

// Vind cp,net per zon (terräng-/orienteringsoberoende; qp bär terrängen)
export const FLOW_CP = {
  parallel: {
    roofEdge_panelEdge:   -0.395,
    roofMid_panelEdge:    -0.304,
    roofEdge_panelMid:    -0.263,
    roofMid_panelMid:     -0.202,
  },
  eastwest: {
    roofEdge_panelEdge:   -0.329,
    roofMid_panelEdge:    -0.253,
    roofEdge_panelMid:    -0.132,
    roofMid_panelMid:     -0.102,
  },
};

export const FLOW_BRANCHES = {
  flow_parallel_ballasted:  { uses: ['wing','dock','hyperRail','hyperClamp'], tower: false, status: 'verified'   },
  flow_east_west_ballasted: { uses: ['tower','wing','link','clamp','setter'], tower: true,  status: 'derived'    },
  flow_south_ballasted:     { uses: ['tower','wing','clamp','setter'],        tower: true,  status: 'needs_data' },
  flow_welded_hybrid:       { uses: ['hyperPlate','flowPad','hyperRail'],     tower: false, status: 'blocked'    },
};
