import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createTenantProject } from '@/lib/tenantQueries';

export default function NewProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    customer_name: '',
    address: '',
    status: 'planering',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const project = await createTenantProject(form);
    setSaving(false);
    navigate(`/projects/${project.id}`);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Tillbaka till projekt
      </Link>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Nytt projekt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Projektnamn *</Label>
            <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="T.ex. Villa Andersson" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kundnamn</Label>
              <Input value={form.customer_name} onChange={e => update('customer_name', e.target.value)} placeholder="Kundens namn" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planering">Planering</SelectItem>
                  <SelectItem value="projektering">Projektering</SelectItem>
                  <SelectItem value="offert">Offert</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="klart">Klart</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Adress</Label>
            <Input value={form.address} onChange={e => update('address', e.target.value)} placeholder="Gatuadress, ort" />
          </div>
          <div>
            <Label>Anteckningar</Label>
            <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Valfria anteckningar..." rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Link to="/projects"><Button variant="outline">Avbryt</Button></Link>
            <Button onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Skapar...' : 'Skapa projekt'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
