import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { base44 } from '@/api/base44Client';
import { hydrateProductWithMeta } from '@/lib/productDocuments';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery as BatteryIcon,
  Box,
  Eraser,
  Layers,
  Move,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import ImageCanvas from './ImageCanvas';

const DRAW_WIDTH_M = 10;
const DRAW_DEPTH_M = 8;
const GRID_STEP_M = 0.25;
const NUDGE_STEP_M = 0.05;
const WALL_THICKNESS_M = 0.12;

function createEmptyLayout() {
  return {
    version: 2,
    roomHeight: 2.5,
    walls: [],
    devices: [],
    obstacles: [],
    photoItems: [],
    wallColor: '#94a3b8',
    floorColor: '#e2e8f0',
    savedAt: '',
  };
}

function parseBatteryLayout(raw) {
  const fallback = createEmptyLayout();

  try {
    const parsed = JSON.parse(raw || '');

    if (Array.isArray(parsed)) {
      return { ...fallback, photoItems: parsed };
    }

    if (parsed && typeof parsed === 'object') {
      return {
        ...fallback,
        ...parsed,
        roomHeight: numberOr(parsed.roomHeight, fallback.roomHeight),
        walls: Array.isArray(parsed.walls) ? parsed.walls : [],
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        obstacles: Array.isArray(parsed.obstacles) ? parsed.obstacles : [],
        wallColor: typeof parsed.wallColor === 'string' ? parsed.wallColor : '#94a3b8',
        floorColor: typeof parsed.floorColor === 'string' ? parsed.floorColor : '#e2e8f0',
        photoItems: Array.isArray(parsed.photoItems)
          ? parsed.photoItems
          : Array.isArray(parsed.batteries)
            ? parsed.batteries
            : [],
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dimensionMmToM(value, fallback) {
  return positiveNumberOr(value, fallback * 1000) / 1000;
}

function clearanceMmToM(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number / 1000 : fallback;
}

function snapToGrid(value, step = NUDGE_STEP_M) {
  return Number((Math.round(numberOr(value, 0) / step) * step).toFixed(3));
}

function formatMeters(value, digits = 2) {
  return `${numberOr(value, 0).toFixed(digits)} m`;
}

function shortLabel(text = '', max = 28) {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function productLabel(product = {}) {
  return [product.brand, product.model].filter(Boolean).join(' ') || product.name || 'Produkt';
}

function normalizeCatalogProduct(product = {}) {
  const hydrated = hydrateProductWithMeta(product);
  const isInverter = hydrated.category === 'vaxelriktare';
  const width = dimensionMmToM(hydrated.width_mm, isInverter ? 0.55 : 0.6);
  const height = dimensionMmToM(hydrated.height_mm, isInverter ? 0.75 : 0.8);
  const depth = dimensionMmToM(hydrated.depth_mm || hydrated.thickness_mm, isInverter ? 0.22 : 0.45);
  const sideClearance = clearanceMmToM(hydrated.clearance_side_mm, isInverter ? 0.3 : 0.2);

  return {
    productId: hydrated.id,
    name: productLabel(hydrated),
    category: hydrated.category,
    type: isInverter ? 'inverter' : 'battery',
    width,
    height,
    depth,
    color: isInverter ? '#2563eb' : '#059669',
    clearance: {
      left: sideClearance,
      right: sideClearance,
      top: clearanceMmToM(hydrated.clearance_top_mm, isInverter ? 0.5 : 0.2),
      bottom: clearanceMmToM(hydrated.clearance_bottom_mm, 0),
      front: clearanceMmToM(hydrated.clearance_front_mm, isInverter ? 0.3 : 0.4),
      back: clearanceMmToM(hydrated.clearance_back_mm, 0.05),
    },
    capacityKwh: hydrated.capacity_kwh,
    powerWatts: hydrated.power_watts,
    maxModulesPerStack: hydrated.max_modules_per_stack,
  };
}

function createDevice(catalogItem, overrides = {}) {
  const y = catalogItem.type === 'inverter' ? 1.2 : 0;

  return {
    instanceId: makeId('device'),
    productId: catalogItem.productId,
    productName: catalogItem.name,
    category: catalogItem.category,
    type: catalogItem.type,
    width: catalogItem.width,
    height: catalogItem.height,
    depth: catalogItem.depth,
    color: catalogItem.color,
    clearance: catalogItem.clearance,
    x: 0,
    y,
    z: 0,
    rotationY: 0,
    ...overrides,
  };
}

function wallLength(wall) {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  return Math.sqrt(dx * dx + dz * dz);
}

function distance2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function closestPointOnWall(device, wall) {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const lengthSq = dx * dx + dz * dz;
  if (!lengthSq) return null;

  const t = Math.max(0, Math.min(1, ((device.x - wall.x1) * dx + (device.z - wall.z1) * dz) / lengthSq));
  const foot = {
    x: wall.x1 + dx * t,
    z: wall.z1 + dz * t,
  };
  const length = Math.sqrt(lengthSq);
  const ux = dx / length;
  const uz = dz / length;
  const normalA = { x: -uz, z: ux };
  const normalB = { x: uz, z: -ux };
  const distanceFromWall = WALL_THICKNESS_M / 2 + device.depth / 2;
  const candidateA = {
    x: foot.x + normalA.x * distanceFromWall,
    z: foot.z + normalA.z * distanceFromWall,
    rotationY: -Math.atan2(uz, ux),
  };
  const candidateB = {
    x: foot.x + normalB.x * distanceFromWall,
    z: foot.z + normalB.z * distanceFromWall,
    rotationY: -Math.atan2(uz, ux) + Math.PI,
  };

  return distance2D(device, candidateA) <= distance2D(device, candidateB) ? candidateA : candidateB;
}

function rotatedFootprint(device, withClearance = false) {
  const clearance = device.clearance || {};
  const width = device.width + (withClearance ? (clearance.left || 0) + (clearance.right || 0) : 0);
  const depth = device.depth + (withClearance ? (clearance.front || 0) + (clearance.back || 0) : 0);
  const angle = numberOr(device.rotationY, 0);
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));

  return {
    width: width * cos + depth * sin,
    depth: width * sin + depth * cos,
  };
}

function deviceBounds(device, withClearance = false) {
  const clearance = device.clearance || {};
  const footprint = rotatedFootprint(device, withClearance);
  return {
    minX: device.x - footprint.width / 2,
    maxX: device.x + footprint.width / 2,
    minY: device.y - (withClearance ? clearance.bottom || 0 : 0),
    maxY: device.y + device.height + (withClearance ? clearance.top || 0 : 0),
    minZ: device.z - footprint.depth / 2,
    maxZ: device.z + footprint.depth / 2,
  };
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX
    && a.minY <= b.maxY && a.maxY >= b.minY
    && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function getStudioIssues(devices, roomHeight) {
  const issues = [];

  devices.forEach((device) => {
    const clearance = device.clearance || {};
    if (device.y < 0) issues.push(`${device.productName} ligger under golvnivå`);
    if (device.y + device.height + (clearance.top || 0) > roomHeight) {
      issues.push(`${device.productName} överskrider rumshöjd med säkerhetsavstånd`);
    }
  });

  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      if (boundsOverlap(deviceBounds(devices[i], true), deviceBounds(devices[j], true))) {
        issues.push(`Säkerhetszoner överlappar: ${devices[i].productName} / ${devices[j].productName}`);
      }
    }
  }

  return issues;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (material.map) material.map.dispose();
      material.dispose();
    });
  });
}

