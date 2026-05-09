import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sun, Save, RotateCcw, Download, Home, CloudSun, TreePine, Compass, Zap, ScanLine, Activity, MapPin, Mountain, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  calculateSolarPosition,
  calculateWeatherFactor,
  calculateShadeLoss,
  calculatePvEstimate,
  generateHourlySimulation,
  annualFactorFromDate,
  calculatePanelLayout,
  clamp
} from '@/lib/solarShadowEngine';
import { applyForecastToModel, fetchSolarPlanSiteData } from '@/lib/geoDataServices';

const initial = {
  projectName: 'Ny 3D Solanalys',
  address: '',
  latitude: 59.3793,
  longitude: 13.5036,
  elevationM: 0,
  terrainSlopeDeg: 0,
  terrainAspect: 180,
  buildingLength: 12,
  buildingWidth: 8,
  buildingHeight: 4.2,
  roofType: 'sadeltak',
  roofPitch: 27,
  roofAzimuth: 180,
  panelPowerW: 450,
  panelLengthM: 1.9,
  panelWidthM: 1.1,
  panelRows: 3,
  panelColumns: 8,
  temperature: 18,
  cloudCover: 22,
  precipitation: 0,
  treeHeight: 9,
  treeDistance: 8,
  neighbourHeight: 7,
  neighbourDistance: 13,
  obstacles: { chimney: true, tree: true, neighbour: false }
};

const today = () => new Date().toISOString().slice(0, 10);
const card = 'rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm';

function NumberInput({ label, value, onChange, suffix = '', step = 1, min, max }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-12 text-sm font-medium outline-none transition focus:border-amber-500 focus:bg-white" />
        <span className="absolute right-3 top-2.5 text-xs text-slate-400">{suffix}</span>
      </div>
    </label>
  );
}

