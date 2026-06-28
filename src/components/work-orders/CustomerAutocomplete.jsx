import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Search, UserRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-9 text-sm outline-none focus:border-orange-400';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('sv-SE');
}

function customerAddress(customer = {}) {
  return [customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ');
}

export default function CustomerAutocomplete({ value, onChange, onSelect }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    base44.entities.Customer.list('-created_date')
      .then(rows => {
        if (!active) return;
        setCustomers((Array.isArray(rows) ? rows : []).filter(customer => (customer.status || 'active') === 'active'));
      })
      .catch(error => {
        console.error('Kunde inte hämta kunder till arbetsordern', error);
        if (active) setCustomers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const query = normalize(value);
    if (!query) return [];
    return customers
      .filter(customer => [
        customer.name,
        customer.contact_name,
        customer.organization_number,
        customer.email,
        customer.phone,
        customer.address,
        customer.postal_code,
        customer.city,
      ].some(field => normalize(field).includes(query)))
      .slice(0, 8);
  }, [customers, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const choose = customer => {
    onSelect?.({
      customerId: customer.id,
      customerName: customer.name || '',
      customerEmail: customer.email || '',
      customerPhone: customer.phone || '',
      address: customerAddress(customer),
      customerContactName: customer.contact_name || '',
      customerOrganizationNumber: customer.organization_number || '',
    });
    setOpen(false);
  };

  const onKeyDown = event => {
    if (!open || !matches.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <label className="relative text-xs font-medium text-slate-600">
      Kund
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={inputClass}
          value={value ?? ''}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && Boolean(value)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={event => {
            onChange?.(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Skriv kundnamn..."
        />
        {loading && <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {open && normalize(value) && (
        <div className="absolute left-0 right-0 z-[70] mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {matches.length ? matches.map((customer, index) => {
            const address = customerAddress(customer);
            const Icon = customer.customer_type === 'company' ? Building2 : UserRound;
            return (
              <button
                key={customer.id}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => choose(customer)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${index === activeIndex ? 'bg-orange-50 text-slate-950' : 'hover:bg-slate-50'}`}
              >
                <span className="mt-0.5 rounded-lg bg-orange-100 p-1.5 text-orange-600"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{customer.name}</span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
                    {[customer.contact_name, customer.phone, customer.email].filter(Boolean).join(' · ') || 'Inga kontaktuppgifter'}
                  </span>
                  {address && <span className="mt-0.5 block truncate text-xs font-normal text-slate-400">{address}</span>}
                </span>
              </button>
            );
          }) : (
            <div className="px-3 py-3 text-sm font-normal text-slate-500">Ingen registrerad kund matchar sökningen.</div>
          )}
        </div>
      )}
    </label>
  );
}
