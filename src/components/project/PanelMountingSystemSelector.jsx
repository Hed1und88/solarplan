import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Calculator, CheckCircle2, PackageCheck, Save, Snowflake, Wind, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { createProductSnapshot, resolveProductClampZone } from '@/lib/productDocuments';
import { calculateMountingRoof, resolveMountingEngine } from '@/lib/mountingEngines';

const INPUT = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground';

function safeJson(raw, fallback = {}) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}') || fallback; } catch { return fallback; }
}

function panelCount(roof = {}) {
  return (roof.panelGroups || []).reduce((sum, group) => {
    const rows = Math.max(0, Math.round(Number(group.rows) || 0));
    const cols = Math.max(0, Math.round(Number(group.cols) || 0));
    return sum + rows * cols;
  }, 0);
}

function productLabel(product = {}) {
  return [product.brand, product.model].filter(Boolean).join(' ') || product.name || 'Produkt';
}

function savedRoofSystem(roof = {}, mountingData = {}) {
  return (mountingData.perRoofSystems || []).find(item => String(item.roofId) === String(roof.id)) || {};
}

function initialConfig(roof = {}, mountingData = {}) {
  const saved = savedRoofSystem(roof, mountingData);
  return {
    mountingProductId: roof.mountingSystemProductId
      || roof.mountingSystemProductSnapshot?.product_id
      || roof.mountingSystemProductSnapshot?.id
      || saved.mountingSystemProductId
      || mountingData.selectedMountingProductId
      || '',
    systemVariant: saved.systemVariant || roof.mountingSystemVariant || 'parallel',
    terrainCategory: saved.terrainCategory || roof.terrainCategory || 'II',
    ridgeHeightM: saved.ridgeHeightM ?? roof.ridgeHeightM ?? '',
    attachmentMethod: saved.attachmentMethod || roof.roofType || roof.material || 'Takpannor, Bärläkt/Råspont 2',
    panelGapMm: saved.panelGapMm ?? roof.panelGapMm ?? 20,
    clampedFrameSide: saved.clampedFrameSide || 'long',
    railDirectionRelativeToLongFrame: saved.railDirectionRelativeToLongFrame || 'cross',
  };
}

