import React from 'react';

export default function SolarRoofEngineerView() {
  const panels = [
    { id: 1, x: 130, y: 60, isString1: true },
    { id: 2, x: 260, y: 60, isString1: true },
    { id: 3, x: 390, y: 60, isString1: true },
    { id: 4, x: 520, y: 60, isString1: false },
    { id: 5, x: 130, y: 205, isString1: false },
    { id: 6, x: 260, y: 205, isString1: true },
    { id: 7, x: 390, y: 205, isString1: true },
    { id: 8, x: 520, y: 205, isString1: true },
    { id: 9, x: 130, y: 350, isString1: false },
    { id: 10, x: 260, y: 350, isString1: false },
    { id: 11, x: 390, y: 350, isString1: false },
    { id: 12, x: 520, y: 350, isString1: false },
  ];

  const pw = 110;
  const ph = 125;

  return (
    <div className="w-full max-w-5xl mx-auto p-8 bg-slate-50 text-slate-800 rounded-2xl border border-slate-200 shadow-sm font-sans select-none">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-slate-900 text-white px-2 py-1 rounded-md font-bold tracking-wider">CAD VIEW v2.0</span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Tak 1 — Strängningsschema</h2>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">Högprecisionell layout för fältmontering.</p>
        </div>
        <div className="flex gap-5 text-xs font-mono bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-rose-500"></span><span className="text-slate-700 font-semibold">Slinga 1 (Aktiv)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-sky-500"></span><span className="text-slate-700 font-semibold">Ledig yta</span></div>
        </div>
      </div>

      <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-inner flex justify-center items-center relative overflow-hidden">
        <svg className="w-full max-w-[760px] h-auto overflow-visible" viewBox="0 0 760 520" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="pv-cells" width="12" height="16" patternUnits="userSpaceOnUse">
              <rect width="12" height="16" fill="none" stroke="#ffffff" strokeWidth="0.4" opacity="0.12" />
              <line x1="6" y1="0" x2="6" y2="16" stroke="#ffffff" strokeWidth="0.2" opacity="0.08" />
            </pattern>
          </defs>

          <rect x="40" y="20" width="680" height="470" rx="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
          <rect x="46" y="26" width="668" height="458" rx="8" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="5,4" />

          <path d="M 20,122 L 445,122 L 445,267 L 740,267" fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          <path d="M 20,122 L 185,122 L 315,122 L 425,122 Q 445,122 445,142 L 445,247 Q 445,267 425,267 L 315,267 L 200,267" fill="none" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 20,210 L 160,210 Q 185,210 185,230 L 185,300 Q 185,320 210,320 L 545,320 Q 575,320 575,295 L 575,267 L 740,267" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="6,4" strokeLinecap="round" strokeLinejoin="round" />

          {panels.map((p) => (
            <g key={p.id}>
              <rect x={p.x} y={p.y} width={pw} height={ph} rx="6" fill={p.isString1 ? '#0f172a' : '#1e293b'} stroke={p.isString1 ? '#f43f5e' : '#3b82f6'} strokeWidth={p.isString1 ? '2.5' : '1.5'} />
              <rect x={p.x + 4} y={p.y + 4} width={pw - 8} height={ph - 8} rx="4" fill="url(#pv-cells)" opacity={p.isString1 ? '0.95' : '0.65'} />
              {p.isString1 && <rect x={p.x + pw / 2 - 7} y={p.y + ph - 4} width="14" height="6" rx="1.5" fill="#000000" />}
              <g transform={`translate(${p.x + 10}, ${p.y + 12})`}>
                <rect width="24" height="15" rx="3.5" fill="#ffffff" opacity="0.12" />
                <text x="12" y="11" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize="10" fontWeight="bold" fill="#ffffff">{String(p.id).padStart(2, '0')}</text>
              </g>
              <text x={p.x + pw / 2} y={p.y + ph - 14} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="9" fontWeight="800" fill={p.isString1 ? '#f43f5e' : '#60a5fa'} letterSpacing="0.7">{p.isString1 ? 'SLINGA 1' : 'LEDIG'}</text>
            </g>
          ))}

          <g transform="translate(20, 122)"><circle r="14" fill="#ffffff" stroke="#f43f5e" strokeWidth="3" /><circle r="10" fill="#fff1f2" /><text x="0" y="4.5" textAnchor="middle" fill="#f43f5e" fontSize="15" fontWeight="bold" fontFamily="monospace">+</text></g>
          <g transform="translate(20, 210)"><circle r="14" fill="#ffffff" stroke="#334155" strokeWidth="3" /><circle r="10" fill="#f8fafc" /><text x="0" y="4" textAnchor="middle" fill="#334155" fontSize="15" fontWeight="bold" fontFamily="monospace">-</text></g>
          <g transform="translate(740, 267)"><circle r="14" fill="#ffffff" stroke="#334155" strokeWidth="3" /><circle r="10" fill="#f8fafc" /><text x="0" y="4" textAnchor="middle" fill="#334155" fontSize="15" fontWeight="bold" fontFamily="monospace">-</text></g>
        </svg>
      </div>

      <div className="mt-4 flex justify-between items-center text-xs font-mono text-slate-400 px-2 tracking-wider">
        <div>PRODUKTIONSTYP: MONOKRISTALLIN SHINGLE</div>
        <div>MÄTNING: LÅST TILL CC-AVSTÅND</div>
      </div>
    </div>
  );
}
