import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wind, Snowflake, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

const SYSTEMS = {
  weland: {
    label: 'Weland',
    models: ['Weland TakFot', 'Weland ByggelBalk', 'Weland Krok S', 'Weland Krok L'],
    maxSnow: 3.5,  // kN/m²
    maxWind: 1.2,
    description: 'Svensk tillverkare, passar plåttak och tegelpannor',
  },
  nordmount: {
    label: 'Nordmount',
    models: ['NordMount Basic', 'NordMount Pro', 'NordMount Flat'],
    maxSnow: 4.0,
    maxWind: 1.4,
    description: 'Nordisk standard, robust mot snö och kyla',
  },
  mafi: {
    label: 'Mafi',
    models: ['Mafi Classic', 'Mafi Plus', 'Mafi Universal'],
    maxSnow: 3.0,
    maxWind: 1.1,
    description: 'Kostnadseffektivt, passar de flesta taktyper',
  },
  k2: {
    label: 'K2 Systems',
    models: ['K2 MountSystems MF2+', 'K2 CrossRail', 'K2 PitchedRoof'],
    maxSnow: 4.5,
    maxWind: 1.6,
    description: 'Premiumsystem, certifierat för nordiska förhållanden',
  },
  schletter: {
    label: 'Schletter',
    models: ['Schletter FlatFix', 'Schletter PV-Eco', 'Schletter FixZ'],
    maxSnow: 3.8,
    maxWind: 1.3,
    description: 'Tyskt premium, lång livslängd',
  },
};

// Snow zones Sweden (simplified, skz 1–4)
const SNOW_ZONES = [
  { label: 'Zon 1 – Sydkusten', value: 0.6 },
  { label: 'Zon 2 – Mellansverige', value: 1.5 },
  { label: 'Zon 3 – Dalarna/Norrland', value: 2.5 },
  { label: 'Zon 4 – Fjälltrakterna', value: 4.5 },
];

// Wind zones Sweden
const WIND_ZONES = [
  { label: 'Vindzon 1 – Inlandet skyddat', value: 0.6 },
  { label: 'Vindzon 2 – Normalt läge', value: 0.8 },
  { label: 'Vindzon 3 – Exponerat läge', value: 1.0 },
  { label: 'Vindzon 4 – Kust/öppen terräng', value: 1.2 },
];

