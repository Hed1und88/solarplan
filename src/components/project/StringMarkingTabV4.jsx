import React, { useMemo, useState } from 'react';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Cable, Calculator, CheckCircle2, ChevronDown, ChevronUp, Info, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'];
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };
const SCALE = 58;
const DEF_PANEL = { w: 1.134, h: 1.953 };
const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
const pos = (v, f = 0) => num(v, f) > 0 ? num(v, f) : f;
const round = (v, d = 1) => Math.round(num(v) * 10 ** d) / 10 ** d;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 99999)}`;
const json = (raw, fallback) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };
const stringBackupKey = projectId => `solarplan:project:${projectId}:string_layout_data`;
const plannerStorageKey = projectId => `solarplan:project:${projectId}:solar_roof_planner_data`;

function readLocalJson(key) {
  if (typeof window === 'undefined' || !key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeStringBackup(projectId, payload) {
  if (typeof window === 'undefined' || !projectId) return;
  try { window.localStorage.setItem(stringBackupKey(projectId), JSON.stringify(payload)); } catch {}
}

function panelSize(orientation, product) {
  const w = pos(product?.width_mm, 0) / 1000;
  const h = pos(product?.height_mm, 0) / 1000;
  const base = w && h ? { w, h } : DEF_PANEL;
  return String(orientation || '').toLowerCase().includes('ligg') ? { w: base.h, h: base.w } : base;
}

function roofPanelProduct(roof, products, fallback) {
  return products.find(product => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || fallback;
}

function roofPoly(x, y, w, h, shape) {
  if (shape === 'Trapets vänster') return `${x + w * .18},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Trapets höger') return `${x},${y} ${x + w * .82},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram vänster') return `${x + w * .12},${y} ${x + w},${y} ${x + w * .88},${y + h} ${x},${y + h}`;
  if (shape === 'Parallellogram höger') return `${x},${y} ${x + w * .88},${y} ${x + w},${y + h} ${x + w * .12},${y + h}`;
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function parseLayout(project) {
  const planner = json(project?.solar_roof_planner_data, null);
  if (Array.isArray(planner?.roofs) && planner.roofs.some(r => (r.panelGroups || []).length)) return { source: 'solar_roof_planner_data', roofs: planner.roofs, legacy: [] };
  const backup = readLocalJson(plannerStorageKey(project?.id));
  if (Array.isArray(backup?.roofs) && backup.roofs.some(r => (r.panelGroups || []).length)) return { source: 'solar_roof_planner_data_backup', roofs: backup.roofs, legacy: [] };
  const old = json(project?.panel_layout_data, null);
  const legacy = Array.isArray(old) ? old : Array.isArray(old?.panels) ? old.panels : [];
  if (legacy.length) return { source: 'panel_layout_data', roofs: [{ id: 'legacy', name: 'Panelritning', widthM: pos(old?.roofWidth, pos(project?.roof_width_m, 8)), roofFallM: pos(old?.roofHeight, pos(project?.roof_height_m, 6)), shape: 'Rektangel' }], legacy };
  return { source: null, roofs: [], legacy: [] };
}

