// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degToRad = (value) => (value * Math.PI) / 180;
const round = (value, digits = 1) => Math.round(safeNumber(value, 0) * 10 ** digits) / 10 ** digits;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08, ...options });
}

function lineMaterial(color, opacity = 1) {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
}

function createLabelSprite(text, { color = '#e2e8f0', background = 'rgba(15,23,42,0.86)', border = '#334155', scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 340 * dpr;
  canvas.height = 90 * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 340, 90);
  ctx.fillStyle = background;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(8, 14, 324, 52, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '900 22px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 170, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.7 * scale, 1 * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function addEdges(group, mesh, color = 0x0f172a, opacity = 0.75) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const line = new THREE.LineSegments(edges, lineMaterial(color, opacity));
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  group.add(line);
  return line;
}

function addLine(group, points, color = 0xfbbf24, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, lineMaterial(color, opacity));
  group.add(line);
  return line;
}

function addDimension(group, from, to, label, offset = new THREE.Vector3(0, 0.06, 0), color = 0xfbbf24) {
  const start = from.clone().add(offset);
  const end = to.clone().add(offset);
  addLine(group, [start, end], color, 0.95);
  const mid = start.clone().lerp(end, 0.5);
  const sprite = createLabelSprite(label, { color: '#fef3c7', background: 'rgba(120,53,15,0.72)', border: '#f59e0b', scale: 0.78 });
  sprite.position.copy(mid.add(new THREE.Vector3(0, 0.45, 0)));
  group.add(sprite);
}

function createGableRoofGeometry(length, width, eaveHeight, roofRise) {
  const hL = length / 2;
  const hW = width / 2;
  const vertices = new Float32Array([
    -hL, eaveHeight, hW,
     hL, eaveHeight, hW,
     hL, eaveHeight + roofRise, 0,
    -hL, eaveHeight + roofRise, 0,

    -hL, eaveHeight + roofRise, 0,
     hL, eaveHeight + roofRise, 0,
     hL, eaveHeight, -hW,
    -hL, eaveHeight, -hW,

    -hL, eaveHeight, -hW,
    -hL, eaveHeight, hW,
    -hL, eaveHeight + roofRise, 0,

     hL, eaveHeight, hW,
     hL, eaveHeight, -hW,
     hL, eaveHeight + roofRise, 0,
  ]);
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFlatRoofGeometry(length, width, eaveHeight) {
  const geometry = new THREE.BoxGeometry(length, 0.25, width);
  geometry.translate(0, eaveHeight + 0.13, 0);
  return geometry;
}

function roofSideForSurface(roofSurfaces, roofSurfaceId) {
  const index = roofSurfaces.findIndex((surface) => surface.id === roofSurfaceId);
  if (String(roofSurfaceId || '').includes('-b') || String(roofSurfaceId || '').includes('270') || index % 2 === 1) return -1;
  return 1;
}

function panelDimensions(panelModel, orientation) {
  const widthM = safeNumber(panelModel?.widthMm, 1134) / 1000;
  const heightM = safeNumber(panelModel?.heightMm, 1722) / 1000;
  if (orientation === 'landscape') return { widthM: heightM, heightM: widthM };
  return { widthM, heightM };
}

function panelsFromGroup(group, panelModel) {
  if (Array.isArray(group.panels) && group.panels.length > 0) return group.panels;
  const rows = Math.max(0, Math.round(safeNumber(group.rows, 0)));
  const columns = Math.max(0, Math.round(safeNumber(group.columns, 0)));
  const spacingM = safeNumber(group.spacingMm, 30) / 1000;
  const dims = panelDimensions(panelModel, group.orientation);
  const panels = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      panels.push({
        id: `${group.id}-${row + 1}-${column + 1}`,
        row: row + 1,
        column: column + 1,
        xM: round(safeNumber(group.startXM, 0.5) + column * (dims.widthM + spacingM), 3),
        yM: round(safeNumber(group.startYM, 0.5) + row * (dims.heightM + spacingM), 3),
        widthM: round(dims.widthM, 3),
        heightM: round(dims.heightM, 3),
      });
    }
  }
  return panels;
}

