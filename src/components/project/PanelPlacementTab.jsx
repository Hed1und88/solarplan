import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Ruler, Zap } from 'lucide-react';
import RoofPanelCanvas from './RoofPanelCanvas';

export default function PanelPlacementTab({ project, onUpdate }) {
  const [imageUrl, setImageUrl] = useState(project.roof_image_url || '');
  const [panels, setPanels] = useState(() => {
    try { return JSON.parse(project.panel_layout_data || '[]'); } catch { return []; }
  });
  const [selectedPanel, setSelectedPanel] = useState('');
  const [saving, setSaving] = useState(false);

  const [roofWidth, setRoofWidth] = useState(project.roof_width_m || '');
  const [roofHeight, setRoofHeight] = useState(project.roof_height_m || '');
  const [dimensionsConfirmed, setDimensionsConfirmed] = useState(
    !!(project.roof_width_m && project.roof_height_m)
  );

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
  };

  const selectedProduct = products.find(p => p.id === selectedPanel);

  // Calculate using actual panel dimensions
  const panelArea = selectedProduct?.width_mm && selectedProduct?.height_mm
    ? (selectedProduct.width_mm / 1000) * (selectedProduct.height_mm / 1000)
    : 1.8;
  const roofArea = roofWidth && roofHeight ? parseFloat(roofWidth) * parseFloat(roofHeight) : null;
  const maxPanels = roofArea ? Math.floor((roofArea * 0.85) / panelArea) : null;

  const addMaxPanels = () => {
    if (!selectedProduct || !maxPanels || !dimensionsConfirmed) return;
    const toAdd = maxPanels - panels.length;
    if (toAdd <= 0) return;

    const rw = parseFloat(roofWidth);
    const rh = parseFloat(roofHeight);
    const pw = (selectedProduct.width_mm || 1100) / 1000;
    const ph = (selectedProduct.height_mm || 1760) / 1000;

    const cols = Math.floor(rw / pw);
    const rows = Math.floor(rh / ph);

    const newPanels = [];
    let count = 0;
    for (let r = 0; r < rows && count < toAdd; r++) {
      for (let c = 0; c < cols && count < toAdd; c++) {
        // Center each panel in its cell, as % of canvas
        const xPct = ((c * pw + pw / 2) / rw) * 100;
        const yPct = ((r * ph + ph / 2) / rh) * 100;
        newPanels.push({
          id: (Date.now() + count).toString(),
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          power_watts: selectedProduct.power_watts,
          width_mm: selectedProduct.width_mm,
          height_mm: selectedProduct.height_mm,
          x: xPct,
          y: yPct,
        });
        count++;
      }
    }
    setPanels(prev => [...prev, ...newPanels]);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      roof_image_url: imageUrl,
      panel_layout_data: JSON.stringify(panels),
      roof_width_m: parseFloat(roofWidth) || null,
      roof_height_m: parseFloat(roofHeight) || null,
    });
    setSaving(false);
  };

  const totalPower = panels.reduce((sum, p) => sum + (p.power_watts || 400), 0);

  return (
    <div className="space-y-4">
      {/* Roof dimensions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4 text-primary" /> Takmått (obligatoriskt)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Bredd (m)</label>
              <input
                type="number" step="0.1" min="0" value={roofWidth}
                onChange={e => { setRoofWidth(e.target.value); setDimensionsConfirmed(false); }}
                placeholder="t.ex. 8.5"
                className="w-32 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Höjd/djup (m)</label>
              <input
                type="number" step="0.1" min="0" value={roofHeight}
                onChange={e => { setRoofHeight(e.target.value); setDimensionsConfirmed(false); }}
                placeholder="t.ex. 5.0"
                className="w-32 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              variant={dimensionsConfirmed ? 'secondary' : 'default'}
              onClick={() => setDimensionsConfirmed(true)}
              disabled={!roofWidth || !roofHeight}
            >
              {dimensionsConfirmed ? '✓ Bekräftade' : 'Bekräfta mått'}
            </Button>
          </div>
          {roofArea && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Takyta: {roofArea.toFixed(1)} m²</Badge>
              <Badge variant="outline">Effektiv yta (85%): {(roofArea * 0.85).toFixed(1)} m²</Badge>
              {maxPanels != null && selectedProduct && (
                <Badge variant="outline">
                  Max ~{maxPanels} paneler ({selectedProduct.width_mm}×{selectedProduct.height_mm} mm)
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel selection & placement */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Panelplacering på tak</CardTitle>
          <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
            <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!dimensionsConfirmed && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Ange och bekräfta takmåtten ovan innan du lägger till paneler.
            </div>
          )}

          {dimensionsConfirmed && (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium mb-1.5">Välj solpanel</p>
                <Select value={selectedPanel} onValueChange={setSelectedPanel}>
                  <SelectTrigger>
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
              </div>
              <Button
                onClick={addMaxPanels}
                disabled={!selectedPanel || !maxPanels}
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Zap className="w-4 h-4" /> Fyll max ({maxPanels ?? '–'} st)
              </Button>
            </div>
          )}

          <RoofPanelCanvas
            imageUrl={imageUrl}
            panels={panels}
            onPanelsChange={setPanels}
            onImageUpload={handleImageUpload}
            selectedProduct={selectedProduct}
            roofWidthM={parseFloat(roofWidth) || null}
            roofHeightM={parseFloat(roofHeight) || null}
          />

          {panels.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline">{panels.length} paneler totalt</Badge>
              {totalPower > 0 && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {(totalPower / 1000).toFixed(2)} kWp
                </Badge>
              )}
              <Button
                size="sm" variant="ghost"
                className="text-destructive hover:text-destructive gap-1 ml-auto"
                onClick={() => setPanels([])}
              >
                <Trash2 className="w-3.5 h-3.5" /> Rensa alla
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}