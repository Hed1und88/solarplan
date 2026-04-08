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
  const voc = product.voc_v;
  const isc = product.isc_a;
  const pmax = product.power_watts || 400;
  const vmp = product.vmp_v;
  const imp = product.imp_a;
  // Only calculate if we have the data from the product
  const hasElec = voc && isc && vmp && imp;
  return {
    voc:     voc ? +(voc * panelCount).toFixed(1) : null,
    isc:     isc ? +(isc).toFixed(2) : null,
    power:   +(pmax * panelCount / 1000).toFixed(2),
    vmp:     vmp ? +(vmp * panelCount).toFixed(1) : null,
    imp:     imp ? +(imp).toFixed(2) : null,
    hasElec,
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
  const anyErr = [
    str.meas_voc && exp?.voc ? statusColor(str.meas_voc, exp.voc) : null,
    str.meas_isc && exp?.isc ? statusColor(str.meas_isc, exp.isc) : null,
    str.meas_vmp && exp?.vmp ? statusColor(str.meas_vmp, exp.vmp) : null,
    str.meas_imp && exp?.imp ? statusColor(str.meas_imp, exp.imp) : null,
  ].includes('err');
  const hasMeasurements = str.meas_voc || str.meas_isc || str.meas_vmp || str.meas_imp;
  const allOk = hasMeasurements && !anyErr;

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

          {/* Product info */}
          {!selectedProduct && str.panel_count && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              ⚠️ Ingen solpanel är vald för projektet — gå till fliken Paneler och välj en panel för att få förväntade värden.
            </div>
          )}

          {/* Expected values */}
          {exp && str.panel_count && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground mb-2">
                Förväntade värden — {str.panel_count} × {selectedProduct?.name || 'panel'} ({selectedProduct?.power_watts || '?'}W)
              </p>
              {!exp.hasElec && (
                <p className="text-xs text-amber-600">⚠️ Produkten saknar elektriska data (Voc, Isc, Vmp, Imp). Lägg till dem under Produkter.</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {exp.voc != null && <div><span className="text-muted-foreground">Voc (seriekoppl.): </span><strong>{exp.voc} V</strong></div>}
                {exp.isc != null && <div><span className="text-muted-foreground">Isc: </span><strong>{exp.isc} A</strong></div>}
                {exp.vmp != null && <div><span className="text-muted-foreground">Vmp (seriekoppl.): </span><strong>{exp.vmp} V</strong></div>}
                {exp.imp != null && <div><span className="text-muted-foreground">Imp: </span><strong>{exp.imp} A</strong></div>}
                <div><span className="text-muted-foreground">Pmax: </span><strong>{(exp.power * 1000).toFixed(0)} W</strong></div>
              </div>
            </div>
          )}

          {/* Measurements */}
          {str.panel_count && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Uppmätta värden (skriv in vad du mätt)</p>
              <MeasurementRow
                label="Voc (mätt)"
                unit="V"
                expected={exp?.voc}
                measured={str.meas_voc || ''}
                onChange={v => onUpdate({ meas_voc: v })}
              />
              <MeasurementRow
                label="Isc (mätt)"
                unit="A"
                expected={exp?.isc}
                measured={str.meas_isc || ''}
                onChange={v => onUpdate({ meas_isc: v })}
              />
              <MeasurementRow
                label="Vmp (mätt)"
                unit="V"
                expected={exp?.vmp}
                measured={str.meas_vmp || ''}
                onChange={v => onUpdate({ meas_vmp: v })}
              />
              <MeasurementRow
                label="Imp (mätt)"
                unit="A"
                expected={exp?.imp}
                measured={str.meas_imp || ''}
                onChange={v => onUpdate({ meas_imp: v })}
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
      meas_voc: '', meas_isc: '', meas_vmp: '', meas_imp: '',
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