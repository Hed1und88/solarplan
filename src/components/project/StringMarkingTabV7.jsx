import React from 'react';

export default function SolarRoofBlueprint() {
  // Definitioner för panelerna (4 kolumner x 3 rader)
  // Positioner beräknade exakt för att ligga i ett perfekt CAD-grid
  const panels = [
    // Rad 1
    { id: 1, x: 110, y: 80, isString1: true },
    { id: 2, x: 205, y: 80, isString1: true },
    { id: 3, x: 300, y: 80, isString1: true },
    { id: 4, x: 395, y: 80, isString1: false },
    // Rad 2
    { id: 5, x: 110, y: 195, isString1: false },
    { id: 6, x: 205, y: 195, isString1: true },
    { id: 7, x: 300, y: 195, isString1: true },
    { id: 8, x: 395, y: 195, isString1: true },
    // Rad 3
    { id: 9, x: 110, y: 310, isString1: false },
    { id: 10, x: 205, y: 310, isString1: false },
    { id: 11, x: 300, y: 310, isString1: false },
    { id: 12, x: 395, y: 310, isString1: false },
  ];

  const w = 85;  // Panelbredd
  const h = 100; // Panelhöjd

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-slate-50 text-slate-800 rounded-xl border border-slate-200 shadow-sm font-sans">
      
      {/* CAD-HEADER */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-mono font-bold tracking-tight text-slate-900">Tak 1</h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">Strängningsschema / Systemkonfiguration</p>
        </div>
        
        {/* Teckenförklaring */}
        <div className="flex gap-4 text-xs font-mono bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-500"></span>
            <span className="text-slate-700 font-medium">Slinga 1</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-400"></span>
            <span className="text-slate-700 font-medium">Omonterad yta</span>
          </div>
        </div>
      </div>

      {/* RITYTA (PURE SVG BLUEPRINT) */}
      <div className="w-full bg-white border border-slate-200 rounded-xl p-4 shadow-inner flex justify-center">
        <svg 
          className="w-full max-w-[650px] h-auto overflow-visible" 
          viewBox="0 0 620 460" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Professionellt arkitektoniskt snedstrecksmönster (Hatching) för taket */}
            <pattern id="roof-hatch" width="20" height="20" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="20" stroke="#e2e8f0" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* TAKETS YTTERKANT (Den stora ramen) */}
          <rect 
            x="50" 
            y="50" 
            width="520" 
            height="380" 
            fill="url(#roof-hatch)" 
            stroke="#0f172a" 
            strokeWidth="2" 
            strokeLinejoin="round"
          />

          {/* RENDERING AV SOLCELLSPANELER */}
          {panels.map((p) => (
            <g key={p.id}>
              {/* Panelens basrektangel */}
              <rect
                x={p.x}
                y={p.y}
                width={w}
                height={h}
                rx="4"
                fill={p.isString1 ? '#fef2f2' : '#eff6ff'}
                stroke={p.isString1 ? '#ef4444' : '#3b82f6'}
                strokeWidth={p.isString1 ? '2.5' : '1.5'}
                className="transition-all"
              />
              
              {/* Panelnummer (Centrerat och rent) */}
              <text
                x={p.x + w / 2}
                y={p.y + h / 2 + 5}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="14"
                fontWeight="bold"
                fill={p.isString1 ? '#b91c1c' : '#1d4ed8'}
              >
                {p.id}
              </text>

              {/* Liten textindikator i botten på panelen */}
              <text
                x={p.x + w / 2}
                y={p.y + h - 10}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="9"
                fontWeight="600"
                fill={p.isString1 ? '#ef4444' : '#60a5fa'}
                letterSpacing="0.5"
              >
                {p.isString1 ? 'SLINGA 1' : 'LEDIG'}
              </text>

              {/* Svarta anslutningspunkter/plintar på sidorna enligt skiss */}
              <circle cx={p.x} cy={p.y + h / 2} r="3.5" fill="#0f172a" />
              <circle cx={p.x + w} cy={p.y + h / 2} r="3.5" fill={p.isString1 ? '#ef4444' : '#0f172a'} />
            </g>
          ))}

          {/* ========================================== */}
          {/* KABELDRAGNING (EXAKT VEKTORMAPPAD EFTER DIN SKISS) */}
          {/* ========================================== */}

          {/* POSITIV LEDARE (RÖD TJOCK LINJE) */}
          {/* Går igenom paneler: 1 -> 2 -> 3 -> (ner till rad 2) -> 7 -> 6 -> 8 */}
          <path
            d="M 25,130 L 152.5,130 L 247.5,130 L 342.5,130 L 342.5,215 L 342.5,245 L 247.5,245 L 180,245"
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* NEGATIV LEDARE / RETURKABEL (MÖRKGRÅ / SVART STRÄCKAD LINJE) */}
          <path
            d="M 25,210 L 160,210 L 160,275 L 330,275 L 450,275 M 420,245 L 595,245"
            fill="none"
            stroke="#334155"
            strokeWidth="2.5"
            strokeDasharray="6,4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* POL-ANSKUTNINGAR (+ / - GLOBER) */}
          {/* Huvud-Pluspol (Vänster ovankant) */}
          <g transform="translate(25, 130)">
            <circle r="12" fill="#ffffff" stroke="#ef4444" strokeWidth="2.5" />
            <text x="0" y="4" textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="bold" fontFamily="monospace">+</text>
          </g>

          {/* Vänster Minuspol */}
          <g transform="translate(25, 210)">
            <circle r="12" fill="#ffffff" stroke="#334155" strokeWidth="2.5" />
            <text x="0" y="4" textAnchor="middle" fill="#334155" fontSize="14" fontWeight="bold" fontFamily="monospace">-</text>
          </g>

          {/* Höger Minuspol (Utgång till växelriktare) */}
          <g transform="translate(595, 245)">
            <circle r="12" fill="#ffffff" stroke="#334155" strokeWidth="2.5" />
            <text x="0" y="4" textAnchor="middle" fill="#334155" fontSize="14" fontWeight="bold" fontFamily="monospace">-</text>
          </g>
        </svg>
      </div>

    </div>
  );
}
