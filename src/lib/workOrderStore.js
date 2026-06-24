// @ts-nocheck -- Base44 entity payloads are runtime-defined and validated by production build.
import { base44 } from '@/api/base44Client';
import { currentUserSafe, filterWorkspaceRecords, withWorkspaceOwnership } from '@/lib/workspaceAccess';

const STORAGE_KEY = 'solarplan:work-orders:v1';
const SETTINGS_KEY = 'solarplan:economy-settings:v1';
const cloudQueues = new Map();

const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const roundMoney = value => Math.round(number(value) * 100) / 100;
const hasValue = value => value !== undefined && value !== null && value !== '';
const orderTime = order => new Date(order?.updatedAt || order?.cloudUpdatedAt || order?.createdAt || 0).getTime() || 0;

export const WORK_ORDER_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'support', label: 'Support' },
  { value: 'installation', label: 'Montage' },
  { value: 'inspection', label: 'Besiktning' },
  { value: 'other', label: 'Övrigt' },
];

export const WORK_ORDER_STATUSES = [
  { value: 'draft', label: 'Utkast' },
  { value: 'planned', label: 'Planerad' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'waiting', label: 'Väntar på åtgärd' },
  { value: 'completed', label: 'Utförd' },
  { value: 'ready_to_invoice', label: 'Klar för fakturering' },
  { value: 'invoiced', label: 'Fakturerad' },
  { value: 'warranty', label: 'Garanti – ej fakturerbar' },
];

export const DEFAULT_ECONOMY_SETTINGS = {
  hourlyRate: 850,
  mileageRate: 25,
  vatRate: 25,
  defaultPaymentTermsDays: 30,
  fortnoxEnabled: false,
  fortnoxFunctionName: 'fortnoxCreateInvoice',
};

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function emitChange(id = '') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('solarplan:work-orders-change', { detail: { id } }));
  }
}

