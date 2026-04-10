import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Plus, X, Zap, LayoutGrid } from 'lucide-react';

function parseLayoutData(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    if (Array.isArray(d)) return { panels: d, roofWidth: '', roofHeight: '' };
    return {
      panels: d.panels || [],
      roofWidth: d.roofWidth || '',
      roofHeight: d.roofHeight || '',
    };
  } catch { return { panels: [], roofWidth: '', roofHeight: '' }; }
}

export default function PanelPlacementTab({ project, onUpdate }) {
  const saved = parseLayoutData(project.panel_layout_data);

  const [roofWidth, setRoofWidth] = useState(saved.roofWidth);
  const [roofHeight, setRoofHeight] = useState(saved.roofHeight);
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [panels, setPanels] = useState(saved.panels);
  const [saving, setSaving] = useState(false);
  const [showAddRoof, setShowAddRoof] = useState(panels.length === 0);

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const selectedProduct = products.find(p => p.id === selectedPanelId) || null;

  // Calculate how many panels fit
  const calcPanels = () => {
    if (!selectedProduct || !roofWidth || !roofHeight) return;
    const w = parseFloat(roofWidth);
    const h = parseFloat(roofHeight);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    const panelW_m = (selectedProduct.width_mm || 1000) / 1000;
    const panelH_m = (selectedProduct.height_mm || 1700) / 1000;

    const cols = Math.floor(w / panelW_m);
    const rows = Math.floor(h / panelH_m);

    if (cols <= 0 || rows <= 0) return;

    const newPanels = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newPanels.push({
          id: `panel-${r}-${c}-${Date.now()}`,
          row: r,
          col: c,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          power_watts: selectedProduct.power_watts || 400,
          width_mm: selectedProduct.width_mm,
          height_mm: selectedProduct.height_mm,
        });
      }
    }
    setPanels(newPanels);
    setShowAddRoof(false);
  };

  const removePanel = (id) => {
    setPanels(prev => prev.filter(p => p.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      panel_layout_data: JSON.stringify({ panels, roofWidth, roofHeight }),
    });
    setSaving(false);
  };

  const totalPower = panels.reduce((s, p) => s + (p.power_watts || 400), 0);
  const sp = selectedProduct || (panels[0] ? products.find(p => p.id === panels[0].product_id) : null);

  // Figure out grid dims from panels
  const maxRow = panels.length ? Math.max(...panels.map(p => p.row)) + 1 : 0;
  const maxCol = panels.length ? Math.max(...panels.map(p => p.col)) + 1 : 0;

  // Build a set of remaining panel ids per (row,col) for grid rendering
  const panelMap = {};
  panels.forEach(p => { panelMap[`${p.row}-${p.col}`] = p; });

  return (
    <div className="space-y-4">
      {/* Header summary */}
      {panels.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-4 flex flex-wrap items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{panels.length} paneler</Badge>
              {totalPower > 0 && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  <Zap className="w-3 h-3 mr-1" />{(totalPower / 1000).toFixed(2)} kWp
                </Badge>
              )}
              {sp && <Badge variant="outline">{sp.name}</Badge>}
              {roofWidth && roofHeight && (
                <Badge variant="outline">{roofWidth} × {roofHeight} m</Badge>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddRoof(true)} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Ny takyta
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Sparar...' : 'Spara'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add roof form */}
      {showAddRoof && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">1</span>
              Lägg till takyta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Panel selector */}
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1.5">Välj solpanel</label>
              <Select value={selectedPanelId} onValueChange={setSelectedPanelId}>
                <SelectTrigger className="max-w-md">
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
                <p className="text-xs text-muted-foreground mt-1.5">
                  Panelstorlek: {selectedProduct.width_mm} mm bred × {selectedProduct.height_mm} mm hög
                  ({((selectedProduct.width_mm || 0) / 1000).toFixed(2)} × {((selectedProduct.height_mm || 0) / 1000).toFixed(2)} m)
                </p>
              )}
            </div>

            {/* Roof dimensions */}
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1.5">Takytan mått (meter)</label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-14">Bredd:</span>
                  <input
                    type="number" min="0.5" step="0.1"
                    value={roofWidth}
                    onChange={e => setRoofWidth(e.target.value)}
                    placeholder="t.ex. 6"
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-14">Höjd:</span>
                  <input
                    type="number" min="0.5" step="0.1"
                    value={roofHeight}
                    onChange={e => setRoofHeight(e.target.value)}
                    placeholder="t.ex. 4"
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
              </div>

              {/* Preview calc */}
              {selectedProduct && roofWidth && roofHeight && (() => {
                const w = parseFloat(roofWidth), h = parseFloat(roofHeight);
                const pw = (selectedProduct.width_mm || 1000) / 1000;
                const ph = (selectedProduct.height_mm || 1700) / 1000;
                const cols = Math.floor(w / pw), rows = Math.floor(h / ph);
                const total = cols * rows;
                if (total <= 0) return <p className="text-xs text-red-500 mt-1.5">Takytan är för liten för den valda panelen.</p>;
                return (
                  <p className="text-xs text-green-700 mt-1.5 font-medium">
                    ✓ Plats för {cols} × {rows} = <strong>{total} paneler</strong> ({((total * (selectedProduct.power_watts || 400)) / 1000).toFixed(2)} kWp)
                  </p>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={calcPanels}
                disabled={!selectedProduct || !roofWidth || !roofHeight}
                className="gap-2"
              >
                <LayoutGrid className="w-4 h-4" /> Fyll takyta med paneler
              </Button>
              {panels.length > 0 && (
                <Button variant="ghost" onClick={() => setShowAddRoof(false)}>Avbryt</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Panel grid visualization */}
      {panels.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
              Paneler — klicka × för att ta bort
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${maxCol}, minmax(48px, 1fr))`,
                  gap: 4,
                  maxWidth: '100%',
                }}
              >
                {Array.from({ length: maxRow }, (_, r) =>
                  Array.from({ length: maxCol }, (_, c) => {
                    const panel = panelMap[`${r}-${c}`];
                    return (
                      <div key={`${r}-${c}`} style={{ aspectRatio: `${sp?.width_mm || 100}/${sp?.height_mm || 170}` }}>
                        {panel ? (
                          <div
                            style={{
                              width: '100%', height: '100%',
                              background: 'linear-gradient(135deg, #1a2540 0%, #1e3560 100%)',
                              border: '1px solid #3a5090',
                              borderRadius: 3,
                              position: 'relative',
                              cursor: 'pointer',
                            }}
                            title={`Rad ${r + 1}, Kol ${c + 1} — klicka för att ta bort`}
                            onClick={() => removePanel(panel.id)}
                          >
                            {/* Panel cell lines */}
                            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                              <line x1="33%" y1="0" x2="33%" y2="100%" stroke="#2a4070" strokeWidth="0.5" />
                              <line x1="66%" y1="0" x2="66%" y2="100%" stroke="#2a4070" strokeWidth="0.5" />
                              <line x1="0" y1="25%" x2="100%" y2="25%" stroke="#2a4070" strokeWidth="0.5" />
                              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#2a4070" strokeWidth="0.5" />
                              <line x1="0" y1="75%" x2="100%" y2="75%" stroke="#2a4070" strokeWidth="0.5" />
                            </svg>
                            <div style={{
                              position: 'absolute', top: 1, right: 1,
                              background: 'rgba(239,68,68,0.85)',
                              borderRadius: '50%', width: 14, height: 14,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, color: 'white', fontWeight: 'bold',
                            }}>×</div>
                          </div>
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            background: 'hsl(var(--muted))',
                            borderRadius: 3,
                            border: '1px dashed hsl(var(--border))',
                            opacity: 0.4,
                          }} title="Borttagen panel" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Klicka på en panel för att ta bort den. Grå rutor = borttagna paneler.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara layout'}
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive gap-1"
                onClick={() => { setPanels([]); setShowAddRoof(true); }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Rensa alla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {panels.length === 0 && !showAddRoof && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <LayoutGrid className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-4">Inga paneler placerade ännu</p>
            <Button onClick={() => setShowAddRoof(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Lägg till takyta
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}