import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Minus, Trash2, ShoppingCart, Loader2, Sun, Battery, Zap, Package } from 'lucide-react';

const categoryIcons = {
  solpanel: Sun,
  batteri: Battery,
  vaxelriktare: Zap,
  optimerare: Zap,
  kabel: Package,
  montagesystem: Package,
  ovrigt: Package,
};

export default function ProductSelector({ project, onUpdate }) {
  const [allProducts, setAllProducts] = useState([]);
  const [selected, setSelected] = useState(project.selected_products || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('alla');

  useEffect(() => {
    base44.entities.Product.list('-name').then(data => {
      setAllProducts(data);
      setLoading(false);
    });
  }, []);

  const save = async (newSelected) => {
    setSaving(true);
    const total = newSelected.reduce((s, item) => s + (item.unit_price * item.quantity), 0);
    await onUpdate({ selected_products: newSelected, total_cost: total });
    setSaving(false);
  };

  const addProduct = (product) => {
    const exists = selected.find(s => s.product_id === product.id);
    if (exists) {
      updateQty(product.id, exists.quantity + 1);
    } else {
      const updated = [...selected, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price,
        category: product.category,
      }];
      setSelected(updated);
      save(updated);
    }
  };

  const updateQty = (productId, qty) => {
    if (qty <= 0) {
      removeProduct(productId);
      return;
    }
    const updated = selected.map(s => s.product_id === productId ? { ...s, quantity: qty } : s);
    setSelected(updated);
    save(updated);
  };

  const removeProduct = (productId) => {
    const updated = selected.filter(s => s.product_id !== productId);
    setSelected(updated);
    save(updated);
  };

  const total = selected.reduce((s, item) => s + (item.unit_price * item.quantity), 0);

  const categories = ['alla', ...new Set(allProducts.map(p => p.category))];
  const filtered = filterCat === 'alla' ? allProducts : allProducts.filter(p => p.category === filterCat);

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Product catalog */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="font-semibold text-sm mb-3">Välj produkter</h3>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap mb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${filterCat === cat ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {cat === 'alla' ? 'Alla' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Inga produkter i sortimentet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(product => {
              const Icon = categoryIcons[product.category] || Package;
              const inCart = selected.find(s => s.product_id === product.id);
              return (
                <div
                  key={product.id}
                  className={`p-3 rounded-xl border transition-all ${inCart ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{product.name}</p>
                      <p className="text-xs text-primary font-semibold">{product.price?.toLocaleString('sv-SE')} kr/{product.unit || 'st'}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(product.id, inCart.quantity - 1)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-semibold w-6 text-center">{inCart.quantity}</span>
                        <button onClick={() => updateQty(product.id, inCart.quantity + 1)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addProduct(product)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> Lägg till
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart / Quote */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Offert</h3>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {selected.length === 0 ? (
            <p className="text-muted-foreground text-xs text-center py-8">Ingen produkt vald ännu</p>
          ) : (
            <div className="space-y-2">
              {selected.map(item => (
                <div key={item.product_id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} × {item.unit_price?.toLocaleString('sv-SE')} kr</p>
                  </div>
                  <p className="text-xs font-semibold flex-shrink-0">{(item.quantity * item.unit_price).toLocaleString('sv-SE')} kr</p>
                  <button onClick={() => removeProduct(item.product_id)} className="p-1 hover:bg-red-50 rounded">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-muted-foreground">Delsumma</p>
              <p className="text-sm">{total.toLocaleString('sv-SE')} kr</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="font-semibold">Totalt exkl. moms</p>
              <p className="font-bold text-primary text-lg">{total.toLocaleString('sv-SE')} kr</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">Inkl. moms (25%)</p>
              <p className="text-xs text-muted-foreground">{(total * 1.25).toLocaleString('sv-SE')} kr</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}