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

function addBox(scene, { size, position, color, roughness = 0.65, metalness = 0, name, cast = true, receive = true }) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (name) mesh.name = name;
  scene.add(mesh);
  return mesh;
}

function makeRoofPlane({ width, length, pitch, side, color = 0x7f1d1d }) {
  const geometry = new THREE.PlaneGeometry(length, width / 2);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = Math.PI / 2;
  mesh.rotation.x = side * THREE.MathUtils.degToRad(pitch);
  return mesh;
}

function clearScene(scene) {
  while (scene.children.length) {
    const object = scene.children.pop();
    object.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
        else child.material.dispose();
      }
    });
  }
}

function ParametricHouse3D({ model, solar, shadeLoss, siteData }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const cameraState = useRef({ yaw: -0.78, pitch: 0.45, distance: 25, dragging: false, x: 0, y: 0 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9f1f8);
    scene.fog = new THREE.Fog(0xe9f1f8, 32, 90);

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const updateCamera = () => {
      const state = cameraState.current;
      const target = new THREE.Vector3(0, 2, 0);
      camera.position.set(
        Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance,
        Math.sin(state.pitch) * state.distance + 3,
        Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance
      );
      camera.lookAt(target);
    };

    const resize = () => {
      if (!mount || !renderer) return;
      camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const pointerDown = (event) => {
      cameraState.current.dragging = true;
      cameraState.current.x = event.clientX;
      cameraState.current.y = event.clientY;
    };
    const pointerMove = (event) => {
      const state = cameraState.current;
      if (!state.dragging) return;
      state.yaw -= (event.clientX - state.x) * 0.006;
      state.pitch = clamp(state.pitch + (event.clientY - state.y) * 0.004, 0.18, 1.1);
      state.x = event.clientX;
      state.y = event.clientY;
      updateCamera();
    };
    const pointerUp = () => { cameraState.current.dragging = false; };
    const wheel = (event) => {
      cameraState.current.distance = clamp(cameraState.current.distance + event.deltaY * 0.015, 12, 48);
      updateCamera();
    };

    mount.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    mount.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('resize', resize);

    updateCamera();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    rendererRef.current.scene = scene;
    rendererRef.current.camera = camera;

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      mount.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      mount.removeEventListener('wheel', wheel);
      clearScene(scene);
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = renderer?.scene;
    if (!scene) return;
    clearScene(scene);

    const length = clamp(model.buildingLength, 3, 80);
    const width = clamp(model.buildingWidth, 3, 50);
    const wallHeight = clamp(model.buildingHeight, 2, 18);
    const pitch = clamp(model.roofPitch, 0, 65);
    const roofRise = (width / 2) * Math.tan(THREE.MathUtils.degToRad(pitch));
    const ridgeY = wallHeight + (model.roofType === 'platt' ? 0.2 : roofRise);
    const shade = clamp(shadeLoss / 100, 0, 1);

    const ambient = new THREE.AmbientLight(0xffffff, 0.42);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfff2bd, solar.altitude > 0 ? 1.25 : 0.25);
    const sunDistance = 30;
    sunLight.position.set(solar.sunVector.x * sunDistance, Math.max(4, solar.sunVector.y * sunDistance), solar.sunVector.z * sunDistance);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.camera.left = -32;
    sunLight.shadow.camera.right = 32;
    sunLight.shadow.camera.top = 32;
    sunLight.shadow.camera.bottom = -32;
    scene.add(sunLight);

    const hemi = new THREE.HemisphereLight(0x90cdf4, 0x24420f, 0.45);
    scene.add(hemi);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x5c7c38, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.rotation.z = THREE.MathUtils.degToRad(model.terrainAspect || 0);
    ground.rotation.y = THREE.MathUtils.degToRad(model.terrainSlopeDeg || 0) * 0.22;
    ground.receiveShadow = true;
    scene.add(ground);

    addBox(scene, { size: [length + 5.5, 0.14, width + 7.5], position: [0, 0.07, 2], color: 0xb09068, cast: false });
    addBox(scene, { size: [length, wallHeight, width], position: [0, wallHeight / 2, 0], color: 0xf6f3ea, roughness: 0.82 });

    addBox(scene, { size: [0.14, 2.3, 1.35], position: [-length / 2 - 0.08, 1.9, -2.1], color: 0x293241, roughness: 0.35, metalness: 0.05 });
    addBox(scene, { size: [0.14, 2.3, 1.35], position: [-length / 2 - 0.08, 1.9, 0], color: 0x293241, roughness: 0.35, metalness: 0.05 });
    addBox(scene, { size: [0.14, 2.3, 1.35], position: [-length / 2 - 0.08, 1.9, 2.1], color: 0x293241, roughness: 0.35, metalness: 0.05 });
    addBox(scene, { size: [2.4, 2.4, 0.12], position: [length * 0.25, 1.85, width / 2 + 0.08], color: 0x334155, roughness: 0.38 });
    addBox(scene, { size: [1.35, 2.35, 0.12], position: [length * 0.43, 1.85, width / 2 + 0.08], color: 0x1f2937, roughness: 0.45 });
    addBox(scene, { size: [1.1, 2.15, 0.12], position: [length * -0.37, 1.45, width / 2 + 0.08], color: 0x475569, roughness: 0.45 });

    if (model.roofType === 'platt') {
      addBox(scene, { size: [length + 0.8, 0.35, width + 0.8], position: [0, wallHeight + 0.18, 0], color: 0x374151, roughness: 0.85 });
    } else if (model.roofType === 'pulpettak') {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(length + 0.7, 0.24, width + 0.8),
        new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.82 })
      );
      roof.rotation.x = THREE.MathUtils.degToRad(-pitch);
      roof.position.set(0, wallHeight + roofRise / 2 + 0.12, 0);
      roof.castShadow = true;
      roof.receiveShadow = true;
      scene.add(roof);
    } else {
      const leftRoof = makeRoofPlane({ width: width + 0.8, length: length + 0.9, pitch, side: -1 });
      const rightRoof = makeRoofPlane({ width: width + 0.8, length: length + 0.9, pitch, side: 1 });
      leftRoof.position.set(0, wallHeight + roofRise / 2, -width / 4);
      rightRoof.position.set(0, wallHeight + roofRise / 2, width / 4);
      leftRoof.castShadow = rightRoof.castShadow = true;
      leftRoof.receiveShadow = rightRoof.receiveShadow = true;
      scene.add(leftRoof, rightRoof);
      addBox(scene, { size: [length + 1.0, 0.1, 0.18], position: [0, ridgeY + 0.08, 0], color: 0x441515, roughness: 0.7 });

      const tileRows = 9;
      for (let i = 0; i < tileRows; i += 1) {
        const z = -width / 2 + (i * width) / tileRows + 0.4;
        addBox(scene, { size: [length + 0.6, 0.035, 0.04], position: [0, wallHeight + 0.2 + i * (roofRise / tileRows), z], color: 0x9f2d20, roughness: 0.8, cast: false });
      }
    }

    const panelLayout = calculatePanelLayout(model);
    const panelColor = new THREE.Color(0x0f2f68).lerp(new THREE.Color(0x0b1220), shade * 0.65);
    const rows = panelLayout.rows;
    const cols = panelLayout.columns;
    const activeWidth = Math.min(width * 0.44, rows * panelLayout.panelWidth * 0.66);
    const activeLength = Math.min(length * 0.82, cols * panelLayout.panelLength * 0.54);
    const startX = -activeLength / 2;
    const startZ = width * 0.08;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(panelLayout.panelLength * 0.5, 0.045, panelLayout.panelWidth * 0.48),
          new THREE.MeshStandardMaterial({ color: panelColor, roughness: 0.45, metalness: 0.2 })
        );
        panel.position.set(startX + c * panelLayout.panelLength * 0.54 + panelLayout.panelLength * 0.25, wallHeight + roofRise * 0.62 + 0.13 + r * 0.08, startZ + r * (activeWidth / Math.max(1, rows)));
        panel.rotation.x = THREE.MathUtils.degToRad(pitch);
        panel.castShadow = true;
        panel.receiveShadow = true;
        scene.add(panel);
      }
    }

    if (model.obstacles.chimney) addBox(scene, { size: [0.65, 2.1, 0.65], position: [length * 0.3, ridgeY + 0.55, -0.65], color: 0x7c2d12, roughness: 0.8 });

    if (model.obstacles.tree) {
      addBox(scene, { size: [0.45, model.treeHeight * 0.45, 0.45], position: [-length / 2 - model.treeDistance * 0.45, model.treeHeight * 0.225, -width / 2 - 1.5], color: 0x7c4a1f, roughness: 0.9 });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(model.treeHeight * 0.24, 24, 18), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.85 }));
      crown.position.set(-length / 2 - model.treeDistance * 0.45, model.treeHeight * 0.45 + 1.8, -width / 2 - 1.5);
      crown.castShadow = true;
      crown.receiveShadow = true;
      scene.add(crown);
    }

    if (model.obstacles.neighbour) {
      addBox(scene, { size: [length * 0.55, model.neighbourHeight, width * 0.62], position: [length / 2 + model.neighbourDistance * 0.35, model.neighbourHeight / 2, 0], color: 0x94a3b8, roughness: 0.8 });
    }

    const sunSphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: solar.altitude > 0 ? 0xfbbf24 : 0x64748b }));
    sunSphere.position.set(sunLight.position.x * 0.42, sunLight.position.y * 0.42, sunLight.position.z * 0.42);
    scene.add(sunSphere);

    if (siteData?.tile?.url) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(siteData.tile.url, (texture) => {
        const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
        mapMesh.rotation.x = -Math.PI / 2;
        mapMesh.position.set(-length / 2 - 7, 0.09, width / 2 + 4);
        scene.add(mapMesh);
      });
    }
  }, [model, solar, shadeLoss, siteData]);

  return <div ref={mountRef} className="h-[520px] w-full cursor-grab overflow-hidden rounded-2xl bg-slate-900 active:cursor-grabbing" />;
}

function Technical3DModel({ model, solar, shadeLoss, siteData }) {
  const panelLayout = calculatePanelLayout(model);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600"><ScanLine className="h-4 w-4" /> Parametrisk WebGL-vy</div>
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · Huset byggs om direkt när måtten ändras</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Skugga {shadeLoss.toFixed(0)}%</div>
      </div>
      <div className="bg-slate-950 p-3 sm:p-5">
        <ParametricHouse3D model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />
        <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3"><b className="text-white">Byggnad</b><br />{model.buildingLength} × {model.buildingWidth} m</div>
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
