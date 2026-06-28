import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { filterVisibleProducts } from '@/lib/tenantQueries';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Plus, Zap, LayoutGrid, AlertTriangle, MousePointer, Eraser, Info } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
function parseLayoutData(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    if (Array.isArray(d)) return { panels: d, roofWidth: '', roofHeight: '', obstacles: [] };
    return { panels: d.panels || [], roofWidth: d.roofWidth || '', roofHeight: d.roofHeight || '', obstacles: d.obstacles || [] };
  } catch { return { panels: [], roofWidth: '', roofHeight: '', obstacles: [] }; }
}

function panelOverlapsObstacle(row, col, panelW, panelH, obstacles) {
  const px0 = col * panelW, py0 = row * panelH;
  const px1 = px0 + panelW, py1 = py0 + panelH;
  return obstacles.some(obs => {
    const ox0 = parseFloat(obs.x) || 0, oy0 = parseFloat(obs.y) || 0;
    const ox1 = ox0 + (parseFloat(obs.width) || 0), oy1 = oy0 + (parseFloat(obs.height) || 0);
    return px0 < ox1 && px1 > ox0 && py0 < oy1 && py1 > oy0;
  });
}

const OBSTACLE_TYPES = [
  { value: 'skorsten', label: 'Skorsten' },
  { value: 'takfonster', label: 'Takfönster' },
  { value: 'ventilation', label: 'Ventilationsrör' },
  { value: 'annat', label: 'Annat' },
];

