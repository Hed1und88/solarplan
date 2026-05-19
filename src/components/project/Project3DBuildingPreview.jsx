// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
  const geometry = new THREE.BoxGeometry(length, 0.22, width);
  geometry.translate(0, eaveHeight + 0.12, 0);
  return geometry;
}

function addPanelsToRoof(group, { building, panelGroups, roofRise }) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const panelMaterialA = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.25, metalness: 0.35 });
  const panelMaterialB = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.25, metalness: 0.35 });
  const hasPanels = panelGroups.some((panelGroup) => (panelGroup.panels || []).length > 0);
  const fallbackPanels = hasPanels ? [] : Array.from({ length: 12 }, (_, index) => ({ id: `preview-${index}` }));

  const allPanels = hasPanels
    ? panelGroups.flatMap((panelGroup, groupIndex) => (panelGroup.panels || []).map((panel, panelIndex) => ({ panel, groupIndex, panelIndex })))
    : fallbackPanels.map((panel, panelIndex) => ({ panel, groupIndex: 0, panelIndex }));

  allPanels.slice(0, 80).forEach(({ panel, groupIndex, panelIndex }) => {
    const col = panelIndex % 6;
    const row = Math.floor(panelIndex / 6);
    const panelW = Math.max(0.7, safeNumber(panel.widthM, 1.05));
    const panelH = Math.max(1.0, safeNumber(panel.heightM, 1.72));
    const x = Math.min(length / 2 - panelW / 2 - 0.35, -length / 2 + 1.2 + col * (panelW + 0.16));
    const z = Math.min(width / 2 - panelH / 2 - 0.35, 0.55 + row * (panelH + 0.16));
    const y = eaveHeight + roofRise * (1 - Math.abs(z) / Math.max(0.1, width / 2)) + 0.08;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.045, panelH), groupIndex % 2 ? panelMaterialB : panelMaterialA);
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.atan2(roofRise, width / 2) * Math.sign(z || 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}

function buildModel(group, { building, panelGroups, obstacles }) {
  group.clear();
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const eaveHeight = Math.max(1, safeNumber(building.heightM, 4));
  const pitch = Math.max(0, Math.min(75, safeNumber(building.roofPitchDeg, 27)));
  const roofType = building.roofType || 'gable';
  const roofRise = roofType === 'flat' ? 0.15 : Math.tan((pitch * Math.PI) / 180) * (width / 2);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.65 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, eaveHeight, width), wallMaterial);
  body.position.y = eaveHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofGeometry = roofType === 'flat' ? createFlatRoofGeometry(length + 0.35, width + 0.35, eaveHeight) : createGableRoofGeometry(length + 0.35, width + 0.35, eaveHeight, Math.max(0.5, roofRise));
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  addPanelsToRoof(group, { building, panelGroups, roofRise: Math.max(0.5, roofRise) });

  const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
  (obstacles || []).forEach((obstacle) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.2, safeNumber(obstacle.widthM, 0.6)), Math.max(0.2, safeNumber(obstacle.heightM, 0.8)), Math.max(0.2, safeNumber(obstacle.depthM, 0.6))),
      obstacleMaterial
    );
    mesh.position.set(-length / 2 + safeNumber(obstacle.xM, 1), eaveHeight + safeNumber(obstacle.heightM, 0.8) / 2, -width / 2 + safeNumber(obstacle.yM, 1));
    mesh.castShadow = true;
    group.add(mesh);
  });
}

function fitCamera(camera, controls, building) {
  const length = Math.max(1, safeNumber(building.lengthM, 12));
  const width = Math.max(1, safeNumber(building.widthM, 8));
  const height = Math.max(1, safeNumber(building.heightM, 4));
  const distance = Math.max(18, Math.max(length, width) * 2.1);
  camera.position.set(distance * 0.75, Math.max(10, height * 3), distance);
  controls.target.set(0, height * 0.75, 0);
  controls.update();
}

export default function Project3DBuildingPreview({ building, roofSurfaces = [], panelGroups = [], obstacles = [] }) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);

  const totals = useMemo(() => {
    const roofArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.widthM) * safeNumber(surface.heightM), 0);
    const usableArea = roofSurfaces.reduce((sum, surface) => sum + safeNumber(surface.usableAreaM2), 0);
    const panelCount = panelGroups.reduce((sum, group) => sum + safeNumber(group.panelCount, (group.panels || []).length), 0);
    return { roofArea, usableArea, panelCount };
  }, [roofSurfaces, panelGroups]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(12, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(50, 50, 0x475569, 0x334155);
    grid.position.y = 0.01;
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
    buildModel(runtime.modelGroup, { building: building || {}, panelGroups, obstacles });
    fitCamera(runtime.camera, runtime.controls, building || {});
  }, [building, panelGroups, obstacles]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3 text-white">
          <div className="text-sm font-bold">3D-PROJEKTERINGSMODUL · WebGL</div>
          <div className="text-xs text-slate-300">Rotera · Panorera · Zooma</div>
        </div>
        <div ref={containerRef} className="h-[600px] w-full" />
      </div>

      <aside className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">3D projektering</h3>
        <p className="mt-1 text-sm text-muted-foreground">Ren Three.js-modul byggd från SolarPlans byggnadsmått, taktyp och panelgrupper.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Total takyta</div><div className="text-lg font-bold">{totals.roofArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Användbar yta</div><div className="text-lg font-bold">{totals.usableArea.toFixed(1)} m²</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Paneler</div><div className="text-lg font-bold">{totals.panelCount}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Taktyp</div><div className="text-sm font-bold">{building?.roofType || 'gable'}</div></div>
        </div>
      </aside>
    </div>
  );
}
