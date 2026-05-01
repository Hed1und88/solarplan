import { useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// Panel dimensions in mm — standard 1722×1134
const PANEL_W_M = 1.134;
const PANEL_H_M = 1.722;
const RAIL_OFFSET_RATIO = 0.2; // rails at 20% and 80% of panel height

const OBSTACLE_SIZE = 0.8; // meters

function toSvg(m, scale) { return m * scale; }

export default function RoofCanvas({ roof, tool, onAddObstacle, onUpdateGroup }) {
  const svgRef = useRef(null);
  const [scale, setScale] = useState(60); // px per meter
  const [hoverCell, setHoverCell] = useState(null);

  const W = toSvg(roof.widthM, scale);
  const H = toSvg(roof.heightM, scale);
  const pw = toSvg(PANEL_W_M, scale);
  const ph = toSvg(PANEL_H_M, scale);

  // Grid columns/rows for the entire roof
  const totalCols = Math.floor(roof.widthM / PANEL_W_M);
  const totalRows = Math.floor(roof.heightM / PANEL_H_M);

  // Build set of occupied cells per group
  const groupCells = {};
  const cellToGroup = {};
  roof.panelGroups.forEach(g => {
    groupCells[g.id] = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const col = g.startCol - 1 + c;
        const row = g.startRow - 1 + r;
        if (col < totalCols && row < totalRows) {
          const key = `${col}_${row}`;
          groupCells[g.id].push({ col, row });
          cellToGroup[key] = g;
        }
      }
    }
  });

  const getSvgPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return { x, y };
  }, []);

  const handleSvgClick = (e) => {
    if (tool !== 'obstacle') return;
    const pt = getSvgPoint(e);
    if (!pt) return;
    const mx = pt.x / scale;
    const my = pt.y / scale;
    if (mx < 0 || mx > roof.widthM || my < 0 || my > roof.heightM) return;
    onAddObstacle({ type: 'skorsten', xM: mx, yM: my });
  };

  const handleMouseMove = (e) => {
    const pt = getSvgPoint(e);
    if (!pt) return;
    const col = Math.floor(pt.x / pw);
    const row = Math.floor(pt.y / ph);
    setHoverCell({ col, row });
  };

  // Rails: horizontal lines at 20% and 80% panel height, per group row
  function renderRails(g) {
    const rails = [];
    const rowSet = new Set(groupCells[g.id]?.map(c => c.row) || []);
    rowSet.forEach(row => {
      const colsInRow = (groupCells[g.id] || []).filter(c => c.row === row).map(c => c.col).sort((a,b)=>a-b);
      if (!colsInRow.length) return;
      const x1 = toSvg(colsInRow[0] * PANEL_W_M, scale);
      const x2 = toSvg((colsInRow[colsInRow.length - 1] + 1) * PANEL_W_M, scale);
      const y1 = toSvg(row * PANEL_H_M + PANEL_H_M * RAIL_OFFSET_RATIO, scale);
      const y2 = toSvg(row * PANEL_H_M + PANEL_H_M * (1 - RAIL_OFFSET_RATIO), scale);
      rails.push(
        <line key={`rail-top-${row}`} x1={x1} y1={y1} x2={x2} y2={y1} stroke={g.color} strokeWidth={3} strokeOpacity={0.7} />,
        <line key={`rail-bot-${row}`} x1={x1} y1={y2} x2={x2} y2={y2} stroke={g.color} strokeWidth={3} strokeOpacity={0.7} />
      );
      // Mounting brackets every 2 panels
      colsInRow.forEach((col, i) => {
        if (i % 2 === 0) {
          const bx = toSvg(col * PANEL_W_M + PANEL_W_M / 2, scale);
          [y1, y2].forEach((by, bi) => {
            rails.push(
              <rect key={`bracket-${row}-${col}-${bi}`} x={bx - 4} y={by - 3} width={8} height={6} rx={1}
                fill={g.color} fillOpacity={0.9} stroke="white" strokeWidth={0.5} />
            );
          });
        }
      });
    });
    return rails;
  }

  const zoom = (dir) => setScale(s => Math.max(30, Math.min(130, s + dir * 10)));
  const fit = () => {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const sw = (container.clientWidth - 40) / roof.widthM;
    const sh = (container.clientHeight - 40) / roof.heightM;
    setScale(Math.max(30, Math.min(130, Math.floor(Math.min(sw, sh)))));
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <span className="text-xs text-muted-foreground flex-1">
          {roof.name} · {roof.widthM}×{roof.heightM} m · {Math.floor(roof.widthM / PANEL_W_M)}×{Math.floor(roof.heightM / PANEL_H_M)} panelpositioner
        </span>
        {tool === 'obstacle' && (
          <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">Klicka på taket för att placera hinder</span>
        )}
        <button onClick={() => zoom(1)} className="p-1.5 hover:bg-muted rounded-lg"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => zoom(-1)} className="p-1.5 hover:bg-muted rounded-lg"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={fit} className="p-1.5 hover:bg-muted rounded-lg"><Maximize2 className="w-4 h-4" /></button>
      </div>

      {/* SVG drawing */}
      <div className="flex-1 overflow-auto p-6">
        <svg
          ref={svgRef}
          width={W + 60}
          height={H + 60}
          onClick={handleSvgClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverCell(null)}
          className={tool === 'obstacle' ? 'cursor-crosshair' : 'cursor-default'}
          style={{ userSelect: 'none' }}
        >
          {/* Rulers */}
          <g transform="translate(40,40)">
            {/* Roof background */}
            <rect x={0} y={0} width={W} height={H} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={2} rx={4} />

            {/* Grid guide lines */}
            {Array.from({ length: totalCols + 1 }).map((_, i) => (
              <line key={`vg-${i}`} x1={i * pw} y1={0} x2={i * pw} y2={H} stroke="#e2e8f0" strokeWidth={0.5} />
            ))}
            {Array.from({ length: totalRows + 1 }).map((_, i) => (
              <line key={`hg-${i}`} x1={0} y1={i * ph} x2={W} y2={i * ph} stroke="#e2e8f0" strokeWidth={0.5} />
            ))}

            {/* Hover highlight */}
            {hoverCell && hoverCell.col >= 0 && hoverCell.col < totalCols && hoverCell.row >= 0 && hoverCell.row < totalRows && (
              <rect
                x={hoverCell.col * pw} y={hoverCell.row * ph}
                width={pw} height={ph}
                fill={tool === 'obstacle' ? '#ef444430' : '#3b82f620'}
                stroke={tool === 'obstacle' ? '#ef4444' : '#3b82f6'}
                strokeWidth={1} rx={2}
              />
            )}

            {/* Panel groups */}
            {roof.panelGroups.map(g =>
              (groupCells[g.id] || []).map(({ col, row }) => (
                <g key={`${g.id}-${col}-${row}`}>
                  <rect
                    x={col * pw + 1} y={row * ph + 1}
                    width={pw - 2} height={ph - 2}
                    fill={g.color} fillOpacity={0.18}
                    stroke={g.color} strokeWidth={1.5} rx={2}
                  />
                  {/* Panel internal lines (cell pattern) */}
                  <line x1={col * pw + pw / 3} y1={row * ph + 2} x2={col * pw + pw / 3} y2={row * ph + ph - 2} stroke={g.color} strokeWidth={0.5} strokeOpacity={0.4} />
                  <line x1={col * pw + pw * 2 / 3} y1={row * ph + 2} x2={col * pw + pw * 2 / 3} y2={row * ph + ph - 2} stroke={g.color} strokeWidth={0.5} strokeOpacity={0.4} />
                </g>
              ))
            )}

            {/* Rails & brackets per group */}
            {roof.panelGroups.map(g => (
              <g key={`rails-${g.id}`}>{renderRails(g)}</g>
            ))}

            {/* Group labels */}
            {roof.panelGroups.map(g => {
              const first = groupCells[g.id]?.[0];
              if (!first) return null;
              return (
                <text
                  key={`label-${g.id}`}
                  x={first.col * pw + pw / 2}
                  y={first.row * ph + ph / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fill={g.color} fontWeight="700" opacity={0.9}
                >
                  {g.name}
                </text>
              );
            })}

            {/* Obstacles */}
            {roof.obstacles.map(o => {
              const ox = toSvg(o.xM, scale) - toSvg(OBSTACLE_SIZE / 2, scale);
              const oy = toSvg(o.yM, scale) - toSvg(OBSTACLE_SIZE / 2, scale);
              const os = toSvg(OBSTACLE_SIZE, scale);
              return (
                <g key={o.id}>
                  <rect x={ox} y={oy} width={os} height={os} fill="#fef08a" stroke="#f59e0b" strokeWidth={2} rx={4} strokeDasharray="4 2" />
                  <text x={ox + os / 2} y={oy + os / 2 - 4} textAnchor="middle" fontSize={8} fill="#92400e" fontWeight="600">⚠</text>
                  <text x={ox + os / 2} y={oy + os / 2 + 7} textAnchor="middle" fontSize={7} fill="#92400e">{o.name}</text>
                </g>
              );
            })}

            {/* Dimension labels */}
            <text x={W / 2} y={H + 18} textAnchor="middle" fontSize={11} fill="#64748b">{roof.widthM} m</text>
            <text x={-18} y={H / 2} textAnchor="middle" fontSize={11} fill="#64748b" transform={`rotate(-90,-18,${H / 2})`}>{roof.heightM} m</text>
          </g>

          {/* Ruler ticks */}
          {Array.from({ length: totalCols + 1 }).map((_, i) => (
            <text key={`rt-${i}`} x={40 + i * pw} y={32} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {(i * PANEL_W_M).toFixed(1)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}