function CalculationSummary({ calculation }) {
  if (!calculation) return null;
  if (calculation.status === 'blocked') {
    return <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
      <div className="font-semibold">Beräkningen kan inte köras</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">{(calculation.errors || []).map(error => <li key={error}>{error}</li>)}</ul>
    </div>;
  }

  const materials = calculation.materials || {};
  return <div className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-950"><Calculator className="h-4 w-4" />Nordmount-dimensionering</div>
      <Badge className={calculation.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
        {calculation.status === 'approved' ? 'Godkänd kombination' : 'Kontroll krävs'}
      </Badge>
    </div>

    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl bg-white p-2.5"><div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Snowflake className="h-3.5 w-3.5" />Snölast</div><div className="mt-1 font-semibold">{calculation.loads?.snow?.designPa ?? '—'} Pa</div></div>
      <div className="rounded-xl bg-white p-2.5"><div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Wind className="h-3.5 w-3.5" />Vind randzon</div><div className="mt-1 font-semibold">{calculation.loads?.wind?.edgePa ?? '—'} Pa</div></div>
      <div className="rounded-xl bg-white p-2.5"><div className="text-[11px] text-muted-foreground">Infästningar</div><div className="mt-1 font-semibold">{materials.fastenerCount ?? 0} st</div></div>
      <div className="rounded-xl bg-white p-2.5"><div className="text-[11px] text-muted-foreground">Max utnyttjande</div><div className="mt-1 font-semibold">{calculation.utilizationPercent ?? 0} %</div></div>
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-blue-100 bg-white p-3 text-xs">
        <div className="font-semibold text-blue-950">Randzoner</div>
        <div className="mt-1 text-muted-foreground">Gavel: {calculation.zones?.gableM ?? '—'} m · Takfot/nock: {calculation.zones?.eaveRidgeM ?? '—'} m</div>
      </div>
      <div className="rounded-xl border border-blue-100 bg-white p-3 text-xs">
        <div className="font-semibold text-blue-950">Fästavstånd</div>
        <div className="mt-1 text-muted-foreground">{calculation.railLines?.length
          ? `${Math.min(...calculation.railLines.map(line => line.actualCcM))}–${Math.max(...calculation.railLines.map(line => line.actualCcM))} m c/c`
          : 'Saknas'}</div>
      </div>
    </div>

    <div className="rounded-xl border border-blue-100 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-950"><PackageCheck className="h-4 w-4" />Beräknad Nordmount-materiallista</div>
      <div className="grid gap-1 text-xs sm:grid-cols-2">
        {(materials.materials || []).map(item => <div key={item.productId} className="flex justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5"><span className="truncate">{item.name}</span><b>{item.quantity} {item.unit}</b></div>)}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Skenlängd {materials.railLengthM ?? 0} m · Systemvikt {materials.systemWeightKg ?? 0} kg</div>
    </div>

    {(calculation.warnings || []).length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{calculation.warnings.join(' • ')}</div>}
    {!calculation.panelProfilesApproved && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">Panelens lastklassade klämprofil är inte verifierad som godkänd mot hela projektlasten. Se klämprofilen för respektive panelgrupp.</div>}
  </div>;
}

export default function PanelMountingSystemSelector({ project, onUpdate }) {
  const { data: products = [] } = useQuery({
    queryKey: ['products-panel-mounting-selector'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });
  const planner = useMemo(() => safeJson(project?.solar_roof_planner_data || project?.panel_layout_data, { roofs: [] }), [project?.solar_roof_planner_data, project?.panel_layout_data]);
  const mountingData = useMemo(() => safeJson(project?.mounting_data, {}), [project?.mounting_data]);
  const roofs = Array.isArray(planner?.roofs) ? planner.roofs : [];
  const panelProducts = products.filter(product => product.category === 'solpanel' && product.is_active !== false);
  const mountingProducts = products.filter(product => product.category === 'montagesystem' && product.is_active !== false);
  const [configs, setConfigs] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setConfigs(Object.fromEntries(roofs.map(roof => [String(roof.id), initialConfig(roof, mountingData)])));
    setMessage('');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.mounting_data]);

  const setConfig = (roofId, patch) => setConfigs(current => ({
    ...current,
    [String(roofId)]: { ...initialConfig(roofs.find(roof => String(roof.id) === String(roofId)) || {}, mountingData), ...(current[String(roofId)] || {}), ...patch },
  }));

  const requirements = roofs.map(roof => {
    const config = { ...initialConfig(roof, mountingData), ...(configs[String(roof.id)] || {}) };
    const panelProduct = panelProducts.find(product => String(product.id) === String(roof.panelProductId)) || roof.panelProductSnapshot || null;
    const clamp = resolveProductClampZone(panelProduct || {});
    const mountingProduct = mountingProducts.find(product => String(product.id) === String(config.mountingProductId)) || roof.mountingSystemProductSnapshot || null;
    const engine = resolveMountingEngine(mountingProduct || {});
    const count = panelCount(roof);
    const calculation = count > 0 && mountingProduct
      ? calculateMountingRoof({ project, roof, panelProduct: panelProduct || {}, mountingProduct, config })
      : null;
    return {
      roof,
      count,
      config,
      panelProduct,
      clamp,
      mountingProduct,
      engine,
      calculation,
      panelSelected: Boolean(panelProduct && roof.panelProductId),
      mountingSelected: Boolean(config.mountingProductId && mountingProduct),
      clampValid: Boolean(clamp.hasProductZone),
    };
  });

  const activeRequirements = requirements.filter(item => item.count > 0);
  const mountingComplete = activeRequirements.length > 0 && activeRequirements.every(item => item.mountingSelected);
  const calculationsComplete = activeRequirements.length > 0 && activeRequirements.every(item => item.calculation && item.calculation.status !== 'blocked');
  const clampComplete = activeRequirements.length > 0 && activeRequirements.every(item => item.panelSelected && item.clampValid);
  const setupComplete = mountingComplete && calculationsComplete && clampComplete;

  const save = async () => {
    if (!mountingComplete) return;
    setSaving(true);
    setMessage('');
    try {
      const updatedRoofs = roofs.map(roof => {
        const requirement = requirements.find(item => String(item.roof.id) === String(roof.id));
        const config = requirement?.config || initialConfig(roof, mountingData);
        const product = requirement?.mountingProduct || null;
        return {
          ...roof,
          mountingSystemProductId: config.mountingProductId,
          mountingSystemProductSnapshot: product ? createProductSnapshot(product) : null,
          mountingSystemVariant: config.systemVariant,
          terrainCategory: config.terrainCategory,
          ridgeHeightM: config.ridgeHeightM,
          roofType: config.attachmentMethod,
          panelGapMm: config.panelGapMm,
        };
      });
      const primaryRequirement = requirements.find(item => item.count > 0 && item.mountingSelected) || requirements[0];
      const primaryMountingProduct = primaryRequirement?.mountingProduct || null;
      const primaryPanelProduct = primaryRequirement?.panelProduct || null;
      const primaryClamp = resolveProductClampZone(primaryPanelProduct || {});
      const totalPanels = updatedRoofs.reduce((sum, roof) => sum + panelCount(roof), 0);
      const perRoofSystems = requirements.map(item => ({
        roofId: item.roof.id,
        roofName: item.roof.name,
        roofMaterial: item.roof.material || '',
        panelCount: item.count,
        panelProductId: item.roof.panelProductId || '',
        panelProductName: productLabel(item.panelProduct || {}),
        mountingSystemProductId: item.config.mountingProductId || '',
        mountingSystemProductName: productLabel(item.mountingProduct || {}),
        engineId: item.engine?.id || null,
        systemVariant: item.config.systemVariant,
        terrainCategory: item.config.terrainCategory,
        ridgeHeightM: Number(item.config.ridgeHeightM) || null,
        attachmentMethod: item.config.attachmentMethod,
        panelGapMm: Number(item.config.panelGapMm) || 20,
        clampedFrameSide: item.config.clampedFrameSide,
        railDirectionRelativeToLongFrame: item.config.railDirectionRelativeToLongFrame,
        clampZone: {
          minMm: item.clamp.minMm,
          maxMm: item.clamp.maxMm,
          railOffsetTopMm: item.clamp.railOffsetTopMm,
          railOffsetBottomMm: item.clamp.railOffsetBottomMm,
          source: item.clamp.source,
          fromProductDocument: item.clamp.hasProductZone,
        },
        calculation: item.calculation,
      }));
      const nextPlanner = {
        ...planner,
        roofs: updatedRoofs,
        mountingSource: 'system-specific-engine',
        clampSource: 'panel-product-documents',
        savedAt: new Date().toISOString(),
      };
      const nextMounting = {
        ...mountingData,
        source: 'system-specific-engine',
        engineId: primaryRequirement?.engine?.id || null,
        selectedMountingProductId: primaryMountingProduct?.id || primaryMountingProduct?.product_id || '',
        selectedMountingProductName: productLabel(primaryMountingProduct || {}),
        selectedMountingProductSnapshot: primaryMountingProduct?.id ? createProductSnapshot(primaryMountingProduct) : primaryMountingProduct || null,
        brandLabel: primaryMountingProduct?.brand || mountingData.brandLabel || '',
        modelName: primaryMountingProduct?.model || primaryMountingProduct?.name || mountingData.modelName || '',
        selectedPanelId: primaryPanelProduct?.id || primaryPanelProduct?.product_id || '',
        selectedPanelName: productLabel(primaryPanelProduct || {}),
        selectedPanelSnapshot: primaryPanelProduct?.id ? createProductSnapshot(primaryPanelProduct) : primaryPanelProduct || null,
        panelCount: totalPanels,
        clampZone: {
          minMm: primaryClamp.minMm,
          maxMm: primaryClamp.maxMm,
          railOffsetTopMm: primaryClamp.railOffsetTopMm,
          railOffsetBottomMm: primaryClamp.railOffsetBottomMm,
          source: primaryClamp.source,
          fromProductDocument: primaryClamp.hasProductZone,
        },
        perRoofSystems,
        savedAt: new Date().toISOString(),
      };
      const serializedPlanner = JSON.stringify(nextPlanner);
      await onUpdate?.({
        solar_roof_planner_data: serializedPlanner,
        panel_layout_data: serializedPlanner,
        mounting_data: JSON.stringify(nextMounting),
      });
      setMessage(setupComplete
        ? 'Nordmount-dimensioneringen, fästplanen, klämprofilerna och materiallistan har sparats.'
        : 'Montagevalet har sparats, men markerade varningar måste kontrolleras innan projekteringen är färdig.');
    } finally {
      setSaving(false);
    }
  };

  if (!roofs.length) return null;

  return <Card className="border-0 shadow-sm">
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Montagesystem och automatisk dimensionering</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">När Nordmount väljs körs Nordmounts egen systemmotor direkt mot projektets snölast, referensvind, tak, panelplacering och panelens klämprofiler.</p>
      </div>
      <Button onClick={save} disabled={saving || !mountingComplete} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara dimensionering'}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {mountingProducts.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Det finns inga aktiva produkter i kategorin Montagesystem.</div>}

      <div className={`rounded-xl border p-3 text-sm ${setupComplete ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {setupComplete ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <AlertTriangle className="mr-2 inline h-4 w-4" />}
        {setupComplete
          ? 'Alla tak med paneler har en körd systemberäkning, dokumenterad klämzon och beräknad materiallista.'
          : 'Välj montagesystem och fyll i nockhöjd. Beräkningen körs omedelbart och visar vad som saknas.'}
      </div>

      <div className="space-y-4">
        {requirements.map(item => <div key={item.roof.id} className="rounded-2xl border border-border p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-semibold">{item.roof.name || 'Tak'}</h3><p className="text-xs text-muted-foreground">{item.count} paneler · {item.roof.material || 'Takmaterial saknas'}</p></div>
            <Badge variant="outline">{item.panelProduct ? productLabel(item.panelProduct) : 'Panel saknas'}</Badge>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge className={item.clampValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>Klämzon: {item.clamp.label}</Badge>
            <Badge className={item.mountingSelected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}>{item.mountingSelected ? 'Montagesystem valt' : 'Montagesystem saknas'}</Badge>
            {item.engine && <Badge className="bg-blue-100 text-blue-800">Motor: {item.engine.label}</Badge>}
          </div>

          <ProductSearchSelect
            label="Montagesystem för detta tak"
            products={mountingProducts}
            value={item.config.mountingProductId}
            onChange={value => setConfig(item.roof.id, { mountingProductId: value })}
            placeholder="Välj montagesystem"
          />

          {item.mountingSelected && !item.engine && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Det valda systemet har ännu ingen färdig systemmotor. Nordmount-motorn används endast när en Nordmount-produkt är vald.</div>}

          {item.engine?.id === 'nordmount' && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-medium text-muted-foreground">System<select className={`mt-1 ${INPUT}`} value={item.config.systemVariant} onChange={event => setConfig(item.roof.id, { systemVariant: event.target.value })}><option value="parallel">Parallel</option><option value="cross">Cross – väntar på koefficientdata</option></select></label>
            <label className="text-xs font-medium text-muted-foreground">Nockhöjd (m)<input type="number" min="1" step="0.1" className={`mt-1 ${INPUT}`} value={item.config.ridgeHeightM} onChange={event => setConfig(item.roof.id, { ridgeHeightM: event.target.value })} /></label>
            <label className="text-xs font-medium text-muted-foreground">Terrängtyp<select className={`mt-1 ${INPUT}`} value={item.config.terrainCategory} onChange={event => setConfig(item.roof.id, { terrainCategory: event.target.value })}><option value="0">0 – Hav/kust</option><option value="I">I – Öppet</option><option value="II">II – Landsbygd</option><option value="III">III – Förort</option><option value="IV">IV – Stad</option></select></label>
            <label className="text-xs font-medium text-muted-foreground">Tak/infästning<select className={`mt-1 ${INPUT}`} value={item.config.attachmentMethod} onChange={event => setConfig(item.roof.id, { attachmentMethod: event.target.value })}><option>Takpannor, Bärläkt/Råspont 2</option><option>Takpannor, Råspont 1</option><option>Papptak</option></select></label>
            <label className="text-xs font-medium text-muted-foreground">Panelmellanrum (mm)<input type="number" min="10" step="1" className={`mt-1 ${INPUT}`} value={item.config.panelGapMm} onChange={event => setConfig(item.roof.id, { panelGapMm: event.target.value })} /></label>
          </div>}

          {!item.clampValid && <p className="mt-2 text-xs text-red-700">Klämzon saknas för vald panel. Panelens manualdata måste finnas i Produktkatalogen.</p>}
          <CalculationSummary calculation={item.calculation} />
        </div>)}
      </div>

      {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</div>}
    </CardContent>
  </Card>;
}
