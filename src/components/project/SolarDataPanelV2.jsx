import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle, BarChart3, Battery, CloudSun, FileSpreadsheet, Info,
  Loader2, RefreshCw, Save, Sun, TrendingUp, Upload, X, Zap
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const MONTHS_SV = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const DEFAULT_PANEL_WATTS = 400;

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatKwh(value) {
  return Math.round(numeric(value)).toLocaleString('sv-SE');
}

function errorText(error) {
  const status = error?.response?.status || error?.status || error?.statusCode;
  const msg = error?.message || String(error || 'Okänt fel');
  return status ? `Request failed with status code ${status}` : msg;
}

function calcEnergyBalance(pvMonthly, consumptionMonthly, batteryKwh) {
  return MONTHS_SV.map((month, i) => {
    const solar = pvMonthly[i] || 0;
    const consumption = consumptionMonthly[i] || 0;
    const battCap = batteryKwh || 0;
    const directSelf = Math.min(solar, consumption);
    let remainingSolar = solar - directSelf;
    let remainingNeed = consumption - directSelf;
    const battCharge = Math.min(remainingSolar, battCap);
    remainingSolar -= battCharge;
    const battDischarge = Math.min(battCharge, remainingNeed);
    remainingNeed -= battDischarge;
    return {
      month,
      Egenförbrukning: Math.round(directSelf + battDischarge),
      'Export till nät': Math.round(remainingSolar),
      'Köpt från nät': Math.round(remainingNeed),
      Solproduktion: Math.round(solar),
    };
  });
}

function CustomTooltip({ active, payload, label, unit = 'kWh' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(item => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: <strong>{item.value?.toLocaleString('sv-SE')} {unit}</strong>
        </p>
      ))}
    </div>
  );
}

function getPlannerPanels(project) {
  const products = [];
  const planner = safeJson(project?.solar_roof_planner_data, null);
  if (Array.isArray(planner?.roofs)) {
    planner.roofs.forEach((roof, roofIndex) => {
      const roofPanel = roof.panelProductSnapshot || null;
      (roof.panelGroups || []).forEach((group, groupIndex) => {
        const rows = Math.max(0, Math.round(numeric(group.rows, 0)));
        const cols = Math.max(0, Math.round(numeric(group.cols, 0)));
        const count = rows * cols;
        const panel = group.panelProductSnapshot || roofPanel;
        const watts = numeric(panel?.power_watts, DEFAULT_PANEL_WATTS);
        if (count > 0) {
          products.push({
            source: `${roof.name || `Tak ${roofIndex + 1}`} / ${group.name || `Panelgrupp ${groupIndex + 1}`}`,
            count,
            watts,
            productName: [panel?.brand, panel?.model].filter(Boolean).join(' ') || panel?.name || null,
          });
        }
      });
    });
  }
  return products;
}

function getLegacyPanels(project) {
  const layout = safeJson(project?.panel_layout_data, null);
  const panelList = Array.isArray(layout) ? layout : Array.isArray(layout?.panels) ? layout.panels : [];
  if (!panelList.length) return [];
  return [{
    source: 'Panelritning',
    count: panelList.length,
    watts: panelList.reduce((sum, panel) => sum + numeric(panel.power_watts, DEFAULT_PANEL_WATTS), 0) / panelList.length,
    productName: panelList[0]?.product_name || null,
  }];
}

function getSystemSize(project) {
  const groups = getPlannerPanels(project);
  const sourceGroups = groups.length ? groups : getLegacyPanels(project);
  const panelCount = sourceGroups.reduce((sum, group) => sum + group.count, 0);
  const watts = sourceGroups.reduce((sum, group) => sum + group.count * numeric(group.watts, DEFAULT_PANEL_WATTS), 0);
  const kwp = watts > 0 ? watts / 1000 : numeric(project?.system_kwp, 5);
  const panelNames = [...new Set(sourceGroups.map(group => group.productName).filter(Boolean))];
  return { panelCount, kwp, panelNames, sourceGroups };
}

