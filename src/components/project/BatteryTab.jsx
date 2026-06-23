import { useCallback, useEffect, useRef, useState } from 'react';
import './BatteryPlannerGlobals';
import BatteryPlannerV3 from './BatteryPlannerV3';
import ElectricalProductQuickAdd from './ElectricalProductQuickAdd';

const AUTOSAVE_DELAY_MS = 400;

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

export default function BatteryTab({ project, onUpdate }) {
  const plannerRef = useRef(null);
  const timerRef = useRef(null);
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
      setSaveStatus(`Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
      pendingRef.current = false;
      return result;
    } catch (error) {
      setSaveStatus('Kunde inte spara till servern – lokal backup finns kvar');
      throw error;
    }
  }, [onUpdate, persistLocalPatch]);

  useEffect(() => {
    const root = plannerRef.current;
    if (!root) return undefined;

    const runSave = () => {
      window.clearTimeout(timerRef.current);
      const button = findPlannerSaveButton(root);
      if (!button || button.disabled) return;
      const text = String(button.textContent || '').trim().toLowerCase();
      if (text !== 'spara') return;
      button.click();
    };

    const scheduleSave = event => {
      const saveButton = findPlannerSaveButton(root);
      if (saveButton && (event.target === saveButton || saveButton.contains(event.target))) return;
      pendingRef.current = true;
      setSaveStatus('Ändringar väntar på autosparning...');
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(runSave, AUTOSAVE_DELAY_MS);
    };

    const flushPending = () => {
      if (pendingRef.current) runSave();
    };

    const flushBeforeExternalNavigation = event => {
      if (!pendingRef.current || root.contains(event.target)) return;
      flushPending();
    };

    const flushWhenHidden = () => {
      if (document.hidden) flushPending();
    };

    root.addEventListener('input', scheduleSave, true);
    root.addEventListener('change', scheduleSave, true);
    root.addEventListener('click', scheduleSave, true);
    root.addEventListener('pointerup', scheduleSave, true);
    document.addEventListener('pointerdown', flushBeforeExternalNavigation, true);
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushPending);
    window.addEventListener('beforeunload', flushPending);

    return () => {
      root.removeEventListener('input', scheduleSave, true);
      root.removeEventListener('change', scheduleSave, true);
      root.removeEventListener('click', scheduleSave, true);
      root.removeEventListener('pointerup', scheduleSave, true);
      document.removeEventListener('pointerdown', flushBeforeExternalNavigation, true);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushPending);
      window.removeEventListener('beforeunload', flushPending);
      window.clearTimeout(timerRef.current);
      flushPending();
    };
  }, []);

  return (
    <div className="space-y-4">
      <ElectricalProductQuickAdd />
      <div className="flex justify-end px-1">
        <span className="text-xs text-muted-foreground">{saveStatus || 'Autosparning aktiv'}</span>
      </div>
      <div ref={plannerRef}>
        <BatteryPlannerV3 project={project} onUpdate={wrappedUpdate} />
      </div>
    </div>
  );
}
