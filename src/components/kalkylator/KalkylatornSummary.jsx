import { Zap, Sun, Layers, AlertTriangle, Home } from 'lucide-react';

const PANEL_W_M = 1.134;
const PANEL_H_M = 1.722;
const PANEL_POWER_W = 415;  // default W per panel
const PRICE_PER_KWP = 12000; // SEK/kWp installed rough estimate

function calcRoofPanels(roof) {
  const totalCols = Math.floor(roof.widthM / PANEL_W_M);
  const totalRows = Math.floor(roof.heightM / PANEL_H_M);
  let count = 0;
  roof.panelGroups.forEach(g => {
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const col = g.startCol - 1 + c;
        const row = g.startRow - 1 + r;
        if (col < totalCols && row < totalRows) count++;
      }
    }
  });
  return count;
}

function Row({ label, value, sub, highlight }) {
  return (
    <div className={`flex items-baseline justify-between py-1.5 ${highlight ? 'font-semibold text-foreground' : 'text-sm text-muted-foreground'}`}>
      <span className={highlight ? 'text-sm' : 'text-xs'}>{label}</span>
      <span className={`${highlight ? 'text-base text-primary' : 'text-xs'} text-right`}>
        {value} {sub && <span className="text-muted-foreground font-normal text-xs">{sub}</span>}
      </span>
    </div>
  );
}

export default function KalkylatornSummary({ roofs }) {
  const totalPanels = roofs.reduce((sum, r) => sum + calcRoofPanels(r), 0);
  const totalKwp = (totalPanels * PANEL_POWER_W) / 1000;
  const estYearlyKwh = Math.round(totalKwp * 950); // ~950 kWh/kWp Sweden avg
  const estCost = Math.round(totalKwp * PRICE_PER_KWP);
  const estRoi = totalKwp > 0 ? Math.round(estCost / (estYearlyKwh * 1.5)) : '–'; // ~1.5 SEK/kWh value
  const totalObstacles = roofs.reduce((s, r) => s + r.obstacles.length, 0);

  // Count rails: per group, per row of panels → 2 rails per row
  const totalRails = roofs.reduce((sum, r) => {
    return sum + r.panelGroups.reduce((gs, g) => {
      const rowSet = new Set();
      const totalCols = Math.floor(r.widthM / PANEL_W_M);
      const totalRows = Math.floor(r.heightM / PANEL_H_M);
      for (let row = 0; row < g.rows; row++) {
        const absRow = g.startRow - 1 + row;
        if (absRow < totalRows) rowSet.add(absRow);
      }
      return gs + rowSet.size * 2;
    }, 0);
  }, 0);

  const totalBrackets = roofs.reduce((sum, r) => {
    return sum + r.panelGroups.reduce((gs, g) => {
      const totalCols = Math.floor(r.widthM / PANEL_W_M);
      const totalRows = Math.floor(r.heightM / PANEL_H_M);
      const rowSet = new Map();
      for (let row = 0; row < g.rows; row++) {
        for (let col = 0; col < g.cols; col++) {
          const absRow = g.startRow - 1 + row;
          const absCol = g.startCol - 1 + col;
          if (absRow < totalRows && absCol < totalCols) {
            if (!rowSet.has(absRow)) rowSet.set(absRow, []);
            rowSet.get(absRow).push(absCol);
          }
        }
      }
      let brackets = 0;
      rowSet.forEach(cols => { brackets += Math.ceil(cols.length / 2) * 2; });
      return gs + brackets;
    }, 0);
  }, 0);

  return (
    <div className="p-4 space-y-5">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Sun className="w-4 h-4 text-primary" /> Sammanställning
      </h2>

      {/* Per roof */}
      {roofs.map(r => {
        const n = calcRoofPanels(r);
        const kwp = (n * PANEL_POWER_W) / 1000;
        return (
          <div key={r.id} className="bg-muted/30 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Home className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">{r.name}</span>
            </div>
            <Row label="Panelgrupper" value={r.panelGroups.length} sub="st" />
            <Row label="Antal paneler" value={n} sub="st" />
            <Row label="Installerad effekt" value={kwp.toFixed(2)} sub="kWp" />
            <Row label="Taklutning" value={`${r.angle}°`} />
            {r.obstacles.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs">{r.obstacles.length} hinder markerade</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Totals */}
      <div className="border-t border-border pt-3 space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Totalt – alla tak</p>
        <Row label="Paneler" value={totalPanels} sub="st" highlight />
        <Row label="Installerad effekt" value={totalKwp.toFixed(2)} sub="kWp" highlight />
        <Row label="Beräknad årsproduktion" value={estYearlyKwh.toLocaleString('sv-SE')} sub="kWh/år" highlight />
      </div>

      {/* Mounting hardware */}
      <div className="border-t border-border pt-3 space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          <Layers className="w-3 h-3 inline mr-1" />Montagematerial (uppskattning)
        </p>
        <Row label="Skenor (2 per panelrad)" value={totalRails} sub="st" />
        <Row label="Takfästen" value={totalBrackets} sub="st" />
        <Row label="Mittklämmar" value={Math.max(0, totalPanels - roofs.reduce((s,r)=>s+r.panelGroups.length,0))} sub="st" />
        <Row label="Ändklämmar" value={roofs.reduce((s,r)=>s+r.panelGroups.length,0) * 4} sub="st" />
        {totalObstacles > 0 && <Row label="Hinder att ta hänsyn till" value={totalObstacles} sub="st" />}
      </div>

      {/* Cost estimate */}
      <div className="border-t border-border pt-3 space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          <Zap className="w-3 h-3 inline mr-1" />Ekonomi (grov uppskattning)
        </p>
        <Row label="Totalkostnad inkl. montage" value={estCost.toLocaleString('sv-SE')} sub="SEK" highlight />
        <Row label="Återbetalningstid" value={typeof estRoi === 'number' ? `~${estRoi}` : estRoi} sub="år" />
        <p className="text-[10px] text-muted-foreground mt-2">
          Baserat på {PANEL_POWER_W}W/panel, 950 kWh/kWp/år (Sverige), {PRICE_PER_KWP.toLocaleString('sv-SE')} SEK/kWp installerat.
        </p>
      </div>
    </div>
  );
}