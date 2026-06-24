import { flowSnowPa, flowPanelWind } from './flowLoads.js';
import { calculateFlowBallast, CF_STAB } from './flowBallast.js';
import { eastWestFieldHeightMm } from './flowEastWestGeometry.js';
import { selectDockPosition } from './flowParallelGeometry.js';

const within = (actual, expected, tolerance) => (
  expected !== 0 && Math.abs(Number(actual) - expected) / Math.abs(expected) <= tolerance
);

function position(priority, count, areaM2, ownWeightKg, windPa) {
  return {
    id: priority,
    priority,
    areaM2: areaM2 * count,
    ownWeightKg: ownWeightKg * count,
    windPa,
  };
}

export const FLOW_REFERENCE_CASES = [
  {
    id: 'planner-896',
    orientation: 'parallel',
    groundSnowKnM2: 1.5,
    roofAngleDeg: 5,
    referenceWindMs: 27,
    ridgeHeightM: 10,
    terrainCategory: '0',
    panelAreaM2: 1.134 * 1.722,
    ownWeightKg: 22 + 494 / 14,
    ballastPositions: { roofEdge: 1, obstacle: 0, field: 13 },
    expected: {
      snowPa: 1488,
      ballastKg: 896,
      windPa: { roofMid_panelMid: 284, roofEdge_panelEdge: 555 },
    },
  },
  {
    id: 'planner-846',
    orientation: 'parallel',
    groundSnowKnM2: 3,
    roofAngleDeg: 5,
    referenceWindMs: 21,
    ridgeHeightM: 10,
    terrainCategory: 'III',
    panelAreaM2: 1.134 * 1.722,
    ownWeightKg: 22 + 1464 / 41,
    ballastPositions: { roofEdge: 41, obstacle: 0, field: 0 },
    expected: {
      snowPa: 2977,
      ballastKg: 846,
      windPa: { roofMid_panelMid: 95, roofEdge_panelEdge: 186 },
    },
  },
  {
    id: 'planner-432',
    orientation: 'eastwest',
    groundSnowKnM2: 3.5,
    roofAngleDeg: 5,
    referenceWindMs: 21,
    ridgeHeightM: 10,
    terrainCategory: 'III',
    panelAreaM2: 1.722 * 1.134,
    ownWeightKg: 22 + 648 / 20,
    ballastPositions: { roofEdge: 20, obstacle: 0, field: 0 },
    expected: {
      snowPa: 3473,
      ballastKg: 432,
      windPa: { roofMid_panelMid: 48, roofEdge_panelEdge: 155 },
    },
  },
];

function ballastPositionsFor(testCase, windPa) {
  const { roofEdge, obstacle, field } = testCase.ballastPositions;
  return [
    position('roof_edge', roofEdge, testCase.panelAreaM2, testCase.ownWeightKg, windPa.roofEdge_panelEdge),
    position('obstacle', obstacle, testCase.panelAreaM2, testCase.ownWeightKg, windPa.roofEdge_panelMid),
    position('field', field, testCase.panelAreaM2, testCase.ownWeightKg, windPa.roofMid_panelMid),
  ].filter(item => item.areaM2 > 0);
}

export function validateFlowGeometry() {
  const fieldHeightMm = eastWestFieldHeightMm({ rows: 4, panelLengthMm: 1134 });
  const dock980 = selectDockPosition({ minMm: 900, maxMm: 1000 });
  const dock1110 = selectDockPosition({ minMm: 900, maxMm: 1120 });
  return {
    fieldHeight: {
      actualMm: fieldHeightMm,
      expectedMm: 4770,
      tolerancePercent: 1,
      pass: within(fieldHeightMm, 4770, 0.01),
    },
    dock980: { ...dock980, pass: dock980.ok && dock980.dockPositionMm === 980 },
    dock1110: { ...dock1110, pass: dock1110.ok && dock1110.dockPositionMm === 1110 },
  };
}

export function runValidation() {
  const cases = FLOW_REFERENCE_CASES.map(testCase => {
    const snow = flowSnowPa(testCase);
    const wind = flowPanelWind(testCase);
    const ballast = calculateFlowBallast({
      orientation: testCase.orientation,
      positions: ballastPositionsFor(testCase, wind.perZonePa),
    });
    const ballastKg = ballast.totalBallastKg;
    return {
      id: testCase.id,
      orientation: testCase.orientation,
      snowPa: snow.snowPa,
      windPa: wind.perZonePa,
      ballastKg,
      preliminary: ballast.preliminary,
      cfStab: ballast.cfStab,
      checks: {
        snow: within(snow.snowPa, testCase.expected.snowPa, 0.02),
        windRoofMidPanelMid: within(Math.abs(wind.perZonePa.roofMid_panelMid), testCase.expected.windPa.roofMid_panelMid, 0.07),
        windRoofEdgePanelEdge: within(Math.abs(wind.perZonePa.roofEdge_panelEdge), testCase.expected.windPa.roofEdge_panelEdge, 0.07),
        ballast: within(ballastKg, testCase.expected.ballastKg, 0.08),
        preliminary: ballast.preliminary === true,
      },
      expected: testCase.expected,
    };
  });
  const geometry = validateFlowGeometry();
  const geometryChecks = {
    fieldHeight: geometry.fieldHeight.pass,
    dock980: geometry.dock980.pass,
    dock1110: geometry.dock1110.pass,
  };
  const pass = cases.every(item => Object.values(item.checks).every(Boolean))
    && Object.values(geometryChecks).every(Boolean);
  return { pass, cfStab: CF_STAB, cases, geometry, geometryChecks };
}

export const runFlowValidation = runValidation;