function roofPoint({ building, roofSurfaces, roofSurfaceId, xOnSurfaceM, yOnSurfaceM, pitchRad, roofRise }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const roofType = building.roofType || 'gable';
  const side = roofSideForSurface(roofSurfaces, roofSurfaceId);

  if (roofType === 'flat') {
    return {
      position: new THREE.Vector3(
        -length / 2 + xOnSurfaceM,
        eaveHeight + 0.34,
        -width / 2 + yOnSurfaceM
      ),
      rotationX: 0,
      side,
    };
  }

  const distanceDownSlope = Math.max(0, yOnSurfaceM);
  const horizontalRun = distanceDownSlope * Math.cos(pitchRad);
  const verticalDrop = distanceDownSlope * Math.sin(pitchRad);
  return {
    position: new THREE.Vector3(
      -length / 2 + xOnSurfaceM,
      eaveHeight + roofRise - verticalDrop + 0.08,
      side * horizontalRun
    ),
    rotationX: side * pitchRad,
    side,
  };
}

function addPanelsToRoof(group, { building, roofSurfaces, panelGroups, panelModel, pitchRad, roofRise }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const roofType = building.roofType || 'gable';
  const panelMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x0b3b75, roughness: 0.24, metalness: 0.46, emissive: 0x020617, emissiveIntensity: 0.15 }),
    new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.26, metalness: 0.42, emissive: 0x020617, emissiveIntensity: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0x155e75, roughness: 0.28, metalness: 0.38, emissive: 0x020617, emissiveIntensity: 0.1 }),
  ];
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.35, metalness: 0.65 });
  const hasAnyPanels = panelGroups.some((panelGroup) => panelsFromGroup(panelGroup, panelModel).length > 0);
  const renderGroups = hasAnyPanels ? panelGroups : [{ id: 'preview-group', roofSurfaceId: roofSurfaces[0]?.id, orientation: 'portrait', rows: 2, columns: 6, startXM: 0.9, startYM: 0.7, spacingMm: 40, name: 'Förhandsvisning' }];

  renderGroups.forEach((panelGroup, groupIndex) => {
    const panels = panelsFromGroup(panelGroup, panelModel).slice(0, 220);
    panels.forEach((panel, panelIndex) => {
      const panelW = Math.max(0.45, safeNumber(panel.widthM, 1.13));
      const panelH = Math.max(0.7, safeNumber(panel.heightM, 1.72));
      const xCenter = safeNumber(panel.xM, 0) + panelW / 2;
      const yCenter = safeNumber(panel.yM, 0) + panelH / 2;
      const placed = roofPoint({ building, roofSurfaces, roofSurfaceId: panelGroup.roofSurfaceId, xOnSurfaceM: xCenter, yOnSurfaceM: yCenter, pitchRad, roofRise });
      if (roofType !== 'flat') {
        const maxRun = width / 2 + 0.25;
        if (Math.abs(placed.position.z) > maxRun || placed.position.x < -length / 2 - 0.5 || placed.position.x > length / 2 + 0.5) return;
      }

      const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.045, panelH), panelMaterials[groupIndex % panelMaterials.length]);
      panelMesh.position.copy(placed.position);
      panelMesh.rotation.x = placed.rotationX;
      panelMesh.castShadow = true;
      panelMesh.receiveShadow = true;
      group.add(panelMesh);
      addEdges(group, panelMesh, 0x93c5fd, 0.65);

      if (panelIndex % Math.max(1, Math.ceil(panels.length / 16)) === 0) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.035, 0.03, 0.035), frameMaterial);
        frame.position.copy(placed.position).add(new THREE.Vector3(0, 0.035, 0));
        frame.rotation.copy(panelMesh.rotation);
        group.add(frame);
      }
    });
  });
}

function addObstacles(group, { building, obstacles, roofSurfaces, pitchRad, roofRise }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5, metalness: 0.08, emissive: 0x450a0a, emissiveIntensity: 0.18 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });

  (obstacles || []).forEach((obstacle) => {
    const w = Math.max(0.2, safeNumber(obstacle.widthM, 0.6));
    const h = Math.max(0.2, safeNumber(obstacle.heightM, 0.8));
    const d = Math.max(0.2, safeNumber(obstacle.depthM, 0.6));
    const roofAnchor = roofPoint({
      building,
      roofSurfaces,
      roofSurfaceId: obstacle.roofSurfaceId || roofSurfaces[0]?.id,
      xOnSurfaceM: safeNumber(obstacle.xM, length / 2) + w / 2,
      yOnSurfaceM: safeNumber(obstacle.yM, 1) + d / 2,
      pitchRad,
      roofRise,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), obstacleMaterial);
    mesh.position.copy(roofAnchor.position).add(new THREE.Vector3(0, h / 2 + 0.02, 0));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addEdges(group, mesh, 0xfecaca, 0.8);

    const label = createLabelSprite(obstacle.name || 'Hinder', { color: '#fecaca', background: 'rgba(69,10,10,0.84)', border: '#ef4444', scale: 0.62 });
    label.position.copy(mesh.position).add(new THREE.Vector3(0, h / 2 + 0.65, 0));
    group.add(label);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1.2, h * 1.7), Math.max(0.8, d * 2.8)), shadowMaterial);
    shadow.position.copy(roofAnchor.position).add(new THREE.Vector3(-h * 0.55, 0.035, roofAnchor.side * d * 1.25));
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = -0.55;
    group.add(shadow);
  });

  if (!obstacles || obstacles.length === 0) {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), obstacleMaterial);
    chimney.position.set(length * 0.2, eaveHeight + roofRise * 0.74, 0.72);
    chimney.castShadow = true;
    group.add(chimney);
    addEdges(group, chimney, 0xfecaca, 0.65);
  }
}

