// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const OVERRIDE_KEY = 'solarplan-3d-transform-overrides:v1';
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rad = (deg) => (deg * Math.PI) / 180;
const round = (value, digits = 3) => Math.round(n(value) * 10 ** digits) / 10 ** digits;

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); } catch { return {}; }
}

function saveOverrides(value) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(value || {}));
}

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.08, ...options });
}

function lineMat(color, opacity = 1) {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
}

function labelSprite(text, { color = '#0f172a', bg = 'rgba(255,255,255,0.88)', border = '#94a3b8', scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 360 * dpr;
  canvas.height = 92 * dpr;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(8, 16, 344, 54, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '900 22px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || ''), 180, 43);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.8 * scale, 1.0 * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function addEdges(group, mesh, color = 0x0f172a, opacity = 0.7) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const line = new THREE.LineSegments(edges, lineMat(color, opacity));
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  group.add(line);
  return line;
}

function addLine(group, points, color = 0xf59e0b, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, lineMat(color, opacity));
  group.add(line);
  return line;
}

function addDimension(group, from, to, label, color = 0xf59e0b) {
  addLine(group, [from, to], color, 0.95);
  const sprite = labelSprite(label, { color: '#78350f', bg: 'rgba(255,247,237,0.92)', border: '#f59e0b', scale: 0.72 });
  sprite.position.copy(from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.45, 0)));
  group.add(sprite);
}

function gableRoofGeometry(length, width, eaveY, rise) {
  const l = length / 2;
  const w = width / 2;
  const vertices = new Float32Array([
    -l, eaveY, w, l, eaveY, w, l, eaveY + rise, 0, -l, eaveY + rise, 0,
    -l, eaveY + rise, 0, l, eaveY + rise, 0, l, eaveY, -w, -l, eaveY, -w,
    -l, eaveY, -w, -l, eaveY, w, -l, eaveY + rise, 0,
    l, eaveY, w, l, eaveY, -w, l, eaveY + rise, 0,
  ]);
  const indices = [0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,11,12,13];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roofSide(roofSurfaces, roofSurfaceId) {
  const index = roofSurfaces.findIndex((surface) => surface.id === roofSurfaceId);
  if (String(roofSurfaceId || '').includes('-b') || index % 2 === 1) return -1;
  return 1;
}

function panelDims(panelModel, orientation) {
  const w = n(panelModel?.widthMm, 1134) / 1000;
  const h = n(panelModel?.heightMm, 1722) / 1000;
  return orientation === 'landscape' ? { w: h, h: w } : { w, h };
}

function panelsFromGroup(group, panelModel) {
  if (Array.isArray(group?.panels) && group.panels.length > 0) return group.panels;
  const rows = Math.max(0, Math.round(n(group?.rows, 0)));
  const columns = Math.max(0, Math.round(n(group?.columns, 0)));
  const spacing = n(group?.spacingMm, 30) / 1000;
  const dims = panelDims(panelModel, group?.orientation);
  const panels = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      panels.push({
        id: `${group.id}-${row + 1}-${col + 1}`,
        row: row + 1,
        column: col + 1,
        xM: round(n(group.startXM, 0.7) + col * (dims.w + spacing)),
        yM: round(n(group.startYM, 0.7) + row * (dims.h + spacing)),
        widthM: round(dims.w),
        heightM: round(dims.h),
      });
    }
  }
  return panels;
}

function roofPoint({ building, roofSurfaces, roofSurfaceId, xM, yM, pitchRad, roofRise }) {
  const length = Math.max(1, n(building.lengthM, 12));
  const width = Math.max(1, n(building.widthM, 8));
  const eaveY = Math.max(1, n(building.heightM, 4));
  const side = roofSide(roofSurfaces, roofSurfaceId);
  if (building.roofType === 'flat') {
    return { position: new THREE.Vector3(-length / 2 + xM, eaveY + 0.38, -width / 2 + yM), rotationX: 0, side };
  }
  const run = Math.max(0, yM) * Math.cos(pitchRad);
  const drop = Math.max(0, yM) * Math.sin(pitchRad);
  return { position: new THREE.Vector3(-length / 2 + xM, eaveY + roofRise - drop + 0.08, side * run), rotationX: side * pitchRad, side };
}

