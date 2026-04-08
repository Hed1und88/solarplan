import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Ruler, Zap, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import RoofPanelCanvas from './RoofPanelCanvas';

const ROOF_NAMES = Array.from({ length: 10 }, (_, i) => `Tak ${i + 1}`);

function parseLayoutData(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    // New format: { roofs: [...] }
    if (d.roofs) return d.roofs;
    // Legacy: { panels, obstacles } or []
    return [];
  } catch { return []; }
}

function emptyRoof(name) {
  return { name, width_m: '', height_m: '', panels: [], obstacles: [], imageUrl: '' };
}

export default function PanelPlacementTab({ project, onUpdate }) {
  const [roofs, setRoofs] = useState(() => {
    const loaded = parseLayoutData(project.panel_layout_data);
    return loaded.length > 0 ? loaded : [];
  });
  const [activeRoofIdx, setActiveRoofIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newWidth, setNewWidth] = useState('');
  const [newHeight, setNewHeight] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedPanel, setSelectedPanel] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const activeRoof = activeRoofIdx !== null ? roofs[activeRoofIdx] : null;
  const selectedProduct = products.find(p => p.id === selectedPanel);

  const panelArea = selectedProduct?.width_mm && selectedProduct?.height_mm
    ? (selectedProduct.width_mm / 1000) * (selectedProduct.height_mm / 1000)
    : 1.8;
  const roofArea = activeRoof?.width_m && activeRoof?.height_m
    ? parseFloat(activeRoof.width_m) * parseFloat(activeRoof.height_m)
    : null;
  const maxPanels = roofArea ? Math.floor((roofArea * 0.85) / panelArea) : null;

  const usedNames = roofs.map(r => r.name);
  const availableNames = ROOF_NAMES.filter(n => !usedNames.includes(n));

  const addRoof = () => {
    if (!newWidth || !newHeight) return;
    const name = newName || availableNames[0] || `Tak ${roofs.length + 1}`;
    const roof = emptyRoof(name);
    roof.width_m = newWidth;
    roof.height_m = newHeight;
    const updated = [...roofs, roof];
    setRoofs(updated);
    setActiveRoofIdx(updated.length - 1);
    setNewWidth('');
    setNewHeight('');
    setNewName('');
    setSelectedPanel('');
  };

  const updateActiveRoof = (data) => {
    setRoofs(prev => prev.map((r, i) => i === activeRoofIdx ? { ...r, ...data } : r));
  };

  const deleteRoof = (idx) => {
    setRoofs(prev => prev.filter((_, i) => i !== idx));
    if (activeRoofIdx === idx) setActiveRoofIdx(null);
    else if (activeRoofIdx > idx) setActiveRoofIdx(prev => prev - 1);
  };

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    updateActiveRoof({ imageUrl: file_url });
  };

  const addMaxPanels = () => {
    if (!selectedProduct || !maxPanels || !activeRoof) return;
    const panels = activeRoof.panels || [];
    const toAdd = maxPanels - panels.length;
    if (toAdd <= 0) return;

    const rw = parseFloat(activeRoof.width_m);
    const rh = parseFloat(activeRoof.height_m);
    const pw = (selectedProduct.width_mm || 1100) / 1000;
    const ph = (selectedProduct.height_mm || 1760) / 1000;
    const cols = Math.floor(rw / pw);
    const rows = Math.floor(rh / ph);
    const wPct = (pw / rw) * 100;
    const hPct = (ph / rh) * 100;

    const newPanels = [];
    let count = 0;
    for (let r = 0; r < rows && count < toAdd; r++) {
      for (let c = 0; c < cols && count < toAdd; c++) {
        newPanels.push({
          id: (Date.now() + count).toString(),
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          power_watts: selectedProduct.power_watts,
          width_mm: selectedProduct.width_mm,
          height_mm: selectedProduct.height_mm,
          w_pct: wPct, h_pct: hPct,
          x: ((c * pw + pw / 2) / rw) * 100,
          y: ((r * ph + ph / 2) / rh) * 100,
        });
        count++;
      }
    }
    updateActiveRoof({ panels: [...panels, ...newPanels] });
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      roof_image_url: roofs[0]?.imageUrl || project.roof_image_url || '',
      panel_layout_data: JSON.stringify({ roofs }),
      roof_width_m: roofs[0] ? parseFloat(roofs[0].width_m) || null : null,
      roof_height_m: roofs[0] ? parseFloat(roofs[0].height_m) || null : null,
    });
    setSaving(false);
  };

  const totalPanels = roofs.reduce((sum, r) => sum + (r.panels?.length || 0), 0);
  const totalPower = roofs.reduce((sum, r) => sum + (r.panels || []).reduce((s, p) => s + (p.power_watts || 400), 0), 0);

  return (
    <div className="space-y-4">
      {/* Add new roof */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4 text-primary" /> Lägg till tak
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Namn</label>
              <Select value={newName} onValueChange={setNewName}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={availableNames[0] || 'Tak 1'} />
                </SelectTrigger>
                <SelectContent>
                  {availableNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Bredd (m)</label>
              <input
                type="number" step="0.1" min="0" value={newWidth}
                onChange={e => setNewWidth(e.target.value)}
                placeholder="t.ex. 8.5"
                className="w-28 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Höjd/djup (m)</label>
              <input
                type="number" step="0.1" min="0" value={newHeight}
                onChange={e => setNewHeight(e.target.value)}
                placeholder="t.ex. 5.0"
                className="w-28 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              onClick={addRoof}
              disabled={!newWidth || !newHeight || availableNames.length === 0}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Spara tak
            </Button>
          </div>

          {/* Roof list */}
          {roofs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {roofs.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveRoofIdx(i); setSelectedPanel(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${activeRoofIdx === i ? 'bg-primary text-white border-primary' : 'bg-card border-border hover:border-primary/50'}`}
                >
                  {r.name} ({r.width_m}×{r.height_m} m)
                  {r.panels?.length > 0 && <span className="ml-1 text-xs opacity-70">{r.panels.length}p</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active roof panel placement */}
      {activeRoof && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg">{activeRoof.name} – Panelplacering</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {parseFloat(activeRoof.width_m) * parseFloat(activeRoof.height_m)} m² &nbsp;·&nbsp;
                Effektiv yta: {(parseFloat(activeRoof.width_m) * parseFloat(activeRoof.height_m) * 0.85).toFixed(1)} m²
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="ghost"
                className="text-destructive hover:text-destructive gap-1"
                onClick={() => deleteRoof(activeRoofIdx)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Ta bort tak
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
                <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Panel selector */}
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

            <RoofPanelCanvas
              imageUrl={activeRoof.imageUrl || ''}
              panels={activeRoof.panels || []}
              onPanelsChange={panels => updateActiveRoof({ panels })}
              obstacles={activeRoof.obstacles || []}
              onObstaclesChange={obstacles => updateActiveRoof({ obstacles })}
              onImageUpload={handleImageUpload}
              selectedProduct={selectedProduct}
              roofWidthM={parseFloat(activeRoof.width_m) || null}
              roofHeightM={parseFloat(activeRoof.height_m) || null}
            />

            {(activeRoof.panels?.length > 0) && (
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline">{activeRoof.panels.length} paneler på {activeRoof.name}</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {(activeRoof.panels.reduce((s, p) => s + (p.power_watts || 400), 0) / 1000).toFixed(2)} kWp
                </Badge>
                <Button
                  size="sm" variant="ghost"
                  className="text-destructive hover:text-destructive gap-1 ml-auto"
                  onClick={() => updateActiveRoof({ panels: [] })}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Rensa paneler
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      {totalPanels > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Totalt: {totalPanels} paneler</Badge>
          <Badge className="bg-primary/10 text-primary border-primary/20">
            {(totalPower / 1000).toFixed(2)} kWp totalt
          </Badge>
        </div>
      )}
    </div>
  );
}