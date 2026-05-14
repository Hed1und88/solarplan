import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Download, Plus, Trash2, GitBranch, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// ─── Component symbols ────────────────────────────────────────────────────────
const COMPONENTS = [
  { type: 'panel_string', label: 'Stränggrupp (paneler)', symbol: 'panels' },
  { type: 'dc_fuse', label: 'DC-säkring', symbol: 'fuse' },
  { type: 'dc_disconnect', label: 'DC-brytare', symbol: 'switch' },
  { type: 'spd_dc', label: 'Överspänningsskydd DC', symbol: 'spd' },
  { type: 'inverter', label: 'Växelriktare', symbol: 'inverter' },
  { type: 'battery', label: 'Batteri/BESS', symbol: 'battery' },
  { type: 'ac_fuse', label: 'AC-säkring', symbol: 'fuse' },
  { type: 'ac_disconnect', label: 'AC-brytare', symbol: 'switch' },
  { type: 'spd_ac', label: 'Överspänningsskydd AC', symbol: 'spd' },
  { type: 'energy_meter', label: 'Energimätare', symbol: 'meter' },
  { type: 'grid', label: 'Elnät', symbol: 'grid' },
  { type: 'consumer', label: 'Förbrukare', symbol: 'consumer' },
];

const DEFAULT_SCHEMA = {
  components: [
    { id: 'panels-1', type: 'panel_string', label: 'String 1\n4×405W = 1620W', x: 60, y: 60 },
    { id: 'dc-fuse-1', type: 'dc_fuse', label: 'DC-säkring\n15A', x: 260, y: 60 },
    { id: 'inverter-1', type: 'inverter', label: 'Växelriktare\n5 kW', x: 460, y: 160 },
    { id: 'ac-fuse-1', type: 'ac_fuse', label: 'AC-säkring\n25A', x: 660, y: 160 },
    { id: 'meter-1', type: 'energy_meter', label: 'Energimätare', x: 860, y: 160 },
    { id: 'grid-1', type: 'grid', label: 'Elnät\n230/400V', x: 1060, y: 160 },
  ],
  wires: [
    { id: 'w1', from: 'panels-1', to: 'dc-fuse-1' },
    { id: 'w2', from: 'dc-fuse-1', to: 'inverter-1' },
    { id: 'w3', from: 'inverter-1', to: 'ac-fuse-1' },
    { id: 'w4', from: 'ac-fuse-1', to: 'meter-1' },
    { id: 'w5', from: 'meter-1', to: 'grid-1' },
  ],
};

