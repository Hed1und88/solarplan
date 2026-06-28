import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listVisibleProducts } from '@/lib/tenantQueries';
import { hydrateProductWithMeta } from '@/lib/productDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery as BatteryIcon,
  Box,
  Building2,
  DoorOpen,
  Eraser,
  Layers,
  Move,
  MousePointer2,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Trash2,
  Upload,
  Warehouse,
  Zap,
} from 'lucide-react';
import ImageCanvas from './ImageCanvas';

const DRAW_WIDTH_M = 14;
const DRAW_DEPTH_M = 10;
const GRID_STEP_M = 0.25;
const MOVE_STEP_M = 0.05;
const WALL_THICKNESS_M = 0.12;
const DEFAULT_ROOM_HEIGHT_M = 2.5;

const CATEGORY_META = {
  batteri: { type: 'battery', label: 'Batteri', color: '#059669', width: 0.6, height: 0.8, depth: 0.45, wallMounted: false },
  vaxelriktare: { type: 'inverter', label: 'Växelriktare', color: '#2563eb', width: 0.55, height: 0.75, depth: 0.22, wallMounted: true },
  brytare: { type: 'switch', label: 'Brytare', color: '#ea580c', width: 0.14, height: 0.2, depth: 0.09, wallMounted: true },
  elcentral: { type: 'switchboard', label: 'Elcentral', color: '#7c3aed', width: 0.6, height: 0.8, depth: 0.18, wallMounted: true },
};

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mmToM(value, fallback) {
  return positiveOr(value, fallback * 1000) / 1000;
}

function clearanceToM(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed / 1000 : fallback;
}

function snap(value, step = MOVE_STEP_M) {
  return Number((Math.round(numberOr(value) / step) * step).toFixed(3));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatM(value, digits = 2) {
  return `${numberOr(value).toFixed(digits)} m`;
}

function productLabel(product = {}) {
  return [product.brand, product.model].filter(Boolean).join(' ') || product.name || 'Produkt';
}

function createRoom(index = 1) {
  return {
    id: makeId('room'),
    name: `Rum ${index}`,
    walls: [],
    doors: [],
  };
}

function emptyLayout() {
  const room = createRoom(1);
  return {
    version: 3,
    roomHeight: DEFAULT_ROOM_HEIGHT_M,
    rooms: [room],
    devices: [],
    obstacles: [],
    photoItems: [],
    wallColor: '#94a3b8',
    floorColor: '#e2e8f0',
    savedAt: '',
  };
}

function parseLayout(raw) {
  const fallback = emptyLayout();
  try {
    const parsed = JSON.parse(raw || '');
    if (Array.isArray(parsed)) return { ...fallback, photoItems: parsed };
    if (!parsed || typeof parsed !== 'object') return fallback;

    let rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
    if (!rooms.length && Array.isArray(parsed.walls)) {
      rooms = [{
        ...createRoom(1),
        id: 'legacy-room-1',
        walls: parsed.walls,
        doors: Array.isArray(parsed.doors) ? parsed.doors : [],
      }];
    }
    if (!rooms.length) rooms = fallback.rooms;

    const firstRoomId = rooms[0].id;
    rooms = rooms.map((room, index) => ({
      id: room.id || makeId('room'),
      name: room.name || `Rum ${index + 1}`,
      walls: Array.isArray(room.walls) ? room.walls : [],
      doors: Array.isArray(room.doors) ? room.doors : [],
    }));

    return {
      ...fallback,
      ...parsed,
      roomHeight: positiveOr(parsed.roomHeight, DEFAULT_ROOM_HEIGHT_M),
      rooms,
      devices: (Array.isArray(parsed.devices) ? parsed.devices : []).map(device => ({ ...device, roomId: device.roomId || firstRoomId })),
      obstacles: (Array.isArray(parsed.obstacles) ? parsed.obstacles : []).map(obstacle => ({ ...obstacle, roomId: obstacle.roomId || firstRoomId })),
      photoItems: Array.isArray(parsed.photoItems) ? parsed.photoItems : Array.isArray(parsed.batteries) ? parsed.batteries : [],
      wallColor: parsed.wallColor || '#94a3b8',
      floorColor: parsed.floorColor || '#e2e8f0',
    };
  } catch {
    return fallback;
  }
}

function normalizeCatalogProduct(product = {}) {
  const hydrated = hydrateProductWithMeta(product);
  const meta = CATEGORY_META[hydrated.category];
  if (!meta) return null;
  const side = clearanceToM(hydrated.clearance_side_mm, meta.type === 'battery' ? 0.2 : 0.1);
  return {
    productId: hydrated.id,
    name: productLabel(hydrated),
    category: hydrated.category,
    type: meta.type,
    typeLabel: meta.label,
    wallMounted: meta.wallMounted,
    width: mmToM(hydrated.width_mm, meta.width),
    height: mmToM(hydrated.height_mm, meta.height),
    depth: mmToM(hydrated.depth_mm || hydrated.thickness_mm, meta.depth),
    color: meta.color,
    capacityKwh: hydrated.capacity_kwh,
    powerWatts: hydrated.power_watts,
    clearance: {
      left: side,
      right: side,
      top: clearanceToM(hydrated.clearance_top_mm, meta.type === 'inverter' ? 0.5 : 0.1),
      bottom: clearanceToM(hydrated.clearance_bottom_mm, 0),
      front: clearanceToM(hydrated.clearance_front_mm, meta.type === 'battery' ? 0.4 : 0.25),
      back: clearanceToM(hydrated.clearance_back_mm, 0.05),
    },
  };
}

function createDevice(catalogItem, roomId, overrides = {}) {
  const defaultY = catalogItem.type === 'battery' ? 0 : catalogItem.type === 'switch' ? 1.35 : 1.05;
  return {
    instanceId: makeId('device'),
    roomId,
    productId: catalogItem.productId,
    productName: catalogItem.name,
    category: catalogItem.category,
    type: catalogItem.type,
    typeLabel: catalogItem.typeLabel,
    wallMounted: catalogItem.wallMounted,
    width: catalogItem.width,
    height: catalogItem.height,
    depth: catalogItem.depth,
    color: catalogItem.color,
    clearance: catalogItem.clearance,
    x: 0,
    y: defaultY,
    z: 0,
    rotationY: 0,
    ...overrides,
  };
}

function wallLength(wall) {
  return Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function pointOnWall(wall, t) {
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * t,
    z: wall.z1 + (wall.z2 - wall.z1) * t,
  };
}

function nearestWall(point, rooms) {
  let best = null;
  rooms.forEach(room => {
    room.walls.forEach(wall => {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const lenSq = dx * dx + dz * dz;
      if (!lenSq) return;
      const t = clamp(((point.x - wall.x1) * dx + (point.z - wall.z1) * dz) / lenSq, 0, 1);
      const foot = pointOnWall(wall, t);
      const distance = distance2D(point, foot);
      if (!best || distance < best.distance) best = { room, wall, t, point: foot, distance };
    });
  });
  return best;
}

function wallPlacement(item, walls) {
  let best = null;
  walls.forEach(wall => {
    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const lenSq = dx * dx + dz * dz;
    if (!lenSq) return;
    const t = clamp(((item.x - wall.x1) * dx + (item.z - wall.z1) * dz) / lenSq, 0, 1);
    const foot = pointOnWall(wall, t);
    const length = Math.sqrt(lenSq);
    const ux = dx / length;
    const uz = dz / length;
    const offset = WALL_THICKNESS_M / 2 + item.depth / 2;
    const candidates = [
      { x: foot.x - uz * offset, z: foot.z + ux * offset, rotationY: -Math.atan2(uz, ux) },
      { x: foot.x + uz * offset, z: foot.z - ux * offset, rotationY: -Math.atan2(uz, ux) + Math.PI },
    ];
    candidates.forEach(candidate => {
      const distance = distance2D(item, candidate);
      if (!best || distance < best.distance) best = { ...candidate, distance };
    });
  });
  return best;
}

function doorInterval(wall, door) {
  const length = Math.max(wallLength(wall), 0.001);
  const half = Math.min(numberOr(door.width, 0.9) / length / 2, 0.45);
  const center = clamp(numberOr(door.offset, 0.5), half, 1 - half);
  return { start: center - half, end: center + half, center };
}

function wallSegments(wall, doors = []) {
  const intervals = doors
    .filter(door => door.wallId === wall.id)
    .map(door => ({ ...doorInterval(wall, door), door }))
    .sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  intervals.forEach(interval => {
    if (interval.start > cursor) segments.push({ start: cursor, end: interval.start, type: 'wall' });
    segments.push({ start: interval.start, end: interval.end, type: 'header', door: interval.door });
    cursor = Math.max(cursor, interval.end);
  });
  if (cursor < 1) segments.push({ start: cursor, end: 1, type: 'wall' });
  return segments;
}

function rotatedFootprint(item, withClearance = false) {
  const clearance = item.clearance || {};
  const width = numberOr(item.width, 0.5) + (withClearance ? numberOr(clearance.left) + numberOr(clearance.right) : 0);
  const depth = numberOr(item.depth, 0.3) + (withClearance ? numberOr(clearance.front) + numberOr(clearance.back) : 0);
  const angle = numberOr(item.rotationY);
  return {
    width: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth,
    depth: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth,
  };
}

function bounds(item, withClearance = false) {
  const footprint = rotatedFootprint(item, withClearance);
  const clearance = item.clearance || {};
  return {
    minX: item.x - footprint.width / 2,
    maxX: item.x + footprint.width / 2,
    minZ: item.z - footprint.depth / 2,
    maxZ: item.z + footprint.depth / 2,
    minY: numberOr(item.y) - (withClearance ? numberOr(clearance.bottom) : 0),
    maxY: numberOr(item.y) + numberOr(item.height, 1) + (withClearance ? numberOr(clearance.top) : 0),
  };
}

function overlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ && a.minY <= b.maxY && a.maxY >= b.minY;
}

