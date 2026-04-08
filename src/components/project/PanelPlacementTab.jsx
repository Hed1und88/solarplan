import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Camera, Upload, Pencil } from 'lucide-react';
import RoofEditor from './RoofEditor';
import { useRef } from 'react';

// Step indicator
function Step({ n, label, done, active }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? 'text-foreground font-semibold' : done ? 'text-green-600' : 'text-muted-foreground'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
        ${done ? 'bg-green-500 text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
        {done ? '✓' : n}
      </div>
      {label}
    </div>
  );
}

function parseLayoutData(raw) {
  try {
    const d = JSON.parse(raw || '{}');
    if (Array.isArray(d)) return { panels: d, obstacles: [], polygon: [], edgeLengths: {} };
    return {
      panels: d.panels || [],
      obstacles: d.obstacles || [],
      polygon: d.polygon || [],
      edgeLengths: d.edgeLengths || {},
    };
  } catch { return { panels: [], obstacles: [], polygon: [], edgeLengths: {} }; }
}

// Preview of panels over image
function PreviewPanel({ panel }) {
  return (
    <div style={{
      position: 'absolute',
      left: `${panel.x}%`, top: `${panel.y}%`,
      width: `${panel.w_pct || 8}%`, height: `${panel.h_pct || 13}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      background: '#1a2540',
      border: '1px solid #3a5090',
      opacity: 0.85,
    }} />
  );
}

export default function PanelPlacementTab({ project, onUpdate }) {
  const saved = parseLayoutData(project.panel_layout_data);
  const [imageUrl, setImageUrl] = useState(project.roof_image_url || '');
  const [panels, setPanels] = useState(saved.panels);
  const [obstacles, setObstacles] = useState(saved.obstacles);
  const [polygon, setPolygon] = useState(saved.polygon);
  const [edgeLengths, setEdgeLengths] = useState(saved.edgeLengths);
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef(null);
  const camRef = useRef(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const selectedProduct = products.find(p => p.id === selectedPanelId) || null;

  // Derived state for steps
  const hasImage = !!imageUrl;
  const hasRoofArea = polygon.length >= 3;
  const hasEdgeLengths = hasRoofArea && polygon.every((_, i) => parseFloat(edgeLengths[i]) > 0);
  const hasPanels = panels.length > 0;

  // Step to show as active
  const activeStep = !hasImage ? 1 : !hasRoofArea ? 2 : !hasEdgeLengths ? 3 : !selectedPanelId ? 4 : !hasPanels ? 5 : 6;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      // Reset dependent state
      setPanels([]); setPolygon([]); setEdgeLengths({});
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      roof_image_url: imageUrl,
      panel_layout_data: JSON.stringify({ panels, obstacles, polygon, edgeLengths }),
    });
    setSaving(false);
  };

  const totalPower = panels.reduce((s, p) => s + (p.power_watts || 400), 0);

  return (
    <div className="space-y-4">
      {/* Step overview */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Step n={1} label="Ladda upp foto" done={hasImage} active={activeStep === 1} />
            <Step n={2} label="Rita takyta" done={hasRoofArea} active={activeStep === 2} />
            <Step n={3} label="Ange mått" done={hasEdgeLengths} active={activeStep === 3} />
            <Step n={4} label="Välj solpanel" done={!!selectedPanelId} active={activeStep === 4} />
            <Step n={5} label="Placera paneler" done={hasPanels} active={activeStep === 5} />
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload photo */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasImage ? 'bg-green-500 text-white' : 'bg-primary text-white'}`}>
              {hasImage ? '✓' : '1'}
            </span>
            Ladda upp foto på taket
          </CardTitle>
        </CardHeader>
        <CardContent>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />

          {!hasImage ? (
            <div className="border-2 border-dashed rounded-xl p-10 text-center bg-muted/20">
              <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Ta ett foto eller välj från galleriet</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Välj från galleri
                </Button>
                <Button className="gap-2" onClick={() => camRef.current?.click()}>
                  <Camera className="w-4 h-4" /> Ta foto
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="relative rounded-xl overflow-hidden shadow cursor-pointer"
                onClick={() => setEditorOpen(true)}
              >
                <img src={imageUrl} alt="Tak" className="w-full h-auto block max-h-64 object-cover" />
                {panels.map(p => <PreviewPanel key={p.id} panel={p} />)}
                {/* Polygon preview */}
                {polygon.length >= 3 && (
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                    <polygon
                      points={polygon.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="0.5"
                    />
                  </svg>
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition flex items-center justify-center">
                  <span className="bg-black/60 text-white text-sm px-3 py-1.5 rounded-full opacity-0 hover:opacity-100 transition">
                    Klicka för att redigera
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Byt bild
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => camRef.current?.click()}>
                  <Camera className="w-3.5 h-3.5" /> Ta nytt foto
                </Button>
                <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-white ml-auto" onClick={() => setEditorOpen(true)}>
                  <Pencil className="w-3.5 h-3.5" /> Öppna takplanerare
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steps 2–5: open editor */}
      {hasImage && !hasPanels && (
        <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium text-blue-900 text-sm">
                {!hasRoofArea
                  ? '🖊️ Steg 2: Rita takytans kontur i planeraren'
                  : !hasEdgeLengths
                  ? '📏 Steg 3: Ange sidlängderna (meter) i planeraren'
                  : !selectedPanelId
                  ? '☀️ Steg 4: Välj solpanel nedan'
                  : '⚡ Steg 5: Fyll takyta med paneler i planeraren'}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                {!hasRoofArea
                  ? 'Håll 2 sek på bilden → klicka runt taket → klicka på startpunkten för att stänga.'
                  : !hasEdgeLengths
                  ? 'Ange längden på varje sida i metrerna som visas under bilden.'
                  : !selectedPanelId
                  ? 'Välj panel i listan nedan, sedan öppna planeraren och klicka "Fyll med paneler".'
                  : 'Klicka "Öppna takplanerare" → "Fyll med paneler" — panelerna placeras automatiskt inuti taklinjen.'}
              </p>
            </div>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0" onClick={() => setEditorOpen(true)}>
              <Pencil className="w-4 h-4" /> Öppna takplanerare
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Select panel (shown after roof area) */}
      {hasRoofArea && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedPanelId ? 'bg-green-500 text-white' : 'bg-primary text-white'}`}>
                {selectedPanelId ? '✓' : '4'}
              </span>
              Välj solpanel
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Summary + Save */}
      {hasPanels && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Sammanfattning</CardTitle>
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara layout'}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline">{panels.length} paneler</Badge>
            {totalPower > 0 && (
              <Badge className="bg-primary/10 text-primary border-primary/20">
                {(totalPower / 1000).toFixed(2)} kWp
              </Badge>
            )}
            {selectedProduct && (
              <Badge variant="outline">{selectedProduct.brand || selectedProduct.name}</Badge>
            )}
            <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={() => setEditorOpen(true)}>
              <Pencil className="w-3.5 h-3.5" /> Redigera
            </Button>
            <Button
              size="sm" variant="ghost"
              className="text-destructive hover:text-destructive gap-1"
              onClick={() => { setPanels([]); setPolygon([]); setEdgeLengths({}); }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Rensa
            </Button>
          </CardContent>
        </Card>
      )}

      {/* RoofEditor modal */}
      {editorOpen && (
        <RoofEditor
          imageUrl={imageUrl}
          panels={panels}
          onPanelsChange={setPanels}
          obstacles={obstacles}
          onObstaclesChange={setObstacles}
          polygon={polygon}
          onPolygonChange={setPolygon}
          edgeLengths={edgeLengths}
          onEdgeLengthsChange={setEdgeLengths}
          selectedProduct={selectedProduct}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}