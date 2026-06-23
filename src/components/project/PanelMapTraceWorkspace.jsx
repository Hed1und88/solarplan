import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Hand,
  ImagePlus,
  Layers,
  MousePointer2,
  Pentagon,
  Ruler,
  Save,
  ZoomIn,
  ZoomOut,
  X,
  LayoutGrid,
  Check,
  Trash2,
  Move,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const n = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  // --- TILLSTÅND FÖR KARTA OCH RITNING ---
  const [trace, setTrace] = useState(() => {
    try { return JSON.parse(project?.map_trace_data || '{}'); } catch { return { imageUrl: '' }; }
  });
  
  const [layout, setLayout] = useState(() => {
    try { 
      const d = JSON.parse(project?.solar_roof_planner_data || '{}');
      return Array.isArray(d.roofs) ? d : { roofs: [] };
    } catch { return { roofs: [] }; }
  });

  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [calibrationPoints, setCalibrationPoints] = useState([]);

  // --- ARBETSYTA (DEN LILA RUTAN) ---
  const [workspace, setWorkspace] = useState({
    isOpen: false,
    roofId: null,
    x: 100,
    y: 100,
    width: 900,
    height: 700,
    zoom: 1.0
  });

  const activeRoof = useMemo(() => layout.roofs.find(r => r.id === workspace.roofId), [layout, workspace.roofId]);

  // Hjälpfunktioner
  const pointToCanvas = p => ({ x: p.x * CANVAS_WIDTH, y: p.y * CANVAS_HEIGHT });
  const canvasToPoint = (x, y) => ({ x: x / CANVAS_WIDTH, y: y / CANVAS_HEIGHT });

  const persist = async (nextLayout = layout) => {
    await onUpdate?.({
      solar_roof_planner_data: JSON.stringify(nextLayout),
      map_trace_data: JSON.stringify(trace)
    });
  };

  // --- BILDUPPLADDNING ---
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

  // --- KARTINTERAKTION ---
  const handleMapClick = (e) => {
    if (tool === 'pan' || workspace.isOpen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    const pt = canvasToPoint(x, y);

    if (tool === 'calibrate') {
      const next = [...calibrationPoints, pt];
      if (next.length === 2) {
        const distPx = Math.hypot((next[0].x - next[1].x) * CANVAS_WIDTH, (next[0].y - next[1].y) * CANVAS_HEIGHT);
        const m = prompt("Ange verklig längd i meter:");
        if (m) setTrace(prev => ({ ...prev, metersPerPixel: Number(m) / distPx }));
        setCalibrationPoints([]);
        setTool('draw');
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
      widthM: 10,
      roofFallM: 8,
      panels: [],
      obstacles: []
    };
    const next = { ...layout, roofs: [...layout.roofs, newRoof] };
    setLayout(next);
    setDraft([]);
    setTool('pan');
    persist(next);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 select-none">
      
      {/* KARTVY */}
      <div className="absolute inset-0 overflow-hidden" onMouseDown={handleMapClick}>
        <div 
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {trace.imageUrl && (
            <img src={trace.imageUrl} className="pointer-events-none block" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
          )}
          
          <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0">
            {layout.roofs.map(roof => (
              <g key={roof.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setWorkspace(s => ({ ...s, isOpen: true, roofId: roof.id })); }}>
                <polygon 
                  points={roof.mapPolygon.map(pointToCanvas).map(p => `${p.x},${p.y}`).join(' ')} 
                  fill="rgba(249, 115, 22, 0.3)" 
                  stroke="#f97316" 
                  strokeWidth="4" 
                />
              </g>
            ))}
            {draft.length > 0 && <polyline points={draft.map(pointToCanvas).map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="4" strokeDasharray="10 5" />}
          </svg>
        </div>
      </div>

      {/* ARBETSYTA (DEN LILA RUTAN) */}
      {workspace.isOpen && activeRoof && (
        <div 
          className="absolute z-[999] flex flex-col rounded-3xl border-[6px] border-purple-600 bg-white shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden"
          style={{ left: workspace.x, top: workspace.y, width: workspace.width, height: workspace.height }}
        >
          {/* HEADER (FLYTTA RUTAN) */}
          <div 
            className="flex items-center justify-between bg-purple-600 px-6 py-4 cursor-grab active:cursor-grabbing"
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const sX = e.clientX - workspace.x, sY = e.clientY - workspace.y;
              const move = m => setWorkspace(s => ({ ...s, x: m.clientX - sX, y: m.clientY - sY }));
              const up = (u) => { 
                e.currentTarget.releasePointerCapture(u.pointerId);
                window.removeEventListener('pointermove', move); 
                window.removeEventListener('pointerup', up); 
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <div className="flex items-center gap-3 text-white font-black text-base uppercase tracking-tighter">
              <LayoutGrid className="h-6 w-6" /> ARBETSYTA: {activeRoof.name}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: s.zoom + 0.1 }))} className="p-2 hover:bg-white/20 rounded-full text-white"><ZoomIn className="h-5 w-5"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: Math.max(0.5, s.zoom - 0.1) }))} className="p-2 hover:bg-white/20 rounded-full text-white"><ZoomOut className="h-5 w-5"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, isOpen: false }))} className="p-2 hover:bg-red-500 rounded-full text-white"><X className="h-5 w-5"/></button>
            </div>
          </div>

          {/* SJÄLVA ARBETSYTAN (HÄR RITAR DU) */}
          <div className="relative flex-1 bg-slate-100 overflow-auto p-16 flex items-center justify-center">
            <div 
              className="relative bg-white shadow-2xl border-2 border-slate-200"
              style={{
                width: activeRoof.widthM * 60 * workspace.zoom,
                height: activeRoof.roofFallM * 60 * workspace.zoom,
                backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                backgroundSize: `${20 * workspace.zoom}px ${20 * workspace.zoom}px`
              }}
            >
               {/* Här kan du lägga till dina paneler och hinder */}
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-slate-100 font-black text-6xl opacity-40 uppercase tracking-tighter select-none">Takyta {activeRoof.widthM}m</span>
               </div>
            </div>
          </div>

          {/* RESIZE-HÖRN (ÄNDRA STORLEK) */}
          <div 
            className="absolute bottom-0 right-0 w-10 h-10 cursor-nwse-resize flex items-center justify-center group"
            onPointerDown={e => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              const sW = workspace.width, sH = workspace.height, sX = e.clientX, sY = e.clientY;
              const move = m => setWorkspace(s => ({ ...s, width: Math.max(400, sW + (m.clientX - sX)), height: Math.max(300, sH + (m.clientY - sY)) }));
              const up = (u) => { 
                e.currentTarget.releasePointerCapture(u.pointerId);
                window.removeEventListener('pointermove', move); 
                window.removeEventListener('pointerup', up); 
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <div className="w-4 h-4 bg-purple-600 rounded-full group-hover:scale-125 transition-transform shadow-lg" />
          </div>
        </div>
      )}

      {/* VERKTYGSFÄLT */}
      <div className="absolute left-6 top-6 z-40 flex flex-col gap-3">
        <div className="flex flex-col p-2 rounded-2xl bg-slate-900/95 backdrop-blur shadow-2xl border border-slate-800">
          <input type="file" id="map-upload" className="hidden" onChange={onImageUpload} />
          <button onClick={() => document.getElementById('map-upload').click()} className="p-3 text-slate-400 hover:text-white transition-colors"><ImagePlus className="h-6 w-6"/></button>
          <button onClick={() => setTool('calibrate')} className={`p-3 transition-colors ${tool === 'calibrate' ? 'text-orange-500' : 'text-slate-400'}`}><Ruler className="h-6 w-6"/></button>
          <button onClick={() => setTool('draw')} className={`p-3 transition-colors ${tool === 'draw' ? 'text-orange-500' : 'text-slate-400'}`}><Pentagon className="h-6 w-6"/></button>
          <button onClick={() => setTool('pan')} className={`p-3 transition-colors ${tool === 'pan' ? 'text-orange-500' : 'text-slate-400'}`}><Hand className="h-6 w-6"/></button>
          <div className="h-px bg-slate-800 my-2 mx-2" />
          <button onClick={() => persist()} className="p-3 text-green-500 hover:text-green-400 transition-colors"><Save className="h-6 w-6"/></button>
        </div>
        {tool === 'draw' && draft.length > 0 && (
          <Button onClick={finishRoof} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-xl font-bold py-6">Färdigställ tak</Button>
        )}
      </div>

      {/* ZOOM KARTA */}
      <div className="absolute right-6 top-6 z-40 flex flex-col gap-2">
        <button onClick={() => setZoom(z => z + 0.1)} className="p-3 rounded-xl bg-white shadow-xl hover:bg-slate-50 transition-colors"><ZoomIn className="h-6 w-6"/></button>
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-3 rounded-xl bg-white shadow-xl hover:bg-slate-50 transition-colors"><ZoomOut className="h-6 w-6"/></button>
      </div>
    </div>
  );
}
