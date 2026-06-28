import React, { useMemo, useState } from 'react';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Cable, Calculator, CheckCircle2, Circle, Info, Link2, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const WEATHER = { Soligt: 1, 'Lätta moln': 0.7, Molnigt: 0.35, Regn: 0.15 };
const TIME = { '06:00': 0.15, '08:00': 0.45, '10:00': 0.75, '12:00': 1, '14:00': 0.8, '16:00': 0.5, '18:00': 0.2, '20:00': 0.05 };
const SCALE = 58;
const DEF_PANEL = { w: 1.134, h: 1.953 };

const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
const pos = (v, f = 0) => num(v, f) > 0 ? num(v, f) : f;
const round = (v, d = 1) => Math.round(num(v) * 10 ** d) / 10 ** d;
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 99999)}`;

function json(raw, fallback) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

const plannerStorageKey = (projectId) => `solarplan:project:${projectId}:solar_roof_planner_data`;

function readPlannerBackup(project) {
  if (typeof window === 'undefined' || !project?.id) return null;
  try {
    return JSON.parse(window.localStorage.getItem(plannerStorageKey(project.id)) || 'null');
  } catch {
    return null;
  }
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
  if (Array.isArray(planner?.roofs) && planner.roofs.some(r => (r.panelGroups || []).length)) {
    return { source: 'solar_roof_planner_data', roofs: planner.roofs, legacy: [] };
  }

  const backup = readPlannerBackup(project);
  if (Array.isArray(backup?.roofs) && backup.roofs.some(r => (r.panelGroups || []).length)) {
    return { source: 'solar_roof_planner_data_backup', roofs: backup.roofs, legacy: [] };
  }

  const old = json(project?.panel_layout_data, null);
  const legacy = Array.isArray(old) ? old : Array.isArray(old?.panels) ? old.panels : [];
  if (legacy.length) {
    return {
      source: 'panel_layout_data',
      roofs: [{ id: 'legacy', name: 'Panelritning', widthM: pos(old?.roofWidth, pos(project?.roof_width_m, 8)), roofFallM: pos(old?.roofHeight, pos(project?.roof_height_m, 6)), shape: 'Rektangel' }],
      legacy,
    };
  }

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
          panels.push({
            id: `r${roofId}-g${group.id || groupIndex}-${row}-${col}`,
            roofId,
            groupId,
            groupName,
            x,
            y,
            w: pw,
            h: ph,
            black: { x, y: y + ph / 2 },
            red: { x: x + pw, y: y + ph / 2 },
          });
        }
      }

      panelGroups.push({
        id: groupId,
        label: `${roof.name || 'Tak'} / ${groupName}`,
        roofName: roof.name || 'Tak',
        groupName,
        panelCount: rows * cols,
      });
    });
  });

  return {
    roofLayouts,
    panels,
    panelGroups,
    width: Math.max(900, ...roofLayouts.map(r => r.x + r.w + 160), 900),
    height: Math.max(560, yCursor + pad),
  };
}

function stored(project) {
  const d = json(project?.string_layout_data, null);
  if (d?.version === 2 || d?.version === 3) return d;
  return { strings: [], stringCount: 1, settings: {}, panelProductId: '', inverterProductId: '' };
}

function makeString(i, old = {}) {
  return {
    id: old.id || uid(),
    name: old.name || `Slinga ${i + 1}`,
    color: old.color || COLORS[i % COLORS.length],
    nodes: old.nodes || [],
    panel_count: old.panel_count || 0,
    panelGroupId: old.panelGroupId || '',
    mppt: old.mppt || 1,
    parallelEnabled: old.parallelEnabled || false,
    parallelGroupId: old.parallelGroupId || '',
    ...old,
  };
}

function countPanels(nodes) {
  return new Set((nodes || []).map(n => n.panelId)).size;
}

function normPanel(p) {
  return p && { pmax: pos(p.power_watts), voc: pos(p.voc_v), vmp: pos(p.vmp_v), isc: pos(p.isc_a), imp: pos(p.imp_a), pcoef: num(p.temp_coeff_pmax_percent_c, -0.35), vcoef: num(p.temp_coeff_voc_percent_c, -0.27), icoef: num(p.temp_coeff_isc_percent_c, 0.05), noct: pos(p.noct_c, 45) };
}

function normInv(p) {
  const ac = pos(p?.power_watts) / 1000;
  return p && {
    ac,
    maxdc: pos(p.max_dc_power_kw, ac * 1.5),
    maxv: pos(p.max_dc_voltage_v),
    start: pos(p.startup_voltage_v),
    mpptmin: pos(p.mppt_voltage_min_v),
    mpptmax: pos(p.mppt_voltage_max_v),
    maxa: pos(p.max_input_current_a),
    maxisc: pos(p.max_short_circuit_current_a),
    mpptCount: Math.max(1, Math.round(pos(p.mppt_count, 2))),
    stringsPerMppt: Math.max(1, Math.round(pos(p.strings_per_mppt, 2))),
  };
}

function missingPanelFields(p) {
  if (!p) return ['Ingen solpanel vald'];
  const m = [];
  if (!pos(p.voc_v)) m.push('Voc saknas');
  if (!pos(p.vmp_v)) m.push('Vmp saknas');
  if (!pos(p.isc_a)) m.push('Isc saknas');
  if (!pos(p.imp_a)) m.push('Imp saknas');
  if (!pos(p.power_watts)) m.push('Effekt saknas');
  return m;
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

function simulate(panelProduct, inverterProduct, seriesPanelCount, settings, parallelCount = 1) {
  const p = normPanel(panelProduct);
  const i = normInv(inverterProduct);
  if (!p || !i || !seriesPanelCount) return null;

  const irr = 1000 * (WEATHER[settings.weather] ?? 1) * (TIME[settings.timeOfDay] ?? 1);
  const cell = num(settings.ambientTemperatureC, 20) + ((p.noct - 20) / 800) * irr;
  const panelPower = p.pmax * (irr / 1000) * (1 + ((cell - 25) * p.pcoef) / 100);
  const voc = p.voc * (1 + ((cell - 25) * p.vcoef) / 100) * seriesPanelCount;
  const vmp = p.vmp * (1 + ((cell - 25) * p.vcoef) / 100) * seriesPanelCount;
  const imp = p.imp * parallelCount;
  const isc = p.isc * (1 + ((cell - 25) * p.icoef) / 100) * parallelCount;
  const power = panelPower * seriesPanelCount * parallelCount;
  const checks = [
    { label: 'Max DC-spänning', ok: i.maxv > 0 && voc <= i.maxv, nodata: !i.maxv, detail: i.maxv > 0 ? `Voc ${round(voc, 1)} V ≤ ${i.maxv} V` : 'Produkten saknar max_dc_voltage_v' },
    { label: 'Startspänning', ok: i.start > 0 && vmp >= i.start, nodata: !i.start, detail: i.start > 0 ? `Vmp ${round(vmp, 1)} V ≥ ${i.start} V` : 'Produkten saknar startup_voltage_v' },
    { label: 'MPPT-område', ok: i.mpptmin > 0 && i.mpptmax > 0 && vmp >= i.mpptmin && vmp <= i.mpptmax, nodata: !i.mpptmin || !i.mpptmax, detail: (i.mpptmin && i.mpptmax) ? `Vmp ${round(vmp, 1)} V i [${i.mpptmin}-${i.mpptmax}] V` : 'Produkten saknar mppt_voltage_min/max_v' },
    { label: 'MPPT-ström', ok: i.maxa > 0 && imp <= i.maxa, nodata: !i.maxa, detail: i.maxa > 0 ? `Imp ${round(imp, 2)} A (${parallelCount} parallell) ≤ ${i.maxa} A` : 'Produkten saknar max_input_current_a' },
    { label: 'Kortslutningsström', ok: i.maxisc > 0 && isc <= i.maxisc, nodata: !i.maxisc, detail: i.maxisc > 0 ? `Isc ${round(isc, 2)} A ≤ ${i.maxisc} A` : 'Produkten saknar max_short_circuit_current_a' },
    { label: 'DC-effekt', ok: i.maxdc > 0 && power / 1000 <= i.maxdc, nodata: !i.maxdc, detail: i.maxdc > 0 ? `${round(power / 1000, 2)} kW ≤ ${i.maxdc} kW` : 'Produkten saknar max_dc_power_kw' },
  ];
  return { status: checks.every(c => c.ok) ? 'OK' : 'Ej godkänd', checks, irr, cell, panelPower, voc, vmp, current: imp, isc, power, dcac: i.ac ? power / 1000 / i.ac : 0 };
}

function Select({ label, value, onChange, children }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}

function Input({ label, value, onChange, min, max }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}

function Metric({ label, value, unit }) {
  return <div className="rounded-xl bg-muted/50 p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div><div className="text-lg font-black">{value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></div></div>;
}

function Canvas({ map, strings, activeId, draft, onClickNode }) {
  const active = strings.find(s => s.id === activeId);
  const color = active?.color || COLORS[0];
  const point = node => {
    const p = map.panels.find(x => x.id === node.panelId);
    return p ? p[node.terminal] : null;
  };
  const pts = nodes => nodes.map(point).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="min-h-[560px] w-full min-w-[900px]">
        <defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {map.roofLayouts.map(r => <g key={r.roof.id || r.roof.name}><text x={r.x} y={r.y - 22} fontSize="18" fontWeight="800">{r.roof.name || 'Tak'}</text><polygon points={roofPoly(r.x, r.y, r.w, r.h, r.roof.shape)} fill="url(#hatch)" stroke="#0f172a" strokeWidth="2.5" /></g>)}
        {map.panels.map((p, i) => <g key={p.id}><rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill="#dbeafe" stroke="#2563eb" /><text x={p.x + p.w / 2} y={p.y + p.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d4ed8">{i + 1}</text><circle cx={p.black.x} cy={p.black.y} r="7" fill="#111827" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'black')} className="cursor-pointer" /><circle cx={p.red.x} cy={p.red.y} r="7" fill="#dc2626" stroke="white" strokeWidth="2" onClick={() => onClickNode(p, 'red')} className="cursor-pointer" /></g>)}
        {strings.filter(s => s.nodes?.length >= 2).map(s => <g key={s.id}><polyline points={pts(s.nodes)} fill="none" stroke={s.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{s.nodes.map((n, i) => { const p = point(n); return p && <circle key={i} cx={p.x} cy={p.y} r="5" fill={s.color} stroke="white" />; })}</g>)}
        {draft.length > 0 && <g>{draft.length >= 2 && <polyline points={pts(draft)} fill="none" stroke={color} strokeWidth="4" strokeDasharray="8 5" />}{draft.map((n, i) => { const p = point(n); return p && <circle key={i} cx={p.x} cy={p.y} r="6" fill={color} stroke="white" />; })}</g>}
      </svg>
    </div>
  );
}

function mpptParallelKey(string) {
  return string.parallelEnabled ? (string.parallelGroupId || `mppt-${string.mppt}`) : string.id;
}

export default function StringMarkingTab({ project, onUpdate, selectedProduct: selectedProductProp }) {
  const saved = stored(project);
  const layout = useMemo(() => parseLayout(project), [project]);
  const { data: products = [], refetch } = useQuery({ queryKey: ['products-for-string-marking'], queryFn: () => listVisibleProducts('-created_date') });
  const panels = products.filter(p => p.category === 'solpanel' && p.is_active !== false);
  const inverters = products.filter(p => p.category === 'vaxelriktare' && p.is_active !== false);
  const [panelId, setPanelId] = useState(saved.panelProductId || selectedProductProp?.id || '');
  const [invId, setInvId] = useState(saved.inverterProductId || '');
  const [count, setCount] = useState(Math.max(1, saved.stringCount || 1));
  const [strings, setStrings] = useState(() => Array.from({ length: Math.max(1, saved.stringCount || 1) }, (_, i) => makeString(i, saved.strings?.[i])));
  const [activeId, setActiveId] = useState(strings[0]?.id || null);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ weather: saved.settings?.weather || 'Soligt', timeOfDay: saved.settings?.timeOfDay || '12:00', ambientTemperatureC: saved.settings?.ambientTemperatureC ?? 20, roofTiltDeg: saved.settings?.roofTiltDeg ?? 27, roofAzimuthDeg: saved.settings?.roofAzimuthDeg ?? 180 });

  const panelProduct = panels.find(p => p.id === panelId) || selectedProductProp || null;
  const invProduct = inverters.find(p => p.id === invId) || null;
  const inverter = normInv(invProduct);
  const map = useMemo(() => buildMap(layout, panels, panelProduct), [layout, panels, panelProduct]);
  const active = strings.find(x => x.id === activeId) || strings[0];
  const currentNodes = draft.length ? draft : active?.nodes || [];
  const activePanelCount = countPanels(currentNodes);
  const parallelSiblings = strings.filter(s => Number(s.mppt || 1) === Number(active?.mppt || 1) && mpptParallelKey(s) === mpptParallelKey(active || {}) && (s.nodes?.length || s.panel_count));
  const activeIsCounted = parallelSiblings.some(item => item.id === active?.id);
  const parallelCount = active?.parallelEnabled ? Math.max(1, parallelSiblings.length + (currentNodes.length && !activeIsCounted ? 1 : 0)) : 1;
  const result = simulate(panelProduct, invProduct, activePanelCount, settings, parallelCount);

  const setStringCount = value => {
    const nextCount = Math.max(1, Math.min(10, Number(value) || 1));
    setCount(nextCount);
    setStrings(prev => Array.from({ length: nextCount }, (_, i) => makeString(i, prev[i])));
  };

  const updateActiveString = patch => {
    setStrings(prev => prev.map(item => item.id === active?.id ? { ...item, ...patch } : item));
  };

  const applyPanelGroupToDraft = groupId => {
    const groupPanels = map.panels.filter(panel => panel.groupId === groupId);
    const nodes = groupPanels.flatMap(panel => [{ panelId: panel.id, terminal: 'black' }, { panelId: panel.id, terminal: 'red' }]);
    setDraft(nodes);
    updateActiveString({ panelGroupId: groupId });
  };

  const save = async next => {
    setSaving(true);
    try {
      await onUpdate({
        string_layout_data: JSON.stringify({
          version: 3,
          source: layout.source,
          stringCount: count,
          panelProductId: panelId,
          inverterProductId: invId,
          settings,
          strings: next,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    const next = strings.map(item => item.id === active?.id && draft.length >= 2 ? { ...item, nodes: draft, panel_count: countPanels(draft) } : item);
    setStrings(next);
    setDraft([]);
    await save(next);
  };

  const clearActiveString = () => {
    const next = strings.map(item => item.id === active?.id ? { ...item, nodes: [], panel_count: 0 } : item);
    setStrings(next);
    setDraft([]);
  };

  if (!map.panels.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle></CardHeader>
        <CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ingen panelritning hittades. Skapa panelplacering i projektets flik Paneler först.</div></CardContent>
      </Card>
    );
  }

  const panelMissing = missingPanelFields(panelProduct);
  const invMissing = missingInvFields(invProduct);
  const hasMissing = panelMissing.length > 0 || invMissing.length > 0;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5 text-primary" />Slingmarkering</CardTitle>
              <p className="text-sm text-muted-foreground">Välj panelgrupp, MPPT och eventuell parallellkoppling. Klicka på panelerna om du vill justera ritningen manuellt.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Uppdatera produkter</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <Input label="Antal slingor" min="1" max="10" value={count} onChange={setStringCount} />
            <ProductSearchSelect label="Solpanel" products={panels} value={panelId} onChange={setPanelId} placeholder="Sök/välj solpanel" />
            <ProductSearchSelect label="Växelriktare" products={inverters} value={invId} onChange={setInvId} placeholder="Sök/välj växelriktare" />
            <Select label="Aktiv slinga" value={activeId || ''} onChange={value => { setActiveId(value); setDraft([]); }}>
              {strings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_1fr_1fr]">
            <Select label="Panelgrupp från Paneler" value={active?.panelGroupId || ''} onChange={value => applyPanelGroupToDraft(value)}>
              <option value="">Välj panelgrupp...</option>
              {map.panelGroups.map(group => <option key={group.id} value={group.id}>{group.label} ({group.panelCount} paneler)</option>)}
            </Select>
            <Select label="MPPT-ingång" value={active?.mppt || 1} onChange={value => updateActiveString({ mppt: Number(value) || 1 })}>
              {Array.from({ length: inverter?.mpptCount || 4 }, (_, i) => <option key={i + 1} value={i + 1}>MPPT {i + 1}</option>)}
            </Select>
            <Select label="Parallellgrupp" value={active?.parallelGroupId || ''} onChange={value => updateActiveString({ parallelGroupId: value, parallelEnabled: Boolean(value) })}>
              <option value="">Ej parallellkopplad</option>
              {Array.from({ length: 6 }, (_, i) => <option key={i + 1} value={`P${i + 1}`}>Parallellgrupp P{i + 1}</option>)}
            </Select>
            <label className="flex items-end gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(active?.parallelEnabled)} onChange={e => updateActiveString({ parallelEnabled: e.target.checked, parallelGroupId: e.target.checked ? active?.parallelGroupId || `P${active?.mppt || 1}` : '' })} />
              <span>Parallellkopplad på vald MPPT</span>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <Select label="Väder" value={settings.weather} onChange={value => setSettings({ ...settings, weather: value })}>{Object.keys(WEATHER).map(item => <option key={item}>{item}</option>)}</Select>
            <Select label="Tid" value={settings.timeOfDay} onChange={value => setSettings({ ...settings, timeOfDay: value })}>{Object.keys(TIME).map(item => <option key={item}>{item}</option>)}</Select>
            <Input label="Temperatur °C" value={settings.ambientTemperatureC} onChange={value => setSettings({ ...settings, ambientTemperatureC: Number(value) })} />
            <Input label="Taklutning °" value={settings.roofTiltDeg} onChange={value => setSettings({ ...settings, roofTiltDeg: Number(value) })} />
            <Input label="Azimut °" value={settings.roofAzimuthDeg} onChange={value => setSettings({ ...settings, roofAzimuthDeg: Number(value) })} />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            <Info className="mr-2 inline h-4 w-4" />Svart = minus. Röd = plus. När du väljer en panelgrupp fylls slingan med gruppens paneler automatiskt.
          </div>

          <Canvas map={map} strings={strings} activeId={activeId} draft={draft} onClickNode={(panel, terminal) => activeId && setDraft(current => [...current, { panelId: panel.id, terminal }])} />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">
              Aktiv ritning: <b>{active?.name}</b> · {draft.length || active?.nodes?.length || 0} punkter · {activePanelCount || active?.panel_count || 0} paneler · MPPT {active?.mppt || 1}
              {active?.parallelEnabled && <span> · parallellgrupp {active.parallelGroupId}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft([])} disabled={!draft.length}>Rensa osparad</Button>
              <Button variant="outline" className="text-red-600" onClick={clearActiveString}><Trash2 className="mr-2 h-4 w-4" />Rensa slinga</Button>
              <Button onClick={saveAll} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara slingor'}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4 text-primary" />Avancerad beräkning</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {hasMissing ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <b>Komplettera produktdata för att köra beräkning:</b>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">{[...panelMissing, ...invMissing].map(item => <li key={item}>{item}</li>)}</ul>
                </div>
                <p className="text-xs text-muted-foreground">Redigera produkten under <b>Produkter</b> och fyll i tekniska data.</p>
              </div>
            ) : !result ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Välj panelgrupp eller markera paneler i slingan för att se beräkning.</div>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-xl border p-3 font-bold text-sm ${result.status === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>Status: {result.status}</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <Metric label="Paneler/serie" value={activePanelCount} unit="st" />
                  <Metric label="Parallella" value={parallelCount} unit="st" />
                  <Metric label="Voc" value={round(result.voc, 1)} unit="V" />
                  <Metric label="Vmp" value={round(result.vmp, 1)} unit="V" />
                  <Metric label="Effekt" value={round(result.power / 1000, 2)} unit="kW" />
                </div>
                <div className="grid gap-1.5">
                  {result.checks.map(check => <div key={check.label} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${check.nodata ? 'bg-amber-50 text-amber-700 border border-amber-200' : check.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{check.nodata ? <Info className="h-4 w-4 shrink-0 mt-0.5" /> : check.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}<div><b>{check.label}</b>{check.detail && <span className="ml-2 opacity-75">{check.detail}</span>}</div></div>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Slingor och MPPT</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {strings.map(item => {
              const group = map.panelGroups.find(g => g.id === item.panelGroupId);
              const isParallel = item.parallelEnabled && item.parallelGroupId;
              return (
                <div key={item.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Circle className="h-4 w-4" style={{ color: item.color, fill: item.color }} />
                      <div>
                        <b>{item.name}</b>
                        <div className="text-xs text-muted-foreground">{group?.label || 'Ingen panelgrupp vald'} · {item.panel_count || countPanels(item.nodes)} paneler</div>
                      </div>
                    </div>
                    <Badge variant={item.nodes?.length >= 2 || item.panelGroupId ? 'default' : 'outline'}>{item.nodes?.length >= 2 || item.panelGroupId ? 'Sparbar' : 'Ej ritad'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-1">MPPT {item.mppt || 1}</span>
                    {isParallel ? <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700"><Link2 className="mr-1 inline h-3 w-3" />Parallell {item.parallelGroupId}</span> : <span className="rounded-full bg-muted px-2 py-1">Ej parallell</span>}
                  </div>
                </div>
              );
            })}
            {strings.some(item => item.parallelEnabled) && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Parallellkopplade slingor bör ha samma paneltyp och samma antal paneler i serie per MPPT.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