export default function MountingSystemCalculator({ project }) {
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [snowZone, setSnowZone] = useState('');
  const [windZone, setWindZone] = useState('');
  const [roofAngle, setRoofAngle] = useState('30');
  const [showResult, setShowResult] = useState(false);

  const roofArea = project.roof_width_m && project.roof_height_m
    ? parseFloat(project.roof_width_m) * parseFloat(project.roof_height_m)
    : null;

  const calculate = () => setShowResult(true);

  const snowLoad = snowZone ? parseFloat(snowZone) : null;
  const windLoad = windZone ? parseFloat(windZone) : null;
  const angle = parseFloat(roofAngle) || 30;

  // Snow: adjust for roof angle (Eurokod factor)
  const muFactor = angle <= 30 ? 0.8 : angle <= 60 ? 0.8 * (60 - angle) / 30 : 0;
  const designSnow = snowLoad ? (snowLoad * muFactor).toFixed(2) : null;

  // Wind: simplified uplift pressure (angle factor)
  const cpe = angle < 15 ? -1.3 : angle < 30 ? -0.9 : -0.7;
  const designWind = windLoad ? Math.abs(cpe * windLoad).toFixed(2) : null;

  const system = selectedBrand ? SYSTEMS[selectedBrand] : null;
  const snowOk = system && designSnow ? parseFloat(designSnow) <= system.maxSnow : null;
  const windOk = system && designWind ? parseFloat(designWind) <= system.maxWind : null;
  const totalLoad = designSnow && designWind ? (parseFloat(designSnow) + parseFloat(designWind)).toFixed(2) : null;

  return (
    <div className="space-y-4">
      {/* Brand selection */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Välj montagesystem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(SYSTEMS).map(([key, sys]) => (
              <button
                key={key}
                onClick={() => { setSelectedBrand(key); setSelectedModel(''); setShowResult(false); }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  selectedBrand === key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <p className="font-semibold text-sm">{sys.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sys.description}</p>
              </button>
            ))}
          </div>

          {selectedBrand && (
            <div>
              <p className="text-sm font-medium mb-2">Välj modell</p>
              <div className="flex flex-wrap gap-2">
                {SYSTEMS[selectedBrand].models.map(m => (
                  <button
                    key={m}
                    onClick={() => { setSelectedModel(m); setShowResult(false); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      selectedModel === m
                        ? 'bg-primary text-white border-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load inputs */}
      {selectedModel && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wind className="w-4 h-4 text-blue-500" />
              <Snowflake className="w-4 h-4 text-sky-400" />
              Snö- och vindlastberäkning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Snözon (Sverige)</label>
                <select
                  value={snowZone}
                  onChange={e => { setSnowZone(e.target.value); setShowResult(false); }}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Välj snözon...</option>
                  {SNOW_ZONES.map(z => (
                    <option key={z.value} value={z.value}>{z.label} ({z.value} kN/m²)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Vindzon</label>
                <select
                  value={windZone}
                  onChange={e => { setWindZone(e.target.value); setShowResult(false); }}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Välj vindzon...</option>
                  {WIND_ZONES.map(z => (
                    <option key={z.value} value={z.value}>{z.label} ({z.value} kN/m²)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Takvinkel (grader)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={roofAngle}
                  onChange={e => { setRoofAngle(e.target.value); setShowResult(false); }}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="t.ex. 30"
                />
              </div>
              {roofArea && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Takyta (från mått)</label>
                  <div className="border border-border rounded-xl px-3 py-2 text-sm bg-muted/30 text-muted-foreground">
                    {roofArea.toFixed(1)} m²
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={calculate}
              disabled={!snowZone || !windZone}
              className="gap-2 w-full sm:w-auto"
            >
              Beräkna laster
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {showResult && system && (
        <Card className={`border-0 shadow-sm ${snowOk && windOk ? 'bg-green-50' : 'bg-red-50'}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {snowOk && windOk
                ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Systemet klarar lasterna</>
                : <><AlertTriangle className="w-5 h-5 text-red-500" /> Systemet klarar INTE lasterna</>
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1">
                  <Snowflake className="w-3.5 h-3.5 text-sky-500" />
                  <p className="text-xs text-muted-foreground">Snölast (design)</p>
                </div>
                <p className="text-xl font-bold">{designSnow}</p>
                <p className="text-xs text-muted-foreground">kN/m²</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1">
                  <Wind className="w-3.5 h-3.5 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Vindlast (design)</p>
                </div>
                <p className="text-xl font-bold">{designWind}</p>
                <p className="text-xs text-muted-foreground">kN/m²</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-xs text-muted-foreground mb-1">Total last</p>
                <p className="text-xl font-bold">{totalLoad}</p>
                <p className="text-xs text-muted-foreground">kN/m²</p>
              </div>
              {roofArea && (
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">Total kraft</p>
                  <p className="text-xl font-bold">{totalLoad ? (parseFloat(totalLoad) * roofArea * 1000).toFixed(0) : '–'}</p>
                  <p className="text-xs text-muted-foreground">N ({(parseFloat(totalLoad || 0) * (roofArea || 0)).toFixed(1)} kN)</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                <span>Snölastkapacitet {system.label} {selectedModel}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">max {system.maxSnow} kN/m²</span>
                  <Badge className={snowOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {snowOk ? '✓ OK' : '✗ UNDERDIMENSIONERAT'}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                <span>Vindlastkapacitet {system.label} {selectedModel}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">max {system.maxWind} kN/m²</span>
                  <Badge className={windOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {windOk ? '✓ OK' : '✗ UNDERDIMENSIONERAT'}
                  </Badge>
                </div>
              </div>
            </div>

            {(!snowOk || !windOk) && (
              <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-xl text-sm text-red-800">
                <strong>Rekommendation:</strong> Välj ett starkare system som K2 Systems MF2+ eller Nordmount Pro för dessa lastförhållanden.
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-3">
              Beräkning enligt Eurokod SS-EN 1991-1-3 (snö) och SS-EN 1991-1-4 (vind). Formfaktor μ = {muFactor.toFixed(2)}, vindtryckskoefficient cpe = {cpe}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}