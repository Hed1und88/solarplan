import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import {
  addHours,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Trash2, X } from 'lucide-react';
import {
  canEditWorkspaceRecord,
  filterWorkspaceRecords,
  withWorkspaceOwnership,
} from '@/lib/workspaceAccess';
import { getTenantUser, listTenantEntity, listTenantProjects } from '@/lib/tenantQueries';

const INPUT = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
const TYPE_CONFIG = {
  sales_meeting: { label: 'Säljmöte', chip: 'bg-blue-100 text-blue-800 border-blue-200' },
  project_meeting: { label: 'Projekteringsmöte', chip: 'bg-violet-100 text-violet-800 border-violet-200' },
  service: { label: 'Serviceärende', chip: 'bg-orange-100 text-orange-800 border-orange-200' },
  installation: { label: 'Installation', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  follow_up: { label: 'Uppföljning', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  internal: { label: 'Internt', chip: 'bg-slate-100 text-slate-800 border-slate-200' },
  other: { label: 'Övrigt', chip: 'bg-gray-100 text-gray-800 border-gray-200' },
};
const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function safeDate(value) {
  try {
    const date = parseISO(String(value || ''));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

const inputDateTime = date => format(date, "yyyy-MM-dd'T'HH:mm");

function emptyForm(day = new Date()) {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  return {
    title: '',
    event_type: 'sales_meeting',
    start_time: inputDateTime(start),
    end_time: inputDateTime(addHours(start, 1)),
    location: '',
    description: '',
    status: 'planned',
    related_project_id: '',
    related_project_name: '',
    related_lead_id: '',
    related_lead_name: '',
  };
}

function EventModal({ event, selectedDay, projects, prospects, currentUser, onClose, onSave, onRemove }) {
  const [form, setForm] = useState(() => event ? {
    title: event.title || '',
    event_type: event.event_type || 'sales_meeting',
    start_time: event.start_time ? inputDateTime(safeDate(event.start_time) || new Date()) : emptyForm(selectedDay).start_time,
    end_time: event.end_time ? inputDateTime(safeDate(event.end_time) || addHours(new Date(), 1)) : emptyForm(selectedDay).end_time,
    location: event.location || '',
    description: event.description || '',
    status: event.status || 'planned',
    related_project_id: event.related_project_id || '',
    related_project_name: event.related_project_name || '',
    related_lead_id: event.related_lead_id || '',
    related_lead_name: event.related_lead_name || '',
  } : emptyForm(selectedDay));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    const start = new Date(form.start_time);
    const end = new Date(form.end_time);
    if (!form.title.trim()) return setError('Ange en rubrik.');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return setError('Sluttiden måste vara efter starttiden.');
    setSaving(true);
    setError('');
    const payload = withWorkspaceOwnership({
      ...form,
      title: form.title.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      location: form.location.trim(),
      description: form.description.trim(),
    }, currentUser || {});
    try {
      await onSave(event, payload);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || 'Kalenderhändelsen kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event?.id || !confirm('Ta bort kalenderhändelsen?')) return;
    setSaving(true);
    try {
      await onRemove(event.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError?.message || 'Kalenderhändelsen kunde inte tas bort.');
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div><h2 className="font-semibold">{event ? 'Ändra bokning' : 'Ny bokning'}</h2><p className="text-xs text-muted-foreground">Planera möten, service och arbetsdagar.</p></div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Stäng"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Rubrik *</span><input className={INPUT} value={form.title} onChange={eventValue => set('title', eventValue.target.value)} placeholder="T.ex. Säljmöte med kund" autoFocus /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Typ</span><select className={INPUT} value={form.event_type} onChange={eventValue => set('event_type', eventValue.target.value)}>{Object.entries(TYPE_CONFIG).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Status</span><select className={INPUT} value={form.status} onChange={eventValue => set('status', eventValue.target.value)}><option value="planned">Planerad</option><option value="completed">Genomförd</option><option value="cancelled">Inställd</option></select></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Start *</span><input type="datetime-local" className={INPUT} value={form.start_time} onChange={eventValue => set('start_time', eventValue.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Slut *</span><input type="datetime-local" className={INPUT} value={form.end_time} onChange={eventValue => set('end_time', eventValue.target.value)} /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Plats eller möteslänk</span><input className={INPUT} value={form.location} onChange={eventValue => set('location', eventValue.target.value)} placeholder="Adress, Teams- eller Meet-länk" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Kopplat projekt</span><select className={INPUT} value={form.related_project_id} onChange={eventValue => { const item = projects.find(project => project.id === eventValue.target.value); setForm(current => ({ ...current, related_project_id: eventValue.target.value, related_project_name: item?.name || '' })); }}><option value="">Inget projekt</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Kopplad lead</span><select className={INPUT} value={form.related_lead_id} onChange={eventValue => { const item = prospects.find(prospect => prospect.id === eventValue.target.value); setForm(current => ({ ...current, related_lead_id: eventValue.target.value, related_lead_name: item?.company_name || '' })); }}><option value="">Ingen lead</option>{prospects.map(prospect => <option key={prospect.id} value={prospect.id}>{prospect.company_name}</option>)}</select></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Anteckningar</span><textarea className={`${INPUT} min-h-24 resize-y`} value={form.description} onChange={eventValue => set('description', eventValue.target.value)} /></label>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      </div>
      <div className="flex items-center gap-3 border-t border-border p-5">
        {event?.id && <button onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Ta bort</button>}
        <div className="flex-1" />
        <button onClick={onClose} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Avbryt</button>
        <button onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Sparar...' : 'Spara'}</button>
      </div>
    </div>
  </div>;
}

export default function Calendar() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [modal, setModal] = useState(null);
  const [selectedType, setSelectedType] = useState('all');

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['calendar-data'],
    queryFn: async () => {
      const user = await getTenantUser();
      const [eventRows, projectRows, prospectRows] = await Promise.all([
        listTenantEntity('CalendarEvent', '-start_time'),
        listTenantProjects('-created_date'),
        listTenantEntity('SalesLead', '-created_date'),
      ]);
      return {
        user,
        events: filterWorkspaceRecords(eventRows, user || {}),
        projects: filterWorkspaceRecords(projectRows, user || {}),
        prospects: filterWorkspaceRecords(prospectRows, user || {}),
      };
    },
  });

  const currentUser = data?.user || null;
  const events = data?.events || [];
  const projects = data?.projects || [];
  const prospects = data?.prospects || [];
  const error = queryError?.message || '';

  const saveMutation = useMutation({
    mutationFn: ({ event, payload }) => event?.id
      ? base44.entities.CalendarEvent.update(event.id, payload)
      : base44.entities.CalendarEvent.create(payload),
    onMutate: async ({ event, payload }) => {
      await queryClient.cancelQueries({ queryKey: ['calendar-data'] });
      const previous = queryClient.getQueryData(['calendar-data']);
      queryClient.setQueryData(['calendar-data'], (old) => {
        if (!old) return old;
        const id = event?.id || `temp-${Date.now()}`;
        const updated = { ...payload, id };
        const exists = old.events.some(item => item.id === id);
        return {
          ...old,
          events: exists
            ? old.events.map(item => item.id === id ? { ...item, ...updated } : item)
            : [...old.events, updated],
        };
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['calendar-data'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-data'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId) => base44.entities.CalendarEvent.delete(eventId),
    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: ['calendar-data'] });
      const previous = queryClient.getQueryData(['calendar-data']);
      queryClient.setQueryData(['calendar-data'], (old) => {
        if (!old) return old;
        return { ...old, events: old.events.filter(item => item.id !== eventId) };
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['calendar-data'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-data'] });
    },
  });

  const handleSave = async (event, payload) => {
    await saveMutation.mutateAsync({ event, payload });
  };

  const handleRemove = async (eventId) => {
    await deleteMutation.mutateAsync(eventId);
  };

  const gridDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month]);

  const filteredEvents = selectedType === 'all' ? events : events.filter(event => event.event_type === selectedType);
  const upcoming = filteredEvents
    .filter(event => event.status !== 'cancelled' && safeDate(event.end_time)?.getTime() >= Date.now())
    .sort((first, second) => (safeDate(first.start_time)?.getTime() || 0) - (safeDate(second.start_time)?.getTime() || 0))
    .slice(0, 8);

  return (
    <PullToRefresh onRefresh={refetch}>
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Kalender</h1><p className="mt-1 text-sm text-muted-foreground">Boka och hantera säljmöten, projektering, service och installation.</p></div>
      <button onClick={() => setModal({ day: new Date(), event: null })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-primary/20"><Plus className="h-4 w-4" />Ny bokning</button>
    </div>

    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(subMonths(month, 1))} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label="Föregående månad"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setMonth(startOfMonth(new Date()))} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Idag</button>
        <button onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label="Nästa månad"><ChevronRight className="h-4 w-4" /></button>
        <h2 className="ml-2 min-w-44 text-lg font-semibold capitalize">{format(month, 'MMMM yyyy', { locale: sv })}</h2>
      </div>
      <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={selectedType} onChange={event => setSelectedType(event.target.value)}><option value="all">Alla typer</option>{Object.entries(TYPE_CONFIG).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
    </div>

    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">{WEEKDAYS.map(day => <div key={day} className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}</div>
        {loading ? <div className="h-[620px] animate-pulse bg-muted/30" /> : <div className="grid grid-cols-7">
          {gridDays.map(day => {
            const dayEvents = filteredEvents.filter(event => {
              const start = safeDate(event.start_time);
              return start && isSameDay(start, day);
            }).sort((first, second) => (safeDate(first.start_time)?.getTime() || 0) - (safeDate(second.start_time)?.getTime() || 0));
            return <button key={day.toISOString()} onClick={() => setModal({ day, event: null })} className={`min-h-28 border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-muted/30 sm:min-h-32 sm:p-2 ${!isSameMonth(day, month) ? 'bg-muted/20 text-muted-foreground' : ''}`}>
              <span className={`mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday(day) ? 'bg-primary text-white' : ''}`}>{format(day, 'd')}</span>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map(event => {
                  const config = TYPE_CONFIG[event.event_type] || TYPE_CONFIG.other;
                  const start = safeDate(event.start_time);
                  return <span key={event.id} onClick={clickEvent => { clickEvent.stopPropagation(); if (canEditWorkspaceRecord(currentUser || {}, event)) setModal({ day, event }); }} className={`block truncate rounded-md border px-1.5 py-1 text-[10px] font-medium sm:text-xs ${config.chip} ${event.status === 'cancelled' ? 'line-through opacity-50' : ''}`}>{start ? format(start, 'HH:mm') : ''} {event.title}</span>;
                })}
                {dayEvents.length > 3 && <span className="block text-[10px] font-medium text-muted-foreground">+{dayEvents.length - 3} till</span>}
              </div>
            </button>;
          })}
        </div>}
      </div>

      <aside className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /><h3 className="font-semibold">Kommande</h3></div>
        {upcoming.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Inga kommande bokningar.</div> : <div className="space-y-3">{upcoming.map(event => {
          const start = safeDate(event.start_time);
          const config = TYPE_CONFIG[event.event_type] || TYPE_CONFIG.other;
          return <button key={event.id} onClick={() => setModal({ day: start || new Date(), event })} className="w-full rounded-xl border border-border p-3 text-left hover:bg-muted/30">
            <div className="mb-2 flex items-start justify-between gap-2"><span className="font-medium leading-tight">{event.title}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${config.chip}`}>{config.label}</span></div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{start ? format(start, 'EEE d MMM HH:mm', { locale: sv }) : 'Tid saknas'}</div>
            {event.location && <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{event.location}</div>}
            {event.related_project_name && <div className="mt-2 text-xs font-medium text-primary">Projekt: {event.related_project_name}</div>}
          </button>;
        })}</div>}
      </aside>
    </div>

    {modal && <EventModal event={modal.event} selectedDay={modal.day} projects={projects} prospects={prospects} currentUser={currentUser} onClose={() => setModal(null)} onSave={handleSave} onRemove={handleRemove} />}
    </div>
    </PullToRefresh>
  );
}
