import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Home, PanelTop, Plus, Save, Trash2 } from 'lucide-react';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';

const DEFAULT_PANEL = { id: 'standard', name: 'Standardpanel 500 W', model: 'Standardpanel 500 W', width_mm: 1134, height_mm: 1953, power_watts: 500 };
const PANEL_GAP_M = 0.03;
const SCALE = 58;
const SHAPES = ['Rektangel', 'Trapets vänster', 'Trapets höger', 'Parallellogram vänster', 'Parallellogram höger', 'Vinkel vänster', 'Vinkel höger'];
const genId = () => Math.floor(Date.now() + Math.random() * 99999);
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => n(value, fallback) > 0 ? n(value, fallback) : fallback;
const round = (value, decimals = 2) => Math.round(n(value) * 10 ** decimals) / 10 ** decimals;

const baseRoof = () => ({
  id: genId(),
  name: 'Tak 1',
  widthM: 8,
  roofFallM: 6,
  shape: 'Rektangel',
  angleDeg: 27,
  material: 'Takpannor',
  panelProductId: '',
  panelProductSnapshot: null,
  panelGroups: [{ id: genId(), name: 'Panelgrupp 1', rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} }],
  obstacles: [],
});

function parseProjectLayout(project) {
  try {
    const data = JSON.parse(project?.solar_roof_planner_data || 'null');
    if (Array.isArray(data?.roofs) && data.roofs.length) return data.roofs;
  } catch {}

  if (typeof window !== 'undefined' && project?.id) {
    try {
      const backup = JSON.parse(window.localStorage.getItem(`solarplan:project:${project.id}:solar_roof_planner_data`) || 'null');
      if (Array.isArray(backup?.roofs) && backup.roofs.length) return backup.roofs;
    } catch {}
  }

  return [{ ...baseRoof(), widthM: positive(project?.roof_width_m, 8), roofFallM: positive(project?.roof_height_m, 6) }];
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
    voc_v: product.voc_v,
    vmp_v: product.vmp_v,
    isc_a: product.isc_a,
    imp_a: product.imp_a,
  };
}

function panelProductForRoof(roof, products) {
  return products.find(product => product.id === roof?.panelProductId) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function panelLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

function panelSize(orientation, product) {
  const base = {
    w: positive(product?.width_mm, DEFAULT_PANEL.width_mm) / 1000,
    h: positive(product?.height_mm, DEFAULT_PANEL.height_mm) / 1000,
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

function totals(roofs, products) {
  return roofs.reduce((acc, roof) => {
    const product = panelProductForRoof(roof, products);
    (roof.panelGroups || []).forEach(group => {
      const count = Math.max(0, Math.round(n(group.rows) * n(group.cols)));
      acc.panels += count;
      acc.kwp += count * positive(product.power_watts, DEFAULT_PANEL.power_watts) / 1000;
    });
    return acc;
  }, { panels: 0, kwp: 0 });
}

function groupSize(group, roof, products) {
  const size = panelSize(group.orientation, panelProductForRoof(roof, products));
  const cols = Math.max(0, Math.round(n(group.cols)));
  const rows = Math.max(0, Math.round(n(group.rows)));
  return {
    w: cols * size.w + Math.max(0, cols - 1) * PANEL_GAP_M,
    h: rows * size.h + Math.max(0, rows - 1) * PANEL_GAP_M,
  };
}

function Input({ label, value, onChange, type = 'text', step, min }) {
  return <label className="block text-xs font-medium text-muted-foreground"><span>{label}</span><input type={type} step={step} min={min} value={value ?? ''} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>;
}

function Select({ label, value, onChange, children }) {
  return <label className="block text-xs font-medium text-muted-foreground"><span>{label}</span><select value={value ?? ''} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{children}</select></label>;
}

function RoofPreview({ roofs, products }) {
  const pad = 60;
  const gap = 95;
  let y = pad;
  const layouts = roofs.map(roof => {
    const layout = { roof, x: pad, y, w: positive(roof.widthM, 8) * SCALE, h: positive(roof.roofFallM, 6) * SCALE };
    y += layout.h + gap;
    return layout;
  });
  const width = Math.max(900, ...layouts.map(layout => layout.x + layout.w + 160));
  const height = Math.max(520, y + pad);

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[520px] w-full min-w-[900px]">
        <defs><pattern id="roof-hatch-v2" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#e2e8f0" strokeWidth="3" /></pattern></defs>
        {layouts.map(layout => {
          const product = panelProductForRoof(layout.roof, products);
          return <g key={layout.roof.id}>
            <text x={layout.x} y={layout.y - 24} fontSize="18" fontWeight="800">{layout.roof.name}</text>
            <text x={layout.x} y={layout.y - 7} fontSize="11" fill="#64748b">{panelLabel(product)} · {layout.roof.widthM} x {layout.roof.roofFallM} m</text>
            <polygon points={polygonPoints(layout.x, layout.y, layout.w, layout.h, layout.roof.shape)} fill="url(#roof-hatch-v2)" stroke="#111827" strokeWidth="2.5" />
            {(layout.roof.panelGroups || []).map(group => {
              const panel = panelSize(group.orientation, product);
              const panelW = panel.w * SCALE;
              const panelH = panel.h * SCALE;
              const rows = Math.max(0, Math.round(n(group.rows)));
              const cols = Math.max(0, Math.round(n(group.cols)));
              const panels = [];
              for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                  const override = group.panelOverrides?.[`${row}-${col}`];
                  const px = layout.x + (override ? n(override.xM) : n(group.xM) + col * (panel.w + PANEL_GAP_M)) * SCALE;
                  const py = layout.y + (override ? n(override.yM) : n(group.yM) + row * (panel.h + PANEL_GAP_M)) * SCALE;
                  const outside = px < layout.x || py < layout.y || px + panelW > layout.x + layout.w || py + panelH > layout.y + layout.h;
                  panels.push(<rect key={`${group.id}-${row}-${col}`} x={px} y={py} width={panelW} height={panelH} rx="4" fill={outside ? '#fee2e2' : '#dbeafe'} stroke={outside ? '#ef4444' : '#2563eb'} strokeWidth="1.5" />);
                }
              }
              return <g key={group.id}>{panels}<text x={layout.x + n(group.xM) * SCALE} y={layout.y + n(group.yM) * SCALE - 6} fontSize="11" fontWeight="700" fill="#1d4ed8">{group.name}</text></g>;
            })}
          </g>;
        })}
      </svg>
    </div>
  );
}

