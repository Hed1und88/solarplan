import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import StringDrawingCanvas from './StringDrawingCanvas';

const STRING_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#e879f9'];
const STRING_NAMES = Array.from({ length: 10 }, (_, i) => `Slinga ${i + 1}`);

// Tolerance for measured vs expected (±10%)
const TOLERANCE = 0.10;

function calcExpected(panelCount, product) {
  if (!product || !panelCount) return null;
  const voc = product.voc_v || 40;    // open-circuit voltage per panel
  const isc = product.isc_a || 10;    // short-circuit current
  const pmax = product.power_watts || 400;
  const vmp = product.vmp_v || (voc * 0.8);
  const imp = product.imp_a || (pmax / vmp);
  return {
    voltage: +(voc * panelCount).toFixed(1),
    current: +(isc).toFixed(2),
    power:   +(pmax * panelCount / 1000).toFixed(2), // kW
    vmp:     +(vmp * panelCount).toFixed(1),
    imp:     +(imp).toFixed(2),
  };
}

function statusColor(measured, expected) {
  if (!measured || !expected) return null;
  const m = parseFloat(measured);
  if (isNaN(m)) return null;
  const diff = Math.abs(m - expected) / expected;
  return diff <= TOLERANCE ? 'ok' : 'err';
}

function MeasurementRow({ label, unit, expected, measured, onChange }) {
  const status = statusColor(measured, expected);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground w-20">
        {expected != null ? `${expected} ${unit}` : '—'}
      </span>
      <input
        type="number" step="0.1"
        value={measured}
        onChange={e => onChange(e.target.value)}
        placeholder={`Uppmätt ${unit}`}
        className="w-28 border border-border rounded-lg px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {status === 'ok' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
      {status === 'err' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      {status === 'ok' && <span className="text-xs text-green-600">OK</span>}
      {status === 'err' && (
        <span className="text-xs text-red-500">
          Avvikelse {expected != null ? `(förv. ${expected} ${unit})` : ''}
        </span>
      )}
    </div>
  );
}