function studioIssues(devices, obstacles, roomHeight) {
  const issues = [];
  devices.forEach(device => {
    const clearance = device.clearance || {};
    if (device.y < 0) issues.push(`${device.productName} ligger under golvnivå`);
    if (device.y + device.height + numberOr(clearance.top) > roomHeight) issues.push(`${device.productName} överskrider rumshöjden`);
  });
  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      if (devices[i].roomId === devices[j].roomId && overlap(bounds(devices[i], true), bounds(devices[j], true))) {
        issues.push(`Säkerhetszoner överlappar: ${devices[i].productName} / ${devices[j].productName}`);
      }
    }
    obstacles.forEach(obstacle => {
      if (devices[i].roomId === obstacle.roomId && overlap(bounds(devices[i], true), bounds({ ...obstacle, y: 0 }, false))) {
        issues.push(`${devices[i].productName} kolliderar med ${obstacle.label || 'hinder'}`);
      }
    });
  }
  return issues;
}

function createLabelSprite(text, color = '#1e293b') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,.93)';
  ctx.strokeStyle = 'rgba(148,163,184,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 18);
  ctx.fill();
  ctx.stroke();
  ctx.font = '600 29px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  String(text || '').split('\n').forEach((line, index, lines) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * 36);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.4, 0.4, 1);
  return sprite;
}

function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach(material => {
      if (material.map) material.map.dispose();
      material.dispose();
    });
  });
}

function addEdges(mesh, color = '#ffffff') {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));
  mesh.add(edges);
}

function createWallSegment(start, end, height, y, color) {
  const length = distance2D(start, end);
  if (length < 0.01 || height <= 0.01) return null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, WALL_THICKNESS_M),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, transparent: true, opacity: 0.88 }),
  );
  mesh.position.set((start.x + end.x) / 2, y + height / 2, (start.z + end.z) / 2);
  mesh.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
  mesh.receiveShadow = true;
  addEdges(mesh, '#64748b');
  return mesh;
}

function createRoomObject(room, roomHeight, wallColor, active) {
  const group = new THREE.Group();
  room.walls.forEach(wall => {
    const doors = room.doors.filter(door => door.wallId === wall.id);
    wallSegments(wall, doors).forEach(segment => {
      const start = pointOnWall(wall, segment.start);
      const end = pointOnWall(wall, segment.end);
      if (segment.type === 'wall') {
        const mesh = createWallSegment(start, end, roomHeight, 0, active ? wallColor : '#cbd5e1');
        if (mesh) group.add(mesh);
      } else {
        const doorHeight = clamp(numberOr(segment.door.height, 2.1), 0.5, roomHeight);
        const mesh = createWallSegment(start, end, roomHeight - doorHeight, doorHeight, active ? wallColor : '#cbd5e1');
        if (mesh) group.add(mesh);
        const label = createLabelSprite(segment.door.label || 'Dörr', '#b45309');
        const center = pointOnWall(wall, (segment.start + segment.end) / 2);
        label.position.set(center.x, doorHeight + 0.15, center.z);
        label.scale.set(0.85, 0.25, 1);
        group.add(label);
      }
    });
  });
  return group;
}

