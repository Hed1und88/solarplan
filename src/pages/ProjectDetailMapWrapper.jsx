import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import InlinePanelMapTools from '@/components/project/InlinePanelMapTools.jsx';
import MapPanelPlacementLayer from '@/components/project/MapPanelPlacementLayer.jsx';
import ProjectDetail from './ProjectDetail.jsx';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function withLocalMapImageFallback(project, liveImageUrl = '') {
  if (!project?.id) return project;

  const parsed = safeJson(project.solar_roof_planner_data || project.panel_layout_data, null);
  if (!Array.isArray(parsed?.roofs)) return project;

  const reusableLiveImageUrl = /^(blob:|data:|https?:)/i.test(liveImageUrl || '') ? liveImageUrl : '';
  const mapTrace = {
    ...(parsed.mapTrace || {}),
    imageKey: parsed.mapTrace?.imageKey || `project-${project.id}-map`,
    imageUrl: parsed.mapTrace?.imageUrl || reusableLiveImageUrl || '',
  };
  const payload = JSON.stringify({ ...parsed, mapTrace });

  return {
    ...project,
    solar_roof_planner_data: payload,
    panel_layout_data: payload,
  };
}

function mergePanelGroupsIntoLayout(layout, panelLayout) {
  if (!Array.isArray(layout?.roofs) || !panelLayout?.roofs?.length) return layout;
  return {
    ...layout,
    roofs: layout.roofs.map(roof => {
      const panelRoof = panelLayout.roofs.find(item => String(item.id) === String(roof.id));
      return panelRoof ? { ...roof, panelGroups: panelRoof.panelGroups || [] } : roof;
    }),
  };
}

function mergePanelGroupsIntoPatch(patch, panelLayout) {
  if (!panelLayout?.roofs?.length) return patch;

  const mergeRaw = raw => {
    const parsed = safeJson(raw, null);
    if (!Array.isArray(parsed?.roofs)) return raw;
    const merged = mergePanelGroupsIntoLayout(parsed, panelLayout);
    return JSON.stringify({ ...merged, version: Math.max(12, Number(merged.version) || 0) });
  };

  return {
    ...patch,
    ...(patch.solar_roof_planner_data ? { solar_roof_planner_data: mergeRaw(patch.solar_roof_planner_data) } : {}),
    ...(patch.panel_layout_data ? { panel_layout_data: mergeRaw(patch.panel_layout_data) } : {}),
  };
}

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

function hideDuplicatePanelGroupControls(settingsList) {
  if (!settingsList) return;

  const mapPanelSection = Array.from(settingsList.querySelectorAll('section'))
    .find(section => /Paneler på aktivt tak/i.test(section.textContent || ''));

  if (!mapPanelSection) return;

  Array.from(mapPanelSection.children).forEach(child => {
    const text = child.textContent || '';
    const duplicatePanelGroupControl = /Panelgrupp|Rader|Kolumner|Orientering|Ta bort aktiv panelgrupp|Lägg till panelgrupp|Det finns ingen panelgrupp/i.test(text);
    if (duplicatePanelGroupControl) {
      child.style.display = 'none';
      child.dataset.duplicatePanelGroupControl = 'hidden';
    }
  });
}