function StringCard({ str, onUpdate, onDelete, onSelect, isActive, selectedProduct }) {
  const [open, setOpen] = useState(false);
  const exp = calcExpected(str.panel_count, selectedProduct);

  const hasData = str.points && str.points.length >= 2;
  const allMeasured = str.meas_v && str.meas_i;
  const anyErr = [
    statusColor(str.meas_v, exp?.vmp),
    statusColor(str.meas_i, exp?.imp),
    statusColor(str.meas_w, exp?.power != null ? exp.power * 1000 : null),
  ].includes('err');
  const allOk = allMeasured && !anyErr;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isActive ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isActive ? 'bg-primary/5' : 'bg-card hover:bg-muted/40'}`}
        onClick={() => { onSelect(); setOpen(o => !o); }}
      >
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: str.color }} />
        <span className="font-medium text-sm flex-1">{str.name}</span>
        {hasData && <span className="text-xs text-muted-foreground">{str.points.length} punkter</span>}
        {allOk && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {anyErr && <XCircle className="w-4 h-4 text-red-500" />}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3 bg-card border-t border-border">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Namn</label>
            <select
              value={str.name}
              onChange={e => onUpdate({ name: e.target.value })}
              className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background w-full focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STRING_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Panel count */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Antal paneler i slingan</label>
            <input
              type="number" min="1" step="1"
              value={str.panel_count || ''}
              onChange={e => onUpdate({ panel_count: parseInt(e.target.value) || null })}
              placeholder="t.ex. 12"
              className="w-32 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Expected values */}
          {exp && str.panel_count && (
            <div className="bg-muted/50 rounded-lg p-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Förväntade värden ({str.panel_count} paneler)</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">Voc: </span><strong>{exp.voltage} V</strong></div>
                <div><span className="text-muted-foreground">Isc: </span><strong>{exp.current} A</strong></div>
                <div><span className="text-muted-foreground">Pmax: </span><strong>{(exp.power * 1000).toFixed(0)} W</strong></div>
                <div><span className="text-muted-foreground">Vmp: </span><strong>{exp.vmp} V</strong></div>
                <div><span className="text-muted-foreground">Imp: </span><strong>{exp.imp} A</strong></div>
              </div>
            </div>
          )}

          {/* Measurements */}
          {str.panel_count && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Uppmätta värden</p>
              <MeasurementRow
                label="Spänning Vmp"
                unit="V"
                expected={exp?.vmp}
                measured={str.meas_v || ''}
                onChange={v => onUpdate({ meas_v: v })}
              />
              <MeasurementRow
                label="Ström Imp"
                unit="A"
                expected={exp?.imp}
                measured={str.meas_i || ''}
                onChange={v => onUpdate({ meas_i: v })}
              />
              <MeasurementRow
                label="Effekt"
                unit="W"
                expected={exp != null ? +(exp.power * 1000).toFixed(0) : null}
                measured={str.meas_w || ''}
                onChange={v => onUpdate({ meas_w: v })}
              />
            </div>
          )}

          {/* Draw instruction */}
          <p className="text-xs text-muted-foreground">
            {hasData
              ? `✓ Slingan är ritad (${str.points.length} punkter). Välj slingan och håll 2 sek för att rita om.`
              : 'Välj slingan (klicka på raden) och håll sedan 2 sek på bilden för att börja rita.'}
          </p>

          <button
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
            onClick={() => onDelete()}
          >
            <Trash2 className="w-3.5 h-3.5" /> Ta bort slinga
          </button>
        </div>
      )}
    </div>
  );
}

export default function StringMarkingTab({ project, onUpdate, selectedProduct }) {
  const [imageUrl, setImageUrl] = useState(project.existing_installation_image_url || '');
  const [strings, setStrings] = useState(() => {
    try {
      const d = JSON.parse(project.string_layout_data || '[]');
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  });
  const [activeStringId, setActiveStringId] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
  };

  const addString = () => {
    const idx = strings.length;
    const id = Date.now().toString();
    const newStr = {
      id,
      name: STRING_NAMES[idx % 10],
      color: STRING_COLORS[idx % STRING_COLORS.length],
      points: [],
      panel_count: null,
      meas_v: '', meas_i: '', meas_w: '',
    };
    setStrings(prev => [...prev, newStr]);
    setActiveStringId(id);
  };

  const updateString = (id, data) => {
    setStrings(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const deleteString = (id) => {
    setStrings(prev => prev.filter(s => s.id !== id));
    if (activeStringId === id) setActiveStringId(null);
  };

  // When canvas finishes a drawing, update the active string's points
  const handleStringsChange = (updater) => {
    setStrings(updater);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      existing_installation_image_url: imageUrl,
      string_layout_data: JSON.stringify(strings),
    });
    setSaving(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Slingmarkering</CardTitle>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
          <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <StringDrawingCanvas
          imageUrl={imageUrl}
          strings={strings}
          onStringsChange={handleStringsChange}
          onImageUpload={handleImageUpload}
          activeStringId={activeStringId}
        />

        {/* String list */}
        {imageUrl && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Slingor ({strings.length})</p>
              <Button size="sm" variant="outline" className="gap-1" onClick={addString}>
                <Plus className="w-3.5 h-3.5" /> Ny slinga
              </Button>
            </div>
            {strings.length === 0 && (
              <p className="text-xs text-muted-foreground">Lägg till en slinga för att börja markera.</p>
            )}
            {strings.map(str => (
              <StringCard
                key={str.id}
                str={str}
                onUpdate={data => updateString(str.id, data)}
                onDelete={() => deleteString(str.id)}
                onSelect={() => setActiveStringId(str.id === activeStringId ? null : str.id)}
                isActive={activeStringId === str.id}
                selectedProduct={selectedProduct}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}