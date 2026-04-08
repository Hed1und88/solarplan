import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sun, Zap, TrendingUp, CloudSun, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

const MONTHS_SV = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'sv' } });
  const data = await res.json();
  if (!data.length) throw new Error('Adressen hittades inte');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
}

async function fetchPVGIS(lat, lon, peakPower) {
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=${peakPower}&loss=14&outputformat=json&browser=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('PVGIS svarade inte');
  return await res.json();
}

async function fetchForecastSolar(lat, lon, peakPower) {
  const url = `https://api.forecast.solar/estimate/${lat.toFixed(4)}/${lon.toFixed(4)}/45/0/${peakPower}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('forecast.solar svarade inte');
  return await res.json();
}

export default function SolarDataPanel({ project }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pvgisData, setPvgisData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [location, setLocation] = useState(null);

  // Try to estimate peak power from project panel data
  const panels = (() => { try { return JSON.parse(project.panel_layout_data || '[]'); } catch { return []; } })();
  const panelCount = panels.length;
  // Use a default of 0.4 kWp per panel if no product power known
  const estimatedKwp = panelCount > 0 ? (panelCount * 0.4) : 5;

  const fetchData = async () => {
    if (!project.address) {
      setError('Projektet saknar adress. Fyll i adressen i projektinformationen.');
      return;
    }
    setLoading(true);
    setError(null);
    setPvgisData(null);
    setForecastData(null);

    try {
      const coords = await geocodeAddress(project.address);
      setLocation(coords);

      const [pvgis, forecast] = await Promise.allSettled([
        fetchPVGIS(coords.lat, coords.lon, estimatedKwp),
        fetchForecastSolar(coords.lat, coords.lon, estimatedKwp),
      ]);

      if (pvgis.status === 'fulfilled') setPvgisData(pvgis.value);
      if (forecast.status === 'fulfilled') setForecastData(forecast.value);

      if (pvgis.status === 'rejected' && forecast.status === 'rejected') {
        setError('Kunde inte hämta soldata. Kontrollera nätverket eller prova igen.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse PVGIS monthly data
  const pvgisMonthly = pvgisData?.outputs?.monthly?.fixed?.map(m => m.E_m) || null;
  const pvgisYearly = pvgisData?.outputs?.totals?.fixed?.E_y || null;
  const pvgisIrr = pvgisData?.outputs?.totals?.fixed?.H_i_m || null;

  // Parse forecast.solar monthly data (watt-hours -> kWh)
  const forecastMonthly = forecastData?.result
    ? Object.values(forecastData.result).map(v => Math.round(v / 1000))
    : null;

  const maxVal = Math.max(
    ...(pvgisMonthly || [0]),
    ...(forecastMonthly || [0]),
  ) || 1;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sun className="w-5 h-5 text-primary" /> Solenergianalys
            </CardTitle>
            {project.address && (
              <p className="text-sm text-muted-foreground mt-1">{project.address}</p>
            )}
          </div>
          <Button onClick={fetchData} disabled={loading} className="gap-2" size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Hämtar...' : pvgisData || forecastData ? 'Uppdatera' : 'Hämta soldata'}
          </Button>
        </CardHeader>
        {(error) && (
          <CardContent>
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          </CardContent>
        )}
        {location && (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Koordinater: {location.lat.toFixed(4)}°N, {location.lon.toFixed(4)}°E — Systemstorlek: {estimatedKwp} kWp ({panelCount > 0 ? `${panelCount} paneler` : 'uppskattad'})
            </p>
          </CardContent>
        )}
      </Card>

      {/* Summary cards */}
      {(pvgisData || forecastData) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {pvgisYearly && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Årsproduktion (PVGIS)</p>
                    <p className="text-2xl font-bold text-foreground">{Math.round(pvgisYearly).toLocaleString('sv-SE')}</p>
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
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <CloudSun className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Årsproduktion (Forecast)</p>
                    <p className="text-2xl font-bold text-foreground">{forecastMonthly.reduce((a, b) => a + b, 0).toLocaleString('sv-SE')}</p>
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
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Specifik produktion</p>
                    <p className="text-2xl font-bold text-foreground">{Math.round(pvgisYearly / estimatedKwp).toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">kWh/kWp/år</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Monthly chart */}
      {(pvgisMonthly || forecastMonthly) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Månadsproduktion (kWh)</CardTitle>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {pvgisMonthly && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> PVGIS</span>}
              {forecastMonthly && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Forecast.solar</span>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-40">
              {MONTHS_SV.map((month, i) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex items-end gap-0.5 h-32">
                    {pvgisMonthly?.[i] != null && (
                      <div
                        className="flex-1 bg-amber-400 rounded-t-sm min-h-[2px] transition-all"
                        style={{ height: `${(pvgisMonthly[i] / maxVal) * 100}%` }}
                        title={`PVGIS: ${pvgisMonthly[i]} kWh`}
                      />
                    )}
                    {forecastMonthly?.[i] != null && (
                      <div
                        className="flex-1 bg-blue-400 rounded-t-sm min-h-[2px] transition-all"
                        style={{ height: `${(forecastMonthly[i] / maxVal) * 100}%` }}
                        title={`Forecast: ${forecastMonthly[i]} kWh`}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{month}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!pvgisData && !forecastData && !loading && !error && (
        <Card className="border-0 shadow-sm border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sun className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">Ingen soldata hämtad ännu</p>
            <p className="text-sm">Klicka på "Hämta soldata" för att se beräknad årsproduktion baserat på projektets adress.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}