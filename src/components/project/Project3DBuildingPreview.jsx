// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const degToRad = (deg) => (Number(deg) * Math.PI) / 180;
const safeNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function addQuad(group, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addTriangle(group, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addLine(group, points, color = 0x0f172a, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
  );
  group.add(line);
  return line;
}

function createSiteTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, '#dce7d8');
  gradient.addColorStop(0.38, '#cddcc8');
  gradient.addColorStop(0.55, '#d8d2bd');
  gradient.addColorStop(1, '#b9c8b6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  // Soft orthophoto-like terrain patches
  for (let i = 0; i < 120; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(92,116,82,0.14)' : i % 3 === 1 ? 'rgba(186,171,129,0.12)' : 'rgba(114,130,100,0.10)';
    ctx.beginPath();
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const rx = 30 + Math.random() * 120;
    const ry = 12 + Math.random() * 70;
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Roads / lot boundaries
  ctx.strokeStyle = 'rgba(108,112,104,0.35)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(-80, 820);
  ctx.bezierCurveTo(260, 720, 530, 770, 1120, 650);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245,244,234,0.7)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-80, 820);
  ctx.bezierCurveTo(260, 720, 530, 770, 1120, 650);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(70,82,68,0.26)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 1024, Math.random() * 1024);
    ctx.lineTo(Math.random() * 1024, Math.random() * 1024);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function addSitePlane(group) {
  const texture = createSiteTexture();
  const material = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : 0xd9e4cf,
    map: texture || null,
    roughness: 0.95,
    metalness: 0,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(70, 50, 1, 1), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, -0.035, 0);
  plane.receiveShadow = true;
  group.add(plane);

  const lotMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.55 });
  const lotGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-24, 0.012, -15),
    new THREE.Vector3(22, 0.012, -18),
    new THREE.Vector3(27, 0.012, 14),
    new THREE.Vector3(-21, 0.012, 17),
    new THREE.Vector3(-24, 0.012, -15),
  ]);
  group.add(new THREE.Line(lotGeometry, lotMaterial));
}

function addContextBuildings(group, length, width, height) {
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c9c4, roughness: 0.82, metalness: 0.02 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8e969c, roughness: 0.82, metalness: 0.02 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const blocks = [
    { x: -length * 0.9, z: -width * 1.15, w: length * 0.7, d: width * 0.55, h: height * 0.72 },
    { x: length * 0.95, z: width * 1.05, w: length * 0.86, d: width * 0.52, h: height * 0.55 },
    { x: length * 1.35, z: -width * 0.7, w: length * 0.45, d: width * 0.65, h: height * 0.46 },
  ];

  blocks.forEach((block) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(block.w, block.h, block.d), buildingMaterial);
    body.position.set(block.x, block.h / 2, block.z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(block.w + 0.12, 0.14, block.d + 0.12), roofMaterial);
    roof.position.set(block.x, block.h + 0.07, block.z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), edgeMaterial);
    edges.position.copy(body.position);
    group.add(edges);
  });
}

function roofPoint(building, surface, xM, yM, zOffset = 0.03) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4.2));
  const pitch = Math.max(0, Math.min(75, safeNumber(surface?.tiltDeg ?? building.roofPitchDeg, 27)));
  const halfL = length / 2;
  const halfW = width / 2;
  const localX = -halfL + safeNumber(xM, 0);
  const localY = safeNumber(yM, 0);
  const cos = Math.cos(degToRad(pitch));
  const sin = Math.sin(degToRad(pitch));
  const roofType = building.roofType || 'gable';
  const id = surface?.id || '';

  if (roofType === 'flat' || roofType === 'hip') {
    return new THREE.Vector3(localX, height + zOffset, -halfW + localY);
  }

  if (roofType === 'single_slope') {
    return new THREE.Vector3(localX, height + localY * sin + zOffset, -halfW + localY * cos);
  }

  if (id.includes('-b')) {
    return new THREE.Vector3(localX, height + localY * sin + zOffset, halfW - localY * cos);
  }

  return new THREE.Vector3(localX, height + localY * sin + zOffset, -halfW + localY * cos);
}

function addRoofRect(group, building, surface, item, material, zOffset = 0.06) {
  const x = safeNumber(item.xM, 0);
  const y = safeNumber(item.yM, 0);
  const w = safeNumber(item.widthM, 0.5);
  const h = safeNumber(item.heightM, 0.5);
  return addQuad(group, [
    roofPoint(building, surface, x, y, zOffset),
    roofPoint(building, surface, x + w, y, zOffset),
    roofPoint(building, surface, x + w, y + h, zOffset),
    roofPoint(building, surface, x, y + h, zOffset),
  ], material);
}

