import { useState } from 'react';
import RoofCanvas from '@/components/kalkylator/RoofCanvas';
import KalkylatornSummary from '@/components/kalkylator/KalkylatornSummary';
import RoofControls from '@/components/kalkylator/RoofControls';

const DEFAULT_ROOF = {
  id: 1,
  name: 'Tak 1',
  widthM: 8,
  heightM: 6,
  angle: 25,
  panelGroups: [
    { id: 1, name: 'Grupp A', cols: 4, rows: 2, startCol: 1, startRow: 1, color: '#f97316' }
  ],
  obstacles: [],
};

export default function Kalkylator() {
  const [roofs, setRoofs] = useState([DEFAULT_ROOF]);
  const [activeRoofId, setActiveRoofId] = useState(1);
  const [tool, setTool] = useState('select'); // 'select' | 'obstacle'
  const [nextId, setNextId] = useState(100);

  const activeRoof = roofs.find(r => r.id === activeRoofId) || roofs[0];

  const updateRoof = (id, patch) =>
    setRoofs(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRoof = () => {
    const id = nextId;
    setNextId(n => n + 1);
    const newRoof = {
      id,
      name: `Tak ${roofs.length + 1}`,
      widthM: 8,
      heightM: 6,
      angle: 25,
      panelGroups: [],
      obstacles: [],
    };
    setRoofs(prev => [...prev, newRoof]);
    setActiveRoofId(id);
  };

  const removeRoof = (id) => {
    const remaining = roofs.filter(r => r.id !== id);
    setRoofs(remaining.length ? remaining : [{ ...DEFAULT_ROOF, id: nextId }]);
    setNextId(n => n + 1);
    setActiveRoofId(remaining[0]?.id || nextId);
  };

  const addPanelGroup = () => {
    const id = nextId;
    setNextId(n => n + 1);
    const colors = ['#f97316','#3b82f6','#22c55e','#8b5cf6','#ec4899','#06b6d4'];
    const g = { id, name: `Grupp ${activeRoof.panelGroups.length + 1}`, cols: 3, rows: 2, startCol: 1, startRow: 1, color: colors[activeRoof.panelGroups.length % colors.length] };
    updateRoof(activeRoofId, { panelGroups: [...activeRoof.panelGroups, g] });
  };

  const updateGroup = (gid, patch) =>
    updateRoof(activeRoofId, {
      panelGroups: activeRoof.panelGroups.map(g => g.id === gid ? { ...g, ...patch } : g)
    });

  const removeGroup = (gid) =>
    updateRoof(activeRoofId, { panelGroups: activeRoof.panelGroups.filter(g => g.id !== gid) });

  const addObstacle = (obstacle) =>
    updateRoof(activeRoofId, { obstacles: [...activeRoof.obstacles, { ...obstacle, id: nextId, name: `Hinder ${activeRoof.obstacles.length + 1}` }] });

  const removeObstacle = (oid) =>
    updateRoof(activeRoofId, { obstacles: activeRoof.obstacles.filter(o => o.id !== oid) });

  // Increment nextId after obstacle add
  const handleAddObstacle = (o) => { addObstacle(o); setNextId(n => n + 1); };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border bg-card">
        <h1 className="text-xl font-bold text-foreground">Solcellskalkylator</h1>
        <p className="text-sm text-muted-foreground">Planera tak, panelgrupper och hinder – se ritning och sammanställning direkt.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-120px)] lg:h-[calc(100vh-88px)]">
        {/* Left: Controls */}
        <div className="lg:w-72 xl:w-80 flex-shrink-0 overflow-y-auto border-r border-border bg-card">
          <RoofControls
            roofs={roofs}
            activeRoofId={activeRoofId}
            activeRoof={activeRoof}
            tool={tool}
            setTool={setTool}
            onSelectRoof={setActiveRoofId}
            onAddRoof={addRoof}
            onRemoveRoof={removeRoof}
            onUpdateRoof={(patch) => updateRoof(activeRoofId, patch)}
            onAddGroup={addPanelGroup}
            onUpdateGroup={updateGroup}
            onRemoveGroup={removeGroup}
            onRemoveObstacle={removeObstacle}
          />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-muted/30">
          <RoofCanvas
            roof={activeRoof}
            tool={tool}
            onAddObstacle={handleAddObstacle}
            onUpdateGroup={updateGroup}
          />
        </div>

        {/* Right: Summary */}
        <div className="lg:w-64 xl:w-72 flex-shrink-0 overflow-y-auto border-l border-border bg-card">
          <KalkylatornSummary roofs={roofs} />
        </div>
      </div>
    </div>
  );
}