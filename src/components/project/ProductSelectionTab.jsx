import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Save, Trash2 } from 'lucide-react';

const categoryLabels = { solpanel: 'Solpanel', batteri: 'Batteri', vaxelriktare: 'Växelriktare', optimerare: 'Optimerare', kabel: 'Kabel', montagesystem: 'Montagesystem', ovrigt: 'Övrigt' };

export default function ProductSelectionTab({ project, onUpdate }) {
  const [selectedProducts, setSelectedProducts] = useState(project.selected_products || []);
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const addProduct = (product) => {
    const existing = selectedProducts.find(sp => sp.product_id === product.id);
    if (existing) {
      setSelectedProducts(prev => prev.map(sp =>
        sp.product_id === product.id ? { ...sp, quantity: sp.quantity + 1 } : sp
      ));
    } else {
      setSelectedProducts(prev => [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price,
      }]);
    }
  };

  const updateQuantity = (productId, delta) => {
    setSelectedProducts(prev => prev.map(sp => {
      if (sp.product_id !== productId) return sp;
      const newQty = sp.quantity + delta;
      return newQty > 0 ? { ...sp, quantity: newQty } : sp;
    }));
  };

  const removeProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(sp => sp.product_id !== productId));
  };

  const totalCost = selectedProducts.reduce((sum, sp) => sum + sp.unit_price * sp.quantity, 0);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      selected_products: selectedProducts,
      total_cost: totalCost,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Selected products */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Valda produkter</CardTitle>
          <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
            <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
          </Button>
        </CardHeader>
        <CardContent>
          {selectedProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Inga produkter valda. Lägg till produkter från sortimentet nedan.</p>
          ) : (
            <div className="space-y-3">
              {selectedProducts.map(sp => (
                <div key={sp.product_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{sp.product_name}</p>
                    <p className="text-sm text-muted-foreground">{sp.unit_price?.toLocaleString('sv-SE')} SEK/st</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(sp.product_id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-semibold">{sp.quantity}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(sp.product_id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="font-semibold w-24 text-right">{(sp.unit_price * sp.quantity).toLocaleString('sv-SE')} SEK</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeProduct(sp.product_id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-4 border-t">
                <span className="font-semibold text-lg">Totalt</span>
                <span className="font-bold text-2xl text-primary">{totalCost.toLocaleString('sv-SE')} SEK</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available products */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Produktsortiment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map(product => {
              const inProject = selectedProducts.find(sp => sp.product_id === product.id);
              return (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{product.name}</p>
                      {inProject && <Badge variant="secondary" className="text-xs shrink-0">{inProject.quantity}st</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{categoryLabels[product.category]} • {product.price?.toLocaleString('sv-SE')} SEK</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0 ml-2" onClick={() => addProduct(product)}>
                    <Plus className="w-3.5 h-3.5" /> Lägg till
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}