function Stat({ icon: Icon, title, value, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-950 p-2 text-amber-300"><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function ParametricHouse3D({ model, solar, shadeLoss, siteData }) {
  const mountRef = useRef(null);
  const panelLayout = calculatePanelLayout(model);
  const visiblePanelCount = Math.min(panelLayout.panelCount, 40);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);
    scene.fog = new THREE.Fog(0x07111f, 22, 46);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-12, 12, 7.2, -7.2, 0.1, 100);
    camera.position.set(12, 10, 14);
    camera.lookAt(0, 1.8, 0);

    const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x172819, 1.9);
    scene.add(hemi);

    const sunVector = new THREE.Vector3(
      solar.sunVector?.x || 0.45,
      Math.max(0.22, solar.sunVector?.y || 0.55),
      solar.sunVector?.z || 0.72
    ).normalize();
    const key = new THREE.DirectionalLight(0xfff3cf, 4.2);
    key.position.copy(sunVector).multiplyScalar(22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    key.shadow.bias = -0.00035;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x7dd3fc, 1.2);
    rim.position.set(-9, 7, -8);
    scene.add(rim);

    const materials = {
      ground: new THREE.MeshStandardMaterial({ color: 0x314436, roughness: 0.92, metalness: 0.02 }),
      plot: new THREE.MeshStandardMaterial({ color: 0x64785b, roughness: 0.86, metalness: 0.02 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf2f6f8, roughness: 0.55, metalness: 0.01 }),
      sideWall: new THREE.MeshStandardMaterial({ color: 0xc9d4df, roughness: 0.62, metalness: 0.02 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x202a38, roughness: 0.5, metalness: 0.08 }),
      roofEdge: new THREE.LineBasicMaterial({ color: 0x91a4ba, transparent: true, opacity: 0.52 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0f1c2e, roughness: 0.22, metalness: 0.08, transmission: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
      panel: new THREE.MeshPhysicalMaterial({ color: 0x07335f, roughness: 0.18, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
      panelLine: new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.54 }),
      shadow: new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: clamp(shadeLoss / 100, 0.12, 0.5), depthWrite: false }),
      neighbor: new THREE.MeshStandardMaterial({ color: 0xaeb9c7, roughness: 0.72, metalness: 0.02 }),
      neighborRoof: new THREE.MeshStandardMaterial({ color: 0x56657a, roughness: 0.66, metalness: 0.03 }),
      bark: new THREE.MeshStandardMaterial({ color: 0x6a4523, roughness: 0.85 }),
      foliage: new THREE.MeshStandardMaterial({ color: 0x146437, roughness: 0.72 }),
      chimney: new THREE.MeshStandardMaterial({ color: 0x883413, roughness: 0.78 })
    };

    const addMesh = (geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    const addBox = (size, material, position, rotation) => addMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material, position, rotation);

    const createRoofGeometry = (length, width, wallHeight, pitchDeg) => {
      const rise = Math.tan(THREE.MathUtils.degToRad(pitchDeg)) * (width / 2);
      const x = length / 2;
      const z = width / 2;
      const h = wallHeight;
      const vertices = new Float32Array([
        -x, h, -z, x, h, -z, x, h + rise, 0, -x, h + rise, 0,
        -x, h + rise, 0, x, h + rise, 0, x, h, z, -x, h, z,
        -x, h, -z, -x, h + rise, 0, -x, h, z,
        x, h, -z, x, h, z, x, h + rise, 0
      ]);
      const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    };

    const createNeighbor = (x, z, scale = 1) => {
      const base = addBox([4.2 * scale, 2.1 * scale, 2.9 * scale], materials.neighbor, [x, 1.05 * scale, z]);
      base.castShadow = true;
      const roof = addMesh(createRoofGeometry(4.7 * scale, 3.3 * scale, 2.1 * scale, 24), materials.neighborRoof, [x, 0, z]);
      roof.rotation.y = z > 0 ? -0.08 : 0.12;
      base.rotation.y = roof.rotation.y;
    };

    const width = Math.max(5, model.buildingWidth);
    const length = Math.max(7, model.buildingLength);
    const wallHeight = Math.max(3.2, model.buildingHeight);
    const pitch = model.roofType === 'platt' ? 3 : Math.max(8, model.roofPitch);
    const roofRise = Math.tan(THREE.MathUtils.degToRad(pitch)) * (width / 2);

    addMesh(new THREE.PlaneGeometry(34, 24), materials.ground, [0, -0.02, 0], [-Math.PI / 2, 0, 0]);
    const grid = new THREE.GridHelper(32, 32, 0x7dd3fc, 0x27384a);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.position.y = 0.015;
    scene.add(grid);

    const plot = addMesh(new THREE.PlaneGeometry(18, 13), materials.plot, [0, 0.02, 0], [-Math.PI / 2, 0, THREE.MathUtils.degToRad(45)]);
    plot.receiveShadow = true;

    addBox([length, wallHeight, width], materials.wall, [0, wallHeight / 2, 0]);
    addBox([0.08, wallHeight * 0.98, width + 0.02], materials.sideWall, [length / 2 + 0.04, wallHeight / 2, 0]);
    addBox([0.08, wallHeight * 0.98, width + 0.02], materials.sideWall, [-length / 2 - 0.04, wallHeight / 2, 0]);

    const roof = addMesh(
      createRoofGeometry(length + 0.7, width + 0.7, wallHeight, pitch),
      materials.roof,
      [0, 0, 0]
    );
    const roofEdges = new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry, 18), materials.roofEdge);
    roofEdges.position.copy(roof.position);
    scene.add(roofEdges);

    const windowCount = 4;
    for (let i = 0; i < windowCount; i += 1) {
      const x = -length / 2 + 1.4 + i * 1.45;
      addBox([0.58, 1.25, 0.08], materials.glass, [x, 1.35, width / 2 + 0.055]);
    }
    addBox([0.9, 1.65, 0.08], materials.glass, [length / 2 - 1.35, 1.22, width / 2 + 0.06]);

    if (model.obstacles.chimney) {
      addBox([0.42, 1.65, 0.42], materials.chimney, [length / 2 - 2.1, wallHeight + roofRise * 0.72, -0.75]);
      addBox([0.56, 0.16, 0.56], materials.chimney, [length / 2 - 2.1, wallHeight + roofRise * 0.72 + 0.86, -0.75]);
    }

    const columns = Math.max(1, Math.min(panelLayout.columns, 10));
    const panelW = 0.82;
    const panelH = 1.12;
    const gap = 0.09;
    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const totalPanelWidth = columns * panelW + (columns - 1) * gap;
    const startX = -totalPanelWidth / 2 + panelW / 2;
    for (let index = 0; index < visiblePanelCount; index += 1) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (panelW + gap);
      const z = 0.55 + row * (panelH * 0.54 + gap);
      const y = wallHeight + roofRise - Math.tan(pitchRad) * z + 0.07;
      const panel = addBox([panelW, 0.055, panelH], materials.panel, [x, y, z], [-pitchRad, 0, 0]);
      panel.castShadow = true;
      const panelEdge = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), materials.panelLine);
      panelEdge.position.copy(panel.position);
      panelEdge.rotation.copy(panel.rotation);
      scene.add(panelEdge);
    }

    if (model.obstacles.tree) {
      const treeX = -length / 2 - Math.max(2.2, model.treeDistance * 0.26);
      const treeZ = width / 2 + 1.6;
      const trunkHeight = Math.max(2.6, model.treeHeight * 0.38);
      addMesh(new THREE.CylinderGeometry(0.18, 0.28, trunkHeight, 12), materials.bark, [treeX, trunkHeight / 2, treeZ]);
      const crownY = trunkHeight + 0.9;
      [
        [0, 0.1, 0, 1.08],
        [-0.7, -0.05, 0.22, 0.78],
        [0.72, 0.02, 0.05, 0.88],
        [0.12, 0.65, -0.28, 0.72]
      ].forEach(([dx, dy, dz, radius]) => {
        addMesh(new THREE.IcosahedronGeometry(radius, 2), materials.foliage, [treeX + dx, crownY + dy, treeZ + dz]);
      });
    }

    createNeighbor(-length / 2 - 4.4, -width / 2 - 2.4, 0.82);
    if (model.obstacles.neighbour) {
      createNeighbor(length / 2 + Math.max(3.6, model.neighbourDistance * 0.3), -width / 2 - 0.5, 1.05);
    } else {
      createNeighbor(length / 2 + 4.9, -width / 2 - 1.4, 0.68);
    }

    const shadowLong = 6.5 + clamp(shadeLoss / 10, 0, 5);
    const houseShadow = addMesh(new THREE.PlaneGeometry(length + 2.2, shadowLong), materials.shadow, [3.4, 0.045, width / 2 + 3.6], [-Math.PI / 2, 0, -0.55]);
    houseShadow.receiveShadow = false;
    if (model.obstacles.tree) {
      addMesh(new THREE.CircleGeometry(2.25, 48), materials.shadow, [-length / 2 - 1.8, 0.05, width / 2 + 4.8], [-Math.PI / 2, 0, -0.35]);
    }

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      const widthPx = Math.max(1, clientWidth);
      const heightPx = Math.max(1, clientHeight);
      renderer.setSize(widthPx, heightPx, false);
      const aspect = widthPx / heightPx;
      const view = 15.5;
      camera.left = -view * aspect;
      camera.right = view * aspect;
      camera.top = view;
      camera.bottom = -view;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
      });
      Object.values(materials).forEach((material) => material.dispose());
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [model, panelLayout.columns, panelLayout.panelCount, shadeLoss, solar]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f]">
      <div ref={mountRef} className="absolute inset-0" aria-label="WebGL-baserad BIM-vy for 3D-solanalys" />
      <div className="pointer-events-none absolute left-5 top-5 rounded-2xl border border-white/10 bg-slate-950/82 px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">BIM Shadow Study</p>
        <p className="mt-1 text-2xl font-black text-white">{Math.max(0, solar.altitude).toFixed(1)}&deg; solhojd</p>
        <p className="text-xs font-medium text-slate-300">Skugga {shadeLoss.toFixed(0)}% · Azimut {model.roofAzimuth}&deg;</p>
      </div>
      <div className="pointer-events-none absolute right-5 top-5 rounded-2xl border border-white/10 bg-white/92 px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Anlaggning</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{panelLayout.panelCount} paneler</p>
        <p className="text-xs font-medium text-slate-600">{panelLayout.installedKw.toFixed(1)} kWp · {model.buildingLength} x {model.buildingWidth} m</p>
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
        {['WebGL', 'Skuggkarta', 'Grannvolymer', siteData?.tile?.url ? 'Geodata kopplad' : 'Manuell platsdata'].map((item) => (
          <span key={item} className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200 backdrop-blur">{item}</span>
        ))}
      </div>
    </div>
  );
}

