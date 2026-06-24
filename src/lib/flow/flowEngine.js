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