export function readEconomySettings() {
  return { ...DEFAULT_ECONOMY_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
}

export function saveEconomySettings(settings = {}) {
  const next = { ...readEconomySettings(), ...settings };
  writeJson(SETTINGS_KEY, next);
  return next;
}

function normalizeLine(line = {}, type = 'material') {
  const defaultUnit = type === 'time' ? 'tim' : type === 'mileage' ? 'mil' : 'st';
  return {
    id: line.id || uid(type),
    type,
    description: String(line.description || ''),
    quantity: number(hasValue(line.quantity) ? line.quantity : 1),
    unit: String(line.unit || defaultUnit),
    unitPrice: roundMoney(line.unitPrice),
    vatRate: number(line.vatRate ?? 25),
    supplier: String(line.supplier || ''),
    receiptUrl: String(line.receiptUrl || ''),
    receiptName: String(line.receiptName || ''),
    privateExpense: Boolean(line.privateExpense),
    reimbursable: line.reimbursable !== false,
  };
}

export function calculateWorkOrder(order = {}) {
  const pricingMode = order.pricingMode || 'hourly';
  const warranty = Boolean(order.warranty) || order.status === 'warranty';
  const timeLines = (order.timeLines || []).map(line => normalizeLine(line, 'time'));
  const mileageLines = (order.mileageLines || []).map(line => normalizeLine(line, 'mileage'));
  const materialLines = (order.materialLines || []).map(line => normalizeLine(line, 'material'));
  const expenseLines = (order.expenseLines || []).map(line => normalizeLine(line, 'expense'));
  const allLines = [...timeLines, ...mileageLines, ...materialLines, ...expenseLines];
  const lineNet = line => roundMoney(number(line.quantity) * number(line.unitPrice));
  const sumBillable = lines => roundMoney(lines.reduce((sum, line) => sum + (line.reimbursable === false ? 0 : lineNet(line)), 0));
  const variableNet = sumBillable(allLines);
  const nonTimeNet = sumBillable([...mileageLines, ...materialLines, ...expenseLines]);
  const fixedNet = pricingMode === 'fixed' ? roundMoney(order.fixedPrice) : 0;
  const additionalNet = pricingMode === 'fixed' ? roundMoney(order.additionalBillableNet) : 0;
  const invoiceNet = warranty ? 0 : pricingMode === 'fixed' ? roundMoney(fixedNet + additionalNet + nonTimeNet) : variableNet;
  const vat = warranty ? 0 : roundMoney(invoiceNet * number(order.vatRate ?? 25) / 100);
  const invoiceTotal = roundMoney(invoiceNet + vat);
  const privateExpenses = roundMoney(expenseLines.filter(line => line.privateExpense).reduce((sum, line) => sum + lineNet(line), 0));

  return {
    ...order,
    pricingMode,
    warranty,
    timeLines,
    mileageLines,
    materialLines,
    expenseLines,
    calculation: { variableNet, nonTimeNet, fixedNet, additionalNet, invoiceNet, vat, invoiceTotal, privateExpenses },
  };
}

export function createBlankWorkOrder(project = null, settings = readEconomySettings()) {
  return calculateWorkOrder({
    id: uid('wo'),
    number: `AO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    projectId: project?.id || '',
    projectName: project?.name || '',
    customerName: project?.customer_name || '',
    customerNumber: '',
    customerEmail: project?.customer_email || '',
    customerPhone: project?.customer_phone || '',
    address: project?.address || [project?.street_address, project?.postal_code, project?.postal_city].filter(Boolean).join(', '),
    type: 'service',
    status: 'draft',
    title: '',
    description: '',
    requestedWork: '',
    performedWork: '',
    remainingWork: '',
    internalNotes: '',
    assignedTo: '',
    scheduledDate: '',
    completedDate: '',
    pricingMode: 'hourly',
    fixedPrice: 0,
    additionalBillableNet: 0,
    warranty: false,
    vatRate: settings.vatRate,
    paymentTermsDays: settings.defaultPaymentTermsDays,
    timeLines: [normalizeLine({ description: 'Arbetstid', quantity: 0, unitPrice: settings.hourlyRate }, 'time')],
    mileageLines: [normalizeLine({ description: 'Milersättning', quantity: 0, unitPrice: settings.mileageRate }, 'mileage')],
    materialLines: [],
    expenseLines: [],
    attachments: [],
    customerSignature: '',
    technicianSignature: '',
    fortnoxInvoiceNumber: '',
    fortnoxStatus: 'not_sent',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function localRows() {
  const rows = readJson(STORAGE_KEY, []);
  return Array.isArray(rows) ? rows.map(calculateWorkOrder) : [];
}

function writeLocalRows(rows) {
  writeJson(STORAGE_KEY, rows.map(calculateWorkOrder));
}

function upsertLocal(order, notify = true) {
  const calculated = calculateWorkOrder(order);
  const rows = localRows();
  const index = rows.findIndex(item => String(item.id) === String(calculated.id));
  if (index >= 0) rows[index] = calculated;
  else rows.unshift(calculated);
  writeLocalRows(rows);
  if (notify) emitChange(calculated.id);
  return calculated;
}

export function listWorkOrders() {
  return localRows().sort((a, b) => orderTime(b) - orderTime(a));
}

export function getWorkOrder(id) {
  return listWorkOrders().find(order => String(order.id) === String(id)) || null;
}

function cloudEntity() {
  return base44?.entities?.WorkOrder || null;
}

function cloudPayload(order, user) {
  const calculated = calculateWorkOrder(order);
  const data = { ...calculated };
  delete data.calculation;
  return withWorkspaceOwnership({
    work_order_id: calculated.id,
    number: calculated.number,
    project_id: calculated.projectId || '',
    project_name: calculated.projectName || '',
    customer_name: calculated.customerName || '',
    customer_number: calculated.customerNumber || '',
    customer_email: calculated.customerEmail || undefined,
    customer_phone: calculated.customerPhone || '',
    address: calculated.address || '',
    type: calculated.type || 'service',
    status: calculated.status || 'draft',
    title: calculated.title || '',
    assigned_to: calculated.assignedTo || '',
    scheduled_date: calculated.scheduledDate || undefined,
    completed_date: calculated.completedDate || undefined,
    pricing_mode: calculated.pricingMode || 'hourly',
    warranty: Boolean(calculated.warranty),
    invoice_total: calculated.calculation.invoiceTotal,
    private_expenses: calculated.calculation.privateExpenses,
    fortnox_status: calculated.fortnoxStatus || 'not_sent',
    fortnox_invoice_number: calculated.fortnoxInvoiceNumber || '',
    data_json: JSON.stringify(data),
  }, user || {});
}

function decodeCloudRecord(record = {}) {
  let data = {};
  try { data = JSON.parse(record.data_json || '{}'); } catch {}
  return calculateWorkOrder({
    ...data,
    id: data.id || record.work_order_id,
    number: data.number || record.number,
    projectId: data.projectId || record.project_id || '',
    projectName: data.projectName || record.project_name || '',
    customerName: data.customerName || record.customer_name || '',
    customerNumber: data.customerNumber || record.customer_number || '',
    customerEmail: data.customerEmail || record.customer_email || '',
    customerPhone: data.customerPhone || record.customer_phone || '',
    address: data.address || record.address || '',
    type: data.type || record.type || 'service',
    status: data.status || record.status || 'draft',
    title: data.title || record.title || '',
    assignedTo: data.assignedTo || record.assigned_to || '',
    scheduledDate: data.scheduledDate || record.scheduled_date || '',
    completedDate: data.completedDate || record.completed_date || '',
    pricingMode: data.pricingMode || record.pricing_mode || 'hourly',
    warranty: data.warranty ?? record.warranty ?? false,
    fortnoxStatus: data.fortnoxStatus || record.fortnox_status || 'not_sent',
    fortnoxInvoiceNumber: data.fortnoxInvoiceNumber || record.fortnox_invoice_number || '',
    cloudRecordId: record.id,
    cloudUpdatedAt: record.updated_date || record.updated_at || '',
    updatedAt: data.updatedAt || record.updated_date || record.updated_at || nowIso(),
  });
}

function enqueueCloud(orderId, task) {
  const previous = cloudQueues.get(orderId) || Promise.resolve();
  const next = previous.catch(() => null).then(task).finally(() => {
    if (cloudQueues.get(orderId) === next) cloudQueues.delete(orderId);
  });
  cloudQueues.set(orderId, next);
  return next;
}

async function persistCloud(order) {
  const entity = cloudEntity();
  if (!entity?.create) return order;
  const user = await currentUserSafe(base44);
  const payload = cloudPayload(order, user);
  let cloudRecordId = order.cloudRecordId || '';
  if (!cloudRecordId && entity.filter) {
    const matches = await entity.filter({ work_order_id: order.id });
    cloudRecordId = matches?.[0]?.id || '';
  }
  const saved = cloudRecordId
    ? await entity.update(cloudRecordId, payload)
    : await entity.create(payload);
  return upsertLocal({
    ...order,
    cloudRecordId: saved?.id || cloudRecordId,
    cloudUpdatedAt: saved?.updated_date || saved?.updated_at || nowIso(),
    cloudSyncError: '',
  });
}

export function saveWorkOrder(order) {
  const calculated = upsertLocal({ ...order, updatedAt: nowIso(), cloudSyncError: '' });
  enqueueCloud(calculated.id, async () => {
    try {
      await persistCloud(calculated);
    } catch (error) {
      upsertLocal({ ...calculated, cloudSyncError: error?.message || 'Molnsynkronisering misslyckades.' });
    }
  });
  return calculated;
}

export async function syncWorkOrdersFromCloud() {
  const entity = cloudEntity();
  if (!entity?.list) return listWorkOrders();
  try {
    const user = await currentUserSafe(base44);
    const records = filterWorkspaceRecords(await entity.list('-updated_date'), user || {});
    const cloudOrders = records.map(decodeCloudRecord).filter(order => order.id);
    const merged = new Map(listWorkOrders().map(order => [String(order.id), order]));
    cloudOrders.forEach(order => {
      const key = String(order.id);
      const local = merged.get(key);
      if (!local || orderTime(order) >= orderTime(local)) merged.set(key, order);
    });
    const rows = [...merged.values()].sort((a, b) => orderTime(b) - orderTime(a));
    writeLocalRows(rows);
    emitChange();
    return rows;
  } catch {
    return listWorkOrders();
  }
}

export function subscribeToWorkOrders(callback) {
  const entity = cloudEntity();
  if (!entity?.subscribe) return () => {};
  try {
    return entity.subscribe(async () => {
      const rows = await syncWorkOrdersFromCloud();
      callback?.(rows);
    });
  } catch {
    return () => {};
  }
}

export function deleteWorkOrder(id) {
  const existing = getWorkOrder(id);
  writeLocalRows(listWorkOrders().filter(order => String(order.id) !== String(id)));
  emitChange(id);
  enqueueCloud(String(id), async () => {
    const entity = cloudEntity();
    if (!entity?.delete) return;
    let cloudRecordId = existing?.cloudRecordId || '';
    if (!cloudRecordId && entity.filter) {
      const matches = await entity.filter({ work_order_id: id });
      cloudRecordId = matches?.[0]?.id || '';
    }
    if (cloudRecordId) await entity.delete(cloudRecordId);
  });
}

export async function uploadWorkOrderFile(file) {
  if (!file) throw new Error('Ingen fil vald.');
  const result = await base44.integrations.Core.UploadFile({ file });
  const url = result?.file_url || result?.url || '';
  if (!url) throw new Error('Filuppladdningen saknar filadress.');
  return { url, name: file.name, type: file.type, size: file.size };
}

export function buildFortnoxInvoicePayload(order) {
  const calculated = calculateWorkOrder(order);
  if (!calculated.customerName) throw new Error('Kundnamn saknas.');
  if (calculated.warranty) throw new Error('Garantiärenden ska inte faktureras.');
  if (calculated.calculation.invoiceNet <= 0) throw new Error('Fakturabeloppet är 0 kr.');
  const rows = [];
  const pushLine = line => {
    if (!number(line.quantity) || line.reimbursable === false) return;
    rows.push({
      Description: line.description || 'Arbete/material',
      DeliveredQuantity: number(line.quantity),
      Unit: line.unit || 'st',
      Price: roundMoney(line.unitPrice),
      VAT: number(line.vatRate ?? calculated.vatRate ?? 25),
    });
  };
  if (calculated.pricingMode === 'fixed') {
    rows.push({ Description: calculated.title || calculated.type || 'Fast pris', DeliveredQuantity: 1, Unit: 'st', Price: roundMoney(calculated.fixedPrice), VAT: number(calculated.vatRate ?? 25) });
    if (number(calculated.additionalBillableNet) > 0) rows.push({ Description: 'Tilläggsarbete', DeliveredQuantity: 1, Unit: 'st', Price: roundMoney(calculated.additionalBillableNet), VAT: number(calculated.vatRate ?? 25) });
    [...calculated.mileageLines, ...calculated.materialLines, ...calculated.expenseLines].forEach(pushLine);
  } else {
    [...calculated.timeLines, ...calculated.mileageLines, ...calculated.materialLines, ...calculated.expenseLines].forEach(pushLine);
  }
  return {
    Invoice: {
      CustomerNumber: calculated.customerNumber || undefined,
      CustomerName: calculated.customerName,
      Address1: calculated.address || undefined,
      EmailInformation: calculated.customerEmail ? { EmailAddressTo: calculated.customerEmail } : undefined,
      YourReference: calculated.customerName,
      OurReference: calculated.assignedTo || undefined,
      Remarks: [calculated.number, calculated.performedWork].filter(Boolean).join(' – '),
      TermsOfPayment: String(calculated.paymentTermsDays || 30),
      InvoiceRows: rows,
    },
  };
}

export async function sendWorkOrderToFortnox(order, settings = readEconomySettings()) {
  if (!settings.fortnoxEnabled) throw new Error('Fortnox-integrationen är inte aktiverad i ekonomiinställningarna.');
  const payload = buildFortnoxInvoicePayload(order);
  const response = await base44.functions.invoke(settings.fortnoxFunctionName || 'fortnoxCreateInvoice', {
    workOrderId: order.id,
    invoice: payload,
  });
  const data = response?.data || response;
  if (data?.error) throw new Error(data.error);
  return data;
}
