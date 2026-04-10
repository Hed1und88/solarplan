import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { address, peakPower = 5 } = await req.json();
  if (!address) return Response.json({ error: 'Adress saknas' }, { status: 400 });

  // Geocode address
  let lat, lon;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'SolarPlannerApp/1.0', 'Accept-Language': 'sv' } }
    );
    const geoData = await geoRes.json();
    if (!geoData.length) return Response.json({ error: 'Adressen hittades inte' }, { status: 404 });
    lat = parseFloat(geoData[0].lat);
    lon = parseFloat(geoData[0].lon);
  } catch (e) {
    return Response.json({ error: 'Geokodning misslyckades: ' + e.message }, { status: 500 });
  }

  // Fetch PVGIS and forecast.solar in parallel
  const [pvgisResult, forecastResult] = await Promise.allSettled([
    fetch(`https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=${peakPower}&loss=14&outputformat=json&browser=0`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`PVGIS status ${r.status}`))),
    fetch(`https://api.forecast.solar/estimate/${lat.toFixed(4)}/${lon.toFixed(4)}/45/0/${peakPower}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`forecast.solar status ${r.status}`))),
  ]);

  return Response.json({
    lat,
    lon,
    pvgis: pvgisResult.status === 'fulfilled' ? pvgisResult.value : null,
    pvgisError: pvgisResult.status === 'rejected' ? pvgisResult.reason?.message : null,
    forecast: forecastResult.status === 'fulfilled' ? forecastResult.value : null,
    forecastError: forecastResult.status === 'rejected' ? forecastResult.reason?.message : null,
  });
});