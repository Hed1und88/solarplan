import { useMemo, useState } from 'react';
import { ChevronDown, Package, Search } from 'lucide-react';

function labelFor(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Produkt';
}

function ProductThumb({ product }) {
  if (product?.image_url) {
    return <img src={product.image_url} alt={product.name || labelFor(product)} className="h-10 w-10 rounded-lg bg-muted object-contain" />;
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Package className="h-4 w-4" />
    </div>
  );
}

export default function ProductSearchSelect({ label, products = [], value, onChange, placeholder = 'Sök eller välj produkt' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = products.find((product) => product.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => [product.name, product.brand, product.model, product.category].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div className="relative space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground">
        {selected ? <ProductThumb product={selected} /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Search className="h-4 w-4 text-muted-foreground" /></div>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{selected ? labelFor(selected) : placeholder}</span>
          {selected && <span className="block truncate text-xs text-muted-foreground">{selected.name || selected.category}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök på märke, modell eller namn..." className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-72 overflow-auto p-1">
            {filtered.length === 0 ? <div className="px-3 py-4 text-sm text-muted-foreground">Ingen produkt hittades.</div> : filtered.map((product) => (
              <button key={product.id} type="button" onClick={() => { onChange(product.id); setOpen(false); setQuery(''); }} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted ${product.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                <ProductThumb product={product} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{labelFor(product)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{product.name || product.category}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
