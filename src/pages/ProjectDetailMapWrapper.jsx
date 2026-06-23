import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, PanelTop } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fetchProjectById, mergeProjectWithBackup, saveProjectPatch, writeProjectBackup } from '@/lib/projectPersistence';
import ProjectDetail from './ProjectDetail.jsx';

const PanelMapTraceWorkspace = React.lazy(() => import('@/components/project/PanelMapTraceWorkspace.jsx'));

class MapWorkspaceBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Kartarbetsytan kunde inte laddas:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          Kartarbetsytan kunde inte laddas. Panelplaceringen är fortfarande tillgänglig och inga projektdata har ändrats.
        </div>
      );
    }
    return this.props.children;
  }
}

function findPanelsTabPanel() {
  const triggers = Array.from(document.querySelectorAll('[role="tab"]'));
  const panelsTrigger = triggers.find(trigger => /Paneler/i.test(trigger.textContent || ''));
  if (!panelsTrigger) return null;

  const controlledId = panelsTrigger.getAttribute('aria-controls');
  if (controlledId) {
    const controlled = document.getElementById(controlledId);
    if (controlled) return controlled;
  }

  const tabsRoot = panelsTrigger.closest('[data-orientation]')?.parentElement?.parentElement;
  const candidates = Array.from((tabsRoot || document).querySelectorAll('[role="tabpanel"]'));
  return candidates.find(panel => panel.getAttribute('data-state') === 'active') || candidates[0] || null;
}

function MapPortal({ project, onUpdate }) {
  const [host, setHost] = useState(null);
  const [mode, setMode] = useState('panels');
  const mapRootRef = useRef(null);

  useEffect(() => {
    let currentPanel = null;

    const syncHost = () => {
      const panel = findPanelsTabPanel();
      if (!panel || !panel.isConnected) {
        setHost(null);
        return;
      }

      currentPanel = panel;
      let nextHost = panel.querySelector(':scope > [data-panel-map-host="true"]');
      if (!nextHost) {
        nextHost = document.createElement('div');
        nextHost.dataset.panelMapHost = 'true';
        panel.prepend(nextHost);
      }
      setHost(nextHost);
    };

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });

    return () => {
      observer.disconnect();
      currentPanel?.classList.remove('solarplan-map-active');
      document.querySelector('[data-panel-map-host="true"]')?.remove();
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    const panel = host.parentElement;
    panel?.classList.toggle('solarplan-map-active', mode === 'map');
  }, [host, mode]);

  useEffect(() => {
    if (mode !== 'map') return;
    const timer = window.setTimeout(() => {
      const mapButton = Array.from(mapRootRef.current?.querySelectorAll('button') || [])
        .find(button => /Kartbild och tak/i.test(button.textContent || ''));
      mapButton?.click();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [mode, project?.id]);

  if (!host) return null;

  return createPortal(
    <div className="space-y-3">
      <style>{`
        [role="tabpanel"].solarplan-map-active > :not([data-panel-map-host="true"]) {
          display: none !important;
        }
        .solarplan-map-shell > .space-y-3 > :first-child {
          display: none !important;
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('panels')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'panels' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <PanelTop className="h-4 w-4" />
            Panelplacering
          </button>
          <button
            type="button"
            onClick={() => setMode('map')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'map' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <MapIcon className="h-4 w-4" />
            Kartbild och tak
          </button>
        </div>
        <div className="text-xs text-slate-500">Kartbild · manuell kalibrering · takpolygoner · hinder</div>
      </div>

      {mode === 'map' && (
        <div ref={mapRootRef} className="project-map-shell solarplan-map-shell">
          <MapWorkspaceBoundary>
            <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Laddar kartarbetsytan...</div>}>
              <PanelMapTraceWorkspace project={project} onUpdate={onUpdate} />
            </Suspense>
          </MapWorkspaceBoundary>
        </div>
      )}
    </div>,
    host,
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
      <ProjectDetail />
      {project && <MapPortal project={project} onUpdate={saveMapData} />}
    </>
  );
}