function selectable(data) {
  return { selectable: true, ...data };
}

function findSelectable(object, selectionMode) {
  let node = object;
  while (node) {
    if (node.userData?.selectable) {
      if (selectionMode === 'single' && node.userData.type === 'panel') return node;
      if (selectionMode === 'group' && node.userData.type === 'panel') {
        let parent = node.parent;
        while (parent && parent.userData?.type !== 'panelGroup') parent = parent.parent;
        return parent || node;
      }
      if (['panelGroup', 'obstacle', 'previewObstacle'].includes(node.userData.type)) return node;
    }
    node = node.parent;
  }
  return null;
}

function createBoxHelper(object, color) {
  const helper = new THREE.BoxHelper(object, color);
  helper.material.depthTest = false;
  helper.material.transparent = true;
  helper.material.opacity = 0.95;
  helper.renderOrder = 998;
  return helper;
}

function applyRoofSnap(object, startPos) {
  if (!object || !startPos) return;
  if (object.userData?.type === 'panelGroup') {
    object.position.y = 0;
    return;
  }
  if (['panel', 'obstacle'].includes(object.userData?.type)) {
    const dz = object.position.z - startPos.z;
    object.position.y = startPos.y - Math.abs(dz) * 0.42;
  }
}

function buildModel(group, { building, roofSurfaces, panelGroups, obstacles, panelModel, overrides }) {
  group.clear();
  const length = Math.max(1, n(building.lengthM, 12));
  const width = Math.max(1, n(building.widthM, 8));
  const eaveY = Math.max(1, n(building.heightM, 4));
  const pitch = clamp(n(building.roofPitchDeg, 27), 0, 75);
  const pitchRad = rad(pitch);
  const roofRise = building.roofType === 'flat' ? 0.18 : Math.max(0.28, Math.tan(pitchRad) * (width / 2));

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(length + 0.6, 0.18, width + 0.6), mat(0xd7dee8));
  foundation.position.y = 0.09;
  foundation.receiveShadow = true;
  group.add(foundation);

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, eaveY, width), [mat(0xcbd5e1), mat(0xcbd5e1), mat(0xf8fafc), mat(0xf8fafc), mat(0xe2e8f0), mat(0xe2e8f0)]);
  body.position.y = eaveY / 2 + 0.18;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  addEdges(group, body, 0x334155, 0.6);

  const roofGeometry = building.roofType === 'flat'
    ? new THREE.BoxGeometry(length + 0.55, 0.25, width + 0.55).translate(0, eaveY + 0.31, 0)
    : gableRoofGeometry(length + 0.55, width + 0.55, eaveY + 0.18, roofRise);
  const roof = new THREE.Mesh(roofGeometry, mat(0x475569, { side: THREE.DoubleSide }));
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  addEdges(group, roof, 0xf8fafc, 0.45);

  if (building.roofType !== 'flat') {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 0.7, 0.08, 0.12), mat(0xf59e0b, { metalness: 0.25 }));
    ridge.position.set(0, eaveY + 0.18 + roofRise + 0.035, 0);
    group.add(ridge);
  }

  const panelMats = [mat(0x0b3b75, { roughness: 0.24, metalness: 0.44 }), mat(0x1e40af, { roughness: 0.24, metalness: 0.42 }), mat(0x155e75, { roughness: 0.24, metalness: 0.38 })];
  const renderGroups = panelGroups?.some((item) => panelsFromGroup(item, panelModel).length)
    ? panelGroups
    : [{ id: 'preview-panel-group', name: 'Förhandsvisning', roofSurfaceId: roofSurfaces[0]?.id, rows: 2, columns: 6, startXM: 0.8, startYM: 0.7, spacingMm: 40 }];

  renderGroups.forEach((panelGroup, groupIndex) => {
    const node = new THREE.Group();
    const ov = overrides?.groups?.[panelGroup.id] || {};
    node.position.set(n(ov.dx, 0), 0, n(ov.dz, 0));
    node.userData = selectable({ type: 'panelGroup', groupId: panelGroup.id, roofSurfaceId: panelGroup.roofSurfaceId, label: panelGroup.name || `Panelgrupp ${groupIndex + 1}` });
    group.add(node);

    panelsFromGroup(panelGroup, panelModel).slice(0, 260).forEach((panel) => {
      const pOv = overrides?.panels?.[panel.id] || {};
      const w = Math.max(0.45, n(panel.widthM, 1.13));
      const h = Math.max(0.7, n(panel.heightM, 1.72));
      const placed = roofPoint({ building, roofSurfaces, roofSurfaceId: panelGroup.roofSurfaceId, xM: n(panel.xM) + w / 2 + n(pOv.dx, 0), yM: n(panel.yM) + h / 2 + Math.abs(n(pOv.dz, 0)), pitchRad, roofRise });
      if (building.roofType !== 'flat' && (Math.abs(placed.position.z) > width / 2 + 0.45 || placed.position.x < -length / 2 - 0.5 || placed.position.x > length / 2 + 0.5)) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), panelMats[groupIndex % panelMats.length]);
      mesh.position.copy(placed.position);
      mesh.rotation.x = placed.rotationX;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = selectable({ type: 'panel', groupId: panelGroup.id, panelId: panel.id, row: panel.row, column: panel.column, roofSurfaceId: panelGroup.roofSurfaceId, side: placed.side, label: `${panelGroup.name || 'Panelgrupp'} ${panel.row}:${panel.column}` });
      node.add(mesh);
      addEdges(node, mesh, 0x93c5fd, 0.65);
    });
  });

  const obstacleMat = mat(0xdc2626, { emissive: 0x450a0a, emissiveIntensity: 0.12 });
  (obstacles || []).forEach((obstacle) => {
    const ov = overrides?.obstacles?.[obstacle.id] || {};
    const w = Math.max(0.2, n(obstacle.widthM, 0.6));
    const h = Math.max(0.2, n(obstacle.heightM, 0.8));
    const d = Math.max(0.2, n(obstacle.depthM, 0.6));
    const placed = roofPoint({ building, roofSurfaces, roofSurfaceId: obstacle.roofSurfaceId || roofSurfaces[0]?.id, xM: n(obstacle.xM, length / 2) + w / 2 + n(ov.dx, 0), yM: n(obstacle.yM, 1) + d / 2 + Math.abs(n(ov.dz, 0)), pitchRad, roofRise });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), obstacleMat);
    mesh.position.copy(placed.position).add(new THREE.Vector3(0, h / 2 + 0.02, 0));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = selectable({ type: 'obstacle', obstacleId: obstacle.id, roofSurfaceId: obstacle.roofSurfaceId || roofSurfaces[0]?.id, side: placed.side, label: obstacle.name || 'Hinder' });
    group.add(mesh);
    addEdges(group, mesh, 0xfee2e2, 0.8);
    const sprite = labelSprite(obstacle.name || 'Hinder', { color: '#7f1d1d', bg: 'rgba(254,242,242,0.92)', border: '#ef4444', scale: 0.58 });
    sprite.position.copy(mesh.position).add(new THREE.Vector3(0, h / 2 + 0.65, 0));
    group.add(sprite);
  });

  addDimension(group, new THREE.Vector3(-length / 2, 0.08, width / 2 + 1.1), new THREE.Vector3(length / 2, 0.08, width / 2 + 1.1), `${round(length, 1)} m längd`);
  addDimension(group, new THREE.Vector3(length / 2 + 1.1, 0.08, -width / 2), new THREE.Vector3(length / 2 + 1.1, 0.08, width / 2), `${round(width, 1)} m bredd`);
  addDimension(group, new THREE.Vector3(-length / 2 - 0.7, 0, -width / 2 - 0.7), new THREE.Vector3(-length / 2 - 0.7, eaveY, -width / 2 - 0.7), `${round(eaveY, 1)} m takfot`, 0x0ea5e9);
  addDimension(group, new THREE.Vector3(0, eaveY, 0), new THREE.Vector3(0, eaveY + roofRise, 0), `${round(eaveY + roofRise, 1)} m nock`, 0xf59e0b);

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(-0.55, -0.72, -0.42).normalize(), new THREE.Vector3(length / 2 + 3.2, eaveY + 5.5, width / 2 + 3.5), 5.8, 0xfacc15, 0.8, 0.42);
  group.add(arrow);
}

