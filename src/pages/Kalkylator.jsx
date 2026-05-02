import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Home,
  Layers,
  Maximize2,
  MousePointer2,
  PanelTop,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const PANEL = {
  model: 'JA Solar JAM60D41-500/LB',
  widthMm: 1134,
  heightMm: 1953,
  watt: 500,
};

const DEFAULT_ROOF = {
  id: 1,
  name: 'Tak 1',
  system: 'Parallel',
  material: 'Takpannor',
  color: 'Svart',
  fastening: 'Bärläkt',
  shape: 'Rektangel',
  widthM: 8,
  roofFallM: 6,
  ridgeHeightM: 4.2,
  angleDeg: 27,
  roofType: 'Sadeltak',
  panelGroups: [],
  obstacles: [],
};

const roofSystems = ['Parallel', 'Öst / väst', 'Syd'];
const roofMaterials = ['Papp', 'Plåttak falsat', 'Plåttak profilerat', 'Takpannor', 'Övrigt profilerat'];
const fasteningMethods = ['Bärläkt', 'Råspont 1', 'Råspont 2'];
const roofShapes = ['Rektangel', 'Vinkel vänster', 'Vinkel höger', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger'];
const roofTypes = ['Pulpettak', 'Sadeltak'];
const orientations = ['Stående | Horisont.', 'Stående | Vert.', 'Liggande | Horisont.', 'Liggande | Vert.'];

function uid() {
  return Math.floor(Date.now() + Math.random() * 100000);
}

function panelSizeMeters(orientation) {
  const portrait = orientation?.startsWith('Stående');
  return portrait
    ? { w: PANEL.widthMm / 1000, h: PANEL.heightMm / 1000 }
    : { w: PANEL.heightMm / 1000, h: PANEL.widthMm / 1000 };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function calculateRoof(roof) {
  const groups = roof.panelGroups.map((g) => {
    const size = panelSizeMeters(g.orientation);
    const panelCount = Math.max(0, g.rows * g.cols);
    const railsPerPanelRow = g.threeRails ? 3 : 2;
    const railRows = g.rows * railsPerPanelRow;
    const groupWidthM = g.cols * size.w;
    const railLengthM = railRows * groupWidthM;
    const hooksPerRail = Math.max(2, Math.ceil(groupWidthM / 1.2) + 1);
    const hooks = hooksPerRail * railRows;
    const endClamps = g.rows * 4;
    const midClamps = Math.max(0, (g.cols - 1) * g.rows * 2);
    return { ...g, size, panelCount, railRows, railLengthM, hooks, endClamps, midClamps };
  });

  const panelCount = groups.reduce((s, g) => s + g.panelCount, 0);
  const railRows = groups.reduce((s, g) => s + g.railRows, 0);
  const railLengthM = groups.reduce((s, g) => s + g.railLengthM, 0);
  const hooks = groups.reduce((s, g) => s + g.hooks, 0);
  const endClamps = groups.reduce((s, g) => s + g.endClamps, 0);
  const midClamps = groups.reduce((s, g) => s + g.midClamps, 0);
  const kwp = (panelCount * PANEL.watt) / 1000;
  const yearlyKwh = Math.round(kwp * 950);

  return { groups, panelCount, railRows, railLengthM, hooks, endClamps, midClamps, kwp, yearlyKwh };
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input(props) {
  return <input {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:ring-4" />;
}

function Select({ children, ...props }) {
  return <select {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:ring-4">{children}</select>;
}

function ToggleButton({ active, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      {children}
    </button>
  );
}

function PrimaryButton({ children, className = '', ...props }) {
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 ${className}`}>{children}</button>;
}

function SecondaryButton({ children, className = '', ...props }) {
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${className}`}>{children}</button>;
}

function Dialog({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(92vh-140px)] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

function RoofShapePreview({ shape }) {
  const points = {
    'Rektangel': '40,40 260,40 260,170 40,170',
    'Vinkel vänster': '90,40 260,40 260,170 40,170 40,95 90,95',
    'Vinkel höger': '40,40 210,40 210,95 260,95 260,170 40,170',
    'Trapets vänster': '80,40 260,40 260,170 40,170',
    'Trapets höger': '40,40 220,40 260,170 40,170',
    'Parallellogram vänster': '75,40 260,40 225,170 40,170',
    'Parallellogram höger': '40,40 225,40 260,170 75,170',
  };
  return (
    <svg viewBox="0 0 300 215" className="h-48 w-full rounded-2xl bg-slate-50">
      <defs>
        <pattern id="diag" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="2" />
        </pattern>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#2563eb" />
        </marker>
      </defs>
      <polygon points={points[shape] || points.Rektangel} fill="url(#diag)" stroke="#0f172a" strokeWidth="3" />
      <line x1="40" y1="190" x2="260" y2="190" stroke="#2563eb" strokeWidth="2" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x="150" y="207" textAnchor="middle" fontSize="13" fill="#2563eb" fontWeight="700">A bredd</text>
      <line x1="22" y1="45" x2="22" y2="170" stroke="#2563eb" strokeWidth="2" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x="10" y="108" textAnchor="middle" fontSize="13" fill="#2563eb" fontWeight="700" transform="rotate(-90 10 108)">B takfall</text>
    </svg>
  );
}

function RoofWizardDialog({ onClose, onCreate, initialName }) {
  const [step, setStep] = useState(0);
  const [roof, setRoof] = useState({ ...DEFAULT_ROOF, id: uid(), name: initialName });
  const set = (patch) => setRoof((r) => ({ ...r, ...patch }));

  return (
    <Dialog
      title="Lägg till tak"
      onClose={onClose}
      footer={(
        <>
          <SecondaryButton disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft className="h-4 w-4" />Föregående</SecondaryButton>
          {step < 2 ? <PrimaryButton onClick={() => setStep((s) => s + 1)}>Nästa<ChevronRight className="h-4 w-4" /></PrimaryButton> : <PrimaryButton onClick={() => onCreate(roof)}>Lägg</PrimaryButton>}
        </>
      )}
    >
      <div className="mb-5 flex gap-2">
        {[0, 1, 2].map((i) => <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-violet-500' : 'bg-slate-100'}`} />)}
      </div>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={roof.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="System"><Select value={roof.system} onChange={(e) => set({ system: e.target.value })}>{roofSystems.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Takmaterial"><Select value={roof.material} onChange={(e) => set({ material: e.target.value })}>{roofMaterials.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Färg"><Input value={roof.color} onChange={(e) => set({ color: e.target.value })} /></Field>
          <Field label="Infästningsmetod"><Select value={roof.fastening} onChange={(e) => set({ fastening: e.target.value })}>{fasteningMethods.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Taktyp"><Select value={roof.roofType} onChange={(e) => set({ roofType: e.target.value })}>{roofTypes.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <Field label="Takform"><Select value={roof.shape} onChange={(e) => set({ shape: e.target.value })}>{roofShapes.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bredd A (m)"><Input type="number" min="1" step="0.1" value={roof.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} /></Field>
              <Field label="Takfall B (m)"><Input type="number" min="1" step="0.1" value={roof.roofFallM} onChange={(e) => set({ roofFallM: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nockhöjd (m)"><Input type="number" min="0" step="0.1" value={roof.ridgeHeightM} onChange={(e) => set({ ridgeHeightM: Number(e.target.value) })} /></Field>
              <Field label="Taklutning (°)"><Input type="number" min="0" max="75" step="1" value={roof.angleDeg} onChange={(e) => set({ angleDeg: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <RoofShapePreview shape={roof.shape} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <RoofShapePreview shape={roof.shape} />
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-2">
            <div><b>Tak:</b> {roof.name}</div>
            <div><b>System:</b> {roof.system}</div>
            <div><b>Material:</b> {roof.material}</div>
            <div><b>Infästning:</b> {roof.fastening}</div>
            <div><b>Mått:</b> {roof.widthM} × {roof.roofFallM} m</div>
            <div><b>Lutning:</b> {roof.angleDeg}°</div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function PanelGroupDialog({ onClose, onCreate }) {
  const [group, setGroup] = useState({
    id: uid(),
    name: 'Panelgrupp 1',
    orientation: 'Stående | Vert.',
    rows: 3,
    cols: 4,
    xM: 0.6,
    yM: 0.6,
    crossMount: false,
    optimize: false,
    threeRails: false,
    clampZoneMm: 391,
  });
  const set = (patch) => setGroup((g) => ({ ...g, ...patch }));

  return (
    <Dialog title="Lägg till panelgrupp" onClose={onClose} footer={<PrimaryButton onClick={() => onCreate(group)}>Lägg</PrimaryButton>}>
      <div className="space-y-5">
        <Field label="Panelmontering">
          <div className="grid grid-cols-2 gap-2">
            {orientations.map((o) => <ToggleButton key={o} active={group.orientation === o} onClick={() => set({ orientation: o })}>{o}</ToggleButton>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Rader"><Input type="number" min="1" value={group.rows} onChange={(e) => set({ rows: clamp(Number(e.target.value), 1, 30) })} /></Field>
          <Field label="Kolumner"><Input type="number" min="1" value={group.cols} onChange={(e) => set({ cols: clamp(Number(e.target.value), 1, 40) })} /></Field>
          <Field label="Position X (m)"><Input type="number" step="0.1" value={group.xM} onChange={(e) => set({ xM: Number(e.target.value) })} /></Field>
          <Field label="Position Y (m)"><Input type="number" step="0.1" value={group.yM} onChange={(e) => set({ yM: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <ToggleButton active={group.crossMount} onClick={() => set({ crossMount: !group.crossMount })}>Korsmontage</ToggleButton>
          <ToggleButton active={group.optimize} onClick={() => set({ optimize: !group.optimize })}>Optimera utnyttjandegrad</ToggleButton>
          <ToggleButton active={group.threeRails} onClick={() => set({ threeRails: !group.threeRails })}>Använd tre skenor</ToggleButton>
        </div>
        <Field label="Panelöverhäng till skena / klämzon (mm)"><Input type="number" min="0" value={group.clampZoneMm} onChange={(e) => set({ clampZoneMm: Number(e.target.value) })} /></Field>
      </div>
    </Dialog>
  );
}

function ObstacleDialog({ onClose, onCreate }) {
  const [obstacle, setObstacle] = useState({ id: uid(), name: 'Hinder', widthM: 0.8, lengthM: 0.8, heightM: 0.3, xM: 2, yM: 2 });
  const set = (patch) => setObstacle((o) => ({ ...o, ...patch }));
  return (
    <Dialog title="Lägg till hinder" onClose={onClose} footer={<PrimaryButton onClick={() => onCreate(obstacle)}>Lägg</PrimaryButton>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Namn"><Input value={obstacle.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Höjd (m)"><Input type="number" step="0.1" value={obstacle.heightM} onChange={(e) => set({ heightM: Number(e.target.value) })} /></Field>
        <Field label="Bredd (m)"><Input type="number" step="0.1" value={obstacle.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} /></Field>
        <Field label="Längd (m)"><Input type="number" step="0.1" value={obstacle.lengthM} onChange={(e) => set({ lengthM: Number(e.target.value) })} /></Field>
        <Field label="Position X (m)"><Input type="number" step="0.1" value={obstacle.xM} onChange={(e) => set({ xM: Number(e.target.value) })} /></Field>
        <Field label="Position Y (m)"><Input type="number" step="0.1" value={obstacle.yM} onChange={(e) => set({ yM: Number(e.target.value) })} /></Field>
      </div>
    </Dialog>
  );
}

function RoofCanvas({ roofs, selectedRoofId, onSelectRoof, zoom, setZoom, showLayers, setShowLayers, onOpenSettings, onDeleteRoof }) {
  const selectedRoof = roofs.find((r) => r.id === selectedRoofId) || roofs[0];
  const scale = zoom;
  const pad = 80;
  const roofGap = 80;
  let cursorY = pad;
  const roofLayouts = roofs.map((roof) => {
    const w = roof.widthM * scale;
    const h = roof.roofFallM * scale;
    const layout = { roof, x: pad, y: cursorY, w, h };
    cursorY += h + roofGap;
    return layout;
  });
  const svgW = Math.max(900, ...roofLayouts.map((l) => l.x + l.w + 260));
  const svgH = Math.max(620, cursorY + pad);

  function roofPoints(l) {
    const { x, y, w, h, roof } = l;
    switch (roof.shape) {
      case 'Trapets vänster': return `${x + w * 0.18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
      case 'Trapets höger': return `${x},${y} ${x + w * 0.82},${y} ${x + w},${y + h} ${x},${y + h}`;
      case 'Parallellogram vänster': return `${x + w * 0.12},${y} ${x + w},${y} ${x + w * 0.88},${y + h} ${x},${y + h}`;
      case 'Parallellogram höger': return `${x},${y} ${x + w * 0.88},${y} ${x + w},${y + h} ${x + w * 0.12},${y + h}`;
      case 'Vinkel vänster': return `${x + w * 0.25},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h} ${x},${y + h * 0.42} ${x + w * 0.25},${y + h * 0.42}`;
      case 'Vinkel höger': return `${x},${y} ${x + w * 0.75},${y} ${x + w * 0.75},${y + h * 0.42} ${x + w},${y + h * 0.42} ${x + w},${y + h} ${x},${y + h}`;
      default: return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
    }
  }

  function drawPanelGroup(layout, group) {
    const calc = calculateRoof(layout.roof).groups.find((g) => g.id === group.id) || group;
    const size = panelSizeMeters(group.orientation);
    const panelW = size.w * scale;
    const panelH = size.h * scale;
    const gap = 0.03 * scale;
    const startX = layout.x + group.xM * scale;
    const startY = layout.y + group.yM * scale;
    const railYs = [];
    const clampOffset = (group.clampZoneMm / 1000) * scale;

    for (let r = 0; r < group.rows; r++) {
      const rowY = startY + r * (panelH + gap);
      const railsPerRow = group.threeRails ? [clampOffset, panelH / 2, panelH - clampOffset] : [clampOffset, panelH - clampOffset];
      railsPerRow.forEach((off) => railYs.push(rowY + off));
    }

    const elements = [];
    for (let r = 0; r < group.rows; r++) {
      for (let c = 0; c < group.cols; c++) {
        const px = startX + c * (panelW + gap);
        const py = startY + r * (panelH + gap);
        elements.push(
          <g key={`p-${group.id}-${r}-${c}`}>
            <rect x={px} y={py} width={panelW} height={panelH} rx="4" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.4" />
            <line x1={px + panelW / 3} y1={py + 4} x2={px + panelW / 3} y2={py + panelH - 4} stroke="#93c5fd" strokeWidth="0.8" />
            <line x1={px + panelW * 2 / 3} y1={py + 4} x2={px + panelW * 2 / 3} y2={py + panelH - 4} stroke="#93c5fd" strokeWidth="0.8" />
            <line x1={px + 4} y1={py + panelH / 2} x2={px + panelW - 4} y2={py + panelH / 2} stroke="#93c5fd" strokeWidth="0.8" />
          </g>
        );
      }
    }

    const groupWidth = group.cols * panelW + Math.max(0, group.cols - 1) * gap;
    railYs.forEach((ry, i) => {
      elements.push(<line key={`rail-${group.id}-${i}`} x1={startX - 10} y1={ry} x2={startX + groupWidth + 10} y2={ry} stroke="#8b5e34" strokeWidth="4" strokeLinecap="round" />);
      const hookCount = Math.max(2, Math.ceil((groupWidth / scale) / 1.2) + 1);
      for (let h = 0; h < hookCount; h++) {
        const hx = startX + (groupWidth / Math.max(1, hookCount - 1)) * h;
        elements.push(<circle key={`hook-${group.id}-${i}-${h}`} cx={hx} cy={ry} r="5" fill="#f97316" stroke="#fff" strokeWidth="1.5" />);
      }
    });

    for (let r = 0; r < group.rows; r++) {
      const cy1 = startY + r * (panelH + gap) + clampOffset;
      const cy2 = startY + r * (panelH + gap) + panelH - clampOffset;
      [cy1, cy2].forEach((cy, idx) => {
        for (let c = 0; c <= group.cols; c++) {
          const cx = startX + c * (panelW + gap) - (c === group.cols ? gap : 0);
          elements.push(<rect key={`clamp-${group.id}-${r}-${idx}-${c}`} x={cx - 3} y={cy - 7} width="6" height="14" rx="2" fill="#22c55e" />);
        }
      });
    }

    elements.push(<text key={`g-label-${group.id}`} x={startX} y={startY - 8} fontSize="12" fontWeight="700" fill="#1d4ed8">{group.name} · {calc.panelCount} paneler</text>);
    return elements;
  }

  return (
    <div className="relative flex min-h-[620px] flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <svg className="h-full min-h-[620px] w-full bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] [background-size:22px_22px]" viewBox={`0 0 ${svgW} ${svgH}`}>
        <defs>
          <pattern id="roof-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" />
          </pattern>
        </defs>

        {roofLayouts.map((layout) => {
          const { roof, x, y, w, h } = layout;
          const calc = calculateRoof(roof);
          const selected = roof.id === selectedRoof?.id;
          return (
            <g key={roof.id} onClick={() => onSelectRoof(roof.id)} className="cursor-pointer">
              <text x={x} y={y - 24} fontSize="18" fontWeight="800" fill="#0f172a">{roof.name}</text>
              <g>
                <polygon points={roofPoints(layout)} fill="url(#roof-hatch)" stroke={selected ? '#7c3aed' : '#0f172a'} strokeWidth={selected ? 4 : 2.5} />
                <polygon points={roofPoints({ ...layout, x: x + 18, y: y + 18, w: Math.max(10, w - 36), h: Math.max(10, h - 36) })} fill="none" stroke="#cbd5e1" strokeDasharray="8 6" strokeWidth="2" />
              </g>
              <foreignObject x={x + w - 120} y={y + 14} width="105" height="36">
                <div className="rounded-full bg-white/95 px-3 py-2 text-center text-xs font-bold text-slate-800 shadow">{calc.panelCount} paneler</div>
              </foreignObject>
              <g transform={`translate(${x + w + 18}, ${y})`}>
                <rect width="136" height="112" rx="18" fill="white" stroke="#e2e8f0" />
                <text x="16" y="28" fontSize="12" fontWeight="800" fill="#334155">Takdata</text>
                <text x="16" y="50" fontSize="11" fill="#64748b">{roof.widthM} × {roof.roofFallM} m</text>
                <text x="16" y="68" fontSize="11" fill="#64748b">{roof.material}</text>
                <text x="16" y="86" fontSize="11" fill="#64748b">{roof.angleDeg}° · {roof.roofType}</text>
              </g>
              {roof.panelGroups.flatMap((g) => drawPanelGroup(layout, g))}
              {roof.obstacles.map((o) => (
                <g key={o.id}>
                  <rect x={x + o.xM * scale} y={y + o.yM * scale} width={o.widthM * scale} height={o.lengthM * scale} rx="5" fill="#fee2e2" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 4" />
                  <text x={x + o.xM * scale + 6} y={y + o.yM * scale + 18} fontSize="11" fontWeight="700" fill="#991b1b">{o.name}</text>
                </g>
              ))}
              {selected && (
                <foreignObject x={x} y={y - 14} width="160" height="34">
                  <div className="flex gap-1 rounded-full bg-white p-1 shadow-lg">
                    <button className="rounded-full p-1.5 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onOpenSettings(roof); }} className="rounded-full p-1.5 hover:bg-slate-100"><Settings className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteRoof(roof.id); }} className="rounded-full p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute right-4 top-4 flex flex-col gap-2">
        <button onClick={() => setZoom((z) => Math.min(115, z + 8))} className="rounded-xl bg-white p-3 shadow hover:bg-slate-50"><ZoomIn className="h-5 w-5" /></button>
        <button onClick={() => setZoom((z) => Math.max(28, z - 8))} className="rounded-xl bg-white p-3 shadow hover:bg-slate-50"><ZoomOut className="h-5 w-5" /></button>
        <button onClick={() => setZoom(58)} className="rounded-xl bg-white p-3 shadow hover:bg-slate-50"><Maximize2 className="h-5 w-5" /></button>
      </div>

      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <button onClick={() => setShowLayers(!showLayers)} className="rounded-xl bg-white p-3 shadow hover:bg-slate-50"><Layers className="h-5 w-5" /></button>
        <button className="rounded-xl bg-white p-3 shadow hover:bg-slate-50"><AlertTriangle className="h-5 w-5" /></button>
      </div>

      {showLayers && (
        <div className="absolute left-16 top-4 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <h3 className="mb-3 font-bold text-slate-900">Takytor</h3>
          <button onClick={() => onSelectRoof(roofs[0]?.id)} className="mb-2 w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm font-medium hover:bg-slate-100">Alla takytor</button>
          <div className="space-y-2">
            {roofs.map((r) => <button key={r.id} onClick={() => onSelectRoof(r.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${r.id === selectedRoofId ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 hover:bg-slate-50'}`}>{r.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>;
}

function CalculationSummary({ roofs }) {
  const totals = roofs.reduce((acc, roof) => {
    const c = calculateRoof(roof);
    acc.panelCount += c.panelCount;
    acc.kwp += c.kwp;
    acc.railRows += c.railRows;
    acc.railLengthM += c.railLengthM;
    acc.hooks += c.hooks;
    acc.endClamps += c.endClamps;
    acc.midClamps += c.midClamps;
    acc.yearlyKwh += c.yearlyKwh;
    return acc;
  }, { panelCount: 0, kwp: 0, railRows: 0, railLengthM: 0, hooks: 0, endClamps: 0, midClamps: 0, yearlyKwh: 0 });

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <SummaryCard label="Paneler" value={totals.panelCount} sub="st" />
      <SummaryCard label="Installerad effekt" value={totals.kwp.toFixed(2)} sub="kWp" />
      <SummaryCard label="Årsproduktion" value={totals.yearlyKwh.toLocaleString('sv-SE')} sub="kWh/år, preliminärt" />
      <SummaryCard label="Montage" value={totals.hooks} sub={`fästen · ${Math.round(totals.railLengthM)} m skena`} />
    </div>
  );
}

function MountingDrawing({ roofs }) {
  const scale = 44;
  const roof = roofs[0];
  if (!roof) return null;
  const calc = calculateRoof(roof);
  const w = roof.widthM * scale;
  const h = roof.roofFallM * scale;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Monteringsritning – takvyer uppifrån</h2>
          <p className="text-sm text-slate-500">Förenklad montagevy för kalkyl, offert och planeringsunderlag.</p>
        </div>
        <div className="text-right text-sm font-bold text-slate-700">SolarPlan / Montageförslag</div>
      </div>
      <svg viewBox={`0 0 ${w + 260} ${h + 190}`} className="w-full rounded-2xl bg-slate-50">
        <defs>
          <pattern id="draw-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" />
          </pattern>
          <marker id="m-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2563eb" /></marker>
        </defs>
        <text x="28" y="32" fontSize="16" fontWeight="800" fill="#0f172a">{roof.name}</text>
        <rect x="28" y="52" width={w} height={h} fill="url(#draw-hatch)" stroke="#0f172a" strokeWidth="2.5" />
        {roof.panelGroups.flatMap((g) => {
          const size = panelSizeMeters(g.orientation);
          const panelW = size.w * scale;
          const panelH = size.h * scale;
          const gap = 0.03 * scale;
          const sx = 28 + g.xM * scale;
          const sy = 52 + g.yM * scale;
          const elements = [];
          for (let r = 0; r < g.rows; r++) {
            for (let c = 0; c < g.cols; c++) {
              elements.push(<rect key={`dp-${g.id}-${r}-${c}`} x={sx + c * (panelW + gap)} y={sy + r * (panelH + gap)} width={panelW} height={panelH} fill="#dbeafe" stroke="#2563eb" strokeWidth="1" />);
            }
          }
          const groupW = g.cols * panelW + Math.max(0, g.cols - 1) * gap;
          for (let r = 0; r < g.rows; r++) {
            const yBase = sy + r * (panelH + gap);
            const rails = g.threeRails ? [g.clampZoneMm / 1000 * scale, panelH / 2, panelH - g.clampZoneMm / 1000 * scale] : [g.clampZoneMm / 1000 * scale, panelH - g.clampZoneMm / 1000 * scale];
            rails.forEach((off, i) => {
              const ry = yBase + off;
              elements.push(<line key={`dr-${g.id}-${r}-${i}`} x1={sx - 10} y1={ry} x2={sx + groupW + 10} y2={ry} stroke="#8b5e34" strokeWidth="4" strokeLinecap="round" />);
              const hookCount = Math.max(2, Math.ceil((groupW / scale) / 1.2) + 1);
              for (let hIdx = 0; hIdx < hookCount; hIdx++) {
                const hx = sx + (groupW / Math.max(1, hookCount - 1)) * hIdx;
                elements.push(<circle key={`dh-${g.id}-${r}-${i}-${hIdx}`} cx={hx} cy={ry} r="5" fill="#f97316" stroke="#fff" strokeWidth="1.4" />);
              }
            });
          }
          return elements;
        })}
        {roof.obstacles.map((o) => <rect key={o.id} x={28 + o.xM * scale} y={52 + o.yM * scale} width={o.widthM * scale} height={o.lengthM * scale} fill="#fee2e2" stroke="#ef4444" strokeDasharray="5 4" />)}
        <line x1="28" y1={h + 75} x2={28 + w} y2={h + 75} stroke="#2563eb" strokeWidth="2" markerStart="url(#m-arrow)" markerEnd="url(#m-arrow)" />
        <text x={28 + w / 2} y={h + 96} textAnchor="middle" fontSize="13" fontWeight="700" fill="#2563eb">{roof.widthM} m</text>
        <line x1={w + 50} y1="52" x2={w + 50} y2={52 + h} stroke="#2563eb" strokeWidth="2" markerStart="url(#m-arrow)" markerEnd="url(#m-arrow)" />
        <text x={w + 72} y={52 + h / 2} fontSize="13" fontWeight="700" fill="#2563eb">{roof.roofFallM} m</text>
        <g transform={`translate(${w + 85}, 70)`}>
          <text x="0" y="0" fontSize="13" fontWeight="800" fill="#0f172a">Legend</text>
          <line x1="0" y1="24" x2="44" y2="24" stroke="#8b5e34" strokeWidth="4" /><text x="55" y="28" fontSize="12" fill="#475569">Skena</text>
          <circle cx="22" cy="52" r="6" fill="#f97316" /><text x="55" y="56" fontSize="12" fill="#475569">Krok/fäste</text>
          <rect x="15" y="75" width="14" height="14" fill="#22c55e" /><text x="55" y="87" fontSize="12" fill="#475569">Klämzon</text>
        </g>
      </svg>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4"><b>Panelmodell:</b><br />{PANEL.model}<br />{PANEL.widthMm} × {PANEL.heightMm} mm</div>
        <div className="rounded-2xl bg-slate-50 p-4"><b>Montage:</b><br />{calc.railRows} skenrader<br />{Math.round(calc.railLengthM)} m skena · {calc.hooks} fästen</div>
        <div className="rounded-2xl bg-slate-50 p-4"><b>Klämdata:</b><br />{calc.endClamps} ändklämmor · {calc.midClamps} mittklämmor<br />Skena pos 1: 391 mm uppifrån<br />Skena pos 2: 391 mm nedifrån</div>
      </div>
    </div>
  );
}

export default function Kalkylator() {
  const [roofs, setRoofs] = useState([{ ...DEFAULT_ROOF, panelGroups: [{ id: 2, name: 'Panelgrupp 1', orientation: 'Stående | Vert.', rows: 3, cols: 4, xM: 0.7, yM: 0.7, crossMount: false, optimize: false, threeRails: false, clampZoneMm: 391 }], obstacles: [] }]);
  const [selectedRoofId, setSelectedRoofId] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [zoom, setZoom] = useState(58);
  const [showLayers, setShowLayers] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [showDrawing, setShowDrawing] = useState(false);

  const selectedRoof = useMemo(() => roofs.find((r) => r.id === selectedRoofId) || roofs[0], [roofs, selectedRoofId]);
  const pushState = (next) => { setHistory((h) => [...h.slice(-20), roofs]); setFuture([]); setRoofs(next); };
  const updateRoof = (id, patch) => pushState(roofs.map((r) => r.id === id ? { ...r, ...patch } : r));

  const addRoof = (roof) => { pushState([...roofs, roof]); setSelectedRoofId(roof.id); setDialog(null); };
  const deleteRoof = (id) => { const next = roofs.filter((r) => r.id !== id); pushState(next.length ? next : [{ ...DEFAULT_ROOF, id: uid(), name: 'Tak 1' }]); setSelectedRoofId(next[0]?.id); };
  const addPanelGroup = (group) => { updateRoof(selectedRoof.id, { panelGroups: [...selectedRoof.panelGroups, group] }); setDialog(null); };
  const addObstacle = (obstacle) => { updateRoof(selectedRoof.id, { obstacles: [...selectedRoof.obstacles, obstacle] }); setDialog(null); };
  const undo = () => { if (!history.length) return; const prev = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); setFuture((f) => [roofs, ...f]); setRoofs(prev); };
  const redo = () => { if (!future.length) return; const next = future[0]; setFuture((f) => f.slice(1)); setHistory((h) => [...h, roofs]); setRoofs(next); };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-sm print:hidden">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">SolarPlan</p>
            <h1 className="text-2xl font-black text-slate-950">Solcellskalkylator</h1>
            <p className="text-sm text-slate-500">Takplanerare med paneler, skenor, fästen, hinder och montageförslag.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setDialog('roof')}><Plus className="h-4 w-4" />Lägg till tak</SecondaryButton>
            <PrimaryButton onClick={() => setShowDrawing(true)}><FileText className="h-4 w-4" />Skapa ritning</PrimaryButton>
          </div>
        </header>

        <CalculationSummary roofs={roofs} />

        {!showDrawing ? (
          <div className="space-y-4 print:hidden">
            <RoofCanvas roofs={roofs} selectedRoofId={selectedRoofId} onSelectRoof={setSelectedRoofId} zoom={zoom} setZoom={setZoom} showLayers={showLayers} setShowLayers={setShowLayers} onOpenSettings={(roof) => { setSelectedRoofId(roof.id); setDialog('roof-settings'); }} onDeleteRoof={deleteRoof} />
            <div className="sticky bottom-4 z-20 mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
              <SecondaryButton onClick={undo} disabled={!history.length}><RotateCcw className="h-4 w-4" />Ångra</SecondaryButton>
              <SecondaryButton onClick={redo} disabled={!future.length}><RotateCw className="h-4 w-4" />Gör om</SecondaryButton>
              <PrimaryButton onClick={() => setDialog('roof')}><Home className="h-4 w-4" />Lägg till tak</PrimaryButton>
              <SecondaryButton disabled={!selectedRoof} onClick={() => setDialog('panel')}><PanelTop className="h-4 w-4" />Lägg till panelgrupp</SecondaryButton>
              <SecondaryButton disabled={!selectedRoof} onClick={() => setDialog('obstacle')}><AlertTriangle className="h-4 w-4" />Lägg till hinder</SecondaryButton>
              <SecondaryButton onClick={() => setShowLayers(!showLayers)}><Layers className="h-4 w-4" />Takytor</SecondaryButton>
              <PrimaryButton onClick={() => setShowDrawing(true)}><FileText className="h-4 w-4" />Skapa ritning</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between gap-2 print:hidden">
              <SecondaryButton onClick={() => setShowDrawing(false)}><MousePointer2 className="h-4 w-4" />Tillbaka till planering</SecondaryButton>
              <PrimaryButton onClick={() => window.print()}><Download className="h-4 w-4" />Exportera PDF</PrimaryButton>
            </div>
            <MountingDrawing roofs={roofs} />
          </div>
        )}
      </div>

      {dialog === 'roof' && <RoofWizardDialog initialName={`Tak ${roofs.length + 1}`} onClose={() => setDialog(null)} onCreate={addRoof} />}
      {dialog === 'panel' && <PanelGroupDialog onClose={() => setDialog(null)} onCreate={addPanelGroup} />}
      {dialog === 'obstacle' && <ObstacleDialog onClose={() => setDialog(null)} onCreate={addObstacle} />}
      {dialog === 'roof-settings' && selectedRoof && (
        <RoofWizardDialog initialName={selectedRoof.name} onClose={() => setDialog(null)} onCreate={(roof) => { updateRoof(selectedRoof.id, { ...roof, id: selectedRoof.id, panelGroups: selectedRoof.panelGroups, obstacles: selectedRoof.obstacles }); setDialog(null); }} />
      )}
    </div>
  );
}
