import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Banknote, CheckCircle2, FileCheck2, Receipt, RefreshCw, Send, Settings2 } from 'lucide-react';
import { listWorkOrders, readEconomySettings, saveEconomySettings, saveWorkOrder, sendWorkOrderToFortnox, subscribeToWorkOrders, syncWorkOrdersFromCloud } from '@/lib/workOrderStore';

const money = value => Number(value || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400';

function Stat({ title, value, icon: Icon, tone = 'text-slate-950' }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{title}</span><Icon className="h-5 w-5 text-slate-400" /></div><div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div></div>;
}

export default function Economy() {
  const [orders, setOrders] = useState(() => listWorkOrders());
  const [settings, setSettings] = useState(() => readEconomySettings());
  const [sendingId, setSendingId] = useState('');
  const [message, setMessage] = useState('');

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

  const ready = orders.filter(order => order.status === 'ready_to_invoice');
  const invoiced = orders.filter(order => order.status === 'invoiced');
  const pending = orders.filter(order => !['invoiced', 'warranty'].includes(order.status));
  const totals = useMemo(() => ({
    ready: ready.reduce((sum, order) => sum + order.calculation.invoiceTotal, 0),
    invoiced: invoiced.reduce((sum, order) => sum + order.calculation.invoiceTotal, 0),
    privateExpenses: orders.reduce((sum, order) => sum + order.calculation.privateExpenses, 0),
  }), [orders]);

  const updateSettings = patch => setSettings(current => ({ ...current, ...patch }));
  const persistSettings = () => { setSettings(saveEconomySettings(settings)); setMessage('Ekonomiinställningarna är sparade.'); };
  const sendInvoice = async order => {
    setSendingId(order.id); setMessage('');
    try {
      const response = await sendWorkOrderToFortnox(order, settings);
      const invoice = response?.Invoice || response?.invoice || response;
      const invoiceNumber = invoice?.DocumentNumber || invoice?.documentNumber || invoice?.InvoiceNumber || '';
      saveWorkOrder({ ...order, status: 'invoiced', fortnoxStatus: 'sent', fortnoxInvoiceNumber: String(invoiceNumber || '') });
      setOrders(listWorkOrders());
      setMessage(`Fakturan skickades till Fortnox${invoiceNumber ? ` med nummer ${invoiceNumber}` : ''}.`);
    } catch (error) {
      setMessage(error?.message || 'Fakturan kunde inte skickas till Fortnox.');
    } finally { setSendingId(''); }
  };

  return <div className="mx-auto max-w-[1500px] space-y-5 p-4 lg:p-7">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Banknote className="h-6 w-6 text-orange-500" />Ekonomi</h1><p className="mt-1 text-sm text-slate-500">Faktureringsunderlag från arbetsorder, utlägg och Fortnox.</p></div>
    {message && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat title="Klara för fakturering" value={`${ready.length} st`} icon={FileCheck2} tone="text-orange-600" />
      <Stat title="Att fakturera" value={`${money(totals.ready)} kr`} icon={Receipt} />
      <Stat title="Fakturerat" value={`${money(totals.invoiced)} kr`} icon={CheckCircle2} tone="text-emerald-600" />
      <Stat title="Privata utlägg" value={`${money(totals.privateExpenses)} kr`} icon={Banknote} />
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">Klara för fakturering</h2><p className="text-sm text-slate-500">Kontrollera kundnummer, underlag och kvitton innan fakturan skickas.</p></div>
      {ready.length ? <div className="divide-y divide-slate-100">{ready.map(order => <div key={order.id} className="grid gap-3 p-4 md:grid-cols-[150px_1fr_150px_160px_190px] md:items-center">
        <div><div className="font-mono text-xs font-semibold text-slate-600">{order.number}</div><div className="text-xs text-slate-400">{order.completedDate || order.updatedAt?.slice(0, 10)}</div></div>
        <div><Link to={`/work-orders/${order.id}`} className="font-semibold text-slate-950 hover:text-orange-600">{order.customerName || 'Kund saknas'}</Link><div className="text-sm text-slate-500">{order.title || order.projectName}</div></div>
        <Badge variant="outline" className="w-fit">{order.pricingMode === 'fixed' ? 'Fast pris' : 'Löpande'}</Badge>
        <div className="font-semibold">{money(order.calculation.invoiceTotal)} kr</div>
        <Button disabled={sendingId === order.id} onClick={() => sendInvoice(order)} className="gap-2 bg-orange-500 text-white hover:bg-orange-600"><Send className="h-4 w-4" />{sendingId === order.id ? 'Skickar…' : 'Skicka till Fortnox'}</Button>
      </div>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Inga kunder är klara för fakturering.</div>}
    </section>

    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-semibold">Pågående fakturaunderlag</h2></div>{pending.length ? <div className="divide-y">{pending.slice(0, 12).map(order => <Link key={order.id} to={`/work-orders/${order.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"><div><div className="font-semibold">{order.customerName || 'Kund saknas'}</div><div className="text-sm text-slate-500">{order.number} · {order.title || order.projectName}</div></div><div className="text-right"><div className="font-semibold">{money(order.calculation.invoiceTotal)} kr</div><div className="text-xs text-slate-400">{order.status}</div></div></Link>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Inga pågående underlag.</div>}</section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-slate-500" /><h2 className="font-semibold">Ekonomi och Fortnox</h2></div><div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Timpris exkl. moms<input className={inputClass} type="number" value={settings.hourlyRate} onChange={event => updateSettings({ hourlyRate: Number(event.target.value) })} /></label>
        <label className="text-xs font-medium text-slate-600">Milersättning per mil<input className={inputClass} type="number" value={settings.mileageRate} onChange={event => updateSettings({ mileageRate: Number(event.target.value) })} /></label>
        <label className="text-xs font-medium text-slate-600">Moms %<input className={inputClass} type="number" value={settings.vatRate} onChange={event => updateSettings({ vatRate: Number(event.target.value) })} /></label>
        <label className="text-xs font-medium text-slate-600">Betalningsvillkor dagar<input className={inputClass} type="number" value={settings.defaultPaymentTermsDays} onChange={event => updateSettings({ defaultPaymentTermsDays: Number(event.target.value) })} /></label>
      </div><label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input className="mt-1" type="checkbox" checked={Boolean(settings.fortnoxEnabled)} onChange={event => updateSettings({ fortnoxEnabled: event.target.checked })} /><span><span className="block text-sm font-semibold">Fortnox-integration aktiverad</span><span className="block text-xs text-slate-500">Kräver distribuerad backendfunktion och Fortnox-hemligheter i Base44.</span></span></label><Button onClick={persistSettings} className="mt-4 w-full gap-2"><RefreshCw className="h-4 w-4" />Spara inställningar</Button></section>
    </div>
  </div>;
}
