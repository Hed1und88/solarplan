import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Package, Pencil, Trash2, Sun, Battery, Zap, Cable, Box, ShieldAlert, ShieldCheck } from 'lucide-react';
import ProductFormModal from '@/components/products/ProductFormModal';
import ProductCatalogImporter from '@/components/products/ProductCatalogImporter';
import ProductVisual from '@/components/products/ProductVisual';
import { productValidationStatus } from '@/lib/productDocuments';

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
  const readyCount = products.filter(product => productValidationStatus(product).ready).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produktsortiment</h1>
          <p className="text-muted-foreground text-sm mt-1">{products.length} produkter totalt · {readyCount} godkända för kalkyl</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ProductCatalogImporter products={products} onDone={load} />
          <button onClick={() => { setEditProduct(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" /> Lägg till produkt
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Produkter får inte användas som kalkylunderlag förrän manual och datablad är uppladdade i appen och teknisk data är hämtad från dokumenten. Importerade katalogprodukter är mallar tills detta är gjort.
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {['alla', ...Object.keys(categoryConfig)].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${filterCat === cat ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}>
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
            const validation = productValidationStatus(product);
            return (
              <div key={product.id} className={`bg-card rounded-2xl border p-4 hover:shadow-md transition-shadow group ${validation.ready ? 'border-green-200' : 'border-amber-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cat.color}`}>
                    <Icon className="w-3 h-3" />{cat.label}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditProduct(product); setShowModal(true); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => handleDelete(product.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>

                <ProductVisual product={product} className="w-full h-28 mb-3" />

                <h3 className="font-semibold text-sm text-foreground leading-snug">{product.name}</h3>
                {product.brand && <p className="text-xs text-muted-foreground mt-0.5">{product.brand} {product.model}</p>}

                <div className={`mt-3 rounded-xl p-2 text-xs ${validation.ready ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                  <div className="flex items-center gap-1 font-semibold">
                    {validation.ready ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                    {validation.ready ? 'Klar för kalkyl' : 'Ej godkänd för kalkyl'}
                  </div>
                  {!validation.ready && <p className="mt-1 line-clamp-2">{validation.message}</p>}
                </div>

                <div className="mt-3 flex items-center justify-between"><p className="text-lg font-bold text-primary">{product.price?.toLocaleString('sv-SE')} kr</p><p className="text-xs text-muted-foreground">/{product.unit || 'st'}</p></div>
                {(product.power_watts || product.capacity_kwh) && <div className="mt-2 flex gap-3">{product.power_watts && <span className="text-xs text-muted-foreground">{product.power_watts}W</span>}{product.capacity_kwh && <span className="text-xs text-muted-foreground">{product.capacity_kwh}kWh</span>}</div>}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <ProductFormModal product={editProduct} onSave={handleSave} onClose={() => { setShowModal(false); setEditProduct(null); }} />}
    </div>
  );
}
