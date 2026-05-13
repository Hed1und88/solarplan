import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wind, Snowflake, AlertTriangle, CheckCircle2, Ruler, Save } from 'lucide-react';
import MountingDrawing from './MountingDrawing';

const SYSTEMS = {
  weland: {
    label: 'Weland',
    models: [
      { name: 'Weland TakFot', maxSnow: 3.5, maxWind: 1.2, hookSpacingMM: 900 },
      { name: 'Weland ByggelBalk', maxSnow: 4.0, maxWind: 1.3, hookSpacingMM: 1000 },
      { name: 'Weland Krok S', maxSnow: 3.0, maxWind: 1.1, hookSpacingMM: 800 },
      { name: 'Weland Krok L', maxSnow: 4.2, maxWind: 1.4, hookSpacingMM: 1100 },
    ],
    description: 'Svensk tillverkare, passar plåttak och tegelpannor',
  },
  nordmount: {
    label: 'Nordmount',
    models: [
      { name: 'NordMount Basic', maxSnow: 3.5, maxWind: 1.2, hookSpacingMM: 900 },
      { name: 'NordMount Pro', maxSnow: 4.5, maxWind: 1.5, hookSpacingMM: 1100 },
      { name: 'NordMount Flat', maxSnow: 3.0, maxWind: 1.1, hookSpacingMM: 800 },
    ],
    description: 'Nordisk standard, robust mot snö och kyla',
  },
  mafi: {
    label: 'Mafi',
    models: [
      { name: 'Mafi Classic', maxSnow: 3.0, maxWind: 1.1, hookSpacingMM: 800 },
      { name: 'Mafi Plus', maxSnow: 3.5, maxWind: 1.2, hookSpacingMM: 900 },
      { name: 'Mafi Universal', maxSnow: 3.8, maxWind: 1.3, hookSpacingMM: 1000 },
    ],
    description: 'Kostnadseffektivt, passar de flesta taktyper',
  },
  k2: {
    label: 'K2 Systems',
    models: [
      { name: 'K2 MountSystems MF2+', maxSnow: 4.5, maxWind: 1.6, hookSpacingMM: 1200 },
      { name: 'K2 CrossRail', maxSnow: 4.0, maxWind: 1.4, hookSpacingMM: 1100 },
      { name: 'K2 PitchedRoof', maxSnow: 5.0, maxWind: 1.8, hookSpacingMM: 1200 },
    ],
    description: 'Premiumsystem, certifierat för nordiska förhållanden',
  },
  schletter: {
    label: 'Schletter',
    models: [
      { name: 'Schletter FlatFix', maxSnow: 3.8, maxWind: 1.3, hookSpacingMM: 1000 },
      { name: 'Schletter PV-Eco', maxSnow: 3.5, maxWind: 1.2, hookSpacingMM: 900 },
      { name: 'Schletter FixZ', maxSnow: 4.2, maxWind: 1.5, hookSpacingMM: 1100 },
    ],
    description: 'Tyskt premium, lång livslängd',
  },
};

const SNOW_ZONES = [
  { label: 'Zon 1 – Sydkusten', value: 0.6 },
  { label: 'Zon 2 – Mellansverige', value: 1.5 },
  { label: 'Zon 3 – Dalarna/Norrland', value: 2.5 },
  { label: 'Zon 4 – Fjälltrakterna', value: 4.5 },
];

const WIND_ZONES = [
  { label: 'Vindzon 1 – Inlandet skyddat', value: 0.6 },
  { label: 'Vindzon 2 – Normalt läge', value: 0.8 },
  { label: 'Vindzon 3 – Exponerat läge', value: 1.0 },
  { label: 'Vindzon 4 – Kust/öppen terräng', value: 1.2 },
];

