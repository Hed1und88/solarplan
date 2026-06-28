import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { AlertTriangle, Calculator, CheckCircle2, PackageCheck, Save, Snowflake, Wind, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { createProductSnapshot, resolveProductClampZone } from '@/lib/productDocuments';
import { calculateMountingRoof, resolveMountingEngine } from '@/lib/mountingEngines';

const INPUT = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';

const SYSTEM_VARIANTS = [
  { value: 'parallel', label: 'Parallel krok', status: 'verified', badge: 'verifierad' },
  { value: 'flow_parallel_ballasted', label: 'Flow parallel ballasted', status: 'verified', badge: 'verifierad' },
  { value: 'flow_east_west_ballasted', label: 'Flow east/west ballasted', status: 'derived', badge: 'harledd' },
  { value: 'flow_south_ballasted', label: 'Flow south ballasted', status: 'needs_data', badge: 'behover data' },
  { value: 'flow_welded_hybrid', label: 'Flow welded hybrid', status: 'blocked', badge: 'blockerad' },
];

const STATUS_CLASS = {
  verified: 'bg-green-100 text-green-700',
  derived: 'bg-blue-100 text-blue-800',
  needs_data: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-700',
};

const parse = (raw, fallback = {}) => {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}') || fallback; } catch { return fallback; }
};
const countPanels = roof => (roof.panelGroups || []).reduce((sum, group) => sum + Math.max(0, Math.round(Number(group.rows) || 0)) * Math.max(0, Math.round(Number(group.cols) || 0)), 0);
const label = product => [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Produkt';
const variantMeta = value => SYSTEM_VARIANTS.find(item => item.value === value) || SYSTEM_VARIANTS[0];

function savedConfig(roof, mounting) {
  const saved = (mounting.perRoofSystems || []).find(item => String(item.roofId) === String(roof.id)) || {};
  return {
    mountingProductId: roof.mountingSystemProductId || saved.mountingSystemProductId || mounting.selectedMountingProductId || '',
    systemVariant: saved.systemVariant || roof.mountingSystemVariant || 'parallel',
    terrainCategory: saved.terrainCategory || roof.terrainCategory || 'II',
    ridgeHeightM: saved.ridgeHeightM ?? roof.ridgeHeightM ?? '',
    attachmentMethod: saved.attachmentMethod || roof.roofType || roof.material || 'Takpannor, Barlakt/Raspont 2',
    panelGapMm: saved.panelGapMm ?? roof.panelGapMm ?? 20,
    clampedFrameSide: saved.clampedFrameSide || 'long',
    railDirectionRelativeToLongFrame: saved.railDirectionRelativeToLongFrame || 'cross',
  };
}

function Result({ value, selectedVariant }) {
  if (!value) return null;
  const meta = variantMeta(selectedVariant || value.systemVariant);
  if (value.state === 'blocked') {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <b>Berakningen ar blockerad</b>
          <Badge className={STATUS_CLASS[meta.status]}>{meta.badge}</Badge>
        </div>
        <ul className="list-disc pl-4">{(value.errors || []).map(error => <li key={error}>{error}</li>)}</ul>
      </div>
    );
  }

  const materials = value.materials || {};
  const ballast = value.ballast || null;
  const cc = (value.railLines || []).map(line => Number(line.actualCcM)).filter(Number.isFinite);
  const windEdge = value.loads?.wind?.edgePa ?? value.loads?.wind?.perZonePa?.roofEdge_panelEdge;
  const windMid = value.loads?.wind?.middlePa ?? value.loads?.wind?.perZonePa?.roofMid_panelMid;

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="flex items-center gap-2 text-sm text-blue-950"><Calculator className="h-4 w-4" />Nordmount {meta.label}</b>
        <div className="flex flex-wrap gap-1.5">
          <Badge className={STATUS_CLASS[meta.status]}>{meta.badge}</Badge>
          <Badge className={value.status?.loadsValidated ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>
            {value.status?.loadsValidated ? 'Laster beraknade' : 'Preliminar last'}
          </Badge>
          {value.status?.preliminaryBallast && <Badge className="bg-amber-100 text-amber-800">preliminar ballast</Badge>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white p-2.5"><small className="flex items-center gap-1 text-muted-foreground"><Snowflake className="h-3.5 w-3.5" />Snolast</small><b>{value.loads?.snow?.designPa ?? value.loads?.snow?.snowPa ?? '-'} Pa</b></div>
        <div className="rounded-xl bg-white p-2.5"><small className="flex items-center gap-1 text-muted-foreground"><Wind className="h-3.5 w-3.5" />Vind randzon</small><b>{windEdge ?? '-'} Pa</b></div>
        {ballast ? (
          <>
            <div className="rounded-xl bg-white p-2.5"><small className="text-muted-foreground">Ballast</small><div><b>{ballast.totalBallastKg ?? 0} kg</b></div></div>
            <div className="rounded-xl bg-white p-2.5"><small className="text-muted-foreground">Stenavrundat</small><div><b>{ballast.ballastActualKg ?? ballast.totalBallastKg ?? 0} kg</b></div></div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-white p-2.5"><small className="text-muted-foreground">Infastningar preliminart</small><div><b>{materials.fastenerCount ?? 0} st</b></div></div>
            <div className="rounded-xl bg-white p-2.5"><small className="text-muted-foreground">Utnyttjande preliminart</small><div><b>{value.utilizationPercent ?? 0} %</b></div></div>
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-2.5 text-xs">
          <b>Vindzoner</b>
          <div>Mitt {windMid ?? '-'} Pa · kant {windEdge ?? '-'} Pa</div>
        </div>
        <div className="rounded-xl bg-white p-2.5 text-xs">
          <b>{ballast ? 'Ballastprioritet' : 'Fastavstand preliminart'}</b>
          <div>{ballast ? (ballast.priorityOrder || []).join(' -> ') : (cc.length ? `${Math.min(...cc)}-${Math.max(...cc)} m c/c` : 'Saknas')}</div>
        </div>
      </div>

      {value.geometry && (
        <div className="rounded-xl bg-white p-2.5 text-xs">
          <b>Flow-geometri</b>
          {value.geometry.dock && <div>Dock: {value.geometry.dock.ok ? `${value.geometry.dock.dockPositionMm} mm` : value.geometry.dock.reason}</div>}
          {value.geometry.fieldHeightMm != null && <div>Falthojd: {Math.round(value.geometry.fieldHeightMm)} mm</div>}
          {value.geometry.gaps && <div>Gap: sida {value.geometry.gaps.sideGapMm} mm · valley {value.geometry.gaps.valleyGapMm} mm · nock {value.geometry.gaps.nockGapMm} mm</div>}
        </div>
      )}

      {materials.materials?.length > 0 && (
        <div className="rounded-xl bg-white p-3">
          <b className="mb-2 flex items-center gap-2 text-xs"><PackageCheck className="h-4 w-4" />Materiallista</b>
          <div className="grid gap-1 text-xs sm:grid-cols-2">{materials.materials.map(item => <div key={item.productId || item.articleNumber || item.type} className="flex justify-between rounded-lg bg-muted/40 px-2 py-1.5"><span>{item.name}</span><b>{item.quantity} {item.unit}</b></div>)}</div>
        </div>
      )}

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><b>Kapacitet, automatiskt c/c-val och ballast ar preliminara dar statusen anger det.</b></div>
      {(value.warnings || []).length > 0 && <div className="text-xs text-amber-900">{value.warnings.join(' · ')}</div>}
    </div>
  );
}

export default function PanelMountingSystemSelector({ project, onUpdate }) {
  const { data: products = [] } = useQuery({ queryKey: ['products-panel-mounting-selector'], queryFn: () => listVisibleProducts('-created_date') });
  const planner = useMemo(() => parse(project?.solar_roof_planner_data || project?.panel_layout_data, { roofs: [] }), [project?.solar_roof_planner_data, project?.panel_layout_data]);
  const mounting = useMemo(() => parse(project?.mounting_data, {}), [project?.mounting_data]);
  const roofs = planner.roofs || [];
  const panels = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
  const systems = products.filter(product => product.category === 'montagesystem' && product.is_active !== false);
  const [configs, setConfigs] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setConfigs(Object.fromEntries(roofs.map(roof => [String(roof.id), savedConfig(roof, mounting)])));
    setMessage('');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.mounting_data]);

  const patchConfig = (roof, patch) => setConfigs(current => ({ ...current, [String(roof.id)]: { ...savedConfig(roof, mounting), ...(current[String(roof.id)] || {}), ...patch } }));

  const rows = roofs.map(roof => {
    const config = { ...savedConfig(roof, mounting), ...(configs[String(roof.id)] || {}) };
    const panel = panels.find(item => String(item.id) === String(roof.panelProductId)) || roof.panelProductSnapshot || null;
    const system = systems.find(item => String(item.id) === String(config.mountingProductId)) || roof.mountingSystemProductSnapshot || null;
    const engine = resolveMountingEngine(system || {});
    const clamp = resolveProductClampZone(panel || {});
    const calculation = countPanels(roof) > 0 && system ? calculateMountingRoof({ project, roof, panelProduct: panel || {}, mountingProduct: system, config }) : null;
    return { roof, config, panel, system, engine, clamp, calculation, count: countPanels(roof) };
  });

  const active = rows.filter(item => item.count > 0);
  const ready = active.length > 0 && active.every(item => item.system && item.clamp.hasProductZone && item.calculation?.state !== 'blocked' && item.calculation?.status?.loadsValidated);

  const save = async () => {
    setSaving(true);
    try {
      const updatedRoofs = roofs.map(roof => {
        const item = rows.find(row => String(row.roof.id) === String(roof.id));
        return { ...roof, mountingSystemProductId: item.config.mountingProductId, mountingSystemProductSnapshot: item.system ? createProductSnapshot(item.system) : null, mountingSystemVariant: item.config.systemVariant, terrainCategory: item.config.terrainCategory, ridgeHeightM: item.config.ridgeHeightM, roofType: item.config.attachmentMethod, panelGapMm: item.config.panelGapMm };
      });
      const perRoofSystems = rows.map(item => ({
        roofId: item.roof.id, roofName: item.roof.name, panelCount: item.count,
        panelProductId: item.roof.panelProductId || '', panelProductName: label(item.panel),
        mountingSystemProductId: item.config.mountingProductId || '', mountingSystemProductName: label(item.system),
        engineId: item.engine?.id || null, ...item.config,
        clampZone: { minMm: item.clamp.minMm, maxMm: item.clamp.maxMm, source: item.clamp.source, fromProductDocument: item.clamp.hasProductZone },
        calculation: item.calculation,
      }));
      const primary = rows.find(item => item.count > 0 && item.system) || rows[0];
      const nextPlanner = { ...planner, roofs: updatedRoofs, mountingSource: 'system-specific-engine', savedAt: new Date().toISOString() };
      const nextMounting = {
        ...mounting, source: 'system-specific-engine', engineId: primary?.engine?.id || null,
        selectedMountingProductId: primary?.system?.id || '', selectedMountingProductName: label(primary?.system),
        selectedMountingProductSnapshot: primary?.system ? createProductSnapshot(primary.system) : null,
        selectedPanelId: primary?.panel?.id || '', selectedPanelName: label(primary?.panel),
        selectedPanelSnapshot: primary?.panel ? createProductSnapshot(primary.panel) : null,
        panelCount: updatedRoofs.reduce((sum, roof) => sum + countPanels(roof), 0), perRoofSystems, savedAt: new Date().toISOString(),
      };
      const serialized = JSON.stringify(nextPlanner);
      await onUpdate?.({ solar_roof_planner_data: serialized, panel_layout_data: serialized, mounting_data: JSON.stringify(nextMounting) });
      setMessage(ready ? 'Validerade Nordmount-laster sparade. Flow-status visas per gren.' : 'Sparat, men minst ett tak har blockerad eller preliminar last.');
    } finally { setSaving(false); }
  };

  if (!roofs.length) return null;
  return <Card className="border-0 shadow-sm">
    <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Montagesystem och automatisk dimensionering</CardTitle><p className="mt-1 text-sm text-muted-foreground">Nordmount parallel-krok och Flow-grenar halles separerade. Flow-ballast markeras preliminar tills fler Planner-rapporter validerar modellen.</p></div><Button onClick={save} disabled={saving || !active.every(item => item.system)} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara dimensionering'}</Button></CardHeader>
    <CardContent className="space-y-4">
      <div className={`rounded-xl border p-3 text-sm ${ready ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{ready ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <AlertTriangle className="mr-2 inline h-4 w-4" />}{ready ? 'Sno- och vindlaster beraknade for valda grenar.' : 'Valj Nordmount-system och kontrollera grenstatus. Syd och svetsad hybrid blockeras enligt spec.'}</div>
      {rows.map(item => {
        const meta = variantMeta(item.config.systemVariant);
        return <div key={item.roof.id} className="rounded-2xl border p-4">
          <div className="mb-3 flex justify-between gap-2"><div><b>{item.roof.name || 'Tak'}</b><p className="text-xs text-muted-foreground">{item.count} paneler</p></div><Badge variant="outline">{label(item.panel)}</Badge></div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs"><Badge className={item.clamp.hasProductZone ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>Klamzon: {item.clamp.label}</Badge>{item.engine && <Badge className="bg-blue-100 text-blue-800">Motor: {item.engine.label}</Badge>}<Badge className={STATUS_CLASS[meta.status]}>{meta.badge}</Badge></div>
          <ProductSearchSelect label="Montagesystem for detta tak" products={systems} value={item.config.mountingProductId} onChange={value => patchConfig(item.roof, { mountingProductId: value })} placeholder="Valj montagesystem" />
          {item.engine?.id === 'nordmount' && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs">System<select className={INPUT} value={item.config.systemVariant} onChange={event => patchConfig(item.roof, { systemVariant: event.target.value })}>{SYSTEM_VARIANTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[meta.status]}`}>{meta.badge}</span></label>
            <label className="text-xs">Nockhojd (m)<input className={INPUT} type="number" min="1" step="0.1" value={item.config.ridgeHeightM} onChange={event => patchConfig(item.roof, { ridgeHeightM: event.target.value })} /></label>
            <label className="text-xs">Terrang<select className={INPUT} value={item.config.terrainCategory} onChange={event => patchConfig(item.roof, { terrainCategory: event.target.value })}><option value="0">0</option><option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option></select></label>
            <label className="text-xs">Tak/infastning<select className={INPUT} value={item.config.attachmentMethod} onChange={event => patchConfig(item.roof, { attachmentMethod: event.target.value })}><option>Takpannor, Barlakt/Raspont 2</option><option>Takpannor, Raspont 1</option><option>Papptak</option></select></label>
            <label className="text-xs">Panelmellanrum (mm)<input className={INPUT} type="number" min="10" value={item.config.panelGapMm} onChange={event => patchConfig(item.roof, { panelGapMm: event.target.value })} /></label>
          </div>}
          <Result value={item.calculation} selectedVariant={item.config.systemVariant} />
        </div>;
      })}
      {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}
    </CardContent>
  </Card>;
}
