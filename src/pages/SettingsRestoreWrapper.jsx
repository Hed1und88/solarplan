import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import EmergencyRestorePanel from '@/components/project/EmergencyRestorePanel';
import { filterProjectsForUser, getUserEmail } from '@/lib/accessControl';
import { mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import { useCompanySession } from '@/lib/CompanySessionContext';
import Settings from './Settings.jsx';

function findSettingsRoot() {
  const heading = Array.from(document.querySelectorAll('h1')).find(element => (element.textContent || '').trim() === 'Inställningar');
  return heading?.closest('.mx-auto') || null;
}

function createRestoreHost(root) {
  let host = root.querySelector(':scope > [data-settings-restore-host]');
  if (host) return host;

  host = document.createElement('div');
  host.dataset.settingsRestoreHost = 'true';

  const accountCard = Array.from(root.children).find(element => {
    const text = element.textContent || '';
    return text.includes('Konto') && text.includes('Logga ut');
  });

  root.insertBefore(host, accountCard || null);
  return host;
}

function RestoreSettingsSection() {
  const queryClient = useQueryClient();
  const { user } = useCompanySession();
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['settings-restore-projects', getUserEmail(user || {})],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  const projects = useMemo(
    () => filterProjectsForUser(rows || [], user || {}).map(project => mergeProjectWithBackup(project)),
    [rows, user],
  );

  useEffect(() => {
    setSelectedProjectId(current => projects.some(project => String(project.id) === String(current)) ? current : projects[0]?.id || '');
  }, [projects]);

  const selectedProject = projects.find(project => String(project.id) === String(selectedProjectId)) || null;

  const restoreProject = async patch => {
    if (!selectedProject) throw new Error('Välj ett projekt att återställa.');
    const updated = await saveProjectPatch(base44, selectedProject, patch);
    const merged = mergeProjectWithBackup(updated);
    writeProjectBackup(merged);
    queryClient.setQueryData(['project', merged.id], merged);
    queryClient.setQueryData(['settings-restore-projects', getUserEmail(user || {})], current => (
      Array.isArray(current)
        ? current.map(project => String(project.id) === String(merged.id) ? merged : project)
        : current
    ));
    return merged;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-slate-950"><RotateCcw className="h-4 w-4 text-primary" />Återställning</div>
            <p className="mt-1 text-sm text-muted-foreground">Välj projektet vars lokala panel- och slingbackup ska kontrolleras eller återställas.</p>
          </div>
          <label className="block min-w-[280px] text-xs font-medium text-muted-foreground">
            Projekt
            <select
              value={selectedProjectId}
              disabled={isLoading || projects.length === 0}
              onChange={event => setSelectedProjectId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {projects.length === 0 && <option value="">Inga projekt tillgängliga</option>}
              {projects.map(project => <option key={project.id} value={project.id}>{project.name || project.customer_name || project.id}</option>)}
            </select>
          </label>
        </div>
      </div>

      {selectedProject ? (
        <EmergencyRestorePanel project={selectedProject} onRestore={restoreProject} forceVisible />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          {isLoading ? 'Laddar projekt...' : 'Det finns inget projekt att återställa.'}
        </div>
      )}
    </div>
  );
}

function SettingsRestorePortal() {
  const [host, setHost] = useState(null);

  useEffect(() => {
    const attach = () => {
      const root = findSettingsRoot();
      if (!root) return;
      const nextHost = createRestoreHost(root);
      setHost(current => current === nextHost ? current : nextHost);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-settings-restore-host]').forEach(element => element.remove());
    };
  }, []);

  return host ? createPortal(<RestoreSettingsSection />, host) : null;
}

export default function SettingsRestoreWrapper() {
  return (
    <>
      <Settings />
      <SettingsRestorePortal />
    </>
  );
}
