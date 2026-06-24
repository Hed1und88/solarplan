import { createClientFromRequest } from 'npm:@base44/sdk';

const TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';
const API_URL = 'https://api.fortnox.se/3';

function jsonError(message, status = 400, details = null) {
  return Response.json({ error: message, details }, { status });
}

async function fortnoxAccessToken() {
  const clientId = Deno.env.get('FORTNOX_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('FORTNOX_CLIENT_SECRET') || '';
  const tenantId = Deno.env.get('FORTNOX_TENANT_ID') || '';
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Fortnox är inte konfigurerat. FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET och FORTNOX_TENANT_ID måste sparas som Base44-hemligheter.');
  }
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      TenantId: tenantId,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'invoice customer' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Fortnox kunde inte utfärda access-token.');
  return data.access_token;
}

async function fortnoxRequest(token, path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.ErrorInformation?.message || data?.ErrorInformation?.Message || data?.error || `Fortnox svarade med HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

async function ensureCustomer(token, invoice) {
  if (invoice.CustomerNumber) return invoice.CustomerNumber;
  if (!invoice.CustomerName) throw new Error('Kundnamn eller kundnummer saknas.');
  const customer = await fortnoxRequest(token, '/customers', {
    method: 'POST',
    body: JSON.stringify({
      Customer: {
        Name: invoice.CustomerName,
        Address1: invoice.Address1 || undefined,
        Email: invoice.EmailInformation?.EmailAddressTo || undefined,
        Type: 'COMPANY',
      },
    }),
  });
  const customerNumber = customer?.Customer?.CustomerNumber;
  if (!customerNumber) throw new Error('Fortnox skapade kunden men returnerade inget kundnummer.');
  return customerNumber;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError('Unauthorized.', 401);

    const body = await req.json();
    const invoicePayload = body?.invoice;
    const invoice = invoicePayload?.Invoice;
    if (!invoice || !Array.isArray(invoice.InvoiceRows) || !invoice.InvoiceRows.length) return jsonError('Fakturaunderlaget saknar fakturarader.');

    const token = await fortnoxAccessToken();
    const customerNumber = await ensureCustomer(token, invoice);
    const result = await fortnoxRequest(token, '/invoices', {
      method: 'POST',
      body: JSON.stringify({ Invoice: { ...invoice, CustomerNumber: customerNumber, CustomerName: undefined, Address1: undefined } }),
    });

    return Response.json({
      ok: true,
      workOrderId: body?.workOrderId || '',
      Invoice: result?.Invoice || result,
    });
  } catch (error) {
    console.error('fortnoxCreateInvoice failed', error);
    return jsonError(error?.message || 'Fortnox-fakturan kunde inte skapas.', 500);
  }
});
