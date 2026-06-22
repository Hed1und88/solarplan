import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ToggleLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildProductDescription } from '@/lib/productDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMPTY_FORM = {
  category: 'brytare',
  name: '',
  brand: '',
  model: '',
  price: '',
  width_mm: 140,
  height_mm: 200,
  depth_mm: 90,
};

export default function ElectricalProductQuickAdd() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const setCategory = category => {
    setForm(current => ({
      ...current,
      category,
      width_mm: category === 'elcentral' ? 600 : 140,
      height_mm: category === 'elcentral' ? 800 : 200,
      depth_mm: category === 'elcentral' ? 180 : 90,
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMessage('Produktnamn krävs.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await base44.entities.Product.create({
        category: form.category,
        name: form.name.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        price: Number(form.price) || 0,
        unit: 'st',
        width_mm: Number(form.width_mm) || undefined,
        height_mm: Number(form.height_mm) || undefined,
        is_active: true,
        description: buildProductDescription('', {
          depth_mm: Number(form.depth_mm) || undefined,
          installation_location: 'Teknikrum',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['products-battery-room-v3'] });
      await queryClient.invalidateQueries({ queryKey: ['products-all'] });
      setMessage(`${form.category === 'elcentral' ? 'Elcentral' : 'Brytare'} tillagd i produktsortimentet.`);
      setForm(current => ({ ...EMPTY_FORM, category: current.category }));
    } catch (error) {
      setMessage(error?.message || 'Produkten kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-900">Brytare och elcentraler</span>
          <span className="block text-xs text-slate-500">Lägg in produkterna i sortimentet så blir de valbara i rumsplaneringen.</span>
        </span>
        <Plus className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-[180px_1fr_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Produkttyp</label>
              <Select value={form.category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brytare"><span className="inline-flex items-center gap-2"><ToggleLeft className="h-4 w-4" />Brytare</span></SelectItem>
                  <SelectItem value="elcentral"><span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" />Elcentral</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Produktnamn</label><Input value={form.name} onChange={event => set('name', event.target.value)} placeholder="T.ex. Hager säkerhetsbrytare" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Pris</label><Input type="number" value={form.price} onChange={event => set('price', event.target.value)} placeholder="0" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Varumärke</label><Input value={form.brand} onChange={event => set('brand', event.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Modell</label><Input value={form.model} onChange={event => set('model', event.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Bredd (mm)</label><Input type="number" value={form.width_mm} onChange={event => set('width_mm', event.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Höjd (mm)</label><Input type="number" value={form.height_mm} onChange={event => set('height_mm', event.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Djup (mm)</label><Input type="number" value={form.depth_mm} onChange={event => set('depth_mm', event.target.value)} /></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-xs ${message.includes('tillagd') ? 'text-emerald-700' : 'text-amber-700'}`}>{message}</p>
            <Button onClick={save} disabled={saving} className="gap-2"><Plus className="h-4 w-4" />{saving ? 'Sparar...' : 'Lägg till i produktsortimentet'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