function createDeviceObject(device, selected) {
  const group = new THREE.Group();
  group.position.set(device.x, device.y + device.height / 2, device.z);
  group.rotation.y = numberOr(device.rotationY);
  group.userData = { itemType: 'device', itemId: device.instanceId };
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(device.width, device.height, device.depth),
    new THREE.MeshStandardMaterial({ color: device.color, roughness: 0.4, metalness: 0.22 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = group.userData;
  addEdges(body, selected ? '#f97316' : '#ffffff');
  group.add(body);

  if (selected) {
    const clearance = device.clearance || {};
    const zone = new THREE.Mesh(
      new THREE.BoxGeometry(
        device.width + numberOr(clearance.left) + numberOr(clearance.right),
        device.height + numberOr(clearance.top) + numberOr(clearance.bottom),
        device.depth + numberOr(clearance.front) + numberOr(clearance.back),
      ),
      new THREE.MeshBasicMaterial({ color: '#f97316', wireframe: true, transparent: true, opacity: 0.3 }),
    );
    zone.position.y = (numberOr(clearance.top) - numberOr(clearance.bottom)) / 2;
    zone.userData = group.userData;
    group.add(zone);
  }

  if (device.type === 'inverter') {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(device.width * 0.7, device.height * 0.55, 0.012), new THREE.MeshStandardMaterial({ color: '#0f172a' }));
    screen.position.set(0, 0, device.depth / 2 + 0.007);
    screen.userData = group.userData;
    group.add(screen);
  }
  if (device.type === 'switch') {
    const toggle = new THREE.Mesh(new THREE.BoxGeometry(device.width * 0.35, device.height * 0.45, 0.02), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    toggle.position.set(0, 0, device.depth / 2 + 0.012);
    toggle.userData = group.userData;
    group.add(toggle);
  }
  if (device.type === 'switchboard') {
    const door = new THREE.Mesh(new THREE.BoxGeometry(device.width * 0.9, device.height * 0.9, 0.015), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    door.position.set(0, 0, device.depth / 2 + 0.009);
    door.userData = group.userData;
    group.add(door);
  }

  const label = createLabelSprite(`${device.typeLabel || 'Enhet'}\n${device.productName}`, selected ? '#f97316' : '#1e293b');
  label.position.set(0, device.height / 2 + 0.2, 0);
  label.userData = group.userData;
  group.add(label);
  return group;
}

function createObstacleObject(obstacle, selected) {
  const group = new THREE.Group();
  group.position.set(obstacle.x, obstacle.height / 2, obstacle.z);
  group.rotation.y = numberOr(obstacle.rotationY);
  group.userData = { itemType: 'obstacle', itemId: obstacle.id };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
    new THREE.MeshStandardMaterial({ color: obstacle.color || '#64748b', roughness: 0.65, transparent: true, opacity: 0.84 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = group.userData;
  addEdges(mesh, selected ? '#f97316' : '#e2e8f0');
  group.add(mesh);
  const label = createLabelSprite(obstacle.label || 'Hinder', selected ? '#f97316' : '#1e293b');
  label.position.set(0, obstacle.height / 2 + 0.18, 0);
  label.userData = group.userData;
  group.add(label);
  return group;
}

function StudioScene({ rooms, activeRoomId, devices, obstacles, selected, roomHeight, wallColor, floorColor, onSelect, onMoveItem, onClear }) {
  const containerRef = useRef(null);
  const rootRef = useRef(null);
  const callbacksRef = useRef({ onSelect, onMoveItem, onClear });

  useEffect(() => {
    callbacksRef.current = { onSelect, onMoveItem, onClear };
  }, [onSelect, onMoveItem, onClear]);

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
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight('#ffffff', 0.65));
    const light = new THREE.DirectionalLight('#ffffff', 1.1);
    light.position.set(7, 10, 6);
    light.castShadow = true;
    scene.add(light);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(DRAW_WIDTH_M, DRAW_DEPTH_M),
      new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.userData.isFloor = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(Math.max(DRAW_WIDTH_M, DRAW_DEPTH_M), 28, '#94a3b8', '#cbd5e1');
    grid.position.y = 0.005;
    scene.add(grid);

    const root = new THREE.Group();
    rootRef.current = root;
    scene.add(root);

    const orbit = { radius: 10.5, theta: Math.PI / 4, phi: 0.86, target: new THREE.Vector3(0, 1.1, 0) };
    const updateCamera = () => {
      camera.position.set(
        orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.target.y + orbit.radius * Math.cos(orbit.phi),
        orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      );
      camera.lookAt(orbit.target);
    };
    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      updateCamera();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const pointerState = { down: false, moved: false, orbit: false, item: null, x: 0, y: 0 };
    const setPointer = event => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    const findItem = event => {
      setPointer(event);
      return raycaster.intersectObjects(root.children, true).map(hit => {
        let object = hit.object;
        while (object && !object.userData?.itemType) object = object.parent;
        return object?.userData?.itemType ? object.userData : null;
      }).find(Boolean);
    };

    const handleDown = event => {
      pointerState.down = true;
      pointerState.moved = false;
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      pointerState.item = findItem(event) || null;
      pointerState.orbit = !pointerState.item;
      if (pointerState.item) callbacksRef.current.onSelect(pointerState.item.itemType, pointerState.item.itemId);
      else callbacksRef.current.onClear();
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = pointerState.item ? 'move' : 'grabbing';
    };

    const handleMove = event => {
      if (!pointerState.down) return;
      const dx = event.clientX - pointerState.x;
      const dy = event.clientY - pointerState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pointerState.moved = true;
      if (pointerState.item) {
        setPointer(event);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          callbacksRef.current.onMoveItem(pointerState.item.itemType, pointerState.item.itemId, snap(hitPoint.x), snap(hitPoint.z));
        }
      } else if (pointerState.orbit) {
        if (event.shiftKey) {
          orbit.target.x -= dx * 0.01;
          orbit.target.z += dy * 0.01;
        } else {
          orbit.theta -= dx * 0.006;
          orbit.phi = clamp(orbit.phi + dy * 0.006, 0.2, Math.PI / 2.05);
        }
        updateCamera();
      }
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
    };

    const handleUp = event => {
      pointerState.down = false;
      pointerState.item = null;
      pointerState.orbit = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grab';
    };

    const handleWheel = event => {
      event.preventDefault();
      orbit.radius = clamp(orbit.radius + event.deltaY * 0.008, 2.5, 18);
      updateCamera();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    renderer.domElement.addEventListener('pointerdown', handleDown);
    renderer.domElement.addEventListener('pointermove', handleMove);
    renderer.domElement.addEventListener('pointerup', handleUp);
    renderer.domElement.addEventListener('pointercancel', handleUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.style.cursor = 'grab';

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    resize();
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handleDown);
      renderer.domElement.removeEventListener('pointermove', handleMove);
      renderer.domElement.removeEventListener('pointerup', handleUp);
      renderer.domElement.removeEventListener('pointercancel', handleUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.children.forEach(disposeObject);
    root.clear();
    rooms.forEach(room => root.add(createRoomObject(room, roomHeight, wallColor, room.id === activeRoomId)));
    obstacles.forEach(obstacle => root.add(createObstacleObject(obstacle, selected?.type === 'obstacle' && selected.id === obstacle.id)));
    devices.forEach(device => root.add(createDeviceObject(device, selected?.type === 'device' && selected.id === device.instanceId)));
  }, [rooms, activeRoomId, devices, obstacles, selected, roomHeight, wallColor, floorColor]);

  return <div ref={containerRef} className="h-full min-h-[690px] w-full" />;
}

function NumberField({ label, value, onChange, step = MOVE_STEP_M, suffix = 'm' }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-600">
      <span>{label}</span>
      <div className="relative">
        <Input type="number" step={step} value={Number(numberOr(value)).toFixed(step < 0.1 ? 2 : 1)} onChange={event => onChange(event.target.value)} className="h-8 pr-8 font-mono text-xs" />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
      </div>
    </label>
  );
}

function itemIcon(type) {
  if (type === 'battery') return BatteryIcon;
  if (type === 'inverter') return Zap;
  if (type === 'switchboard') return Building2;
  return Move;
}

export default function BatteryPlannerV3({ project, onUpdate }) {
  const initial = useMemo(() => parseLayout(project.battery_layout_data), [project.battery_layout_data]);
  const [mode, setMode] = useState('plan');
  const [rooms, setRooms] = useState(initial.rooms);
  const [activeRoomId, setActiveRoomId] = useState(initial.rooms[0]?.id || '');
  const [devices, setDevices] = useState(initial.devices);
  const [obstacles, setObstacles] = useState(initial.obstacles);
  const [roomHeight, setRoomHeight] = useState(initial.roomHeight);
  const [wallColor, setWallColor] = useState(initial.wallColor);
  const [floorColor, setFloorColor] = useState(initial.floorColor);
  const [imageUrl, setImageUrl] = useState(project.battery_image_url || '');
  const [photoItems, setPhotoItems] = useState(initial.photoItems);
  const [selected, setSelected] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPhotoBattery, setSelectedPhotoBattery] = useState('');
  const [tool, setTool] = useState('select');
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [mousePoint, setMousePoint] = useState(null);
  const [drag2D, setDrag2D] = useState(null);
  const [saving, setSaving] = useState(false);
  const [doorConfig, setDoorConfig] = useState({ width: 0.9, height: 2.1, label: 'Dörr' });
  const [obstacleConfig, setObstacleConfig] = useState({ label: 'Hinder', width: 1, depth: 0.5, height: 1, color: '#64748b' });
  const svgRef = useRef(null);

  useEffect(() => {
    const next = parseLayout(project.battery_layout_data);
    setRooms(next.rooms);
    setActiveRoomId(next.rooms[0]?.id || '');
    setDevices(next.devices);
    setObstacles(next.obstacles);
    setRoomHeight(next.roomHeight);
    setWallColor(next.wallColor);
    setFloorColor(next.floorColor);
    setImageUrl(project.battery_image_url || '');
    setPhotoItems(next.photoItems);
    setSelected(null);
    setDrawingPoints([]);
    setMousePoint(null);
  }, [project?.id, project?.battery_layout_data, project?.battery_image_url]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-battery-room-v3'],
    queryFn: () => listVisibleProducts('-created_date'),
  });

  const catalog = useMemo(() => products
    .filter(product => CATEGORY_META[product.category] && product.is_active !== false)
    .map(normalizeCatalogProduct)
    .filter(Boolean), [products]);
  const batteries = useMemo(() => catalog.filter(item => item.type === 'battery'), [catalog]);
  const activeRoom = rooms.find(room => room.id === activeRoomId) || rooms[0];
  const selectedCatalog = catalog.find(item => item.productId === selectedProductId) || catalog[0] || null;
  const selectedDevice = selected?.type === 'device' ? devices.find(device => device.instanceId === selected.id) || null : null;
  const selectedObstacle = selected?.type === 'obstacle' ? obstacles.find(obstacle => obstacle.id === selected.id) || null : null;
  const selectedDoor = selected?.type === 'door' ? rooms.flatMap(room => room.doors.map(door => ({ ...door, roomId: room.id }))).find(door => door.id === selected.id) || null : null;
  const issues = useMemo(() => studioIssues(devices, obstacles, roomHeight), [devices, obstacles, roomHeight]);
  const totalWalls = rooms.reduce((sum, room) => sum + room.walls.length, 0);
  const totalDoors = rooms.reduce((sum, room) => sum + room.doors.length, 0);

  useEffect(() => {
    if (!selectedProductId && catalog[0]?.productId) setSelectedProductId(catalog[0].productId);
  }, [catalog, selectedProductId]);

  const svgPoint = event => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: snap(((event.clientX - rect.left) / rect.width - 0.5) * DRAW_WIDTH_M, GRID_STEP_M),
      z: snap(((event.clientY - rect.top) / rect.height - 0.5) * DRAW_DEPTH_M, GRID_STEP_M),
    };
  };

  const updateRoom = (roomId, updater) => setRooms(current => current.map(room => room.id === roomId ? (typeof updater === 'function' ? updater(room) : { ...room, ...updater }) : room));

  const addRoom = () => {
    const room = createRoom(rooms.length + 1);
    setRooms(current => [...current, room]);
    setActiveRoomId(room.id);
    setTool('wall');
    setDrawingPoints([]);
    setSelected(null);
  };

  const deleteActiveRoom = () => {
    if (!activeRoom || rooms.length <= 1) return;
    const next = rooms.filter(room => room.id !== activeRoom.id);
    setRooms(next);
    setDevices(current => current.filter(device => device.roomId !== activeRoom.id));
    setObstacles(current => current.filter(obstacle => obstacle.roomId !== activeRoom.id));
    setActiveRoomId(next[0]?.id || '');
    setSelected(null);
  };

  const addWall = (start, end) => {
    if (!activeRoom || distance2D(start, end) < GRID_STEP_M / 2) return;
    updateRoom(activeRoom.id, room => ({ ...room, walls: [...room.walls, { id: makeId('wall'), x1: start.x, z1: start.z, x2: end.x, z2: end.z }] }));
  };

  const handlePlanClick = event => {
    if (!svgRef.current || drag2D) return;
    const point = svgPoint(event);
    if (tool === 'wall') {
      setDrawingPoints(current => {
        if (current.length > 2 && distance2D(point, current[0]) <= GRID_STEP_M * 0.75) {
          addWall(current[current.length - 1], current[0]);
          setMousePoint(null);
          return [];
        }
        if (current.length) addWall(current[current.length - 1], point);
        return [...current, point];
      });
      return;
    }
    if (tool === 'door') {
      const nearest = nearestWall(point, rooms);
      if (!nearest || nearest.distance > 0.6) return;
      const length = wallLength(nearest.wall);
      const half = Math.min(doorConfig.width / Math.max(length, 0.01) / 2, 0.45);
      const offset = clamp(nearest.t, half, 1 - half);
      const door = { id: makeId('door'), wallId: nearest.wall.id, roomId: nearest.room.id, offset, width: doorConfig.width, height: doorConfig.height, label: doorConfig.label };
      updateRoom(nearest.room.id, room => ({ ...room, doors: [...room.doors, door] }));
      setActiveRoomId(nearest.room.id);
      setSelected({ type: 'door', id: door.id });
      return;
    }
    if (tool === 'obstacle' && activeRoom) {
      const obstacle = { id: makeId('obstacle'), roomId: activeRoom.id, x: point.x, z: point.z, rotationY: 0, ...obstacleConfig };
      setObstacles(current => [...current, obstacle]);
      setSelected({ type: 'obstacle', id: obstacle.id });
      return;
    }
    if (tool === 'select') setSelected(null);
  };

  const handlePlanMove = event => {
    const point = svgPoint(event);
    if (drag2D) {
      if (drag2D.type === 'device') setDevices(current => current.map(device => device.instanceId === drag2D.id ? { ...device, x: point.x, z: point.z } : device));
      if (drag2D.type === 'obstacle') setObstacles(current => current.map(obstacle => obstacle.id === drag2D.id ? { ...obstacle, x: point.x, z: point.z } : obstacle));
      return;
    }
    if (tool === 'wall' && drawingPoints.length) setMousePoint(point);
  };

  const start2DDrag = (event, type, id) => {
    if (tool !== 'select') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelected({ type, id });
    setDrag2D({ type, id });
  };

  const end2DDrag = event => {
    if (!drag2D) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDrag2D(null);
  };

  const addDevice = () => {
    if (!selectedCatalog || !activeRoom) return;
    const seed = createDevice(selectedCatalog, activeRoom.id);
    const placement = selectedCatalog.wallMounted ? wallPlacement(seed, activeRoom.walls) : null;
    const device = createDevice(selectedCatalog, activeRoom.id, placement || {});
    setDevices(current => [...current, device]);
    setSelected({ type: 'device', id: device.instanceId });
  };

  const updateSelectedItem = patch => {
    if (selectedDevice) setDevices(current => current.map(device => device.instanceId === selectedDevice.instanceId ? { ...device, ...patch } : device));
    if (selectedObstacle) setObstacles(current => current.map(obstacle => obstacle.id === selectedObstacle.id ? { ...obstacle, ...patch } : obstacle));
  };

  const moveItem = (type, id, x, z) => {
    if (type === 'device') setDevices(current => current.map(device => device.instanceId === id ? { ...device, x, z } : device));
    if (type === 'obstacle') setObstacles(current => current.map(obstacle => obstacle.id === id ? { ...obstacle, x, z } : obstacle));
  };

  const rotateSelected = degrees => {
    const item = selectedDevice || selectedObstacle;
    if (!item) return;
    updateSelectedItem({ rotationY: numberOr(item.rotationY) + degrees * Math.PI / 180 });
  };

  const mountSelected = () => {
    if (!selectedDevice) return;
    const room = rooms.find(item => item.id === selectedDevice.roomId) || activeRoom;
    const placement = wallPlacement(selectedDevice, room?.walls || []);
    if (placement) updateSelectedItem({ x: snap(placement.x), z: snap(placement.z), rotationY: placement.rotationY });
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.type === 'device') setDevices(current => current.filter(device => device.instanceId !== selected.id));
    if (selected.type === 'obstacle') setObstacles(current => current.filter(obstacle => obstacle.id !== selected.id));
    if (selected.type === 'door') setRooms(current => current.map(room => ({ ...room, doors: room.doors.filter(door => door.id !== selected.id) })));
    setSelected(null);
  };

  const clearAll = () => {
    const room = createRoom(1);
    setRooms([room]);
    setActiveRoomId(room.id);
    setDevices([]);
    setObstacles([]);
    setSelected(null);
    setDrawingPoints([]);
    setTool('wall');
  };

  const save = async () => {
    setSaving(true);
    try {
      const flatWalls = rooms.flatMap(room => room.walls);
      const flatDoors = rooms.flatMap(room => room.doors);
      await onUpdate({
        battery_image_url: imageUrl,
        battery_layout_data: JSON.stringify({
          version: 3,
          roomHeight,
          rooms,
          walls: flatWalls,
          doors: flatDoors,
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

  const uploadImage = async (dataUrl, file) => {
    const result = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(result.file_url || result.url || dataUrl);
  };

  const addPhotoItem = () => {
    const product = products.find(item => item.id === selectedPhotoBattery);
    if (!product) return;
    setPhotoItems(current => [...current, { id: makeId('photo-item'), product_id: product.id, product_name: product.name, x: 35, y: 35, scale: 1 }]);
  };

  const allDevicesForPlan = devices;
  const allObstaclesForPlan = obstacles;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold"><BatteryIcon className="h-5 w-5 text-emerald-600" />Batteri- och teknikrumsplanering</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{rooms.length} rum</Badge>
            <Badge variant="secondary">{totalWalls} väggar</Badge>
            <Badge variant="secondary">{totalDoors} dörrar</Badge>
            <Badge variant="secondary">{devices.length} enheter</Badge>
            <Badge variant="secondary">{obstacles.length} hinder</Badge>
            {issues.length > 0 && <Badge className="bg-amber-100 text-amber-800">{issues.length} kontrollpunkter</Badge>}
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Sparar...' : 'Spara'}</Button>
      </div>

      <Tabs value={mode} onValueChange={setMode} className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-3 lg:w-[560px]">
          <TabsTrigger value="plan" className="gap-2"><Ruler className="h-4 w-4" />Planritning</TabsTrigger>
          <TabsTrigger value="studio" className="gap-2"><Box className="h-4 w-4" />3D Studio</TabsTrigger>
          <TabsTrigger value="photo" className="gap-2"><Upload className="h-4 w-4" />Foto/2D</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between"><div className="text-sm font-semibold">Rum</div><Button size="sm" variant="outline" onClick={addRoom}><Plus className="mr-1 h-4 w-4" />Nytt rum</Button></div>
                <Select value={activeRoomId} onValueChange={value => { setActiveRoomId(value); setDrawingPoints([]); setSelected(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{rooms.map(room => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent>
                </Select>
                {activeRoom && <Input value={activeRoom.name} onChange={event => updateRoom(activeRoom.id, { name: event.target.value })} className="h-8" />}
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Rumshöjd" value={roomHeight} step={0.1} onChange={value => setRoomHeight(Math.max(1.8, snap(value, 0.1)))} />
                  <Button variant="destructive" size="sm" onClick={deleteActiveRoom} disabled={rooms.length <= 1} className="mt-5"><Trash2 className="mr-1 h-4 w-4" />Ta bort rum</Button>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-semibold">Verktyg</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}><MousePointer2 className="mr-1 h-4 w-4" />Flytta</Button>
                  <Button size="sm" variant={tool === 'wall' ? 'default' : 'outline'} onClick={() => { setTool('wall'); setSelected(null); }}><Ruler className="mr-1 h-4 w-4" />Vägg</Button>
                  <Button size="sm" variant={tool === 'door' ? 'default' : 'outline'} onClick={() => setTool('door')}><DoorOpen className="mr-1 h-4 w-4" />Dörr</Button>
                  <Button size="sm" variant={tool === 'obstacle' ? 'default' : 'outline'} onClick={() => setTool('obstacle')}><Layers className="mr-1 h-4 w-4" />Hinder</Button>
                </div>
                {tool === 'wall' && <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">Klicka punkt för punkt. Klicka på första punkten för att stänga rummet. Välj Nytt rum för nästa rum.</div>}
                {tool === 'door' && (
                  <div className="space-y-2 rounded-lg border bg-white p-3">
                    <Input value={doorConfig.label} onChange={event => setDoorConfig(current => ({ ...current, label: event.target.value }))} className="h-8" placeholder="Dörrnamn" />
                    <div className="grid grid-cols-2 gap-2"><NumberField label="Bredd" value={doorConfig.width} step={0.1} onChange={value => setDoorConfig(current => ({ ...current, width: Math.max(0.4, numberOr(value)) }))} /><NumberField label="Höjd" value={doorConfig.height} step={0.1} onChange={value => setDoorConfig(current => ({ ...current, height: Math.max(1.5, numberOr(value)) }))} /></div>
                    <div className="text-[11px] text-slate-500">Klicka på eller nära en vägg för att skapa en riktig öppning.</div>
                  </div>
                )}
                {tool === 'obstacle' && (
                  <div className="space-y-2 rounded-lg border bg-white p-3">
                    <Input value={obstacleConfig.label} onChange={event => setObstacleConfig(current => ({ ...current, label: event.target.value }))} className="h-8" placeholder="Hinder" />
                    <div className="grid grid-cols-3 gap-1"><NumberField label="Bredd" value={obstacleConfig.width} step={0.1} onChange={value => setObstacleConfig(current => ({ ...current, width: Math.max(0.1, numberOr(value)) }))} /><NumberField label="Djup" value={obstacleConfig.depth} step={0.1} onChange={value => setObstacleConfig(current => ({ ...current, depth: Math.max(0.1, numberOr(value)) }))} /><NumberField label="Höjd" value={obstacleConfig.height} step={0.1} onChange={value => setObstacleConfig(current => ({ ...current, height: Math.max(0.1, numberOr(value)) }))} /></div>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-semibold">Produkter</div>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger><SelectValue placeholder="Välj produkt" /></SelectTrigger>
                  <SelectContent>{catalog.map(item => <SelectItem key={item.productId} value={item.productId}>{item.typeLabel} – {item.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button onClick={addDevice} disabled={!selectedCatalog || !activeRoom} className="w-full"><Plus className="mr-2 h-4 w-4" />Lägg till i {activeRoom?.name || 'rum'}</Button>
                <div className="text-[11px] text-slate-500">Batteri, växelriktare, brytare och elcentral hämtas från Produktsortiment.</div>
              </div>

              {(selectedDevice || selectedObstacle || selectedDoor) && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between"><div className="text-sm font-semibold">Markerat objekt</div><Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={deleteSelected}><Trash2 className="h-4 w-4" /></Button></div>
                  {selectedDevice && <div className="rounded-lg border bg-white p-2 text-xs"><b>{selectedDevice.typeLabel}</b><div>{selectedDevice.productName}</div></div>}
                  {selectedObstacle && <div className="rounded-lg border bg-white p-2 text-xs"><b>Hinder</b><div>{selectedObstacle.label}</div></div>}
                  {selectedDoor && <div className="rounded-lg border bg-white p-2 text-xs"><b>Dörröppning</b><div>{selectedDoor.label} · {formatM(selectedDoor.width)}</div></div>}
                  {(selectedDevice || selectedObstacle) && (
                    <>
                      <div className="grid grid-cols-2 gap-2"><NumberField label="X" value={(selectedDevice || selectedObstacle).x} onChange={value => updateSelectedItem({ x: snap(value) })} /><NumberField label="Z" value={(selectedDevice || selectedObstacle).z} onChange={value => updateSelectedItem({ z: snap(value) })} /></div>
                      <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => rotateSelected(-90)}><RotateCcw className="mr-1 h-4 w-4" />-90°</Button><Button variant="outline" size="sm" onClick={() => rotateSelected(90)}><RotateCcw className="mr-1 h-4 w-4 rotate-180" />+90°</Button></div>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 border-t pt-3"><Button variant="outline" onClick={() => { setDrawingPoints([]); setMousePoint(null); }}><RotateCcw className="mr-1 h-4 w-4" />Avsluta linje</Button><Button variant="destructive" onClick={clearAll}><Eraser className="mr-1 h-4 w-4" />Rensa allt</Button></div>
            </div>

            <div className="relative min-h-[650px] overflow-hidden rounded-xl border bg-slate-100">
              <svg
                ref={svgRef}
                viewBox={`${-DRAW_WIDTH_M / 2} ${-DRAW_DEPTH_M / 2} ${DRAW_WIDTH_M} ${DRAW_DEPTH_M}`}
                preserveAspectRatio="xMidYMid meet"
                className={`h-full min-h-[650px] w-full ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
                onClick={handlePlanClick}
                onPointerMove={handlePlanMove}
                onPointerUp={end2DDrag}
                onPointerCancel={end2DDrag}
              >
                <defs><pattern id="battery-v3-grid" width={GRID_STEP_M} height={GRID_STEP_M} patternUnits="userSpaceOnUse"><path d={`M ${GRID_STEP_M} 0 L 0 0 0 ${GRID_STEP_M}`} fill="none" stroke="#cbd5e1" strokeWidth="0.012" /></pattern></defs>
                <rect x={-DRAW_WIDTH_M / 2} y={-DRAW_DEPTH_M / 2} width={DRAW_WIDTH_M} height={DRAW_DEPTH_M} fill="white" />
                <rect x={-DRAW_WIDTH_M / 2} y={-DRAW_DEPTH_M / 2} width={DRAW_WIDTH_M} height={DRAW_DEPTH_M} fill="url(#battery-v3-grid)" />

                {rooms.map(room => (
                  <g key={room.id} opacity={room.id === activeRoomId ? 1 : 0.55}>
                    {room.walls.map(wall => (
                      <g key={wall.id}>
                        {wallSegments(wall, room.doors).map((segment, index) => {
                          const start = pointOnWall(wall, segment.start);
                          const end = pointOnWall(wall, segment.end);
                          return segment.type === 'wall' ? <line key={index} x1={start.x} y1={start.z} x2={end.x} y2={end.z} stroke={room.id === activeRoomId ? '#2563eb' : '#94a3b8'} strokeWidth="0.09" strokeLinecap="round" /> : null;
                        })}
                        <text x={(wall.x1 + wall.x2) / 2} y={(wall.z1 + wall.z2) / 2 - 0.13} textAnchor="middle" fontSize="0.16" fill="#475569">{formatM(wallLength(wall))}</text>
                      </g>
                    ))}
                    {room.doors.map(door => {
                      const wall = room.walls.find(item => item.id === door.wallId);
                      if (!wall) return null;
                      const interval = doorInterval(wall, door);
                      const center = pointOnWall(wall, interval.center);
                      const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);
                      return <g key={door.id} onClick={event => { event.stopPropagation(); setSelected({ type: 'door', id: door.id }); setActiveRoomId(room.id); }} style={{ cursor: 'pointer' }}><line x1={pointOnWall(wall, interval.start).x} y1={pointOnWall(wall, interval.start).z} x2={pointOnWall(wall, interval.end).x} y2={pointOnWall(wall, interval.end).z} stroke="#f59e0b" strokeWidth="0.045" strokeDasharray="0.08 0.05" /><path d={`M ${center.x} ${center.z} l ${Math.cos(angle + Math.PI / 2) * door.width * 0.45} ${Math.sin(angle + Math.PI / 2) * door.width * 0.45}`} stroke="#f59e0b" strokeWidth="0.035" /><text x={center.x} y={center.z - 0.16} textAnchor="middle" fontSize="0.14" fill="#b45309">{door.label}</text></g>;
                    })}
                    {room.walls.length > 0 && <text x={room.walls.reduce((sum, wall) => sum + wall.x1 + wall.x2, 0) / (room.walls.length * 2)} y={room.walls.reduce((sum, wall) => sum + wall.z1 + wall.z2, 0) / (room.walls.length * 2)} textAnchor="middle" fontSize="0.22" fontWeight="700" fill={room.id === activeRoomId ? '#0f172a' : '#64748b'}>{room.name}</text>}
                  </g>
                ))}

                {allObstaclesForPlan.map(obstacle => (
                  <g key={obstacle.id} transform={`translate(${obstacle.x} ${obstacle.z}) rotate(${numberOr(obstacle.rotationY) * 180 / Math.PI})`} onPointerDown={event => start2DDrag(event, 'obstacle', obstacle.id)} style={{ cursor: tool === 'select' ? 'move' : 'default' }}>
                    <rect x={-obstacle.width / 2} y={-obstacle.depth / 2} width={obstacle.width} height={obstacle.depth} fill={obstacle.color} fillOpacity={selected?.type === 'obstacle' && selected.id === obstacle.id ? 0.5 : 0.25} stroke={selected?.type === 'obstacle' && selected.id === obstacle.id ? '#f97316' : obstacle.color} strokeWidth="0.05" />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize="0.15" fontWeight="600" fill="#334155" pointerEvents="none">{obstacle.label}</text>
                  </g>
                ))}

                {allDevicesForPlan.map(device => {
                  const footprint = rotatedFootprint(device, false);
                  return <g key={device.instanceId} transform={`translate(${device.x} ${device.z}) rotate(${numberOr(device.rotationY) * 180 / Math.PI})`} onPointerDown={event => start2DDrag(event, 'device', device.instanceId)} style={{ cursor: tool === 'select' ? 'move' : 'default' }}><rect x={-footprint.width / 2} y={-footprint.depth / 2} width={footprint.width} height={footprint.depth} rx="0.04" fill={device.color} fillOpacity="0.7" stroke={selected?.type === 'device' && selected.id === device.instanceId ? '#f97316' : '#ffffff'} strokeWidth={selected?.type === 'device' && selected.id === device.instanceId ? '0.08' : '0.035'} /><text textAnchor="middle" dominantBaseline="middle" fontSize="0.13" fontWeight="700" fill="white" pointerEvents="none">{device.typeLabel}</text></g>;
                })}

                {drawingPoints.length > 0 && mousePoint && (() => { const start = drawingPoints[drawingPoints.length - 1]; return <line x1={start.x} y1={start.z} x2={mousePoint.x} y2={mousePoint.z} stroke="#f59e0b" strokeWidth="0.045" strokeDasharray="0.1 0.08" />; })()}
                {drawingPoints.map((point, index) => <circle key={`${point.x}-${point.z}-${index}`} cx={point.x} cy={point.z} r="0.09" fill={index === 0 && drawingPoints.length > 2 ? '#22c55e' : '#f59e0b'} />)}
              </svg>
              <div className="absolute bottom-3 right-3 rounded-lg border bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow">1 ruta = 0,25 m · Flytta-läge: dra enheter och hinder direkt</div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="studio" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
            <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Aktivt rum</div>
                <Select value={activeRoomId} onValueChange={setActiveRoomId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rooms.map(room => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-semibold">Lägg till produkt</div>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}><SelectTrigger><SelectValue placeholder="Välj produkt" /></SelectTrigger><SelectContent>{catalog.map(item => <SelectItem key={item.productId} value={item.productId}>{item.typeLabel} – {item.name}</SelectItem>)}</SelectContent></Select>
                <Button onClick={addDevice} disabled={!selectedCatalog} className="w-full"><Plus className="mr-2 h-4 w-4" />Lägg till</Button>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><b>Direktflytt:</b> klicka och håll på batteri, växelriktare, brytare, elcentral eller hinder och dra över golvet. Dra i tom yta för att rotera kameran. Shift + dra panorerar.</div>

              {(selectedDevice || selectedObstacle) ? (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between"><div className="text-sm font-semibold">Markerat objekt</div><Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={deleteSelected}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="rounded-lg border bg-white p-3 text-xs"><b>{selectedDevice?.typeLabel || 'Hinder'}</b><div>{selectedDevice?.productName || selectedObstacle?.label}</div></div>
                  <div className="grid grid-cols-3 gap-2"><NumberField label="X" value={(selectedDevice || selectedObstacle).x} onChange={value => updateSelectedItem({ x: snap(value) })} /><NumberField label="Y" value={selectedDevice?.y || 0} onChange={value => selectedDevice && updateSelectedItem({ y: snap(value) })} /><NumberField label="Z" value={(selectedDevice || selectedObstacle).z} onChange={value => updateSelectedItem({ z: snap(value) })} /></div>
                  <div className="grid grid-cols-3 gap-2"><Button variant="outline" size="icon" onClick={() => updateSelectedItem({ x: snap((selectedDevice || selectedObstacle).x - MOVE_STEP_M) })}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => updateSelectedItem({ z: snap((selectedDevice || selectedObstacle).z - MOVE_STEP_M) })}><ArrowUp className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => updateSelectedItem({ x: snap((selectedDevice || selectedObstacle).x + MOVE_STEP_M) })}><ArrowRight className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => selectedDevice && updateSelectedItem({ y: snap(selectedDevice.y - MOVE_STEP_M) })}><ArrowDown className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => updateSelectedItem({ z: snap((selectedDevice || selectedObstacle).z + MOVE_STEP_M) })}><Move className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => selectedDevice && updateSelectedItem({ y: snap(selectedDevice.y + MOVE_STEP_M) })}><ArrowUp className="h-4 w-4" /></Button></div>
                  <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => rotateSelected(-90)}><RotateCcw className="mr-1 h-4 w-4" />-90°</Button><Button variant="outline" size="sm" onClick={() => rotateSelected(90)}><RotateCcw className="mr-1 h-4 w-4 rotate-180" />+90°</Button></div>
                  {selectedDevice?.wallMounted && <Button variant="outline" size="sm" onClick={mountSelected} className="w-full"><Ruler className="mr-2 h-4 w-4" />Fäst på närmaste vägg</Button>}
                </div>
              ) : <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-500">Klicka på ett objekt i 3D-vyn.</div>}

              {issues.length > 0 && <div className="space-y-2 border-t pt-3"><div className="flex items-center gap-2 text-sm font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" />Kontroll</div>{issues.slice(0, 5).map(issue => <div key={issue} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{issue}</div>)}</div>}
              <div className="grid grid-cols-2 gap-2 border-t pt-3"><label className="text-xs">Väggfärg<input type="color" value={wallColor} onChange={event => setWallColor(event.target.value)} className="ml-2 h-7 w-10" /></label><label className="text-xs">Golvfärg<input type="color" value={floorColor} onChange={event => setFloorColor(event.target.value)} className="ml-2 h-7 w-10" /></label></div>
            </div>
            <div className="relative min-h-[690px] overflow-hidden rounded-xl border bg-slate-100"><StudioScene rooms={rooms} activeRoomId={activeRoomId} devices={devices} obstacles={obstacles} selected={selected} roomHeight={roomHeight} wallColor={wallColor} floorColor={floorColor} onSelect={(type, id) => setSelected({ type, id })} onMoveItem={moveItem} onClear={() => setSelected(null)} /></div>
          </div>
        </TabsContent>

        <TabsContent value="photo" className="mt-0 space-y-4">
          {imageUrl && <div className="flex flex-wrap items-end gap-3"><div className="min-w-[240px] flex-1"><p className="mb-1 text-sm font-medium">Välj batteri</p><Select value={selectedPhotoBattery} onValueChange={setSelectedPhotoBattery}><SelectTrigger><SelectValue placeholder="Välj batteri" /></SelectTrigger><SelectContent>{batteries.map(item => <SelectItem key={item.productId} value={item.productId}>{item.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={addPhotoItem} disabled={!selectedPhotoBattery}><Plus className="mr-2 h-4 w-4" />Lägg till batteri</Button></div>}
          <ImageCanvas imageUrl={imageUrl} items={photoItems} onItemsChange={setPhotoItems} onImageUpload={uploadImage} label="Ladda upp bild för batteriplacering" itemRenderer={item => <div className="rounded border-2 border-emerald-300 bg-emerald-500/70 px-3 py-2 text-xs font-semibold text-white shadow">{item.product_name}</div>} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