function buildMap(layout, products, fallbackPanelProduct) {
  const pad = 60;
  const gap = 85;
  const panelGap = .035 * SCALE;
  let yCursor = pad;
  const roofLayouts = [];
  const panels = [];
  const panelGroups = [];

  layout.roofs.forEach((roof, roofIndex) => {
    const roofId = String(roof.id || `roof-${roofIndex}`);
    const r = { roof, x: pad, y: yCursor, w: pos(roof.widthM, 8) * SCALE, h: pos(roof.roofFallM, 6) * SCALE };
    roofLayouts.push(r);
    yCursor += r.h + gap;

    if (layout.legacy.length) {
      const groupId = 'legacy-group';
      const rows = Math.max(1, ...layout.legacy.map(p => num(p.row) + 1));
      const cols = Math.max(1, ...layout.legacy.map(p => num(p.col) + 1));
      const pw = Math.min(r.w / cols, 72);
      const ph = Math.min(r.h / rows, Math.max(44, pw * 1.45));
      layout.legacy.forEach((p, i) => {
        const x = r.x + num(p.col) * (pw + 2);
        const y = r.y + num(p.row) * (ph + 2);
        panels.push({ id: p.id || `legacy-${i}`, roofId, groupId, groupName: 'Panelgrupp', x, y, w: pw, h: ph, black: { x, y: y + ph / 2 }, red: { x: x + pw, y: y + ph / 2 } });
      });
      panelGroups.push({ id: groupId, label: 'Panelritning / Panelgrupp', roofName: 'Panelritning', groupName: 'Panelgrupp', panelCount: layout.legacy.length });
      return;
    }

    (roof.panelGroups || []).forEach((group, groupIndex) => {
      const groupId = `${roofId}-${group.id || groupIndex}`;
      const groupName = group.name || `Panelgrupp ${groupIndex + 1}`;
      const s = panelSize(group.orientation, roofPanelProduct(roof, products, fallbackPanelProduct));
      const pw = s.w * SCALE;
      const ph = s.h * SCALE;
      const sx = r.x + pos(group.xM) * SCALE;
      const sy = r.y + pos(group.yM) * SCALE;
      const rows = Math.round(pos(group.rows));
      const cols = Math.round(pos(group.cols));
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const override = group.panelOverrides?.[`${row}-${col}`];
          const x = override ? r.x + pos(override.xM) * SCALE : sx + col * (pw + panelGap);
          const y = override ? r.y + pos(override.yM) * SCALE : sy + row * (ph + panelGap);
          panels.push({ id: `r${roofId}-g${group.id || groupIndex}-${row}-${col}`, roofId, groupId, groupName, x, y, w: pw, h: ph, black: { x, y: y + ph / 2 }, red: { x: x + pw, y: y + ph / 2 } });
        }
      }
      panelGroups.push({ id: groupId, label: `${roof.name || 'Tak'} / ${groupName}`, roofName: roof.name || 'Tak', groupName, panelCount: rows * cols });
    });
  });

  return { roofLayouts, panels, panelGroups, width: Math.max(900, ...roofLayouts.map(r => r.x + r.w + 160), 900), height: Math.max(560, yCursor + pad) };
}

function readStored(project) {
  const server = json(project?.string_layout_data, null);
  const backup = readLocalJson(stringBackupKey(project?.id));
  const preferred = server?.version >= 2 && Array.isArray(server.strings) ? server : backup;
  if (preferred?.version >= 2 && Array.isArray(preferred.strings)) return preferred;
  return { strings: [], stringCount: 1, settings: {}, panelProductId: '', inverterProductId: '' };
}

