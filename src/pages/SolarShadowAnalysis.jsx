import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Sun, Save, RotateCcw, Download, Home, CloudSun, TreePine } from 'lucide-react';
import { calculateSolarPosition, calculateWeatherFactor, calculateShadeLoss, calculatePvEstimate, generateHourlySimulation, annualFactorFromDate, clamp } from '@/lib/solarShadowEngine';

const KEY = 'solarplan_shadow_analysis_v1';
const initial = {
  projectName: 'Ny sol- och skugganalys', address: '', latitude: 59.3793, longitude: 13.5036,
  buildingLength: 12, buildingWidth: 8, buildingHeight: 5.2, roofPitch: 27, roofAzimuth: 180,
  panelKw: 12, panelRows: 3, panelColumns: 8, temperature: 18, cloudCover: 22, precipitation: 0,
  treeHeight: 9, treeDistance: 8, neighbourHeight: 7, neighbourDistance: 13,
  obstacles: { chimney: true, tree: true, neighbour: false }
};
const today = () => new Date().toISOString().slice(0, 10);

function Input({ label, value, onChange, suffix = '', step = 1 }) {
  return <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="relative"><input type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-12 text-sm"/><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">{suffix}</span></div></label>;
}
function Stat({ title, value, text }) { return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></div>; }

function Viewer({ model, solar, shadeLoss }) {
  const ref = useRef(null); const keep = useRef({});
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf8fafc);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 1000);
    camera.position.set(16, 13, 18); camera.lookAt(0, 2.5, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(el.clientWidth, el.clientHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement); scene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1.4); light.position.set(8, 15, 8); scene.add(light); scene.add(new THREE.GridHelper(36, 36));
    keep.current = { scene, camera, renderer, items: [] };
    let raf; const run = () => { raf = requestAnimationFrame(run); renderer.render(scene, camera); }; run();
    const resize = () => { camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    addEventListener('resize', resize);
    return () => { removeEventListener('resize', resize); cancelAnimationFrame(raf); renderer.dispose(); el.innerHTML = ''; };
  }, []);
  useEffect(() => {
    const k = keep.current; if (!k.scene) return; k.items.forEach(o => k.scene.remove(o)); k.items = [];
    const add = o => { k.items.push(o); k.scene.add(o); return o; };
    const L = +model.buildingLength, W = +model.buildingWidth, H = +model.buildingHeight, P = +model.roofPitch, RH = Math.tan(P*Math.PI/180)*(W/2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(L,H,W), new THREE.MeshStandardMaterial({color:0xffffff})); wall.position.y = H/2; add(wall);
    const roofMat = new THREE.MeshStandardMaterial({color:0x334155}); const rg = new THREE.BoxGeometry(L+.5,.22,W/2+.35);
    const r1 = new THREE.Mesh(rg, roofMat); r1.position.set(0,H+RH/2,-W/4); r1.rotation.x = P*Math.PI/180; add(r1);
    const r2 = new THREE.Mesh(rg, roofMat); r2.position.set(0,H+RH/2,W/4); r2.rotation.x = -P*Math.PI/180; add(r2);
    const pm = new THREE.MeshStandardMaterial({color:0x0f172a}); const cols=+model.panelColumns, rows=+model.panelRows, pw=Math.min(1.25,L/Math.max(1,cols)-.08);
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){ const p=new THREE.Mesh(new THREE.BoxGeometry(pw,.05,.72),pm); p.position.set(-((cols-1)*(pw+.08))/2+x*(pw+.08),H+RH+.25+y*.08,-W/4-.28-y*.79); p.rotation.x=P*Math.PI/180; add(p); }
    if(model.obstacles.chimney){const c=new THREE.Mesh(new THREE.BoxGeometry(.65,1.45,.65),new THREE.MeshStandardMaterial({color:0x92400e})); c.position.set(L*.22,H+RH+.7,-W*.08); add(c);}
    if(model.obstacles.tree){const t=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,+model.treeHeight*.55),new THREE.MeshStandardMaterial({color:0x78350f})); t.position.set(-L/2-+model.treeDistance*.45,+model.treeHeight*.275,-W/2-+model.treeDistance*.28); add(t); const cr=new THREE.Mesh(new THREE.ConeGeometry(1.55,+model.treeHeight*.55,12),new THREE.MeshStandardMaterial({color:0x166534})); cr.position.set(t.position.x,+model.treeHeight*.72,t.position.z); add(cr);}
    if(model.obstacles.neighbour){const n=new THREE.Mesh(new THREE.BoxGeometry(8,+model.neighbourHeight,6),new THREE.MeshStandardMaterial({color:0x94a3b8})); n.position.set(L/2+ +model.neighbourDistance*.45,+model.neighbourHeight/2,W/2+2); add(n);}
    const s=solar.sunVector||{x:.4,y:.8,z:.4}; const sun=new THREE.Mesh(new THREE.SphereGeometry(.65,24,24),new THREE.MeshBasicMaterial({color:0xfacc15})); sun.position.set(s.x*14,Math.max(1.2,s.y*14),s.z*14); add(sun);
    const sh=new THREE.Mesh(new THREE.PlaneGeometry(L*1.2,W*.72),new THREE.MeshBasicMaterial({color:0x020617,transparent:true,opacity:clamp(shadeLoss/100,.08,.65),side:THREE.DoubleSide})); sh.position.set(0,H+RH+.37,-W*.22); sh.rotation.x=Math.PI/2+P*Math.PI/180; add(sh);
  }, [model, solar, shadeLoss]);
  return <div className="rounded-3xl border border-border bg-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">3D-vy fastighet, paneler, sol och skugga</h2></div><div ref={ref} className="h-[430px] w-full" /></div>;
}