function addRoofOverlays(group, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis) {
  const surfaceById = Object.fromEntries((roofSurfaces || []).map((surface) => [surface.id, surface]));
  const affected = new Set((shadingAnalysis?.affectedPanels || []).map((item) => `${item.groupId}:${item.panelId}`));
  const panelMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.32, metalness: 0.32, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x075985, roughness: 0.34, metalness: 0.25, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.34, metalness: 0.25, side: THREE.DoubleSide }),
  ];
  const shadedMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const excludedMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 });

  (roofSurfaces || []).forEach((surface) => {
    (surface.excludedZones || []).forEach((zone) => addRoofRect(group, building, surface, zone, excludedMaterial, 0.09));
  });

  (panelGroups || []).forEach((panelGroup, groupIndex) => {
    const surface = surfaceById[panelGroup.roofSurfaceId];
    if (!surface) return;
    (panelGroup.panels || []).forEach((panel) => {
      const mesh = addRoofRect(
        group,
        building,
        surface,
        panel,
        affected.has(`${panelGroup.id}:${panel.id}`) ? shadedMaterial : panelMaterials[groupIndex % panelMaterials.length],
        0.12
      );
      mesh.renderOrder = 5;
    });
  });

  (obstacles || []).forEach((obstacle) => {
    const surface = surfaceById[obstacle.roofSurfaceId];
    if (!surface) return;
    const base = roofPoint(building, surface, obstacle.xM, obstacle.yM, 0.3);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.15, safeNumber(obstacle.widthM, 0.5)), Math.max(0.15, safeNumber(obstacle.heightM, 1)), Math.max(0.15, safeNumber(obstacle.depthM, 0.5))),
      obstacleMaterial
    );
    mesh.position.set(base.x + safeNumber(obstacle.widthM, 0.5) / 2, base.y + safeNumber(obstacle.heightM, 1) / 2, base.z + safeNumber(obstacle.depthM, 0.5) / 2);
    mesh.castShadow = true;
    group.add(mesh);
  });

  if (shadingAnalysis?.sun) {
    const az = degToRad(shadingAnalysis.sun.azimuthDeg);
    const start = new THREE.Vector3(-13, 13, -12);
    const end = new THREE.Vector3(start.x + Math.sin(az) * 6, start.y - 3, start.z + Math.cos(az) * 6);
    addLine(group, [start, end], 0xf59e0b);
  }
}

function buildModel(group, { building, roofSurfaces, panelGroups, obstacles, shadingAnalysis }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4.2));
  const pitch = Math.max(0, Math.min(75, safeNumber(building.roofPitchDeg, 27)));
  const roofType = building.roofType || 'gable';
  const halfL = length / 2;
  const halfW = width / 2;
  const rise = roofType === 'flat' ? 0.18 : Math.tan(degToRad(pitch)) * halfW;

  addSitePlane(group);
  addContextBuildings(group, length, width, height);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d9d4, roughness: 0.88, metalness: 0.04 });
  const wallAccentMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc4bf, roughness: 0.9, metalness: 0.03 });
  const roofMaterialA = new THREE.MeshStandardMaterial({ color: 0x9ea7ad, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
  const roofMaterialB = new THREE.MeshStandardMaterial({ color: 0x89939b, roughness: 0.8, metalness: 0.07, side: THREE.DoubleSide });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x64707a, roughness: 0.78 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), wallMaterial);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(length + 0.18, 0.16, width + 0.18), wallAccentMaterial);
  plinth.position.y = 0.08;
  group.add(plinth);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 })
  );
  edges.position.copy(body.position);
  group.add(edges);

  if (roofType === 'flat') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 0.32, 0.24, width + 0.32), roofMaterialA);
    roof.position.y = height + 0.12;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    addRoofOverlays(group, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
    return;
  }

  if (roofType === 'single_slope') {
    const lowLeft = new THREE.Vector3(-halfL - 0.12, height, -halfW - 0.12);
    const lowRight = new THREE.Vector3(halfL + 0.12, height, -halfW - 0.12);
    const highRight = new THREE.Vector3(halfL + 0.12, height + rise * 2, halfW + 0.12);
    const highLeft = new THREE.Vector3(-halfL - 0.12, height + rise * 2, halfW + 0.12);
    addQuad(group, [lowLeft, lowRight, highRight, highLeft], roofMaterialA);
    addLine(group, [highLeft, highRight], 0x0ea5e9, 0.85);
    addRoofOverlays(group, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
    return;
  }

  if (roofType === 'hip') {
    const ridgeInset = Math.min(halfL * 0.7, halfW);
    const ridgeA = new THREE.Vector3(-halfL + ridgeInset, height + rise, 0);
    const ridgeB = new THREE.Vector3(halfL - ridgeInset, height + rise, 0);
    const c1 = new THREE.Vector3(-halfL - 0.12, height, -halfW - 0.12);
    const c2 = new THREE.Vector3(halfL + 0.12, height, -halfW - 0.12);
    const c3 = new THREE.Vector3(halfL + 0.12, height, halfW + 0.12);
    const c4 = new THREE.Vector3(-halfL - 0.12, height, halfW + 0.12);
    addQuad(group, [c1, c2, ridgeB, ridgeA], roofMaterialA);
    addQuad(group, [c4, ridgeA, ridgeB, c3], roofMaterialB);
    addTriangle(group, [c1, ridgeA, c4], roofMaterialB);
    addTriangle(group, [c2, c3, ridgeB], roofMaterialA);
    addLine(group, [ridgeA, ridgeB], 0x0ea5e9, 0.9);
    addRoofOverlays(group, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
    return;
  }

  const ridgeLeft = new THREE.Vector3(-halfL - 0.12, height + rise, 0);
  const ridgeRight = new THREE.Vector3(halfL + 0.12, height + rise, 0);
  const eaveA1 = new THREE.Vector3(-halfL - 0.12, height, -halfW - 0.12);
  const eaveA2 = new THREE.Vector3(halfL + 0.12, height, -halfW - 0.12);
  const eaveB1 = new THREE.Vector3(-halfL - 0.12, height, halfW + 0.12);
  const eaveB2 = new THREE.Vector3(halfL + 0.12, height, halfW + 0.12);
  addQuad(group, [eaveA1, eaveA2, ridgeRight, ridgeLeft], roofMaterialA);
  addQuad(group, [eaveB1, ridgeLeft, ridgeRight, eaveB2], roofMaterialB);
  addTriangle(group, [new THREE.Vector3(-halfL, height, -halfW), ridgeLeft, new THREE.Vector3(-halfL, height, halfW)], trimMaterial);
  addTriangle(group, [new THREE.Vector3(halfL, height, -halfW), new THREE.Vector3(halfL, height, halfW), ridgeRight], trimMaterial);
  addLine(group, [ridgeLeft, ridgeRight], 0x0ea5e9, 0.9);
  addRoofOverlays(group, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
}

function fitCamera(camera, controls, building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4.2));
  const distance = Math.max(22, Math.max(length, width) * 2.1);
  camera.position.set(distance * 0.62, Math.max(10, height * 2.6), distance * 0.78);
  controls.target.set(0, Math.max(1.5, height * 0.55), 0);
  controls.update();
}