function addDimensionSystem(group, { building, roofRise }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const y = 0.04;
  addDimension(group, new THREE.Vector3(-length / 2, y, width / 2 + 1.1), new THREE.Vector3(length / 2, y, width / 2 + 1.1), `${round(length, 1)} m längd`);
  addDimension(group, new THREE.Vector3(length / 2 + 1.1, y, -width / 2), new THREE.Vector3(length / 2 + 1.1, y, width / 2), `${round(width, 1)} m bredd`);
  addDimension(group, new THREE.Vector3(-length / 2 - 0.7, 0, -width / 2 - 0.7), new THREE.Vector3(-length / 2 - 0.7, eaveHeight, -width / 2 - 0.7), `${round(eaveHeight, 1)} m takfot`, new THREE.Vector3(0, 0, 0), 0x38bdf8);
  addDimension(group, new THREE.Vector3(0, eaveHeight, 0), new THREE.Vector3(0, eaveHeight + roofRise, 0), `${round(eaveHeight + roofRise, 1)} m nock`, new THREE.Vector3(-0.7, 0, 0), 0xf59e0b);
}

function addCompassAndSun(group, building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const base = new THREE.Vector3(-length / 2 - 3.2, 0.1, width / 2 + 2.4);
  addLine(group, [base, base.clone().add(new THREE.Vector3(0, 0, -2))], 0x38bdf8, 0.95);
  addLine(group, [base, base.clone().add(new THREE.Vector3(2, 0, 0))], 0xfbbf24, 0.95);
  const nLabel = createLabelSprite('N', { color: '#bae6fd', background: 'rgba(8,47,73,0.82)', border: '#38bdf8', scale: 0.55 });
  nLabel.position.copy(base.clone().add(new THREE.Vector3(0, 0.35, -2.35)));
  group.add(nLabel);
  const eLabel = createLabelSprite('E', { color: '#fef3c7', background: 'rgba(120,53,15,0.78)', border: '#f59e0b', scale: 0.55 });
  eLabel.position.copy(base.clone().add(new THREE.Vector3(2.35, 0.35, 0)));
  group.add(eLabel);

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(-0.55, -0.72, -0.42).normalize(), new THREE.Vector3(length / 2 + 3.2, safeNumber(building.heightM, 4) + 5.5, width / 2 + 3.5), 5.8, 0xfacc15, 0.8, 0.42);
  group.add(arrow);
  const sunLabel = createLabelSprite('Solriktning / skugga', { color: '#fef9c3', background: 'rgba(113,63,18,0.78)', border: '#facc15', scale: 0.7 });
  sunLabel.position.set(length / 2 + 2.2, safeNumber(building.heightM, 4) + 6.2, width / 2 + 2.1);
  group.add(sunLabel);
}

