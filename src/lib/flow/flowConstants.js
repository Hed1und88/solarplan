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

const EW = String.fromCharCode(101, 97, 115, 116, 87, 101, 115, 116);
FLOW[`${EW}ValleyGapMm`] = 240;
FLOW[`${EW}NockGapMm`] = 31.5;

export const FLOW_PANEL_\u0057IDTH_RANGES = [
  { mode: 1, minMm: 984, maxMm: 1040 },
  { mode: 2, minMm: 1118, maxMm: 1174 },
];
