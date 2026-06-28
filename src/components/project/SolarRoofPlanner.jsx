import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Home, Maximize2, MousePointer2, PanelTop, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { filterVisibleProducts } from '@/lib/tenantQueries';

const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };
const PANEL_GAP_M = 0.03;
const BASE_ROOF = {
  id: 1,
  name: 'Tak 1',
  widthM: 8,
  roofFallM: 6,
  shape: 'Rektangel',
  angleDeg: 27,
  material: 'Takpannor',
  panelProductId: '',
  panelGroups: [{ id: 2, name: 'Panelgrupp 1', rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} }],
  obstacles: [],
};
const SHAPES = ['Rektangel', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger', 'Vinkel vänster', 'Vinkel höger'];
const genId = () => Math.floor(Date.now() + Math.random() * 99999);
const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const productLabel = (product) => [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
const plannerStorageKey = (projectId) => `solarplan:project:${projectId}:solar_roof_planner_data`;
const hasPanelGroups = (data) => data?.roofs?.some((roof) => (roof.panelGroups || []).length);

function readStoredPlanner(project) {
  const projectData = (() => {
    try { return JSON.parse(project?.solar_roof_planner_data || 'null'); } catch { return null; }
  })();

  let localData = null;
  if (typeof window !== 'undefined' && project?.id) {
    try {
      localData = JSON.parse(window.localStorage.getItem(plannerStorageKey(project.id)) || 'null');
    } catch {}
  }

  if (hasPanelGroups(localData) && !hasPanelGroups(projectData)) return localData;
  if (projectData?.roofs?.length) return projectData;
  if (localData?.roofs?.length) return localData;

  return null;
}

function writeStoredPlanner(projectId, payload) {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    window.localStorage.setItem(plannerStorageKey(projectId), JSON.stringify(payload));
  } catch {}
}

function panelProductForRoof(roof, products) {
  return products.find((product) => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function panelSnapshot(product) {
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    model: product.model,
    width_mm: product.width_mm,
    height_mm: product.height_mm,
    power_watts: product.power_watts,
  };
}

function panelSize(orientation, product) {
  const base = {
    w: (toNumber(product?.width_mm, DEFAULT_PANEL.width_mm) || DEFAULT_PANEL.width_mm) / 1000,
    h: (toNumber(product?.height_mm, DEFAULT_PANEL.height_mm) || DEFAULT_PANEL.height_mm) / 1000,
  };
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function calc(roofs, products) {
  return roofs.reduce((acc, roof) => {
    const product = panelProductForRoof(roof, products);
    (roof.panelGroups || []).forEach((group) => {
      const s = panelSize(group.orientation, product);
      const panelCount = toNumber(group.rows) * toNumber(group.cols);
      const railsPerPanel = group.threeRails ? 3 : 2;
      acc.panels += panelCount;
      acc.kwp += panelCount * toNumber(product.power_watts, DEFAULT_PANEL.power_watts) / 1000;
      acc.rails += panelCount * railsPerPanel;
      acc.len += panelCount * s.w * railsPerPanel;
      acc.hooks += Math.ceil(panelCount * railsPerPanel * 2);
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}>x</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

const Input = ({ label, ...props }) => <label className="block text-xs text-muted-foreground">{label}<input {...props} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>;
const Select = ({ label, children, ...props }) => <label className="block text-xs text-muted-foreground">{label}<select {...props} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm">{children}</select></label>;

function ScaleRuler({ x, y, scale }) {
  return <g><line x1={x} y1={y} x2={x + scale} y2={y} stroke="#0f172a" strokeWidth="2" /><line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="#0f172a" strokeWidth="2" /><line x1={x + scale} y1={y - 6} x2={x + scale} y2={y + 6} stroke="#0f172a" strokeWidth="2" /><text x={x + scale / 2} y={y - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f172a">1 m</text></g>;
}

function groupPhysicalSize(group, roof, products) {
  const s = panelSize(group.orientation, panelProductForRoof(roof, products));
  return { w: toNumber(group.cols) * s.w + Math.max(0, toNumber(group.cols) - 1) * PANEL_GAP_M, h: toNumber(group.rows) * s.h + Math.max(0, toNumber(group.rows) - 1) * PANEL_GAP_M };
}

function getPanelBasePosition(group, roof, products, row, col) {
  const s = panelSize(group.orientation, panelProductForRoof(roof, products));
  const key = `${row}-${col}`;
  const override = group.panelOverrides?.[key];
  return override ? { xM: toNumber(override.xM), yM: toNumber(override.yM) } : { xM: toNumber(group.xM) + col * (s.w + PANEL_GAP_M), yM: toNumber(group.yM) + row * (s.h + PANEL_GAP_M) };
}

function Canvas({ roofs, products, selectedRoofId, setSelectedRoofId, scale, setScale, deleteRoof, commitPanelMove, commitGroupMove, selectedItem, setSelectedItem, dragMode }) {
  const pad = 80;
  const roofGap = 110;
  const [drag, setDrag] = useState(null);
  const layouts = useMemo(() => {
    let cursorY = pad;
    return roofs.map((roof) => {
      const layout = { roof, x: pad, y: cursorY, w: toNumber(roof.widthM, 8) * scale, h: toNumber(roof.roofFallM, 6) * scale };
      cursorY += layout.h + roofGap;
      return layout;
    });
  }, [roofs, scale]);
  const svgWidth = Math.max(900, ...layouts.map((layout) => layout.x + layout.w + 220));
  const svgHeight = Math.max(620, ...layouts.map((layout) => layout.y + layout.h + roofGap + pad));
  const pointFromEvent = (event) => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const startDrag = (event, requestedMode, payload) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const mode = event.detail >= 2 ? 'group' : requestedMode;
    setSelectedRoofId(payload.roofId);
    setSelectedItem({ mode, ...payload });
    setDrag({ mode, payload, startX: point.x, startY: point.y, dxM: 0, dyM: 0 });
  };
  const onMove = (event) => {
    if (!drag) return;
    const point = pointFromEvent(event);
    setDrag((current) => current ? { ...current, dxM: (point.x - current.startX) / scale, dyM: (point.y - current.startY) / scale } : current);
  };
  const endDrag = () => {
    if (!drag) return;
    if (Math.abs(drag.dxM) > 0.005 || Math.abs(drag.dyM) > 0.005) {
      if (drag.mode === 'panel') commitPanelMove(drag.payload.roofId, drag.payload.groupId, drag.payload.row, drag.payload.col, drag.dxM, drag.dyM);
      if (drag.mode === 'group') commitGroupMove(drag.payload.roofId, drag.payload.groupId, drag.dxM, drag.dyM);
    }
    setDrag(null);
  };
  const previewShift = (group, row, col) => {
    if (!drag) return { dx: 0, dy: 0 };
    if (drag.mode === 'group' && drag.payload.groupId === group.id) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    if (drag.mode === 'panel' && drag.payload.groupId === group.id && drag.payload.row === row && drag.payload.col === col) return { dx: drag.dxM * scale, dy: drag.dyM * scale };
    return { dx: 0, dy: 0 };
  };
  function railOffsets(group, panelH) {
    const clampOffset = toNumber(group.clampMm, 391) / 1000 * scale;
    return group.threeRails ? [clampOffset, panelH / 2, panelH - clampOffset] : [clampOffset, panelH - clampOffset];
  }
  function renderPanelGroup(layout, group) {
    const product = panelProductForRoof(layout.roof, products);
    const s = panelSize(group.orientation, product);
    const panelW = s.w * scale;
    const panelH = s.h * scale;
    const rows = Math.max(0, Math.round(toNumber(group.rows)));
    const cols = Math.max(0, Math.round(toNumber(group.cols)));
    const output = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const panelPos = getPanelBasePosition(group, layout.roof, products, row, col);
        const shift = previewShift(group, row, col);
        const x = layout.x + panelPos.xM * scale + shift.dx;
        const y = layout.y + panelPos.yM * scale + shift.dy;
        const outsideRoof = x < layout.x || y < layout.y || x + panelW > layout.x + layout.w || y + panelH > layout.y + layout.h;
        const activePanel = selectedItem?.mode === 'panel' && selectedItem.groupId === group.id && selectedItem.row === row && selectedItem.col === col;
        output.push(
          <g key={`p-${group.id}-${row}-${col}`} onPointerDown={(event) => startDrag(event, dragMode, { roofId: layout.roof.id, groupId: group.id, row, col })} className="cursor-move">
            <rect x={x} y={y} width={panelW} height={panelH} rx="3" fill={outsideRoof ? '#fee2e2' : '#dbeafe'} stroke={activePanel ? '#7c3aed' : outsideRoof ? '#ef4444' : '#2563eb'} strokeWidth={activePanel ? 3 : 1.4} />
            <line x1={x + panelW / 3} y1={y + 3} x2={x + panelW / 3} y2={y + panelH - 3} stroke={outsideRoof ? '#fca5a5' : '#93c5fd'} />
            <line x1={x + panelW * 2 / 3} y1={y + 3} x2={x + panelW * 2 / 3} y2={y + panelH - 3} stroke={outsideRoof ? '#fca5a5' : '#93c5fd'} />
            {railOffsets(group, panelH).map((offset, index) => <line key={`rail-${group.id}-${row}-${col}-${index}`} x1={x + 8} y1={y + offset} x2={x + panelW - 8} y2={y + offset} stroke="#8b5e34" strokeWidth="4" strokeLinecap="round" />)}
            <text x={x + panelW / 2} y={y + panelH / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{row + 1}:{col + 1}</text>
          </g>
        );
      }
    }
    return output;
  }

  return (
    <div className="relative overflow-auto rounded-2xl border bg-white">
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 print:hidden">
        <button onClick={() => setScale((z) => Math.min(120, z + 8))} className="rounded bg-white p-2 shadow"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={() => setScale((z) => Math.max(24, z - 8))} className="rounded bg-white p-2 shadow"><ZoomOut className="h-4 w-4" /></button>
        <button onClick={() => setScale(60)} className="rounded bg-white p-2 shadow"><Maximize2 className="h-4 w-4" /></button>
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="block h-[620px] w-full min-w-[900px] bg-white touch-none" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}>
        <defs><pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        <ScaleRuler x={24} y={34} scale={scale} />
        {layouts.map((layout) => {
          const roofCalc = calc([layout.roof], products);
          const active = layout.roof.id === selectedRoofId;
          const product = panelProductForRoof(layout.roof, products);
          return (
            <g key={layout.roof.id} onClick={() => setSelectedRoofId(layout.roof.id)} className="cursor-pointer">
              <text x={layout.x} y={layout.y - 24} fontSize="18" fontWeight="800">{layout.roof.name}</text>
              <text x={layout.x} y={layout.y - 7} fontSize="11" fill="#64748b">{productLabel(product)} · {toNumber(product.width_mm, DEFAULT_PANEL.width_mm)}x{toNumber(product.height_mm, DEFAULT_PANEL.height_mm)} mm</text>
              <polygon points={polygonPoints(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#roof-hatch)" stroke={active ? '#7c3aed' : '#111827'} strokeWidth={active ? 4 : 2.5} />
              {(layout.roof.panelGroups || []).flatMap((group) => renderPanelGroup(layout, group))}
              {(layout.roof.obstacles || []).map((obstacle) => <g key={obstacle.id}><rect x={layout.x + toNumber(obstacle.xM) * scale} y={layout.y + toNumber(obstacle.yM) * scale} width={toNumber(obstacle.widthM) * scale} height={toNumber(obstacle.lengthM) * scale} rx="4" fill="#fee2e2" stroke="#ef4444" strokeDasharray="5 4" /><text x={layout.x + toNumber(obstacle.xM) * scale + 6} y={layout.y + toNumber(obstacle.yM) * scale + 18} fontSize="11" fill="#991b1b">{obstacle.name}</text></g>)}
              <foreignObject x={layout.x + layout.w - 120} y={layout.y + 14} width="110" height="36"><div className="rounded-full bg-white px-3 py-2 text-center text-xs font-bold shadow">{roofCalc.panels} paneler</div></foreignObject>
              <line x1={layout.x} y1={layout.y + layout.h + 28} x2={layout.x + layout.w} y2={layout.y + layout.h + 28} stroke="#2563eb" strokeWidth="2" />
              <text x={layout.x + layout.w / 2} y={layout.y + layout.h + 49} textAnchor="middle" fontSize="13" fill="#2563eb" fontWeight="700">{layout.roof.widthM} m</text>
              <line x1={layout.x + layout.w + 24} y1={layout.y} x2={layout.x + layout.w + 24} y2={layout.y + layout.h} stroke="#2563eb" strokeWidth="2" />
              <text x={layout.x + layout.w + 46} y={layout.y + layout.h / 2} fontSize="13" fill="#2563eb" fontWeight="700">{layout.roof.roofFallM} m</text>
              {active && <foreignObject x={layout.x} y={layout.y - 14} width="50" height="34"><button onClick={(event) => { event.stopPropagation(); deleteRoof(layout.roof.id); }} className="rounded-full bg-white p-2 text-red-600 shadow"><Trash2 className="h-4 w-4" /></button></foreignObject>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RoofForm({ onSave, onClose, products }) {
  const [roof, setRoof] = useState({ ...BASE_ROOF, id: genId(), name: 'Tak 1', panelGroups: [], obstacles: [] });
  const set = (patch) => setRoof((value) => ({ ...value, ...patch }));
  const selectedProduct = products.find((product) => product.id === roof.panelProductId) || null;
  return (
    <Modal title="Lägg till tak" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Namn" value={roof.name} onChange={(event) => set({ name: event.target.value })} />
        <Select label="Takform" value={roof.shape} onChange={(event) => set({ shape: event.target.value })}>{SHAPES.map((shape) => <option key={shape}>{shape}</option>)}</Select>
        <Input label="Bredd A (m)" type="number" step=".1" value={roof.widthM} onChange={(event) => set({ widthM: Number(event.target.value) })} />
        <Input label="Takfall B (m)" type="number" step=".1" value={roof.roofFallM} onChange={(event) => set({ roofFallM: Number(event.target.value) })} />
        <Input label="Taklutning (°)" type="number" value={roof.angleDeg} onChange={(event) => set({ angleDeg: Number(event.target.value) })} />
        <Input label="Material" value={roof.material} onChange={(event) => set({ material: event.target.value })} />
        <div className="md:col-span-2">
          <ProductSearchSelect label="Solpanel för detta tak" products={products} value={roof.panelProductId} onChange={(value) => set({ panelProductId: value })} placeholder="Välj solpanel från produktkatalogen" />
          {selectedProduct && <p className="mt-2 text-xs text-muted-foreground">{toNumber(selectedProduct.width_mm)} x {toNumber(selectedProduct.height_mm)} mm · {toNumber(selectedProduct.power_watts)} W används för skalenlig ritning.</p>}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave({ ...roof, panelProductSnapshot: panelSnapshot(selectedProduct) })}>Spara</Button></div>
    </Modal>
  );
}

function GroupForm({ onSave, onClose }) {
  const [group, setGroup] = useState({ id: genId(), name: 'Panelgrupp', rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} });
  const set = (patch) => setGroup((value) => ({ ...value, ...patch }));
  return (
    <Modal title="Lägg till panelgrupp" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Namn" value={group.name} onChange={(event) => set({ name: event.target.value })} />
        <Select label="Panelmontering" value={group.orientation} onChange={(event) => set({ orientation: event.target.value })}><option>Stående</option><option>Liggande</option></Select>
        <Input label="Rader" type="number" value={group.rows} onChange={(event) => set({ rows: Number(event.target.value) })} />
        <Input label="Kolumner" type="number" value={group.cols} onChange={(event) => set({ cols: Number(event.target.value) })} />
        <Input label="Position X från vänster takkant (m)" type="number" step=".1" value={group.xM} onChange={(event) => set({ xM: Number(event.target.value) })} />
        <Input label="Position Y från övre takkant (m)" type="number" step=".1" value={group.yM} onChange={(event) => set({ yM: Number(event.target.value) })} />
        <Input label="Klämzon (mm)" type="number" value={group.clampMm} onChange={(event) => set({ clampMm: Number(event.target.value) })} />
        <label className="pt-6 text-sm"><input type="checkbox" checked={group.threeRails} onChange={(event) => set({ threeRails: event.target.checked })} /> Använd tre skenor</label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave(group)}>Lägg till</Button></div>
    </Modal>
  );
}

function ObstacleForm({ onSave, onClose }) {
  const [obstacle, setObstacle] = useState({ id: genId(), name: 'Hinder', widthM: 0.8, lengthM: 0.8, xM: 2, yM: 2 });
  const set = (patch) => setObstacle((value) => ({ ...value, ...patch }));
  return (
    <Modal title="Lägg till hinder" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Namn" value={obstacle.name} onChange={(event) => set({ name: event.target.value })} />
        <Input label="Bredd (m)" type="number" step=".1" value={obstacle.widthM} onChange={(event) => set({ widthM: Number(event.target.value) })} />
        <Input label="Längd (m)" type="number" step=".1" value={obstacle.lengthM} onChange={(event) => set({ lengthM: Number(event.target.value) })} />
        <Input label="Position X (m)" type="number" step=".1" value={obstacle.xM} onChange={(event) => set({ xM: Number(event.target.value) })} />
        <Input label="Position Y (m)" type="number" step=".1" value={obstacle.yM} onChange={(event) => set({ yM: Number(event.target.value) })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Avbryt</Button><Button onClick={() => onSave(obstacle)}>Lägg till</Button></div>
    </Modal>
  );
}

export default function SolarRoofPlanner({ project, onUpdate }) {
  const pendingSaveRef = useRef(null);
  const savingRef = useRef(false);
  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-roof-planner'],
    queryFn: () => filterVisibleProducts({ category: 'solpanel' }),
  });
  const panelProducts = products.filter((product) => product.is_active !== false);
  const [roofs, setRoofs] = useState(() => {
    const stored = readStoredPlanner(project);
    if (stored?.roofs?.length) return stored.roofs;
    return [{ ...BASE_ROOF, id: genId(), widthM: Number(project?.roof_width_m) || 8, roofFallM: Number(project?.roof_height_m) || 6 }];
  });
  const [selectedRoofId, setSelectedRoofId] = useState(roofs[0]?.id || 1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dragMode, setDragMode] = useState('panel');
  const [dialog, setDialog] = useState(null);
  const [scale, setScale] = useState(60);
  const selectedRoof = roofs.find((roof) => roof.id === selectedRoofId) || roofs[0];
  const selectedProduct = panelProductForRoof(selectedRoof, panelProducts);
  const totals = calc(roofs, panelProducts);
  const selectedGroupWarnings = (selectedRoof?.panelGroups || []).map((group) => ({ group, size: groupPhysicalSize(group, selectedRoof, panelProducts) })).filter(({ group, size }) => size.w + toNumber(group.xM) > toNumber(selectedRoof.widthM) || size.h + toNumber(group.yM) > toNumber(selectedRoof.roofFallM));

  const flushSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (pendingSaveRef.current) {
        const payload = pendingSaveRef.current;
        pendingSaveRef.current = null;
        await onUpdate?.({ solar_roof_planner_data: JSON.stringify(payload) });
      }
    } finally {
      savingRef.current = false;
    }
  };

  const save = (nextRoofs) => {
    setRoofs(nextRoofs);
    const payload = { version: 7, scaleType: 'meter', railMode: 'per-panel', roofs: nextRoofs };
    writeStoredPlanner(project?.id, payload);
    pendingSaveRef.current = payload;
    flushSave();
  };
  const updateRoof = (roofId, updater) => save(roofs.map((roof) => roof.id === roofId ? updater(roof) : roof));
  const updateSelectedRoofProduct = (productId) => {
    const product = panelProducts.find((item) => item.id === productId) || null;
    updateRoof(selectedRoof.id, (roof) => ({ ...roof, panelProductId: productId, panelProductSnapshot: panelSnapshot(product) }));
  };
  const updateGroup = (roofId, groupId, updater) => save(roofs.map((roof) => roof.id === roofId ? { ...roof, panelGroups: (roof.panelGroups || []).map((group) => group.id === groupId ? updater(group, roof) : group) } : roof));
  const commitGroupMove = (roofId, groupId, dxM, dyM) => updateGroup(roofId, groupId, (group, roof) => {
    const size = groupPhysicalSize(group, roof, panelProducts);
    return { ...group, xM: clamp(toNumber(group.xM) + dxM, 0, Math.max(0, toNumber(roof.widthM, 8) - size.w)), yM: clamp(toNumber(group.yM) + dyM, 0, Math.max(0, toNumber(roof.roofFallM, 6) - size.h)) };
  });
  const commitPanelMove = (roofId, groupId, row, col, dxM, dyM) => updateGroup(roofId, groupId, (group, roof) => {
    const size = panelSize(group.orientation, panelProductForRoof(roof, panelProducts));
    const key = `${row}-${col}`;
    const current = getPanelBasePosition(group, roof, panelProducts, row, col);
    return { ...group, panelOverrides: { ...(group.panelOverrides || {}), [key]: { xM: clamp(toNumber(current.xM) + dxM, 0, Math.max(0, toNumber(roof.widthM, 8) - size.w)), yM: clamp(toNumber(current.yM) + dyM, 0, Math.max(0, toNumber(roof.roofFallM, 6) - size.h)) } } };
  });
  const addRoof = (roof) => { save([...roofs, roof]); setSelectedRoofId(roof.id); setDialog(null); };
  const addGroup = (group) => { save(roofs.map((roof) => roof.id === selectedRoof.id ? { ...roof, panelGroups: [...(roof.panelGroups || []), group] } : roof)); setDialog(null); };
  const addObstacle = (obstacle) => { save(roofs.map((roof) => roof.id === selectedRoof.id ? { ...roof, obstacles: [...(roof.obstacles || []), obstacle] } : roof)); setDialog(null); };
  const deleteRoof = (roofId) => { const next = roofs.filter((roof) => roof.id !== roofId); save(next.length ? next : [{ ...BASE_ROOF, id: genId(), panelGroups: [], obstacles: [] }]); setSelectedRoofId(next[0]?.id || 1); };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><PanelTop className="h-4 w-4 text-primary" />Solcellskalkylator - fast meterskala</CardTitle>
              <p className="text-sm text-muted-foreground">Välj solpanel från produktkatalogen per tak. Panelmått och effekt används direkt i den skalenliga ritningen.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">1 m = {scale} px</Badge>
              <Button variant="outline" size="sm" onClick={() => setDialog('roof')}><Plus className="mr-1 h-4 w-4" />Tak</Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('group')} disabled={!selectedRoof}><PanelTop className="mr-1 h-4 w-4" />Panelgrupp</Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('obstacle')} disabled={!selectedRoof}><AlertTriangle className="mr-1 h-4 w-4" />Hinder</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedRoof && (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <ProductSearchSelect label={`Solpanel på ${selectedRoof.name || 'valt tak'}`} products={panelProducts} value={selectedRoof.panelProductId || ''} onChange={updateSelectedRoofProduct} placeholder="Välj solpanel från produktkatalogen" />
              <div className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">{productLabel(selectedProduct)}</div>
                <div>{toNumber(selectedProduct.width_mm, DEFAULT_PANEL.width_mm)} x {toNumber(selectedProduct.height_mm, DEFAULT_PANEL.height_mm)} mm · {toNumber(selectedProduct.power_watts, DEFAULT_PANEL.power_watts)} W</div>
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-2xl font-bold">{totals.panels}</div></div>
            <div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Effekt</div><div className="text-2xl font-bold">{totals.kwp.toFixed(2)} kWp</div></div>
            <div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Skenstycken</div><div className="text-2xl font-bold">{totals.rails}</div></div>
            <div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Skenlängd</div><div className="text-2xl font-bold">{totals.len.toFixed(1)} m</div></div>
            <div className="rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Takkrokar</div><div className="text-2xl font-bold">{totals.hooks}</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-3"><MousePointer2 className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Flyttläge:</span><Button size="sm" variant={dragMode === 'panel' ? 'default' : 'outline'} onClick={() => setDragMode('panel')}>En panel</Button><Button size="sm" variant={dragMode === 'group' ? 'default' : 'outline'} onClick={() => setDragMode('group')}>Hela gruppen</Button><span className="text-xs text-muted-foreground">Dubbeltryck på panel försöker också välja grupp.</span></div>
          {selectedGroupWarnings.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>Fysisk kontroll:</b> Minst en panelgrupp är större än vald takyta eller ligger utanför taket. Kontrollera takmått, panelriktning, antal rader/kolumner eller flytta gruppen.</div>}
          <Canvas roofs={roofs} products={panelProducts} selectedRoofId={selectedRoofId} setSelectedRoofId={setSelectedRoofId} scale={scale} setScale={setScale} deleteRoof={deleteRoof} commitPanelMove={commitPanelMove} commitGroupMove={commitGroupMove} selectedItem={selectedItem} setSelectedItem={setSelectedItem} dragMode={dragMode} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Home className="mr-2 inline h-4 w-4" />Panelerna ritas med mått från vald produkt. Byter du panel på taket räknas panelstorlek, effekt och montage om automatiskt.</div>
        </CardContent>
      </Card>
      {dialog === 'roof' && <RoofForm products={panelProducts} onSave={addRoof} onClose={() => setDialog(null)} />}
      {dialog === 'group' && <GroupForm onSave={addGroup} onClose={() => setDialog(null)} />}
      {dialog === 'obstacle' && <ObstacleForm onSave={addObstacle} onClose={() => setDialog(null)} />}
    </div>
  );
}
