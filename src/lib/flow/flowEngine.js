import { FLOW, FLOW_BRANCHES, FLOW_PRODUCTS } from './flowConstants.js';
import { flowSnowPa, flowPanelWind } from './flowLoads.js';
import { calculateFlowGeometry } from './flowGeometry.js';
import { calculateFlowBallast } from './flowBallast.js';
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const positive=(v,f=0)=>num(v,f)>0?num(v,f):f;
function countPanels(roof){let total=0;(roof?.panelGroups||[]).forEach(g=>{total+=Math.max(0,Math.round(num(g.rows)))*Math.max(0,Math.round(num(g.cols)));});return total;}
function buildPositions(input,windPa){
 const count=countPanels(input.roof),area=positive(input.panelProduct?.width_mm,1134)*positive(input.panelProduct?.height_mm,2278)/1000000,own=positive(input.panelProduct?.weight_kg,25);
 const edge=Math.min(count,Math.max(0,Math.round(Math.sqrt(count)*4-4)));
 const obstacle=Math.min(Math.max(0,count-edge),input.roof?.obstacles?.length||0);
 const field=Math.max(0,count-edge-obstacle);
 return[{id:'roof-edge',priority:'roof_edge',areaM2:area*edge,ownWeightKg:own*edge,windPa:windPa.roofEdge_panelEdge},{id:'obstacles',priority:'obstacle',areaM2:area*obstacle,ownWeightKg:own*obstacle,windPa:windPa.roofEdge_panelMid},{id:'field',priority:'field',areaM2:area*field,ownWeightKg:own*field,windPa:windPa.roofMid_panelMid}].filter(x=>x.areaM2>0);
}
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
