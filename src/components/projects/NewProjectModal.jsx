import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Loader2 } from 'lucide-react';

export default function NewProjectModal({ onSave, onClose, initialValues = {} }) {
  const [form, setForm] = useState({ name: '', customer_name: '', address: '', status: 'planering', ...(initialValues || {}) });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Project.create(form);
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Nytt projekt</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Projektnamn *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="T.ex. Villa Andersson" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Kundnamn</label>
            <input type="text" value={form.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="T.ex. Anna Andersson" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Adress</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} placeholder="T.ex. Solgatan 12, Stockholm" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="planering">Planering</option>
              <option value="projektering">Projektering</option>
              <option value="offert">Offert</option>
              <option value="installation">Installation</option>
              <option value="klart">Klart</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
          <button onClick={handleSave} disabled={saving || !form.name} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Skapa projekt
          </button>
        </div>
      </div>
    </div>
  );
}
