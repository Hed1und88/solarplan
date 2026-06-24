// @ts-nocheck -- Base44 entity payloads are runtime-defined and validated by production build.
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Filter, Plus, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  createBlankWorkOrder,
  listWorkOrders,
  saveWorkOrder,
  subscribeToWorkOrders,
  syncWorkOrdersFromCloud,
} from '@/lib/workOrderStore';

const statusName = value => WORK_ORDER_STATUSES.find(item => item.value === value)?.label || value;
const typeName = value => WORK_ORDER_TYPES.find(item => item.value === value)?.label || value;
const statusTone = value => ({
  draft: 'bg-slate-100 text-slate-700', planned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-800', waiting: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700', ready_to_invoice: 'bg-orange-100 text-orange-700',
  invoiced: 'bg-emerald-100 text-emerald-700', warranty: 'bg-rose-100 text-rose-700',
}[value] || 'bg-slate-100 text-slate-700');

export default function WorkOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(() => listWorkOrders());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-work-orders'],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  useEffect(() => {
    let active = true;
    const refresh = () => setOrders(listWorkOrders());
    const unsubscribe = subscribeToWorkOrders(rows => {
      if (active) setOrders(rows);
    });
    window.addEventListener('solarplan:work-orders-change', refresh);
    window.addEventListener('storage', refresh);
    syncWorkOrdersFromCloud().then(rows => {
      if (active) setOrders(rows);
    });
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('solarplan:work-orders-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(() => orders.filter(order => {
    const text = [order.number, order.customerName, order.projectName, order.title, order.address].join(' ').toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (status === 'all' || order.status === status)
      && (type === 'all' || order.type === type);
  }), [orders, search, status, type]);

  const createOrder = projectId => {
    const project = projects.find(item => String(item.id) === String(projectId)) || null;
    const order = saveWorkOrder(createBlankWorkOrder(project));
    navigate(`/work-orders/${order.id}`);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 lg:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="h-6 w-6 text-orange-500" />Arbetsorder</h1>
          <p className="mt-1 text-sm text-slate-500">Service, support, montage, arbetstid, mil, material och utlägg.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select defaultValue="" onChange={event => createOrder(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Ny från projekt…</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <Button onClick={() => createOrder('')} className="gap-2 bg-orange-500 text-white hover:bg-orange-600"><Plus className="h-4 w-4" />Ny arbetsorder</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök kund, projekt eller arbetsorder" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm" /></label>
        <label className="relative"><Filter className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm"><option value="all">Alla statusar</option>{WORK_ORDER_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <select value={type} onChange={event => setType(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">Alla typer</option>{WORK_ORDER_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length ? <div className="divide-y divide-slate-100">{filtered.map(order => (
          <Link key={order.id} to={`/work-orders/${order.id}`} className="grid gap-3 p-4 hover:bg-slate-50 md:grid-cols-[150px_1fr_150px_170px_130px] md:items-center">
            <div><div className="font-mono text-xs font-semibold text-slate-600">{order.number}</div><div className="text-xs text-slate-400">{order.scheduledDate || 'Ej schemalagd'}</div></div>
            <div className="min-w-0"><div className="truncate font-semibold">{order.customerName || 'Kund saknas'}</div><div className="truncate text-sm text-slate-500">{order.title || order.projectName || typeName(order.type)}</div></div>
            <div className="text-sm text-slate-600">{typeName(order.type)}</div>
            <Badge className={`w-fit ${statusTone(order.status)}`}>{statusName(order.status)}</Badge>
            <div className="text-right font-semibold">{order.calculation.invoiceTotal.toLocaleString('sv-SE')} kr</div>
          </Link>
        ))}</div> : <div className="p-12 text-center text-slate-500">Inga arbetsorder hittades.</div>}
      </div>
    </div>
  );
}
