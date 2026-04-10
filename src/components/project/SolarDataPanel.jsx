import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sun, Zap, TrendingUp, CloudSun, Loader2, RefreshCw, AlertCircle,
  Upload, Battery, BarChart3, FileSpreadsheet, X, Info
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const MONTHS_SV = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

// ─── Energy balance calculator ─────────────────────────────────────────────
function calcEnergyBalance(pvMonthly, consumptionMonthly, batteryKwh) {
  // pvMonthly & consumptionMonthly: arrays of 12 kWh values
  return MONTHS_SV.map((month, i) => {
    const solar = pvMonthly[i] || 0;
    const consumption = consumptionMonthly[i] || 0;
    const battCap = batteryKwh || 0;

    // Direct self-consumption (solar used directly)
    const directSelf = Math.min(solar, consumption);
    let remaining_solar = solar - directSelf;
    let remaining_need = consumption - directSelf;

    // Battery: charge from surplus, discharge to cover remaining need
    const battCharge = Math.min(remaining_solar, battCap);
    remaining_solar -= battCharge;
    const battDischarge = Math.min(battCharge, remaining_need);
    remaining_need -= battDischarge;

    const selfConsumption = directSelf + battDischarge;
    const export_ = remaining_solar;
    const grid = remaining_need;

    return {
      month,
      'Egenförbrukning': Math.round(selfConsumption),
      'Export till nät': Math.round(export_),
      'Köpt från nät': Math.round(grid),
      'Solproduktion': Math.round(solar),
    };
  });
}

// ─── Custom tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, unit = 'kWh' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value?.toLocaleString('sv-SE')} {unit}</strong>
        </p>
      ))}
    </div>
  );
}

