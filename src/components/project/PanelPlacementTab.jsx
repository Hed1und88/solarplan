import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Sun, Ruler } from 'lucide-react';
import ImageCanvas from './ImageCanvas';

export default function PanelPlacementTab({ project, onUpdate }) {
  const [imageUrl, setImageUrl] = useState(project.roof_image_url || '');
  const [panels, setPanels] = useState(() => {
    try { return JSON.parse(project.panel_layout_data || '[]'); } catch { return []; }
  });
  const [selectedPanel, setSelectedPanel] = useState('');
  const [saving, setSaving] = useState(false);

  // Roof dimensions state
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

  const addPanel = () => {
    const product = products.find(p => p.id === selectedPanel);
    if (!product) return;
    setPanels(prev => [...prev, {
      id: Date.now().toString(),
      product_id: product.id,
      product_name: product.name,
      power_watts: product.power_watts,
      x: 30 + Math.random() * 20,
      y: 30 + Math.random() * 20,
      scale: 1,
      rotation: 0,
    }]);
  };

  const removePanel = (panelId) => {
    setPanels(prev => prev.filter(p => p.id !== panelId));
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

  // Panels that can fit given roof area and panel dimensions
  const roofArea = roofWidth && roofHeight ? (parseFloat(roofWidth) * parseFloat(roofHeight)) : null;
  const selectedProduct = products.find(p => p.id === selectedPanel);
  const panelArea = selectedProduct?.width_mm && selectedProduct?.height_mm
    ? ((selectedProduct.width_mm / 1000) * (selectedProduct.height_mm / 1000))
    : 1.8;
  const maxPanels = roofArea ? Math.floor((roofArea * 0.8) / panelArea) : null;

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
                type="number"
                step="0.1"
                min="0"
                value={roofWidth}
                onChange={e => { setRoofWidth(e.target.value); setDimensionsConfirmed(false); }}
                placeholder="t.ex. 8.5"
                className="w-32 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Höjd/djup (m)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={roofHeight}
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
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Takyta: {roofArea.toFixed(1)} m²</Badge>
              <Badge variant="outline">Effektiv yta (80%): {(roofArea * 0.8).toFixed(1)} m²</Badge>
              {maxPanels && <Badge variant="outline">Max ~{maxPanels} paneler</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel placement */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Panelplacering på tak</CardTitle>
          <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
            <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add panel controls - only if dimensions confirmed */}
          {!dimensionsConfirmed && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Ange och bekräfta takmåtten ovan innan du lägger till paneler.
            </div>
          )}

          {dimensionsConfirmed && imageUrl && (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium mb-1.5">Välj solpanel</p>
                <Select value={selectedPanel} onValueChange={setSelectedPanel}>
                  <SelectTrigger><SelectValue placeholder="Välj panel..." /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.power_watts}W)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addPanel} disabled={!selectedPanel} className="gap-2">
                <Plus className="w-4 h-4" /> Lägg till panel
              </Button>
            </div>
          )}

          <ImageCanvas
            imageUrl={imageUrl}
            items={panels}
            onItemsChange={setPanels}
            onImageUpload={handleImageUpload}
            label="Ladda upp bild på taket"
            itemRenderer={(item) => (
              <div className="group relative">
                <div className="bg-blue-500/60 border-2 border-blue-300 rounded-sm px-3 py-2 text-white text-xs font-medium shadow-lg backdrop-blur-sm min-w-[60px] text-center">
                  <Sun className="w-3 h-3 inline mr-1" />
                  {item.product_name?.split(' ')[0]}
                </div>
                <button
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); removePanel(item.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          />

          {panels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {panels.map((p) => (
                <Badge key={p.id} variant="secondary" className="gap-1">
                  {p.product_name}
                  <button onClick={() => removePanel(p.id)} className="ml-1 hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <Badge variant="outline">{panels.length} paneler totalt</Badge>
              {totalPower > 0 && <Badge className="bg-primary/10 text-primary">{(totalPower / 1000).toFixed(2)} kWp</Badge>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}