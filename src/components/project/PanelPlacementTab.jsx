import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Plus, Zap, LayoutGrid, AlertTriangle } from 'lucide-react';

function parseLayoutData(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    if (Array.isArray(d)) return { panels: d, roofWidth: '', roofHeight: '', obstacles: [] };
    return {
      panels: d.panels || [],
      roofWidth: d.roofWidth || '',
      roofHeight: d.roofHeight || '',
      obstacles: d.obstacles || [],
    };
  } catch { return { panels: [], roofWidth: '', roofHeight: '', obstacles: [] }; }
}

// Check if a panel (row, col) overlaps any obstacle
function panelOverlapsObstacle(row, col, panelW_m, panelH_m, obstacles) {
  const px0 = col * panelW_m;
  const py0 = row * panelH_m;
  const px1 = px0 + panelW_m;
  const py1 = py0 + panelH_m;

  return obstacles.some(obs => {
    const ox0 = parseFloat(obs.x) || 0;
    const oy0 = parseFloat(obs.y) || 0;
    const ox1 = ox0 + (parseFloat(obs.width) || 0);
    const oy1 = oy0 + (parseFloat(obs.height) || 0);
    return px0 < ox1 && px1 > ox0 && py0 < oy1 && py1 > oy0;
  });
}

const OBSTACLE_TYPES = [
  { value: 'skorsten', label: 'Skorsten' },
  { value: 'takfonster', label: 'Takfönster' },
  { value: 'ventilation', label: 'Ventilationsrör' },
  { value: 'annat', label: 'Annat' },
];