export default function SolarDataPanel({ project }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pvgisData, setPvgisData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [location, setLocation] = useState(null);

  // Consumption upload
  const [consumptionMonthly, setConsumptionMonthly] = useState(null); // array of 12
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const fileRef = useRef(null);

  // Battery
  const [useBattery, setUseBattery] = useState(false);
  const [batteryKwh, setBatteryKwh] = useState('');

  // Parse panel layout
  const { panels, panelBrand } = (() => {
    try {
      const d = JSON.parse(project.panel_layout_data || '{}');
      const panelList = Array.isArray(d) ? d : (d.panels || []);
      return { panels: panelList, panelBrand: panelList[0]?.product_name || null };
    } catch { return { panels: [], panelBrand: null }; }
  })();

  const panelCount = panels.length;
  const totalWatts = panels.reduce((s, p) => s + (p.power_watts || 400), 0);
  const estimatedKwp = totalWatts > 0 ? totalWatts / 1000 : 5;

  const fetchData = async () => {
    if (!project.address) { setError('Projektet saknar adress.'); return; }
    setLoading(true); setError(null); setPvgisData(null); setForecastData(null);
    try {
      const res = await base44.functions.invoke('solarData', { address: project.address, peakPower: estimatedKwp });
      const data = res.data;
      setLocation({ lat: data.lat, lon: data.lon });
      if (data.pvgis) setPvgisData(data.pvgis);
      if (data.forecast) setForecastData(data.forecast);
      if (!data.pvgis && !data.forecast) setError('Kunde inte hämta soldata: ' + (data.pvgisError || data.forecastError || 'okänt fel'));
    } catch (e) { setError(e.message || 'Något gick fel'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (project.address && panelCount > 0) fetchData(); }, []);

  const pvgisMonthly = pvgisData?.outputs?.monthly?.fixed?.map(m => m.E_m) || null;
  const pvgisYearly = pvgisData?.outputs?.totals?.fixed?.E_y || null;
  const forecastMonthly = forecastData?.result
    ? Object.values(forecastData.result).map(v => Math.round(v / 1000))
    : null;

  // Chart data for production chart
  const productionChartData = MONTHS_SV.map((month, i) => ({
    month,
    ...(pvgisMonthly ? { 'PVGIS (kWh)': Math.round(pvgisMonthly[i] || 0) } : {}),
    ...(forecastMonthly ? { 'Forecast.solar (kWh)': Math.round(forecastMonthly[i] || 0) } : {}),
  }));

  // Energy balance data
  const primaryMonthly = pvgisMonthly || forecastMonthly;
  const balanceData = primaryMonthly && consumptionMonthly
    ? calcEnergyBalance(primaryMonthly, consumptionMonthly, useBattery ? parseFloat(batteryKwh) || 0 : 0)
    : null;

  // ── File upload handler ─────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true); setUploadError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            monthly_kwh: {
              type: 'array',
              description: 'Monthly energy consumption in kWh. Array of 12 numbers, January first. If the file has hourly or daily data, sum them into monthly totals.',
              items: { type: 'number' }
            }
          }
        }
      });
      if (result.status !== 'success') throw new Error(result.details || 'Kunde inte tolka filen');
      let monthly = result.output?.monthly_kwh;
      if (!Array.isArray(monthly) || monthly.length < 12) throw new Error('Filen måste innehålla 12 månaders data (eller timdata som kan summeras per månad).');
      monthly = monthly.slice(0, 12).map(v => parseFloat(v) || 0);
      setConsumptionMonthly(monthly);
      setUploadedFileName(file.name);
    } catch (err) {
      setUploadError(err.message || 'Uppladdning misslyckades');
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const yearlyConsumption = consumptionMonthly ? consumptionMonthly.reduce((a, b) => a + b, 0) : null;

  return (
    <div className="space-y-4">

      {/* Header */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sun className="w-5 h-5 text-primary" /> Solenergianalys
            </CardTitle>
            {project.address && <p className="text-sm text-muted-foreground mt-1">{project.address}</p>}
            {panelCount > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="outline">{panelCount} paneler</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20">{estimatedKwp.toFixed(2)} kWp</Badge>
                {panelBrand && <Badge variant="outline">{panelBrand}</Badge>}
              </div>
            )}
          </div>
          <Button onClick={fetchData} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Hämtar...' : pvgisData || forecastData ? 'Uppdatera' : 'Hämta soldata'}
          </Button>
        </CardHeader>
        {error && (
          <CardContent>
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          </CardContent>
        )}
        {location && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {location.lat.toFixed(4)}°N, {location.lon.toFixed(4)}°E · {estimatedKwp} kWp{panelBrand ? ` · ${panelBrand}` : ''}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Summary KPI cards */}
      {(pvgisData || forecastData) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {pvgisYearly && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Årsproduktion (PVGIS)</p>
                    <p className="text-2xl font-bold">{Math.round(pvgisYearly).toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">kWh/år</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {forecastMonthly && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                    <CloudSun className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Årsproduktion (Forecast)</p>
                    <p className="text-2xl font-bold">{forecastMonthly.reduce((a, b) => a + b, 0).toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">kWh/år</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {pvgisYearly && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Specifik produktion</p>
                    <p className="text-2xl font-bold">{Math.round(pvgisYearly / estimatedKwp).toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">kWh/kWp/år</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Production chart */}
      {(pvgisMonthly || forecastMonthly) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Månadsproduktion
            </CardTitle>
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              {pvgisMonthly && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> PVGIS</span>}
              {forecastMonthly && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Forecast.solar</span>}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productionChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                  label={{ value: 'kWh', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {pvgisMonthly && <Bar dataKey="PVGIS (kWh)" fill="#fbbf24" radius={[3, 3, 0, 0]} />}
                {forecastMonthly && <Bar dataKey="Forecast.solar (kWh)" fill="#60a5fa" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Consumption upload + battery settings */}
      {(pvgisMonthly || forecastMonthly) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" /> Förbrukningsdata &amp; energibalans
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Ladda upp ett Excel- eller CSV-dokument med timdata eller månadsförbrukning (kWh) för att se hur solelen utnyttjas.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload area */}
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" ref={fileRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
              <Button
                size="sm" variant="outline" className="gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploadLoading}
              >
                {uploadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadLoading ? 'Analyserar...' : 'Ladda upp förbrukningsfil'}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-green-800 font-medium">{uploadedFileName}</span>
                  {yearlyConsumption != null && (
                    <span className="text-green-600 text-xs">· {Math.round(yearlyConsumption).toLocaleString('sv-SE')} kWh/år</span>
                  )}
                  <button onClick={() => { setConsumptionMonthly(null); setUploadedFileName(null); }} className="text-green-400 hover:text-red-500 ml-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {uploadError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}
                </div>
              )}
            </div>

            {/* Battery toggle */}
            <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setUseBattery(v => !v)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${useBattery ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useBattery ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <Battery className={`w-4 h-4 ${useBattery ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium">Batterilager</span>
              </label>
              {useBattery && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="1" step="0.5"
                    value={batteryKwh}
                    onChange={e => setBatteryKwh(e.target.value)}
                    placeholder="t.ex. 10"
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">kWh kapacitet</span>
                </div>
              )}
            </div>

            {consumptionMonthly && !primaryMonthly && (
              <p className="text-xs text-muted-foreground">Hämta soldata ovan för att se energibalansen.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Energy balance chart */}
      {balanceData && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Energibalans
              {useBattery && batteryKwh && (
                <Badge variant="outline" className="text-xs gap-1 ml-1">
                  <Battery className="w-3 h-3" /> {batteryKwh} kWh batteri
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Baserat på {pvgisMonthly ? 'PVGIS-data' : 'Forecast.solar-data'} och uppladdad förbrukningsprofil
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={balanceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                  label={{ value: 'kWh', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Egenförbrukning" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                {useBattery && <Bar dataKey="Batteri (bidrag)" stackId="a" fill="#8b5cf6" />}
                <Bar dataKey="Export till nät" stackId="a" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Köpt från nät" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Egenförbrukning', value: balanceData.reduce((s, d) => s + d['Egenförbrukning'], 0), color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Export till nät', value: balanceData.reduce((s, d) => s + d['Export till nät'], 0), color: 'text-orange-600', bg: 'bg-orange-50' },
                { label: 'Köpt från nät', value: balanceData.reduce((s, d) => s + d['Köpt från nät'], 0), color: 'text-slate-600', bg: 'bg-slate-50' },
                { label: 'Självförsörjning', value: null, pct: Math.round(balanceData.reduce((s, d) => s + d['Egenförbrukning'], 0) / (yearlyConsumption || 1) * 100), color: 'text-primary', bg: 'bg-primary/5' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl p-3 ${item.bg}`}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>
                    {item.pct != null ? `${item.pct}%` : `${Math.round(item.value).toLocaleString('sv-SE')}`}
                  </p>
                  {item.pct == null && <p className="text-xs text-muted-foreground">kWh/år</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!pvgisData && !forecastData && !loading && !error && (
        <Card className="border-0 shadow-sm border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sun className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">Ingen soldata hämtad ännu</p>
            <p className="text-sm">
              {panelCount === 0
                ? 'Placera solpaneler i fliken "Paneler" för att beräkna energiproduktion automatiskt.'
                : 'Klicka på "Hämta soldata" för att se beräknad årsproduktion.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}