function parseMountingData(raw) {
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

function modelForSavedData(saved) {
  const brandKey = Object.entries(SYSTEMS).find(([, system]) => system.label === saved.brandLabel)?.[0] || '';
  const model = brandKey ? SYSTEMS[brandKey].models.find(item => item.name === saved.modelName) || null : null;
  return { brandKey, model };
}

function savedZoneValue(zones, labelOrValue) {
  if (labelOrValue == null || labelOrValue === '') return '';
  const byLabel = zones.find(zone => zone.label === labelOrValue);
  if (byLabel) return String(byLabel.value);
  const byValue = zones.find(zone => String(zone.value) === String(labelOrValue));
  return byValue ? String(byValue.value) : '';
}

export default function MountingSystemCalculator({ project, onUpdate }) {
  const saved = parseMountingData(project?.mounting_data);
  const savedModel = modelForSavedData(saved);

  const [selectedBrand, setSelectedBrand] = useState(savedModel.brandKey);
  const [selectedModel, setSelectedModel] = useState(savedModel.model);
  const [snowZone, setSnowZone] = useState(savedZoneValue(SNOW_ZONES, saved.snowZoneLabel || saved.snowZone));
  const [windZone, setWindZone] = useState(savedZoneValue(WIND_ZONES, saved.windZoneLabel || saved.windZone));
  const [roofAngle, setRoofAngle] = useState(String(saved.roofAngle || '30'));
  const [selectedPanelId, setSelectedPanelId] = useState(saved.selectedPanelId || '');
  const [showResult, setShowResult] = useState(Boolean(saved.modelName));
  const [showDrawing, setShowDrawing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextSaved = parseMountingData(project?.mounting_data);
    const nextModel = modelForSavedData(nextSaved);
    setSelectedBrand(nextModel.brandKey);
    setSelectedModel(nextModel.model);
    setSnowZone(savedZoneValue(SNOW_ZONES, nextSaved.snowZoneLabel || nextSaved.snowZone));
    setWindZone(savedZoneValue(WIND_ZONES, nextSaved.windZoneLabel || nextSaved.windZone));
    setRoofAngle(String(nextSaved.roofAngle || '30'));
    setSelectedPanelId(nextSaved.selectedPanelId || '');
    setShowResult(Boolean(nextSaved.modelName));
    setShowDrawing(false);
  }, [project?.id, project?.mounting_data]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-mounting'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const selectedProduct = products.find(p => p.id === selectedPanelId);

  const roofArea = project?.roof_width_m && project?.roof_height_m
    ? parseFloat(project.roof_width_m) * parseFloat(project.roof_height_m)
    : null;

  const angle = parseFloat(roofAngle) || 30;
  const snowLoad = snowZone ? parseFloat(snowZone) : null;
  const windLoad = windZone ? parseFloat(windZone) : null;
  const muFactor = angle <= 30 ? 0.8 : angle <= 60 ? 0.8 * (60 - angle) / 30 : 0;
  const designSnow = snowLoad ? (snowLoad * muFactor) : null;
  const cpe = angle < 15 ? -1.3 : angle < 30 ? -0.9 : -0.7;
  const designWind = windLoad ? Math.abs(cpe * windLoad) : null;

  const modelData = selectedModel;
  const snowOk = modelData && designSnow != null ? designSnow <= modelData.maxSnow : null;
  const windOk = modelData && designWind != null ? designWind <= modelData.maxWind : null;
  const totalLoad = designSnow != null && designWind != null ? designSnow + designWind : null;
  const recommendedHookSpacing = modelData
    ? Math.min(modelData.hookSpacingMM, totalLoad ? Math.round(1200 / (1 + totalLoad * 0.3)) : modelData.hookSpacingMM)
    : null;

  const savedPanelCount = (() => {
    try {
      const d = JSON.parse(project?.panel_layout_data || '{}');
      if (Array.isArray(d?.roofs)) {
        return d.roofs.reduce((sum, roof) => sum + (roof.panelGroups || []).reduce((groupSum, group) => groupSum + (Number(group.rows) || 0) * (Number(group.cols) || 0), 0), 0) || null;
      }
      const list = Array.isArray(d) ? d : (d.panels || []);
      return list.length > 0 ? list.length : null;
    } catch { return null; }
  })();

  const panelCount = savedPanelCount || (selectedProduct && roofArea
    ? Math.floor((roofArea * 0.85) / ((selectedProduct.width_mm / 1000) * (selectedProduct.height_mm / 1000)))
    : null);

  const saveMounting = async () => {
    setSaving(true);
    const payload = {
      brandKey: selectedBrand,
      brandLabel: SYSTEMS[selectedBrand]?.label,
      modelName: selectedModel?.name,
      selectedPanelId,
      selectedPanelName: selectedProduct?.name || '',
      roofAngle: parseFloat(roofAngle) || 30,
      snowZone,
      snowZoneLabel: SNOW_ZONES.find(z => String(z.value) === snowZone)?.label,
      windZone,
      windZoneLabel: WIND_ZONES.find(z => String(z.value) === windZone)?.label,
      muFactor: Number(muFactor.toFixed(2)),
      cpe,
      designSnow: designSnow != null ? Number(designSnow.toFixed(2)) : null,
      designWind: designWind != null ? Number(designWind.toFixed(2)) : null,
      totalLoad: totalLoad != null ? Number(totalLoad.toFixed(2)) : null,
      hookSpacing: recommendedHookSpacing,
      snowOk,
      windOk,
      panelCount,
      savedAt: new Date().toISOString(),
    };
    try {
      await onUpdate?.({ mounting_data: JSON.stringify(payload) });
      setShowResult(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Välj montagesystem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(SYSTEMS).map(([key, sys]) => (
              <button
                key={key}
                onClick={() => { setSelectedBrand(key); setSelectedModel(null); setShowResult(false); setShowDrawing(false); }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  selectedBrand === key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <p className="font-semibold text-sm">{sys.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sys.description}</p>
              </button>
            ))}
          </div>

          {selectedBrand && (
            <div>
              <p className="text-sm font-medium mb-2">Välj modell</p>
              <div className="flex flex-wrap gap-2">
                {SYSTEMS[selectedBrand].models.map(m => (
                  <button
                    key={m.name}
                    onClick={() => { setSelectedModel(m); setShowResult(false); setShowDrawing(false); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      selectedModel?.name === m.name ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              {selectedModel && (
                <div className="mt-3 flex gap-3 flex-wrap text-xs">
                  <Badge variant="outline">Max snölast: {selectedModel.maxSnow} kN/m²</Badge>
                  <Badge variant="outline">Max vindlast: {selectedModel.maxWind} kN/m²</Badge>
                  <Badge variant="outline">Max krok c/c: {selectedModel.hookSpacingMM} mm</Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedModel && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="w-4 h-4 text-primary" /> Välj solpanel (för klämzoner & ritning)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedPanelId} onValueChange={value => { setSelectedPanelId(value); setShowResult(false); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Välj panel..." />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} – {p.power_watts}W ({p.width_mm}×{p.height_mm} mm)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <div className="mt-2 flex gap-2 flex-wrap text-xs">
                <Badge variant="outline">{selectedProduct.width_mm} × {selectedProduct.height_mm} mm</Badge>
                <Badge variant="outline">Klämzon: {Math.round(selectedProduct.height_mm * 0.1)}–{Math.round(selectedProduct.height_mm * 0.33)} mm från kant</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedModel && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wind className="w-4 h-4 text-blue-500" />
              <Snowflake className="w-4 h-4 text-sky-400" />
              Snö- och vindlastberäkning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Snözon (Sverige)</label>
                <Select value={snowZone} onValueChange={v => { setSnowZone(v); setShowResult(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Välj snözon..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SNOW_ZONES.map(z => (
                      <SelectItem key={z.value} value={String(z.value)}>{z.label} ({z.value} kN/m²)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Vindzon</label>
                <Select value={windZone} onValueChange={v => { setWindZone(v); setShowResult(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Välj vindzon..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WIND_ZONES.map(z => (
                      <SelectItem key={z.value} value={String(z.value)}>{z.label} ({z.value} kN/m²)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Takvinkel (grader)</label>
                <input
                  type="number" min="0" max="90" value={roofAngle}
                  onChange={e => { setRoofAngle(e.target.value); setShowResult(false); }}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="t.ex. 30"
                />
              </div>
              {roofArea && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Takyta (från projekt)</label>
                  <div className="border border-border rounded-xl px-3 py-2 text-sm bg-muted/30 text-muted-foreground">
                    {roofArea.toFixed(1)} m²
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={saveMounting}
              disabled={!snowZone || !windZone || saving}
              className="gap-2 w-full sm:w-auto"
            >
              <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Beräkna och spara laster'}
            </Button>
          </CardContent>
        </Card>
      )}

      {showResult && modelData && (
        <Card className={`border-0 shadow-sm ${snowOk && windOk ? 'bg-green-50' : 'bg-red-50'}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {snowOk && windOk
                ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Systemet klarar lasterna</>
                : <><AlertTriangle className="w-5 h-5 text-red-500" /> Systemet klarar INTE lasterna</>
              }
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1"><Snowflake className="w-3.5 h-3.5 text-sky-500" /><p className="text-xs text-muted-foreground">Snölast (design)</p></div>
                <p className="text-xl font-bold">{designSnow?.toFixed(2)}</p><p className="text-xs text-muted-foreground">kN/m²</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1"><Wind className="w-3.5 h-3.5 text-blue-500" /><p className="text-xs text-muted-foreground">Vindlast (design)</p></div>
                <p className="text-xl font-bold">{designWind?.toFixed(2)}</p><p className="text-xs text-muted-foreground">kN/m²</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm"><p className="text-xs text-muted-foreground mb-1">Total last</p><p className="text-xl font-bold">{totalLoad?.toFixed(2)}</p><p className="text-xs text-muted-foreground">kN/m²</p></div>
              <div className="bg-white rounded-xl p-3 shadow-sm"><p className="text-xs text-muted-foreground mb-1">Krok c/c-avstånd</p><p className="text-xl font-bold">{recommendedHookSpacing}</p><p className="text-xs text-muted-foreground">mm</p></div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-white rounded-lg flex-wrap gap-2"><span>Snölastkapacitet – {modelData.name}</span><div className="flex items-center gap-2"><span className="font-semibold">max {modelData.maxSnow} kN/m²</span><Badge className={snowOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{snowOk ? '✓ OK' : '✗ UNDERDIMENSIONERAT'}</Badge></div></div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg flex-wrap gap-2"><span>Vindlastkapacitet – {modelData.name}</span><div className="flex items-center gap-2"><span className="font-semibold">max {modelData.maxWind} kN/m²</span><Badge className={windOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{windOk ? '✓ OK' : '✗ UNDERDIMENSIONERAT'}</Badge></div></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {selectedProduct && (
                <>
                  <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Skena pos. 1 (uppifrån)</p><p className="font-bold">{Math.round(selectedProduct.height_mm * 0.2)} mm</p></div>
                  <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Skena pos. 2 (nedifrån)</p><p className="font-bold">{Math.round(selectedProduct.height_mm * 0.2)} mm</p></div>
                  <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Klämzon</p><p className="font-bold">{Math.round(selectedProduct.height_mm * 0.1)}–{Math.round(selectedProduct.height_mm * 0.33)} mm</p></div>
                </>
              )}
              <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Skena c/c (krok)</p><p className="font-bold">{recommendedHookSpacing} mm</p></div>
              <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Skenöverhäng</p><p className="font-bold">150 mm</p></div>
              <div className="bg-white rounded-lg p-2 shadow-sm"><p className="text-muted-foreground">Formfaktor μ</p><p className="font-bold">{muFactor.toFixed(2)}</p></div>
            </div>

            {(!snowOk || !windOk) && <div className="p-3 bg-red-100 border border-red-200 rounded-xl text-sm text-red-800"><strong>Rekommendation:</strong> Välj ett starkare system som K2 PitchedRoof eller Nordmount Pro för dessa lastförhållanden.</div>}

            <Button variant="outline" className="w-full gap-2" onClick={() => setShowDrawing(v => !v)}>{showDrawing ? 'Dölj montageritning' : '📐 Visa montageritning med mått'}</Button>
            <p className="text-xs text-muted-foreground">Beräkning enligt Eurokod SS-EN 1991-1-3 (snö) och SS-EN 1991-1-4 (vind). μ={muFactor.toFixed(2)}, cpe={cpe}.</p>
          </CardContent>
        </Card>
      )}

      {showDrawing && selectedModel && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">📐 Montageritning</CardTitle></CardHeader>
          <CardContent>
            <MountingDrawing project={project} selectedProduct={selectedProduct} systemBrand={selectedBrand ? SYSTEMS[selectedBrand].label : ''} systemModel={selectedModel?.name || ''} panelCount={panelCount} recommendedHookSpacingMM={recommendedHookSpacing} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
