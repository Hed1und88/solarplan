import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Mail, MapPin, Phone, RefreshCw, Snowflake, Wind, X } from 'lucide-react';
import { resolveProjectClimateLoads } from '@/lib/projectClimateLoads';

const statusOptions = [
  ['planering', 'Planering'],
  ['projektering', 'Projektering'],
  ['offert', 'Offert'],
  ['installation', 'Installation'],
  ['klart', 'Klart'],
];

const asInputValue = value => (value === undefined || value === null ? '' : value);
const normalizedAddress = value => String(value || '').trim().toLowerCase();

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      {children}
    </label>
  );
}

export default function NewProjectModal({ onSave, onClose, initialValues = {}, project = null, onSubmit }) {
  const isEditing = Boolean(project?.id);
  const source = project || initialValues || {};
  const initialForm = useMemo(() => ({
    name: source.name || '',
    customer_email: source.customer_email || source.email || source.contact_email || '',
    customer_phone: source.customer_phone || source.phone || source.telephone || source.contact_phone || '',
    address: source.address || '',
    snow_load_kn_m2: asInputValue(source.snow_load_kn_m2),
    wind_load_ms: asInputValue(source.wind_load_ms),
    latitude: asInputValue(source.latitude),
    longitude: asInputValue(source.longitude),
    climate_load_source: source.climate_load_source || '',
    climate_load_updated_at: source.climate_load_updated_at || '',
    climate_load_status: source.climate_load_status || '',
    status: source.status || 'planering',
  }), [source]);

  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [climateState, setClimateState] = useState(() => (
    initialForm.snow_load_kn_m2 !== '' && initialForm.wind_load_ms !== ''
      ? { status: 'success', message: initialForm.climate_load_source || 'Snö- och vindlast är sparad.' }
      : { status: 'idle', message: 'Snö- och vindlast hämtas automatiskt när adressen är ifylld.' }
  ));
  const lastResolvedAddress = useRef(
    initialForm.snow_load_kn_m2 !== '' && initialForm.wind_load_ms !== ''
      ? normalizedAddress(initialForm.address)
      : '',
  );
  const requestSequence = useRef(0);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const loadClimate = useCallback(async (address, { force = false } = {}) => {
    const query = String(address || '').trim();
    const addressKey = normalizedAddress(query);
    if (query.length < 5) return;
    if (!force && addressKey === lastResolvedAddress.current) return;

    const requestId = ++requestSequence.current;
    setClimateState({ status: 'loading', message: 'Hämtar adress, snölast och vindlast...' });
    setSaveError('');

    try {
      const result = await resolveProjectClimateLoads(query);
      if (requestId !== requestSequence.current) return;
      lastResolvedAddress.current = normalizedAddress(result.address);
      setForm(current => ({
        ...current,
        address: result.address,
        snow_load_kn_m2: result.snowLoadKnM2,
        wind_load_ms: result.windLoadMs,
        latitude: result.latitude,
        longitude: result.longitude,
        climate_load_source: result.source,
        climate_load_updated_at: result.updatedAt,
        climate_load_status: 'automatic',
      }));
      setClimateState({ status: 'success', message: `${result.snowLoadKnM2} kN/m² · ${result.windLoadMs} m/s · ${result.source}` });
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      lastResolvedAddress.current = '';
      setClimateState({
        status: 'error',
        message: `${error?.message || 'Kunde inte hämta klimatlast automatiskt.'} Du kan fylla i värdena manuellt.`,
      });
    }
  }, []);

  useEffect(() => {
    const address = String(form.address || '').trim();
    if (address.length < 5 || normalizedAddress(address) === lastResolvedAddress.current) return undefined;
    const timer = window.setTimeout(() => loadClimate(address), 1200);
    return () => window.clearTimeout(timer);
  }, [form.address, loadClimate]);

  const changeAddress = value => {
    requestSequence.current += 1;
    lastResolvedAddress.current = '';
    setForm(current => ({
      ...current,
      address: value,
      snow_load_kn_m2: '',
      wind_load_ms: '',
      latitude: '',
      longitude: '',
      climate_load_source: '',
      climate_load_updated_at: '',
      climate_load_status: '',
    }));
    setClimateState({ status: 'idle', message: 'Snö- och vindlast hämtas automatiskt när adressen är ifylld.' });
  };

  const setManualClimateValue = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: value,
      climate_load_source: 'Manuellt angivet',
      climate_load_updated_at: new Date().toISOString(),
      climate_load_status: 'manual',
    }));
    setClimateState({ status: 'manual', message: 'Snö- eller vindlast har ändrats manuellt.' });
  };

  const handleSave = async () => {
    const snowLoad = Number(form.snow_load_kn_m2);
    const windLoad = Number(form.wind_load_ms);
    if (!form.name.trim() || !form.address.trim() || !Number.isFinite(snowLoad) || !Number.isFinite(windLoad)) return;

    const payload = {
      ...(isEditing ? {} : initialValues || {}),
      name: form.name.trim(),
      customer_email: form.customer_email.trim(),
      customer_phone: form.customer_phone.trim(),
      address: form.address.trim(),
      snow_load_kn_m2: snowLoad,
      wind_load_ms: windLoad,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      climate_load_source: form.climate_load_source || 'Manuellt angivet',
      climate_load_updated_at: form.climate_load_updated_at || new Date().toISOString(),
      climate_load_status: form.climate_load_status || 'manual',
      status: isEditing ? form.status : 'planering',
    };

    setSaving(true);
    setSaveError('');
    try {
      let savedProject;
      if (onSubmit) savedProject = await onSubmit(payload);
      else if (isEditing) savedProject = await base44.entities.Project.update(project.id, payload);
      else savedProject = await base44.entities.Project.create(payload);
      onSave?.(savedProject || { ...project, ...payload });
    } catch (error) {
      setSaveError(error?.message || 'Projektet kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(
    form.name.trim()
    && form.address.trim()
    && Number.isFinite(Number(form.snow_load_kn_m2))
    && Number(form.snow_load_kn_m2) > 0
    && Number.isFinite(Number(form.wind_load_ms))
    && Number(form.wind_load_ms) > 0,
  );

  const climateMessageClass = climateState.status === 'error'
    ? 'border-red-200 bg-red-50 text-red-800'
    : climateState.status === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="font-semibold">{isEditing ? 'Ändra projektuppgifter' : 'Skapa projekt'}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Kontaktuppgifter och dimensionerande klimatlast sparas på projektet.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Stäng"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Namn på projektet *">
            <input
              type="text"
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="T.ex. Helgetorp"
              autoFocus
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-post" icon={Mail}>
              <input
                type="email"
                value={form.customer_email}
                onChange={event => set('customer_email', event.target.value)}
                placeholder="namn@exempel.se"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
            <Field label="Telefon" icon={Phone}>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={event => set('customer_phone', event.target.value)}
                placeholder="070-123 45 67"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          </div>

          <Field label="Adress *" icon={MapPin}>
            <div className="relative">
              <input
                type="text"
                value={form.address}
                onChange={event => changeAddress(event.target.value)}
                placeholder="Gata, postnummer och ort"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                {climateState.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {form.address && (
                  <button type="button" onClick={() => changeAddress('')} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Rensa adress">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Snölast *" icon={Snowflake}>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.snow_load_kn_m2}
                  onChange={event => setManualClimateValue('snow_load_kn_m2', event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center border-l border-border pl-3 text-sm text-muted-foreground">kN/m²</span>
              </div>
            </Field>
            <Field label="Vindlast *" icon={Wind}>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.wind_load_ms}
                  onChange={event => setManualClimateValue('wind_load_ms', event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center border-l border-border pl-3 text-sm text-muted-foreground">m/s</span>
              </div>
            </Field>
          </div>

          <div className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${climateMessageClass}`}>
            <span>{climateState.message}</span>
            <button
              type="button"
              onClick={() => loadClimate(form.address, { force: true })}
              disabled={climateState.status === 'loading' || form.address.trim().length < 5}
              className="inline-flex shrink-0 items-center gap-1 font-medium disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Hämta igen
            </button>
          </div>

          {isEditing && (
            <Field label="Status">
              <select
                value={form.status}
                onChange={event => set('status', event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          )}

          <p className="text-xs text-muted-foreground">
            Automatiska värden hämtas från Boverkets digitala klimatlastkartor. Vid zongräns eller konstruktionskritisk dimensionering ska värdet verifieras mot gällande regelverk.
          </p>

          {saveError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Avbryt</button>
          <button onClick={handleSave} disabled={saving || !canSave} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Spara ändringar' : 'Skapa projekt'}
          </button>
        </div>
      </div>
    </div>
  );
}
