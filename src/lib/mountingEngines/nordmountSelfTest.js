import { calculateNordmountSnowLoad, calculateNordmountWindLoad } from '@/lib/mountingEngines/nordmountValidated';

const CASES = [
  ['Helgetorp', 'II', 23, 8, 1.5, 35, 1122, -424, -1696],
  ['Saffle', 'III', 23, 10, 2, 25, 2317, -328, -1311],
  ['Skoghall', 'I', 23, 10, 1.5, 18, 1847, -530, -2122],
  ['Jamjo15', '0', 26, 10, 1.5, 15, 1804, -731, -2926],
  ['Jamjo45', '0', 26, 10, 1.5, 45, 581, -731, -2926],
];

const deviation = (actual, expected) => Math.abs((actual - expected) / expected) * 100;

export function runNordmountLoadSelfTest(tolerancePercent = 2) {
  const cases = CASES.map(([name, terrain, windMs, heightM, snowZone, angle, snowExpected, middleExpected, edgeExpected]) => {
    const snow = calculateNordmountSnowLoad({ groundSnowKnM2: snowZone, roofAngleDeg: angle });
    const wind = calculateNordmountWindLoad({ referenceWindMs: windMs, ridgeHeightM: heightM, terrainCategory: terrain });
    const deviations = [
      deviation(snow.designPa, snowExpected),
      deviation(wind.middlePa, middleExpected),
      deviation(wind.edgePa, edgeExpected),
    ];
    return { name, passed: deviations.every(value => value <= tolerancePercent), deviations };
  });
  return { passed: cases.every(test => test.passed), tolerancePercent, cases };
}
