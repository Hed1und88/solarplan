// @ts-nocheck -- Base44 entity payloads are runtime-defined and validated by production build.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, calculateWorkOrder, deleteWorkOrder, getWorkOrder, saveWorkOrder, subscribeToWorkOrders, syncWorkOrdersFromCloud, uploadWorkOrderFile } from '@/lib/workOrderStore';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400';
const newId = type => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = value => Number(value || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, value, onChange, type = 'text' }) {
  return <label className="text-xs font-medium text-slate-600">{label}<input className={inputClass} type={type} value={value ?? ''} onChange={event => onChange(type === 'number' ? Number(event.target.value) : event.target.value)} /></label>;
}
function Area({ label, value, onChange }) {
  return <label className="text-xs font-medium text-slate-600">{label}<textarea rows="4" className={inputClass} value={value || ''} onChange={event => onChange(event.target.value)} /></label>;
}
function Section({ title, children, action }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>{action}</div>{children}</section>;
}
function Lines({ title, field, lines, setOrder, receipts = false }) {
  const unit = field === 'timeLines' ? 'tim' : field === 'mileageLines' ? 'mil' : 'st';
  const change = (lineId, patch) => setOrder(current => ({ ...current, [field]: (current[field] || []).map(line => line.id === lineId ? { ...line, ...patch } : line) }));
  const add = () => setOrder(current => ({ ...current, [field]: [...(current[field] || []), { id: newId(field), description: '', quantity: 0, unit, unitPrice: 0, vatRate: current.vatRate || 25, privateExpense: receipts, reimbursable: true }] }));
  const remove = lineId => setOrder(current => ({ ...current, [field]: (current[field] || []).filter(line => line.id !== lineId) }));
  const upload = async (line, file) => { if (file) { const saved = await uploadWorkOrderFile(file); change(line.id, { receiptUrl: saved.url, receiptName: saved.name }); } };
  return <Section title={title} action={<Button type="button" size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" />Lägg till</Button>}>
    <div className="space-y-3">{(lines || []).map(line => <div key={line.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_90px_90px_120px_80px_40px] md:items-end">
        <Field label="Beskrivning" value={line.description} onChange={value => change(line.id, { description: value })} />
        <Field label="Antal" type="number" value={line.quantity} onChange={value => change(line.id, { quantity: value })} />
        <Field label="Enhet" value={line.unit} onChange={value => change(line.id, { unit: value })} />
        <Field label="Pris/st exkl." type="number" value={line.unitPrice} onChange={value => change(line.id, { unitPrice: value })} />
        <div className="pb-2 text-right text-sm font-semibold">{money(Number(line.quantity || 0) * Number(line.unitPrice || 0))}</div>
        <button type="button" onClick={() => remove(line.id)} className="h-10 rounded-xl text-red-500 hover:bg-red-50"><Trash2 className="mx-auto h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={line.reimbursable !== false} onChange={event => change(line.id, { reimbursable: event.target.checked })} />Faktureras</label>{receipts && <><label className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-xs"><Upload className="mr-1 inline h-4 w-4" />{line.receiptName || 'Fota/ladda upp kvitto'}<input className="hidden" type="file" accept="image/*,application/pdf" capture="environment" onChange={event => upload(line, event.target.files?.[0])} /></label>{line.receiptUrl ? <a className="text-xs text-blue-600" href={line.receiptUrl} target="_blank" rel="noreferrer">Öppna kvitto</a> : <span className="text-xs text-red-600">Kvitto krävs</span>}</>}</div>
    </div>)}</div>
  </Section>;
}

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(() => getWorkOrder(id));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const totals = useMemo(() => calculateWorkOrder(order || {}).calculation, [order]);

  useEffect(() => {
    let active = true;
    const reload = rows => {
      const found = (rows || []).find(item => String(item.id) === String(id)) || getWorkOrder(id);
      if (active && found) setOrder(found);
    };
    const unsubscribe = subscribeToWorkOrders(reload);
    syncWorkOrdersFromCloud().then(reload).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [id]);

  if (!order && loading) return <div className="p-8 text-slate-500">Laddar arbetsorder…</div>;
  if (!order) return <div className="p-8">Arbetsordern hittades inte. <Link className="text-blue-600" to="/work-orders">Gå tillbaka</Link></div>;
  const patch = values => setOrder(current => ({ ...current, ...values }));
  const save = nextStatus => {
    if (nextStatus === 'ready_to_invoice') {
      if (!String(order.customerName || '').trim()) { setMessage('Kundnamn måste anges innan fakturering.'); return; }
      if (!String(order.performedWork || '').trim()) { setMessage('Utfört arbete måste beskrivas innan fakturering.'); return; }
      if ((order.expenseLines || []).some(line => line.privateExpense && !line.receiptUrl)) { setMessage('Privata utlägg måste ha kvitto innan fakturering.'); return; }
      if (!(totals.invoiceNet > 0)) { setMessage('Fakturabeloppet måste vara större än 0 kr.'); return; }
    }
    const status = order.warranty && nextStatus === 'ready_to_invoice' ? 'warranty' : nextStatus;
    const finished = ['ready_to_invoice', 'warranty'].includes(status);
    const saved = saveWorkOrder({ ...order, ...(status ? { status } : {}), ...(finished && !order.completedDate ? { completedDate: new Date().toISOString().slice(0, 10) } : {}) });
    setOrder(saved);
    setMessage(status === 'warranty' ? 'Garantiärendet är slutfört.' : status === 'ready_to_invoice' ? 'Klar för fakturering.' : 'Sparad.');
  };
  const uploadAttachment = async file => { if (file) { const uploaded = await uploadWorkOrderFile(file); patch({ attachments: [...(order.attachments || []), uploaded] }); } };

  return <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Link to="/work-orders" className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" />Arbetsorder</Link><h1 className="mt-2 text-2xl font-bold">{order.number}</h1><p className="text-sm text-slate-500">{order.customerName || 'Kund saknas'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => save()}><Save className="mr-2 h-4 w-4" />Spara</Button><Button className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => save('ready_to_invoice')}><CheckCircle2 className="mr-2 h-4 w-4" />{order.warranty ? 'Slutför garantiärende' : 'Klar för fakturering'}</Button></div></div>
    {message && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-[1fr_350px]"><div className="space-y-4">
      <Section title="Kund och arbetsorder"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Kund" value={order.customerName} onChange={value => patch({ customerName: value })} /><Field label="Kundnummer Fortnox" value={order.customerNumber} onChange={value => patch({ customerNumber: value })} /><Field label="Projekt" value={order.projectName} onChange={value => patch({ projectName: value })} /><Field label="E-post" value={order.customerEmail} onChange={value => patch({ customerEmail: value })} /><Field label="Telefon" value={order.customerPhone} onChange={value => patch({ customerPhone: value })} /><Field label="Adress" value={order.address} onChange={value => patch({ address: value })} />
        <label className="text-xs font-medium text-slate-600">Typ<select className={inputClass} value={order.type} onChange={event => patch({ type: event.target.value })}>{WORK_ORDER_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Status<select className={inputClass} value={order.status} onChange={event => patch({ status: event.target.value })}>{WORK_ORDER_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><Field label="Ansvarig" value={order.assignedTo} onChange={value => patch({ assignedTo: value })} /><Field label="Planerat datum" type="date" value={order.scheduledDate} onChange={value => patch({ scheduledDate: value })} /><Field label="Slutfört datum" type="date" value={order.completedDate} onChange={value => patch({ completedDate: value })} /><Field label="Rubrik" value={order.title} onChange={value => patch({ title: value })} />
      </div></Section>
      <Section title="Service- eller montagerapport"><div className="grid gap-3 md:grid-cols-2"><Area label="Beställt/felbeskrivning" value={order.requestedWork} onChange={value => patch({ requestedWork: value })} /><Area label="Utfört arbete" value={order.performedWork} onChange={value => patch({ performedWork: value })} /><Area label="Återstående åtgärder" value={order.remainingWork} onChange={value => patch({ remainingWork: value })} /><Area label="Interna anteckningar" value={order.internalNotes} onChange={value => patch({ internalNotes: value })} /></div></Section>
      <Lines title="Arbetstid" field="timeLines" lines={order.timeLines} setOrder={setOrder} /><Lines title="Milersättning" field="mileageLines" lines={order.mileageLines} setOrder={setOrder} /><Lines title="Materialåtgång" field="materialLines" lines={order.materialLines} setOrder={setOrder} /><Lines title="Privata utlägg" field="expenseLines" lines={order.expenseLines} setOrder={setOrder} receipts />
      <Section title="Bilder och bilagor" action={<label className="cursor-pointer rounded-xl border px-3 py-2 text-xs"><Upload className="mr-1 inline h-4 w-4" />Ladda upp<input className="hidden" type="file" accept="image/*,application/pdf" onChange={event => uploadAttachment(event.target.files?.[0])} /></label>}><div className="grid gap-2 sm:grid-cols-2">{(order.attachments || []).map((file, index) => <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer" className="rounded-xl border px-3 py-2 text-sm text-blue-600">{file.name || `Bilaga ${index + 1}`}</a>)}</div></Section>
    </div><div className="space-y-4">
      <Section title="Debitering"><label className="text-xs font-medium text-slate-600">Prisform<select className={inputClass} value={order.pricingMode} onChange={event => patch({ pricingMode: event.target.value })}><option value="hourly">Löpande räkning</option><option value="fixed">Fast pris</option></select></label>{order.pricingMode === 'fixed' && <div className="mt-3 space-y-3"><Field label="Fast pris exkl. moms" type="number" value={order.fixedPrice} onChange={value => patch({ fixedPrice: value })} /><Field label="Tillägg exkl. moms" type="number" value={order.additionalBillableNet} onChange={value => patch({ additionalBillableNet: value })} /><p className="text-xs text-slate-500">Fakturerbara mil, material och utlägg läggs ovanpå det fasta priset.</p></div>}<label className="mt-3 flex gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={Boolean(order.warranty)} onChange={event => patch({ warranty: event.target.checked, status: event.target.checked ? 'warranty' : order.status === 'warranty' ? 'draft' : order.status })} />Garanti – ej fakturerbar</label><div className="mt-4 space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>Exkl. moms</span><b>{money(totals.invoiceNet)} kr</b></div><div className="flex justify-between"><span>Moms</span><b>{money(totals.vat)} kr</b></div><div className="flex justify-between text-lg"><span>Att fakturera</span><b>{money(totals.invoiceTotal)} kr</b></div><div className="flex justify-between text-slate-500"><span>Privata utlägg</span><span>{money(totals.privateExpenses)} kr</span></div></div></Section>
      <Section title="Godkännande"><div className="space-y-3"><Field label="Kundens namn/signatur" value={order.customerSignature} onChange={value => patch({ customerSignature: value })} /><Field label="Teknikerns namn/signatur" value={order.technicianSignature} onChange={value => patch({ technicianSignature: value })} /></div></Section>
      <button type="button" onClick={() => { if (window.confirm('Ta bort arbetsordern?')) { deleteWorkOrder(order.id); navigate('/work-orders'); } }} className="w-full rounded-xl border border-red-200 p-3 text-sm font-medium text-red-600"><Trash2 className="mr-2 inline h-4 w-4" />Ta bort arbetsorder</button>
    </div></div>
  </div>;
}
