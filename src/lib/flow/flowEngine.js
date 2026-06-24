import { resolveProductClampZone } from '@/lib/productDocuments';
import { FLOW, FLOW_BRANCHES, FLOW_PRODUCTS } from './flowConstants.js';
import { flowSnowPa, flowPanelWind } from './flowLoads.js';
import { selectDockPosition, checkRailOverhang, parallelSideGapMm } from './flowParallelGeometry.js';
import { panel\u0057idthMode, east\u0057estFieldHeightMm, east\u0057estGaps } from './flowEast\u0057estGeometry.js';
import { calculateFlowB\u0061llast } from './flowB\u0061llast.js';
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const positive=(value,fallback=0)=>num(value,fallback)>0?num(value,fallback):fallback;
const round=(value,decimals=2)=>Math.round(num(value)*10**decimals)/10**decimals;
const normalize=value=>String(value||'').trim().toLowerCase();
function panelDimensions(product={},orientation='portrait'){
 const widthM=positive(product.width_mm,1134)/1000,heightM=positive(product.height_mm,2278)/1000;
 return normalize(orientation).includes('ligg')||orientation==='landscape'?{widthM:heightM,heightM:widthM}:{widthM,heightM};
}
function nearObstacle(xM,yM,roof,items=[]){return items.some(item=>{
 const normalized=num(item.x)<=1&&num(item.y)<=1&&num(item.width)<=1&&num(item.height)<=1;
 const x=normalized?num(item.x)*positive(roof.widthM):num(item.xM,num(item.x));
 const y=normalized?num(item.y)*positive(roof.roofFallM):num(item.yM,num(item.y));
 const w=normalized?num(item.width)*positive(roof.widthM):num(item.widthM,num(item.width));
 const h=normalized?num(item.height)*positive(roof.roofFallM):num(item.heightM,num(item.height));
 return xM>=x-.5&&xM<=x+w+.5&&yM>=y-.5&&yM<=y+h+.5;
});}
function buildPositions(input,perZonePa){
 const roof=input.roof||{},panel=input.panelProduct||{},roofWidth=positive(roof.widthM),roofHeight=positive(roof.roofFallM),edgeX=roofWidth/10,edgeY=roofHeight/10,panelWeightKg=positive(panel.weight_kg,positive(panel.weightKg,25)),positions=[];
 (roof.panelGroups||[]).forEach(group=>{const rows=Math.max(0,Math.round(num(group.rows))),cols=Math.max(0,Math.round(num(group.cols))),d=panelDimensions(panel,group.orientation),gap=positive(group.panelGapMm,20)/1000;
  for(let row=0;row<rows;row+=1)for(let col=0;col<cols;col+=1){const xM=num(group.xM)+col*(d.widthM+gap)+d.widthM/2,yM=num(group.yM)+row*(d.heightM+gap)+d.heightM/2,roofEdge=xM<=edgeX||xM>=roofWidth-edgeX||yM<=edgeY||yM>=roofHeight-edgeY,panelEdge=row===0||col===0||row===rows-1||col===cols-1,zoneKey=`${roofEdge?'roofEdge':'roofMid'}_${panelEdge?'panelEdge':'panelMid'}`,obstacle=nearObstacle(xM,yM,roof,roof.obstacles||[]);
   positions.push({id:`${group.id||'group'}:${row}:${col}`,xM,yM,areaM2:d.widthM*d.heightM,ownWeightKg:panelWeightKg,windPa:perZonePa[zoneKey],priority:roofEdge?'roof_edge':obstacle?'obstacle':'field'});
  }
 });return positions;
}
export function calculateFlowRoof(input={},systemVariant=''){
 const branch=FLOW_BRANCHES[systemVariant],ridgeHeightM=positive(input.config?.ridgeHeightM,positive(input.roof?.ridgeHeightM)),terrainCategory=input.config?.terrainCategory||input.roof?.terrainCategory||'II';
 const snowRaw=flowSnowPa({groundSnowKnM2:input.project?.snow_load_kn_m2,roofAngleDeg:num(input.roof?.angleDeg)}),orientation=systemVariant==='flow_east_west_ballasted'?'eastwest':'parallel';
 const windRaw=flowPanelWind({orientation,referenceWindMs:input.project?.wind_load_ms,ridgeHeightM,terrainCategory});
 const snow={...snowRaw,designPa:snowRaw.snowPa},wind={...windRaw,edgePa:windRaw.perZonePa.roofEdge_panelEdge,middlePa:windRaw.perZonePa.roofMid_panelMid};
 return{branch,loads:{snow,wind},orientation};
}