function buildProjectSearchAddress(project) {
  return [project?.address, project?.postal_code, project?.city, 'Sverige'].filter(Boolean).join(', ');
}

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Geokodning misslyckades (${response.status})`);
  const rows = await response.json();
  const row = rows?.[0];
  if (!row) throw new Error('Kunde inte hitta koordinater för adressen. Kontrollera adress/postnummer/ort.');
  return { lat: Number(row.lat), lon: Number(row.lon), displayName: row.display_name };
}

async function fetchPvgis(lat, lon, peakPower, tilt = 35, azimuth = 0) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    peakpower: String(Math.max(0.1, peakPower || 1)),
    loss: '14',
    angle: String(tilt || 35),
    aspect: String(azimuth || 0),
    outputformat: 'json',
  });
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?${params.toString()}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`PVGIS svarade ${response.status}`);
  return response.json();
}

async function fetchSolarDataFallback(project, peakPower) {
  const address = buildProjectSearchAddress(project);
  const loc = await geocodeAddress(address);
  const pvgis = await fetchPvgis(loc.lat, loc.lon, peakPower);
  return {
    lat: loc.lat,
    lon: loc.lon,
    geocodeDisplayName: loc.displayName,
    pvgis,
    forecast: null,
    source: 'Direkt PVGIS-fallback',
  };
}

export default function SolarDataPanelV2({ project, onUpdate }) {
  const storedSolarData = useMemo(() => safeJson(project?.solar_data, null), [project?.solar_data]);
  const systemSize = useMemo(() => getSystemSize(project), [project?.solar_roof_planner_data, project?.panel_layout_data, project?.system_kwp]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [pvgisData, setPvgisData] = useState(storedSolarData?.pvgis || null);
  const [forecastData, setForecastData] = useState(storedSolarData?.forecast || null);
  const [location, setLocation] = useState(storedSolarData?.location || null);
  const [consumptionMonthly, setConsumptionMonthly] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [useBattery, setUseBattery] = useState(false);
  const [batteryKwh, setBatteryKwh] = useState('');
  const fileRef = useRef(null);

  const estimatedKwp = systemSize.kwp || 5;
  const panelCount = systemSize.panelCount;
  const panelBrand = systemSize.panelNames.join(', ');

  const persistSolarData = async (payload) => {
    await onUpdate?.({ solar_data: JSON.stringify(payload) });
  };

  const fetchData = async () => {
    if (!project?.address) {
      setError('Projektet saknar adress. Öppna Projektuppgifter och fyll i adressen först.');
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    let data = null;
    let functionError = null;

    try {
      const result = await base44.functions.invoke('solarData', {
        address: buildProjectSearchAddress(project),
        peakPower: estimatedKwp,
      });
      data = result?.data;
    } catch (error) {
      functionError = error;
    }

    if (!data?.pvgis && !data?.forecast) {
      try {
        data = await fetchSolarDataFallback(project, estimatedKwp);
        if (functionError) {
          setWarning(`Base44-funktionen solarData svarade inte (${errorText(functionError)}). Appen hämtade därför PVGIS direkt i webbläsaren.`);
        }
      } catch (fallbackError) {
        const mainError = functionError ? `${errorText(functionError)}. Fallback misslyckades: ${fallbackError.message}` : fallbackError.message;
        setError(`Kunde inte hämta soldata. ${mainError}`);
        setLoading(false);
        return;
      }
    }

    const loc = { lat: Number(data.lat), lon: Number(data.lon), displayName: data.geocodeDisplayName || data.displayName || null };
    setLocation(loc);
    setPvgisData(data.pvgis || null);
    setForecastData(data.forecast || null);

    if (!data.pvgis && !data.forecast) {
      setError('Kunde inte hämta soldata: ' + (data.pvgisError || data.forecastError || 'okänt fel'));
    } else {
      await persistSolarData({
        pvgis: data.pvgis || null,
        forecast: data.forecast || null,
        location: loc,
        peakPower: estimatedKwp,
        source: data.source || 'solarData',
        fetchedAt: new Date().toISOString(),
      }).catch(() => setWarning('Soldata hämtades men kunde inte sparas på projektet.'));
    }

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setWarning(null);
    try {
      await persistSolarData({ pvgis: pvgisData, forecast: forecastData, location, peakPower: estimatedKwp, source: 'manual-save', fetchedAt: new Date().toISOString() });
    } catch (error) {
      setWarning(error.message || 'Kunde inte spara soldata.');
    } finally {
      setSaving(false);
    }
  };

  const pvgisMonthly = pvgisData?.outputs?.monthly?.fixed?.map(month => month.E_m) || null;
  const pvgisYearly = pvgisData?.outputs?.totals?.fixed?.E_y || null;
  const forecastMonthly = forecastData?.result ? Object.values(forecastData.result).map(value => Math.round(value / 1000)) : null;
  const productionChartData = MONTHS_SV.map((month, index) => ({
    month,
    ...(pvgisMonthly ? { 'PVGIS (kWh)': Math.round(pvgisMonthly[index] || 0) } : {}),
    ...(forecastMonthly ? { 'Forecast.solar (kWh)': Math.round(forecastMonthly[index] || 0) } : {}),
  }));
  const primaryMonthly = pvgisMonthly || forecastMonthly;
  const balanceData = primaryMonthly && consumptionMonthly ? calcEnergyBalance(primaryMonthly, consumptionMonthly, useBattery ? parseFloat(batteryKwh) || 0 : 0) : null;

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setUploadError(null);
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
              items: { type: 'number' },
            },
          },
        },
      });
      if (result.status !== 'success') throw new Error(result.details || 'Kunde inte tolka filen');
      let monthly = result.output?.monthly_kwh;
      if (!Array.isArray(monthly) || monthly.length < 12) throw new Error('Filen måste innehålla 12 månaders data eller timdata som kan summeras per månad.');
      monthly = monthly.slice(0, 12).map(value => parseFloat(value) || 0);
      setConsumptionMonthly(monthly);
      setUploadedFileName(file.name);
    } catch (error) {
      setUploadError(error.message || 'Uppladdning misslyckades');
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const yearlyConsumption = consumptionMonthly ? consumptionMonthly.reduce((a, b) => a + b, 0) : null;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><Sun className="w-5 h-5 text-primary" /> Solenergianalys</CardTitle>
            {project.address && <p className="text-sm text-muted-foreground mt-1">{project.address}</p>}
            <div className="flex gap-2 mt-2 flex-wrap">
              {panelCount > 0 && <Badge variant="outline">{panelCount} paneler</Badge>}
              <Badge className="bg-primary/10 text-primary border-primary/20">{estimatedKwp.toFixed(2)} kWp</Badge>
              {panelBrand && <Badge variant="outline">{panelBrand}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={fetchData} disabled={loading} size="sm" variant="outline" className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Hämtar...' : pvgisData || forecastData ? 'Uppdatera' : 'Hämta soldata'}
            </Button>
            <Button onClick={handleSave} disabled={saving || (!pvgisData && !forecastData)} size="sm" className="gap-2">
              <Save className="w-4 h-4" />{saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </CardHeader>
        {(error || warning) && (
          <CardContent className="space-y-2">
            {warning && <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{warning}</div>}
            {error && <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
          </CardContent>
        )}
        {location && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">{location.lat.toFixed(4)}°N, {location.lon.toFixed(4)}°E · {estimatedKwp.toFixed(2)} kWp{panelBrand ? ` · ${panelBrand}` : ''}</p>
          </CardContent>
        )}
      </Card>

      {(pvgisData || forecastData) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {pvgisYearly && <Card className="border-0 shadow-sm"><CardContent className="pt-5"><div className="flex items-start gap-3"><div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Zap className="w-5 h-5 text-amber-600" /></div><div><p className="text-xs text-muted-foreground">Årsproduktion (PVGIS)</p><p className="text-2xl font-bold">{formatKwh(pvgisYearly)}</p><p className="text-xs text-muted-foreground">kWh/år</p></div></div></CardContent></Card>}
          {forecastMonthly && <Card className="border-0 shadow-sm"><CardContent className="pt-5"><div className="flex items-start gap-3"><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0"><CloudSun className="w-5 h-5 text-blue-600" /></div><div><p className="text-xs text-muted-foreground">Årsproduktion (Forecast)</p><p className="text-2xl font-bold">{forecastMonthly.reduce((a, b) => a + b, 0).toLocaleString('sv-SE')}</p><p className="text-xs text-muted-foreground">kWh/år</p></div></div></CardContent></Card>}
          {pvgisYearly && <Card className="border-0 shadow-sm"><CardContent className="pt-5"><div className="flex items-start gap-3"><div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-green-600" /></div><div><p className="text-xs text-muted-foreground">Specifik produktion</p><p className="text-2xl font-bold">{Math.round(pvgisYearly / estimatedKwp).toLocaleString('sv-SE')}</p><p className="text-xs text-muted-foreground">kWh/kWp/år</p></div></div></CardContent></Card>}
        </div>
      )}

      {(pvgisMonthly || forecastMonthly) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Månadsproduktion</CardTitle>
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
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={value => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value} label={{ value: 'kWh', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {pvgisMonthly && <Bar dataKey="PVGIS (kWh)" fill="#fbbf24" radius={[3, 3, 0, 0]} />}
                {forecastMonthly && <Bar dataKey="Forecast.solar (kWh)" fill="#60a5fa" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(pvgisMonthly || forecastMonthly) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-primary" /> Förbrukningsdata &amp; energibalans</CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Ladda upp Excel eller CSV med timdata eller månadsförbrukning i kWh.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" ref={fileRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
              <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploadLoading}>{uploadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{uploadLoading ? 'Analyserar...' : 'Ladda upp förbrukningsfil'}</Button>
              {uploadedFileName && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm"><FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" /><span className="text-green-800 font-medium">{uploadedFileName}</span>{yearlyConsumption != null && <span className="text-green-600 text-xs">· {formatKwh(yearlyConsumption)} kWh/år</span>}<button onClick={() => { setConsumptionMonthly(null); setUploadedFileName(null); }} className="text-green-400 hover:text-red-500 ml-1"><X className="w-3.5 h-3.5" /></button></div>}
              {uploadError && <div className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{uploadError}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div onClick={() => setUseBattery(value => !value)} className={`w-10 h-6 rounded-full transition-colors relative ${useBattery ? 'bg-primary' : 'bg-muted'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useBattery ? 'translate-x-5' : 'translate-x-1'}`} /></div>
                <Battery className={`w-4 h-4 ${useBattery ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium">Batterilager</span>
              </label>
              {useBattery && <div className="flex items-center gap-2"><input type="number" min="1" step="0.5" value={batteryKwh} onChange={event => setBatteryKwh(event.target.value)} placeholder="t.ex. 10" className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" /><span className="text-sm text-muted-foreground">kWh kapacitet</span></div>}
            </div>
          </CardContent>
        </Card>
      )}

      {balanceData && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Energibalans{useBattery && batteryKwh && <Badge variant="outline" className="text-xs gap-1 ml-1"><Battery className="w-3 h-3" />{batteryKwh} kWh batteri</Badge>}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={balanceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={value => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value} label={{ value: 'kWh', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Egenförbrukning" stackId="a" fill="#22c55e" />
                <Bar dataKey="Export till nät" stackId="a" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Köpt från nät" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {!pvgisData && !forecastData && !loading && !error && (
        <Card className="border-0 shadow-sm border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sun className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">Ingen soldata hämtad ännu</p>
            <p className="text-sm">{panelCount === 0 ? 'Placera solpaneler i fliken Paneler för att beräkna energiproduktion.' : 'Klicka på Hämta soldata för att se beräknad årsproduktion.'}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
