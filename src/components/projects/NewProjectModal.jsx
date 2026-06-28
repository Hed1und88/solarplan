import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { preloadProjectClimateLookup, resolveProjectClimateLoads } from '@/lib/projectClimateLoads';
import { createTenantProject } from '@/lib/tenantQueries';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
const STATUSES = [['planering','Planering'],['projektering','Projektering'],['offert','Offert'],['installation','Installation'],['klart','Klart']];
const digits = value => String(value || '').replace(/\D/g, '').slice(0, 5);
const formatPostcode = value => {
  const valueDigits = digits(value);
  return valueDigits.length > 3 ? `${valueDigits.slice(0, 3)} ${valueDigits.slice(3)}` : valueDigits;
};
const placeKey = (postcode, city) => `${digits(postcode)}|${String(city || '').trim().toLowerCase()}`;
const addressText = form => `${form.street_address.trim()}, ${formatPostcode(form.postal_code)} ${form.postal_city.trim()}`;

function splitAddress(source) {
  if (source.street_address || source.postal_code || source.postal_city) return {
    street_address: source.street_address || '',
    postal_code: formatPostcode(source.postal_code),
    postal_city: source.postal_city || '',
  };
  const raw = String(source.address || '').trim();
  const match = raw.match(/^(.*?)(?:,\s*|\s+)(\d{3}\s?\d{2})\s+([^,]+?)(?:,\s*(?:Sweden|Sverige))?$/i);
  return match
    ? { street_address: match[1].trim(), postal_code: formatPostcode(match[2]), postal_city: match[3].trim() }
    : { street_address: raw, postal_code: '', postal_city: '' };
}

