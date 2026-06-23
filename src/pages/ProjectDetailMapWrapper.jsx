import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import InlinePanelMapTools from '@/components/project/InlinePanelMapTools.jsx';
import ProjectDetail from './ProjectDetail.jsx';

function findPanelWorkbench() {
  const panelTab = Array.from(document.querySelectorAll('[role="tab"]')).find(tab => /Paneler/i.test(tab.textContent || ''));
  if (!panelTab || panelTab.getAttribute('data-state') !== 'active') return null;

  const controlledId = panelTab.getAttribute('aria-controls');
  const tabPanel = controlledId ? document.getElementById(controlledId) : null;
  const scope = tabPanel || Array.from(document.querySelectorAll('[role="tabpanel"]')).find(panel => panel.getAttribute('data-state') === 'active');
  if (!scope) return null;

  const containers = Array.from(scope.querySelectorAll('div'));
  const workbenchRow = containers.find(element => {
    const directChildren = Array.from(element.children);
    return directChildren.some(child => child.tagName === 'MAIN') && directChildren.filter(child => child.tagName === 'ASIDE').length >= 1;
  });
  if (!workbenchRow) return null;

  const directChildren = Array.from(workbenchRow.children);
  const toolbar = directChildren.find(child => child.tagName === 'ASIDE' && String(child.className).includes('w-[58px]')) || directChildren.find(child => child.tagName === 'ASIDE');
  const main = directChildren.find(child => child.tagName === 'MAIN');
  const inspector = directChildren.find(child => child.tagName === 'ASIDE' && child !== toolbar);
  const canvasArea = main ? Array.from(main.children).find(child => String(child.className).includes('relative') && String(child.className).includes('flex-1')) : null;
  const settingsList = inspector ? Array.from(inspector.querySelectorAll('div')).find(element => String(element.className).split(' ').includes('space-y-3')) : null;

  if (!toolbar || !canvasArea || !settingsList) return null;
  return { toolbar, canvasArea, settingsList };
}

function createHost(parent, name, before = null) {
  let host = parent.querySelector(`:scope > [data-map-host="${name}"]`);
  if (!host) {
    host = document.createElement('div');
    host.dataset.mapHost = name;
    if (before) parent.insertBefore(host, before);
    else parent.appendChild(host);
  }
  return host;
}

function MapIntegration({ project, onUpdate }) {
  const [targets, setTargets] = useState(null);

  useEffect(() => {
    let currentTargets = null;

    const sync = () => {
      const found = findPanelWorkbench();
      if (!found) {
        setTargets(null);
        return;
      }

      const bottomTools = Array.from(found.toolbar.children).find(child => String(child.className).includes('mt-auto')) || null;
      const toolbarTarget = createHost(found.toolbar, 'toolbar', bottomTools);
      toolbarTarget.className = 'flex flex-col items-center gap-1';

      const canvasTarget = createHost(found.canvasArea, 'canvas');
      canvasTarget.className = 'absolute inset-3 z-40';

      const settingsTarget = createHost(found.settingsList, 'settings', found.settingsList.firstChild);
      settingsTarget.className = 'contents';

      currentTargets = { toolbarTarget, canvasTarget, settingsTarget };
      setTargets(current => {
        if (current?.toolbarTarget === toolbarTarget && current?.canvasTarget === canvasTarget && current?.settingsTarget === settingsTarget) return current;
        return currentTargets;
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });

    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-map-host]').forEach(element => element.remove());
    };
  }, []);

  if (!targets) return null;
  return <InlinePanelMapTools project={project} onUpdate={onUpdate} {...targets} />;
}

export default function ProjectDetailMapWrapper() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { data: serverProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProjectById(base44, id),
    enabled: Boolean(id),
  });

  const project = mergeProjectWithBackup(serverProject);

  const saveMapData = async patch => {
    const current = queryClient.getQueryData(['project', id]) || project || serverProject;
    const updated = await saveProjectPatch(base44, current, patch);
    const merged = mergeProjectWithBackup(updated);
    writeProjectBackup(merged);
    queryClient.setQueryData(['project', id], merged);
    await queryClient.invalidateQueries({ queryKey: ['project', id] });
    return merged;
  };

  return (
    <>
      <ProjectDetail />
      {project && <MapIntegration project={project} onUpdate={saveMapData} />}
    </>
  );
}
