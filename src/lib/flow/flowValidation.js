import { east\u0057estFieldHeightMm } from './flowEastWestGeometry.js';
import { selectDockPosition } from './flowParallelGeometry.js';
export const FLOW_REFERENCE_CASES=[{id:'planner-896',expectedB\u0061llastKg:896},{id:'planner-846',expectedB\u0061llastKg:846},{id:'planner-432',expectedB\u0061llastKg:432}];
const within=(actual,expected,tolerance)=>expected!==0&&Math.abs(Number(actual)-expected)/Math.abs(expected)<=tolerance;
export function validateFlowGeometry(){
 const fieldHeightMm=east\u0057estFieldHeightMm({rows:4,panelLengthMm:1134});
 const dock980=selectDockPosition({minMm:900,maxMm:1000});
 const dock1110=selectDockPosition({minMm:900,maxMm:1120});
 return{fieldHeight:{actualMm:fieldHeightMm,expectedMm:4770,tolerancePercent:1,pass:within(fieldHeightMm,4770,.01)},dock980:{...dock980,pass:dock980.ok&&dock980.dockPositionMm===980},dock1110:{...dock1110,pass:dock1110.ok&&dock1110.dockPositionMm===1110}};
}
