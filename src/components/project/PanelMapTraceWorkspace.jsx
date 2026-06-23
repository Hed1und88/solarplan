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
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const n = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  // --- STEG 1-3: KARTA OCH RITNING ---
  const [trace, setTrace] = useState(() => {
    try { return JSON.parse(project?.map_trace_data || '{}'); } catch { return { imageUrl: '' }; }
  });
  
  const [layout, setLayout] = useState(() => {
    try { 
      const d = JSON.parse(project?.solar_roof_planner_data || '{}');
      return Array.isArray(d.roofs) ? d : { roofs: [] }; // STARTA ALLTID TOMT
    } catch { return { roofs: [] }; }
  });

  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [selectedRoofId, setSelectedRoofId] = useState(null);

  // --- STEG 4: ARBETSYTA (DEN LILA RUTAN) ---
  const [workspace, setWorkspace] = useState({
    isOpen: false,
    roofId: null,
    x: 100,
    y: 100,
    width: 900,
    height: 650,
    zoom: 1.0
  });

  // Hitta det tak man jobbar med just nu
  const activeRoof = useMemo(() => layout.roofs.find(r => r.id === workspace.roofId), [layout, workspace.roofId]);

  // Hjälpfunktioner
  const pointToCanvas = p => ({ x: p.x * CANVAS_WIDTH, y: p.y * CANVAS_HEIGHT });
  const canvasToPoint = (x, y) => ({ x: x / CANVAS_WIDTH, y: y / CANVAS_HEIGHT });

  // Spara allt till databasen
  const persist = async (nextLayout = layout) => {
    await onUpdate?.({
      solar_roof_planner_data: JSON.stringify(nextLayout),
      map_trace_data: JSON.stringify(trace)
    });
  };

  // --- HANDLERS ---
  const onImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setTrace({ imageUrl: url, naturalWidth: img.width, naturalHeight: img.height, metersPerPixel: 0 });
      setTool('calibrate'); // Hoppa till steg 2 direkt
    };
    img.src = url;
  };

  const handleMapClick = (e) => {
    if (tool === 'pan') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    const pt = canvasToPoint(x, y);

    if (tool === 'calibrate') {
      const next = [...calibrationPoints, pt];
      if (next.length === 2) {
        const distPx = Math.hypot((next[0].x - next[1].x) * CANVAS_WIDTH, (next[0].y - next[1].y) * CANVAS_HEIGHT);
        const m = prompt("Ange verklig längd i meter för den sträcka du ritat:");
        if (m) {
          setTrace(prev => ({ ...prev, metersPerPixel: Number(m) / distPx }));
          setTool('draw'); // Hoppa till steg 3
        }
        setCalibrationPoints([]);
      } else {
        setCalibrationPoints(next);
      }
    }

    if (tool === 'draw') {
      setDraft(prev => [...prev, pt]);
    }
  };

  const finishRoof = () => {
    if (draft.length < 3) return;
    const newRoof = {
      id: uid('roof'),
      name: `Tak ${layout.roofs.length + 1}`,
      mapPolygon: draft,
      widthM: 10, // Standardvärden innan man klickar och ändrar i lila rutan
      roofFallM: 8,
      panels: [] // Inga paneler från början!
    };
    const next = { ...layout, roofs: [...layout.roofs, newRoof] };
    setLayout(next);
    setDraft([]);
    setTool('pan');
    persist(next);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      
      {/* KARTAN (STEG 1-3) */}
      <div className="absolute inset-0 overflow-hidden" onMouseDown={handleMapClick}>
        <div 
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {trace.imageUrl && (
            <img src={trace.imageUrl} className="pointer-events-none block" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
          )}
          
          <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0">
            {/* Ritade tak (Orange) */}
            {layout.roofs.map(roof => (
              <g 
                key={roof.id} 
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  // STEG 4: ÖPPNA LILA RUTAN VID KLICK
                  setWorkspace(s => ({ ...s, isOpen: true, roofId: roof.id }));
                }}
              >
                <polygon 
                  points={roof.mapPolygon.map(pointToCanvas).map(p => `${p.x},${p.y}`).join(' ')} 
                  fill="rgba(249, 115, 22, 0.3)" 
                  stroke="#f97316" 
                  strokeWidth="4" 
                />
                {/* Rita ut panelerna på kartan om de finns i layouten */}
                {(roof.panels || []).map(p => (
                   <rect key={p.id} x={p.xMap} y={p.yMap} width={10} height={15} fill="#2563eb" stroke="white" />
                ))}
              </g>
            ))}

            {/* Pågående ritning */}
            {draft.length > 0 && (
              <polyline points={draft.map(pointToCanvas).map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="4" strokeDasharray="10 5" />
            )}
          </svg>
        </div>
      </div>

      {/* LILA ARBETSYTA (STEG 4) - Endast synlig vid klick */}
      {workspace.isOpen && activeRoof && (
        <div 
          className="absolute z-[100] flex flex-col rounded-2xl border-[4px] border-purple-500 bg-white shadow-2xl overflow-hidden shadow-purple-500/30"
          style={{ left: workspace.x, top: workspace.y, width: workspace.width, height: workspace.height }}
        >
          {/* Fönsterhuvud (Dra för att flytta) */}
          <div 
            className="flex items-center justify-between bg-purple-500 px-4 py-3 cursor-move"
            onMouseDown={e => {
              const sX = e.clientX - workspace.x, sY = e.clientY - workspace.y;
              const move = m => setWorkspace(s => ({ ...s, x: m.clientX - sX, y: m.clientY - sY }));
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
            }}
          >
            <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-widest">
              <LayoutGrid className="h-4 w-4" /> ARBETSYTA: {activeRoof.name}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: s.zoom + 0.1 }))} className="p-1 hover:bg-white/20 rounded text-white"><ZoomIn className="h-4 w-4"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: Math.max(0.5, s.zoom - 0.1) }))} className="p-1 hover:bg-white/20 rounded text-white"><ZoomOut className="h-4 w-4"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, isOpen: false }))} className="p-1 hover:bg-red-500 rounded text-white"><X className="h-4 w-4"/></button>
            </div>
          </div>

          {/* Själva arbetsytan där man lägger ut paneler */}
          <div className="relative flex-1 bg-slate-100 overflow-auto p-12 flex items-center justify-center">
            <div 
              className="relative bg-white shadow-2xl border border-slate-200"
              style={{
                width: activeRoof.widthM * 50 * workspace.zoom,
                height: activeRoof.roofFallM * 50 * workspace.zoom,
                backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                backgroundSize: `${10 * workspace.zoom}px ${10 * workspace.zoom}px`
              }}
              onClick={() => {
                // Här lägger du till logik för att placera en panel
                alert("Här lägger du ut panelerna nu!");
              }}
            >
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-slate-200 font-black text-4xl opacity-20 uppercase tracking-tighter">Skalenlig Yta</span>
               </div>
            </div>
          </div>

          {/* Resize-hörn */}
          <div 
            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize bg-purple-500/20 hover:bg-purple-500 transition-colors"
            onMouseDown={e => {
              e.stopPropagation();
              const sW = workspace.width, sH = workspace.height, sX = e.clientX, sY = e.clientY;
              const move = m => setWorkspace(s => ({ ...s, width: sW + (m.clientX - sX), height: sH + (m.clientY - sY) }));
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
            }}
          />
        </div>
      )}

      {/* VERKTYGSFÄLT (VÄNSTER) */}
      <div className="absolute left-6 top-6 z-40 flex flex-col gap-3">
        <div className="flex flex-col p-2 rounded-2xl bg-slate-900/90 backdrop-blur shadow-2xl border border-slate-800">
          <input type="file" id="map-upload" className="hidden" onChange={onImageUpload} />
          <button onClick={() => document.getElementById('map-upload').click()} className="p-3 text-slate-400 hover:text-white"><ImagePlus className="h-5 w-5"/></button>
          <button onClick={() => setTool('calibrate')} className={`p-3 ${tool === 'calibrate' ? 'text-orange-500' : 'text-slate-400'}`}><Ruler className="h-5 w-5"/></button>
          <button onClick={() => setTool('draw')} className={`p-3 ${tool === 'draw' ? 'text-orange-500' : 'text-slate-400'}`}><Pentagon className="h-5 w-5"/></button>
          <button onClick={() => setTool('pan')} className={`p-3 ${tool === 'pan' ? 'text-orange-500' : 'text-slate-400'}`}><Hand className="h-5 w-5"/></button>
          <div className="h-px bg-slate-800 my-2" />
          <button onClick={() => persist()} className="p-3 text-green-500 hover:text-green-400"><Save className="h-5 w-5"/></button>
        </div>

        {tool === 'draw' && draft.length > 0 && (
          <Button onClick={finishRoof} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-xl">Färdigställ tak</Button>
        )}
      </div>

      {/* ZOOM-KONTROLLER (HÖGER) */}
      <div className="absolute right-6 top-6 z-40 flex flex-col gap-2">
        <button onClick={() => setZoom(z => z + 0.1)} className="p-3 rounded-xl bg-white shadow-lg"><ZoomIn className="h-5 w-5"/></button>
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-3 rounded-xl bg-white shadow-lg"><ZoomOut className="h-5 w-5"/></button>
      </div>
    </div>
  );
}
