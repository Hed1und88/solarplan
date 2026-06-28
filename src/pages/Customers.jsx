import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  canEditWorkspaceRecord,
  currentUserSafe,
  filterWorkspaceRecords,
  withWorkspaceOwnership,
} from '@/lib/workspaceAccess';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

function emptyCustomer() {
  return {
    customer_type: 'private',
    name: '',
    organization_number: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    postal_code: '',
    city: '',
    status: 'active',
    notes: '',
  };
}

function CustomerModal({ customer, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(() => customer ? {
    customer_type: customer.customer_type || 'private',
    name: customer.name || '',
    organization_number: customer.organization_number || '',
    contact_name: customer.contact_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    postal_code: customer.postal_code || '',
    city: customer.city || '',
    status: customer.status || 'active',
    notes: customer.notes || '',
  } : emptyCustomer());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      setError('Ange kundens namn eller företagsnamn.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = withWorkspaceOwnership({
      ...form,
      name: form.name.trim(),
      organization_number: form.organization_number.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      postal_code: form.postal_code.trim(),
      city: form.city.trim(),
      notes: form.notes.trim(),
    }, currentUser || {});

    try {
      if (customer?.id) await base44.entities.Customer.update(customer.id, payload);
      else await base44.entities.Customer.create(payload);
      onSaved();
    } catch (saveError) {
      setError(saveError?.message || 'Kunden kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!customer?.id || !confirm(`Ta bort kunden ${customer.name}?`)) return;
    setSaving(true);
    setError('');
    try {
      await base44.entities.Customer.delete(customer.id);
      onSaved();
    } catch (deleteError) {
      setError(deleteError?.message || 'Kunden kunde inte tas bort.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="font-semibold">{customer ? 'Hantera kund' : 'Ny kund'}</h2>
            <p className="text-xs text-muted-foreground">Kontaktuppgifter och interna kundanteckningar.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Stäng"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Kundtyp</span><select className={INPUT} value={form.customer_type} onChange={event => set('customer_type', event.target.value)}><option value="private">Privatkund</option><option value="company">Företagskund</option></select></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Status</span><select className={INPUT} value={form.status} onChange={event => set('status', event.target.value)}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{form.customer_type === 'company' ? 'Företagsnamn' : 'Kundnamn'} *</span><input className={INPUT} value={form.name} onChange={event => set('name', event.target.value)} autoFocus /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{form.customer_type === 'company' ? 'Organisationsnummer' : 'Personnummer'}</span><input className={INPUT} value={form.organization_number} onChange={event => set('organization_number', event.target.value)} /></label>
          </div>

          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Kontaktperson</span><input className={INPUT} value={form.contact_name} onChange={event => set('contact_name', event.target.value)} /></label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">E-post</span><input type="email" className={INPUT} value={form.email} onChange={event => set('email', event.target.value)} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Telefon</span><input type="tel" className={INPUT} value={form.phone} onChange={event => set('phone', event.target.value)} /></label>
          </div>

          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Adress</span><input className={INPUT} value={form.address} onChange={event => set('address', event.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Postnummer</span><input className={INPUT} value={form.postal_code} onChange={event => set('postal_code', event.target.value)} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Ort</span><input className={INPUT} value={form.city} onChange={event => set('city', event.target.value)} /></label>
          </div>

          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Anteckningar</span><textarea className={`${INPUT} min-h-32 resize-y`} value={form.notes} onChange={event => set('notes', event.target.value)} /></label>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        </div>

        <div className="flex items-center gap-3 border-t border-border p-5">
          {customer?.id && <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />Ta bort</button>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Avbryt</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Sparar...' : 'Spara kund'}</button>
        </div>
      </div>
    </div>
  );
}

function CustomerCard({ customer, currentUser, onEdit }) {
  const editable = canEditWorkspaceRecord(currentUser || {}, customer);
  const address = [customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ');
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{customer.customer_type === 'company' ? <Building2 className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{customer.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{customer.customer_type === 'company' ? 'Företagskund' : 'Privatkund'}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${customer.status === 'inactive' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>{customer.status === 'inactive' ? 'Inaktiv' : 'Aktiv'}</span>
            </div>
          </div>
        </div>
        {editable && <button type="button" onClick={() => onEdit(customer)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Hantera ${customer.name}`}><Pencil className="h-4 w-4" /></button>}
      </div>

      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        {customer.contact_name && <p className="flex items-center gap-2"><UsersRound className="h-4 w-4 shrink-0" />{customer.contact_name}</p>}
        {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-4 w-4 shrink-0" />{customer.phone}</a>}
        {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-2 truncate hover:text-primary"><Mail className="h-4 w-4 shrink-0" />{customer.email}</a>}
        {address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{address}</span></p>}
      </div>

      {customer.notes && <p className="mt-4 line-clamp-3 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{customer.notes}</p>}
    </article>
  );
}

export default function Customers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [modalCustomer, setModalCustomer] = useState(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const user = await currentUserSafe(base44);
      const rows = await base44.entities.Customer.list('-created_date');
      return { user, customers: filterWorkspaceRecords(rows, user || {}) };
    },
  });

  const currentUser = data?.user || null;
  const customers = data?.customers || [];
  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter(customer => {
      if (status !== 'all' && (customer.status || 'active') !== status) return false;
      if (!term) return true;
      return [customer.name, customer.contact_name, customer.email, customer.phone, customer.address, customer.postal_code, customer.city, customer.organization_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [customers, search, status]);

  const closeAndRefresh = () => {
    setModalCustomer(undefined);
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  return (
    <PullToRefresh onRefresh={refetch}>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kunder</h1>
            <p className="mt-1 text-sm text-muted-foreground">Skapa nya kunder och hantera befintliga kunduppgifter.</p>
          </div>
          <button type="button" onClick={() => setModalCustomer(null)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-primary/20"><Plus className="h-4 w-4" />Ny kund</button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">Totalt antal kunder</p><p className="mt-1 text-2xl font-bold">{customers.length}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">Aktiva kunder</p><p className="mt-1 text-2xl font-bold">{customers.filter(customer => (customer.status || 'active') === 'active').length}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">Företagskunder</p><p className="mt-1 text-2xl font-bold">{customers.filter(customer => customer.customer_type === 'company').length}</p></div>
        </div>

        <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${INPUT} pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök namn, telefon, e-post, adress eller organisationsnummer" /></div>
          <select className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="active">Aktiva</option><option value="inactive">Inaktiva</option><option value="all">Alla kunder</option></select>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error.message || 'Kunderna kunde inte hämtas.'}</div>}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-56 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : visibleCustomers.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleCustomers.map(customer => <CustomerCard key={customer.id} customer={customer} currentUser={currentUser} onEdit={setModalCustomer} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
            <UsersRound className="mx-auto h-12 w-12 text-primary/30" />
            <h2 className="mt-4 font-semibold">Inga kunder hittades</h2>
            <p className="mt-1 text-sm text-muted-foreground">Skapa den första kunden eller ändra sökningen.</p>
          </div>
        )}

        {modalCustomer !== undefined && <CustomerModal customer={modalCustomer} currentUser={currentUser} onClose={() => setModalCustomer(undefined)} onSaved={closeAndRefresh} />}
      </div>
    </PullToRefresh>
  );
}
