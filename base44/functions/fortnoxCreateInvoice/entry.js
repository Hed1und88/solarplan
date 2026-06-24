import { createClientFromRequest } from 'npm:@base44/sdk';

const API_URL = 'https://api.fortnox.se/3';
const TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';

function errorResponse(message, status = 400, details = null) {
  return Response.json({ error: message, details }, { status });
}

async function getAccessToken() {
  const staticToken = Deno.env.get('FORTNOX_ACCESS_TOKEN') || '';
  if (staticToken) return staticToken;

  const clientId = Deno.env.get('FORTNOX_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('FORTNOX_CLIENT_SECRET') || '';
  const tenantId = Deno.env.get('FORTNOX_TENANT_ID') || '';
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Fortnox saknar autentisering. Ange FORTNOX_ACCESS_TOKEN eller FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET och FORTNOX_TENANT_ID som Base44-hemligheter.');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      TenantId: tenantId,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'invoice customer',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Fortnox-token misslyckades med HTTP ${response.status}.`);
  }
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
    const information = data?.ErrorInformation || data?.errorInformation || {};
    throw new Error(information.message || information.Message || data?.error || `Fortnox svarade med HTTP ${response.status}.`);
  }
  return data;
}

async function ensureCustomer(token, invoice) {
  if (invoice.CustomerNumber) return String(invoice.CustomerNumber);
  if (!invoice.CustomerName) throw new Error('Kundnamn eller kundnummer saknas.');

  const response = await fortnoxRequest(token, '/customers', {
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
  const customerNumber = response?.Customer?.CustomerNumber;
  if (!customerNumber) throw new Error('Fortnox skapade kunden men returnerade inget kundnummer.');
  return String(customerNumber);
}

Deno.serve(async request => {
  if (request.method !== 'POST') return errorResponse('Method not allowed.', 405);

  try {
    const base44 = createClientFromRequest(request);
    const user = await base44.auth.me();
    if (!user) return errorResponse('Unauthorized.', 401);

    const body = await request.json();
    const invoice = body?.invoice?.Invoice;
    if (!invoice || !Array.isArray(invoice.InvoiceRows) || invoice.InvoiceRows.length === 0) {
      return errorResponse('Fakturaunderlaget saknar fakturarader.');
    }

    const token = await getAccessToken();
    const customerNumber = await ensureCustomer(token, invoice);
    const payload = {
      Invoice: {
        ...invoice,
        CustomerNumber: customerNumber,
      },
    };
    delete payload.Invoice.CustomerName;
    delete payload.Invoice.Address1;

    const result = await fortnoxRequest(token, '/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return Response.json({
      ok: true,
      workOrderId: body?.workOrderId || '',
      Invoice: result?.Invoice || result,
    });
  } catch (error) {
    console.error('fortnoxCreateInvoice failed', error);
    return errorResponse(error?.message || 'Fortnox-fakturan kunde inte skapas.', 500);
  }
});
