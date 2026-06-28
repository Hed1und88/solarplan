import { useEffect } from 'react';
import WorkOrderDetailPage from '@/pages/WorkOrderDetailPage.jsx';
import { base44 } from '@/api/base44Client';

const DATALIST_ID = 'solarplan-work-order-customers';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('sv-SE');
}

function findInputByLabel(labelText) {
  const target = normalize(labelText);
  const label = Array.from(document.querySelectorAll('label')).find(item => {
    const firstText = Array.from(item.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join(' ');
    return normalize(firstText) === target;
  });
  return label?.querySelector('input') || null;
}

function setReactInputValue(input, value) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value || '');
  else input.value = value || '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function fullAddress(customer = {}) {
  return [customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ');
}

function WorkOrderCustomerSearchEnhancer() {
  useEffect(() => {
    let disposed = false;
    let cleanupInput = null;
    let observer = null;

    const mount = customers => {
      if (disposed) return;
      const customerInput = findInputByLabel('Kund');
      if (!customerInput) return false;

      let datalist = document.getElementById(DATALIST_ID);
      if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = DATALIST_ID;
        document.body.appendChild(datalist);
      }
      datalist.replaceChildren(...customers.map(customer => {
        const option = document.createElement('option');
        option.value = customer.name || '';
        option.label = [customer.contact_name, customer.phone, customer.city].filter(Boolean).join(' · ');
        return option;
      }));

      customerInput.setAttribute('list', DATALIST_ID);
      customerInput.setAttribute('autocomplete', 'off');

      const applyCustomer = () => {
        const selected = customers.find(customer => normalize(customer.name) === normalize(customerInput.value));
        if (!selected) return;
        setReactInputValue(findInputByLabel('E-post'), selected.email);
        setReactInputValue(findInputByLabel('Telefon'), selected.phone);
        setReactInputValue(findInputByLabel('Adress'), fullAddress(selected));
      };

      customerInput.addEventListener('input', applyCustomer);
      customerInput.addEventListener('change', applyCustomer);
      cleanupInput = () => {
        customerInput.removeEventListener('input', applyCustomer);
        customerInput.removeEventListener('change', applyCustomer);
        customerInput.removeAttribute('list');
      };
      return true;
    };

    base44.entities.Customer.list('-created_date')
      .then(rows => {
        if (disposed) return;
        const customers = (Array.isArray(rows) ? rows : []).filter(customer => (customer.status || 'active') === 'active' && customer.name);
        if (mount(customers)) return;
        observer = new MutationObserver(() => {
          cleanupInput?.();
          cleanupInput = null;
          if (mount(customers)) observer?.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      })
      .catch(error => console.error('Kunde inte aktivera kundsökning i arbetsorder', error));

    return () => {
      disposed = true;
      cleanupInput?.();
      observer?.disconnect();
      document.getElementById(DATALIST_ID)?.remove();
    };
  }, []);

  return null;
}

export default function WorkOrderDetailCustomerSearchPage() {
  return (
    <>
      <WorkOrderCustomerSearchEnhancer />
      <WorkOrderDetailPage />
    </>
  );
}
