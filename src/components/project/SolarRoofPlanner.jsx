import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Home, Maximize2, PanelTop, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

const DEFAULT_PANEL = { model: 'Standardpanel 500 W', w: 1.134, h: 1.953, watt: 500 };
const BASE_ROOF = {
  id: 1,
  name: 'Tak 1',
  widthM: 8,
  roofFallM: 6,
  shape: 'Rektangel',
  angleDeg: 27,
  material: 'Takpannor',
  panelGroups: [{ id: 2, name: 'Panelgrupp 1', rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} }],
  obstacles: [],
};
const SHAPES = ['Rektangel', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger', 'Vinkel vänster', 'Vinkel höger'];
const id = () => Math.floor(Date.now() + Math.random() * 99999);
const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const panelSize = (orientation) => orientation === 'Liggande' ? { w: DEFAULT_PANEL.h, h: DEFAULT_PANEL.w } : { w: DEFAULT_PANEL.w, h: DEFAULT_PANEL.h };

function calc(roofs) {
  return roofs.reduce((acc, roof) => {
    (roof.panelGroups || []).forEach((group) => {
      const s = panelSize(group.orientation);
      const panelCount = toNumber(group.rows) * toNumber(group.cols);
      const railsPerRow = group.threeRails ? 3 : 2;
      const rails = toNumber(group.rows) * railsPerRow;
      acc.panels += panelCount;
      acc.kwp += panelCount * DEFAULT_PANEL.watt / 1000;
      acc.rails += rails;
      acc.len += toNumber(group.cols) * s.w * rails;
      acc.hooks += (Math.ceil((toNumber(group.cols) * s.w) / 1.2) + 1) * rails;
      acc.end += toNumber(group.rows) * 4;
      acc.mid += Math.max(0, (toNumber(group.cols) - 1) * toNumber(group.rows) * 2);
    });
    return acc;
  }, { panels: 0, kwp: 0, rails: 0, len: 0, hooks: 0, end: 0, mid: 0 });
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

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-background shadow-xl"><div className="flex items-center justify-between border-b p-4"><h3 className="font-bold">{title}</h3><button onClick={onClose}>✕</button></div><div className="p-4">{children}</div></div></div>;
}
const Input = ({ label, ...props }) => <label className="block text-xs text-muted-foreground">{label}<input {...props} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>;
const Select = ({ label, children, ...props }) => <label className="block text-xs text-muted-foreground">{label}<select {...props} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm">{children}</select></label>;

function ScaleRuler({ x, y, scale }) {
  return <g><line x1={x} y1={y} x2={x + scale} y2={y} stroke="#0f172a" strokeWidth="2" /><line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="#0f172a" strokeWidth="2" /><line x1={x + scale} y1={y - 6} x2={x + scale} y2={y + 6} stroke="#0f172a" strokeWidth="2" /><text x={x + scale / 2} y={y - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f172a">1 m</text></g>;
}

function Canvas({ roofs, selectedRoofId, setSelectedRoofId, scale, setScale, deleteRoof, movePanel, moveGroup, selectedItem, setSelectedItem }) {
  const pad = 80;
  const roofGap = 110;
  const panelGapM = 0.03;
  const [drag, setDrag] = useState(null);
  let cursorY = pad;

  const layouts = useMemo(() => roofs.map((roof) => {
    const layout = { roof, x: pad, y: cursorY, w: toNumber(roof.widthM, 8) * scale, h: toNumber(roof.roofFallM, 6) * scale };
    cursorY += layout.h + roofGap;
    return layout;
  }), [roofs, scale]);
  const svgWidth = Math.max(900, ...layouts.map((layout) => layout.x + layout.w + 220));
  const svgHeight = Math.max(620, cursorY + pad);

  const pointFromEvent = (event) => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const startDrag = (event, mode, payload) => {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    setSelectedRoofId(payload.roofId);
    setSelectedItem({ mode, ...payload });
    setDrag({ mode, payload, startX: point.x, startY: point.y });
  };
  const onMove = (event) => {
    if (!drag) return;
    const point = pointFromEvent(event);
    const dxM = (point.x - drag.startX) / scale;
    const dyM = (point.y - drag.startY) / scale;
    if (drag.mode === 'panel') movePanel(drag.payload.roofId, drag.payload.groupId, drag.payload.row, drag.payload.col, dxM, dyM, false);
    if (drag.mode === 'group') moveGroup(drag.payload.roofId, drag.payload.groupId, dxM, dyM, false);
  };
  const endDrag = (event) => {
    if (!drag) return;
    const point = pointFromEvent(event);
    const dxM = (point.x - drag.startX) / scale;
    const dyM = (point.y - drag.startY) / scale;
    if (drag.mode === 'panel') movePanel(drag.payload.roofId, drag.payload.groupId, drag.payload.row, drag.payload.col, dxM, dyM, true);
    if (drag.mode === 'group') moveGroup(drag.payload.roofId, drag.payload.groupId, dxM, dyM, true);
    setDrag(null);
  };

  function renderPanelGroup(layout, group) {
    const s = panelSize(group.orientation);
    const panelW = s.w * scale;
    const panelH = s.h * scale;
    const gap = panelGapM * scale;
    const startX = layout.x + toNumber(group.xM) * scale;
    const startY = layout.y + toNumber(group.yM) * scale;
    const rows = Math.max(0, Math.round(toNumber(group.rows)));
    const cols = Math.max(0, Math.round(toNumber(group.cols)));
    const output = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row}-${col}`;
        const override = group.panelOverrides?.[key];
        const panelXM = override ? toNumber(override.xM) : toNumber(group.xM) + col * (s.w + panelGapM);
        const panelYM = override ? toNumber(override.yM) : toNumber(group.yM) + row * (s.h + panelGapM);
        const x = layout.x + panelXM * scale;
        const y = layout.y + panelYM * scale;
        const outsideRoof = x < layout.x || y < layout.y || x + panelW > layout.x + layout.w || y + panelH > layout.y + layout.h;
        const activePanel = selectedItem?.mode === 'panel' && selectedItem.groupId === group.id && selectedItem.row === row && selectedItem.col === col;
        output.push(
          <g key={`p-${group.id}-${row}-${col}`} onPointerDown={(event) => startDrag(event, event.detail >= 2 ? 'group' : 'panel', { roofId: layout.roof.id, groupId: group.id, row, col })} className="cursor-move">
            <rect x={x} y={y} width={panelW} height={panelH} rx="3" fill={outsideRoof ? '#fee2e2' : '#dbeafe'} stroke={activePanel ? '#7c3aed' : outsideRoof ? '#ef4444' : '#2563eb'} strokeWidth={activePanel ? '3' : '1.4'} />
            <line x1={x + panelW / 3} y1={y + 3} x2={x + panelW / 3} y2={y + panelH - 3} stroke={outsideRoof ? '#fca5a5' : '#93c5fd'} />
            <line x1={x + panelW * 2 / 3} y1={y + 3} x2={x + panelW * 2 / 3} y2={y + panelH - 3} stroke={outsideRoof ? '#fca5a5' : '#93c5fd'} />
            <text x={x + panelW / 2} y={y + panelH / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{row + 1}:{col + 1}</text>
          </g>
        );
      }
    }

    const groupWidth = cols * panelW + Math.max(0, cols - 1) * gap;
    for (let row = 0; row < rows; row++) {
      const y = startY + row * (panelH + gap);
      const railOffsets = group.threeRails ? [toNumber(group.clampMm, 391) / 1000 * scale, panelH / 2, panelH - toNumber(group.clampMm, 391) / 1000 * scale] : [toNumber(group.clampMm, 391) / 1000 * scale, panelH - toNumber(group.clampMm, 391) / 1000 * scale];
      railOffsets.forEach((offset, index) => {
        const railY = y + offset;
        output.push(<line key={`rail-${group.id}-${row}-${index}`} x1={startX - 8} y1={railY} x2={startX + groupWidth + 8} y2={railY} stroke="#8b5e34" strokeWidth="4" strokeLinecap="round" onPointerDown={(event) => startDrag(event, 'group', { roofId: layout.roof.id, groupId: group.id })} className="cursor-move" />);
      });
    }
    return output;
  }

  return <div className="relative overflow-auto rounded-2xl border bg-white"><div className="absolute right-3 top-3 z-10 flex flex-col gap-2 print:hidden"><button onClick={() => setScale((z) => Math.min(120, z + 8))} className="rounded bg-white p-2 shadow"><ZoomIn className="h-4 w-4" /></button><button onClick={() => setScale((z) => Math.max(24, z - 8))} className="rounded bg-white p-2 shadow"><ZoomOut className="h-4 w-4" /></button><button onClick={() => setScale(60)} className="rounded bg-white p-2 shadow"><Maximize2 className="h-4 w-4" /></button></div><svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="block h-[620px] w-full min-w-[900px] bg-white" onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}><defs><pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs><ScaleRuler x={24} y={34} scale={scale} />{layouts.map((layout) => { const roofCalc = calc([layout.roof]); const active = layout.roof.id === selectedRoofId; return <g key={layout.roof.id} onClick={() => setSelectedRoofId(layout.roof.id)} className="cursor-pointer"><text x={layout.x} y={layout.y - 24} fontSize="18" fontWeight="800">{layout.roof.name}</text><polygon points={polygonPoints(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#roof-hatch)" stroke={active ? '#7c3aed' : '#111827'} strokeWidth={active ? 4 : 2.5} />{(layout.roof.panelGroups || []).flatMap((group) => renderPanelGroup(layout, group))}{(layout.roof.obstacles || []).map((obstacle) => <g key={obstacle.id}><rect x={layout.x + toNumber(obstacle.xM) * scale} y={layout.y + toNumber(obstacle.yM) * scale} width={toNumber(obstacle.widthM) * scale} height={toNumber(obstacle.lengthM) * scale} rx="4" fill="#fee2e2" stroke="#ef4444" strokeDasharray="5 4" /><text x={layout.x + toNumber(obstacle.xM) * scale + 6} y={layout.y + toNumber(obstacle.yM) * scale + 18} fontSize="11" fill="#991b1b">{obstacle.name}</text></g>)}<foreignObject x={layout.x + layout.w - 120} y={layout.y + 14} width="110" height="36"><div className="rounded-full bg-white px-3 py-2 text-center text-xs font-bold shadow">{roofCalc.panels} paneler</div></foreignObject><line x1={layout.x} y1={layout.y + layout.h + 28} x2={layout.x + layout.w} y2={layout.y + layout.h + 28} stroke="#2563eb" strokeWidth="2" /><text x={layout.x + layout.w / 2} y={layout.y + layout.h + 49} textAnchor="middle" fontSize="13" fill="#2563eb" fontWeight="700">{layout.roof.widthM} m</text><line x1={layout.x + layout.w + 24} y1={layout.y} x2={layout.x + layout.w + 24} y2={layout.y + layout.h} stroke="#2563eb" strokeWidth="2" /><text x={layout.x + layout.w + 46} y={layout.y + layout.h / 2} fontSize="13" fill="#2563eb" fontWeight="700">{layout.roof.roofFallM} m</text>{active && <foreignObject x={layout.x} y={layout.y - 14} width="50" height="34"><button onClick={(event) => { event.stopPropagation(); deleteRoof(layout.roof.id); }} className="rounded-full bg-white p-2 text-red-600 shadow"><Trash2 className="h-4 w-4" /></button></foreignObject>}</g>; })}</svg></div>;
}

function RoofForm({ onSave, onClose }) {
  const [roof, setRoof] = useState({ ...BASE_ROOF, id: id(), name: 'Tak 1', panelGroups: [], obstacles: [] });
  const set = (patch) => setRoof((value) => ({ ...value, ...patch }));
  return <Modal title="Lägg till tak" onClose={onClose}><div className="grid gap-3 md:grid-cols-2"><Input label="Namn" value={roof.name} onChange={(e) => set({ name: e.target.value })} /><Select label="Takform" value={roof.shape} onChange={(e) => set({ shape: e.target.value })}>{SHAPES.map((shape) => <option key={shape}>{shape}</option>)}</Select><Input label="Bredd A (m)" type="number" step=".1" value={roof.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} /><Input label="Takfall B (m)" type="number" step=".1" value={roof.roofFallM} onChange={(e) => set({ roofFallM: Number(e.target.value) })} /><Input label="Taklutning (°)" type="number" value={roof.angleDeg} onChange={(e) => set({ angleDeg: Number(e.target.value) })} /><Input label="Material" value={roof.material} onChange={(e) => set({ material: e.target.value })} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave(roof)}>Spara</Button></div></Modal>;
}
function GroupForm({ onSave, onClose }) {
  const [group, setGroup] = useState({ id: id(), name: 'Panelgrupp', rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} });
  const set = (patch) => setGroup((value) => ({ ...value, ...patch }));
  return <Modal title="Lägg till panelgrupp" onClose={onClose}><div className="grid gap-3 md:grid-cols-2"><Input label="Namn" value={group.name} onChange={(e) => set({ name: e.target.value })} /><Select label="Panelmontering" value={group.orientation} onChange={(e) => set({ orientation: e.target.value })}><option>Stående</option><option>Liggande</option></Select><Input label="Rader" type="number" value={group.rows} onChange={(e) => set({ rows: Number(e.target.value) })} /><Input label="Kolumner" type="number" value={group.cols} onChange={(e) => set({ cols: Number(e.target.value) })} /><Input label="Position X från vänster takkant (m)" type="number" step=".1" value={group.xM} onChange={(e) => set({ xM: Number(e.target.value) })} /><Input label="Position Y från övre takkant (m)" type="number" step=".1" value={group.yM} onChange={(e) => set({ yM: Number(e.target.value) })} /><Input label="Klämzon (mm)" type="number" value={group.clampMm} onChange={(e) => set({ clampMm: Number(e.target.value) })} /><label className="pt-6 text-sm"><input type="checkbox" checked={group.threeRails} onChange={(e) => set({ threeRails: e.target.checked })} /> Använd tre skenor</label></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave(group)}>Lägg till</Button></div></Modal>;
}
function ObstacleForm({ onSave, onClose }) {
  const [obstacle, setObstacle] = useState({ id: id(), name: 'Hinder', widthM: 0.8, lengthM: 0.8, xM: 2, yM: 2 });
  const set = (patch) => setObstacle((value) => ({ ...value, ...patch }));
  return <Modal title="Lägg till hinder" onClose={onClose}><div className="grid gap-3 md:grid-cols-2"><Input label="Namn" value={obstacle.name} onChange={(e) => set({ name: e.target.value })} /><Input label="Bredd (m)" type="number" step=".1" value={obstacle.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} /><Input label="Längd (m)" type="number" step=".1" value={obstacle.lengthM} onChange={(e) => set({ lengthM: Number(e.target.value) })} /><Input label="Position X (m)" type="number" step=".1" value={obstacle.xM} onChange={(e) => set({ xM: Number(e.target.value) })} /><Input label="Position Y (m)" type="number" step=".1" value={obstacle.yM} onChange={(e) => set({ yM: Number(e.target.value) })} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave(obstacle)}>Lägg till</Button></div></Modal>;
}

export default function SolarRoofPlanner({ project, onUpdate }) {
  const [roofs, setRoofs] = useState(() => { try { const data = JSON.parse(project?.solar_roof_planner_data || 'null'); if (data?.roofs?.length) return data.roofs; } catch {} return [{ ...BASE_ROOF, widthM: Number(project?.roof_width_m) || 8, roofFallM: Number(project?.roof_height_m) || 6 }]; });
  const [selectedRoofId, setSelectedRoofId] = useState(roofs[0]?.id || 1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [scale, setScale] = useState(60);
  const selectedRoof = roofs.find((roof) => roof.id === selectedRoofId) || roofs[0];
  const totals = calc(roofs);
  const save = (nextRoofs) => { setRoofs(nextRoofs); onUpdate?.({ solar_roof_planner_data: JSON.stringify({ version: 3, scaleType: 'meter', panelModel: DEFAULT_PANEL, roofs: nextRoofs }) }); };
  const updateGroup = (roofId, groupId, updater, persist = true) => {
    const next = roofs.map((roof) => roof.id === roofId ? { ...roof, panelGroups: (roof.panelGroups || []).map((group) => group.id === groupId ? updater(group, roof) : group) } : roof);
    persist ? save(next) : setRoofs(next);
  };
  const moveGroup = (roofId, groupId, dxM, dyM, persist) => updateGroup(roofId, groupId, (group, roof) => ({ ...group, xM: clamp(toNumber(group.xM) + dxM, 0, toNumber(roof.widthM, 8)), yM: clamp(toNumber(group.yM) + dyM, 0, toNumber(roof.roofFallM, 6)) }), persist);
  const movePanel = (roofId, groupId, row, col, dxM, dyM, persist) => updateGroup(roofId, groupId, (group, roof) => { const size = panelSize(group.orientation); const key = `${row}-${col}`; const baseX = toNumber(group.xM) + col * (size.w + 0.03); const baseY = toNumber(group.yM) + row * (size.h + 0.03); const current = group.panelOverrides?.[key] || { xM: baseX, yM: baseY }; return { ...group, panelOverrides: { ...(group.panelOverrides || {}), [key]: { xM: clamp(toNumber(current.xM) + dxM, 0, toNumber(roof.widthM, 8)), yM: clamp(toNumber(current.yM) + dyM, 0, toNumber(roof.roofFallM, 6)) } } }; }, persist);
  const addRoof = (roof) => { save([...roofs, roof]); setSelectedRoofId(roof.id); setDialog(null); };
  const addGroup = (group) => { save(roofs.map((roof) => roof.id === selectedRoof.id ? { ...roof, panelGroups: [...(roof.panelGroups || []), group] } : roof)); setDialog(null); };
  const addObstacle = (obstacle) => { save(roofs.map((roof) => roof.id === selectedRoof.id ? { ...roof, obstacles: [...(roof.obstacles || []), obstacle] } : roof)); setDialog(null); };
  const deleteRoof = (roofId) => { const next = roofs.filter((roof) => roof.id !== roofId); save(next.length ? next : [{ ...BASE_ROOF, id: id(), panelGroups: [], obstacles: [] }]); setSelectedRoofId(next[0]?.id || 1); };

  return <div className="space-y-4"><Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><PanelTop className="h-4 w-4 text-primary" />Solcellskalkylator – skalenlig projektvy</CardTitle><p className="text-sm text-muted-foreground">Enkeltryck och dra en panel för att flytta bara den panelen. Dubbeltryck och dra en panel för att flytta hela panelgruppen.</p></div><div className="flex flex-wrap gap-2"><Badge variant="secondary">1 m = {scale} px</Badge><Button variant="outline" size="sm" onClick={() => setDialog('roof')}><Plus className="mr-1 h-4 w-4" />Tak</Button><Button variant="outline" size="sm" onClick={() => setDialog('group')} disabled={!selectedRoof}><PanelTop className="mr-1 h-4 w-4" />Panelgrupp</Button><Button variant="outline" size="sm" onClick={() => setDialog('obstacle')} disabled={!selectedRoof}><AlertTriangle className="mr-1 h-4 w-4" />Hinder</Button></div></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-5"><div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-2xl font-bold">{totals.panels}</div></div><div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Effekt</div><div className="text-2xl font-bold">{totals.kwp.toFixed(2)} kWp</div></div><div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Skenor</div><div className="text-2xl font-bold">{totals.rails}</div></div><div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Skenlängd</div><div className="text-2xl font-bold">{totals.len.toFixed(1)} m</div></div><div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Takkrokar</div><div className="text-2xl font-bold">{totals.hooks}</div></div></div><Canvas roofs={roofs} selectedRoofId={selectedRoofId} setSelectedRoofId={setSelectedRoofId} scale={scale} setScale={setScale} deleteRoof={deleteRoof} movePanel={movePanel} moveGroup={moveGroup} selectedItem={selectedItem} setSelectedItem={setSelectedItem} /><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Home className="mr-2 inline h-4 w-4" />Skalenlig ritning. Enskilda paneler sparas med panelOverrides. Dubbeltryck/drag flyttar hela gruppen.</div></CardContent></Card>{dialog === 'roof' && <RoofForm onSave={addRoof} onClose={() => setDialog(null)} />}{dialog === 'group' && <GroupForm onSave={addGroup} onClose={() => setDialog(null)} />}{dialog === 'obstacle' && <ObstacleForm onSave={addObstacle} onClose={() => setDialog(null)} />}</div>;
}
