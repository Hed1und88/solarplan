import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Cable,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Hand,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Move,
  Plus,
  Save,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const DEFAULT_SCALE = 60;
const PANEL_GAP_M = 0.03;
const PLUS = '#ef4444';
const MINUS = '#334155';
const OUT = 34;
const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#db2777'];
const WEATHER = ['Soligt', 'Lätta moln', 'Molnigt', 'Regn'];
const TIMES = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };

const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const stringKey = id => `solarplan:project:${id}:string_layout_data`;
const plannerKey = id => `solarplan:project:${id}:solar_roof_planner_data`;

function parseJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function readLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeLocal(key, payload) {
  if (typeof window === 'undefined' || !key) return;
  try { window.localStorage.setItem(key, JSON.stringify(payload)); } catch {}
}

function hasPanelGroups(data) {
  return data?.roofs?.some(roof => (roof.panelGroups || []).length);
}

function readPlanner(project) {
  const local = readLocal(plannerKey(project?.id));
  const projectData = parseJson(project?.solar_roof_planner_data || project?.panel_layout_data, null);
  if (hasPanelGroups(local)) return local;
  if (hasPanelGroups(projectData)) return projectData;
  if (Array.isArray(local?.roofs) && local.roofs.length) return local;
  if (Array.isArray(projectData?.roofs) && projectData.roofs.length) return projectData;
  return { version: 7, scaleType: 'meter', railMode: 'per-panel', roofs: [] };
}

function readSaved(project) {
  const projectData = parseJson(project?.string_layout_data, null);
  const local = readLocal(stringKey(project?.id));
  const data = projectData?.strings ? projectData : local;
  return data?.strings ? data : { stringCount: 1, strings: [], settings: {} };
}

function panelProductForRoof(roof, products) {
  return products.find(product => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

function panelSize(orientation, product) {
  const base = {
    w: (toNumber(product?.width_mm, DEFAULT_PANEL.width_mm) || DEFAULT_PANEL.width_mm) / 1000,
    h: (toNumber(product?.height_mm, DEFAULT_PANEL.height_mm) || DEFAULT_PANEL.height_mm) / 1000,
  };
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function polygonPoints(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * 0.18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * 0.82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * 0.12},${y} ${x + w},${y} ${x + w * 0.88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * 0.88},${y} ${x + w},${y + h} ${x + w * 0.12},${y + h}`;
  if (shape === 'Vinkel vänster') return `${x + w * 0.25},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h} ${x},${y + h * 0.42} ${x + w * 0.25},${y + h * 0.42}`;
  if (shape === 'Vinkel höger') return `${x},${y} ${x + w * 0.75},${y} ${x + w * 0.75},${y + h * 0.42} ${x + w},${y + h * 0.42} ${x + w},${y + h} ${x},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function getPanelBasePosition(group, roof, products, row, col) {
  const product = panelProductForRoof(roof, products);
  const size = panelSize(group.orientation, product);
  const key = `${row}-${col}`;
  const override = group.panelOverrides?.[key];
  return override
    ? { xM: toNumber(override.xM), yM: toNumber(override.yM) }
    : { xM: toNumber(group.xM) + col * (size.w + PANEL_GAP_M), yM: toNumber(group.yM) + row * (size.h + PANEL_GAP_M) };
}

function groupPhysicalSize(group, roof, products) {
  const size = panelSize(group.orientation, panelProductForRoof(roof, products));
  return {
    w: toNumber(group.cols) * size.w + Math.max(0, toNumber(group.cols) - 1) * PANEL_GAP_M,
    h: toNumber(group.rows) * size.h + Math.max(0, toNumber(group.rows) - 1) * PANEL_GAP_M,
  };
}

function buildMap(plan, products, scale) {
  const pad = 80;
  const roofGap = 110;
  let cursorY = pad;
  const roofs = [];
  const groups = [];
  const panels = [];

  (plan.roofs || []).forEach((roof, roofIndex) => {
    const roofId = roof.id ?? roofIndex;
    const product = panelProductForRoof(roof, products);
    const layout = {
      roof,
      roofId,
      x: pad,
      y: cursorY,
      w: toNumber(roof.widthM, 8) * scale,
      h: toNumber(roof.roofFallM, 6) * scale,
      product,
      productLabel: productLabel(product),
    };
    roofs.push(layout);
    cursorY += layout.h + roofGap;

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupId = group.id ?? groupIndex;
      const size = panelSize(group.orientation, product);
      const panelW = size.w * scale;
      const panelH = size.h * scale;
      const rows = Math.max(0, Math.round(toNumber(group.rows)));
      const cols = Math.max(0, Math.round(toNumber(group.cols)));
      groups.push({ id: `${roofId}-${groupId}`, roofId, groupId, name: group.name || `Panelgrupp ${groupIndex + 1}`, x: layout.x + toNumber(group.xM) * scale, y: layout.y + toNumber(group.yM) * scale });

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const base = getPanelBasePosition(group, roof, products, row, col);
          const x = layout.x + base.xM * scale;
          const y = layout.y + base.yM * scale;
          panels.push({
            id: `${roofId}-${groupId}-${row}-${col}`,
            number: panels.length + 1,
            roofId,
            groupId,
            row,
            col,
            groupName: group.name || `Panelgrupp ${groupIndex + 1}`,
            x,
            y,
            w: panelW,
            h: panelH,
            plus: { x: x + panelW + 7, y: y + panelH / 2 },
            minus: { x: x - 7, y: y + panelH / 2 },
          });
        }
      }
    });
  });

  return {
    roofs,
    groups,
    panels,
    width: Math.max(900, ...roofs.map(roof => roof.x + roof.w + 220)),
    height: Math.max(620, ...roofs.map(roof => roof.y + roof.h + roofGap + pad)),
  };
}

