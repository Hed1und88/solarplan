import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, GitBranch, RefreshCw, Save, Zap } from 'lucide-react';

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, decimals = 1) => Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
const safeJson = (raw, fallback = null) => { try { return JSON.parse(raw || ''); } catch { return fallback; } };

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || 'Ej vald produkt';
}

function panelLabel(panel) {
  return [panel?.brand, panel?.model].filter(Boolean).join(' ') || panel?.name || 'Solpanel';
}

function countPanels(nodes) {
  return new Set((nodes || []).map(node => node.panelId)).size;
}

function getPanelPower(panel) {
  return num(panel?.power_watts, 0);
}

function getInverterPowerKw(inverter) {
  const watts = num(inverter?.power_watts, 0);
  return watts > 0 ? watts / 1000 : num(inverter?.ac_power_kw || inverter?.rated_power_kw, 0);
}

function normalizeSingleLine(project, products) {
  const data = safeJson(project?.string_layout_data, {});
  const strings = Array.isArray(data?.strings) ? data.strings : [];
  const inverterConfigs = Array.isArray(data?.inverterConfigs) && data.inverterConfigs.length
    ? data.inverterConfigs
    : [{ id: 'default-inverter', name: 'Växelriktare 1', productId: data?.inverterProductId || '' }];

  const inverters = inverterConfigs.map((cfg, index) => {
    const product = products.find(item => String(item.id) === String(cfg.productId)) || cfg.productSnapshot || null;
    const inverterStrings = strings
      .filter(item => item.inverterConfigId === cfg.id || (!item.inverterConfigId && index === 0))
      .map(item => {
        const panelProduct = products.find(productItem => String(productItem.id) === String(item.panelProductId)) || item.panelProductSnapshot || null;
        const panelCount = countPanels(item.nodes) || num(item.panel_count, 0);
        const panelW = getPanelPower(panelProduct);
        return {
          id: item.id,
          name: item.name || 'Slinga',
          mppt: Number(item.mppt || 1),
          pvInput: item.pvInput || '',
          panelGroupId: item.panelGroupId || '',
          panelCount,
          panelProduct,
          panelW,
          kwp: panelCount * panelW / 1000,
        };
      })
      .filter(item => item.panelCount > 0)
      .sort((a, b) => a.mppt - b.mppt || Number(a.pvInput || 0) - Number(b.pvInput || 0) || a.name.localeCompare(b.name));

    const mppts = Object.values(inverterStrings.reduce((acc, item) => {
      const key = item.mppt || 1;
      if (!acc[key]) acc[key] = { mppt: key, strings: [], panelCount: 0, kwp: 0 };
      acc[key].strings.push(item);
      acc[key].panelCount += item.panelCount;
      acc[key].kwp += item.kwp;
      return acc;
    }, {})).sort((a, b) => a.mppt - b.mppt);

    return {
      id: cfg.id,
      name: cfg.name || `Växelriktare ${index + 1}`,
      product,
      strings: inverterStrings,
      mppts,
      panelCount: inverterStrings.reduce((sum, item) => sum + item.panelCount, 0),
      stringCount: inverterStrings.length,
      dcKwp: inverterStrings.reduce((sum, item) => sum + item.kwp, 0),
      acKw: getInverterPowerKw(product),
    };
  });

  return {
    sourceVersion: data?.version || null,
    savedAt: data?.savedAt || null,
    inverters,
    totals: {
      inverterCount: inverters.length,
      stringCount: inverters.reduce((sum, item) => sum + item.stringCount, 0),
      panelCount: inverters.reduce((sum, item) => sum + item.panelCount, 0),
      dcKwp: inverters.reduce((sum, item) => sum + item.dcKwp, 0),
      acKw: inverters.reduce((sum, item) => sum + item.acKw, 0),
    },
  };
}

