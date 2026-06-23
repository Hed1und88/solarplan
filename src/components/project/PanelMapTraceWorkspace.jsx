// ... behåll dina befintliga imports i toppen ...
import { X, LayoutGrid, Check, Info } from 'lucide-react'; // Lägg till X och LayoutGrid

export default function PanelMapTraceWorkspace({ project, onUpdate }) {
  // --- NYTT STATE FÖR STEG 4 ---
  const [activePlacementRoof, setActivePlacementRoof] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState('');

  // ... behåll din befintliga logik för trace, draft och mappedRoofs ...

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      {/* DIN BEFINTLIGA KARTA OCH RIT-YTA */}
      <main className="relative flex-1 overflow-hidden">
        {/* ... din befintliga SVG med kartan ... */}
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="absolute inset-0 h-full w-full touch-none">
          {mappedRoofs.map((roof, roofIndex) => {
            const points = roof.mapPolygon.map(pointToCanvas);
            return (
              <g 
                key={roof.id} 
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  // ÖPPNAR ARBETSYTAN (STEG 4)
                  setActivePlacementRoof(roof);
                }}
              >
                {/* Det orangea taket */}
                <polygon 
                  points={points.map(p => `${p.x},${p.y}`).join(' ')} 
                  fill="rgba(249,115,22,0.25)" 
                  stroke="#f97316" 
                  strokeWidth="5" 
                  className="group-hover:fill-orange-500/40 transition-colors"
                />
                <text x={points[0]?.x} y={points[0]?.y - 15} fill="#fff" fontSize="24" fontWeight="900" paintOrder="stroke" stroke="#000" strokeWidth="4">
                  {roof.name} (Klicka för att placera paneler)
                </text>
              </g>
            );
          })}
        </svg>
      </main>

      {/* --- STEG 4: SKALENLIG ARBETSYTA (OVERLAY) --- */}
      {activePlacementRoof && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="relative flex h-full w-full max-w-6xl flex-col rounded-3xl border-[6px] border-purple-500 bg-white shadow-2xl overflow-hidden">
            
            {/* Header */}
            <header className="flex items-center justify-between bg-purple-500 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <LayoutGrid className="h-6 w-6" />
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tighter">Panelplacering: {activePlacementRoof.name}</h2>
                  <p className="text-xs opacity-80">Skala: 1:1 baserat på kalibrering ({activePlacementRoof.widthM}m x {activePlacementRoof.roofFallM}m)</p>
                </div>
              </div>
              <button 
                onClick={() => setActivePlacementRoof(null)}
                className="rounded-full bg-white/20 p-2 hover:bg-white/40 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </header>

            <div className="flex flex-1 overflow-hidden">
              {/* Vänster: Inställningar */}
              <aside className="w-72 border-r border-slate-100 bg-slate-50/50 p-6 space-y-6">
                <section>
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Välj Solpanel</label>
                  <select 
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none focus:border-purple-400"
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">Välj produkt från katalog...</option>
                    {/* Här mappar du din produktkatalog */}
                    <option value="standard">Standardpanel (1134x1762mm)</option>
                  </select>
                </section>

                <div className="rounded-2xl bg-purple-50 p-4 border border-purple-100">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                    <Info className="h-4 w-4" /> Info
                  </div>
                  <p className="mt-1 text-xs text-purple-600 leading-relaxed">
                    Panelerna placeras automatiskt utifrån takets verkliga mått som du kalibrerade i Steg 2.
                  </p>
                </div>

                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-12 rounded-xl shadow-lg shadow-purple-200"
                  onClick={() => {
                    // Logik för att spara panelerna till taket
                    setActivePlacementRoof(null);
                  }}
                >
                  Spara och applicera <Check className="ml-2 h-4 w-4" />
                </Button>
              </aside>

              {/* Höger: Den skalenliga arbetsytan */}
              <main className="flex-1 bg-slate-100 p-10 flex items-center justify-center overflow-auto">
                <div 
                  className="relative bg-white shadow-2xl border border-white transition-all"
                  style={{
                    width: activePlacementRoof.widthM * 60, // 60 pixlar per meter för bra överblick
                    height: activePlacementRoof.roofFallM * 60,
                    backgroundImage: 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)',
                    backgroundSize: '30px 30px'
                  }}
                >
                  {/* Här ritas panelerna ut automatiskt i skala */}
                  <div className="absolute inset-0 flex items-center justify-center border-4 border-dashed border-slate-200 pointer-events-none">
                    <span className="text-slate-300 font-bold uppercase tracking-widest text-xl opacity-20">Arbetsyta {activePlacementRoof.widthM}m</span>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