function Technical3DModel({ model, solar, shadeLoss, siteData }) {
  const panelLayout = calculatePanelLayout(model);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><ScanLine className="h-4 w-4" /> Teknisk analysvy</div>
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · BIM-skuggstudie i WebGL</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Skugga {shadeLoss.toFixed(0)}%</div>
      </div>
      <div className="bg-slate-950 p-3 sm:p-5">
        <ParametricHouse3D model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />
        <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Byggnad</b><br />{model.buildingLength} x {model.buildingWidth} m</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Tak</b><br />{model.roofType} · {model.roofPitch}°</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Paneler</b><br />{panelLayout.panelCount} st · {panelLayout.installedKw.toFixed(1)} kWp</div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Platsdata</b><br />{siteData?.elevation?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'Ej hämtad'}</div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return <div className={`${card} p-4`}><h3 className="mb-4 text-sm font-bold text-slate-950">{title}</h3><div className="h-56">{children}</div></div>;
}

function StatusPill({ status, children }) {
  const classes = status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
  return <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>{children}</div>;
}

export default function SolarShadowAnalysis() {
  const [model, setModel] = useState(initial);
  const [date, setDate] = useState(today());
  const [hour, setHour] = useState(12);
  const [siteData, setSiteData] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  const set = (key, value) => setModel((current) => ({ ...current, [key]: value }));
  const setObstacle = (key, value) => setModel((current) => ({ ...current, obstacles: { ...current.obstacles, [key]: value } }));

  const time = `${String(hour).padStart(2, '0')}:00`;
  const solar = useMemo(() => calculateSolarPosition({ latitude: model.latitude, longitude: model.longitude, date, time }), [model.latitude, model.longitude, date, time]);
  const weatherFactor = useMemo(() => calculateWeatherFactor(model), [model]);
  const shadeLoss = useMemo(() => calculateShadeLoss({ solar, model }), [solar, model]);
  const estimate = useMemo(() => calculatePvEstimate({ solar, model, weatherFactor, shadeLoss }), [solar, model, weatherFactor, shadeLoss]);
  const panelLayout = useMemo(() => calculatePanelLayout(model), [model]);
  const simulation = useMemo(() => generateHourlySimulation({ model, date }), [model, date]);
  const dailyKwh = simulation.reduce((sum, row) => sum + row.productionKw, 0);
  const annualKwh = dailyKwh * 365 * annualFactorFromDate(date);
  const chartData = simulation.map((row) => ({ time: row.time, power: Number(row.productionKw.toFixed(2)), shade: Number(row.shadeLoss.toFixed(0)), altitude: Number(Math.max(0, row.solar.altitude).toFixed(1)), irradiance: Number(row.irradiance.toFixed(0)) }));

  const connectRealData = async () => {
    setGeoLoading(true);
    setGeoError('');
    try {
      const data = await fetchSolarPlanSiteData({ address: model.address, latitude: model.latitude, longitude: model.longitude, date, hour });
      setSiteData(data);
      setModel((current) => {
        const withCoordinates = {
          ...current,
          latitude: data.latitude,
          longitude: data.longitude,
          elevationM: data.elevation?.elevation ?? current.elevationM
        };
        return applyForecastToModel(withCoordinates, data.nearestForecast);
      });
    } catch (error) {
      setGeoError(error?.message || 'Kunde inte koppla verklig kartdata, höjddata och SMHI.');
    } finally {
      setGeoLoading(false);
    }
  };

  const saveLocal = () => localStorage.setItem('solarplan_3d_solar_analysis_v3', JSON.stringify({ model, date, hour, siteData }));
  const reset = () => { setModel(initial); setDate(today()); setHour(12); setSiteData(null); setGeoError(''); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ model, date, hour, solar, weatherFactor, shadeLoss, estimate, panelLayout, siteData, simulation }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solarplan-3d-solanalys-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const buildingFields = [
    ['buildingLength', 'Längd', 'm', 0.1], ['buildingWidth', 'Bredd', 'm', 0.1], ['buildingHeight', 'Vägghöjd', 'm', 0.1], ['roofPitch', 'Taklutning', '°', 1],
    ['roofAzimuth', 'Takazimut', '°', 1], ['panelPowerW', 'Paneleffekt', 'W', 5], ['panelRows', 'Panelrader', 'st', 1], ['panelColumns', 'Panelkolumner', 'st', 1]
  ];
  const weatherFields = [
    ['cloudCover', 'Molnighet', '%', 1], ['temperature', 'Temperatur', '°C', 1], ['precipitation', 'Nederbörd', 'mm/h', 0.1],
    ['terrainSlopeDeg', 'Terränglutning', '°', 1], ['treeHeight', 'Trädhöjd', 'm', 1], ['treeDistance', 'Trädavstånd', 'm', 1], ['neighbourHeight', 'Grannhöjd', 'm', 1]
  ];

  return (
    <div className="min-h-full bg-slate-100 p-4 pb-28 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300"><Activity className="h-4 w-4" /> SolarPlan Engineering</div>
              <h1 className="text-2xl font-black tracking-tight lg:text-4xl">3D Solanalys · Parametriskt hus + verklig platsdata</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Huset byggs från längd, bredd, vägghöjd och taklutning. Ändrar du måtten ändras 3D-modellen, panelplaceringen och solanalysen direkt.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={connectRealData} disabled={geoLoading} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{geoLoading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <MapPin className="mr-2 inline h-4 w-4" />}Koppla kartdata/SMHI</button>
              <button onClick={saveLocal} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950"><Save className="mr-2 inline h-4 w-4" />Spara</button>
              <button onClick={exportJson} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><Download className="mr-2 inline h-4 w-4" />Export</button>
              <button onClick={reset} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"><RotateCcw className="mr-2 inline h-4 w-4" />Reset</button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatusPill status={siteData?.geocoded || siteData?.latitude ? 'ok' : 'idle'}>{siteData ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />} Kartdata {siteData ? `${model.latitude}, ${model.longitude}` : 'ej kopplad'}</StatusPill>
          <StatusPill status={siteData?.elevation ? 'ok' : 'idle'}>{siteData?.elevation ? <CheckCircle2 className="h-4 w-4" /> : <Mountain className="h-4 w-4" />} Höjddata {siteData?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'ej hämtad'}</StatusPill>
          <StatusPill status={siteData?.nearestForecast ? 'ok' : geoError ? 'warn' : 'idle'}>{geoError ? <AlertTriangle className="h-4 w-4" /> : <CloudSun className="h-4 w-4" />} SMHI {siteData?.nearestForecast ? `${model.temperature}°C · ${model.cloudCover}% moln` : geoError || 'ej hämtad'}</StatusPill>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Stat icon={Sun} title="Solhöjd" value={`${Math.max(0, solar.altitude).toFixed(1)}°`} text={`Azimut ${solar.azimuth.toFixed(0)}°`} />
          <Stat icon={CloudSun} title="Väderfaktor" value={`${(weatherFactor * 100).toFixed(0)}%`} text={`${model.cloudCover}% moln · ${model.temperature}°C`} />
          <Stat icon={TreePine} title="Skuggförlust" value={`${shadeLoss.toFixed(0)}%`} text="Hinder, takvinkel och låg sol" />
          <Stat icon={Zap} title="Effekt nu" value={`${estimate.productionKw.toFixed(1)} kW`} text={`${estimate.irradiance.toFixed(0)} W/m²`} />
          <Stat icon={Activity} title="Installerbart" value={`${panelLayout.installedKw.toFixed(1)} kWp`} text={`${panelLayout.panelCount} paneler`} />
          <Stat icon={Compass} title="År" value={`${annualKwh.toFixed(0)} kWh`} text="Förenklat årsestimat" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <div className="space-y-4">
            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><Home className="h-5 w-5 text-amber-500" />Fastighet</h2>
              <div className="grid gap-3">
                <input value={model.projectName} onChange={(event) => set('projectName', event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium" />
                <input value={model.address} onChange={(event) => set('address', event.target.value)} placeholder="Skriv adress och klicka Koppla kartdata/SMHI" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Latitud" value={model.latitude} onChange={(value) => set('latitude', value)} suffix="°" step={0.0001} />
                  <NumberInput label="Longitud" value={model.longitude} onChange={(value) => set('longitude', value)} suffix="°" step={0.0001} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <NumberInput label="Tid" value={hour} onChange={(value) => setHour(clamp(value, 4, 19))} suffix=":00" step={1} min={4} max={19} />
                </div>
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 font-bold text-slate-950">Byggnad, tak och paneler</h2>
              <label className="mb-3 block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Taktyp</span>
                <select value={model.roofType} onChange={(event) => set('roofType', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium">
                  <option value="sadeltak">Sadeltak</option>
                  <option value="pulpettak">Pulpettak</option>
                  <option value="platt">Platt tak</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {buildingFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, value)} suffix={suffix} step={step} />)}
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                <b>Takyta:</b> {panelLayout.roofAreas.totalRoofArea.toFixed(1)} m² · <b>Användbar:</b> {panelLayout.roofAreas.usableRoofArea.toFixed(1)} m² · <b>Panelarea:</b> {panelLayout.requiredArea.toFixed(1)} m²
              </div>
            </div>

            <div className={`${card} p-4`}>
              <h2 className="mb-4 flex gap-2 font-bold text-slate-950"><CloudSun className="h-5 w-5 text-amber-500" />Väder, höjddata och hinder</h2>
              <div className="grid grid-cols-2 gap-3">
                {weatherFields.map(([key, label, suffix, step]) => <NumberInput key={key} label={label} value={model[key]} onChange={(value) => set(key, key === 'cloudCover' ? clamp(value, 0, 100) : value)} suffix={suffix} step={step} />)}
              </div>
              <div className="mt-4 grid gap-2">
                {[["chimney", "Skorsten"], ["tree", "Träd"], ["neighbour", "Grannbyggnad"]].map(([key, label]) => (
                  <label key={key} className="flex justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={model.obstacles[key]} onChange={(event) => setObstacle(key, event.target.checked)} /></label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Technical3DModel model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />

            <div className={`${card} p-4`}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold text-slate-950">Timvis teknisk simulering</h2>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Aktiv timme {hour}:00</div>
              </div>
              <input type="range" min="4" max="19" value={hour} onChange={(event) => setHour(Number(event.target.value))} className="mb-5 w-full" />
              <div className="grid gap-2">
                {simulation.map((row) => (
                  <button key={row.time} onClick={() => setHour(Number(row.time.slice(0, 2)))} className={`grid w-full grid-cols-[52px_1fr_76px_64px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${Number(row.time.slice(0, 2)) === hour ? 'bg-slate-950 text-white' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <span className="font-bold">{row.time}</span>
                    <span className="h-2 rounded-full bg-slate-200"><span className="block h-2 rounded-full bg-amber-400" style={{ width: `${clamp((row.productionKw / Math.max(1, panelLayout.installedKw)) * 100, 0, 100)}%` }} /></span>
                    <span className="text-right font-semibold">{row.productionKw.toFixed(1)} kW</span>
                    <span className="text-right text-xs opacity-75">{row.shadeLoss.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Produktion och instrålning">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="power" name="kW" stroke="#f59e0b" fill="#fde68a" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Skuggförlust per timme">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="shade" name="Skugga %" fill="#0f172a" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className={`${card} p-4 lg:col-span-2`}>
                <h3 className="mb-4 text-sm font-bold text-slate-950">Analys</h3>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Vald timme:</b> {time}</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Produktion:</b> {estimate.productionKw.toFixed(1)} kW just nu</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Skuggning:</b> {shadeLoss.toFixed(0)}%</p>
                  <p className="rounded-2xl bg-slate-50 p-3"><b>Tak:</b> {model.roofPitch}° lutning · {model.roofAzimuth}° azimut</p>
                  <p className="rounded-2xl bg-emerald-50 p-3 text-emerald-950 md:col-span-2"><b>Nästa steg utfört:</b> basvyn är nu kopplad mot verklig kartdata, höjddata och SMHI. Adress hämtar koordinater, höjd hämtas automatiskt och väderdata uppdaterar molnighet, temperatur och nederbörd.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
