import { useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, Trash2, Info, Palette } from 'lucide-react';

const STRING_COLORS = [
  { label: 'Röd', value: '#ef4444' },
  { label: 'Blå', value: '#3b82f6' },
  { label: 'Grön', value: '#22c55e' },
  { label: 'Gul', value: '#eab308' },
  { label: 'Lila', value: '#a855f7' },
  { label: 'Orange', value: '#f97316' },
];

export default function StringEditor({ project, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [strings, setStrings] = useState(() => {
    try { return JSON.parse(project.string_layout_data || '[]'); } catch { return []; }
  });
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [activeStringId, setActiveStringId] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);

  const saveLayout = useCallback(async (data) => {
    setSaving(true);
    await onUpdate({ string_layout_data: JSON.stringify(data) });
    setSaving(false);
  }, [onUpdate]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await onUpdate({ existing_installation_image_url: file_url });
    setUploading(false);
  };

  const addNewString = () => {
    const newString = { id: Date.now().toString(), color: activeColor, label: `Sträng ${strings.length + 1}`, points: [] };
    const updated = [...strings, newString];
    setStrings(updated);
    setActiveStringId(newString.id);
    setDrawing(true);
  };

  const handleImageClick = (e) => {
    if (!activeStringId || !drawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setStrings(prev => {
      const updated = prev.map(s =>
        s.id === activeStringId ? { ...s, points: [...s.points, { x, y }] } : s
      );
      saveLayout(updated);
      return updated;
    });
  };

  const removeString = (id) => {
    const updated = strings.filter(s => s.id !== id);
    setStrings(updated);
    saveLayout(updated);
    if (activeStringId === id) { setActiveStringId(null); setDrawing(false); }
  };

  const clearAll = () => { setStrings([]); saveLayout([]); setActiveStringId(null); setDrawing(false); };
  const finishDrawing = () => setDrawing(false);

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border p-4 flex-shrink-0 bg-card overflow-y-auto">
        <h3 className="font-semibold text-sm mb-3">Slingkoppling</h3>

        {/* Color picker */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Välj slingfärg</p>
          <div className="flex flex-wrap gap-2">
            {STRING_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setActiveColor(c.value)}
                title={c.label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${activeColor === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>

        {/* Strings list */}
        {strings.length > 0 && (
          <div className="space-y-2 mb-4">
            {strings.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all
                  ${activeStringId === s.id ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/40'}`}
                onClick={() => { setActiveStringId(s.id); setDrawing(true); }}
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.points.length} punkter</p>
                </div>
                <button onClick={e => { e.stopPropagation(); removeString(s.id); }} className="p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={addNewString}
            disabled={!project.existing_installation_image_url}
            className="py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            + Ny sträng
          </button>
          {drawing && (
            <button onClick={finishDrawing} className="py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted">
              ✓ Avsluta ritning
            </button>
          )}
          <label className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-medium cursor-pointer hover:bg-muted">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {project.existing_installation_image_url ? 'Byt bild' : 'Ladda upp bild'}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
          {strings.length > 0 && (
            <button onClick={clearAll} className="py-2 rounded-xl border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50">
              Rensa alla
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Klicka "Ny sträng", välj färg och klicka på bilden för att rita slingan. Avsluta när du är klar.
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-muted/30 flex items-center justify-center p-4">
        {!project.existing_installation_image_url ? (
          <label className="flex flex-col items-center justify-center w-full max-w-md h-64 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 bg-card">
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-sm">Ladda upp bild på befintlig anläggning</p>
                <p className="text-xs text-muted-foreground mt-1">Foto på solpanelerna eller kopplingsskåpet</p>
              </>
            )}
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
        ) : (
          <div
            className={`relative rounded-xl overflow-hidden shadow-xl inline-block ${drawing ? 'cursor-crosshair' : 'cursor-default'}`}
            onClick={handleImageClick}
          >
            <img
              ref={imgRef}
              src={project.existing_installation_image_url}
              alt="Anläggning"
              className="block max-w-full max-h-[calc(100vh-16rem)] object-contain select-none"
              draggable={false}
            />
            {/* SVG overlay for strings */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {strings.map(s => (
                <g key={s.id}>
                  {s.points.length > 1 && (
                    <polyline
                      points={s.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.9"
                    />
                  )}
                  {s.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? '1.5' : '0.8'} fill={s.color} />
                  ))}
                </g>
              ))}
            </svg>

            {drawing && activeStringId && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
                Klicka för att lägga till punkter på slingan
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}