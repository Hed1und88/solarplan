// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MapPin, Satellite, Sun, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import SolarPlan3DProjektering from '@/components/project/SolarPlan3DProjektering';
import { solarProject3DStorage } from '@/lib/solarplan3d/storage';
import { createDefaultLocationData, fetchLiveSiteData, getSiteDataAdapterStatuses } from '@/lib/solarplan3d/dataSourceAdapters';

const formatValue = (value, suffix = '') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Ej hämtad';
  return `${Math.round(number * 100) / 100}${suffix}`;
};

const statusClass = (status) => {
  if (status === 'connected') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'error') return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export default function SolarPlan3DLiveSiteDataShell() {
  const [project, setProject] = useState(null);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationData, setLocationData] = useState(() => createDefaultLocationData());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Platsdata är inte hämtad ännu.');

  useEffect(() => {
    let mounted = true;
    solarProject3DStorage.loadLatest().then((loaded) => {
      if (!mounted) return;
      const data = createDefaultLocationData(loaded.locationData || {});
      setProject(loaded);
      setAddress(loaded.address || '');
      setLatitude(data.latitude ?? '');
      setLongitude(data.longitude ?? '');
      setLocationData(data);
      setMessage(data.message || 'Platsdata är inte hämtad ännu.');
    });
    return () => { mounted = false; };
  }, []);

  const statuses = useMemo(() => getSiteDataAdapterStatuses(locationData), [locationData]);

  const fetchSiteData = async () => {
    setLoading(true);
    setMessage('Hämtar platsdata...');
    try {
      const latest = await solarProject3DStorage.loadLatest();
      const sourceProject = project || latest;
      const nextLocationData = await fetchLiveSiteData({
        address: address || sourceProject.address,
        latitude,
        longitude,
        installedKwp: sourceProject.productionEstimate?.installedKwp || 1,
        roofPitchDeg: sourceProject.building?.roofPitchDeg || 30,
        azimuthDeg: sourceProject.building?.azimuthDeg || 180,
        previous: sourceProject.locationData || locationData,
      });

      const nextProject = {
        ...sourceProject,
        address: address || sourceProject.address,
        locationData: nextLocationData,
        productionEstimate: {
          ...(sourceProject.productionEstimate || {}),
          specificYieldKwhPerKwpYear: nextLocationData.pvgis?.annualKwhPerKwp || sourceProject.productionEstimate?.specificYieldKwhPerKwpYear || 900,
          pvgisSpecificYieldKwhPerKwpYear: nextLocationData.pvgis?.annualKwhPerKwp || null,
          pvgisMonthlyKwhPerKwp: nextLocationData.pvgis?.monthlyKwhPerKwp || [],
        },
        weatherScenario: {
          ...(sourceProject.weatherScenario || {}),
          ambientTempC: nextLocationData.smhi?.temperatureC ?? sourceProject.weatherScenario?.ambientTempC ?? 20,
        },
      };

      const saved = await solarProject3DStorage.save(nextProject);
      setProject(saved);
      setLocationData(nextLocationData);
      setLatitude(nextLocationData.latitude ?? '');
      setLongitude(nextLocationData.longitude ?? '');
      setMessage(nextLocationData.message || 'Platsdata uppdaterad.');
    } catch (error) {
      const errorMessage = `Platsdata kunde inte hämtas automatiskt: ${error?.message || error}`;
      setMessage(errorMessage);
      setLocationData((current) => createDefaultLocationData({
        ...current,
        status: 'error',
        message: errorMessage,
      }));
    } finally {
      setLoading(false);
    }
  };

  const saveManualCoordinates = async () => {
    const latest = await solarProject3DStorage.loadLatest();
    const nextLocationData = createDefaultLocationData({
      ...(latest.locationData || locationData),
      latitude: latitude === '' ? null : Number(latitude),
      longitude: longitude === '' ? null : Number(longitude),
      geocodedAddress: address || latest.address || '',
      message: 'Manuella koordinater sparade. Klicka Hämta platsdata för PVGIS/SMHI.',
      status: 'partial',
      sources: {
        ...(latest.locationData?.sources || {}),
        geocoding: { status: 'connected', message: 'Manuella koordinater' },
        map: { status: 'connected', message: 'Karta förberedd med koordinater / Flygbild ej ansluten' },
        climateLoad: { status: 'manual', message: 'Manuell kontroll krävs' },
      },
    });
    const saved = await solarProject3DStorage.save({
      ...latest,
      address: address || latest.address,
      locationData: nextLocationData,
    });
    setProject(saved);
    setLocationData(nextLocationData);
    setMessage(nextLocationData.message);
  };

  return (
    <div className="min-h-full bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
        <Card className="border-blue-100 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Satellite className="h-4 w-4 text-blue-600" />
              Live platsdata för SolarPlan 3D
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-muted-foreground">Adress</span>
                <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ex. Brogatan 20, Deje" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Latitud</span>
                <Input type="number" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="59.60" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Longitud</span>
                <Input type="number" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="13.48" />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={fetchSiteData} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Hämta platsdata
              </Button>
              <Button variant="outline" onClick={saveManualCoordinates}>Spara manuella koordinater</Button>
              <a
                href="https://www.boverket.se/sv/PBL-kunskapsbanken/regler-om-byggande/boverkets-konstruktionsregler/laster/klimatkartor-i-eks/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
              >
                Öppna Boverkets klimatlastkartor <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className={`rounded-lg border px-3 py-2 text-sm ${locationData.status === 'error' ? 'border-red-200 bg-red-50 text-red-900' : locationData.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
              {message}
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {statuses.map((item) => (
                <div key={item.label} className={`rounded-lg border px-3 py-2 text-sm ${statusClass(item.status)}`}>
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-xs opacity-90">{item.statusText}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" />Koordinater</div>
                <div className="mt-1 text-slate-700">{formatValue(locationData.latitude)}, {formatValue(locationData.longitude)}</div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4" />PVGIS specifik produktion</div>
                <div className="mt-1 text-slate-700">{formatValue(locationData.pvgis?.annualKwhPerKwp, ' kWh/kWp/år')}</div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold"><Thermometer className="h-4 w-4" />SMHI temperatur</div>
                <div className="mt-1 text-slate-700">{formatValue(locationData.smhi?.temperatureC, ' °C')}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Geokodning, PVGIS och SMHI är indikativa hjälpdata. Snö-/vindlast och konstruktionsdata ska verifieras mot Boverket/EKS, produktblad och behörig installatör/konstruktör.
            </p>
          </CardContent>
        </Card>
      </div>
      <SolarPlan3DProjektering />
    </div>
  );
}
