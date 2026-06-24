import { FLOW, FLOW_BRANCHES, FLOW_PRODUCTS } from './flowConstants.js';
import { flowSnowPa, flowPanelWind } from './flowLoads.js';
import { calculateFlowGeometry } from './flowGeometry.js';
import { calculateFlowBallast } from './flowBallast.js';
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const positive=(v,f=0)=>num(v,f)>0?num(v,f):f;
export function calculateFlowRoof(input={},systemVariant=''){
 const branch=FLOW_BRANCHES[systemVariant];
 const ridgeHeightM=positive(input.config?.ridgeHeightM,positive(input.roof?.ridgeHeightM));
 const terrainCategory=input.config?.terrainCategory||input.roof?.terrainCategory||'II';
 const keys=Object.keys(FLOW_BRANCHES);
 const orientation=systemVariant===keys[1]?'eastwest':'parallel';
 const snowRaw=flowSnowPa({groundSnowKnM2:input.project?.snow_load_kn_m2,roofAngleDeg:num(input.roof?.angleDeg)});
 const windRaw=flowPanelWind({orientation,referenceWindMs:input.project?.wind_load_ms,ridgeHeightM,terrainCategory});
 const snow={...snowRaw,designPa:snowRaw.snowPa};
 const wind={...windRaw,edgePa:windRaw.perZonePa.roofEdge_panelEdge,middlePa:windRaw.perZonePa.roofMid_panelMid};
 const loads={snow,wind};
 if(systemVariant===keys[2])return{branch,loads,blockedCode:'south'};
 if(systemVariant===keys[3])return{branch,loads:null,blockedCode:'hybrid'};
 const g=calculateFlowGeometry(input,systemVariant);
 return{branch,loads,orientation,geometry:g.geometry,errors:g.errors,warnings:g.warnings};
}
