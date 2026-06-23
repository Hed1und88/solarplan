import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Hand,
  ImagePlus,
  Pentagon,
  Ruler,
  Save,
  ZoomIn,
  ZoomOut,
  X,
  LayoutGrid,
  Plus,
  Trash2,
  Square,
  MousePointer2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  // --- DATA ---
  const [trace, setTrace] = useState(() => {
    try { return JSON.parse(project?.map_trace_data || '{}'); } catch { return { imageUrl: '' }; }
  });
  
  const [layout, setLayout] = useState(() => {
    try { 
      const d = JSON.parse(project?.solar_roof_planner_data || '{}');
      return Array.isArray(d.roofs) ? d : { roofs: [] };
    } catch { return { roofs: [] }; }
  });

  // --- STATES ---
  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [activeRoofId, setActiveRoofId] = useState(null); // STEG 4 TRIGGER

  const activeRoof = useMemo(() => layout.roofs.find(r => r.id === activeRoofId), [layout, activeRoofId]);

  // --- HELPERS ---
  const pointToCanvas = p => ({ x: p.x * CANVAS_WIDTH, y: p.y * CANVAS_HEIGHT });
  const canvasToPoint = (x, y) => ({ x: x / CANVAS_WIDTH, y: y / CANVAS_HEIGHT });

  const persist = async (nextLayout = layout) => {
    await onUpdate?.({
      solar_roof_planner_data: JSON.stringify(nextLayout),
      map_trace_data: JSON.stringify(trace)
    });
  };

  // --- STEG 1: UPLOAD ---
  const onImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setTrace({ imageUrl: url, naturalWidth: img.width, naturalHeight: img.height, metersPerPixel: 0 });
      setTool('calibrate');
    };
    img.src = url;
  };

  // --- STEG 2 & 3: CALIBRATE & DRAW ---
  const handleMapClick = (e) => {
    if (activeRoofId || tool === 'pan') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    const pt = canvasToPoint(x, y);

    if (tool === 'calibrate') {
      const next = [...calibrationPoints, pt];
      if (next.length === 2) {
        const distPx = Math.hypot((next[0].x - next[1].x) * CANVAS_WIDTH, (next[0].y - next[1].y) * CANVAS_HEIGHT);
        const m = prompt("Ange verklig längd i meter:");
        if (m) {
          setTrace(prev => ({ ...prev, metersPerPixel: Number(m) / distPx }));
          setTool('draw');
        }
        setCalibrationPoints([]);
      } else setCalibrationPoints(next);
    } else if (tool === 'draw') {
      setDraft(prev => [...prev, pt]);
    }
  };

  const finishRoof = () => {
    if (draft.length < 3) return;
    const newRoof = {
      id: uid('roof'),
      name: `Tak ${layout.roofs.length + 1}`,
      mapPolygon: draft,
      widthM: 25,
      roofFallM: 18,
      panels: []
    };
    const next = { ...layout, roofs: [...layout.roofs, newRoof] };
    setLayout(next);
    setDraft([]);
    setTool('pan');
    persist(next);
  };

  // --- STEG 4: LÄGG TILL PANEL (EXAKT SOM BILDEN) ---
  const addPanelGrid = () => {
    if (!activeRoof) return;
    const newPanels = [];
    // Skapar ett exempel-rutnät för att matcha din bild direkt
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 12; c++) {
        newPanels.push({
          id: uid('p'),
          row: r + 1,
          col: c + 1,
          xM: c * 1.2,
          yM: r * 1.8,
          wM: 1.134,
          hM: 1.762
        });
      }
    }
    const nextRoofs = layout.roofs.map(rf => rf.id === activeRoofId ? { ...rf, panels: newPanels } : rf);
    setLayout({ ...layout, roofs: nextRoofs });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0f172a] select-none font-sans">
      
      {/* BAS-KARTAN (SYNS ALLTID I BOTTEN) */}
      <div className="absolute inset-0 overflow-hidden" onMouseDown={handleMapClick}>
        <div 
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {trace.imageUrl && <img src={trace.imageUrl} className="block" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />}
          
          <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0">
            {layout.roofs.map(roof => (
              <polygon 
                key={roof.id}
                points={roof.mapPolygon.map(pointToCanvas).map(p => `${p.x},${p.y}`).join(' ')} 
                fill="rgba(249, 115, 22, 0.4)" 
                stroke="#f97316" 
                strokeWidth="4"
                className="cursor-pointer hover:fill-orange-500/60"
                onClick={() => setActiveRoofId(roof.id)}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* --- ARBETSYTA OVERLAY (DIN BILD) --- */}
      {activeRoofId && activeRoof && (
        <div className="absolute inset-0 z-[100] flex flex-col bg-[#94a3b8]/90 backdrop-blur-sm">
          
          {/* TOP BAR / HEADER */}
          <div className="flex items-center justify-between bg-[#1e293b] px-8 py-4 shadow-2xl border-b border-white/10">
            <div className="flex items-center gap-6">
              <div className="bg-purple-600 p-2 rounded-lg shadow-lg shadow-purple-500/20">
                <LayoutGrid className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-black text-xl uppercase tracking-tighter">Arbetsyta: {activeRoof.name}</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Skalenlig miljö · {activeRoof.widthM}m x {activeRoof.roofFallM}m</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button onClick={addPanelGrid} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">Generera Test-Grid</Button>
              <Button onClick={() => { persist(); setActiveRoofId(null); }} className="bg-green-600 hover:bg-green-700 text-white font-bold px-6">Spara & Stäng</Button>
              <button onClick={() => setActiveRoofId(null)} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"><X className="h-7 w-7" /></button>
            </div>
          </div>

          {/* DEN STORA GRÅ ARBETSYTAN */}
          <div className="relative flex-1 overflow-auto flex items-center justify-center p-20 bg-[#64748b]">
            
            {/* TAKET I ARBETSYTAN (LILA RAM SOM PÅ BILDEN) */}
            <div 
              className="relative bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border-[3px] border-purple-500 transition-all duration-500"
              style={{
                width: activeRoof.widthM * 45,
                height: activeRoof.roofFallM * 45,
                backgroundImage: 'radial-gradient(#e2e8f0 2px, transparent 2px)',
                backgroundSize: '25px 25px'
              }}
            >
              {/* PANELERRNA (EXAKT STIL SOM BILDEN) */}
              {activeRoof.panels?.map(p => (
                <div 
                  key={p.id}
                  className="absolute border-[1.5px] border-blue-600 bg-blue-50/80 flex flex-col items-center justify-center shadow-sm"
                  style={{
                    left: p.xM * 45,
                    top: p.yM * 45,
                    width: p.wM * 45,
                    height: p.hM * 45
                  }}
                >
                  <span className="text-[10px] font-black text-blue-800 leading-none">{p.row}:{p.col}</span>
                </div>
              ))}

              {/* Vattenstämpel/Label i mitten */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-100 font-black text-[10vw] opacity-40 uppercase tracking-tighter select-none rotate-[-15deg]">
                  Arbetsyta
                </span>
              </div>
            </div>
          </div>

          {/* VERKTYG INUTI ARBETSYTAN */}
          <div className="absolute left-10 bottom-10 flex gap-4">
             <div className="flex flex-col gap-2 p-2 bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl">
               <button className="p-4 text-white hover:bg-purple-600 rounded-xl transition-all"><Plus className="h-6 w-6" /></button>
               <button className="p-4 text-white hover:bg-purple-600 rounded-xl transition-all"><Square className="h-6 w-6" /></button>
               <button className="p-4 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all"><Trash2 className="h-6 w-6" /></button>
             </div>
          </div>
        </div>
      )}

      {/* --- STANDARD VERKTYGSFÄLT (VÄNSTER) --- */}
      <div className="absolute left-8 top-8 z-50 flex flex-col gap-4">
        <div className="flex flex-col p-3 rounded-[24px] bg-[#1e293b]/95 backdrop-blur-xl shadow-2xl border border-white/10">
          <input type="file" id="map-upload" className="hidden" onChange={onImageUpload} />
          <button onClick={() => document.getElementById('map-upload').click()} className="p-4 text-slate-400 hover:text-white transition-all"><ImagePlus className="h-7 w-7"/></button>
          <button onClick={() => setTool('calibrate')} className={`p-4 transition-all ${tool === 'calibrate' ? 'text-orange-500' : 'text-slate-400'}`}><Ruler className="h-7 w-7"/></button>
          <button onClick={() => setTool('draw')} className={`p-4 transition-all ${tool === 'draw' ? 'text-orange-500' : 'text-slate-400'}`}><Pentagon className="h-7 w-7"/></button>
          <button onClick={() => setTool('pan')} className={`p-4 transition-all ${tool === 'pan' ? 'text-orange-500' : 'text-slate-400'}`}><Hand className="h-7 w-7"/></button>
          <div className="h-px bg-white/10 my-3 mx-3" />
          <button onClick={() => persist()} className="p-4 text-green-500 hover:text-green-400 transition-all"><Save className="h-7 w-7"/></button>
        </div>
        {tool === 'draw' && draft.length > 0 && (
          <Button onClick={finishRoof} className="bg-orange-600 hover:bg-orange-700 text-white rounded-2xl shadow-2xl font-black text-lg py-8 px-6">Färdigställ tak</Button>
        )}
      </div>

      {/* ZOOM KARTA */}
      <div className="absolute right-8 top-8 z-50 flex flex-col gap-3">
        <button onClick={() => setZoom(z => z + 0.15)} className="p-4 rounded-2xl bg-white shadow-2xl hover:bg-slate-50 transition-all"><ZoomIn className="h-7 w-7"/></button>
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.15))} className="p-4 rounded-2xl bg-white shadow-2xl hover:bg-slate-50 transition-all"><ZoomOut className="h-7 w-7"/></button>
      </div>
    </div>
  );
}