function MapIntegration({ project, onUpdate }) {
  const [targets, setTargets] = useState(null);
  const [liveMapLayout, setLiveMapLayout] = useState(null);
  const panelLayoutRef = useRef(null);
  const liveMapImageUrlRef = useRef('');

  useEffect(() => {
    const handleMapLayout = event => {
      if (String(event?.detail?.projectId || '') !== String(project?.id || '')) return;
      const incoming = event?.detail?.layout;
      if (!Array.isArray(incoming?.roofs)) return;
      setLiveMapLayout(mergePanelGroupsIntoLayout(incoming, panelLayoutRef.current));
    };
    window.addEventListener('solarplan:map-layout-change', handleMapLayout);
    return () => window.removeEventListener('solarplan:map-layout-change', handleMapLayout);
  }, [project?.id]);

  useEffect(() => {
    setLiveMapLayout(null);
    panelLayoutRef.current = null;
    liveMapImageUrlRef.current = '';
  }, [project?.id]);

  useEffect(() => {
    const sync = () => {
      const found = findPanelWorkbench();
      if (!found) {
        setTargets(null);
        return;
      }

      const bottomTools = Array.from(found.toolbar.children).find(child => String(child.className).includes('mt-auto')) || null;
      const toolbarTarget = createHost(found.toolbar, 'toolbar', bottomTools);
      toolbarTarget.className = 'flex flex-col items-center gap-1';

      const canvasTarget = createHost(found.canvasArea, 'canvas', found.canvasArea.firstChild);
      canvasTarget.className = 'absolute z-40';
      found.canvasArea.style.position = 'relative';
      Object.assign(canvasTarget.style, {
        position: 'absolute',
        top: '12px',
        right: '12px',
        bottom: 'auto',
        left: '12px',
        height: 'calc(100vh - 175px)',
        maxHeight: 'calc(100% - 24px)',
        zIndex: '40',
        margin: '0',
        overflow: 'hidden',
      });

      const visibleMapImageUrl = canvasTarget.querySelector('img[alt="Kartbild"]')?.src || '';
      if (visibleMapImageUrl) liveMapImageUrlRef.current = visibleMapImageUrl;

      const settingsTarget = createHost(found.settingsList, 'settings', found.settingsList.firstChild);
      settingsTarget.className = 'contents';
      hideDuplicatePanelGroupControls(found.settingsList);
      requestAnimationFrame(() => hideDuplicatePanelGroupControls(found.settingsList));

      const nextTargets = { toolbarTarget, canvasTarget, settingsTarget };
      setTargets(current => {
        if (current?.toolbarTarget === toolbarTarget && current?.canvasTarget === canvasTarget && current?.settingsTarget === settingsTarget) return current;
        return nextTargets;
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'src'] });

    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-map-host]').forEach(element => element.remove());
    };
  }, []);

  const handlePanelLayoutChange = useCallback(layout => {
    panelLayoutRef.current = layout;
  }, []);

  if (!targets) return null;

  const visibleMapImageUrl = targets.canvasTarget?.querySelector('img[alt="Kartbild"]')?.src || '';
  if (visibleMapImageUrl) liveMapImageUrlRef.current = visibleMapImageUrl;

  const saveWithPanelPlacement = patch => onUpdate(mergePanelGroupsIntoPatch(patch, panelLayoutRef.current));
  const mapProject = withLocalMapImageFallback(project, liveMapImageUrlRef.current);
  const panelProject = liveMapLayout ? {
    ...project,
    solar_roof_planner_data: JSON.stringify(liveMapLayout),
    panel_layout_data: JSON.stringify(liveMapLayout),
  } : project;

  return (
    <>
      <InlinePanelMapTools project={mapProject} onUpdate={saveWithPanelPlacement} {...targets} />
      <MapPanelPlacementLayer
        project={panelProject}
        {...targets}
        onLayoutChange={handlePanelLayoutChange}
      />
    </>
  );
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
      <style>{`
        [data-map-host="canvas"]:empty { pointer-events: none; }
        [data-map-host="canvas"]:not(:empty) { pointer-events: auto; }
        [data-map-panel-overlay="true"] text { display: none !important; }
        [data-map-host="canvas"] svg polygon[stroke="#f97316"],
        [data-map-host="canvas"] svg polyline[stroke="#f97316"] {
          stroke-width: 1.5px !important;
          vector-effect: non-scaling-stroke;
        }
      `}</style>
      <ProjectDetail />
      {project && <MapIntegration project={project} onUpdate={saveMapData} />}
    </>
  );
}