export default function PanelPlacementTab({ project, onUpdate }) {
  const saved = parseLayoutData(project.panel_layout_data);

  const [roofWidth, setRoofWidth] = useState(saved.roofWidth);
  const [roofHeight, setRoofHeight] = useState(saved.roofHeight);
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [panels, setPanels] = useState(saved.panels);
  const [obstacles, setObstacles] = useState(saved.obstacles);
  const [saving, setSaving] = useState(false);
  const [showAddRoof, setShowAddRoof] = useState(panels.length === 0);
  const [showAddObstacle, setShowAddObstacle] = useState(false);
  const [newObs, setNewObs] = useState({ type: 'skorsten', x: '', y: '', width: '', height: '' });

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const selectedProduct = products.find(p => p.id === selectedPanelId) || null;
  const sp = selectedProduct || (panels[0] ? products.find(p => p.id === panels[0].product_id) : null);
  const panelW_m = (sp?.width_mm || 1000) / 1000;
  const panelH_m = (sp?.height_mm || 1700) / 1000;

  // Recompute active panels (excluding those blocked by obstacles)
  const activePanels = useMemo(() => {
    return panels.filter(p => !panelOverlapsObstacle(p.row, p.col, panelW_m, panelH_m, obstacles));
  }, [panels, obstacles, panelW_m, panelH_m]);

  const maxRow = panels.length ? Math.max(...panels.map(p => p.row)) + 1 : 0;
  const maxCol = panels.length ? Math.max(...panels.map(p => p.col)) + 1 : 0;

  const calcPanels = () => {
    if (!selectedProduct || !roofWidth || !roofHeight) return;
    const w = parseFloat(roofWidth), h = parseFloat(roofHeight);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    const pw = (selectedProduct.width_mm || 1000) / 1000;
    const ph = (selectedProduct.height_mm || 1700) / 1000;
    const cols = Math.floor(w / pw);
    const rows = Math.floor(h / ph);
    if (cols <= 0 || rows <= 0) return;

    const newPanels = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newPanels.push({
          id: `panel-${r}-${c}-${Date.now()}`,
          row: r, col: c,
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

  const removePanel = (id) => setPanels(prev => prev.filter(p => p.id !== id));

  const addObstacle = () => {
    if (!newObs.x || !newObs.y || !newObs.width || !newObs.height) return;
    setObstacles(prev => [...prev, { ...newObs, id: `obs-${Date.now()}` }]);
    setNewObs({ type: 'skorsten', x: '', y: '', width: '', height: '' });
    setShowAddObstacle(false);
  };

  const removeObstacle = (id) => setObstacles(prev => prev.filter(o => o.id !== id));

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      panel_layout_data: JSON.stringify({ panels: activePanels, roofWidth, roofHeight, obstacles }),
    });
    setSaving(false);
  };

  const totalPower = activePanels.reduce((s, p) => s + (p.power_watts || 400), 0);
  const blockedCount = panels.length - activePanels.length;

  // Build map for grid rendering
  const activeIds = new Set(activePanels.map(p => p.id));
  const panelMap = {};
  panels.forEach(p => { panelMap[`${p.row}-${p.col}`] = p; });

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {panels.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-4 flex flex-wrap items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{activePanels.length} aktiva paneler</Badge>
              {blockedCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />{blockedCount} blockerade
                </Badge>
              )}
              {totalPower > 0 && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  <Zap className="w-3 h-3 mr-1" />{(totalPower / 1000).toFixed(2)} kWp
                </Badge>
              )}
              {sp && <Badge variant="outline">{sp.name}</Badge>}
              {roofWidth && roofHeight && <Badge variant="outline">{roofWidth} × {roofHeight} m</Badge>}
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
                  Panelstorlek: {selectedProduct.width_mm} × {selectedProduct.height_mm} mm
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1.5">Takytan mått (meter)</label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-14">Bredd:</span>
                  <input type="number" min="0.5" step="0.1" value={roofWidth}
                    onChange={e => setRoofWidth(e.target.value)} placeholder="t.ex. 6"
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-14">Höjd:</span>
                  <input type="number" min="0.5" step="0.1" value={roofHeight}
                    onChange={e => setRoofHeight(e.target.value)} placeholder="t.ex. 4"
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
              </div>
              {selectedProduct && roofWidth && roofHeight && (() => {
                const w = parseFloat(roofWidth), h = parseFloat(roofHeight);
                const pw = (selectedProduct.width_mm || 1000) / 1000;
                const ph = (selectedProduct.height_mm || 1700) / 1000;
                const cols = Math.floor(w / pw), rows = Math.floor(h / ph);
                const total = cols * rows;
                if (total <= 0) return <p className="text-xs text-red-500 mt-1.5">Takytan är för liten för vald panel.</p>;
                return <p className="text-xs text-green-700 mt-1.5 font-medium">✓ Plats för {cols} × {rows} = <strong>{total} paneler</strong> ({((total * (selectedProduct.power_watts || 400)) / 1000).toFixed(2)} kWp)</p>;
              })()}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={calcPanels} disabled={!selectedProduct || !roofWidth || !roofHeight} className="gap-2">
                <LayoutGrid className="w-4 h-4" /> Fyll takyta med paneler
              </Button>
              {panels.length > 0 && <Button variant="ghost" onClick={() => setShowAddRoof(false)}>Avbryt</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Obstacles section */}
      {panels.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Hinder på taket
              <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setShowAddObstacle(v => !v)}>
                <Plus className="w-3.5 h-3.5" /> Lägg till hinder
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add obstacle form */}
            {showAddObstacle && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-xs text-amber-700 font-medium">Ange hindrets position och storlek i meter (mätt från takytan övre vänstra hörn)</p>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Typ</label>
                    <select value={newObs.type} onChange={e => setNewObs(o => ({ ...o, type: e.target.value }))}
                      className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background">
                      {OBSTACLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {[
                    { key: 'x', label: 'Position X (m)' },
                    { key: 'y', label: 'Position Y (m)' },
                    { key: 'width', label: 'Bredd (m)' },
                    { key: 'height', label: 'Höjd (m)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                      <input type="number" min="0" step="0.1" value={newObs[key]}
                        onChange={e => setNewObs(o => ({ ...o, [key]: e.target.value }))}
                        placeholder="0.0"
                        className="w-24 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addObstacle}
                    disabled={!newObs.x || !newObs.y || !newObs.width || !newObs.height}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-1">
                    <Plus className="w-3.5 h-3.5" /> Lägg till
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddObstacle(false)}>Avbryt</Button>
                </div>
              </div>
            )}

            {obstacles.length === 0 && !showAddObstacle && (
              <p className="text-sm text-muted-foreground">Inga hinder tillagda. Lägg till skorstenar, takfönster m.m. för att automatiskt ta bort berörda paneler.</p>
            )}

            {obstacles.map(obs => {
              const label = OBSTACLE_TYPES.find(t => t.value === obs.type)?.label || obs.type;
              const blocked = panels.filter(p => panelOverlapsObstacle(p.row, p.col, panelW_m, panelH_m, [obs])).length;
              return (
                <div key={obs.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      Position: {obs.x}×{obs.y} m · Storlek: {obs.width}×{obs.height} m
                      {blocked > 0 && <span className="text-red-600 ml-2">· {blocked} panel{blocked > 1 ? 'er' : ''} blockerad{blocked > 1 ? 'e' : ''}</span>}
                    </p>
                  </div>
                  <button onClick={() => removeObstacle(obs.id)} className="text-muted-foreground hover:text-red-500 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Panel grid */}
      {panels.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
              Panellayout — klicka för att ta bort enskild panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol}, minmax(40px, 1fr))`, gap: 3 }}>
                {Array.from({ length: maxRow }, (_, r) =>
                  Array.from({ length: maxCol }, (_, c) => {
                    const panel = panelMap[`${r}-${c}`];
                    const isBlocked = panel && !activeIds.has(panel.id);
                    return (
                      <div key={`${r}-${c}`} style={{ aspectRatio: `${sp?.width_mm || 100}/${sp?.height_mm || 170}` }}>
                        {panel ? (
                          <div
                            onClick={() => !isBlocked && removePanel(panel.id)}
                            title={isBlocked ? 'Blockerad av hinder' : `Rad ${r + 1}, Kol ${c + 1} — klicka för att ta bort`}
                            style={{
                              width: '100%', height: '100%', borderRadius: 3, position: 'relative', cursor: isBlocked ? 'not-allowed' : 'pointer',
                              background: isBlocked ? '#7f1d1d' : 'linear-gradient(135deg, #1a2540 0%, #1e3560 100%)',
                              border: isBlocked ? '1px solid #ef4444' : '1px solid #3a5090',
                              opacity: isBlocked ? 0.7 : 1,
                            }}
                          >
                            {isBlocked ? (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle style={{ width: '40%', height: '40%', color: '#fca5a5' }} />
                              </div>
                            ) : (
                              <>
                                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                                  <line x1="33%" y1="0" x2="33%" y2="100%" stroke="#2a4070" strokeWidth="0.5" />
                                  <line x1="66%" y1="0" x2="66%" y2="100%" stroke="#2a4070" strokeWidth="0.5" />
                                  <line x1="0" y1="25%" x2="100%" y2="25%" stroke="#2a4070" strokeWidth="0.5" />
                                  <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#2a4070" strokeWidth="0.5" />
                                  <line x1="0" y1="75%" x2="100%" y2="75%" stroke="#2a4070" strokeWidth="0.5" />
                                </svg>
                                <div style={{
                                  position: 'absolute', top: 1, right: 1,
                                  background: 'rgba(239,68,68,0.85)', borderRadius: '50%',
                                  width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 9, color: 'white', fontWeight: 'bold',
                                }}>×</div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            width: '100%', height: '100%', background: 'hsl(var(--muted))',
                            borderRadius: 3, border: '1px dashed hsl(var(--border))', opacity: 0.4,
                          }} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, background: '#1e3560', border: '1px solid #3a5090', borderRadius: 2, display: 'inline-block' }} /> Aktiv panel</span>
              <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 2, display: 'inline-block' }} /> Blockerad av hinder</span>
              <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, background: 'hsl(var(--muted))', border: '1px dashed hsl(var(--border))', borderRadius: 2, display: 'inline-block' }} /> Borttagen</span>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara layout'}
              </Button>
              <Button variant="ghost" className="text-destructive hover:text-destructive gap-1"
                onClick={() => { setPanels([]); setObstacles([]); setShowAddRoof(true); }}>
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