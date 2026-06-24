import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import InlinePanelMapTools from '@/components/project/InlinePanelMapTools.jsx';
import MapPanelPlacementLayer from '@/components/project/MapPanelPlacementLayer.jsx';
import ProjectDetail from './ProjectDetail.jsx';

const MAP_DB_NAME = 'solarplan-map-images';
const MAP_STORE_NAME = 'images';

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function plannerPayload(project) {
  for (const raw of [project?.solar_roof_planner_data, project?.panel_layout_data]) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  return null;
}

function openMapImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MAP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MAP_STORE_NAME)) request.result.createObjectStore(MAP_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLocalMapImage(key) {
  if (!key || typeof indexedDB === 'undefined') return null;
  const db = await openMapImageDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(MAP_STORE_NAME, 'readonly');
      const request = transaction.objectStore(MAP_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function readImageDimensions(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = url;
  });
}

function projectWithMapTrace(project, mapTrace) {
  const parsed = plannerPayload(project);
  if (!project?.id || !parsed) return project;
  const payload = JSON.stringify({ ...parsed, mapTrace: { ...(parsed.mapTrace || {}), ...mapTrace } });
  return {
    ...project,
    solar_roof_planner_data: payload,
    panel_layout_data: payload,
  };
}

async function hydrateProjectMap(project) {
  const parsed = plannerPayload(project);
  if (!project?.id || !parsed) return { project, objectUrl: '' };

  const storedTrace = parsed.mapTrace || {};
  const imageKey = storedTrace.imageKey || `project-${project.id}-map`;
  const storedUrl = storedTrace.imageUrl && !String(storedTrace.imageUrl).startsWith('blob:')
    ? storedTrace.imageUrl
    : project.roof_image_url || '';

  if (storedUrl) {
    const dimensions = Number(storedTrace.naturalWidth) > 0 && Number(storedTrace.naturalHeight) > 0
      ? { width: Number(storedTrace.naturalWidth), height: Number(storedTrace.naturalHeight) }
      : await readImageDimensions(storedUrl);
    return {
      project: projectWithMapTrace(project, {
        ...storedTrace,
        imageUrl: storedUrl,
        imageKey,
        imageName: storedTrace.imageName || 'Sparad kartbild',
        naturalWidth: dimensions.width || storedTrace.naturalWidth || 0,
        naturalHeight: dimensions.height || storedTrace.naturalHeight || 0,
      }),
      objectUrl: '',
    };
  }

  const blob = await getLocalMapImage(imageKey).catch(() => null);
  if (!blob) {
    return {
      project: projectWithMapTrace(project, { ...storedTrace, imageKey }),
      objectUrl: '',
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const dimensions = await readImageDimensions(objectUrl);
  return {
    project: projectWithMapTrace(project, {
      ...storedTrace,
      imageUrl: objectUrl,
      imageKey,
      imageName: storedTrace.imageName || 'Lokalt sparad kartbild',
      naturalWidth: dimensions.width || storedTrace.naturalWidth || 0,
      naturalHeight: dimensions.height || storedTrace.naturalHeight || 0,
    }),
    objectUrl,
  };
}

function withVisibleMapImage(project, liveImageUrl = '') {
  const parsed = plannerPayload(project);
  if (!project?.id || !parsed || !liveImageUrl) return project;
  return projectWithMapTrace(project, {
    ...(parsed.mapTrace || {}),
    imageUrl: liveImageUrl,
    imageKey: parsed.mapTrace?.imageKey || `project-${project.id}-map`,
  });
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
  const [hydratedProject, setHydratedProject] = useState(project);
  const [mapReady, setMapReady] = useState(false);
  const panelLayoutRef = useRef(null);
  const liveMapImageUrlRef = useRef('');
  const objectUrlRef = useRef('');
  const autoOpenedProjectRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setMapReady(false);

    hydrateProjectMap(project).then(result => {
      if (cancelled) {
        if (result.objectUrl) URL.revokeObjectURL(result.objectUrl);
        return;
      }
      if (objectUrlRef.current && objectUrlRef.current !== result.objectUrl) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = result.objectUrl || '';
      setHydratedProject(result.project || project);
      setMapReady(true);
    }).catch(() => {
      if (!cancelled) {
        setHydratedProject(project);
        setMapReady(true);
      }
    });

    return () => { cancelled = true; };
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data, project?.roof_image_url]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = '';
  }, []);

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
    autoOpenedProjectRef.current = '';
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

  const mapProjectBase = hydratedProject?.id === project?.id ? hydratedProject : project;
  const mapProject = withVisibleMapImage(mapProjectBase, liveMapImageUrlRef.current);
  const mapTrace = plannerPayload(mapProject)?.mapTrace || {};

  useEffect(() => {
    if (!targets || !mapReady || autoOpenedProjectRef.current === String(project?.id || '')) return;
    if (!mapTrace.imageUrl && !mapTrace.imageKey) return;

    let attempts = 0;
    const openMap = () => {
      const button = targets.toolbarTarget?.querySelector('button[title="Kartbild"]');
      if (!button && attempts < 12) {
        attempts += 1;
        window.setTimeout(openMap, 50);
        return;
      }
      if (!button) return;
      if (!String(button.className).includes('bg-orange-50')) button.click();
      autoOpenedProjectRef.current = String(project.id);
    };

    requestAnimationFrame(openMap);
  }, [targets, mapReady, mapTrace.imageUrl, mapTrace.imageKey, project?.id]);

  const handlePanelLayoutChange = useCallback(layout => {
    panelLayoutRef.current = layout;
  }, []);

  if (!targets || !mapReady) return null;

  const visibleMapImageUrl = targets.canvasTarget?.querySelector('img[alt="Kartbild"]')?.src || '';
  if (visibleMapImageUrl) liveMapImageUrlRef.current = visibleMapImageUrl;

  const saveWithPanelPlacement = patch => onUpdate(mergePanelGroupsIntoPatch(patch, panelLayoutRef.current));
  const basePayload = plannerPayload(mapProject) || { roofs: [] };
  const panelPayload = liveMapLayout
    ? { ...basePayload, ...liveMapLayout, mapTrace: basePayload.mapTrace || liveMapLayout.mapTrace }
    : basePayload;
  const panelProject = {
    ...mapProject,
    solar_roof_planner_data: JSON.stringify(panelPayload),
    panel_layout_data: JSON.stringify(panelPayload),
  };

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