function Node({ x, y, w = 120, h = 58, title, sub, tone = 'slate' }) {
  const tones = {
    dc: { fill: '#422006', stroke: '#facc15', text: '#fef3c7' },
    ac: { fill: '#172554', stroke: '#60a5fa', text: '#dbeafe' },
    inv: { fill: '#052e16', stroke: '#22c55e', text: '#dcfce7' },
    slate: { fill: '#0f172a', stroke: '#64748b', text: '#e2e8f0' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={w} height={h} rx="10" fill={t.fill} stroke={t.stroke} strokeWidth="2" />
      <text x={w / 2} y="22" textAnchor="middle" fontSize="12" fill={t.text} fontWeight="800">{title}</text>
      {sub && <text x={w / 2} y="42" textAnchor="middle" fontSize="9" fill={t.text}>{sub}</text>}
    </g>
  );
}

function Wire({ x1, y1, x2, y2, color = '#facc15' }) {
  const mx = (x1 + x2) / 2;
  return <path d={`M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="2.4" />;
}

function InverterDiagram({ inverter }) {
  const rowHeight = 92;
  const mpptRows = inverter.mppts.length ? inverter.mppts : [{ mppt: 1, strings: [], panelCount: 0, kwp: 0 }];
  const height = Math.max(260, 90 + mpptRows.reduce((sum, row) => sum + Math.max(1, row.strings.length) * rowHeight, 0));
  const invY = Math.max(90, height / 2 - 36);
  const acY = invY;

  let cursorY = 50;
  const stringNodes = [];
  mpptRows.forEach(row => {
    const strings = row.strings.length ? row.strings : [{ id: `empty-${row.mppt}`, name: `MPPT ${row.mppt}`, panelCount: 0, kwp: 0, pvInput: '', panelProduct: null }];
    strings.forEach(string => {
      stringNodes.push({ ...string, mppt: row.mppt, y: cursorY });
      cursorY += rowHeight;
    });
  });

  return (
    <div className="overflow-auto rounded-2xl border bg-gray-950">
      <svg viewBox={`0 0 1180 ${height}`} className="min-h-[360px] w-full min-w-[980px]">
        <defs>
          <marker id={`arrow-${inverter.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" /></marker>
        </defs>

        <text x="35" y="28" fontSize="15" fill="#e2e8f0" fontWeight="800">DC-sida</text>
        <text x="780" y="28" fontSize="15" fill="#dbeafe" fontWeight="800">AC-sida</text>

        {stringNodes.map(node => (
          <React.Fragment key={`${node.id}-${node.mppt}-${node.pvInput}`}>
            <Node
              x={35}
              y={node.y}
              w={170}
              h={62}
              title={`${node.name}${node.pvInput ? ` · PV${node.pvInput}` : ''}`}
              sub={`${node.panelCount || 0} paneler · ${round(node.kwp, 2)} kWp`}
              tone="dc"
            />
            <Node x={245} y={node.y + 4} w={92} h={54} title="DC" sub="bryt/säkr" tone="dc" />
            <Node x={375} y={node.y + 4} w={92} h={54} title={`MPPT ${node.mppt}`} sub={panelLabel(node.panelProduct)} tone="dc" />
            <Wire x1={205} y1={node.y + 31} x2={245} y2={node.y + 31} color="#facc15" />
            <Wire x1={337} y1={node.y + 31} x2={375} y2={node.y + 31} color="#facc15" />
            <Wire x1={467} y1={node.y + 31} x2={560} y2={invY + 36} color="#facc15" />
          </React.Fragment>
        ))}

        <Node x={560} y={invY} w={155} h={72} title={inverter.name} sub={productLabel(inverter.product)} tone="inv" />
        <Node x={785} y={acY + 6} w={105} h={58} title="AC" sub="bryt/säkr" tone="ac" />
        <Node x={935} y={acY + 6} w={105} h={58} title="Mätare" sub="produktion" tone="ac" />
        <Node x={1080} y={acY + 6} w={80} h={58} title="Nät" sub="400V" tone="ac" />
        <Wire x1={715} y1={invY + 36} x2={785} y2={acY + 35} color="#60a5fa" />
        <Wire x1={890} y1={acY + 35} x2={935} y2={acY + 35} color="#60a5fa" />
        <Wire x1={1040} y1={acY + 35} x2={1080} y2={acY + 35} color="#60a5fa" />
      </svg>
    </div>
  );
}

export default function AutoSingleLineSchemaView({ project, onUpdate, products = [] }) {
  const svgWrapRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const model = useMemo(() => normalizeSingleLine(project, products), [project?.string_layout_data, products]);
  const hasStrings = model.totals.stringCount > 0;

  const saveAutoSchema = async () => {
    setSaving(true);
    try {
      let existing = {};
      try { existing = JSON.parse(project?.string_layout_data || '{}'); } catch {}
      const autoSchema = {
        generatedAt: new Date().toISOString(),
        sourceSavedAt: model.savedAt || null,
        totals: model.totals,
        inverters: model.inverters.map(inv => ({
          id: inv.id,
          name: inv.name,
          product: productLabel(inv.product),
          panelCount: inv.panelCount,
          stringCount: inv.stringCount,
          dcKwp: inv.dcKwp,
          acKw: inv.acKw,
          mppts: inv.mppts.map(mppt => ({
            mppt: mppt.mppt,
            panelCount: mppt.panelCount,
            dcKwp: mppt.kwp,
            strings: mppt.strings.map(str => ({
              name: str.name,
              pvInput: str.pvInput,
              panelCount: str.panelCount,
              panelProduct: panelLabel(str.panelProduct),
              kwp: str.kwp,
            })),
          })),
        })),
      };
      await onUpdate?.({ string_layout_data: JSON.stringify({ ...existing, singleLineAuto: autoSchema }) });
    } finally {
      setSaving(false);
    }
  };

  const exportSvg = () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `enlinjeschema-${project?.name || 'projekt'}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" />Automatiskt enlinjeschema</CardTitle>
              <p className="text-sm text-muted-foreground">Hämtas direkt från sparade slingor: växelriktare, MPPT, PV-ingångar, strängar och panelantal.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={saveAutoSchema} disabled={!hasStrings || saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Sparar...' : 'Spara enlinjeschema'}</Button>
              <Button variant="outline" size="sm" onClick={exportSvg} disabled={!hasStrings}><Download className="mr-2 h-4 w-4" />Exportera SVG</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Växelriktare</div><div className="text-xl font-bold">{model.totals.inverterCount}</div></div>
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Strängar</div><div className="text-xl font-bold">{model.totals.stringCount}</div></div>
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-xl font-bold">{model.totals.panelCount}</div></div>
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">DC-effekt</div><div className="text-xl font-bold">{round(model.totals.dcKwp, 2)} kWp</div></div>
          </div>
          {!hasStrings && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Inga sparade slingor hittades. Gå till fliken Slingor, välj panelgrupper/PV-ingångar och spara. Därefter byggs enlinjeschemat automatiskt här.
            </div>
          )}
          {model.savedAt && <Badge variant="outline"><RefreshCw className="mr-1 h-3 w-3" />Slingdata sparad {new Date(model.savedAt).toLocaleString('sv-SE')}</Badge>}
        </CardContent>
      </Card>

      <div ref={svgWrapRef} className="space-y-4">
        {model.inverters.filter(inv => inv.stringCount > 0).map(inverter => (
          <Card key={inverter.id} className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />{inverter.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{productLabel(inverter.product)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{inverter.stringCount} strängar</Badge>
                  <Badge variant="outline">{inverter.panelCount} paneler</Badge>
                  <Badge className="bg-primary/10 text-primary border-primary/20">{round(inverter.dcKwp, 2)} kWp DC</Badge>
                  {inverter.acKw > 0 && <Badge variant="outline">{round(inverter.acKw, 1)} kW AC</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <InverterDiagram inverter={inverter} />
              <div className="grid gap-3 lg:grid-cols-3">
                {inverter.mppts.map(mppt => (
                  <div key={mppt.mppt} className="rounded-xl border p-3">
                    <div className="font-bold">MPPT {mppt.mppt}</div>
                    <div className="text-sm text-muted-foreground">{mppt.strings.length} strängar · {mppt.panelCount} paneler · {round(mppt.kwp, 2)} kWp</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {mppt.strings.map(str => <div key={str.id}>{str.name}{str.pvInput ? ` · PV${str.pvInput}` : ''} · {str.panelCount} paneler · {panelLabel(str.panelProduct)}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
