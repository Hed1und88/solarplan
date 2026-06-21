import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewProjectModal from '@/components/projects/NewProjectModal';

export default function ProjectInfoEditor({ project, onUpdate, isSaving }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <NewProjectModal
        project={project}
        onSubmit={payload => onUpdate?.(payload)}
        onClose={() => setEditing(false)}
        onSave={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        disabled={isSaving}
        className="gap-2"
        title="Ändra projektuppgifter"
      >
        <Pencil className="h-4 w-4" />
        Ändra projektuppgifter
      </Button>
    </div>
  );
}