// ─── Symbol renderers (SVG) ───────────────────────────────────────────────────
function SymbolSVG({ type, w = 80, h = 60 }) {
  const cx = w / 2, cy = h / 2;
  switch (type) {
    case 'panel_string':
      return (
        <svg width={w} height={h}>
          {[0, 1, 2].map(row => [0, 1].map(col => (
            <rect key={`${row}-${col}`}
              x={col * (w / 2 - 4) + 4} y={row * (h / 3 - 2) + 4}
              width={w / 2 - 8} height={h / 3 - 5}
              fill="#1e3560" stroke="#3b82f6" strokeWidth="1.5" rx="2" />
          )))}
          <line x1={cx} y1={0} x2={cx} y2={4} stroke="#facc15" strokeWidth="2" />
          <line x1={cx} y1={h - 4} x2={cx} y2={h} stroke="#facc15" strokeWidth="2" />
        </svg>
      );
    case 'dc_fuse':
    case 'ac_fuse':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={cx - 18} y2={cy} stroke="#facc15" strokeWidth="2" />
          <rect x={cx - 18} y={cy - 10} width={36} height={20} fill="none" stroke="#f97316" strokeWidth="2" rx="3" />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke="#f97316" strokeWidth="1.5" />
          <line x1={cx + 18} y1={cy} x2={w} y2={cy} stroke={type === 'ac_fuse' ? '#60a5fa' : '#facc15'} strokeWidth="2" />
        </svg>
      );
    case 'dc_disconnect':
    case 'ac_disconnect':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={cx - 14} y2={cy} stroke="#facc15" strokeWidth="2" />
          <circle cx={cx - 14} cy={cy} r={3} fill="#ef4444" />
          <line x1={cx - 14} y1={cy} x2={cx + 10} y2={cy - 16} stroke="#ef4444" strokeWidth="2" />
          <circle cx={cx + 14} cy={cy} r={3} fill="#ef4444" />
          <line x1={cx + 14} y1={cy} x2={w} y2={cy} stroke={type === 'ac_disconnect' ? '#60a5fa' : '#facc15'} strokeWidth="2" />
        </svg>
      );
    case 'spd_dc':
    case 'spd_ac':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={cx - 14} y2={cy} stroke="#facc15" strokeWidth="2" />
          <rect x={cx - 14} y={cy - 14} width={28} height={28} fill="#7c3aed22" stroke="#7c3aed" strokeWidth="2" rx="4" />
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fill="#7c3aed" fontWeight="bold">⚡</text>
          <line x1={cx} y1={cy + 14} x2={cx} y2={h} stroke="#6b7280" strokeWidth="1.5" strokeDasharray="3 2" />
          <line x1={cx + 14} y1={cy} x2={w} y2={cy} stroke={type === 'spd_ac' ? '#60a5fa' : '#facc15'} strokeWidth="2" />
        </svg>
      );
    case 'inverter':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={12} y2={cy} stroke="#facc15" strokeWidth="2" />
          <rect x={12} y={8} width={w - 24} height={h - 16} fill="#0f172a" stroke="#22c55e" strokeWidth="2" rx="6" />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="8" fill="#facc15">DC</text>
          <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke="#4b5563" strokeWidth="1" />
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="#60a5fa">AC</text>
          <line x1={w - 12} y1={cy} x2={w} y2={cy} stroke="#60a5fa" strokeWidth="2" />
        </svg>
      );
    case 'battery':
      return (
        <svg width={w} height={h}>
          <line x1={cx} y1={0} x2={cx} y2={12} stroke="#facc15" strokeWidth="2" />
          <rect x={16} y={12} width={w - 32} height={h - 24} fill="#1e3a3a" stroke="#10b981" strokeWidth="2" rx="4" />
          <line x1={cx - 8} y1={cy - 4} x2={cx + 8} y2={cy - 4} stroke="#10b981" strokeWidth="2" />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy} stroke="#10b981" strokeWidth="2" />
          <line x1={cx - 6} y1={cy + 4} x2={cx + 6} y2={cy + 4} stroke="#10b981" strokeWidth="2" />
          <line x1={cx} y1={h - 12} x2={cx} y2={h} stroke="#facc15" strokeWidth="2" />
        </svg>
      );
    case 'energy_meter':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={12} y2={cy} stroke="#60a5fa" strokeWidth="2" />
          <rect x={12} y={10} width={w - 24} height={h - 20} fill="#1e293b" stroke="#60a5fa" strokeWidth="2" rx="4" />
          <path d={`M ${cx - 10} ${cy + 6} A 10 10 0 0 1 ${cx + 10} ${cy + 6}`} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
          <line x1={cx} y1={cy - 2} x2={cx + 6} y2={cy + 6} stroke="#fbbf24" strokeWidth="1.5" />
          <line x1={w - 12} y1={cy} x2={w} y2={cy} stroke="#60a5fa" strokeWidth="2" />
        </svg>
      );
    case 'grid':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={cx - 16} y2={cy} stroke="#60a5fa" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={16} fill="none" stroke="#60a5fa" strokeWidth="2" />
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="#60a5fa" strokeWidth="1.5" />
          <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke="#60a5fa" strokeWidth="1.5" />
          <text x={cx} y={cy + 28} textAnchor="middle" fontSize="7" fill="#94a3b8">≋</text>
        </svg>
      );
    case 'consumer':
      return (
        <svg width={w} height={h}>
          <line x1={0} y1={cy} x2={12} y2={cy} stroke="#60a5fa" strokeWidth="2" />
          <rect x={12} y={cy - 16} width={w - 24} height={32} fill="#1e1e2e" stroke="#a78bfa" strokeWidth="2" rx="4" />
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill="#a78bfa">⌂</text>
        </svg>
      );
    default:
      return (
        <svg width={w} height={h}>
          <rect x={8} y={8} width={w - 16} height={h - 16} fill="#1e293b" stroke="#475569" strokeWidth="2" rx="4" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="#94a3b8">?</text>
        </svg>
      );
  }
}

// ─── Wire color ───────────────────────────────────────────────────────────────
function wireColor(fromType, toType) {
  const acTypes = ['inverter', 'ac_fuse', 'ac_disconnect', 'spd_ac', 'energy_meter', 'grid', 'consumer'];
  if (acTypes.includes(toType)) return '#60a5fa';
  return '#facc15';
}

