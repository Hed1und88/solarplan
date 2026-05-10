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

  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      <img
        src="/solar-analysis/photorealistic-solar-house.png"
        alt="Fotorealistisk visualisering av villa med solpaneler"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/26 via-transparent to-white/8" />
      <div className="absolute left-5 top-5 rounded-2xl border border-white/50 bg-white/82 px-4 py-3 shadow-xl backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Fotorealistisk visualisering</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{Math.max(0, solar.altitude).toFixed(1)}&deg; solhöjd</p>
        <p className="text-xs font-medium text-slate-600">Villa · takintegrerad solcellsanläggning</p>
      </div>
      <div className="absolute right-5 top-5 rounded-2xl border border-white/50 bg-white/86 px-4 py-3 shadow-xl backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Anläggning</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{panelLayout.panelCount} paneler</p>
        <p className="text-xs font-medium text-slate-600">{panelLayout.installedKw.toFixed(1)} kWp · {model.buildingLength} x {model.buildingWidth} m</p>
      </div>
      <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
        {[
          'Fotorealistisk vy',
          'Premium offertbild',
          `${shadeLoss.toFixed(0)}% skugga`,
          siteData?.tile?.url ? 'Geodata kopplad' : 'Manuell platsdata'
        ].map((item) => (
          <span key={item} className="rounded-full border border-white/55 bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">{item}</span>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f8fb);
    scene.fog = new THREE.Fog(0xf4f8fb, 34, 62);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-12, 12, 7.2, -7.2, 0.1, 100);
    const cameraTarget = new THREE.Vector3(0, 4.8, 0.55);
    let orbitTheta = 0.62;
    let orbitPhi = 0.62;
    let orbitRadius = 18;
    const updateCamera = () => {
      camera.position.set(
        Math.sin(orbitPhi) * Math.sin(orbitTheta) * orbitRadius,
        Math.cos(orbitPhi) * orbitRadius,
        Math.sin(orbitPhi) * Math.cos(orbitTheta) * orbitRadius
      );
      camera.lookAt(cameraTarget);
    };
    updateCamera();

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb7c9b4, 2.3);
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

    const rim = new THREE.DirectionalLight(0xb7ddff, 1.1);
    rim.position.set(-9, 7, -8);
    scene.add(rim);

    const roofTextureCanvas = document.createElement('canvas');
    roofTextureCanvas.width = 512;
    roofTextureCanvas.height = 512;
    const roofCtx = roofTextureCanvas.getContext('2d');
    roofCtx.fillStyle = '#5b3a2f';
    roofCtx.fillRect(0, 0, 512, 512);
    roofCtx.strokeStyle = 'rgba(245, 222, 201, 0.12)';
    roofCtx.lineWidth = 1;
    for (let y = 18; y < 512; y += 34) {
      roofCtx.beginPath();
      roofCtx.moveTo(0, y);
      roofCtx.lineTo(512, y);
      roofCtx.stroke();
    }
    roofCtx.strokeStyle = 'rgba(31, 18, 13, 0.14)';
    roofCtx.lineWidth = 1;
    for (let x = 0; x < 512; x += 42) {
      roofCtx.beginPath();
      roofCtx.moveTo(x, 0);
      roofCtx.lineTo(x + 22, 512);
      roofCtx.stroke();
    }
    const roofTexture = new THREE.CanvasTexture(roofTextureCanvas);
    roofTexture.wrapS = THREE.RepeatWrapping;
    roofTexture.wrapT = THREE.RepeatWrapping;
    roofTexture.repeat.set(3.2, 1.6);
    roofTexture.colorSpace = THREE.SRGBColorSpace;

    const panelTextureCanvas = document.createElement('canvas');
    panelTextureCanvas.width = 512;
    panelTextureCanvas.height = 512;
    const panelCtx = panelTextureCanvas.getContext('2d');
    const panelGradient = panelCtx.createLinearGradient(0, 0, 512, 512);
    panelGradient.addColorStop(0, '#102d46');
    panelGradient.addColorStop(0.5, '#071c33');
    panelGradient.addColorStop(1, '#020b18');
    panelCtx.fillStyle = panelGradient;
    panelCtx.fillRect(0, 0, 512, 512);
    panelCtx.strokeStyle = 'rgba(219, 234, 254, 0.07)';
    panelCtx.lineWidth = 1;
    for (let x = 85; x < 512; x += 85) {
      panelCtx.beginPath();
      panelCtx.moveTo(x, 0);
      panelCtx.lineTo(x, 512);
      panelCtx.stroke();
    }
    for (let y = 128; y < 512; y += 128) {
      panelCtx.beginPath();
      panelCtx.moveTo(0, y);
      panelCtx.lineTo(512, y);
      panelCtx.stroke();
    }
    const panelTexture = new THREE.CanvasTexture(panelTextureCanvas);
    panelTexture.wrapS = THREE.RepeatWrapping;
    panelTexture.wrapT = THREE.RepeatWrapping;
    panelTexture.colorSpace = THREE.SRGBColorSpace;

    const materials = {
      ground: new THREE.MeshStandardMaterial({ color: 0x6f7f65, roughness: 0.98, metalness: 0.01 }),
      plot: new THREE.MeshStandardMaterial({ color: 0x9da78e, roughness: 0.88, metalness: 0.01 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.64, metalness: 0.01 }),
      sideWall: new THREE.MeshStandardMaterial({ color: 0xe1dbd1, roughness: 0.6, metalness: 0.01 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTexture, roughness: 0.72, metalness: 0.01 }),
      roofEdge: new THREE.LineBasicMaterial({ color: 0x2b1d17, transparent: true, opacity: 0.4 }),
      sidingLine: new THREE.LineBasicMaterial({ color: 0xb9b0a3, transparent: true, opacity: 0.22 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0.01 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x9d8363, roughness: 0.82, metalness: 0.01 }),
      railing: new THREE.MeshStandardMaterial({ color: 0xe7e3db, roughness: 0.58, metalness: 0.01 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0f1c2e, roughness: 0.22, metalness: 0.08, transmission: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
      panel: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: panelTexture, roughness: 0.1, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      panelFrame: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.38, metalness: 0.25 }),
      panelLine: new THREE.LineBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.22 }),
      shadow: new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: clamp(shadeLoss / 100, 0.10, 0.36), depthWrite: false }),
      neighbor: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7, metalness: 0.02 }),
      neighborRoof: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.62, metalness: 0.03 }),
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

    const addLineSegments = (points, material) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const lines = new THREE.LineSegments(geometry, material);
      scene.add(lines);
      return lines;
    };

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

    const addVerticalSiding = (lengthValue, widthValue, wallTop, offsetX = 0, offsetZ = 0) => {
      const points = [];
      const frontZ = offsetZ + widthValue / 2 + 0.062;
      const backZ = offsetZ - widthValue / 2 - 0.062;
      for (let x = -lengthValue / 2 + 0.4; x <= lengthValue / 2 - 0.4; x += 0.38) {
        points.push(new THREE.Vector3(offsetX + x, 0.08, frontZ), new THREE.Vector3(offsetX + x, wallTop - 0.12, frontZ));
        points.push(new THREE.Vector3(offsetX + x, 0.08, backZ), new THREE.Vector3(offsetX + x, wallTop - 0.12, backZ));
      }
      for (let z = -widthValue / 2 + 0.4; z <= widthValue / 2 - 0.4; z += 0.38) {
        points.push(new THREE.Vector3(offsetX + lengthValue / 2 + 0.062, 0.08, offsetZ + z), new THREE.Vector3(offsetX + lengthValue / 2 + 0.062, wallTop - 0.12, offsetZ + z));
        points.push(new THREE.Vector3(offsetX - lengthValue / 2 - 0.062, 0.08, offsetZ + z), new THREE.Vector3(offsetX - lengthValue / 2 - 0.062, wallTop - 0.12, offsetZ + z));
      }
      addLineSegments(points, materials.sidingLine);
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
    grid.material.opacity = 0;
    grid.position.y = 0.015;
    scene.add(grid);

    const plot = addMesh(new THREE.PlaneGeometry(18, 13), materials.plot, [0, 0.02, 0], [-Math.PI / 2, 0, THREE.MathUtils.degToRad(45)]);
    plot.receiveShadow = true;

    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const slopeLength = Math.sqrt((width / 2 + 0.42) ** 2 + roofRise ** 2);
    const addVillaVolume = ({ x = 0, z = 0, l = length, w = width, h = wallHeight, wing = false }) => {
      addBox([l, h, w], materials.wall, [x, h / 2, z]);
      addVerticalSiding(l, w, h, x, z);

      addBox([l + 0.28, 0.16, 0.16], materials.trim, [x, h + 0.02, z + w / 2 + 0.1]);
      addBox([l + 0.28, 0.16, 0.16], materials.trim, [x, h + 0.02, z - w / 2 - 0.1]);

      const frontRoof = addBox([l + 0.9, 0.12, slopeLength], materials.roof, [x, h + roofRise / 2, z + w / 4 + 0.12], [pitchRad, 0, 0]);
      const backRoof = addBox([l + 0.9, 0.12, slopeLength], materials.roof, [x, h + roofRise / 2, z - w / 4 - 0.12], [-pitchRad, 0, 0]);
      [frontRoof, backRoof].forEach((roofMesh) => {
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(roofMesh.geometry, 18), materials.roofEdge);
        edge.position.copy(roofMesh.position);
        edge.rotation.copy(roofMesh.rotation);
        scene.add(edge);
      });

      const ridge = addLineSegments([
        new THREE.Vector3(x - l / 2 - 0.36, h + roofRise + 0.04, z),
        new THREE.Vector3(x + l / 2 + 0.36, h + roofRise + 0.04, z),
      ], materials.roofEdge);
      ridge.castShadow = false;

      const windows = wing ? 2 : 4;
      for (let i = 0; i < windows; i += 1) {
        const wx = x - l / 2 + 1.25 + i * 1.35;
        addBox([0.72, 1.38, 0.06], materials.trim, [wx, 1.48, z + w / 2 + 0.035]);
        addBox([0.56, 1.18, 0.08], materials.glass, [wx, 1.48, z + w / 2 + 0.075]);
      }
    };

    addVillaVolume({ x: 0, z: 0, l: length, w: width, h: wallHeight });
    addBox([4.2, wallHeight * 0.86, 3.2], materials.wall, [length / 2 + 2.1, wallHeight * 0.43, -width / 2 + 0.15]);
    addVerticalSiding(4.2, 3.2, wallHeight * 0.86, length / 2 + 2.1, -width / 2 + 0.15);
    addBox([4.8, 0.16, 3.8], materials.roof, [length / 2 + 2.1, wallHeight * 0.86 + 0.1, -width / 2 + 0.15]);
    addBox([4.9, 0.12, 0.16], materials.trim, [length / 2 + 2.1, wallHeight * 0.86 + 0.22, -width / 2 + 2.1]);

    addBox([1.18, 1.98, 0.08], materials.trim, [length / 2 - 1.1, 1.16, width / 2 + 0.04]);
    addBox([0.96, 1.72, 0.1], materials.glass, [length / 2 - 1.1, 1.16, width / 2 + 0.09]);

    const deckZ = width / 2 + 2.25;
    addBox([length + 3.4, 0.14, 2.85], materials.deck, [0.2, 0.1, deckZ]);
    for (let x = -length / 2 - 1.25; x <= length / 2 + 1.6; x += 0.72) {
      addBox([0.07, 0.68, 0.07], materials.railing, [x, 0.5, deckZ + 1.38]);
    }
    addBox([length + 2.9, 0.08, 0.08], materials.railing, [0.18, 0.88, deckZ + 1.38]);
    addBox([length + 2.9, 0.055, 0.055], materials.railing, [0.18, 0.56, deckZ + 1.38]);

    if (model.obstacles.chimney) {
      addBox([0.38, 1.4, 0.38], materials.chimney, [length / 2 - 2.35, wallHeight + roofRise * 0.58, -0.85]);
      addBox([0.52, 0.14, 0.52], materials.chimney, [length / 2 - 2.35, wallHeight + roofRise * 0.58 + 0.75, -0.85]);
    }

    const columns = 6;
    const rows = 3;
    const panelW = 0.68;
    const panelH = 0.96;
    const gap = 0.035;
    const totalPanelWidth = columns * panelW + (columns - 1) * gap;
    const totalPanelDepth = rows * panelH * 0.6 + (rows - 1) * gap;
    const frameCenterZ = 0.92 + totalPanelDepth / 2 - panelH * 0.3;
    const frameCenterY = wallHeight + roofRise - Math.tan(pitchRad) * frameCenterZ + 0.12;
    panelTexture.repeat.set(columns, rows);
    const arrayFrame = addBox([totalPanelWidth + 0.22, 0.05, totalPanelDepth + 0.2], materials.panelFrame, [0, frameCenterY - 0.018, frameCenterZ], [pitchRad, 0, 0]);
    const arrayGlass = addBox([totalPanelWidth + 0.04, 0.035, totalPanelDepth + 0.03], materials.panel, [0, frameCenterY + 0.016, frameCenterZ], [pitchRad, 0, 0]);
    arrayFrame.castShadow = true;
    arrayGlass.castShadow = true;

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
      const view = 9.2;
      camera.left = -view * aspect;
      camera.right = view * aspect;
      camera.top = view;
      camera.bottom = -view;
      camera.updateProjectionMatrix();
    };

    const pointer = { active: false, x: 0, y: 0 };
    const onPointerDown = (event) => {
      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const onPointerMove = (event) => {
      if (!pointer.active) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      orbitTheta -= dx * 0.008;
      orbitPhi = clamp(orbitPhi + dy * 0.006, 0.12, 1.28);
      updateCamera();
    };
    const onPointerUp = (event) => {
      pointer.active = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grab';
    };
    const onWheel = (event) => {
      event.preventDefault();
      orbitRadius = clamp(orbitRadius + event.deltaY * 0.018, 14, 31);
      updateCamera();
    };

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    let frameId = 0;
    resize();
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    animate();
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      roofTexture.dispose();
      panelTexture.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
      });
      Object.values(materials).forEach((material) => material.dispose());
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [model, panelLayout.columns, panelLayout.panelCount, shadeLoss, solar]);

  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
      <div ref={mountRef} className="absolute inset-0" aria-label="WebGL-baserad BIM-vy for 3D-solanalys" />
      <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
        {[
          `${Math.max(0, solar.altitude).toFixed(1)}° solhöjd`,
          `${panelLayout.panelCount} paneler`,
          'Dra och rotera',
          'Scrolla för zoom',
          siteData?.tile?.url ? 'Geodata kopplad' : 'Manuell platsdata'
        ].map((item) => (
          <span key={item} className="rounded-full border border-slate-200 bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">{item}</span>
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
          <h2 className="text-lg font-bold text-slate-950">3D Solanalys · Premium takvisualisering</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Solhöjd {Math.max(0, solar.altitude).toFixed(1)}° · Skugga {shadeLoss.toFixed(0)}%</div>
      </div>
      <div className="bg-slate-50 p-3 sm:p-5">
        <ParametricHouse3D model={model} solar={solar} shadeLoss={shadeLoss} siteData={siteData} />
        <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Byggnad</b><br />{model.buildingLength} x {model.buildingWidth} m</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Tak</b><br />{model.roofType} · {model.roofPitch}°</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Paneler</b><br />{panelLayout.panelCount} st · {panelLayout.installedKw.toFixed(1)} kWp</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><b className="text-slate-950">Platsdata</b><br />{siteData?.elevation?.elevation ? `${siteData.elevation.elevation} m ö.h.` : 'Ej hämtad'}</div>
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