// --- SUB-KOMPONENTER ---

function Terminal({ panel, plus, side = 'inside', selected, onClick }) {
  if (!panel) return null;
  const point = plus ? panel.plus : panel.minus;
  const color = plus ? PLUS : MINUS;
  return (
    <g onClick={event => { event.stopPropagation(); onClick?.(); }} className="cursor-pointer">
      <circle cx={point.x} cy={point.y} r={selected ? 11 : 9} fill="#ffffff" stroke={color} strokeWidth={selected ? 2.6 : 2} />
      <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="13" fontWeight="900" fill={color}>{plus ? '+' : '-'}</text>
    </g>
  );
}

function PanelModule({ panel, owner, selected, activeString, tool, dragOffset, onPanelClick, onPanelPointerDown }) {
  const x = panel.x + (dragOffset?.dx || 0);
  const y = panel.y + (dragOffset?.dy || 0);
  const moving = tool === 'panel' || tool === 'group';
  const ring = selected ? activeString?.color || PLUS : owner?.color || '#2563eb';
  const accent = owner?.color || '#38bdf8';

  return (
    <g onPointerDown={event => moving && onPanelPointerDown(event, panel)} onClick={() => tool === 'string' && onPanelClick(panel)} className={moving ? 'cursor-move' : 'cursor-pointer'}>
      <rect x={x} y={y} width={panel.w} height={panel.h} rx="3" fill="#111827" stroke="#cbd5e1" strokeWidth="1.5" />
      <rect x={x + 2.5} y={y + 2.5} width={Math.max(0, panel.w - 5)} height={Math.max(0, panel.h - 5)} rx="2" fill="url(#pvGlass)" stroke={ring} strokeWidth={selected ? 3.2 : owner ? 2.4 : 1.4} />
      <rect x={x + 6} y={y + 6} width={Math.max(0, panel.w - 12)} height={Math.max(0, panel.h - 12)} rx="2" fill="url(#pvCells)" opacity="0.95" />
      <g transform={`translate(${x + 8}, ${y + 9})`}>
        <rect width="30" height="16" rx="4" fill="#ffffff" opacity="0.16" />
        <text x="15" y="12" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="900" fill="#f8fafc">{panel.row + 1}:{panel.col + 1}</text>
      </g>
    </g>
  );
}

