import { useCallback, useEffect, useRef, useState } from 'react';
import './BatteryPlannerGlobals';
import BatteryPlannerV3 from './BatteryPlannerV3';
import ElectricalProductQuickAdd from './ElectricalProductQuickAdd';

function batteryLocalKey(projectId) {
  return `solarplan:project:${projectId}:battery_layout_data`;
}

function findPlannerSaveButton(root) {
  if (!root) return null;
  return Array.from(root.querySelectorAll('button')).find(button => {
    const text = String(button.textContent || '').trim().toLowerCase();
    return text === 'spara' || text === 'sparar...';
  }) || null;
}

export default function BatteryTabManualSave({ project, onUpdate }) {
  const plannerRef = useRef(null);
  const pendingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState('');

  const persistLocalPatch = useCallback((patch = {}) => {
    if (typeof window === 'undefined' || !project?.id || patch.battery_layout_data === undefined) return;
    try {
      const value = typeof patch.battery_layout_data === 'string'
        ? patch.battery_layout_data
        : JSON.stringify(patch.battery_layout_data);
      window.localStorage.setItem(batteryLocalKey(project.id), value);
    } catch {}
  }, [project?.id]);

  const wrappedUpdate = useCallback(async patch => {
    persistLocalPatch(patch);
    setSaveStatus('Sparar...');
    try {
      const result = await onUpdate?.(patch);
      pendingRef.current = false;
      setSaveStatus(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
      return result;
    } catch (error) {
      setSaveStatus('Kunde inte spara till servern – lokal backup finns kvar');
      throw error;
    }
  }, [onUpdate, persistLocalPatch]);

  useEffect(() => {
    const root = plannerRef.current;
    if (!root) return undefined;

    const markDirty = event => {
      const saveButton = findPlannerSaveButton(root);
      if (saveButton && (event.target === saveButton || saveButton.contains(event.target))) return;
      pendingRef.current = true;
      setSaveStatus('Osparade ändringar');
    };

    const savePending = () => {
      if (!pendingRef.current) return;
      const button = findPlannerSaveButton(root);
      if (!button || button.disabled) return;
      const text = String(button.textContent || '').trim().toLowerCase();
      if (text === 'spara') button.click();
    };

    const saveBeforeLeaving = event => {
      if (!pendingRef.current || root.contains(event.target)) return;
      savePending();
    };

    const saveWhenHidden = () => {
      if (document.hidden) savePending();
    };

    root.addEventListener('input', markDirty, true);
    root.addEventListener('change', markDirty, true);
    root.addEventListener('click', markDirty, true);
    root.addEventListener('pointerup', markDirty, true);
    document.addEventListener('pointerdown', saveBeforeLeaving, true);
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', savePending);

    return () => {
      root.removeEventListener('input', markDirty, true);
      root.removeEventListener('change', markDirty, true);
      root.removeEventListener('click', markDirty, true);
      root.removeEventListener('pointerup', markDirty, true);
      document.removeEventListener('pointerdown', saveBeforeLeaving, true);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', savePending);
      savePending();
    };
  }, []);

  return (
    <div className="space-y-4">
      <ElectricalProductQuickAdd />
      <div className="flex justify-end px-1">
        <span className="text-xs text-muted-foreground">
          {saveStatus || 'Sparar med knappen Spara eller när du lämnar Batteri'}
        </span>
      </div>
      <div ref={plannerRef}>
        <BatteryPlannerV3 project={project} onUpdate={wrappedUpdate} />
      </div>
    </div>
  );
}
