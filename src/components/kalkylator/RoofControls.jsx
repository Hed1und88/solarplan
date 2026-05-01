import { Plus, Trash2, ChevronDown, ChevronUp, Home, Layers, AlertTriangle, MousePointer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const OBSTACLE_TYPES = [
  { value: 'skorsten', label: 'Skorsten' },
  { value: 'takfonster', label: 'Takfönster' },
  { value: 'ventilation', label: 'Ventilation' },
  { value: 'ovrig', label: 'Övrigt' },
];

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function NumInput({ label, value, onChange, min = 1, max = 50, step = 0.5 }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || min)}
        className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

export default function RoofControls({
  roofs, activeRoofId, activeRoof, tool, setTool,
  onSelectRoof, onAddRoof, onRemoveRoof, onUpdateRoof,
  onAddGroup, onUpdateGroup, onRemoveGroup, onRemoveObstacle
}) {
  const [newObstacleType, setNewObstacleType] = useState('skorsten');

  return (
    <div>
      {/* Tool selector */}
      <div className="flex gap-2 p-3 border-b border-border bg-muted/20">
        <button
          onClick={() => setTool('select')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tool === 'select' ? 'bg-primary text-white' : 'bg-background border border-border text-muted-foreground'}`}
        >
          <MousePointer className="w-3.5 h-3.5" /> Välj
        </button>
        <button
          onClick={() => setTool('obstacle')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tool === 'obstacle' ? 'bg-destructive text-white' : 'bg-background border border-border text-muted-foreground'}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Hinder
        </button>
      </div>

      {/* Roof selector */}
      <Section title="Tak" icon={Home}>
        <div className="space-y-1.5">
          {roofs.map(r => (
            <div key={r.id} className="flex items-center gap-2">
              <button
                onClick={() => onSelectRoof(r.id)}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-all ${r.id === activeRoofId ? 'bg-primary/10 text-primary font-semibold border border-primary/30' : 'bg-muted/40 hover:bg-muted'}`}
              >
                {r.name}
              </button>
              {roofs.length > 1 && (
                <button onClick={() => onRemoveRoof(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onAddRoof}>
          <Plus className="w-3.5 h-3.5" /> Lägg till tak
        </Button>
      </Section>

      {/* Active roof settings */}
      <Section title={`Inställningar – ${activeRoof.name}`} icon={Home}>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Taknamn</label>
          <input
            value={activeRoof.name}
            onChange={e => onUpdateRoof({ name: e.target.value })}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="Bredd (m)" value={activeRoof.widthM} onChange={v => onUpdateRoof({ widthM: v })} min={2} max={30} />
          <NumInput label="Djup (m)" value={activeRoof.heightM} onChange={v => onUpdateRoof({ heightM: v })} min={2} max={20} />
        </div>
        <NumInput label="Taklutning (°)" value={activeRoof.angle} onChange={v => onUpdateRoof({ angle: v })} min={0} max={75} step={1} />
      </Section>

      {/* Panel groups */}
      <Section title="Panelgrupper" icon={Layers}>
        {activeRoof.panelGroups.length === 0 && (
          <p className="text-xs text-muted-foreground">Inga panelgrupper. Lägg till en grupp för att placera paneler.</p>
        )}
        {activeRoof.panelGroups.map(g => (
          <div key={g.id} className="border border-border rounded-xl p-3 space-y-2 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: g.color }} />
              <input
                value={g.name}
                onChange={e => onUpdateGroup(g.id, { name: e.target.value })}
                className="flex-1 text-xs font-semibold bg-transparent border-b border-transparent focus:border-primary focus:outline-none py-0.5"
              />
              <button onClick={() => onRemoveGroup(g.id)} className="p-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="Kolumner" value={g.cols} onChange={v => onUpdateGroup(g.id, { cols: Math.round(v) })} min={1} max={20} step={1} />
              <NumInput label="Rader" value={g.rows} onChange={v => onUpdateGroup(g.id, { rows: Math.round(v) })} min={1} max={10} step={1} />
              <NumInput label="Start kolumn" value={g.startCol} onChange={v => onUpdateGroup(g.id, { startCol: Math.round(v) })} min={1} max={20} step={1} />
              <NumInput label="Start rad" value={g.startRow} onChange={v => onUpdateGroup(g.id, { startRow: Math.round(v) })} min={1} max={10} step={1} />
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onAddGroup}>
          <Plus className="w-3.5 h-3.5" /> Ny panelgrupp
        </Button>
      </Section>

      {/* Obstacles */}
      <Section title="Hinder" icon={AlertTriangle} defaultOpen={false}>
        {activeRoof.obstacles.length === 0 && (
          <p className="text-xs text-muted-foreground">Inga hinder. Välj "Hinder"-verktyget och klicka på taket för att lägga till.</p>
        )}
        {activeRoof.obstacles.map(o => (
          <div key={o.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="flex-1 text-xs">{o.name} ({o.type})</span>
            <button onClick={() => onRemoveObstacle(o.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Typ av hinder</label>
          <select
            value={newObstacleType}
            onChange={e => setNewObstacleType(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {OBSTACLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">Aktivera "Hinder"-läget och klicka på ritningen för att placera.</p>
      </Section>
    </div>
  );
}