export default function Project3DBuildingPreview({ building, roofSurfaces, panelGroups = [], obstacles = [], shadingAnalysis = null }) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM, 0) * safeNumber(surface.heightM, 0), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2, 0), 0);
    return { roofArea, usableArea };
  }, [roofSurfaces]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf0f4);
    scene.fog = new THREE.Fog(0xeaf0f4, 42, 115);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 7;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2.02;

    const ambient = new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.45);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.35);
    sun.position.set(-12, 24, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    scene.add(sun);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      runtimeRef.current.frame = requestAnimationFrame(animate);
    };

    runtimeRef.current = { scene, camera, renderer, controls, modelGroup, frame: 0 };
    resize();
    fitCamera(camera, controls, building);
    animate();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(runtimeRef.current?.frame);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { modelGroup, camera, controls } = runtime;
    modelGroup.clear();
    buildModel(modelGroup, { building, roofSurfaces, panelGroups, obstacles, shadingAnalysis });
    fitCamera(camera, controls, building);
  }, [building, roofSurfaces, panelGroups, obstacles, shadingAnalysis]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-xl border bg-slate-950 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-cyan-700">Ortofoto-vy</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Byggnad</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Paneler</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Skuggning</span>
          </div>
          <span className="text-slate-500">Rotera · Panorera · Zooma</span>
        </div>
        <div ref={containerRef} className="h-[520px] w-full" aria-label="Interaktiv 3D-projekteringsvy med byggnad, tak, paneler och platsplan" />
      </div>
      <aside className="rounded-xl border bg-background p-4">
        <div className="mb-4">
          <h3 className="font-semibold">Takyteberäkning</h3>
          <p className="text-sm text-muted-foreground">Projekteringsvy med ortofoto-känsla, byggnadsmassa, takytor och panelplacering.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Total takyta</div>
            <div className="text-lg font-bold">{totals.roofArea.toFixed(1)} m²</div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Användbar yta</div>
            <div className="text-lg font-bold">{totals.usableArea.toFixed(1)} m²</div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {roofSurfaces.map((surface) => (
            <div key={surface.id} className="rounded-lg border p-3 text-sm">
              <div className="font-semibold">{surface.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Orientering</span><b className="text-right text-foreground">{surface.orientationDeg}°</b>
                <span>Lutning</span><b className="text-right text-foreground">{surface.tiltDeg}°</b>
                <span>Mått</span><b className="text-right text-foreground">{surface.widthM} x {surface.heightM} m</b>
                <span>Användbar yta</span><b className="text-right text-foreground">{surface.usableAreaM2} m²</b>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