function buildModel(group, { building, roofSurfaces, panelGroups, obstacles, panelModel }) {
  group.clear();
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const pitch = clamp(safeNumber(building.roofPitchDeg, 27), 0, 75);
  const pitchRad = degToRad(pitch);
  const roofType = building.roofType || 'gable';
  const roofRise = roofType === 'flat' ? 0.16 : Math.max(0.28, Math.tan(pitchRad) * (width / 2));

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(length + 0.5, 0.18, width + 0.5), material(0x1e293b));
  foundation.position.y = 0.09;
  foundation.receiveShadow = true;
  group.add(foundation);

  const wallMaterial = material(0xe5e7eb, { roughness: 0.82, metalness: 0.02 });
  const sideWallMaterial = material(0xcbd5e1, { roughness: 0.8, metalness: 0.02 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, eaveHeight, width), [sideWallMaterial, sideWallMaterial, wallMaterial, wallMaterial, wallMaterial, wallMaterial]);
  body.position.y = eaveHeight / 2 + 0.18;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  addEdges(group, body, 0x0f172a, 0.55);

  const roofMaterial = material(0x334155, { roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  const roofGeometry = roofType === 'flat'
    ? createFlatRoofGeometry(length + 0.5, width + 0.5, eaveHeight + 0.18)
    : createGableRoofGeometry(length + 0.5, width + 0.5, eaveHeight + 0.18, roofRise);
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  addEdges(group, roof, 0xf8fafc, 0.42);

  const ridgeMaterial = material(0xf59e0b, { roughness: 0.45, metalness: 0.35, emissive: 0x451a03, emissiveIntensity: 0.15 });
  if (roofType !== 'flat') {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 0.68, 0.08, 0.12), ridgeMaterial);
    ridge.position.set(0, eaveHeight + 0.18 + roofRise + 0.035, 0);
    ridge.castShadow = true;
    group.add(ridge);
  }

  addPanelsToRoof(group, { building: { ...building, heightM: eaveHeight + 0.18 }, roofSurfaces, panelGroups, panelModel, pitchRad, roofRise });
  addObstacles(group, { building: { ...building, heightM: eaveHeight + 0.18 }, obstacles, roofSurfaces, pitchRad, roofRise });
  addDimensionSystem(group, { building: { ...building, heightM: eaveHeight + 0.18 }, roofRise });
  addCompassAndSun(group, building);
}

function fitCamera(camera, controls, building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4));
  const distance = Math.max(16, Math.max(length, width) * 1.9);
  camera.position.set(distance * 0.72, Math.max(9, height * 2.9), distance * 0.86);
  controls.target.set(0, height * 0.82, 0);
  controls.update();
}

export default function Project3DBuildingPreview({ building, roofSurfaces = [], panelGroups = [], obstacles = [], panelModel = null }) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM) * safeNumber(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, group) => sum + safeNumber(group.panelCount, panelsFromGroup(group, panelModel).length), 0);
    const obstacleCount = obstacles.length;
    return { roofArea, usableArea, panelCount, obstacleCount };
  }, [roofSurfaces, panelGroups, obstacles, panelModel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 30, 95);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI / 2 - 0.035;

    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.65));
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const sun = new THREE.DirectionalLight(0xfff7d6, 2.1);
    sun.position.set(15, 25, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 75;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshStandardMaterial({ color: 0x0b1120, roughness: 0.92, metalness: 0.03 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(70, 70, 0x334155, 0x1e293b);
    grid.position.y = 0.012;
    scene.add(grid);

    const majorGrid = new THREE.GridHelper(70, 14, 0xf59e0b, 0x334155);
    majorGrid.material.opacity = 0.18;
    majorGrid.material.transparent = true;
    majorGrid.position.y = 0.016;
    scene.add(majorGrid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      if (!runtimeRef.current) return;
      controls.update();
      renderer.render(scene, camera);
      runtimeRef.current.frame = requestAnimationFrame(animate);
    };

    runtimeRef.current = { scene, camera, renderer, controls, modelGroup, frame: 0 };
    resize();
    fitCamera(camera, controls, building || {});
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
    buildModel(runtime.modelGroup, { building: building || {}, roofSurfaces, panelGroups, obstacles, panelModel });
    fitCamera(runtime.camera, runtime.controls, building || {});
  }, [building, roofSurfaces, panelGroups, obstacles, panelModel]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">AEROTOOL-liknande CAD-vy</div>
            <div className="text-sm font-black">3D projekteringsmodul · takmodell · paneler · hinder · skuggor</div>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">Rotera · Panorera · Zooma</div>
        </div>
        <div ref={containerRef} className="h-[680px] w-full" />
      </div>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-slate-100">
        <h3 className="font-black">3D kontroll</h3>
        <p className="mt-1 text-sm text-slate-400">WebGL-modell från byggnadsmått, takytor, panelgrupper och hinder. Paneler ritas på vald taksida.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Total takyta</div><div className="text-lg font-black">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Användbar yta</div><div className="text-lg font-black">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Paneler</div><div className="text-lg font-black">{totals.panelCount}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Hinder</div><div className="text-lg font-black">{totals.obstacleCount}</div></div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
          Nästa nivå efter detta är riktig raytracing per panel/timme samt ortofoto/kartlager som underlag.
        </div>
      </aside>
    </div>
  );
}
