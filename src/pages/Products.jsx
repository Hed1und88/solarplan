import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Package, Pencil, Trash2, Sun, Battery, Zap, Cable, Box, MoreHorizontal } from 'lucide-react';
import ProductFormModal from '@/components/products/ProductFormModal';

const categoryConfig = {
  solpanel: { label: 'Solpanel', icon: Sun, color: 'bg-orange-100 text-orange-700' },
  batteri: { label: 'Batteri', icon: Battery, color: 'bg-green-100 text-green-700' },
  vaxelriktare: { label: 'Växelriktare', icon: Zap, color: 'bg-blue-100 text-blue-700' },
  optimerare: { label: 'Optimerare', icon: Zap, color: 'bg-purple-100 text-purple-700' },
  kabel: { label: 'Kabel', icon: Cable, color: 'bg-gray-100 text-gray-700' },
  montagesystem: { label: 'Montagesystem', icon: Box, color: 'bg-yellow-100 text-yellow-700' },
  ovrigt: { label: 'Övrigt', icon: Package, color: 'bg-gray-100 text-gray-700' },
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [filterCat, setFilterCat] = useState('alla');

  const load = async () => {
    const data = await base44.entities.Product.list('-created_date');
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Ta bort produkt?')) return;
    await base44.entities.Product.delete(id);
    setProducts(p => p.filter(x => x.id !== id));
  };

  const handleSave = () => {
    setShowModal(false);
    setEditProduct(null);
    load();
  };

  const filtered = filterCat === 'alla' ? products : products.filter(p => p.category === filterCat);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Produktsortiment</h1>
          <p className="text-muted-foreground text-sm mt-1">{products.length} produkter totalt</p>
        </div>
        <button
          onClick={() => { setEditProduct(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          <Plus className="w-4 h-4" /> Lägg till produkt
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {['alla', ...Object.keys(categoryConfig)].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
              ${filterCat === cat
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/50'
              }`}
          >
            {cat === 'alla' ? 'Alla' : categoryConfig[cat].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Inga produkter i denna kategori</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => {
            const cat = categoryConfig[product.category] || categoryConfig.ovrigt;
            const Icon = cat.icon;
            return (
              <div key={product.id} className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cat.color}`}>
                    <Icon className="w-3 h-3" />
                    {cat.label}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditProduct(product); setShowModal(true); }}
                      className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>

                {product.image_url && (
                  <img src={product.image_url} alt={product.name} className="w-full h-28 object-contain mb-3 rounded-lg bg-muted" />
                )}

                <h3 className="font-semibold text-sm text-foreground leading-snug">{product.name}</h3>
                {product.brand && <p className="text-xs text-muted-foreground mt-0.5">{product.brand} {product.model}</p>}

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-lg font-bold text-primary">{product.price?.toLocaleString('sv-SE')} kr</p>
                  <p className="text-xs text-muted-foreground">/{product.unit || 'st'}</p>
                </div>

                {(product.power_watts || product.capacity_kwh) && (
                  <div className="mt-2 flex gap-3">
                    {product.power_watts && <span className="text-xs text-muted-foreground">{product.power_watts}W</span>}
                    {product.capacity_kwh && <span className="text-xs text-muted-foreground">{product.capacity_kwh}kWh</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ProductFormModal
          product={editProduct}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditProduct(null); }}
        />
      )}
    </div>
  );
}