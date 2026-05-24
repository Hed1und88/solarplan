import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = ({ projectData }) => {
  const mountRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('translate'); // 'translate' för flytt, 'scale' för storlek

  const refs = useRef({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000),
    renderer: new THREE.WebGLRenderer({ antialias: true, alpha: true }),
    transform: null,
    orbit: null,
    houseGroup: new THREE.Group(),
  });

  useEffect(() => {
    if (!mountRef.current) return;

    const { scene, camera, renderer, houseGroup } = refs.current;

    // 1. SETUP CANVAS
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    scene.background = new THREE.Color(0xf8fafc);
    camera.position.set(15, 12, 15);

    // 2. LIGHTS & GRID
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);

    const grid = new THREE.GridHelper(100, 100, 0xcbd5e1, 0xe2e8f0);
    scene.add(grid);

    // 3. CONTROLS
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    refs.current.orbit = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
    });
    scene.add(transform);
    refs.current.transform = transform;

    // 4. BYGG HUSET
    houseGroup.name = "HOUSE_PARENT";
    const wallGeo = new THREE.BoxGeometry(10, 5, 8);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 2.5;
    walls.name = "WALLS";
    houseGroup.add(walls);

    const roofGeo = new THREE.ConeGeometry(7.5, 3, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 6.5;
    roof.name = "ROOF";
    houseGroup.add(roof);

    scene.add(houseGroup);

    // 5. KLICK-LOGIK (RAYCASTER)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Reset highlights
      scene.traverse(obj => { if (obj.isMesh) obj.material.emissive?.setHex(0x000000); });

      if (intersects.length > 0) {
        let clicked = intersects[0].object;

        // Om vi klickar på tak eller vägg -> Markera hela huset
        if (clicked.name === "ROOF" || clicked.name === "WALLS") {
          clicked.material.emissive.setHex(0x444400); // Gult highlight
          transform.setMode("scale");
          transform.attach(houseGroup);
          setSelected("BYGGNAD");
        } else if (clicked.name.includes("OBSTACLE")) {
          transform.setMode("translate");
          transform.attach(clicked);
          setSelected(clicked.name);
        }
      } else {
        if (!transform.dragging) {
          transform.detach();
          setSelected(null);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  const addObstacle = (type) => {
    const geo = type === 'skorsten' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.3, 0.3, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x475569 }));
    mesh.position.set(0, 8, 0);
    mesh.name = "OBSTACLE_" + type.toUpperCase();
    refs.current.scene.add(mesh);
    refs.current.transform.setMode("translate");
    refs.current.transform.attach(mesh);
    setSelected(mesh.name);
  };

  return (
    <div className="w-full h-full relative font-sans overflow-hidden bg-white">

      {/* 3D CANVAS - TAR UPP HELA YTAN */}
      <div ref={mountRef} className="w-full h-full" />

      {/* PROFESSIONAL TOP BAR (AEROTOOL STYLE) */}
      <div className="absolute top-0 left-0 w-full h-14 bg-[#004a87] flex items-center justify-between px-6 z-50 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-white text-[#004a87] px-3 py-1 rounded-md font-black text-sm">AERO</div>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-white text-[11px] font-bold tracking-[2px]">SOLAR DESIGNER PRO</span>
        </div>

        <div className="flex gap-8">
          <ToolBtn icon="🏠" label="Byggnad" onClick={() => {}} />
          <ToolBtn icon="🧱" label="Skorsten" onClick={() => addObstacle('skorsten')} />
          <ToolBtn icon="🔘" label="Vent" onClick={() => addObstacle('vent')} />
          <ToolBtn icon="📐" label="Mät" onClick={() => {}} />
        </div>
      </div>

      {/* FLOATING LEFT PANEL (INDATA) */}
      <div className="absolute left-6 top-20 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 border border-slate-200 pointer-events-auto">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Byggnadsparametrar</h3>
        <div className="space-y-4">
          <FloatingInput label="Längd" value="12" unit="m" />
          <FloatingInput label="Bredd" value="8" unit="m" />
          <FloatingInput label="Taklutning" value="27" unit="°" />
          <div className="pt-2">
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">Markerat Objekt</div>
            <div className="bg-slate-100 p-3 rounded-lg text-xs font-bold text-[#004a87]">
              {selected || "Ingen vald"}
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING RIGHT PANEL (RAPPORT) */}
      <div className="absolute right-6 top-20 w-64 bg-[#1e293b]/95 text-white backdrop-blur-md rounded-2xl shadow-2xl p-6 border border-white/10 pointer-events-auto">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Beräkning</h3>
        <div className="space-y-3">
          <ResultRow label="Paneler" value="24 st" />
          <ResultRow label="Effekt" value="10.2 kWp" />
          <ResultRow label="Årlig prod." value="13 620 kWh" />
          <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-center">
            <span className="text-[10px] font-bold text-green-400">OPTIMAL PLACERING</span>
          </div>
        </div>
      </div>

      {/* INTERACTION HINT */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white px-6 py-2 rounded-full text-[10px] font-bold tracking-widest backdrop-blur-sm">
        {selected ? "DRA I PILARNA FÖR ATT JUSTERA" : "KLICKA PÅ TAKET FÖR ATT ÄNDRA MÅTT"}
      </div>
    </div>
  );
};

const ToolBtn = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center group transition-all hover:scale-110">
    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xl group-hover:bg-white/20 transition-all shadow-inner">
      {icon}
    </div>
    <span className="text-[9px] text-white/70 font-bold mt-1 uppercase tracking-tighter">{label}</span>
  </button>
);

const FloatingInput = ({ label, value, unit }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <input className="bg-transparent w-full text-sm font-black outline-none text-slate-800" defaultValue={value} />
      <span className="text-[10px] text-slate-400 font-bold">{unit}</span>
    </div>
  </div>
);

const ResultRow = ({ label, value }) => (
  <div className="flex justify-between items-center border-b border-white/5 pb-2">
    <span className="text-[11px] text-slate-400 font-medium">{label}</span>
    <span className="text-xs font-black text-white">{value}</span>
  </div>
);

export default Project3DBuildingPreview;