function fitCamera(camera, controls, building) {
  const length = Math.max(1, n(building.lengthM, 12));
  const width = Math.max(1, n(building.widthM, 8));
  const height = Math.max(1, n(building.heightM, 4));
  const distance = Math.max(16, Math.max(length, width) * 1.9);
  camera.position.set(distance * 0.72, Math.max(9, height * 2.9), distance * 0.86);
  controls.target.set(0, height * 0.82, 0);
  controls.update();
}

export default function Project3DBuildingPreview({ building = {}, roofSurfaces = [], panelGroups = [], obstacles = [], panelModel = null, onObjectTransform = null, photoOverlay = null }) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);
  const callbackRef = useRef(onObjectTransform);
  const [selectionMode, setSelectionMode] = useState('group');
  const [activeInfo, setActiveInfo] = useState(null);
  const [overrides, setOverrides] = useState(() => loadOverrides());

  useEffect(() => { callbackRef.current = onObjectTransform; }, [onObjectTransform]);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + n(surface.widthM) * n(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + n(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, item) => sum + n(item.panelCount, panelsFromGroup(item, panelModel).length), 0);
    return { roofArea, usableArea, panelCount, obstacleCount: obstacles.length };
  }, [roofSurfaces, panelGroups, obstacles, panelModel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI / 2 - 0.035;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('translate');
    transformControls.setSize(0.9);
    scene.add(transformControls);
    transformControls.addEventListener('dragging-changed', (event) => { controls.enabled = !event.value; });
    transformControls.addEventListener('objectChange', () => {
      const runtime = runtimeRef.current;
      if (!runtime?.selectedObject || !runtime?.selectionStart) return;
      applyRoofSnap(runtime.selectedObject, runtime.selectionStart.position);
      runtime.selectionBox?.update?.();
    });
    transformControls.addEventListener('mouseUp', () => {
      const runtime = runtimeRef.current;
      const object = runtime?.selectedObject;
      const start = runtime?.selectionStart;
      if (!object || !start) return;
      const delta = object.position.clone().sub(start.position);
      const type = object.userData?.type;
      const id = object.userData?.groupId || object.userData?.panelId || object.userData?.obstacleId;
      const section = type === 'panelGroup' ? 'groups' : type === 'panel' ? 'panels' : type === 'obstacle' ? 'obstacles' : 'other';
      const next = { ...loadOverrides() };
      next[section] = { ...(next[section] || {}) };
      next[section][id] = {
        dx: round(n(next[section][id]?.dx, 0) + delta.x),
        dz: round(n(next[section][id]?.dz, 0) + delta.z),
      };
      saveOverrides(next);
      setOverrides(next);
      callbackRef.current?.({ type, id, userData: object.userData, delta: { x: delta.x, y: delta.y, z: delta.z } });
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0xdbeafe, 0.86));
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const sun = new THREE.DirectionalLight(0xfff7d6, 2.2);
    sun.position.set(15, 25, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.92, metalness: 0.03 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(70, 70, 0x94a3b8, 0xd7dee8);
    grid.position.y = 0.012;
    scene.add(grid);
    const majorGrid = new THREE.GridHelper(70, 14, 0xf59e0b, 0xb6c2d3);
    majorGrid.material.opacity = 0.28;
    majorGrid.material.transparent = true;
    majorGrid.position.y = 0.016;
    scene.add(majorGrid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const clearSelection = () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      transformControls.detach();
      if (runtime.selectionBox) scene.remove(runtime.selectionBox);
      runtime.selectionBox = null;
      runtime.selectedObject = null;
      runtime.selectionStart = null;
      setActiveInfo(null);
    };

    const selectObject = (object) => {
      const runtime = runtimeRef.current;
      if (!runtime || !object) return;
      if (runtime.selectionBox) scene.remove(runtime.selectionBox);
      runtime.selectedObject = object;
      runtime.selectionStart = { position: object.position.clone() };
      runtime.selectionBox = createBoxHelper(object, object.userData?.type === 'obstacle' ? 0xef4444 : 0xf59e0b);
      scene.add(runtime.selectionBox);
      transformControls.attach(object);
      setActiveInfo({ type: object.userData?.type, label: object.userData?.label || object.name || 'Objekt', id: object.userData?.groupId || object.userData?.panelId || object.userData?.obstacleId });
    };

    const handlePointerDown = (event) => {
      if (transformControls.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const runtime = runtimeRef.current;
      const hits = raycaster.intersectObjects(runtime.modelGroup.children, true);
      const hit = hits.map((item) => findSelectable(item.object, runtime.selectionMode)).find(Boolean);
      if (hit) selectObject(hit);
      else clearSelection();
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    const animate = () => {
      if (!runtimeRef.current) return;
      controls.update();
      runtimeRef.current.selectionBox?.update?.();
      renderer.render(scene, camera);
      runtimeRef.current.frame = requestAnimationFrame(animate);
    };

    runtimeRef.current = { scene, camera, renderer, controls, transformControls, modelGroup, raycaster, pointer, frame: 0, selectedObject: null, selectionBox: null, selectionStart: null, selectionMode };
    resize();
    fitCamera(camera, controls, building || {});
    animate();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimationFrame(runtimeRef.current?.frame);
      transformControls.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.selectionMode = selectionMode;
    runtime.transformControls.detach();
    if (runtime.selectionBox) runtime.scene.remove(runtime.selectionBox);
    runtime.selectionBox = null;
    runtime.selectedObject = null;
    runtime.selectionStart = null;
    setActiveInfo(null);
  }, [selectionMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.transformControls.detach();
    if (runtime.selectionBox) runtime.scene.remove(runtime.selectionBox);
    runtime.selectionBox = null;
    runtime.selectedObject = null;
    runtime.selectionStart = null;
    setActiveInfo(null);
    buildModel(runtime.modelGroup, { building: building || {}, roofSurfaces, panelGroups, obstacles, panelModel, overrides });
    fitCamera(runtime.camera, runtime.controls, building || {});
  }, [building, roofSurfaces, panelGroups, obstacles, panelModel, overrides]);

  const clearTransformOverrides = () => {
    saveOverrides({});
    setOverrides({});
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Open Source CAD-vy</div>
            <div className="text-sm font-black">Three.js · TransformControls · grupp/enkel panel · bounding box</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSelectionMode('group')} className={`rounded-full border px-3 py-1 text-xs font-black ${selectionMode === 'group' ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Grupp</button>
            <button type="button" onClick={() => setSelectionMode('single')} className={`rounded-full border px-3 py-1 text-xs font-black ${selectionMode === 'single' ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>En panel</button>
            <button type="button" onClick={clearTransformOverrides} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-black text-slate-300">Nollställ dragning</button>
          </div>
        </div>
        <div className="relative">
          {photoOverlay?.url && <img src={photoOverlay.url} alt="Bakgrundsbild för perspektivmatchning" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-30 mix-blend-multiply" />}
          <div ref={containerRef} className="h-[680px] w-full" />
        </div>
      </div>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-slate-100">
        <h3 className="font-black">3D kontroll</h3>
        <p className="mt-1 text-sm text-slate-400">Klicka panelgrupp, enskild panel eller hinder. Vald geometri visas med bounding box och kan flyttas med TransformControls.</p>
        {activeInfo && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm"><div className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Aktivt objekt</div><div className="mt-1 font-black">{activeInfo.label}</div><div className="text-xs text-slate-400">Typ: {activeInfo.type} · ID: {activeInfo.id}</div></div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Total takyta</div><div className="text-lg font-black">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Användbar yta</div><div className="text-lg font-black">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Paneler</div><div className="text-lg font-black">{totals.panelCount}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">Hinder</div><div className="text-lg font-black">{totals.obstacleCount}</div></div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">3D-dragningar sparas lokalt som transform-overrides. Nästa steg är att mappa dem direkt till projektets sparbara panel-/hinderdata.</div>
      </aside>
    </div>
  );
}