function Canvas({ map, strings, activeId, activeString, tool, scale, onPanelClick, onStartPolarity, onMovePanel, onMoveGroup }) {
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [pan, setPan] = useState(null);
  
  const selectedIds = new Set();
  if (activeString?.nodes) {
    activeString.nodes.forEach(n => selectedIds.add(n.panelId));
  }

  const owners = new Map();
  strings.forEach(string => (string.nodes || []).forEach(node => {
    if (!owners.has(node.panelId) || string.id === activeId) owners.set(node.panelId, string);
  }));

  const startMove = (event, panel) => {
    event.preventDefault();
    const svg = event.currentTarget.ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX; pt.y = event.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    setDrag({ panel, mode: tool, startX: loc.x, startY: loc.y, dxM: 0, dyM: 0 });
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = event => {
    if (!drag) return;
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX; pt.y = event.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    setDrag(curr => ({ ...curr, dxM: (loc.x - curr.startX) / scale, dyM: (loc.y - curr.startY) / scale }));
  };

  const endPointer = () => {
    if (drag) {
      if (Math.abs(drag.dxM) > 0.01 || Math.abs(drag.dyM) > 0.01) {
        if (drag.mode === 'panel') onMovePanel(drag.panel, drag.dxM, drag.dyM);
        if (drag.mode === 'group') onMoveGroup(drag.panel, drag.dxM, drag.dyM);
      }
      setDrag(null);
    }
  };

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto rounded-2xl border border-slate-200 bg-slate-200/50 shadow-inner">
      <svg 
        width={map.width} 
        height={map.height} 
        viewBox={`0 0 ${map.width} ${map.height}`} 
        className="block touch-none bg-white shadow-2xl"
        style={{ margin: '40px auto' }}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
      >
        <defs>
          <pattern id="grid" width={scale/4} height={scale/4} patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#cbd5e1" /></pattern>
          <linearGradient id="pvGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0f172a" /><stop offset="100%" stopColor="#020617" /></linearGradient>
          <pattern id="pvCells" width="13" height="18" patternUnits="userSpaceOnUse"><rect width="13" height="18" fill="none" stroke="#e0f2fe" strokeWidth="0.45" opacity="0.20" /></pattern>
        </defs>
        
        <rect width={map.width} height={map.height} fill="url(#grid)" />

        {map.roofs.map(roof => (
          <g key={roof.roofId}>
            <polygon points={polygonPoints(roof.x, roof.y, roof.w, roof.h, roof.roof.shape)} fill="#f8fafc" stroke="#111827" strokeWidth="2" />
          </g>
        ))}

        {map.panels.map(panel => (
          <PanelModule 
            key={panel.id} 
            panel={panel} 
            owner={owners.get(panel.id)} 
            selected={selectedIds.has(panel.id)} 
            activeString={activeString} 
            tool={tool} 
            dragOffset={drag?.panel?.id === panel.id ? { dx: drag.dxM * scale, dy: drag.dyM * scale } : null}
            onPanelClick={onPanelClick} 
            onPanelPointerDown={startMove} 
          />
        ))}
      </svg>
    </div>
  );
}

// --- HUVUDKOMPONENT ---