// ─── Canvas grid ──────────────────────────────────────────────────────────────
function RoofCanvas({ cols, rows, panelW_m, panelH_m, placedSet, obstacles, onCellsChange, selectedProduct }) {
  const canvasRef = useRef(null);
  const isDragging = useRef(false);
  const dragMode = useRef(null); // 'place' or 'remove'
  const [hoveredCell, setHoveredCell] = useState(null);

  const CANVAS_MAX_W = 700;
  const CANVAS_MAX_H = 480;
  const cellW = Math.min(Math.floor(CANVAS_MAX_W / cols), Math.floor(CANVAS_MAX_H / rows), 80);
  const cellH = Math.round(cellW * (panelH_m / panelW_m));
  const canvasW = cols * cellW;
  const canvasH = rows * cellH;

  // Obstacle rects in cell-space
  const obstacleRects = useMemo(() => obstacles.map(obs => {
    const ox = parseFloat(obs.x) || 0, oy = parseFloat(obs.y) || 0;
    const ow = parseFloat(obs.width) || 0, oh = parseFloat(obs.height) || 0;
    return { obs, px: ox / panelW_m * cellW, py: oy / panelH_m * cellH, pw: ow / panelW_m * cellW, ph: oh / panelH_m * cellH };
  }), [obstacles, panelW_m, panelH_m, cellW, cellH]);

  const cellFromEvent = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left, y = clientY - rect.top;
    const col = Math.floor(x / cellW), row = Math.floor(y / cellH);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return { row, col };
  }, [cellW, cellH, cols, rows]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (!cell) return;
    const key = `${cell.row}-${cell.col}`;
    if (panelOverlapsObstacle(cell.row, cell.col, panelW_m, panelH_m, obstacles)) return;
    isDragging.current = true;
    dragMode.current = placedSet.has(key) ? 'remove' : 'place';
    onCellsChange(cell, dragMode.current);
  }, [cellFromEvent, placedSet, obstacles, panelW_m, panelH_m, onCellsChange]);

  const handlePointerMove = useCallback((e) => {
    const cell = cellFromEvent(e);
    setHoveredCell(cell);
    if (!isDragging.current || !cell) return;
    if (panelOverlapsObstacle(cell.row, cell.col, panelW_m, panelH_m, obstacles)) return;
    onCellsChange(cell, dragMode.current);
  }, [cellFromEvent, obstacles, panelW_m, panelH_m, onCellsChange]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    dragMode.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);
    return () => { window.removeEventListener('mouseup', handlePointerUp); window.removeEventListener('touchend', handlePointerUp); };
  }, [handlePointerUp]);

  return (
    <div className="overflow-auto rounded-xl border border-border bg-slate-100" style={{ maxWidth: '100%' }}>
      <div
        ref={canvasRef}
        className="relative select-none"
        style={{ width: canvasW, height: canvasH, cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
      >
        {/* Background grid cells */}
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const key = `${r}-${c}`;
            const blocked = panelOverlapsObstacle(r, c, panelW_m, panelH_m, obstacles);
            const placed = placedSet.has(key);
            const hovered = hoveredCell?.row === r && hoveredCell?.col === c && !blocked;
            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  left: c * cellW, top: r * cellH,
                  width: cellW - 1, height: cellH - 1,
                  borderRadius: 2,
                  background: blocked
                    ? 'rgba(239,68,68,0.15)'
                    : placed
                      ? 'linear-gradient(135deg,#1a2540 0%,#1e3560 100%)'
                      : hovered
                        ? 'rgba(249,115,22,0.15)'
                        : 'rgba(255,255,255,0.6)',
                  border: blocked
                    ? '1px solid rgba(239,68,68,0.4)'
                    : placed
                      ? '1px solid #3a5090'
                      : '1px solid rgba(148,163,184,0.4)',
                  boxSizing: 'border-box',
                  transition: 'background 0.05s',
                }}
              >
                {placed && !blocked && cellW >= 20 && (
                  <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
                    <line x1="33%" y1="0" x2="33%" y2="100%" stroke="#3a5090" strokeWidth="0.5" />
                    <line x1="66%" y1="0" x2="66%" y2="100%" stroke="#3a5090" strokeWidth="0.5" />
                    <line x1="0" y1="33%" x2="100%" y2="33%" stroke="#3a5090" strokeWidth="0.5" />
                    <line x1="0" y1="66%" x2="100%" y2="66%" stroke="#3a5090" strokeWidth="0.5" />
                  </svg>
                )}
              </div>
            );
          })
        )}

        {/* Obstacle overlays */}
        {obstacleRects.map(({ obs, px, py, pw, ph }) => (
          <div key={obs.id} style={{
            position: 'absolute', left: px, top: py, width: pw, height: ph,
            background: 'rgba(239,68,68,0.35)', border: '2px solid #ef4444',
            borderRadius: 3, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <AlertTriangle style={{ width: '40%', height: '40%', color: '#ef4444', opacity: 0.8 }} />
          </div>
        ))}

        {/* Row/col ruler lines */}
        {Array.from({ length: cols + 1 }, (_, c) => (
          <div key={`vc${c}`} style={{ position: 'absolute', left: c * cellW, top: 0, width: 1, height: canvasH, background: 'rgba(148,163,184,0.3)', pointerEvents: 'none' }} />
        ))}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <div key={`hr${r}`} style={{ position: 'absolute', left: 0, top: r * cellH, width: canvasW, height: 1, background: 'rgba(148,163,184,0.3)', pointerEvents: 'none' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PanelPlacementTab({ project, onUpdate }) {
  const saved = parseLayoutData(project.panel_layout_data);

  const [roofWidth, setRoofWidth] = useState(saved.roofWidth ? String(saved.roofWidth) : '');
  const [roofHeight, setRoofHeight] = useState(saved.roofHeight ? String(saved.roofHeight) : '');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [placedSet, setPlacedSet] = useState(() => {
    const s = new Set();
    (saved.panels || []).forEach(p => s.add(`${p.row}-${p.col}`));
    return s;
  });
  const [obstacles, setObstacles] = useState(saved.obstacles || []);
  const [saving, setSaving] = useState(false);
  const [showObsForm, setShowObsForm] = useState(false);
  const [newObs, setNewObs] = useState({ type: 'skorsten', x: '', y: '', width: '', height: '' });
  const [showSetup, setShowSetup] = useState(!saved.roofWidth || !saved.roofHeight);

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => filterVisibleProducts({ category: 'solpanel' }),
  });

  // Determine active product
  const activeProduct = products.find(p => p.id === selectedPanelId)
    || (saved.panels?.[0]?.product_id ? products.find(p => p.id === saved.panels[0].product_id) : null)
    || products[0]
    || null;

  const panelW_m = (activeProduct?.width_mm || 1000) / 1000;
  const panelH_m = (activeProduct?.height_mm || 1700) / 1000;

  const roofW = parseFloat(roofWidth) || 0;
  const roofH = parseFloat(roofHeight) || 0;
  const cols = roofW > 0 ? Math.floor(roofW / panelW_m) : 0;
  const rows = roofH > 0 ? Math.floor(roofH / panelH_m) : 0;

  // Build panel list from placedSet (filter blocked)
  const buildPanelList = useCallback((set, obs) => {
    const list = [];
    set.forEach(key => {
      const [r, c] = key.split('-').map(Number);
      if (!panelOverlapsObstacle(r, c, panelW_m, panelH_m, obs)) {
        list.push({
          id: `panel-${r}-${c}`,
          row: r, col: c,
          product_id: activeProduct?.id || '',
          product_name: activeProduct?.name || '',
          power_watts: activeProduct?.power_watts || 400,
          width_mm: activeProduct?.width_mm,
          height_mm: activeProduct?.height_mm,
        });
      }
    });
    return list;
  }, [panelW_m, panelH_m, activeProduct]);

  // Count active (non-blocked) panels
  const activePanels = useMemo(() => buildPanelList(placedSet, obstacles), [placedSet, obstacles, buildPanelList]);
  const totalPower = activePanels.reduce((s, p) => s + (p.power_watts || 400), 0);

  // Handle cell toggle from canvas
  const handleCellsChange = useCallback((cell, mode) => {
    const key = `${cell.row}-${cell.col}`;
    setPlacedSet(prev => {
      const next = new Set(prev);
      if (mode === 'place') next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Auto-fill entire roof
  const fillRoof = () => {
    const next = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!panelOverlapsObstacle(r, c, panelW_m, panelH_m, obstacles)) {
          next.add(`${r}-${c}`);
        }
      }
    }
    setPlacedSet(next);
  };

  const clearRoof = () => setPlacedSet(new Set());

  // Save
  const handleSave = async () => {
    setSaving(true);
    const panels = buildPanelList(placedSet, obstacles);
    await onUpdate({ panel_layout_data: JSON.stringify({ panels, roofWidth: roofW, roofHeight: roofH, obstacles }) });
    setSaving(false);
  };

  // Auto-save on obstacle changes
  useEffect(() => {
    if (!roofW || !roofH || !activeProduct) return;
    const panels = buildPanelList(placedSet, obstacles);
    onUpdate({ panel_layout_data: JSON.stringify({ panels, roofWidth: roofW, roofHeight: roofH, obstacles }) });
  }, [obstacles]);

  // Obstacle management
  const addObstacle = () => {
    if (!newObs.x || !newObs.y || !newObs.width || !newObs.height) return;
    setObstacles(prev => [...prev, { ...newObs, id: `obs-${Date.now()}` }]);
    setNewObs({ type: 'skorsten', x: '', y: '', width: '', height: '' });
    setShowObsForm(false);
  };
  const removeObstacle = (id) => setObstacles(prev => prev.filter(o => o.id !== id));

  const canRender = cols > 0 && rows > 0 && activeProduct;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <LayoutGrid className="w-5 h-5 text-primary shrink-0" />
          <span className="font-semibold text-sm">Panelplacering</span>

          <Select value={selectedPanelId || (activeProduct?.id || '')} onValueChange={setSelectedPanelId}>
            <SelectTrigger className="w-52 h-8 text-xs">
              <SelectValue placeholder="Välj panel..." />
            </SelectTrigger>
            <SelectContent>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name} – {p.power_watts}W
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowSetup(v => !v)}>
            Takmått
          </Button>

          {canRender && (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fillRoof}>
                <Plus className="w-3.5 h-3.5" /> Fyll tak
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={clearRoof}>
                <Eraser className="w-3.5 h-3.5" /> Rensa
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {activePanels.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-primary/20">
                <Zap className="w-3 h-3 mr-1" />{activePanels.length} paneler · {(totalPower / 1000).toFixed(2)} kWp
              </Badge>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 gap-1">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Roof setup */}
      {showSetup && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Takytemått</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Bredd (m)</label>
              <input type="number" min="1" step="0.1" value={roofWidth} onChange={e => setRoofWidth(e.target.value)}
                placeholder="t.ex. 8"
                className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Djup (m)</label>
              <input type="number" min="1" step="0.1" value={roofHeight} onChange={e => setRoofHeight(e.target.value)}
                placeholder="t.ex. 5"
                className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {canRender && (
              <p className="text-xs text-green-700 font-medium pb-1.5">
                ✓ {cols} × {rows} = {cols * rows} möjliga panelplatser
              </p>
            )}
            {roofW > 0 && roofH > 0 && !canRender && (
              <p className="text-xs text-red-500 pb-1.5">Takytan är för liten för vald panel.</p>
            )}
            {canRender && (
              <Button size="sm" className="h-8 mb-0.5" onClick={() => setShowSetup(false)}>Stäng</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Canvas editor */}
      {canRender ? (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MousePointer className="w-4 h-4 text-primary" />
              Klicka eller dra på taket för att placera/ta bort paneler
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              {roofWidth} × {roofHeight} m · {activeProduct?.name} ({activeProduct?.width_mm}×{activeProduct?.height_mm} mm)
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <RoofCanvas
              cols={cols}
              rows={rows}
              panelW_m={panelW_m}
              panelH_m={panelH_m}
              placedSet={placedSet}
              obstacles={obstacles}
              onCellsChange={handleCellsChange}
              selectedProduct={activeProduct}
            />
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, background: '#1e3560', border: '1px solid #3a5090', borderRadius: 2, display: 'inline-block' }} />
                Placerad panel
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(148,163,184,0.4)', borderRadius: 2, display: 'inline-block' }} />
                Tom plats
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, background: 'rgba(239,68,68,0.35)', border: '1px solid #ef4444', borderRadius: 2, display: 'inline-block' }} />
                Hinder
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <LayoutGrid className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-4">Ange takmått och välj panel för att starta</p>
            <Button onClick={() => setShowSetup(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Ange takmått
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Obstacles */}
      {canRender && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Hinder på taket
              <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => setShowObsForm(v => !v)}>
                <Plus className="w-3 h-3" /> Lägg till hinder
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showObsForm && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-xs text-amber-700 font-medium">Position och storlek i meter från takytan övre vänstra hörn</p>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Typ</label>
                    <select value={newObs.type} onChange={e => setNewObs(o => ({ ...o, type: e.target.value }))}
                      className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background">
                      {OBSTACLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {[['x', 'X (m)'], ['y', 'Y (m)'], ['width', 'Bredd (m)'], ['height', 'Djup (m)']].map(([key, label]) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                      <input type="number" min="0" step="0.1" value={newObs[key]}
                        onChange={e => setNewObs(o => ({ ...o, [key]: e.target.value }))}
                        placeholder="0.0"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addObstacle}
                    disabled={!newObs.x || !newObs.y || !newObs.width || !newObs.height}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-1">
                    <Plus className="w-3.5 h-3.5" /> Lägg till
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowObsForm(false)}>Avbryt</Button>
                </div>
              </div>
            )}
            {obstacles.length === 0 && !showObsForm && (
              <p className="text-sm text-muted-foreground">Inga hinder. Lägg till skorstenar, takfönster m.m. — de visas direkt i ritningen.</p>
            )}
            {obstacles.map(obs => {
              const label = OBSTACLE_TYPES.find(t => t.value === obs.type)?.label || obs.type;
              const blocked = Array.from(placedSet).filter(key => {
                const [r, c] = key.split('-').map(Number);
                return panelOverlapsObstacle(r, c, panelW_m, panelH_m, [obs]);
              }).length;
              return (
                <div key={obs.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {obs.x}×{obs.y} m · {obs.width}×{obs.height} m
                      {blocked > 0 && <span className="text-red-600 ml-2">· blockerar {blocked} panel{blocked !== 1 ? 'er' : ''}</span>}
                    </p>
                  </div>
                  <button onClick={() => removeObstacle(obs.id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
