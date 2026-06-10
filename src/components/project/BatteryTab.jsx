/* eslint-disable react/no-unknown-property */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Billboard, ContactShadows, Edges, Grid, Line, OrbitControls, Text } from '@react-three/drei';
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
    photoItems: [],
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

function Wall3D({ wall, roomHeight }) {
  const length = wallLength(wall);
  const centerX = (wall.x1 + wall.x2) / 2;
  const centerZ = (wall.z1 + wall.z2) / 2;
  const angle = -Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);

  return (
    <mesh position={[centerX, roomHeight / 2, centerZ]} rotation={[0, angle, 0]} receiveShadow>
      <boxGeometry args={[length, roomHeight, WALL_THICKNESS_M]} />
      <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.05} transparent opacity={0.88} />
      <Edges color="#64748b" />
    </mesh>
  );
}

function Device3D({ device, isSelected, onSelect }) {
  const clearance = device.clearance || {};
  const clearanceWidth = device.width + (clearance.left || 0) + (clearance.right || 0);
  const clearanceHeight = device.height + (clearance.top || 0) + (clearance.bottom || 0);
  const clearanceDepth = device.depth + (clearance.front || 0) + (clearance.back || 0);
  const clearanceOffsetY = ((clearance.top || 0) - (clearance.bottom || 0)) / 2;
  const clearanceOffsetZ = ((clearance.front || 0) - (clearance.back || 0)) / 2;
  const labelY = device.height / 2 + 0.22;

  return (
    <group
      position={[device.x, device.y + device.height / 2, device.z]}
      rotation={[0, numberOr(device.rotationY, 0), 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {isSelected && (
        <mesh position={[0, clearanceOffsetY, clearanceOffsetZ]}>
          <boxGeometry args={[clearanceWidth, clearanceHeight, clearanceDepth]} />
          <meshBasicMaterial color="#f97316" wireframe transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}

      {isSelected && (
        <mesh position={[0, -device.height / 2 + 0.006, clearanceOffsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[clearanceWidth, clearanceDepth]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      )}

      <mesh castShadow receiveShadow>
        <boxGeometry args={[device.width, device.height, device.depth]} />
        <meshStandardMaterial color={device.color} roughness={0.38} metalness={0.28} />
        <Edges color="#ffffff" />
      </mesh>

      {device.type === 'inverter' && (
        <mesh position={[0, 0.02, device.depth / 2 + 0.006]}>
          <boxGeometry args={[device.width * 0.72, device.height * 0.58, 0.012]} />
          <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.2} />
        </mesh>
      )}

      {device.type === 'battery' && (
        <>
          <mesh position={[0, device.height * 0.18, device.depth / 2 + 0.006]}>
            <boxGeometry args={[device.width * 0.82, 0.018, 0.012]} />
            <meshStandardMaterial color="#bbf7d0" roughness={0.5} />
          </mesh>
          <mesh position={[0, -device.height * 0.18, device.depth / 2 + 0.006]}>
            <boxGeometry args={[device.width * 0.82, 0.018, 0.012]} />
            <meshStandardMaterial color="#bbf7d0" roughness={0.5} />
          </mesh>
        </>
      )}

      <Billboard position={[0, labelY, 0]}>
        <Text
          text={`${shortLabel(device.productName)}\n${formatMeters(device.width)} x ${formatMeters(device.height)} x ${formatMeters(device.depth)}`}
          fontSize={0.095}
          color={isSelected ? '#f97316' : '#cbd5e1'}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
        />
      </Billboard>

      {isSelected && device.y > 0 && (
        <group position={[-device.width / 2 - 0.14, -device.height / 2, device.depth / 2 + 0.08]}>
          <Line points={[[0, 0, 0], [0, -device.y, 0]]} color="#38bdf8" lineWidth={1.5} />
          <Billboard position={[0, -device.y / 2, 0]}>
            <Text text={formatMeters(device.y)} fontSize={0.085} color="#38bdf8" anchorX="center" anchorY="middle" />
          </Billboard>
        </group>
      )}
    </group>
  );
}

function StudioScene({ walls, devices, selectedDeviceId, roomHeight, onSelectDevice, onClearSelection }) {
  return (
    <Canvas camera={{ position: [5.4, 5.2, 7.5], fov: 42 }} shadows onPointerMissed={onClearSelection}>
      <color attach="background" args={['#05070c']} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[7, 10, 6]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-4, 4, -5]} intensity={0.55} color="#38bdf8" />

      <Suspense fallback={null}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[DRAW_WIDTH_M, DRAW_DEPTH_M]} />
          <meshStandardMaterial color="#0b1120" roughness={0.86} metalness={0.02} />
        </mesh>

        {walls.map((wall) => (
          <Wall3D key={wall.id} wall={wall} roomHeight={roomHeight} />
        ))}

        {devices.map((device) => (
          <Device3D
            key={device.instanceId}
            device={device}
            isSelected={selectedDeviceId === device.instanceId}
            onSelect={() => onSelectDevice(device.instanceId)}
          />
        ))}

        <Grid
          position={[0, 0, 0]}
          args={[DRAW_WIDTH_M, DRAW_DEPTH_M]}
          cellSize={0.5}
          cellThickness={0.55}
          cellColor="#1e293b"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={16}
          infiniteGrid={false}
        />
        <ContactShadows position={[0, 0, 0]} opacity={0.55} blur={2.2} far={7} color="#000000" />
      </Suspense>

      <OrbitControls
        enableDamping
        dampingFactor={0.04}
        minDistance={2.4}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2.05}
        makeDefault
      />
    </Canvas>
  );
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
    if (!svgRef.current || drawingPoints.length === 0) return;
    setCurrentMousePoint(svgPointFromEvent(event));
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
    setDrawingPoints([]);
    setCurrentMousePoint(null);
    setSelectedDeviceId(null);
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
          photoItems,
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
                </div>
              </div>

              <div className="relative min-h-[560px] overflow-hidden rounded-lg border bg-[#070b13]">
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
                      <path d={`M ${GRID_STEP_M} 0 L 0 0 0 ${GRID_STEP_M}`} fill="none" stroke="#1e293b" strokeWidth="0.012" />
                    </pattern>
                  </defs>
                  <rect x={-DRAW_WIDTH_M / 2} y={-DRAW_DEPTH_M / 2} width={DRAW_WIDTH_M} height={DRAW_DEPTH_M} fill="url(#battery-room-grid)" />
                  <line x1={-DRAW_WIDTH_M / 2} y1="0" x2={DRAW_WIDTH_M / 2} y2="0" stroke="#0f766e" strokeWidth="0.018" />
                  <line x1="0" y1={-DRAW_DEPTH_M / 2} x2="0" y2={DRAW_DEPTH_M / 2} stroke="#0f766e" strokeWidth="0.018" />

                  {walls.map((wall) => (
                    <g key={wall.id}>
                      <line
                        x1={wall.x1}
                        y1={wall.z1}
                        x2={wall.x2}
                        y2={wall.z2}
                        stroke="#38bdf8"
                        strokeWidth="0.08"
                        strokeLinecap="round"
                      />
                      <text
                        x={(wall.x1 + wall.x2) / 2}
                        y={(wall.z1 + wall.z2) / 2 - 0.12}
                        textAnchor="middle"
                        fontSize="0.18"
                        fill="#cbd5e1"
                      >
                        {formatMeters(wallLength(wall))}
                      </text>
                    </g>
                  ))}

                  {drawingPoints.length > 0 && currentMousePoint && (
                    <line
                      x1={drawingPoints[drawingPoints.length - 1].x}
                      y1={drawingPoints[drawingPoints.length - 1].z}
                      x2={currentMousePoint.x}
                      y2={currentMousePoint.z}
                      stroke="#f59e0b"
                      strokeWidth="0.045"
                      strokeDasharray="0.12 0.1"
                      strokeLinecap="round"
                    />
                  )}

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
                <div className="absolute bottom-3 right-3 rounded-md border border-slate-700 bg-slate-950/90 px-3 py-1.5 text-[11px] font-medium text-slate-300">
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

              <div className="relative min-h-[680px] overflow-hidden rounded-lg border bg-[#05070c]">
                {walls.length === 0 && (
                  <div className="absolute left-4 top-4 z-10 rounded-md border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs text-slate-300">
                    Inget rum ritat
                  </div>
                )}
                <StudioScene
                  walls={walls}
                  devices={devices}
                  selectedDeviceId={selectedDeviceId}
                  roomHeight={roomHeight}
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
