import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import StringDrawingCanvas from './StringDrawingCanvas';

export default function StringMarkingTab({ project, onUpdate }) {
  const [imageUrl, setImageUrl] = useState(project.existing_installation_image_url || '');
  const [lines, setLines] = useState(() => {
    try { return JSON.parse(project.string_layout_data || '[]'); } catch { return []; }
  });
  const [saving, setSaving] = useState(false);

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      existing_installation_image_url: imageUrl,
      string_layout_data: JSON.stringify(lines),
    });
    setSaving(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Slingmarkering</CardTitle>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
          <Save className="w-4 h-4" /> {saving ? 'Sparar...' : 'Spara'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ladda upp en bild på befintlig anläggning och rita ut hur slingorna är kopplade. Använd olika färger för olika slingor.
        </p>
        <StringDrawingCanvas
          imageUrl={imageUrl}
          lines={lines}
          onLinesChange={setLines}
          onImageUpload={handleImageUpload}
        />
        {lines.length > 0 && (
          <p className="text-sm text-muted-foreground">{lines.length} sling{lines.length > 1 ? 'or' : 'a'} markerad{lines.length > 1 ? 'e' : ''}</p>
        )}
      </CardContent>
    </Card>
  );
}