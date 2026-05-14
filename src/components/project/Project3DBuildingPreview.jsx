// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const degToRad = (deg) => (Number(deg) * Math.PI) / 180;
const safeNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function addQuad(scene, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

function addTriangle(scene, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

function addLine(scene, points, color = 0x0f172a) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  scene.add(line);
  return line;
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

function addRoofRect(scene, building, surface, item, material, zOffset = 0.06) {
  const x = safeNumber(item.xM, 0);
  const y = safeNumber(item.yM, 0);
  const w = safeNumber(item.widthM, 0.5);
  const h = safeNumber(item.heightM, 0.5);
  return addQuad(scene, [
    roofPoint(building, surface, x, y, zOffset),
    roofPoint(building, surface, x + w, y, zOffset),
    roofPoint(building, surface, x + w, y + h, zOffset),
    roofPoint(building, surface, x, y + h, zOffset),
  ], material);
}

function addRoofOverlays(scene, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis) {
  const surfaceById = Object.fromEntries((roofSurfaces || []).map((surface) => [surface.id, surface]));
  const affected = new Set((shadingAnalysis?.affectedPanels || []).map((item) => `${item.groupId}:${item.panelId}`));
  const panelMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x0f3b5f, roughness: 0.45, metalness: 0.18, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.45, metalness: 0.14, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.45, metalness: 0.14, side: THREE.DoubleSide }),
  ];
  const shadedMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const excludedMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 });

  (roofSurfaces || []).forEach((surface) => {
    (surface.excludedZones || []).forEach((zone) => addRoofRect(scene, building, surface, zone, excludedMaterial, 0.09));
  });

  (panelGroups || []).forEach((group, groupIndex) => {
    const surface = surfaceById[group.roofSurfaceId];
    if (!surface) return;
    (group.panels || []).forEach((panel) => {
      addRoofRect(
        scene,
        building,
        surface,
        panel,
        affected.has(`${group.id}:${panel.id}`) ? shadedMaterial : panelMaterials[groupIndex % panelMaterials.length],
        0.12
      );
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
    scene.add(mesh);
  });

  if (shadingAnalysis?.sun) {
    const az = degToRad(shadingAnalysis.sun.azimuthDeg);
    const start = new THREE.Vector3(-10, 10, -10);
    const end = new THREE.Vector3(start.x + Math.sin(az) * 4, start.y - 2, start.z + Math.cos(az) * 4);
    addLine(scene, [start, end], 0xf59e0b);
  }
}

function buildModel(scene, { building, roofSurfaces, panelGroups, obstacles, shadingAnalysis }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4.2));
  const pitch = Math.max(0, Math.min(75, safeNumber(building.roofPitchDeg, 27)));
  const roofType = building.roofType || 'gable';
  const halfL = length / 2;
  const halfW = width / 2;
  const rise = roofType === 'flat' ? 0.18 : Math.tan(degToRad(pitch)) * halfW;

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.8, metalness: 0.05 });
  const roofMaterialA = new THREE.MeshStandardMaterial({ color: 0x8f3f2d, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide });
  const roofMaterialB = new THREE.MeshStandardMaterial({ color: 0x713323, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), wallMaterial);
  body.position.y = height / 2;
  scene.add(body);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0x94a3b8 })
  );
  edges.position.copy(body.position);
  scene.add(edges);

  if (roofType === 'flat') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 0.28, 0.22, width + 0.28), roofMaterialA);
    roof.position.y = height + 0.11;
    scene.add(roof);
    addRoofOverlays(scene, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
    return;
  }

  if (roofType === 'single_slope') {
    const lowLeft = new THREE.Vector3(-halfL - 0.12, height, -halfW - 0.12);
    const lowRight = new THREE.Vector3(halfL + 0.12, height, -halfW - 0.12);
    const highRight = new THREE.Vector3(halfL + 0.12, height + rise * 2, halfW + 0.12);
    const highLeft = new THREE.Vector3(-halfL - 0.12, height + rise * 2, halfW + 0.12);
    addQuad(scene, [lowLeft, lowRight, highRight, highLeft], roofMaterialA);
    addLine(scene, [highLeft, highRight], 0xf59e0b);
    addRoofOverlays(scene, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
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
    addQuad(scene, [c1, c2, ridgeB, ridgeA], roofMaterialA);
    addQuad(scene, [c4, ridgeA, ridgeB, c3], roofMaterialB);
    addTriangle(scene, [c1, ridgeA, c4], roofMaterialB);
    addTriangle(scene, [c2, c3, ridgeB], roofMaterialA);
    addLine(scene, [ridgeA, ridgeB], 0xf59e0b);
    addRoofOverlays(scene, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
    return;
  }

  const ridgeLeft = new THREE.Vector3(-halfL - 0.12, height + rise, 0);
  const ridgeRight = new THREE.Vector3(halfL + 0.12, height + rise, 0);
  const eaveA1 = new THREE.Vector3(-halfL - 0.12, height, -halfW - 0.12);
  const eaveA2 = new THREE.Vector3(halfL + 0.12, height, -halfW - 0.12);
  const eaveB1 = new THREE.Vector3(-halfL - 0.12, height, halfW + 0.12);
  const eaveB2 = new THREE.Vector3(halfL + 0.12, height, halfW + 0.12);
  addQuad(scene, [eaveA1, eaveA2, ridgeRight, ridgeLeft], roofMaterialA);
  addQuad(scene, [eaveB1, ridgeLeft, ridgeRight, eaveB2], roofMaterialB);
  addTriangle(scene, [new THREE.Vector3(-halfL, height, -halfW), ridgeLeft, new THREE.Vector3(-halfL, height, halfW)], trimMaterial);
  addTriangle(scene, [new THREE.Vector3(halfL, height, -halfW), new THREE.Vector3(halfL, height, halfW), ridgeRight], trimMaterial);
  addLine(scene, [ridgeLeft, ridgeRight], 0xf59e0b);
  addRoofOverlays(scene, building, roofSurfaces, panelGroups, obstacles, shadingAnalysis);
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
    scene.background = new THREE.Color(0xf8fafc);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(12, 9, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 2.5, 0);
    controls.maxPolarAngle = Math.PI / 2.05;

    const ambient = new THREE.HemisphereLight(0xffffff, 0xb7c2d5, 1.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(8, 14, 10);
    scene.add(sun);
    const grid = new THREE.GridHelper(32, 32, 0x94a3b8, 0xdbe3ee);
    scene.add(grid);

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
    const { modelGroup } = runtime;
    modelGroup.clear();
    buildModel(modelGroup, { building, roofSurfaces, panelGroups, obstacles, shadingAnalysis });
  }, [building, roofSurfaces, panelGroups, obstacles, shadingAnalysis]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-xl border bg-white shadow-inner">
        <div ref={containerRef} className="h-[420px] w-full" aria-label="Interaktiv 3D-modell av byggnad och tak" />
      </div>
      <aside className="rounded-xl border bg-background p-4">
        <div className="mb-4">
          <h3 className="font-semibold">Takyteberäkning</h3>
          <p className="text-sm text-muted-foreground">Rotera, panorera och zooma i 3D-vyn.</p>
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
