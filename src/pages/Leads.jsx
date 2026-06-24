import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import {
  Building2,
  CalendarClock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import {
  canEditWorkspaceRecord,
  currentUserSafe,
  filterWorkspaceRecords,
  withWorkspaceOwnership,
} from '@/lib/workspaceAccess';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
const STATUS_CONFIG = {
  new: { label: 'Nya', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  contacted: { label: 'Kontaktade', badge: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-500' },
  meeting: { label: 'Möte bokat', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  quote: { label: 'Offert', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  won: { label: 'Vunna', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  lost: { label: 'Förlorade', badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
};
const STATUS_ORDER = Object.keys(STATUS_CONFIG);
const SOURCE_OPTIONS = ['Webbplats', 'Rekommendation', 'Telefon', 'E-post', 'Mässa', 'Sociala medier', 'Befintlig kund', 'Annat'];

const money = value => Number(value || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 });

function emptyForm() {
  return {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    source: '',
    interest: '',
    status: 'new',
    estimated_value: '',
    next_follow_up: '',
    notes: '',
  };
}

function LeadModal({ prospect, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(() => prospect ? {
    company_name: prospect.company_name || '',
    contact_name: prospect.contact_name || '',
    email: prospect.email || '',
    phone: prospect.phone || '',
    address: prospect.address || '',
    source: prospect.source || '',
    interest: prospect.interest || '',
    status: prospect.status || 'new',
    estimated_value: prospect.estimated_value ?? '',
    next_follow_up: prospect.next_follow_up || '',
    notes: prospect.notes || '',
  } : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.company_name.trim()) return setError('Ange företag eller kundnamn.');
    setSaving(true);
    setError('');
    const payload = withWorkspaceOwnership({
      ...form,
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      source: form.source.trim(),
      interest: form.interest.trim(),
      estimated_value: Number(form.estimated_value || 0),
      notes: form.notes.trim(),
    }, currentUser || {});
    try {
      const saved = prospect?.id
        ? await base44.entities.SalesLead.update(prospect.id, payload)
        : await base44.entities.SalesLead.create(payload);
      onSaved(saved || { ...prospect, ...payload });
    } catch (saveError) {
      setError(saveError?.message || 'Leadet kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!prospect?.id || !confirm('Ta bort leadet?')) return;
    setSaving(true);
    try {
      await base44.entities.SalesLead.delete(prospect.id);
      onSaved(null, prospect.id);
    } catch (deleteError) {
      setError(deleteError?.message || 'Leadet kunde inte tas bort.');
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div><h2 className="font-semibold">{prospect ? 'Ändra lead' : 'Nytt lead'}</h2><p className="text-xs text-muted-foreground">Spara kontaktuppgifter, affärsläge och nästa uppföljning.</p></div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Stäng"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Företag eller kund *</span><input className={INPUT} value={form.company_name} onChange={e => set('company_name', e.target.value)} autoFocus /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Kontaktperson</span><input className={INPUT} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">E-post</span><input type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Telefon</span><input type="tel" className={INPUT} value={form.phone} onChange={e => set('phone', e.target.value)} /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Adress</span><input className={INPUT} value={form.address} onChange={e => set('address', e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Källa</span><select className={INPUT} value={form.source} onChange={e => set('source', e.target.value)}><option value="">Välj källa</option>{SOURCE_OPTIONS.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Status</span><select className={INPUT} value={form.status} onChange={e => set('status', e.target.value)}>{STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>)}</select></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Intresse eller behov</span><input className={INPUT} value={form.interest} onChange={e => set('interest', e.target.value)} placeholder="T.ex. solceller, batteri, styrsystem eller service" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Uppskattat affärsvärde</span><div className="relative"><input type="number" min="0" step="1000" className={`${INPUT} pr-12`} value={form.estimated_value} onChange={e => set('estimated_value', e.target.value)} /><span className="absolute right-3 top-3 text-sm text-muted-foreground">kr</span></div></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Nästa uppföljning</span><input type="date" className={INPUT} value={form.next_follow_up} onChange={e => set('next_follow_up', e.target.value)} /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Anteckningar</span><textarea className={`${INPUT} min-h-28 resize-y`} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      </div>
      <div className="flex items-center gap-3 border-t border-border p-5">
        {prospect?.id && <button onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Ta bort</button>}
        <div className="flex-1" />
        <button onClick={onClose} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Avbryt</button>
        <button onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Sparar...' : 'Spara lead'}</button>
      </div>
    </div>
  </div>;
}

function StatCard({ label, value, detail, icon: Icon }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div></div></div>;
}

function LeadCard({ prospect, currentUser, onEdit, onStatus }) {
  const editable = canEditWorkspaceRecord(currentUser || {}, prospect);
  return <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><h4 className="truncate font-semibold">{prospect.company_name}</h4>{prospect.contact_name && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />{prospect.contact_name}</p>}</div>
      {editable && <button onClick={() => onEdit(prospect)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ändra lead"><Pencil className="h-3.5 w-3.5" /></button>}
    </div>
    {prospect.interest && <p className="mt-3 rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-relaxed">{prospect.interest}</p>}
    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
      {prospect.phone && <a href={`tel:${prospect.phone}`} className="flex items-center gap-1.5 hover:text-primary"><Phone className="h-3.5 w-3.5" />{prospect.phone}</a>}
      {prospect.email && <a href={`mailto:${prospect.email}`} className="flex items-center gap-1.5 truncate hover:text-primary"><Mail className="h-3.5 w-3.5" />{prospect.email}</a>}
      {prospect.address && <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{prospect.address}</span></p>}
      {prospect.next_follow_up && <p className="flex items-center gap-1.5 font-medium text-amber-700"><CalendarClock className="h-3.5 w-3.5" />Följ upp {prospect.next_follow_up}</p>}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
      <span className="text-sm font-semibold text-primary">{prospect.estimated_value ? `${money(prospect.estimated_value)} kr` : 'Värde saknas'}</span>
      {editable && <select value={prospect.status || 'new'} onChange={e => onStatus(prospect, e.target.value)} className="max-w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs">{STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>)}</select>}
    </div>
  </article>;
}

export default function Leads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [mutationError, setMutationError] = useState('');

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['sales-leads'],
    queryFn: async () => {
      const user = await currentUserSafe(base44);
      const rows = await base44.entities.SalesLead.list('-created_date');
      return { user, prospects: filterWorkspaceRecords(rows, user || {}) };
    },
  });

  const currentUser = data?.user || null;
  const prospects = data?.prospects || [];
  const error = queryError?.message || mutationError;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.SalesLead.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['sales-leads'] });
      const previous = queryClient.getQueryData(['sales-leads']);
      queryClient.setQueryData(['sales-leads'], (old) => {
        if (!old) return old;
        return { ...old, prospects: old.prospects.map(item => item.id === id ? { ...item, status } : item) };
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['sales-leads'], context.previous);
      setMutationError(err?.message || 'Statusen kunde inte ändras.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return prospects.filter(prospect => {
      const sourceOk = sourceFilter === 'all' || prospect.source === sourceFilter;
      if (!sourceOk) return false;
      if (!term) return true;
      return [prospect.company_name, prospect.contact_name, prospect.email, prospect.phone, prospect.interest, prospect.address]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [prospects, search, sourceFilter]);

  const sources = Array.from(new Set(prospects.map(prospect => prospect.source).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sv'));
  const active = prospects.filter(prospect => !['won', 'lost'].includes(prospect.status));
  const pipeline = active.reduce((sum, prospect) => sum + Number(prospect.estimated_value || 0), 0);
  const wonValue = prospects.filter(prospect => prospect.status === 'won').reduce((sum, prospect) => sum + Number(prospect.estimated_value || 0), 0);
  const followUps = prospects.filter(prospect => prospect.next_follow_up && !['won', 'lost'].includes(prospect.status)).length;

  const saved = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    setModal(null);
  };

  const changeStatus = (prospect, status) => {
    statusMutation.mutate({ id: prospect.id, status });
  };

  return (
    <PullToRefresh onRefresh={refetch}>
    <div className="mx-auto max-w-[1700px] p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Samla potentiella kunder och följ affären från första kontakt till vunnen kund.</p></div>
      <button onClick={() => setModal({ prospect: null })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-primary/20"><Plus className="h-4 w-4" />Nytt lead</button>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Aktiva leads" value={active.length} detail={`${prospects.filter(item => item.status === 'new').length} helt nya`} icon={Building2} />
      <StatCard label="Pipeline" value={`${money(pipeline)} kr`} detail="Uppskattat värde i öppna affärer" icon={TrendingUp} />
      <StatCard label="Vunnet värde" value={`${money(wonValue)} kr`} detail={`${prospects.filter(item => item.status === 'won').length} vunna affärer`} icon={TrendingUp} />
      <StatCard label="Uppföljningar" value={followUps} detail="Leads med planerat uppföljningsdatum" icon={CalendarClock} />
    </div>

    <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${INPUT} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök företag, kontakt, telefon eller intresse" /></div>
      <select className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">Alla källor</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select>
    </div>

    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

    {loading ? <div className="grid gap-4 lg:grid-cols-3">{[1,2,3].map(item => <div key={item} className="h-80 animate-pulse rounded-2xl bg-muted" />)}</div> :
      <div className="overflow-x-auto pb-3"><div className="grid min-w-[1560px] grid-cols-6 gap-3">
        {STATUS_ORDER.map(status => {
          const config = STATUS_CONFIG[status];
          const rows = visible.filter(prospect => (prospect.status || 'new') === status);
          const value = rows.reduce((sum, prospect) => sum + Number(prospect.estimated_value || 0), 0);
          return <section key={status} className="rounded-2xl border border-border bg-muted/30 p-3">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} /><h2 className="font-semibold">{config.label}</h2><span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium">{rows.length}</span></div><span className="text-xs font-medium text-muted-foreground">{money(value)} kr</span></div>
            <div className="space-y-3">{rows.length ? rows.map(prospect => <LeadCard key={prospect.id} prospect={prospect} currentUser={currentUser} onEdit={item => setModal({ prospect: item })} onStatus={changeStatus} />) : <div className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-center text-xs text-muted-foreground">Inga leads i denna kolumn.</div>}</div>
          </section>;
        })}
      </div></div>}

    {modal && <LeadModal prospect={modal.prospect} currentUser={currentUser} onClose={() => setModal(null)} onSaved={saved} />}
    </div>
    </PullToRefresh>
  );
}