// ─── Single component node ────────────────────────────────────────────────────
const NODE_W = 90;
const NODE_H = 70;
const LONG_PRESS_MS = 400;

function SchemaNode({ comp, selected, onSelect, onDrag, onDelete, onLabelChange }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(comp.label || '');
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef(null);
  const didDrag = useRef(false);

  const handleDoubleClick = (e) => { e.stopPropagation(); setEditing(true); };
  const handleBlur = () => { setEditing(false); onLabelChange(comp.id, label); };

  const handleMouseDown = (e) => {
    if (editing) return;
    e.stopPropagation();
    didDrag.current = false;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      didDrag.current = true;
      setHolding(false);
      onSelect(comp.id);
      onDrag(e, comp.id);
    }, LONG_PRESS_MS);
  };

  const handleMouseUp = () => {
    clearTimeout(holdTimer.current);
    if (!didDrag.current) { setHolding(false); onSelect(comp.id); }
  };

  const handleTouchStart = (e) => {
    if (editing) return;
    e.stopPropagation();
    didDrag.current = false;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      didDrag.current = true;
      setHolding(false);
      onSelect(comp.id);
      onDrag(e.touches[0], comp.id);
    }, LONG_PRESS_MS);
  };

  const handleTouchEnd = () => {
    clearTimeout(holdTimer.current);
    if (!didDrag.current) { setHolding(false); onSelect(comp.id); }
  };

  return (
    <g transform={`translate(${comp.x},${comp.y})`}
      style={{ cursor: holding ? 'wait' : (didDrag.current ? 'grabbing' : 'pointer') }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <rect x={2} y={2} width={NODE_W} height={NODE_H + 30} rx={8} fill="rgba(0,0,0,0.35)" />
      <rect x={0} y={0} width={NODE_W} height={NODE_H + 30} rx={8}
        fill={selected ? '#1e3a5f' : '#0f172a'}
        stroke={holding ? '#f97316' : selected ? '#3b82f6' : '#334155'}
        strokeWidth={holding || selected ? 2 : 1} />
      <foreignObject x={5} y={5} width={NODE_W - 10} height={NODE_H - 5}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%' }}>
          <SymbolSVG type={comp.type} w={NODE_W - 10} h={NODE_H - 5} />
        </div>
      </foreignObject>
      <foreignObject x={2} y={NODE_H + 2} width={NODE_W - 4} height={26}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%' }}>
          {editing ? (
            <textarea autoFocus
              style={{ width: '100%', background: '#1e3a5f', color: 'white', fontSize: 8, border: 'none', outline: 'none', resize: 'none', textAlign: 'center', height: 24 }}
              value={label} onChange={e => setLabel(e.target.value)} onBlur={handleBlur} />
          ) : (
            <div style={{ textAlign: 'center', fontSize: 8, color: '#94a3b8', lineHeight: 1.2, whiteSpace: 'pre-wrap', cursor: 'text' }}>
              {label}
            </div>
          )}
        </div>
      </foreignObject>
      {selected && (
        <g transform={`translate(${NODE_W - 14}, -8)`} style={{ cursor: 'pointer' }}
          onMouseDown={e => { e.stopPropagation(); onDelete(comp.id); }}>
          <circle r={8} fill="#ef4444" />
          <text x={0} y={4} textAnchor="middle" fontSize="10" fill="white">×</text>
        </g>
      )}
      <circle cx={NODE_W} cy={NODE_H / 2} r={4} fill="#475569" stroke="#64748b" strokeWidth={1} />
      <circle cx={0} cy={NODE_H / 2} r={4} fill="#475569" stroke="#64748b" strokeWidth={1} />
    </g>
  );
}