export default function SolarShadowAnalysis(){
  const [model,setModel]=useState(initial); const [date,setDate]=useState(today()); const [hour,setHour]=useState(12);
  useEffect(()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s){setModel({...initial,...s.model,obstacles:{...initial.obstacles,...(s.model?.obstacles||{})}}); setDate(s.date||today()); setHour(s.hour||12)}}catch{}},[]);
  const set=(k,v)=>setModel(m=>({...m,[k]:v})); const obs=(k,v)=>setModel(m=>({...m,obstacles:{...m.obstacles,[k]:v}}));
  const time=`${String(hour).padStart(2,'0')}:00`; const solar=useMemo(()=>calculateSolarPosition({latitude:model.latitude,longitude:model.longitude,date,time}),[model.latitude,model.longitude,date,time]);
  const weatherFactor=useMemo(()=>calculateWeatherFactor(model),[model]); const shadeLoss=useMemo(()=>calculateShadeLoss({solar,model}),[solar,model]);
  const estimate=useMemo(()=>calculatePvEstimate({solar,model,weatherFactor,shadeLoss}),[solar,model,weatherFactor,shadeLoss]); const sim=useMemo(()=>generateHourlySimulation({model,date}),[model,date]);
  const daily=sim.reduce((a,r)=>a+r.productionKw,0); const annual=daily*365*annualFactorFromDate(date);
  const save=()=>localStorage.setItem(KEY,JSON.stringify({model,date,hour})); const reset=()=>{setModel(initial);setDate(today());setHour(12)};
  const exportData=()=>{const blob=new Blob([JSON.stringify({model,date,hour,solar,weatherFactor,shadeLoss,estimate,sim},null,2)],{type:'application/json'}); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=`solarplan-skugganalys-${date}.json`; a.click(); URL.revokeObjectURL(u);};
  return <div className="min-h-full bg-muted/30 p-4 lg:p-6"><div className="mx-auto max-w-7xl space-y-6"><div className="rounded-3xl border border-border bg-card p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><Sun className="h-4 w-4"/> SolarPlan 3D Sol- och Skugganalys</div><h1 className="text-2xl font-bold lg:text-3xl">Automatisk fastighetsanalys för sol, skugga och väder</h1><p className="mt-2 text-sm text-muted-foreground">Egen sida med 3D-fastighet, panelplacering, solbana, skuggförlust, väderpåverkan, timkurva och export.</p></div><div className="flex gap-2"><button onClick={save} className="rounded-xl bg-primary px-4 py-2 text-sm text-white"><Save className="mr-2 inline h-4 w-4"/>Spara</button><button onClick={exportData} className="rounded-xl border px-4 py-2 text-sm"><Download className="mr-2 inline h-4 w-4"/>Export</button><button onClick={reset} className="rounded-xl border px-4 py-2 text-sm"><RotateCcw className="mr-2 inline h-4 w-4"/>Reset</button></div></div></div>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Stat title="Solhöjd" value={`${Math.max(0,solar.altitude).toFixed(1)}°`} text={`Azimut ${solar.azimuth.toFixed(0)}°`} /><Stat title="Väderfaktor" value={`${(weatherFactor*100).toFixed(0)}%`} text={`${model.cloudCover}% moln`} /><Stat title="Skuggförlust" value={`${shadeLoss.toFixed(0)}%`} text="Tak och hinder" /><Stat title="Effekt nu" value={`${estimate.productionKw.toFixed(1)} kW`} text={`${estimate.irradiance.toFixed(0)} W/m²`} /><Stat title="Dag / år" value={`${daily.toFixed(1)} kWh`} text={`Ca ${annual.toFixed(0)} kWh/år`} /></div>
  <div className="grid gap-6 xl:grid-cols-[390px_1fr]"><div className="space-y-4"><div className="rounded-3xl border bg-card p-4"><h2 className="mb-4 flex gap-2 font-semibold"><Home className="h-5 w-5 text-primary"/>Fastighet</h2><div className="grid gap-3"><input value={model.projectName} onChange={e=>set('projectName',e.target.value)} className="rounded-xl border px-3 py-2 text-sm"/><input value={model.address} onChange={e=>set('address',e.target.value)} placeholder="Adress / fastighet" className="rounded-xl border px-3 py-2 text-sm"/><div className="grid grid-cols-2 gap-3"><Input label="Latitud" value={model.latitude} onChange={v=>set('latitude',v)} suffix="°" step={.0001}/><Input label="Longitud" value={model.longitude} onChange={v=>set('longitude',v)} suffix="°" step={.0001}/></div><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"/></div></div>
  <div className="rounded-3xl border bg-card p-4"><h2 className="mb-4 font-semibold">Byggnad och tak</h2><div className="grid grid-cols-2 gap-3">{[['buildingLength','Längd','m'],['buildingWidth','Bredd','m'],['buildingHeight','Höjd','m'],['roofPitch','Taklutning','°'],['roofAzimuth','Takazimut','°'],['panelKw','Effekt','kWp'],['panelRows','Panelrader','st'],['panelColumns','Panelkolumner','st']].map(x=><Input key={x[0]} label={x[1]} value={model[x[0]]} onChange={v=>set(x[0],v)} suffix={x[2]}/>)}</div></div>
  <div className="rounded-3xl border bg-card p-4"><h2 className="mb-4 flex gap-2 font-semibold"><CloudSun className="h-5 w-5 text-primary"/>Väder och hinder</h2><div className="grid grid-cols-2 gap-3">{[['cloudCover','Moln','%'],['temperature','Temp','°C'],['precipitation','Regn','mm/h'],['treeHeight','Trädhöjd','m'],['treeDistance','Trädavst.','m'],['neighbourHeight','Grannhöjd','m']].map(x=><Input key={x[0]} label={x[1]} value={model[x[0]]} onChange={v=>set(x[0],x[0]==='cloudCover'?clamp(v,0,100):v)} suffix={x[2]} step={x[0]==='precipitation'?.1:1}/>)}</div><div className="mt-4 grid gap-2">{[['chimney','Skorsten'],['tree','Träd'],['neighbour','Grannbyggnad']].map(x=><label key={x[0]} className="flex justify-between rounded-xl border px-3 py-2 text-sm"><span>{x[1]}</span><input type="checkbox" checked={model.obstacles[x[0]]} onChange={e=>obs(x[0],e.target.checked)}/></label>)}</div></div></div>
  <div className="space-y-6"><Viewer model={model} solar={solar} shadeLoss={shadeLoss}/><div className="grid gap-6 lg:grid-cols-2"><div className="rounded-3xl border bg-card p-4"><h2 className="mb-4 font-semibold">Timvis simulering</h2><input type="range" min="4" max="19" value={hour} onChange={e=>setHour(+e.target.value)} className="mb-4 w-full" />{sim.map(r=><button key={r.time} onClick={()=>setHour(+r.time.slice(0,2))} className={`mb-2 grid w-full grid-cols-[52px_1fr_60px] gap-3 rounded-xl px-3 py-2 text-sm ${+r.time.slice(0,2)===hour?'bg-primary/10 text-primary':'hover:bg-muted'}`}><span>{r.time}</span><span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{width:`${clamp(r.productionKw/Math.max(1,+model.panelKw)*100,0,100)}%`}} /></span><span>{r.productionKw.toFixed(1)} kW</span></button>)}</div><div className="rounded-3xl border bg-card p-4"><h2 className="mb-4 flex gap-2 font-semibold"><TreePine className="h-5 w-5 text-primary"/>Analys</h2><div className="space-y-3 text-sm"><p className="rounded-2xl bg-muted/60 p-3"><b>Beräknad dag:</b> {daily.toFixed(1)} kWh</p><p className="rounded-2xl bg-muted/60 p-3"><b>Årsestimat:</b> {annual.toFixed(0)} kWh</p><p className="rounded-2xl bg-muted/60 p-3"><b>Vald timme:</b> {time}, {estimate.productionKw.toFixed(1)} kW, {shadeLoss.toFixed(0)}% skugga</p><p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950"><b>Nästa nivå:</b> koppla adress mot kart-/höjddata, SMHI och automatisk takidentifiering.</p><button onClick={()=>setHour(12)} className="w-full rounded-xl bg-primary px-4 py-2 text-white"><Play className="mr-2 inline h-4 w-4"/>Visa mitt på dagen</button></div></div></div></div></div></div></div>;
}
