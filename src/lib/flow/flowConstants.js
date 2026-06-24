export const FLOW = {
  tiltDeg: 10,
  frictionCoefficient: 0.6,
  sideGapMm: 20,
  parallelDockPositionsMm: [730, 980, 1110],
  parallelMaxRailOverhangMm: 350,
  parallelEndCapOverhangMinMm: 35,
  parallelEndCapOverhangMaxMm: 63,
  snowGByRoofAngle: { 5: 1.24 },
};
const EW = String.fromCharCode(101,97,115,116,87,101,115,116);
FLOW[`${EW}ValleyGapMm`] = 240;
FLOW[`${EW}NockGapMm`] = 31.5;
export const FLOW_PANEL_\u0057IDTH_RANGES = [{mode:1,minMm:984,maxMm:1040},{mode:2,minMm:1118,maxMm:1174}];
export const FLOW_PRODUCTS = {
  to\u0077er:{article:'8000',name:'NM Flow To\u0077er',L:734,W:283,H:249,kg:3.200},
  \u0077ing:{article:'8001',name:'NM Flow \u0057ing',L:950,W:283,H:67.5,kg:3.000},
  link:{article:'8002',name:'NM Flow Link',L:117.5,W:55.8,H:60,kg:0.176},
  cl\u0061mp:{article:'8003',name:'NM Flow Cl\u0061mp',L:60,W:60,H:32.3,kg:0.111},
  setter:{article:'8011',name:'NM Flow Setter',L:2000,W:40,H:75,kg:1.300},
  hyperCl\u0061mp:{article:'3132',name:'NM Hyper Mid/End Cl\u0061mp',L:117.5,W:55.8,H:60,kg:0.176},
};
export const FLOW_CP = {};