// ─── Main schema editor ───────────────────────────────────────────────────────
export default function SingleLineSchemaTab({ project, onUpdate }) {
  const loadSchema = () => {
    try {
      const d = JSON.parse(project.string_layout_data || '{}');
      if (d.singleLine) return d.singleLine;
    } catch {}
    return null;
  };

  const [schema, setSchema] = useState(() => loadSchema() || DEFAULT_SCHEMA);
  const [selected, setSelected] = useState(null);
  const [addType, setAddType] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [saving, setSaving] = useState(false);
  const svgRef = useRef(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const draggingId = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef(null);
  const lastTouchPos = useRef(null);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    let existing = {};
    try { existing = JSON.parse(project.string_layout_data || '{}'); } catch {}
    await onUpdate({ string_layout_data: JSON.stringify({ ...existing, singleLine: schema }) });
    setSaving(false);
  };

  // ── Add/delete component ──────────────────────────────────────────────────
  const addComponent = () => {
    if (!addType) return;
    const def = COMPONENTS.find(c => c.type === addType);
    const id = `${addType}-${Date.now()}`;
    setSchema(s => ({ ...s, components: [...s.components, { id, type: addType, label: def?.label || addType, x: 100 + Math.random() * 200, y: 100 + Math.random() * 150 }] }));
    setAddType('');
  };

  const deleteComponent = (id) => {
    setSchema(s => ({ components: s.components.filter(c => c.id !== id), wires: s.wires.filter(w => w.from !== id && w.to !== id) }));
    setSelected(null);
  };

  const updateLabel = (id, label) => {
    setSchema(s => ({ ...s, components: s.components.map(c => c.id === id ? { ...c, label } : c) }));
  };

  // ── Drag nodes ────────────────────────────────────────────────────────────
  const startDrag = useCallback((e, id) => {
    const svgRect = svgRef.current.getBoundingClientRect();
    const comp = schema.components.find(c => c.id === id);
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const mouseX = (clientX - svgRect.left) / zoom - pan.x / zoom;
    const mouseY = (clientY - svgRect.top) / zoom - pan.y / zoom;
    dragOffset.current = { x: mouseX - comp.x, y: mouseY - comp.y };
    draggingId.current = id;
  }, [schema, zoom, pan]);

  useEffect(() => {
    const moveCoords = (e) => {
      if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const { x: cx, y: cy } = moveCoords(e);
      if (draggingId.current && svgRef.current) {
        const svgRect = svgRef.current.getBoundingClientRect();
        const mouseX = (cx - svgRect.left) / zoom - pan.x / zoom;
        const mouseY = (cy - svgRect.top) / zoom - pan.y / zoom;
        const nx = Math.max(0, mouseX - dragOffset.current.x);
        const ny = Math.max(0, mouseY - dragOffset.current.y);
        setSchema(s => ({ ...s, components: s.components.map(c => c.id === draggingId.current ? { ...c, x: nx, y: ny } : c) }));
      }
      if (isPanning.current) {
        const dx = cx - panStart.current.x;
        const dy = cy - panStart.current.y;
        setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
      }
    };
    const onUp = () => { draggingId.current = null; isPanning.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [zoom, pan]);

  // ── Mouse pan ─────────────────────────────────────────────────────────────
  const handleSvgMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'svg') {
      setSelected(null);
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
    }
  };

  // ── Touch pan + pinch zoom ────────────────────────────────────────────────
  const handleSvgTouchStart = (e) => {
    if (e.touches.length === 2) {
      lastTouchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchPos.current = null;
    } else if (e.touches.length === 1) {
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouchDist.current = null;
    }
  };

  const handleSvgTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setZoom(z => Math.max(0.3, Math.min(2.5, z * (dist / lastTouchDist.current))));
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && lastTouchPos.current && !draggingId.current) {
      const dx = e.touches[0].clientX - lastTouchPos.current.x;
      const dy = e.touches[0].clientY - lastTouchPos.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleSvgTouchEnd = () => {
    lastTouchDist.current = null;
    lastTouchPos.current = null;
  };

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.max(0.3, Math.min(2.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Wire routing ──────────────────────────────────────────────────────────
  const computeWirePath = (from, to) => {
    if (!from || !to) return '';
    const fx = from.x + NODE_W, fy = from.y + NODE_H / 2;
    const tx = to.x, ty = to.y + NODE_H / 2;
    const mx = (fx + tx) / 2;
    return `M ${fx} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx} ${ty}`;
  };

  // ── Export as SVG ─────────────────────────────────────────────────────────
  const exportSVG = () => {
    const blob = new Blob([svgRef.current.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `enlinjeschema-${project.name || 'projekt'}.svg`;
    a.click(); URL.revokeObjectURL(url);
  };

  const compMap = Object.fromEntries(schema.components.map(c => [c.id, c]));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <GitBranch className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Enlinjeschema</span>

          <div className="flex items-center gap-2 ml-2">
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="Lägg till komponent..." />
              </SelectTrigger>
              <SelectContent>
                {COMPONENTS.map(c => (
                  <SelectItem key={c.type} value={c.type} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addComponent} disabled={!addType} className="h-8 gap-1">
              <Plus className="w-3.5 h-3.5" /> Lägg till
            </Button>
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-lg px-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}>
            <RotateCcw className="w-3.5 h-3.5" /> Återställ vy
          </Button>

          {selected && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive"
              onClick={() => deleteComponent(selected)}>
              <Trash2 className="w-3.5 h-3.5" /> Ta bort
            </Button>
          )}

          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={exportSVG}>
              <Download className="w-3.5 h-3.5" /> Exportera SVG
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-yellow-400 inline-block" /> DC (likström)</span>
        <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-blue-400 inline-block" /> AC (växelström)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1e3a5f] border border-blue-500 inline-block" /> Markerad komponent</span>
        <span className="text-muted-foreground/70">Håll ikonen (~0.4s) för att flytta • Nyp för att zooma (touch) • Scroll = zoom</span>
      </div>

      {/* Canvas */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-gray-950" style={{ height: 520 }}>
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{ display: 'block', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
          onMouseDown={handleSvgMouseDown}
          onTouchStart={handleSvgTouchStart}
          onTouchMove={handleSvgTouchMove}
          onTouchEnd={handleSvgTouchEnd}
        >
          <defs>
            <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x % (20 * zoom)},${pan.y % (20 * zoom)})`}>
              <path d={`M ${20 * zoom} 0 L 0 0 0 ${20 * zoom}`} fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
            <marker id="arrowDC" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,1 L7,4 L0,7 Z" fill="#facc15" />
            </marker>
            <marker id="arrowAC" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,1 L7,4 L0,7 Z" fill="#60a5fa" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <text x={10} y={20} fill="#facc15" fontSize={10} opacity={0.4}>DC-sida</text>
            <line x1={0} x2={600} y1={30} y2={30} stroke="#facc15" strokeWidth={0.5} opacity={0.2} strokeDasharray="4 4" />
            <text x={610} y={20} fill="#60a5fa" fontSize={10} opacity={0.4}>AC-sida</text>

            {schema.wires.map(wire => {
              const from = compMap[wire.from];
              const to = compMap[wire.to];
              if (!from || !to) return null;
              const color = wireColor(from.type, to.type);
              const arrow = color === '#facc15' ? 'url(#arrowDC)' : 'url(#arrowAC)';
              return (
                <path key={wire.id}
                  d={computeWirePath(from, to)}
                  fill="none" stroke={color} strokeWidth={2}
                  markerEnd={arrow} strokeLinejoin="round" />
              );
            })}

            {schema.components.map(comp => (
              <SchemaNode
                key={comp.id}
                comp={comp}
                selected={selected === comp.id}
                onSelect={setSelected}
                onDrag={startDrag}
                onDelete={deleteComponent}
                onLabelChange={updateLabel}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Wire editor */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kopplingar (ledningar)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {schema.wires.map((wire, i) => {
            const from = compMap[wire.from];
            const to = compMap[wire.to];
            return (
              <div key={wire.id} className="flex items-center gap-2 text-xs">
                <span className="bg-muted rounded px-2 py-1 font-mono">{from?.label?.split('\n')[0] || wire.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="bg-muted rounded px-2 py-1 font-mono">{to?.label?.split('\n')[0] || wire.to}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive hover:text-destructive"
                  onClick={() => setSchema(s => ({ ...s, wires: s.wires.filter((_, j) => j !== i) }))}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
          <AddWireRow components={schema.components} onAdd={wire => setSchema(s => ({ ...s, wires: [...s.wires, wire] }))} />
        </CardContent>
      </Card>
    </div>
  );
}

function AddWireRow({ components, onAdd }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const add = () => {
    if (!from || !to || from === to) return;
    onAdd({ id: `w-${Date.now()}`, from, to });
    setFrom(''); setTo('');
  };
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-border mt-2">
      <Select value={from} onValueChange={setFrom}>
        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Från..." /></SelectTrigger>
        <SelectContent>{components.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.label?.split('\n')[0] || c.id}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground text-xs">→</span>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Till..." /></SelectTrigger>
        <SelectContent>{components.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.label?.split('\n')[0] || c.id}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" className="h-7 text-xs" onClick={add} disabled={!from || !to}>
        <Plus className="w-3 h-3" /> Lägg till
      </Button>
    </div>
  );
}