function addEdges(mesh, color = '#ffffff') {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color }),
  );
  mesh.add(edges);
  return edges;
}

function createLabelSprite(text, color = '#1e293b') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const lines = String(text || '').split('\n');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 18);
  ctx.fill();
  ctx.stroke();
  ctx.font = '600 30px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  lines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * 38);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.45, 0.44, 1);
  return sprite;
}

function createWallObject(wall, roomHeight, wallColor = '#94a3b8') {
  const length = wallLength(wall);
  const centerX = (wall.x1 + wall.x2) / 2;
  const centerZ = (wall.z1 + wall.z2) / 2;
  const angle = -Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, roomHeight, WALL_THICKNESS_M),
    new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.7,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
    }),
  );
  mesh.position.set(centerX, roomHeight / 2, centerZ);
  mesh.rotation.y = angle;
  mesh.receiveShadow = true;
  addEdges(mesh, '#64748b');
  return mesh;
}

function createObstacleObject(obstacle) {
  const group = new THREE.Group();
  group.position.set(obstacle.x, obstacle.height / 2, obstacle.z);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
    new THREE.MeshStandardMaterial({
      color: obstacle.color || '#7c3aed',
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      opacity: 0.82,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, '#c4b5fd');
  group.add(mesh);

  const label = createLabelSprite(
    `${obstacle.label || 'Hinder'}\n${formatMeters(obstacle.width)} x ${formatMeters(obstacle.depth)}`,
    '#1e293b',
  );
  label.position.set(0, obstacle.height / 2 + 0.22, 0);
  group.add(label);

  return group;
}

function createDeviceObject(device, isSelected) {
  const group = new THREE.Group();
  const clearance = device.clearance || {};
  const clearanceWidth = device.width + (clearance.left || 0) + (clearance.right || 0);
  const clearanceHeight = device.height + (clearance.top || 0) + (clearance.bottom || 0);
  const clearanceDepth = device.depth + (clearance.front || 0) + (clearance.back || 0);
  const clearanceOffsetY = ((clearance.top || 0) - (clearance.bottom || 0)) / 2;
  const clearanceOffsetZ = ((clearance.front || 0) - (clearance.back || 0)) / 2;

  group.position.set(device.x, device.y + device.height / 2, device.z);
  group.rotation.y = numberOr(device.rotationY, 0);
  group.userData.deviceId = device.instanceId;

  if (isSelected) {
    const clearanceMesh = new THREE.Mesh(
      new THREE.BoxGeometry(clearanceWidth, clearanceHeight, clearanceDepth),
      new THREE.MeshBasicMaterial({
        color: '#f97316',
        wireframe: true,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    clearanceMesh.position.set(0, clearanceOffsetY, clearanceOffsetZ);
    group.add(clearanceMesh);

    const floorZone = new THREE.Mesh(
      new THREE.PlaneGeometry(clearanceWidth, clearanceDepth),
      new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.12, depthWrite: false }),
    );
    floorZone.rotation.x = -Math.PI / 2;
    floorZone.position.set(0, -device.height / 2 + 0.006, clearanceOffsetZ);
    group.add(floorZone);
  }

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(device.width, device.height, device.depth),
    new THREE.MeshStandardMaterial({ color: device.color, roughness: 0.38, metalness: 0.28 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.deviceId = device.instanceId;
  addEdges(body, '#ffffff');
  group.add(body);

  if (device.type === 'inverter') {
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(device.width * 0.72, device.height * 0.58, 0.012),
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45, metalness: 0.2 }),
    );
    screen.position.set(0, 0.02, device.depth / 2 + 0.006);
    group.add(screen);
  }

  if (device.type === 'battery') {
    [device.height * 0.18, -device.height * 0.18].forEach((y) => {
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(device.width * 0.82, 0.018, 0.012),
        new THREE.MeshStandardMaterial({ color: '#bbf7d0', roughness: 0.5 }),
      );
      seam.position.set(0, y, device.depth / 2 + 0.006);
      group.add(seam);
    });
  }

  const label = createLabelSprite(
    `${shortLabel(device.productName)}\n${formatMeters(device.width)} x ${formatMeters(device.height)} x ${formatMeters(device.depth)}`,
    isSelected ? '#f97316' : '#1e293b',
  );
  label.position.set(0, device.height / 2 + 0.22, 0);
  group.add(label);

  if (isSelected && device.y > 0) {
    const points = [
      new THREE.Vector3(-device.width / 2 - 0.14, -device.height / 2, device.depth / 2 + 0.08),
      new THREE.Vector3(-device.width / 2 - 0.14, -device.height / 2 - device.y, device.depth / 2 + 0.08),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: '#38bdf8' }),
    );
    group.add(line);

    const heightLabel = createLabelSprite(formatMeters(device.y), '#38bdf8');
    heightLabel.scale.set(0.75, 0.24, 1);
    heightLabel.position.set(-device.width / 2 - 0.14, -device.height / 2 - device.y / 2, device.depth / 2 + 0.08);
    group.add(heightLabel);
  }

  return group;
}