export default function SolarRoofPlannerV2({ project, onUpdate }) {
  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-roof-planner'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });
  const panelProducts = products.filter(product => product.is_active !== false);
  const [roofs, setRoofs] = useState(() => parseProjectLayout(project));
  const [selectedRoofId, setSelectedRoofId] = useState(roofs[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const selectedRoof = roofs.find(roof => String(roof.id) === String(selectedRoofId)) || roofs[0];
  const total = useMemo(() => totals(roofs, panelProducts), [roofs, panelProducts]);
  const warnings = useMemo(() => roofs.flatMap(roof => (roof.panelGroups || []).map(group => ({ roof, group, size: groupSize(group, roof, panelProducts) })).filter(({ roof, group, size }) => n(group.xM) + size.w > n(roof.widthM) || n(group.yM) + size.h > n(roof.roofFallM))), [roofs, panelProducts]);

  const setRoof = (roofId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, ...patch } : roof));
  const setGroup = (roofId, groupId, patch) => setRoofs(current => current.map(roof => String(roof.id) === String(roofId) ? { ...roof, panelGroups: (roof.panelGroups || []).map(group => String(group.id) === String(groupId) ? { ...group, ...patch } : group) } : roof));

  const addRoof = () => {
    const roof = { ...baseRoof(), name: `Tak ${roofs.length + 1}` };
    setRoofs(current => [...current, roof]);
    setSelectedRoofId(roof.id);
  };

  const deleteRoof = (roofId) => setRoofs(current => {
    const next = current.filter(roof => String(roof.id) !== String(roofId));
    if (!next.length) return current;
    setSelectedRoofId(next[0].id);
    return next;
  });

  const addGroup = () => {
    if (!selectedRoof) return;
    const nextIndex = (selectedRoof.panelGroups || []).length + 1;
    setRoof(selectedRoof.id, { panelGroups: [...(selectedRoof.panelGroups || []), { id: genId(), name: `Panelgrupp ${nextIndex}`, rows: 3, cols: 4, xM: 0.7, yM: 0.7, orientation: 'Stående', clampMm: 391, threeRails: false, panelOverrides: {} }] });
  };

  const deleteGroup = (roofId, groupId) => setRoof(roofId, { panelGroups: (roofs.find(roof => String(roof.id) === String(roofId))?.panelGroups || []).filter(group => String(group.id) !== String(groupId)) });

  const save = async () => {
    setSaving(true);
    const payload = { version: 8, scaleType: 'meter', railMode: 'per-panel', roofs };
    try {
      if (typeof window !== 'undefined' && project?.id) window.localStorage.setItem(`solarplan:project:${project.id}:solar_roof_planner_data`, JSON.stringify(payload));
      await onUpdate?.({
        solar_roof_planner_data: JSON.stringify(payload),
        roof_width_m: roofs[0]?.widthM || '',
        roof_height_m: roofs[0]?.roofFallM || '',
        panel_layout_data: JSON.stringify({ version: 8, source: 'solar_roof_planner_data', roofs }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5 text-primary" />Paneler och takmått</CardTitle>
            <p className="text-sm text-muted-foreground">Sparade tak och panelgrupper kan ändras när som helst. Ändra mått, antal rader/kolumner och tryck Spara.</p>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara'}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{total.panels} paneler</Badge>
            <Badge variant="outline">{round(total.kwp, 2)} kWp</Badge>
            <Button variant="outline" size="sm" onClick={addRoof} className="gap-2"><Plus className="h-4 w-4" />Lägg till tak</Button>
          </div>

          {warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{warnings.length} panelgrupp ligger helt eller delvis utanför takytan efter ändringen.</div>}

          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="space-y-3">
              <Select label="Aktivt tak" value={selectedRoof?.id || ''} onChange={setSelectedRoofId}>
                {roofs.map(roof => <option key={roof.id} value={roof.id}>{roof.name}</option>)}
              </Select>

              {selectedRoof && (
                <div className="rounded-2xl border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">Redigera tak</div>
                    {roofs.length > 1 && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteRoof(selectedRoof.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <Input label="Namn" value={selectedRoof.name} onChange={value => setRoof(selectedRoof.id, { name: value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Bredd A (m)" type="number" step="0.1" min="0" value={selectedRoof.widthM} onChange={value => setRoof(selectedRoof.id, { widthM: value })} />
                    <Input label="Takfall B (m)" type="number" step="0.1" min="0" value={selectedRoof.roofFallM} onChange={value => setRoof(selectedRoof.id, { roofFallM: value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Taklutning (°)" type="number" value={selectedRoof.angleDeg} onChange={value => setRoof(selectedRoof.id, { angleDeg: value })} />
                    <Select label="Takform" value={selectedRoof.shape} onChange={value => setRoof(selectedRoof.id, { shape: value })}>{SHAPES.map(shape => <option key={shape}>{shape}</option>)}</Select>
                  </div>
                  <Input label="Material" value={selectedRoof.material || ''} onChange={value => setRoof(selectedRoof.id, { material: value })} />
                  <ProductSearchSelect label="Solpanel för detta tak" products={panelProducts} value={selectedRoof.panelProductId || ''} onChange={value => {
                    const product = panelProducts.find(item => item.id === value) || null;
                    setRoof(selectedRoof.id, { panelProductId: value, panelProductSnapshot: panelSnapshot(product) });
                  }} placeholder="Välj solpanel" />
                </div>
              )}

              <Button variant="outline" onClick={addGroup} className="w-full gap-2"><PanelTop className="h-4 w-4" />Lägg till panelgrupp</Button>

              {(selectedRoof?.panelGroups || []).map(group => (
                <div key={group.id} className="rounded-2xl border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{group.name}</div>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteGroup(selectedRoof.id, group.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Input label="Namn" value={group.name} onChange={value => setGroup(selectedRoof.id, group.id, { name: value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Rader" type="number" min="0" value={group.rows} onChange={value => setGroup(selectedRoof.id, group.id, { rows: value })} />
                    <Input label="Kolumner" type="number" min="0" value={group.cols} onChange={value => setGroup(selectedRoof.id, group.id, { cols: value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="X från vänster (m)" type="number" step="0.1" min="0" value={group.xM} onChange={value => setGroup(selectedRoof.id, group.id, { xM: value })} />
                    <Input label="Y från överkant (m)" type="number" step="0.1" min="0" value={group.yM} onChange={value => setGroup(selectedRoof.id, group.id, { yM: value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Montering" value={group.orientation} onChange={value => setGroup(selectedRoof.id, group.id, { orientation: value })}><option>Stående</option><option>Liggande</option></Select>
                    <Input label="Klämzon (mm)" type="number" value={group.clampMm} onChange={value => setGroup(selectedRoof.id, group.id, { clampMm: value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(group.threeRails)} onChange={event => setGroup(selectedRoof.id, group.id, { threeRails: event.target.checked })} />Tre skenor</label>
                </div>
              ))}
            </div>

            <RoofPreview roofs={roofs} products={panelProducts} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
