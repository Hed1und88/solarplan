import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'solarplan:work-orders:v1';
const SETTINGS_KEY = 'solarplan:economy-settings:v1';

const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const roundMoney = value => Math.round(number(value) * 100) / 100;
const hasValue = value => value !== undefined && value !== null && value !== '';

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
    calculation: {
      variableNet,
      nonTimeNet,
      fixedNet,
      additionalNet,
      invoiceNet,
      vat,
      invoiceTotal,
      privateExpenses,
    },
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

export function listWorkOrders() {
  const rows = readJson(STORAGE_KEY, []);
  return Array.isArray(rows) ? rows.map(calculateWorkOrder).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) : [];
}

export function getWorkOrder(id) {
  return listWorkOrders().find(order => String(order.id) === String(id)) || null;
}

export function saveWorkOrder(order) {
  const calculated = calculateWorkOrder({ ...order, updatedAt: nowIso() });
  const rows = listWorkOrders();
  const index = rows.findIndex(item => String(item.id) === String(calculated.id));
  if (index >= 0) rows[index] = calculated;
  else rows.unshift(calculated);
  writeJson(STORAGE_KEY, rows);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('solarplan:work-orders-change', { detail: { id: calculated.id } }));
  return calculated;
}

export function deleteWorkOrder(id) {
  const rows = listWorkOrders().filter(order => String(order.id) !== String(id));
  writeJson(STORAGE_KEY, rows);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('solarplan:work-orders-change', { detail: { id } }));
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
