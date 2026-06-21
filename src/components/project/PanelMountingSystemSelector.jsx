import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProductSearchSelect from '@/components/products/ProductSearchSelect';
import { createProductSnapshot, resolveProductClampZone } from '@/lib/productDocuments';

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

function mountingSelectionForRoof(roof = {}, mountingData = {}) {
  const perRoof = (mountingData.perRoofSystems || []).find(item => String(item.roofId) === String(roof.id));
  return roof.mountingSystemProductId
    || roof.mountingSystemProductSnapshot?.product_id
    || roof.mountingSystemProductSnapshot?.id
    || perRoof?.mountingSystemProductId
    || mountingData.selectedMountingProductId
    || '';
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
  const [selections, setSelections] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelections(Object.fromEntries(roofs.map(roof => [String(roof.id), mountingSelectionForRoof(roof, mountingData)])));
    setMessage('');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.mounting_data]);

  const requirements = roofs.map(roof => {
    const panelProduct = panelProducts.find(product => String(product.id) === String(roof.panelProductId)) || roof.panelProductSnapshot || null;
    const clamp = resolveProductClampZone(panelProduct || {});
    const mountingProductId = selections[String(roof.id)] || '';
    const mountingProduct = mountingProducts.find(product => String(product.id) === String(mountingProductId)) || roof.mountingSystemProductSnapshot || null;
    const count = panelCount(roof);
    return {
      roof,
      count,
      panelProduct,
      clamp,
      mountingProductId,
      mountingProduct,
      panelSelected: Boolean(panelProduct && roof.panelProductId),
      mountingSelected: Boolean(mountingProductId && mountingProduct),
      clampValid: Boolean(clamp.hasProductZone),
    };
  });

  const activeRequirements = requirements.filter(item => item.count > 0);
  const mountingComplete = activeRequirements.length > 0 && activeRequirements.every(item => item.mountingSelected);
  const clampComplete = activeRequirements.length > 0 && activeRequirements.every(item => item.panelSelected && item.clampValid);
  const setupComplete = mountingComplete && clampComplete;

  const save = async () => {
    if (!mountingComplete) return;
    setSaving(true);
    setMessage('');
    try {
      const updatedRoofs = roofs.map(roof => {
        const productId = selections[String(roof.id)] || '';
        const product = mountingProducts.find(item => String(item.id) === String(productId)) || null;
        return {
          ...roof,
          mountingSystemProductId: productId,
          mountingSystemProductSnapshot: product ? createProductSnapshot(product) : null,
        };
      });
      const primaryRoof = updatedRoofs.find(roof => panelCount(roof) > 0 && roof.mountingSystemProductId) || updatedRoofs[0];
      const primaryMountingProduct = mountingProducts.find(product => String(product.id) === String(primaryRoof?.mountingSystemProductId)) || primaryRoof?.mountingSystemProductSnapshot || null;
      const primaryPanelProduct = panelProducts.find(product => String(product.id) === String(primaryRoof?.panelProductId)) || primaryRoof?.panelProductSnapshot || null;
      const primaryClamp = resolveProductClampZone(primaryPanelProduct || {});
      const totalPanels = updatedRoofs.reduce((sum, roof) => sum + panelCount(roof), 0);
      const perRoofSystems = updatedRoofs.map(roof => {
        const mountingProduct = mountingProducts.find(product => String(product.id) === String(roof.mountingSystemProductId)) || roof.mountingSystemProductSnapshot || null;
        const panelProduct = panelProducts.find(product => String(product.id) === String(roof.panelProductId)) || roof.panelProductSnapshot || null;
        const clamp = resolveProductClampZone(panelProduct || {});
        return {
          roofId: roof.id,
          roofName: roof.name,
          roofMaterial: roof.material || '',
          panelCount: panelCount(roof),
          panelProductId: roof.panelProductId || '',
          panelProductName: productLabel(panelProduct || {}),
          mountingSystemProductId: roof.mountingSystemProductId || '',
          mountingSystemProductName: productLabel(mountingProduct || {}),
          clampZone: {
            minMm: clamp.minMm,
            maxMm: clamp.maxMm,
            railOffsetTopMm: clamp.railOffsetTopMm,
            railOffsetBottomMm: clamp.railOffsetBottomMm,
            source: clamp.source,
            fromProductDocument: clamp.hasProductZone,
          },
        };
      });
      const nextPlanner = {
        ...planner,
        roofs: updatedRoofs,
        mountingSource: 'product-catalog',
        clampSource: 'panel-product-documents',
        savedAt: new Date().toISOString(),
      };
      const nextMounting = {
        ...mountingData,
        source: 'panel-planner-product-catalog',
        selectedMountingProductId: primaryMountingProduct?.id || primaryMountingProduct?.product_id || '',
        selectedMountingProductName: productLabel(primaryMountingProduct || {}),
        selectedMountingProductSnapshot: primaryMountingProduct?.id ? createProductSnapshot(primaryMountingProduct) : primaryMountingProduct || null,
        brandLabel: primaryMountingProduct?.brand || mountingData.brandLabel || '',
        modelName: primaryMountingProduct?.model || primaryMountingProduct?.name || mountingData.modelName || '',
        selectedPanelId: primaryPanelProduct?.id || primaryPanelProduct?.product_id || '',
        selectedPanelName: productLabel(primaryPanelProduct || {}),
        selectedPanelSnapshot: primaryPanelProduct?.id ? createProductSnapshot(primaryPanelProduct) : primaryPanelProduct || null,
        roofMaterial: primaryRoof?.material || '',
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
        ? 'Montagesystem, klämzoner och montagematerial har sparats i projektet.'
        : 'Montagesystemet är sparat. Paneler med saknad klämzon måste kompletteras i Produktsortimentet.');
    } finally {
      setSaving(false);
    }
  };

  if (!roofs.length) return null;

  return <Card className="border-0 shadow-sm">
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Montagesystem för panelerna</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Välj montagesystem per tak. Projektet kontrollerar samtidigt panelens sparade klämzon och skapar montagematerial i produktlistan.</p>
      </div>
      <Button onClick={save} disabled={saving || !mountingComplete} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara montageval'}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {mountingProducts.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Det finns inga aktiva produkter i kategorin Montagesystem. Lägg först in montagesystemet i Produktsortimentet.</div>}

      <div className={`rounded-xl border p-3 text-sm ${setupComplete ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {setupComplete ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <AlertTriangle className="mr-2 inline h-4 w-4" />}
        {setupComplete
          ? 'Panelernas klämzoner är dokumenterade och montagesystem är valt för alla tak med paneler.'
          : 'Komplettera markerade tak. Ett färdigt projekt ska ha dokumenterad klämzon och valt montagesystem för varje tak med paneler.'}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {requirements.map(item => <div key={item.roof.id} className="rounded-2xl border border-border p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div><h3 className="font-semibold">{item.roof.name || 'Tak'}</h3><p className="text-xs text-muted-foreground">{item.count} paneler · {item.roof.material || 'Takmaterial saknas'}</p></div>
            <Badge variant="outline">{item.panelProduct ? productLabel(item.panelProduct) : 'Panel saknas'}</Badge>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge className={item.clampValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>Klämzon: {item.clamp.label}</Badge>
            <Badge className={item.mountingSelected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}>{item.mountingSelected ? 'Montagesystem valt' : 'Montagesystem saknas'}</Badge>
          </div>
          <ProductSearchSelect
            label="Montagesystem för detta tak"
            products={mountingProducts}
            value={item.mountingProductId}
            onChange={value => setSelections(current => ({ ...current, [String(item.roof.id)]: value }))}
            placeholder="Välj montagesystem"
          />
          {!item.clampValid && <p className="mt-2 text-xs text-red-700">Klämzon saknas för vald panel. Lägg in värdet från panelens manual eller datablad i Produktsortimentet.</p>}
        </div>)}
      </div>

      {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</div>}
    </CardContent>
  </Card>;
}
