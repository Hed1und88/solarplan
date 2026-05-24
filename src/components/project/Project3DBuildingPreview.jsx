import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const sceneRef = useRef(new THREE.Scene());
  const transformRef = useRef(null);

  useEffect(() => {
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xeef2f6);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(18, 15, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // Grid & Lights (Professional Look)
    const grid = new THREE.GridHelper(100, 100, 0xcbd5e1, 0xd1d5db);
    scene.add(grid);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    scene.add(sun);

    const orbit = new OrbitControls(camera, renderer.domElement);
    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => orbit.enabled = !e.value);
    scene.add(transform);
    transformRef.current = transform;

    // Default Building
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    house.position.y = 2.5;
    house.name = "Byggnad";
    scene.add(house);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const handlePointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const target = hits.find((hit) => hit.object.isMesh && hit.object.type !== 'GridHelper')?.object;
      if (target) {
        transform.attach(target);
        setSelected(target);
      } else {
        transform.detach();
        setSelected(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    const handleResize = () => {
      if (!mountRef.current) return;
      const nextWidth = mountRef.current.clientWidth;
      const nextHeight = mountRef.current.clientHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener('resize', handleResize);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, []);

  const addObstacle = (type) => {
    const geo = type === 'chimney' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.3, 0.3, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x334155 }));
    mesh.position.set(0, 6, 0);
    mesh.name = type === 'chimney' ? 'Skorsten' : 'Ventilation';
    sceneRef.current.add(mesh);
    transformRef.current.attach(mesh);
    setSelected(mesh);
  };

  return (
    <div className="w-full h-full relative font-sans overflow-hidden bg-slate-100">
      {/* PROFESSIONAL TOP BAR (AEROTOOL STYLE) */}
      <div className="absolute top-0 left-0 w-full h-16 bg-[#005596] flex items-center px-6 z-50 shadow-lg">
        <div className="flex items-center gap-2 mr-10">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center font-bold text-[#005596]">A</div>
          <span className="text-white font-bold tracking-tight">AEROCOMPACT</span>
        </div>

        <div className="flex gap-4">
          <IconButton icon="🏠" label="Byggnad" />
          <IconButton icon="🧱" label="Skorsten" onClick={() => addObstacle('chimney')} />
          <IconButton icon="🔘" label="Ventilation" onClick={() => addObstacle('vent')} />
          <IconButton icon="🌍" label="Karta" />
          <IconButton icon="📊" label="Rapport" />
        </div>

        <div className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-3 py-2">
          <RoofTypeButton label="Sadel" active />
          <RoofTypeButton label="Valm" />
          <RoofTypeButton label="Platt" />
          <RoofTypeButton label="Pult" />
        </div>
      </div>

      {/* 3D CANVAS */}
      <div ref={mountRef} className="w-full h-full pt-16" />

      {/* FLOATING DATA PANEL (LEFT) */}
      <div className="absolute left-6 top-24 w-72 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl p-6 border border-slate-200">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Byggnadsparametrar</h3>
        <div className="space-y-4">
          <InputGroup label="Längd" value="12.0" unit="m" />
          <InputGroup label="Bredd" value="8.0" unit="m" />
          <InputGroup label="Taklutning" value="27" unit="°" />
        </div>
        {selected && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-slate-700">
            Valt objekt: <span className="font-bold">{selected.name}</span>
          </div>
        )}
      </div>

      {/* FLOATING RESULTS PANEL (RIGHT) */}
      <div className="absolute right-6 top-24 w-64 bg-[#1e293b]/95 text-white backdrop-blur-md rounded-xl shadow-2xl p-6">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Beräkning</h3>
        <div className="space-y-3">
          <ResultRow label="Antal Paneler" value="24 st" />
          <ResultRow label="Total Effekt" value="10.2 kWp" />
          <ResultRow label="Årlig prod." value="13 347 kWh" />
        </div>
      </div>
    </div>
  );
};

const IconButton = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center group cursor-pointer">
    <div className="w-10 h-10 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center text-xl transition-all">
      {icon}
    </div>
    <span className="text-[10px] text-white/70 mt-1 font-medium">{label}</span>
  </button>
);

const RoofTypeButton = ({ label, active }) => (
  <button className={`rounded-full px-3 py-1 text-xs font-bold transition ${active ? 'bg-white text-[#005596]' : 'text-white/80 hover:bg-white/10'}`}>
    {label}
  </button>
);

const InputGroup = ({ label, value, unit }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-slate-600">{label}</label>
    <div className="flex items-center bg-slate-100 rounded-md px-3 py-2 border border-slate-200">
      <input className="bg-transparent w-full text-sm font-bold outline-none" defaultValue={value} />
      <span className="text-xs text-slate-400 font-bold">{unit}</span>
    </div>
  </div>
);

const ResultRow = ({ label, value }) => (
  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-sm font-bold">{value}</span>
  </div>
);

export default Project3DBuildingPreview;
