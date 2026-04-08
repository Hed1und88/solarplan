import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const categories = [
  { value: 'solpanel', label: 'Solpanel' },
  { value: 'batteri', label: 'Batteri' },
  { value: 'vaxelriktare', label: 'Växelriktare' },
  { value: 'optimerare', label: 'Optimerare' },
  { value: 'kabel', label: 'Kabel' },
  { value: 'montagesystem', label: 'Montagesystem' },
  { value: 'ovrigt', label: 'Övrigt' },
];

export default function ProductForm({ product, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'solpanel',
    brand: product?.brand || '',
    model: product?.model || '',
    power_watts: product?.power_watts || '',
    capacity_kwh: product?.capacity_kwh || '',
    price: product?.price || '',
    unit: product?.unit || 'st',
    width_mm: product?.width_mm || '',
    height_mm: product?.height_mm || '',
    description: product?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      power_watts: form.power_watts ? Number(form.power_watts) : undefined,
      capacity_kwh: form.capacity_kwh ? Number(form.capacity_kwh) : undefined,
      price: Number(form.price),
      width_mm: form.width_mm ? Number(form.width_mm) : undefined,
      height_mm: form.height_mm ? Number(form.height_mm) : undefined,
    };
    if (product?.id) {
      await base44.entities.Product.update(product.id, data);
    } else {
      await base44.entities.Product.create(data);
    }
    setSaving(false);
    onSaved();
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Produktnamn *</Label>
          <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="T.ex. JA Solar 415W" />
        </div>
        <div>
          <Label>Kategori *</Label>
          <Select value={form.category} onValueChange={v => update('category', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Varumärke</Label>
          <Input value={form.brand} onChange={e => update('brand', e.target.value)} placeholder="T.ex. JA Solar" />
        </div>
        <div>
          <Label>Modell</Label>
          <Input value={form.model} onChange={e => update('model', e.target.value)} placeholder="Modellbeteckning" />
        </div>
        <div>
          <Label>Pris (SEK) *</Label>
          <Input type="number" value={form.price} onChange={e => update('price', e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Enhet</Label>
          <Select value={form.unit} onValueChange={v => update('unit', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="st">Styck</SelectItem>
              <SelectItem value="m">Meter</SelectItem>
              <SelectItem value="set">Set</SelectItem>
              <SelectItem value="paket">Paket</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(form.category === 'solpanel' || form.category === 'vaxelriktare') && (
          <div>
            <Label>Effekt (W)</Label>
            <Input type="number" value={form.power_watts} onChange={e => update('power_watts', e.target.value)} placeholder="0" />
          </div>
        )}
        {form.category === 'batteri' && (
          <>
            <div>
              <Label>Kapacitet (kWh)</Label>
              <Input type="number" value={form.capacity_kwh} onChange={e => update('capacity_kwh', e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Effekt (W)</Label>
              <Input type="number" value={form.power_watts} onChange={e => update('power_watts', e.target.value)} placeholder="0" />
            </div>
          </>
        )}
        {form.category === 'solpanel' && (
          <>
            <div>
              <Label>Bredd (mm)</Label>
              <Input type="number" value={form.width_mm} onChange={e => update('width_mm', e.target.value)} placeholder="1722" />
            </div>
            <div>
              <Label>Höjd (mm)</Label>
              <Input type="number" value={form.height_mm} onChange={e => update('height_mm', e.target.value)} placeholder="1134" />
            </div>
          </>
        )}
        <div className="col-span-2">
          <Label>Beskrivning</Label>
          <Textarea value={form.description} onChange={e => update('description', e.target.value)} placeholder="Valfri beskrivning..." rows={3} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button onClick={handleSave} disabled={saving || !form.name || !form.price}>{saving ? 'Sparar...' : 'Spara'}</Button>
      </div>
    </div>
  );
}