export default function StringMarkingTabV7({ project, onUpdate }) {
  const saved = readSaved(project);
  const [plannerData, setPlannerData] = useState(() => readPlanner(project));
  const { data: products = [] } = useQuery({ queryKey: ['products-panels'], queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }) });
  
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [tool, setTool] = useState('string');
  const [showInspector, setShowInspector] = useState(true);
  
  const map = useMemo(() => buildMap(plannerData, products, scale), [plannerData, products, scale]);
  const [strings, setStrings] = useState(() => Array.from({ length: saved.stringCount || 1 }, (_, i) => makeString(i, saved.strings?.[i])));
  const [activeId, setActiveId] = useState(strings[0]?.id);

  // --- RENDERING ---

  return (
    <div className="flex h-[85vh] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 shadow-sm">
      <div className="flex h-full overflow-hidden">
        
        {/* Verktygsfält Vänster */}
        <aside className="flex w-[64px] flex-col items-center border-r border-slate-200 bg-white py-4 gap-4">
          <Button variant={tool === 'string' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('string')}><MousePointer2 className="h-5 w-5" /></Button>
          <Button variant={tool === 'panel' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('panel')}><Move className="h-5 w-5" /></Button>
          <Button variant={tool === 'group' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('group')}><Layers className="h-5 w-5" /></Button>
          <div className="mt-auto flex flex-col gap-2">
             <Button variant="ghost" size="icon" onClick={() => setScale(s => s + 10)}><ZoomIn className="h-5 w-5" /></Button>
             <Button variant="ghost" size="icon" onClick={() => setScale(s => s - 10)}><ZoomOut className="h-5 w-5" /></Button>
          </div>
        </aside>

        <main className="flex flex-1 flex-col p-4 gap-4 overflow-hidden">
          
          {/* --- LILA RAMEN: MASTER PREVIEW --- */}
          <section className="relative h-48 shrink-0 overflow-hidden rounded-2xl border-4 border-purple-400 bg-slate-900 shadow-lg">
            <div className="absolute top-2 left-4 z-10 flex items-center gap-2">
              <span className="rounded-full bg-purple-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Skalenlig Förhandsgranskning
              </span>
            </div>
            
            <div className="flex h-full items-center justify-center p-4">
              <svg viewBox={`0 0 ${map.width} ${map.height}`} className="h-full drop-shadow-xl">
                {map.roofs.map(roof => (
                   <polygon key={roof.roofId} points={polygonPoints(roof.x, roof.y, roof.w, roof.h, roof.roof.shape)} fill="rgba(249, 115, 22, 0.2)" stroke="#f97316" strokeWidth="2" />
                ))}
                {map.panels.map(panel => (
                  <rect key={panel.id} x={panel.x} y={panel.y} width={panel.w} height={panel.h} fill="#2563eb" stroke="white" strokeWidth="1" />
                ))}
              </svg>
            </div>
          </section>

          {/* --- STOR ARBETSYTA --- */}
          <section className="flex-1 min-h-0 relative">
            <Canvas 
              map={map} 
              strings={strings} 
              activeId={activeId} 
              activeString={strings.find(s => s.id === activeId)} 
              tool={tool} 
              scale={scale} 
              onMovePanel={(p, dx, dy) => {
                // Här lägger du till din befintliga movePanel-logik
                console.log("Move panel", p.id, dx, dy);
              }}
            />
          </section>
        </main>

        {/* Inspektor Höger */}
        {showInspector && (
          <aside className="w-[300px] border-l border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Inställningar</h3>
            <div className="space-y-4">
               <Card className="p-3 border-orange-100 bg-orange-50/30">
                 <div className="text-xs font-bold text-orange-600 mb-1">Vald Slinga</div>
                 <div className="text-lg font-black text-slate-900">{strings.find(s => s.id === activeId)?.name}</div>
               </Card>
               <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2">
                 <Save className="h-4 w-4" /> Spara Projektering
               </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// Hjälpfunktioner som saknas i ditt klistrade exempel men behövs
function makeString(index, old = {}) {
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${index + 1}`,
    color: old.color || COLORS[index % COLORS.length],
    nodes: old.nodes || [],
    mppt: old.mppt || 1,
    pvInput: old.pvInput || 1,
    startPolarity: old.startPolarity || 'plus'
  };
}