function Field({ label, children }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

export default function NewProjectModal({ onSave, onClose, initialValues = {}, project = null, onSubmit }) {
  const editing = Boolean(project?.id);
  const source = project || initialValues || {};
  const location = useMemo(() => splitAddress(source), [source]);
  const initial = useMemo(() => ({
    name: source.name || '',
    customer_email: source.customer_email || source.email || '',
    customer_phone: source.customer_phone || source.phone || source.telephone || '',
    ...location,
    snow_load_kn_m2: source.snow_load_kn_m2 ?? '',
    wind_load_ms: source.wind_load_ms ?? '',
    latitude: source.latitude ?? '',
    longitude: source.longitude ?? '',
    climate_load_source: source.climate_load_source || '',
    climate_load_updated_at: source.climate_load_updated_at || '',
    climate_load_status: source.climate_load_status || '',
    status: source.status || 'planering',
  }), [source, location]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState(initial.snow_load_kn_m2 !== '' && initial.wind_load_ms !== ''
    ? { state: 'done', text: initial.climate_load_source || 'Snö- och vindlast är sparad.' }
    : { state: 'idle', text: 'Fyll i postnummer och postort. Uppslaget startar direkt.' });
  const lastPlace = useRef(initial.snow_load_kn_m2 !== '' ? placeKey(initial.postal_code, initial.postal_city) : '');
  const requestId = useRef(0);

  useEffect(() => { preloadProjectClimateLookup(); }, []);
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const fetchLoads = useCallback(async (postcode, city, force = false) => {
    const postcodeDigits = digits(postcode);
    const cleanCity = String(city || '').trim();
    const key = placeKey(postcodeDigits, cleanCity);
    if (postcodeDigits.length !== 5 || cleanCity.length < 2 || (!force && key === lastPlace.current)) return;
    const currentRequest = ++requestId.current;
    setLookup({ state: 'loading', text: 'Hämtar snölast och vindlast...' });
    setError('');
    try {
      const result = await resolveProjectClimateLoads(`${formatPostcode(postcodeDigits)} ${cleanCity}, Sweden`);
      if (currentRequest !== requestId.current) return;
      lastPlace.current = key;
      setForm(current => ({
        ...current,
        snow_load_kn_m2: result.snowLoadKnM2,
        wind_load_ms: result.windLoadMs,
        latitude: result.latitude,
        longitude: result.longitude,
        climate_load_source: result.source,
        climate_load_updated_at: result.updatedAt,
        climate_load_status: 'automatic',
      }));
      setLookup({ state: 'done', text: `${result.snowLoadKnM2} kN/m² · ${result.windLoadMs} m/s${result.fromCache ? ' · direkt från cache' : ''}` });
    } catch (lookupError) {
      if (currentRequest !== requestId.current) return;
      lastPlace.current = '';
      setLookup({ state: 'error', text: `${lookupError?.message || 'Kunde inte hämta klimatlast.'} Fyll i manuellt.` });
    }
  }, []);

  useEffect(() => {
    if (digits(form.postal_code).length === 5 && form.postal_city.trim().length >= 2) fetchLoads(form.postal_code, form.postal_city);
  }, [form.postal_code, form.postal_city, fetchLoads]);

  const changePlace = (key, value) => {
    requestId.current += 1;
    lastPlace.current = '';
    setForm(current => ({
      ...current,
      [key]: key === 'postal_code' ? formatPostcode(value) : value,
      snow_load_kn_m2: '', wind_load_ms: '', latitude: '', longitude: '',
      climate_load_source: '', climate_load_updated_at: '', climate_load_status: '',
    }));
    setLookup({ state: 'idle', text: 'Fyll i postnummer och postort. Uppslaget startar direkt.' });
  };

  const manualLoad = (key, value) => {
    setForm(current => ({ ...current, [key]: value, climate_load_source: 'Manuellt angivet', climate_load_updated_at: new Date().toISOString(), climate_load_status: 'manual' }));
    setLookup({ state: 'manual', text: 'Lastvärdet har ändrats manuellt.' });
  };

  const valid = Boolean(form.name.trim() && form.street_address.trim() && digits(form.postal_code).length === 5 && form.postal_city.trim()
    && Number(form.snow_load_kn_m2) > 0 && Number(form.wind_load_ms) > 0);

  const save = async () => {
    if (!valid) return;
    const payload = {
      ...(editing ? {} : initialValues),
      name: form.name.trim(),
      customer_email: form.customer_email.trim(),
      customer_phone: form.customer_phone.trim(),
      street_address: form.street_address.trim(),
      postal_code: formatPostcode(form.postal_code),
      postal_city: form.postal_city.trim(),
      address: addressText(form),
      snow_load_kn_m2: Number(form.snow_load_kn_m2),
      wind_load_ms: Number(form.wind_load_ms),
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      climate_load_source: form.climate_load_source || 'Manuellt angivet',
      climate_load_updated_at: form.climate_load_updated_at || new Date().toISOString(),
      climate_load_status: form.climate_load_status || 'manual',
      status: editing ? form.status : 'planering',
    };
    setSaving(true);
    setError('');
    try {
      const saved = onSubmit
        ? await onSubmit(payload)
        : editing
          ? await base44.entities.Project.update(project.id, payload)
          : await createTenantProject(payload);
      onSave?.(saved || { ...project, ...payload });
    } catch (saveError) {
      setError(saveError?.message || 'Projektet kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const lookupClass = lookup.state === 'error' ? 'border-red-200 bg-red-50 text-red-800'
    : lookup.state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b p-5">
        <div><h2 className="font-semibold">{editing ? 'Ändra projektuppgifter' : 'Skapa projekt'}</h2><p className="text-xs text-muted-foreground">Projekt- och kontaktuppgifter</p></div>
        <button onClick={onClose} aria-label="Stäng"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <Field label="Namn på projektet *"><input className={INPUT} value={form.name} onChange={e => patch('name', e.target.value)} autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-post"><input type="email" className={INPUT} value={form.customer_email} onChange={e => patch('customer_email', e.target.value)} /></Field>
          <Field label="Telefon"><input type="tel" className={INPUT} value={form.customer_phone} onChange={e => patch('customer_phone', e.target.value)} /></Field>
        </div>
        <Field label="Adress *"><input className={INPUT} placeholder="Gata, nummer eller fastighetsnamn" value={form.street_address} onChange={e => patch('street_address', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Postnummer *"><input className={INPUT} inputMode="numeric" maxLength={6} placeholder="655 95" value={form.postal_code} onChange={e => changePlace('postal_code', e.target.value)} /></Field>
          <Field label="Postort *"><div className="relative"><input className={`${INPUT} pr-10`} placeholder="Väse" value={form.postal_city} onChange={e => changePlace('postal_city', e.target.value)} />{lookup.state === 'loading' && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin" />}</div></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Snölast *"><div className="relative"><input type="number" min="0" step="0.1" className={`${INPUT} pr-20`} value={form.snow_load_kn_m2} onChange={e => manualLoad('snow_load_kn_m2', e.target.value)} /><span className="absolute right-3 top-3 text-sm text-muted-foreground">kN/m²</span></div></Field>
          <Field label="Vindlast *"><div className="relative"><input type="number" min="0" step="1" className={`${INPUT} pr-14`} value={form.wind_load_ms} onChange={e => manualLoad('wind_load_ms', e.target.value)} /><span className="absolute right-3 top-3 text-sm text-muted-foreground">m/s</span></div></Field>
        </div>
        <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${lookupClass}`}><span>{lookup.text}</span><button type="button" className="inline-flex items-center gap-1 font-medium" disabled={lookup.state === 'loading'} onClick={() => fetchLoads(form.postal_code, form.postal_city, true)}><RefreshCw className="h-3.5 w-3.5" />Hämta igen</button></div>
        {editing && <Field label="Status"><select className={INPUT} value={form.status} onChange={e => patch('status', e.target.value)}>{STATUSES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      </div>
      <div className="flex gap-3 border-t p-5"><button className="flex-1 rounded-xl border py-2.5 text-sm font-medium" onClick={onClose}>Avbryt</button><button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-50" disabled={!valid || saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? 'Spara ändringar' : 'Skapa projekt'}</button></div>
    </div>
  </div>;
}
