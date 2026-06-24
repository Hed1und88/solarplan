import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { compactStringLayoutForServer, safeParseJson, writeStringLayoutBackup } from '@/lib/stringLayoutStorage';

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'string') return safeParseJson(value, null);
  return value;
}

function stringify(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function countPanelPlanner(raw) {
  const data = parseMaybeJson(raw);
  if (!data || !Array.isArray(data.roofs)) return { roofs: 0, panels: 0, groups: 0, score: -1 };
  let panels = 0;
  let groups = 0;
  data.roofs.forEach(roof => {
    (roof.panelGroups || []).forEach(group => {
      groups += 1;
      panels += Math.max(0, Math.round((Number(group.rows || 0) || 0) * (Number(group.cols || 0) || 0)));
    });
  });
  return { roofs: data.roofs.length, panels, groups, score: panels * 1000 + groups * 50 + data.roofs.length };
}

function countStringLayout(raw) {
  const data = parseMaybeJson(raw);
  if (!data || !Array.isArray(data.strings)) return { strings: 0, panels: 0, inverters: 0, score: -1 };
  const panels = data.strings.reduce((sum, item) => {
    const nodePanels = Array.isArray(item.nodes) ? new Set(item.nodes.map(node => node.panelId)).size : 0;
    return sum + (nodePanels || Number(item.panel_count || 0) || 0);
  }, 0);
  const strings = data.strings.filter(item => item.panelGroupId || item.pvInput || item.inverterConfigId || item.panelProductId || Number(item.panel_count || 0) > 0 || (Array.isArray(item.nodes) && item.nodes.length)).length;
  const inverters = Array.isArray(data.inverterConfigs) ? data.inverterConfigs.filter(cfg => cfg.productId).length : 0;
  return { strings, panels, inverters, score: panels * 1000 + strings * 100 + inverters * 10 };
}

function readJsonLocal(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function findBackups(project) {
  if (typeof window === 'undefined' || !project?.id) return { panel: null, strings: null };

  const projectBackup = readJsonLocal(`solarplan:project-backup:${project.id}`);
  const panelCandidates = [];
  const stringCandidates = [];

  const addPanel = (label, value) => {
    const stats = countPanelPlanner(value);
    if (stats.score >= 0) panelCandidates.push({ label, value, stats });
  };
  const addString = (label, value) => {
    const stats = countStringLayout(value);
    if (stats.score >= 0) stringCandidates.push({ label, value, stats });
  };

  addPanel('Server/projekt: solar_roof_planner_data', project.solar_roof_planner_data);
  addPanel('Server/projekt: panel_layout_data', project.panel_layout_data);
  addPanel('Projektbackup: solar_roof_planner_data', projectBackup?.solar_roof_planner_data);
  addPanel('Projektbackup: panel_layout_data', projectBackup?.panel_layout_data);
  addPanel('Lokal panelbackup', readJsonLocal(`solarplan:project:${project.id}:solar_roof_planner_data`));

  addString('Server/projekt: string_layout_data', project.string_layout_data);
  addString('Projektbackup: string_layout_data', projectBackup?.string_layout_data);
  addString('Lokal slingbackup', readJsonLocal(`solarplan:project:${project.id}:string_layout_data`));

  panelCandidates.sort((a, b) => b.stats.score - a.stats.score);
  stringCandidates.sort((a, b) => b.stats.score - a.stats.score);

  return { panel: panelCandidates[0] || null, strings: stringCandidates[0] || null };
}

export default function EmergencyRestorePanel({ project, onRestore, forceVisible = false }) {
  const location = useLocation();
  const [found, setFound] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const visibleInSettings = forceVisible || location.pathname.startsWith('/settings');
  if (!visibleInSettings) return null;

  const scan = () => {
    const result = findBackups(project);
    setFound(result);
    if (!result.panel && !result.strings) setStatus('Ingen lokal backup med paneler/slingor hittades för detta projekt.');
    else setStatus('Backup hittad. Kontrollera siffrorna och tryck återställ.');
  };

  const restore = async () => {
    const result = found || findBackups(project);
    setFound(result);
    if (!result.panel && !result.strings) {
      setStatus('Ingen backup att återställa.');
      return;
    }

    setBusy(true);
    setStatus('Återställer...');
    try {
      const patch = {};
      if (result.panel) {
        const panelData = parseMaybeJson(result.panel.value);
        const panelString = stringify(panelData);
        patch.solar_roof_planner_data = panelString;
        patch.panel_layout_data = panelString;
        try { window.localStorage.setItem(`solarplan:project:${project.id}:solar_roof_planner_data`, panelString); } catch {}
      }
      if (result.strings) {
        const fullStringLayout = parseMaybeJson(result.strings.value);
        writeStringLayoutBackup(project.id, fullStringLayout);
        patch.string_layout_data = JSON.stringify(compactStringLayoutForServer(fullStringLayout));
      }

      const localProject = { ...project, ...patch, _emergency_restore_at: new Date().toISOString() };
      try { window.localStorage.setItem(`solarplan:project-backup:${project.id}`, JSON.stringify(localProject)); } catch {}

      await onRestore?.(patch);
      setStatus('Återställning klar. Om vyn inte uppdateras direkt: ladda om projektet en gång.');
    } catch (error) {
      setStatus(error?.message || 'Återställning misslyckades.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-amber-950"><RotateCcw className="h-4 w-4" />Återställning</div>
            <div className="text-sm text-amber-900">Återställer paneler och slingor från lokal backup för valt projekt.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={scan} disabled={busy}><Search className="mr-2 h-4 w-4" />Sök backup</Button>
            <Button size="sm" onClick={restore} disabled={busy}><RotateCcw className="mr-2 h-4 w-4" />{busy ? 'Återställer...' : 'Återställ nu'}</Button>
          </div>
        </div>

        {found && (
          <div className="flex flex-wrap gap-2 text-sm">
            {found.panel ? <Badge className="bg-emerald-100 text-emerald-700"><ShieldCheck className="mr-1 h-3 w-3" />Paneler: {found.panel.stats.panels} st · {found.panel.stats.roofs} tak</Badge> : <Badge variant="outline">Panelbackup saknas</Badge>}
            {found.strings ? <Badge className="bg-emerald-100 text-emerald-700"><ShieldCheck className="mr-1 h-3 w-3" />Slingor: {found.strings.stats.strings} st · {found.strings.stats.panels} paneler · {found.strings.stats.inverters} växelriktare</Badge> : <Badge variant="outline">Slingbackup saknas</Badge>}
          </div>
        )}
        {status && <div className="text-sm text-amber-950">{status}</div>}
      </CardContent>
    </Card>
  );
}
