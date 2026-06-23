import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
  FileImage,
  Globe2,
  Hand,
  ImagePlus,
  Map as MapIcon,
  MousePointer2,
  PanelTop,
  Pentagon,
  Ruler,
  Save,
  SquareDashed,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
  LayoutGrid,
  Move,
  Maximize2,
  Check,
  Plus,
  Box as BoxIcon
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const DEFAULT_TRACE = {
  imageUrl: '',
  imageName: '',
  naturalWidth: 0,
  naturalHeight: 0,
  metersPerPixel: 0,
  calibration: null,
  opacity: 1,
  savedAt: '',
};

const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function readLayout(project) {
  const candidates = [project?.solar_roof_planner_data, project?.panel_layout_data];
  for (const raw of candidates) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  return { version: 10, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

// --- PROJECTION LOGIC (Meters to Map Polygon) ---
function getRoofProjection(roof) {
  const points = roof.mapPolygon || [];
  if (points.length < 3) return null;

  // Find longest edge as base (u-axis)
  let longest = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!longest || len > longest.len) longest = { a, b, len };
  }
  
  const ux = (longest.b.x - longest.a.x) / longest.len;
  const uy = (longest.b.y - longest.a.y) / longest.len;
  const vx = -uy, vy = ux; // Perpendicular

  return { origin: longest.a, ux, uy, vx, vy, scaleU: longest.len / n(roof.widthM, 1), scaleV: longest.len / n(roof.widthM, 1) };
}

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  const [layout, setLayout] = useState(() => readLayout(project));
  const [trace, setTrace] = useState(() => safeJson(project?.map_trace_data, DEFAULT_TRACE));
  const [tool, setTool] = useState('pan');
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState([]);
  const [selectedRoofId, setSelectedRoofId] = useState('');
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [saving, setSaving] = useState(false);

  // --- PURPLE WORKSPACE STATE ---
  const [workspace, setWorkspace] = useState({
    isOpen: false,
    roofId: null,
    x: 100,
    y: 100,
    width: 900,
    height: 650,
    zoom: 1.0
  });

  const activeRoof = useMemo(() => layout.roofs.find(r => r.id === workspace.roofId), [layout, workspace.roofId]);

  const handleSave = async (nextLayout = layout) => {
    setSaving(true);
    try {
      await onUpdate?.({
        solar_roof_planner_data: JSON.stringify(nextLayout),
        map_trace_data: JSON.stringify(trace),
      });
    } finally {
      setSaving(false);
    }
  };

  const addPanel = (roofId, xM, yM) => {
    const nextRoofs = layout.roofs.map(r => {
      if (r.id !== roofId) return r;
      const newPanel = { id: uid('panel'), xM, yM, wM: 1.134, hM: 1.762 }; // Standard panel size
      return { ...r, panels: [...(r.panels || []), newPanel] };
    });
    const nextLayout = { ...layout, roofs: nextRoofs };
    setLayout(nextLayout);
    handleSave(nextLayout);
  };

  const pointToCanvas = p => ({ x: p.x * CANVAS_WIDTH, y: p.y * CANVAS_HEIGHT });

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 font-sans text-slate-900">
      {/* MAIN MAP VIEW */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute origin-top-left transition-transform duration-75"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {trace.imageUrl && (
            <img src={trace.imageUrl} alt="" className="pointer-events-none block" style={{ opacity: trace.opacity, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
          )}
          
          <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 touch-none">
            {layout.roofs.map(roof => {
              const proj = getRoofProjection(roof);
              const points = roof.mapPolygon.map(pointToCanvas);
              return (
                <g key={roof.id} onClick={() => { setWorkspace(s => ({ ...s, isOpen: true, roofId: roof.id })); setSelectedRoofId(roof.id); }}>
                  <polygon 
                    points={points.map(p => `${p.x},${p.y}`).join(' ')} 
                    fill={roof.id === selectedRoofId ? 'rgba(249,115,22,0.3)' : 'rgba(249,115,22,0.15)'} 
                    stroke="#f97316" strokeWidth="4" className="cursor-pointer hover:fill-orange-500/40"
                  />
                  {/* Render Scaled Panels on Map */}
                  {proj && (roof.panels || []).map(p => {
                    const x = (proj.origin.x + p.xM * proj.ux * proj.scaleU + p.yM * proj.vx * proj.scaleV) * CANVAS_WIDTH;
                    const y = (proj.origin.y + p.xM * proj.uy * proj.scaleU + p.yM * proj.vy * proj.scaleV) * CANVAS_HEIGHT;
                    return (
                      <rect 
                        key={p.id} x={x} y={y} width={p.wM * proj.scaleU * CANVAS_WIDTH} height={p.hM * proj.scaleV * CANVAS_HEIGHT}
                        fill="#2563eb" stroke="white" strokeWidth="1" transform={`rotate(${Math.atan2(proj.uy, proj.ux) * 180 / Math.PI}, ${x}, ${y})`}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* FLOATING PURPLE WORKSPACE */}
      {workspace.isOpen && activeRoof && (
        <div 
          className="absolute z-[100] flex flex-col rounded-2xl border-[4px] border-purple-500 bg-slate-900 shadow-2xl overflow-hidden shadow-purple-500/20"
          style={{ left: workspace.x, top: workspace.y, width: workspace.width, height: workspace.height }}
        >
          {/* DRAGGABLE HEADER */}
          <div 
            className="flex items-center justify-between bg-purple-500 px-5 py-3 cursor-move select-none"
            onMouseDown={e => {
              const startX = e.clientX - workspace.x, startY = e.clientY - workspace.y;
              const move = m => setWorkspace(s => ({ ...s, x: m.clientX - startX, y: m.clientY - startY }));
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
            }}
          >
            <div className="flex items-center gap-3 text-white font-black text-sm uppercase tracking-widest">
              <LayoutGrid className="h-5 w-5" /> {activeRoof.name} ({activeRoof.widthM}m x {activeRoof.roofFallM}m)
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: s.zoom + 0.1 }))} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><ZoomIn className="h-4 w-4"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, zoom: Math.max(0.5, s.zoom - 0.1) }))} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><ZoomOut className="h-4 w-4"/></button>
              <button onClick={() => setWorkspace(s => ({ ...s, isOpen: false }))} className="ml-2 p-1.5 hover:bg-red-500 rounded-lg text-white"><X className="h-5 w-5"/></button>
            </div>
          </div>

          {/* 2D METER-SCALE WORKSPACE */}
          <div className="relative flex-1 bg-slate-800 overflow-auto p-12 flex items-center justify-center scrollbar-hide">
            <div 
              className="relative bg-white shadow-2xl border-2 border-white/10"
              style={{
                width: activeRoof.widthM * 60 * workspace.zoom,
                height: activeRoof.roofFallM * 60 * workspace.zoom,
                backgroundImage: `radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px)`,
                backgroundSize: `${20 * workspace.zoom}px ${20 * workspace.zoom}px`
              }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xM = (e.clientX - rect.left) / (60 * workspace.zoom);
                const yM = (e.clientY - rect.top) / (60 * workspace.zoom);
                addPanel(activeRoof.id, xM, yM);
              }}
            >
              <div className="absolute -top-8 left-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bredd: {activeRoof.widthM}m</div>
              <div className="absolute -left-12 top-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180">Fall: {activeRoof.roofFallM}m</div>
              
              {/* Render Panels in Workspace */}
              {(activeRoof.panels || []).map(p => (
                <div 
                  key={p.id} className="absolute bg-blue-600 border border-white/50 shadow-sm flex items-center justify-center"
                  style={{
                    left: p.xM * 60 * workspace.zoom, top: p.yM * 60 * workspace.zoom,
                    width: p.wM * 60 * workspace.zoom, height: p.hM * 60 * workspace.zoom
                  }}
                >
                  <div className="text-[8px] text-white font-bold opacity-50">PV</div>
                </div>
              ))}
            </div>
          </div>

          {/* RESIZE HANDLE */}
          <div 
            className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize flex items-center justify-center group"
            onMouseDown={e => {
              e.stopPropagation();
              const sW = workspace.width, sH = workspace.height, sX = e.clientX, sY = e.clientY;
              const move = m => setWorkspace(s => ({ ...s, width: sW + (m.clientX - sX), height: sH + (m.clientY - sY) }));
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
            }}
          >
            <div className="w-2 h-2 bg-purple-500 rounded-full group-hover:scale-150 transition-transform" />
          </div>
        </div>
      )}

      {/* TOOLBAR & CONTROLS (Existing) */}
      <div className="absolute left-6 top-6 z-40 flex flex-col gap-3">
        <Card className="flex flex-col p-2 shadow-2xl border-slate-800 bg-slate-900/90 backdrop-blur-xl">
          <IconButton title="Panorera" active={tool === 'pan'} onClick={() => setTool('pan')}><Hand className="h-5 w-5"/></IconButton>
          <IconButton title="Rita tak" active={tool === 'draw'} onClick={() => setTool('draw')}><Pentagon className="h-5 w-5"/></IconButton>
          <IconButton title="Kalibrera" active={tool === 'calibrate'} onClick={() => setTool('calibrate')}><Ruler className="h-5 w-5"/></IconButton>
          <div className="h-px bg-slate-800 my-1" />
          <IconButton title="Spara allt" onClick={() => handleSave()} disabled={saving}><Save className="h-5 w-5"/></IconButton>
        </Card>
      </div>
    </div>
  );
}
