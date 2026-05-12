import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Edit3, Mail, MapPin, Phone, Save, User, X } from 'lucide-react';

const statusLabels = {
  planering: 'Planering',
  projektering: 'Projektering',
  offert: 'Offert',
  installation: 'Installation',
  klart: 'Klart',
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

function valueFrom(project, keys, fallback = '') {
  for (const key of keys) {
    if (project?.[key] !== undefined && project?.[key] !== null && project?.[key] !== '') return project[key];
  }
  return fallback;
}

function preferredField(project, candidates, fallback) {
  return candidates.find(key => project && Object.prototype.hasOwnProperty.call(project, key)) || fallback;
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

export default function ProjectInfoEditor({ project, onUpdate, isSaving }) {
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const fieldMap = useMemo(() => ({
    phone: preferredField(project, ['customer_phone', 'phone', 'telephone', 'contact_phone', 'customer_tel'], 'phone'),
    email: preferredField(project, ['customer_email', 'email', 'contact_email'], 'email'),
  }), [project]);

  const initialForm = useMemo(() => ({
    name: project?.name || '',
    customer_name: project?.customer_name || '',
    address: project?.address || '',
    phone: valueFrom(project, ['customer_phone', 'phone', 'telephone', 'contact_phone', 'customer_tel'], ''),
    email: valueFrom(project, ['customer_email', 'email', 'contact_email'], ''),
    status: project?.status || 'planering',
    notes: project?.notes || '',
  }), [project]);

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!editing) setForm(initialForm);
  }, [initialForm, editing]);

  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    const update = {
      name: form.name.trim() || 'Nytt projekt',
      customer_name: form.customer_name.trim(),
      address: form.address.trim(),
      status: form.status || 'planering',
      notes: form.notes || '',
      [fieldMap.phone]: form.phone.trim(),
      [fieldMap.email]: form.email.trim(),
    };

    await onUpdate?.(update);
    setEditing(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const phone = valueFrom(project, ['customer_phone', 'phone', 'telephone', 'contact_phone', 'customer_tel'], 'Telefon saknas');
  const email = valueFrom(project, ['customer_email', 'email', 'contact_email'], 'E-post saknas');

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-primary" />Projektuppgifter</CardTitle>
            <p className="text-sm text-muted-foreground">Ändra namn, kund, adress, telefon, e-post och status i efterhand.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedFlash && <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Sparat</Badge>}
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(initialForm); }} disabled={isSaving}><X className="mr-2 h-4 w-4" />Avbryt</Button>
                <Button size="sm" onClick={save} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? 'Sparar...' : 'Spara uppgifter'}</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit3 className="mr-2 h-4 w-4" />Ändra projektuppgifter</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Projektnamn" value={form.name} onChange={value => patch('name', value)} placeholder="Ex. Stuvbutiken" />
              <Field label="Kundnamn" value={form.customer_name} onChange={value => patch('customer_name', value)} placeholder="Kund / kontaktperson" />
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={event => patch('status', event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <Field label="Adress" value={form.address} onChange={value => patch('address', value)} placeholder="Gata, postnummer, ort" />
              <Field label="Telefonnummer" value={form.phone} onChange={value => patch('phone', value)} placeholder="Telefonnummer" />
              <Field label="E-post" type="email" value={form.email} onChange={value => patch('email', value)} placeholder="namn@exempel.se" />
            </div>
            <label className="space-y-1 text-xs font-medium text-muted-foreground block">
              <span>Anteckningar</span>
              <textarea
                value={form.notes || ''}
                onChange={event => patch('notes', event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Interna projektanteckningar"
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Kund</div><div className="font-semibold">{project?.customer_name || 'Kund saknas'}</div></div>
            <div className="rounded-xl bg-muted/40 p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />Adress</div><div className="font-semibold">{project?.address || 'Adress saknas'}</div></div>
            <div className="rounded-xl bg-muted/40 p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />Telefon</div><div className="font-semibold">{phone}</div></div>
            <div className="rounded-xl bg-muted/40 p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />E-post</div><div className="font-semibold break-all">{email}</div></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