function StudioScene({ walls, devices, obstacles, selectedDeviceId, roomHeight, wallColor, floorColor, onSelectDevice, onClearSelection }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectRootRef = useRef(null);
  const callbacksRef = useRef({ onSelectDevice, onClearSelection });

  useEffect(() => {
    callbacksRef.current = { onSelectDevice, onClearSelection };
  }, [onSelectDevice, onClearSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(floorColor);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = 'h-full w-full';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight('#ffffff', 0.58));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.2);
    keyLight.position.set(7, 10, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const blueLight = new THREE.PointLight('#38bdf8', 0.55);
    blueLight.position.set(-4, 4, -5);
    scene.add(blueLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(DRAW_WIDTH_M, DRAW_DEPTH_M),
      new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9, metalness: 0.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(Math.max(DRAW_WIDTH_M, DRAW_DEPTH_M), Math.max(DRAW_WIDTH_M, DRAW_DEPTH_M) * 2, '#94a3b8', '#cbd5e0');
    grid.position.y = 0.004;
    scene.add(grid);

    const objectRoot = new THREE.Group();
    scene.add(objectRoot);

    const orbit = {
      radius: 9.3,
      theta: Math.PI / 4,
      phi: 0.86,
      target: new THREE.Vector3(0, 1.15, 0),
    };

    const updateCamera = () => {
      const x = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      const y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
      const z = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.set(x, y, z);
      camera.lookAt(orbit.target);
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateCamera();
    };

    const pointerState = { down: false, moved: false, x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event) => {
      pointerState.down = true;
      pointerState.moved = false;
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };

    const handlePointerMove = (event) => {
      if (!pointerState.down) return;
      const dx = event.clientX - pointerState.x;
      const dy = event.clientY - pointerState.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) pointerState.moved = true;

      if (event.shiftKey) {
        orbit.target.x -= dx * 0.01;
        orbit.target.z += dy * 0.01;
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.max(0.2, Math.min(Math.PI / 2.05, orbit.phi + dy * 0.006));
      }

      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      updateCamera();
    };

    const handlePointerUp = (event) => {
      pointerState.down = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grab';

      if (pointerState.moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(objectRoot.children, true)
        .map((item) => {
          let object = item.object;
          while (object && !object.userData.deviceId) object = object.parent;
          return object?.userData.deviceId;
        })
        .find(Boolean);

      if (hit) callbacksRef.current.onSelectDevice(hit);
      else callbacksRef.current.onClearSelection();
    };

    const handleWheel = (event) => {
      event.preventDefault();
      orbit.radius = Math.max(2.4, Math.min(16, orbit.radius + event.deltaY * 0.008));
      updateCamera();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    let frameId = 0;
    const render = () => {
      frameId = window.requestAnimationFrame(render);
      renderer.render(scene, camera);
    };

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    objectRootRef.current = objectRoot;
    resize();
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const root = objectRootRef.current;
    if (!root) return;

    root.children.forEach(disposeObject);
    root.clear();

    walls.forEach((wall) => root.add(createWallObject(wall, roomHeight, wallColor)));
    (obstacles || []).forEach((obstacle) => root.add(createObstacleObject(obstacle)));
    devices.forEach((device) => root.add(createDeviceObject(device, selectedDeviceId === device.instanceId)));
  }, [walls, devices, obstacles, selectedDeviceId, roomHeight, wallColor, floorColor]);

  return <div ref={containerRef} className="h-full min-h-[680px] w-full" />;
}

function NumberField({ label, value, onChange, step = NUDGE_STEP_M, disabled = false, suffix = 'm' }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-600">
      <span>{label}</span>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={Number(value).toFixed(step < 0.1 ? 2 : 1)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 pr-9 font-mono text-xs"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      </div>
    </label>
  );
}

export default function BatteryTab({ project, onUpdate }) {
  const initialLayout = useMemo(() => parseBatteryLayout(project.battery_layout_data), [project.battery_layout_data]);
  const [mode, setMode] = useState('studio');
  const [imageUrl, setImageUrl] = useState(project.battery_image_url || '');
  const [walls, setWalls] = useState(initialLayout.walls);
  const [devices, setDevices] = useState(initialLayout.devices);
  const [photoItems, setPhotoItems] = useState(initialLayout.photoItems);
  const [roomHeight, setRoomHeight] = useState(initialLayout.roomHeight);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPhotoBattery, setSelectedPhotoBattery] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [currentMousePoint, setCurrentMousePoint] = useState(null);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef(null);
  const [obstacles, setObstacles] = useState(initialLayout.obstacles);
  const [wallColor, setWallColor] = useState(initialLayout.wallColor);
  const [floorColor, setFloorColor] = useState(initialLayout.floorColor);
  const [drawMode, setDrawMode] = useState('wall');
  const [obstacleConfig, setObstacleConfig] = useState({
    type: 'shelf',
    label: 'Hylla',
    width: 1.0,
    depth: 0.4,
    height: 2.0,
    color: '#7c3aed',
  });
  const [obstaclePreview, setObstaclePreview] = useState(null);

  useEffect(() => {
    const nextLayout = parseBatteryLayout(project.battery_layout_data);
    setImageUrl(project.battery_image_url || '');
    setWalls(nextLayout.walls);
    setDevices(nextLayout.devices);
    setPhotoItems(nextLayout.photoItems);
    setRoomHeight(nextLayout.roomHeight);
    setDrawingPoints([]);
    setCurrentMousePoint(null);
    setSelectedDeviceId(null);
    setObstacles(nextLayout.obstacles);
    setWallColor(nextLayout.wallColor);
    setFloorColor(nextLayout.floorColor);
    setDrawMode('wall');
    setObstaclePreview(null);
  }, [project?.id, project?.battery_image_url, project?.battery_layout_data]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-battery-studio'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  const catalog = useMemo(
    () => products
      .filter((product) => ['batteri', 'vaxelriktare'].includes(product.category) && product.is_active !== false)
      .map(normalizeCatalogProduct),
    [products],
  );

  const batteries = useMemo(() => catalog.filter((item) => item.type === 'battery'), [catalog]);
  const selectedCatalogItem = catalog.find((item) => item.productId === selectedProductId) || catalog[0];
  const selectedDevice = devices.find((device) => device.instanceId === selectedDeviceId) || null;
  const issues = useMemo(() => getStudioIssues(devices, roomHeight), [devices, roomHeight]);

  useEffect(() => {
    if (!selectedProductId && catalog[0]?.productId) setSelectedProductId(catalog[0].productId);
  }, [catalog, selectedProductId]);

  const svgPointFromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: snapToGrid(((event.clientX - rect.left) / rect.width - 0.5) * DRAW_WIDTH_M, GRID_STEP_M),
      z: snapToGrid(((event.clientY - rect.top) / rect.height - 0.5) * DRAW_DEPTH_M, GRID_STEP_M),
    };
  };

  const addWallBetween = (start, end) => {
    if (distance2D(start, end) < GRID_STEP_M / 2) return;
    setWalls((prev) => [...prev, {
      id: makeId('wall'),
      x1: start.x,
      z1: start.z,
      x2: end.x,
      z2: end.z,
    }]);
  };

  const handleDrawClick = (event) => {
    if (!svgRef.current) return;
    const point = svgPointFromEvent(event);

    if (drawMode === 'obstacle') {
      setObstacles((prev) => [...prev, {
        id: makeId('obstacle'),
        type: obstacleConfig.type,
        label: obstacleConfig.label,
        x: point.x,
        z: point.z,
        width: obstacleConfig.width,
        depth: obstacleConfig.depth,
        height: obstacleConfig.height,
        color: obstacleConfig.color,
      }]);
      return;
    }

    setDrawingPoints((prev) => {
      if (prev.length > 2 && distance2D(point, prev[0]) <= GRID_STEP_M * 0.75) {
        addWallBetween(prev[prev.length - 1], prev[0]);
        setMode('studio');
        setCurrentMousePoint(null);
        return [];
      }

      if (prev.length > 0) addWallBetween(prev[prev.length - 1], point);
      return [...prev, point];
    });
  };

  const handleDrawMove = (event) => {
    if (!svgRef.current) return;
    const point = svgPointFromEvent(event);
    if (drawMode === 'obstacle') {
      setObstaclePreview(point);
      return;
    }
    if (drawingPoints.length === 0) return;
    setCurrentMousePoint(point);
  };

  const finishDrawing = (closeRoom = false) => {
    if (closeRoom && drawingPoints.length > 2) {
      addWallBetween(drawingPoints[drawingPoints.length - 1], drawingPoints[0]);
    }
    setDrawingPoints([]);
    setCurrentMousePoint(null);
    setMode('studio');
  };

  const undoDrawPoint = () => {
    setDrawingPoints((prev) => prev.slice(0, -1));
    setWalls((prev) => (drawingPoints.length > 1 ? prev.slice(0, -1) : prev));
  };

  const clearStudio = () => {
    setWalls([]);
    setDevices([]);
    setObstacles([]);
    setDrawingPoints([]);
    setCurrentMousePoint(null);
    setSelectedDeviceId(null);
    setObstaclePreview(null);
    setMode('draw');
  };

  const addDeviceToStudio = () => {
    if (!selectedCatalogItem) return;

    let placement = {};
    if (selectedCatalogItem.type === 'inverter' && walls[0]) {
      const seed = createDevice(selectedCatalogItem);
      placement = closestPointOnWall(seed, walls[0]) || {};
    }

    const nextDevice = createDevice(selectedCatalogItem, placement);
    setDevices((prev) => [...prev, nextDevice]);
    setSelectedDeviceId(nextDevice.instanceId);
    setMode('studio');
  };

  const updateSelectedDevice = (patch) => {
    setDevices((prev) => prev.map((device) => (
      device.instanceId === selectedDeviceId ? { ...device, ...patch } : device
    )));
  };

  const updateSelectedPosition = (axis, value) => {
    updateSelectedDevice({ [axis]: snapToGrid(value, NUDGE_STEP_M) });
  };

  const nudgeSelected = (patch) => {
    if (!selectedDevice) return;
    updateSelectedDevice(Object.fromEntries(
      Object.entries(patch).map(([key, delta]) => [key, snapToGrid(numberOr(selectedDevice[key], 0) + delta, NUDGE_STEP_M)]),
    ));
  };

  const rotateSelected = (degrees) => {
    if (!selectedDevice) return;
    updateSelectedDevice({ rotationY: numberOr(selectedDevice.rotationY, 0) + degrees * Math.PI / 180 });
  };

  const mountSelectedOnWall = () => {
    if (!selectedDevice || walls.length === 0) return;

    const wallPlacement = walls
      .map((wall) => closestPointOnWall(selectedDevice, wall))
      .filter(Boolean)
      .sort((a, b) => distance2D(selectedDevice, a) - distance2D(selectedDevice, b))[0];

    if (wallPlacement) {
      updateSelectedDevice({
        x: snapToGrid(wallPlacement.x, NUDGE_STEP_M),
        z: snapToGrid(wallPlacement.z, NUDGE_STEP_M),
        rotationY: wallPlacement.rotationY,
      });
    }
  };

  const stackBatteryCopy = () => {
    if (!selectedDevice || selectedDevice.type !== 'battery') return;
    const nextDevice = {
      ...selectedDevice,
      instanceId: makeId('device'),
      y: snapToGrid(selectedDevice.y + selectedDevice.height, NUDGE_STEP_M),
    };
    setDevices((prev) => [...prev, nextDevice]);
    setSelectedDeviceId(nextDevice.instanceId);
  };

  const deleteSelectedDevice = () => {
    setDevices((prev) => prev.filter((device) => device.instanceId !== selectedDeviceId));
    setSelectedDeviceId(null);
  };

  const handleImageUpload = async (dataUrl, file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
  };

  const addPhotoBattery = () => {
    const product = products.find((item) => item.id === selectedPhotoBattery);
    if (!product) return;

    setPhotoItems((prev) => [...prev, {
      id: makeId('photo-battery'),
      product_id: product.id,
      product_name: product.name,
      x: 30 + Math.random() * 20,
      y: 30 + Math.random() * 20,
      scale: 1,
    }]);
  };

  const removePhotoBattery = (batteryId) => {
    setPhotoItems((prev) => prev.filter((item) => item.id !== batteryId));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        battery_image_url: imageUrl,
        battery_layout_data: JSON.stringify({
          version: 2,
          roomHeight,
          walls,
          devices,
          obstacles,
          photoItems,
          wallColor,
          floorColor,
          savedAt: new Date().toISOString(),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BatteryIcon className="h-5 w-5 text-primary" />
            Batteriplanering
          </CardTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1"><Ruler className="h-3 w-3" />{walls.length} väggar</Badge>
            <Badge variant="secondary" className="gap-1"><Box className="h-3 w-3" />{devices.length} enheter</Badge>
            {obstacles.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="h-3 w-3" />{obstacles.length} hinder
              </Badge>
            )}
            {issues.length > 0 && <Badge className="bg-amber-100 text-amber-800">{issues.length} kontrollpunkter</Badge>}
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
          <Save className="h-4 w-4" />
          {saving ? 'Sparar...' : 'Spara'}
        </Button>
      </CardHeader>

      <CardContent>
        <Tabs value={mode} onValueChange={setMode} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-3 lg:w-[520px]">
            <TabsTrigger value="draw" className="gap-2"><Ruler className="h-4 w-4" />Rita rum</TabsTrigger>
            <TabsTrigger value="studio" className="gap-2"><Box className="h-4 w-4" />3D Studio</TabsTrigger>
            <TabsTrigger value="photo" className="gap-2"><Upload className="h-4 w-4" />Foto/2D</TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="mt-0">
            <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="space-y-3">
                  <NumberField
                    label="Rumshöjd"
                    value={roomHeight}
                    step={0.1}
                    onChange={(value) => setRoomHeight(Math.max(1.8, snapToGrid(value, 0.1)))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={undoDrawPoint} disabled={drawingPoints.length === 0}>
                      <RotateCcw className="mr-2 h-4 w-4" />Ångra
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => finishDrawing(false)} disabled={walls.length === 0}>
                      3D vy
                    </Button>
                    <Button size="sm" onClick={() => finishDrawing(true)} disabled={drawingPoints.length < 3} className="col-span-2">
                      Stäng rum
                    </Button>
                    <Button variant="destructive" size="sm" onClick={clearStudio} className="col-span-2">
                      <Eraser className="mr-2 h-4 w-4" />Rensa rum
                    </Button>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <div className="text-xs font-semibold text-slate-600">Ritläge</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={drawMode === 'wall' ? 'default' : 'outline'}
                        onClick={() => { setDrawMode('wall'); setObstaclePreview(null); }}
                      >
                        Vägg
                      </Button>
                      <Button
                        size="sm"
                        variant={drawMode === 'obstacle' ? 'default' : 'outline'}
                        onClick={() => setDrawMode('obstacle')}
                      >
                        Hinder
                      </Button>
                    </div>

                    {drawMode === 'obstacle' && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-500">Typ av hinder</div>
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          value={obstacleConfig.type}
                          onChange={(e) => {
                            const presets = {
                              shelf: { label: 'Hylla', width: 1.0, depth: 0.4, height: 2.0, color: '#7c3aed' },
                              table: { label: 'Bord', width: 1.2, depth: 0.8, height: 0.75, color: '#b45309' },
                              box: { label: 'Låda', width: 0.6, depth: 0.4, height: 0.5, color: '#0369a1' },
                              pillar: { label: 'Pelare', width: 0.3, depth: 0.3, height: 2.5, color: '#374151' },
                              custom: { label: 'Hinder', width: 1.0, depth: 0.5, height: 1.0, color: '#6b7280' },
                            };
                            const preset = presets[e.target.value] || presets.custom;
                            setObstacleConfig({ ...preset, type: e.target.value });
                          }}
                        >
                          <option value="shelf">Hylla</option>
                          <option value="table">Bord</option>
                          <option value="box">Låda/kartong</option>
                          <option value="pillar">Pelare</option>
                          <option value="custom">Eget hinder</option>
                        </select>

                        <Input
                          value={obstacleConfig.label}
                          onChange={(e) => setObstacleConfig((prev) => ({ ...prev, label: e.target.value }))}
                          placeholder="Etikett"
                          className="h-8 text-sm"
                        />

                        <div className="grid grid-cols-3 gap-1.5">
                          <NumberField
                            label="Bredd"
                            value={obstacleConfig.width}
                            step={0.1}
                            onChange={(v) => setObstacleConfig((prev) => ({ ...prev, width: Math.max(0.1, Number(v)) }))}
                          />
                          <NumberField
                            label="Djup"
                            value={obstacleConfig.depth}
                            step={0.1}
                            onChange={(v) => setObstacleConfig((prev) => ({ ...prev, depth: Math.max(0.1, Number(v)) }))}
                          />
                          <NumberField
                            label="Höjd"
                            value={obstacleConfig.height}
                            step={0.1}
                            onChange={(v) => setObstacleConfig((prev) => ({ ...prev, height: Math.max(0.1, Number(v)) }))}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500">Färg</label>
                          <input
                            type="color"
                            value={obstacleConfig.color}
                            onChange={(e) => setObstacleConfig((prev) => ({ ...prev, color: e.target.value }))}
                            className="h-7 w-10 cursor-pointer rounded border border-input"
                          />
                        </div>

                        <p className="text-[11px] text-slate-400">
                          Klicka på canvasen för att placera. Klicka på ett hinder för att ta bort det.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-600">Färger</div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-500">Väggar</label>
                      <input
                        type="color"
                        value={wallColor}
                        onChange={(e) => setWallColor(e.target.value)}
                        className="h-7 w-10 cursor-pointer rounded border border-input"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-500">Golv</label>
                      <input
                        type="color"
                        value={floorColor}
                        onChange={(e) => setFloorColor(e.target.value)}
                        className="h-7 w-10 cursor-pointer rounded border border-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-[#f0f4f8]">
                <svg
                  ref={svgRef}
                  viewBox={`${-DRAW_WIDTH_M / 2} ${-DRAW_DEPTH_M / 2} ${DRAW_WIDTH_M} ${DRAW_DEPTH_M}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="h-full min-h-[560px] w-full cursor-crosshair"
                  onClick={handleDrawClick}
                  onMouseMove={handleDrawMove}
                >
                  <defs>
                    <pattern id="battery-room-grid" width={GRID_STEP_M} height={GRID_STEP_M} patternUnits="userSpaceOnUse">
                      <path d={`M ${GRID_STEP_M} 0 L 0 0 0 ${GRID_STEP_M}`} fill="none" stroke="#cbd5e0" strokeWidth="0.012" />
                    </pattern>
                  </defs>
                  <rect x={-DRAW_WIDTH_M / 2} y={-DRAW_DEPTH_M / 2} width={DRAW_WIDTH_M} height={DRAW_DEPTH_M} fill="white" />
                  <rect x={-DRAW_WIDTH_M / 2} y={-DRAW_DEPTH_M / 2} width={DRAW_WIDTH_M} height={DRAW_DEPTH_M} fill="url(#battery-room-grid)" />

                  {walls.map((wall) => (
                    <g key={wall.id}>
                      <line
                        x1={wall.x1}
                        y1={wall.z1}
                        x2={wall.x2}
                        y2={wall.z2}
                        stroke="#2563eb"
                        strokeWidth="0.08"
                        strokeLinecap="round"
                      />
                      <text
                        x={(wall.x1 + wall.x2) / 2}
                        y={(wall.z1 + wall.z2) / 2 - 0.12}
                        textAnchor="middle"
                        fontSize="0.18"
                        fill="#1e293b"
                      >
                        {formatMeters(wallLength(wall))}
                      </text>
                    </g>
                  ))}

                  {obstacles.map((obs) => (
                    <g key={obs.id}>
                      <rect
                        x={obs.x - obs.width / 2}
                        y={obs.z - obs.depth / 2}
                        width={obs.width}
                        height={obs.depth}
                        fill={obs.color}
                        fillOpacity="0.25"
                        stroke={obs.color}
                        strokeWidth="0.05"
                        strokeLinejoin="round"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setObstacles((prev) => prev.filter((o) => o.id !== obs.id));
                        }}
                      />
                      <text
                        x={obs.x}
                        y={obs.z}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="0.16"
                        fontWeight="600"
                        fill={obs.color}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {obs.label}
                      </text>
                      <text
                        x={obs.x}
                        y={obs.z + 0.22}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="0.13"
                        fill="#64748b"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {obs.width.toFixed(2)}×{obs.depth.toFixed(2)} m
                      </text>
                    </g>
                  ))}

                  {drawMode === 'obstacle' && obstaclePreview && (
                    <rect
                      x={obstaclePreview.x - obstacleConfig.width / 2}
                      y={obstaclePreview.z - obstacleConfig.depth / 2}
                      width={obstacleConfig.width}
                      height={obstacleConfig.depth}
                      fill={obstacleConfig.color}
                      fillOpacity="0.15"
                      stroke={obstacleConfig.color}
                      strokeWidth="0.04"
                      strokeDasharray="0.1 0.08"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {drawingPoints.length > 0 && currentMousePoint && (() => {
                    const start = drawingPoints[drawingPoints.length - 1];
                    const end = currentMousePoint;
                    const dx = end.x - start.x;
                    const dz = end.z - start.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const midX = (start.x + end.x) / 2;
                    const midZ = (start.z + end.z) / 2;
                    return (
                      <g>
                        <line
                          x1={start.x}
                          y1={start.z}
                          x2={end.x}
                          y2={end.z}
                          stroke="#f59e0b"
                          strokeWidth="0.045"
                          strokeDasharray="0.12 0.1"
                          strokeLinecap="round"
                        />
                        {dist > GRID_STEP_M / 2 && (
                          <text
                            x={midX}
                            y={midZ - 0.14}
                            textAnchor="middle"
                            fontSize="0.2"
                            fontWeight="600"
                            fill="#f59e0b"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {dist.toFixed(2)} m
                          </text>
                        )}
                      </g>
                    );
                  })()}

                  {drawingPoints.map((point, index) => (
                    <circle
                      key={`${point.x}-${point.z}-${index}`}
                      cx={point.x}
                      cy={point.z}
                      r={index === 0 && drawingPoints.length > 2 ? 0.12 : 0.09}
                      fill={index === 0 && drawingPoints.length > 2 ? '#22c55e' : '#f59e0b'}
                    />
                  ))}
                </svg>
                <div className="absolute bottom-3 right-3 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm">
                  1 ruta = 0.25 m
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="studio" className="mt-0">
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4 rounded-lg border bg-background p-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Produkt</div>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj produkt..." />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((item) => (
                        <SelectItem key={item.productId} value={item.productId}>
                          {item.type === 'inverter' ? 'Växelriktare' : 'Batteri'} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addDeviceToStudio} disabled={!selectedCatalogItem} className="w-full gap-2">
                    <Plus className="h-4 w-4" />Lägg till i rum
                  </Button>
                  {selectedCatalogItem && (
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      {formatMeters(selectedCatalogItem.width)} x {formatMeters(selectedCatalogItem.height)} x {formatMeters(selectedCatalogItem.depth)}
                      {selectedCatalogItem.capacityKwh && <> · {selectedCatalogItem.capacityKwh} kWh</>}
                      {selectedCatalogItem.powerWatts && <> · {selectedCatalogItem.powerWatts} W</>}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Markerad enhet</div>
                    {selectedDevice && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteSelectedDevice}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {selectedDevice ? (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {selectedDevice.type === 'inverter' ? <Zap className="h-4 w-4 text-blue-600" /> : <BatteryIcon className="h-4 w-4 text-emerald-600" />}
                          {selectedDevice.productName}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatMeters(selectedDevice.width)} x {formatMeters(selectedDevice.height)} x {formatMeters(selectedDevice.depth)}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <NumberField label="X" value={selectedDevice.x} onChange={(value) => updateSelectedPosition('x', value)} />
                        <NumberField label="Y" value={selectedDevice.y} onChange={(value) => updateSelectedPosition('y', value)} />
                        <NumberField label="Z" value={selectedDevice.z} onChange={(value) => updateSelectedPosition('z', value)} />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ x: -NUDGE_STEP_M })}><ArrowLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ z: -NUDGE_STEP_M })}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ x: NUDGE_STEP_M })}><ArrowRight className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ y: -NUDGE_STEP_M })}><ArrowDown className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ z: NUDGE_STEP_M })}><Move className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => nudgeSelected({ y: NUDGE_STEP_M })}><ArrowUp className="h-4 w-4" /></Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => rotateSelected(-90)}>
                          <RotateCcw className="mr-2 h-4 w-4" />-90
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => rotateSelected(90)}>
                          <RotateCcw className="mr-2 h-4 w-4 rotate-180" />+90
                        </Button>
                        <Button variant="outline" size="sm" onClick={mountSelectedOnWall} disabled={walls.length === 0}>
                          <Ruler className="mr-2 h-4 w-4" />Fäst på vägg
                        </Button>
                        <Button variant="outline" size="sm" onClick={stackBatteryCopy} disabled={selectedDevice.type !== 'battery'}>
                          <Layers className="mr-2 h-4 w-4" />Stapla
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Välj en enhet i 3D-vyn eller lägg till en ny produkt.
                    </div>
                  )}
                </div>

                {issues.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="text-sm font-semibold text-amber-700">Kontroll</div>
                    <div className="space-y-2">
                      {issues.slice(0, 4).map((issue) => (
                        <div key={issue} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          {issue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative min-h-[680px] overflow-hidden rounded-lg border border-slate-200 bg-[#f0f4f8]">
                {walls.length === 0 && (
                  <div className="absolute left-4 top-4 z-10 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
                    Inget rum ritat
                  </div>
                )}
                <StudioScene
                  walls={walls}
                  devices={devices}
                  obstacles={obstacles}
                  selectedDeviceId={selectedDeviceId}
                  roomHeight={roomHeight}
                  wallColor={wallColor}
                  floorColor={floorColor}
                  onSelectDevice={setSelectedDeviceId}
                  onClearSelection={() => setSelectedDeviceId(null)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="photo" className="mt-0 space-y-4">
            {imageUrl && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <p className="mb-1.5 text-sm font-medium">Välj batteri</p>
                  <Select value={selectedPhotoBattery} onValueChange={setSelectedPhotoBattery}>
                    <SelectTrigger><SelectValue placeholder="Välj batteri..." /></SelectTrigger>
                    <SelectContent>
                      {batteries.map((item) => (
                        <SelectItem key={item.productId} value={item.productId}>
                          {item.name}{item.capacityKwh ? ` (${item.capacityKwh} kWh)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addPhotoBattery} disabled={!selectedPhotoBattery} className="gap-2">
                  <Plus className="h-4 w-4" />Lägg till batteri
                </Button>
              </div>
            )}

            <ImageCanvas
              imageUrl={imageUrl}
              items={photoItems}
              onItemsChange={setPhotoItems}
              onImageUpload={handleImageUpload}
              label="Ladda upp bild för batteriplacering"
              itemRenderer={(item) => (
                <div className="group relative">
                  <div className="min-w-[60px] rounded-sm border-2 border-green-300 bg-green-500/60 px-3 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur-sm">
                    <BatteryIcon className="mr-1 inline h-3 w-3" />
                    {item.product_name?.split(' ')[0]}
                  </div>
                  <button
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      removePhotoBattery(item.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            />

            {photoItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photoItems.map((item) => (
                  <Badge key={item.id} variant="secondary" className="gap-1">
                    {item.product_name}
                    <button onClick={() => removePhotoBattery(item.id)} className="ml-1 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Badge variant="outline">{photoItems.length} batter{photoItems.length > 1 ? 'ier' : 'i'} totalt</Badge>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
