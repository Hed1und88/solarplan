import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Battery } from 'lucide-react';
import ImageCanvas from './ImageCanvas';
import { filterVisibleProducts } from '@/lib/tenantQueries';

function parseBatteryLayout(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function BatteryTab({ project, onUpdate }) {
  const [imageUrl, setImageUrl] = useState(project.battery_image_url || '');
  const [batteries, setBatteries] = useState(() => parseBatteryLayout(project.battery_layout_data));
  const [selectedBattery, setSelectedBattery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setImageUrl(project.battery_image_url || '');
    setBatteries(parseBatteryLayout(project.battery_layout_data));
  }, [project?.id, project?.battery_image_url, project?.battery_layout_data]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-batteries'],
    queryFn: () => filterVisibleProducts({ category: 'batteri' }),
  });

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
  };

  const addBattery = () => {
    const product = products.find(p => p.id === selectedBattery);
    if (!product) return;
    setBatteries(prev => [...prev, {
      id: Date.now().toString(),
      product_id: product.id,
      product_name: product.name,
      x: 30 + Math.random() * 20,
      y: 30 + Math.random() * 20,
      scale: 1,
    }]);
  };

  const removeBattery = (batteryId) => {
    setBatteries(prev => prev.filter(b => b.id !== batteryId));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        battery_image_url: imageUrl,
        battery_layout_data: JSON.stringify(batteries),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Batteriplanering</CardTitle>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
          <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {imageUrl && (
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium mb-1.5">Välj batteri</p>
              <Select value={selectedBattery} onValueChange={setSelectedBattery}>
                <SelectTrigger><SelectValue placeholder="Välj batteri..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.capacity_kwh} kWh)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addBattery} disabled={!selectedBattery} className="gap-2">
              <Plus className="w-4 h-4" /> Lägg till batteri
            </Button>
          </div>
        )}

        <ImageCanvas
          imageUrl={imageUrl}
          items={batteries}
          onItemsChange={setBatteries}
          onImageUpload={handleImageUpload}
          label="Ladda upp bild för batteriplacering"
          itemRenderer={(item) => (
            <div className="group relative">
              <div className="bg-green-500/60 border-2 border-green-300 rounded-sm px-3 py-2 text-white text-xs font-medium shadow-lg backdrop-blur-sm min-w-[60px] text-center">
                <Battery className="w-3 h-3 inline mr-1" />
                {item.product_name?.split(' ')[0]}
              </div>
              <button
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); removeBattery(item.id); }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        />

        {batteries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {batteries.map(b => (
              <Badge key={b.id} variant="secondary" className="gap-1">
                {b.product_name}
                <button onClick={() => removeBattery(b.id)} className="ml-1 hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Badge variant="outline">{batteries.length} batter{batteries.length > 1 ? 'ier' : 'i'} totalt</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