function makeString(i, old = {}) {
  const legacyPvInput = old.pvInput || old.pv_input || old.pv || '';
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${i + 1}`,
    color: old.color || COLORS[i % COLORS.length],
    nodes: old.nodes || [],
    panel_count: old.panel_count || 0,
    panelGroupId: old.panelGroupId || '',
    mppt: old.mppt || 1,
    pvInput: legacyPvInput,
    ...old,
    pvInput: legacyPvInput || old.pvInput || '',
  };
}

function countPanels(nodes) {
  return new Set((nodes || []).map(node => node.panelId)).size;
}

function groupPanelCount(map, groupId) {
  if (!groupId) return 0;
  return map.panelGroups.find(group => group.id === groupId)?.panelCount || map.panels.filter(panel => panel.groupId === groupId).length;
}

function nodesForGroup(map, groupId) {
  return map.panels.filter(panel => panel.groupId === groupId).flatMap(panel => [{ panelId: panel.id, terminal: 'black' }, { panelId: panel.id, terminal: 'red' }]);
}

function normPanel(p) {
  return p && { pmax: pos(p.power_watts), voc: pos(p.voc_v), vmp: pos(p.vmp_v), isc: pos(p.isc_a), imp: pos(p.imp_a), pcoef: num(p.temp_coeff_pmax_percent_c, -0.35), vcoef: num(p.temp_coeff_voc_percent_c, -0.27), icoef: num(p.temp_coeff_isc_percent_c, 0.05), noct: pos(p.noct_c, 45) };
}

function normInv(p) {
  const ac = pos(p?.power_watts) / 1000;
  return p && { ac, maxdc: pos(p.max_dc_power_kw, ac * 1.5), maxv: pos(p.max_dc_voltage_v), start: pos(p.startup_voltage_v), mpptmin: pos(p.mppt_voltage_min_v), mpptmax: pos(p.mppt_voltage_max_v), maxa: pos(p.max_input_current_a), maxisc: pos(p.max_short_circuit_current_a), mpptCount: Math.max(1, Math.round(pos(p.mppt_count, 2))), pvPerMppt: Math.max(1, Math.round(pos(p.strings_per_mppt, 2))) };
}

function pvInputsForMppt(mppt, inverter) {
  const perMppt = inverter?.pvPerMppt || 2;
  const start = (Number(mppt || 1) - 1) * perMppt + 1;
  return Array.from({ length: perMppt }, (_, i) => start + i);
}

function mpptFromPvInput(pvInput, inverter) {
  const perMppt = inverter?.pvPerMppt || 2;
  return Math.max(1, Math.ceil(Number(pvInput || 1) / perMppt));
}

function missingPanelFields(p) {
  if (!p) return ['Ingen solpanel vald'];
  return [['voc_v', 'Voc saknas'], ['vmp_v', 'Vmp saknas'], ['isc_a', 'Isc saknas'], ['imp_a', 'Imp saknas'], ['power_watts', 'Effekt saknas']].filter(([key]) => !pos(p[key])).map(([, label]) => label);
}

function missingInvFields(p) {
  if (!p) return ['Ingen växelriktare vald'];
  const m = [];
  if (!pos(p.max_dc_voltage_v)) m.push('Max DC-spänning saknas');
  if (!pos(p.startup_voltage_v)) m.push('Startspänning saknas');
  if (!pos(p.mppt_voltage_min_v) || !pos(p.mppt_voltage_max_v)) m.push('MPPT-spänningsområde saknas');
  if (!pos(p.max_input_current_a)) m.push('Max ingångsström saknas');
  if (!pos(p.max_short_circuit_current_a)) m.push('Max kortslutningsström saknas');
  return m;
}

function branchElectrical(panel, seriesPanelCount, settings) {
  const irr = 1000 * (WEATHER[settings.weather] ?? 1) * (TIME[settings.timeOfDay] ?? 1);
  const cell = num(settings.ambientTemperatureC, 20) + ((panel.noct - 20) / 800) * irr;
  const panelPower = panel.pmax * (irr / 1000) * (1 + ((cell - 25) * panel.pcoef) / 100);
  return { irr, cell, panelPower, seriesPanelCount, voc: panel.voc * (1 + ((cell - 25) * panel.vcoef) / 100) * seriesPanelCount, vmp: panel.vmp * (1 + ((cell - 25) * panel.vcoef) / 100) * seriesPanelCount, imp: panel.imp, isc: panel.isc * (1 + ((cell - 25) * panel.icoef) / 100), power: panelPower * seriesPanelCount };
}

function simulateMppt(panelProduct, inverterProduct, branches, settings) {
  const p = normPanel(panelProduct);
  const i = normInv(inverterProduct);
  const validBranches = (branches || []).filter(branch => pos(branch.panelCount) > 0);
  if (!p || !i || !validBranches.length) return null;
  const branchValues = validBranches.map(branch => ({ ...branch, ...branchElectrical(p, branch.panelCount, settings) }));
  const totalImp = branchValues.reduce((sum, item) => sum + item.imp, 0);
  const totalIsc = branchValues.reduce((sum, item) => sum + item.isc, 0);
  const totalPower = branchValues.reduce((sum, item) => sum + item.power, 0);
  const maxVoc = Math.max(...branchValues.map(item => item.voc));
  const minVmp = Math.min(...branchValues.map(item => item.vmp));
  const maxVmp = Math.max(...branchValues.map(item => item.vmp));
  const pvUsed = [...new Set(branchValues.map(item => item.pvInput).filter(Boolean))];
  const checks = [
    { label: 'Max DC-spänning', ok: i.maxv > 0 && maxVoc <= i.maxv, nodata: !i.maxv, detail: i.maxv > 0 ? `Högsta Voc ${round(maxVoc, 1)} V ≤ ${i.maxv} V` : 'Produkten saknar max_dc_voltage_v' },
    { label: 'Startspänning', ok: i.start > 0 && minVmp >= i.start, nodata: !i.start, detail: i.start > 0 ? `Lägsta Vmp ${round(minVmp, 1)} V ≥ ${i.start} V` : 'Produkten saknar startup_voltage_v' },
    { label: 'MPPT-område', ok: i.mpptmin > 0 && i.mpptmax > 0 && minVmp >= i.mpptmin && maxVmp <= i.mpptmax, nodata: !i.mpptmin || !i.mpptmax, detail: (i.mpptmin && i.mpptmax) ? `Vmp ${round(minVmp, 1)}-${round(maxVmp, 1)} V i [${i.mpptmin}-${i.mpptmax}] V` : 'Produkten saknar mppt_voltage_min/max_v' },
    { label: 'MPPT-ström', ok: i.maxa > 0 && totalImp <= i.maxa, nodata: !i.maxa, detail: i.maxa > 0 ? `Total Imp ${round(totalImp, 2)} A (${branchValues.length} slinga/slingor) ≤ ${i.maxa} A` : 'Produkten saknar max_input_current_a' },
    { label: 'Kortslutningsström', ok: i.maxisc > 0 && totalIsc <= i.maxisc, nodata: !i.maxisc, detail: i.maxisc > 0 ? `Total Isc ${round(totalIsc, 2)} A ≤ ${i.maxisc} A` : 'Produkten saknar max_short_circuit_current_a' },
    { label: 'PV-ingångar', ok: true, nodata: false, detail: pvUsed.length ? `Använder ${pvUsed.map(pv => `PV${pv}`).join(', ')}` : 'Ingen PV-ingång vald' },
    { label: 'DC-effekt', ok: i.maxdc > 0 && totalPower / 1000 <= i.maxdc, nodata: !i.maxdc, detail: i.maxdc > 0 ? `${round(totalPower / 1000, 2)} kW ≤ ${i.maxdc} kW` : 'Produkten saknar max_dc_power_kw' },
  ];
  return { status: checks.filter(check => !check.nodata).every(check => check.ok) ? 'OK' : 'Ej godkänd', checks, branchValues, branchCount: branchValues.length, current: totalImp, isc: totalIsc, power: totalPower, voc: maxVoc, vmpMin: minVmp, vmpMax: maxVmp };
}

function Select({ label, value, onChange, children }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}
function Input({ label, value, onChange, min, max }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}
function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}
function CheckRow({ check }) {
  const Icon = check.ok ? CheckCircle2 : check.nodata ? AlertTriangle : XCircle;
  const tone = check.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : check.nodata ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-red-700 bg-red-50 border-red-100';
  return <div className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">{check.label}</div><div className="text-xs opacity-90">{check.detail}</div></div></div>;
}

function Canvas({ map, strings, activeId, onClickNode }) {
  const point = node => {
    const p = map.panels.find(x => x.id === node.panelId);
    return p ? p[node.terminal] : null;
  };
  const pts = nodes => nodes.map(point).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');
  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]">
        <defs><pattern id="string-hatch-v4" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {map.roofLayouts.map(r => <g key={r.roof.id || r.roof.name}><text x={r.x} y={r.y - 22} fontSize="18" fontWeight="800">{r.roof.name || 'Tak'}</text><polygon points={roofPoly(r.x, r.y, r.w, r.h, r.roof.shape)} fill="url(#string-hatch-v4)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
        {map.panels.map((p, i) => <g key={p.id}><rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill="#dbeafe" stroke="#2563eb" /><text x={p.x + p.w / 2} y={p.y + p.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{i + 1}</text><circle cx={p.black.x} cy={p.black.y} r="7" fill="#111827" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'black')} className="cursor-pointer" /><circle cx={p.red.x} cy={p.red.y} r="7" fill="#dc2626" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'red')} className="cursor-pointer" /></g>)}
        {strings.filter(s => s.nodes?.length >= 2).map(s => <g key={s.id}><polyline points={pts(s.nodes)} fill="none" stroke={s.color} strokeWidth={s.id === activeId ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" />{s.nodes.map((n, i) => { const p = point(n); return p && <circle key={i} cx={p.x} cy={p.y} r={s.id === activeId ? 6 : 4} fill={s.color} stroke="white" />; })}</g>)}
      </svg>
    </div>
  );
}

function PvInputPanel({ selectedPv, setSelectedPv, pvInputs, strings, selectedMppt, onToggleString }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">PV-ingångar på MPPT {selectedMppt}</div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {pvInputs.map(pv => {
          const pvStrings = strings.filter(item => Number(item.pvInput) === Number(pv));
          return <button key={pv} type="button" onClick={() => setSelectedPv(pv)} className={`rounded-xl border p-3 text-left ${Number(selectedPv) === Number(pv) ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
            <div className="font-bold">PV {pv}</div>
            <div className="text-xs text-muted-foreground">{pvStrings.length ? pvStrings.map(item => item.name).join(', ') : 'Ingen slinga vald'}</div>
          </button>;
        })}
      </div>
      <div className="mt-3 rounded-xl bg-muted/40 p-3">
        <div className="mb-2 text-sm font-semibold">Slingor på PV {selectedPv}</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {strings.map(item => {
            const checked = Number(item.pvInput) === Number(selectedPv);
            const assignedOtherPv = item.pvInput && Number(item.pvInput) !== Number(selectedPv);
            return <label key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
              <input type="checkbox" checked={checked} onChange={event => onToggleString(item.id, event.target.checked)} />
              <span>{item.name}</span>
              {assignedOtherPv && <span className="text-xs text-muted-foreground">PV{item.pvInput}</span>}
            </label>;
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Exempel: välj MPPT 1 → PV 1 och bocka i Slinga 1 och Slinga 2. Välj sedan PV 2 och bocka i Slinga 3.</p>
    </div>
  );
}

export default function StringMarkingTabV4({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const saved = readStored(project);
  const layout = useMemo(() => parseLayout(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => listVisibleProducts('-created_date') });
  const panels = products.filter(p => p.category === 'solpanel' && p.is_active !== false);
  const inverters = products.filter(p => p.category === 'vaxelriktare' && p.is_active !== false);
  const [panelId, setPanelIdState] = useState(saved.panelProductId || selectedProductProp?.id || '');
  const [invId, setInvIdState] = useState(saved.inverterProductId || '');
  const [count, setCountState] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, i) => makeString(i, saved.strings?.[i])));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [selectedMppt, setSelectedMpptState] = useState(Number(strings[0]?.mppt || 1));
  const [selectedPv, setSelectedPvState] = useState(Number(strings[0]?.pvInput || 1));
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [settings, setSettingsState] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20, roofTiltDeg: saved.settings?.roofTiltDeg ?? 27, roofAzimuthDeg: saved.settings?.roofAzimuthDeg ?? 180 });

  const panelProduct = panels.find(p => p.id === panelId) || selectedProductProp || null;
  const invProduct = inverters.find(p => p.id === invId) || null;
  const inverter = normInv(invProduct);
  const pvInputs = pvInputsForMppt(selectedMppt, inverter);
  const selectedPvNumber = pvInputs.includes(Number(selectedPv)) ? Number(selectedPv) : pvInputs[0];
  const map = useMemo(() => buildMap(layout, panels, panelProduct), [layout, panels, panelProduct]);
  const active = strings.find(x => x.id === activeId) || strings[0];
  const activeNodes = active?.nodes || [];
  const activePanelCount = countPanels(activeNodes) || active?.panel_count || groupPanelCount(map, active?.panelGroupId);

  const buildPayload = (nextStrings = strings, overrides = {}) => ({
    version: 6,
    source: layout.source,
    stringCount: overrides.stringCount ?? count,
    panelProductId: overrides.panelProductId ?? panelId,
    inverterProductId: overrides.inverterProductId ?? invId,
    settings: overrides.settings ?? settings,
    savedAt: new Date().toISOString(),
    autosave: true,
    strings: nextStrings,
    pvTopology: nextStrings.map(item => ({ stringId: item.id, name: item.name, mppt: item.mppt || '', pvInput: item.pvInput || '', panelGroupId: item.panelGroupId || '' })),
  });

  const persist = async (nextStrings = strings, overrides = {}) => {
    const payload = buildPayload(nextStrings, overrides);
    writeStringBackup(project?.id, payload);
    setSaving(true);
    setSaveInfo('Sparar...');
    try {
      await onUpdate?.({ string_layout_data: JSON.stringify(payload) });
      setSaveInfo(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch (error) {
      setSaveInfo('Lokal backup sparad. Servern svarade inte.');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const replaceStrings = (nextStrings, overrides = {}) => {
    setStrings(nextStrings);
    persist(nextStrings, overrides).catch(() => {});
  };

  const patchString = (stringId, patch) => replaceStrings(strings.map(item => item.id === stringId ? { ...item, ...patch } : item));
  const patchActiveString = patch => active?.id && patchString(active.id, patch);

  const setStringCount = value => {
    const nextCount = Math.max(1, Math.min(40, Number(value) || 1));
    const next = Array.from({ length: nextCount }, (_, i) => makeString(i, strings[i]));
    setCountState(nextCount);
    setStrings(next);
    if (!next.some(item => item.id === activeId)) setActiveId(next[0]?.id || null);
    persist(next, { stringCount: nextCount }).catch(() => {});
  };

  const setPanelId = value => { setPanelIdState(value); persist(strings, { panelProductId: value }).catch(() => {}); };
  const setInvId = value => { setInvIdState(value); persist(strings, { inverterProductId: value }).catch(() => {}); };
  const setSettings = nextSettings => { setSettingsState(nextSettings); persist(strings, { settings: nextSettings }).catch(() => {}); };
  const setSelectedMppt = value => {
    const nextMppt = Number(value) || 1;
    const firstPv = pvInputsForMppt(nextMppt, inverter)[0];
    setSelectedMpptState(nextMppt);
    setSelectedPvState(firstPv);
  };
  const setSelectedPv = value => {
    const pv = Number(value) || 1;
    setSelectedPvState(pv);
    setSelectedMpptState(mpptFromPvInput(pv, inverter));
  };

  const toggleStringOnPv = (stringId, checked) => {
    const next = strings.map(item => item.id === stringId ? { ...item, mppt: checked ? selectedMppt : item.mppt, pvInput: checked ? selectedPvNumber : '' } : item);
    replaceStrings(next);
    if (checked) setActiveId(stringId);
  };

  const applyPanelGroup = groupId => {
    const nodes = nodesForGroup(map, groupId);
    patchActiveString({ panelGroupId: groupId, nodes, panel_count: countPanels(nodes), mppt: selectedMppt, pvInput: selectedPvNumber });
  };

  const addNode = (panel, terminal) => {
    if (!active?.id) return;
    const nodes = [...(active.nodes || []), { panelId: panel.id, terminal }];
    patchActiveString({ nodes, panel_count: countPanels(nodes), mppt: selectedMppt, pvInput: selectedPvNumber });
  };

  const clearActiveString = () => patchActiveString({ nodes: [], panel_count: 0, panelGroupId: '', pvInput: '', mppt: selectedMppt });

  const mpptBranches = useMemo(() => strings
    .filter(item => Number(item.mppt || mpptFromPvInput(item.pvInput, inverter)) === Number(selectedMppt))
    .map(item => {
      const panelCount = countPanels(item.nodes || []) || item.panel_count || groupPanelCount(map, item.panelGroupId);
      return { groupId: item.id, label: `${item.name}${item.pvInput ? ` · PV${item.pvInput}` : ''}`, panelCount, stringId: item.id, hasMappedString: Boolean(item.panelGroupId), pvInput: item.pvInput || '' };
    }).filter(branch => branch.panelCount > 0), [strings, selectedMppt, inverter, map]);

  const result = simulateMppt(panelProduct, invProduct, mpptBranches, settings);
  const panelMissing = missingPanelFields(panelProduct);
  const invMissing = missingInvFields(invProduct);
  const hasMissing = panelMissing.length > 0 || invMissing.length > 0;

  if (!map.panels.length) {
    return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i projektets flik Paneler först.</div></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle><p className="text-sm text-muted-foreground">Välj MPPT, sedan fysisk PV-ingång. På varje PV-ingång kan du lägga en eller flera slingor.</p></div>
            <div className="flex flex-col items-end gap-2"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button>{saveInfo && <span className="text-xs text-muted-foreground">{saving ? 'Sparar...' : saveInfo}</span>}</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4"><Input label="Antal slingor" min="1" max="40" value={count} onChange={setStringCount} /><ProductSearchSelect label="Solpanel" products={panels} value={panelId} onChange={setPanelId} placeholder="Sök/välj solpanel" /><ProductSearchSelect label="Växelriktare" products={inverters} value={invId} onChange={setInvId} placeholder="Sök/välj växelriktare" /><Select label="Aktiv slinga" value={activeId || ''} onChange={value => { setActiveId(value); const s = strings.find(item => item.id === value); if (s?.pvInput) setSelectedPv(s.pvInput); else if (s?.mppt) setSelectedMppt(s.mppt); }}>{strings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
          <div className="grid gap-3 lg:grid-cols-[0.8fr_0.8fr_1.4fr]"><Select label="MPPT-ingång" value={selectedMppt} onChange={setSelectedMppt}>{Array.from({ length: inverter?.mpptCount || 4 }, (_, i) => <option key={i + 1} value={i + 1}>MPPT {i + 1}</option>)}</Select><Select label="PV-ingång" value={selectedPvNumber} onChange={setSelectedPv}>{pvInputs.map(pv => <option key={pv} value={pv}>PV {pv}</option>)}</Select><Select label="Panelgrupp för aktiv slinga" value={active?.panelGroupId || ''} onChange={applyPanelGroup}><option value="">Välj panelgrupp...</option>{map.panelGroups.map(group => <option key={group.id} value={group.id}>{group.label} ({group.panelCount} paneler)</option>)}</Select></div>
          <PvInputPanel selectedPv={selectedPvNumber} setSelectedPv={setSelectedPv} pvInputs={pvInputs} strings={strings} selectedMppt={selectedMppt} onToggleString={toggleStringOnPv} />
          <div className="grid gap-3 lg:grid-cols-5"><Select label="Väder" value={settings.weather} onChange={value => setSettings({ ...settings, weather: value })}>{Object.keys(WEATHER).map(item => <option key={item}>{item}</option>)}</Select><Select label="Tid" value={settings.timeOfDay} onChange={value => setSettings({ ...settings, timeOfDay: value })}>{Object.keys(TIME).map(item => <option key={item}>{item}</option>)}</Select><Input label="Temperatur °C" value={settings.ambientTemperatureC} onChange={value => setSettings({ ...settings, ambientTemperatureC: Number(value) })} /><Input label="Taklutning °" value={settings.roofTiltDeg} onChange={value => setSettings({ ...settings, roofTiltDeg: Number(value) })} /><Input label="Azimut °" value={settings.roofAzimuthDeg} onChange={value => setSettings({ ...settings, roofAzimuthDeg: Number(value) })} /></div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="mr-2 inline h-4 w-4" />Exempel: MPPT 1 visar PV1 och PV2. Lägg Slinga 1 och Slinga 2 på PV1, Slinga 3 på PV2. Byt sedan till MPPT 2 för PV3/PV4.</div>
          <Canvas map={map} strings={strings} activeId={activeId} onClickNode={addNode} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3"><div className="text-sm text-muted-foreground">Aktiv slinga: <b>{active?.name}</b> · PV{active?.pvInput || '-'} · MPPT {active?.mppt || selectedMppt} · {active?.nodes?.length || 0} punkter · {activePanelCount || 0} paneler</div><div className="flex gap-2"><Button variant="outline" className="text-red-600" onClick={clearActiveString}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button><Button onClick={() => persist(strings).catch(() => {})} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara nu'}</Button></div></div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" />Beräkning för MPPT {selectedMppt}</CardTitle></CardHeader><CardContent className="space-y-4">
        {hasMissing && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Produktdata saknas: {[...panelMissing, ...invMissing].join(', ')}.</div>}
        {result ? <><div className="flex flex-wrap items-center gap-2"><Badge className={result.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{result.status === 'OK' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{result.status}</Badge><span className="text-sm text-muted-foreground">MPPT {selectedMppt} · {result.branchCount} slinga/slingor</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Effekt" value={round(result.power / 1000, 2)} unit="kW" /><Metric label="Vmp-intervall" value={`${round(result.vmpMin, 1)}-${round(result.vmpMax, 1)}`} unit="V" /><Metric label="Imp total" value={round(result.current, 2)} unit="A" /><Metric label="Isc total" value={round(result.isc, 2)} unit="A" /></div><Button variant="outline" size="sm" onClick={() => setShowDetails(!showDetails)}>{showDetails ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}{showDetails ? 'Dölj mer data' : 'Visa mer data för MPPT/PV'}</Button>{showDetails && <><div className="rounded-xl border bg-background p-3"><div className="mb-2 text-sm font-semibold">Slingor som ingår i MPPT {selectedMppt}</div><div className="grid gap-2 lg:grid-cols-2">{result.branchValues.map(branch => <div key={branch.groupId} className="rounded-lg border border-border p-3 text-sm"><div className="font-semibold text-foreground">{branch.label}</div><div className="text-xs text-muted-foreground">{branch.panelCount} paneler i serie · Voc {round(branch.voc, 1)} V · Vmp {round(branch.vmp, 1)} V · Imp {round(branch.imp, 2)} A · Isc {round(branch.isc, 2)} A · Effekt {round(branch.power / 1000, 2)} kW</div></div>)}</div></div><div className="grid gap-2 lg:grid-cols-2">{result.checks.map(check => <CheckRow key={check.label} check={check} />)}</div></>}</> : <div className="rounded-xl border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">Välj solpanel, växelriktare, MPPT, PV-ingång och panelgrupp för att få beräkning.</div>}
      </CardContent></Card>
    </div>
  );
}
