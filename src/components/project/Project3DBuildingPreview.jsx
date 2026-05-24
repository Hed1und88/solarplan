import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = ({ projectData, onUpdate }) => {
  const mountRef = useRef(null);

  // State för interaktion
  const [selected, setSelected] = useState(null);
  const [roofType, setRoofType] = useState(projectData?.taktyp || 'Sadel');

  // Refs för Three.js
  const sceneRef = useRef(new THREE.Scene());
  const transformRef = useRef(null);
  const houseRef = useRef(null);
  const orbitRef = useRef(null);

  // Synka props med internt läge
  const dims = useMemo(() => ({
    w: parseFloat(projectData?.bredd || 12),
    d: parseFloat(projectData?.langd || 8),
    h: parseFloat(projectData?.takfotshojd || 4),
    tilt: parseFloat(projectData?.taklutning || 27),
  }), [projectData]);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. SCENE SETUP
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xebf1f5);
    const camera = new THREE.PerspectiveCamera(40, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // 2. LJUS & GRID
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.GridHelper(100, 100, 0xd1d5db, 0xe5e7eb));

    // 3. KONTROLLER
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

    // Lyssna på ändringar från gizmon
    transform.addEventListener('change', () => {
      if (transform.object && transform.mode === 'scale' && transform.object.name === 'house') {
        // Här kan vi skicka tillbaka nya mått till huvudappen om vi vill
      }
    });

    scene.add(transform);
    transformRef.current = transform;

    // 4. KLICK-LOGIK
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        let target = intersects[0].object;
        // Om vi klickar på taket, markera hela huset
        if (target.name === 'roof' || target.name === 'walls') target = target.parent;

        setSelected(target);
        transform.setMode(target.name === 'house' ? 'scale' : 'translate');
        transform.attach(target);
      } else {
        if (!transform.dragging) {
          transform.detach();
          setSelected(null);
        }
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);

    // 5. ANIMATION
    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  // 6. BYGG MODELLEN (Reaktivt)
  useEffect(() => {
    const scene = sceneRef.current;
    if (houseRef.current) scene.remove(houseRef.current);

    const houseGroup = new THREE.Group();
    houseGroup.name = "house";

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });

    // VÄGGAR
    const walls = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), wallMat);
    walls.position.y = dims.h / 2;
    walls.name = "walls";
    houseGroup.add(walls);

    // TAK-LOGIK
    const roofHeight = (dims.w / 2) * Math.tan((dims.tilt * Math.PI) / 180);
    let roofGeo;

    if (roofType === 'Sadel') {
      const shape = new THREE.Shape();
      shape.moveTo(-dims.w / 2, 0);
      shape.lineTo(dims.w / 2, 0);
      shape.lineTo(0, roofHeight);
      shape.lineTo(-dims.w / 2, 0);
      roofGeo = new THREE.ExtrudeGeometry(shape, { depth: dims.d + 0.2, bevelEnabled: false });
    } else if (roofType === 'Pult') {
      const shape = new THREE.Shape();
      shape.moveTo(-dims.w / 2, 0);
      shape.lineTo(dims.w / 2, 0);
      shape.lineTo(dims.w / 2, roofHeight * 2);
      shape.lineTo(-dims.w / 2, 0);
      roofGeo = new THREE.ExtrudeGeometry(shape, { depth: dims.d + 0.2, bevelEnabled: false });
    } else {
      roofGeo = new THREE.BoxGeometry(dims.w + 0.4, 0.4, dims.d + 0.4);
    }

    const roof = new THREE.Mesh(roofGeo, roofMat);
    if (roofType !== 'Platt') {
      roof.rotation.y = Math.PI;
      roof.position.set(0, dims.h, dims.d / 2 + 0.1);
    } else {
      roof.position.y = dims.h + 0.2;
    }
    roof.name = "roof";
    houseGroup.add(roof);

    scene.add(houseGroup);
    houseRef.current = houseGroup;

  }, [dims, roofType]);

  const addObstacle = (type) => {
    const geo = type === 'skorsten' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.3, 0.3, 1.2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x475569 }));
    mesh.position.set(0, dims.h + 2, 0);
    mesh.name = "obstacle_" + type;
    sceneRef.current.add(mesh);
    transformRef.current.setMode('translate');
    transformRef.current.attach(mesh);
    setSelected(mesh);
  };

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden font-sans">

      {/* PROFESSIONAL TOP BAR */}
      <div className="absolute top-0 left-0 w-full h-14 bg-[#004a87] flex items-center justify-between px-6 z-50 shadow-md">
        <div className="flex items-center gap-4">
          <span className="text-white font-black tracking-tighter text-xl italic">AERO TOOL</span>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex gap-2">
            {['Sadel', 'Pult', 'Platt'].map(t => (
              <button
                key={t}
                onClick={() => setRoofType(t)}
                className={`px-4 py-1 rounded text-xs font-bold transition ${roofType === t ? 'bg-white text-[#004a87]' : 'text-white/70 hover:text-white'}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <ToolBtn icon="🧱" label="Skorsten" onClick={() => addObstacle('skorsten')} />
          <ToolBtn icon="🔘" label="Vent" onClick={() => addObstacle('vent')} />
          <ToolBtn icon="🪟" label="Fönster" onClick={() => {}} />
        </div>
      </div>

      {/* 3D CANVAS */}
      <div ref={mountRef} className="w-full h-full pt-14" />

      {/* FLOATING DATA PANEL (LEFT) */}
      <div className="absolute left-4 top-20 w-64 bg-white/90 backdrop-blur shadow-xl rounded-xl p-5 border border-slate-200">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Byggnadsmått</h3>
        <div className="space-y-3">
          <MiniInput label="Bredd" val={dims.w} unit="m" />
          <MiniInput label="Längd" val={dims.d} unit="m" />
          <MiniInput label="Lutning" val={dims.tilt} unit="°" />
        </div>
        {selected && (
          <button
            onClick={() => { sceneRef.current.remove(selected); transformRef.current.detach(); setSelected(null); }}
            className="w-full mt-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition"
          >
            TA BORT VALT OBJEKT
          </button>
        )}
      </div>

      {/* RESULT PANEL (RIGHT) */}
      <div className="absolute right-4 top-20 w-56 bg-slate-900/95 text-white shadow-2xl rounded-xl p-5">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Systemdata</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><span className="text-slate-400">Area:</span><span className="font-bold">114 m²</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-400">Paneler:</span><span className="font-bold">28 st</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-400">Effekt:</span><span className="font-bold text-green-400">11.8 kWp</span></div>
        </div>
      </div>
    </div>
  );
};

const ToolBtn = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center group">
    <div className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/30 flex items-center justify-center text-lg transition">{icon}</div>
    <span className="text-[9px] text-white/60 font-bold uppercase mt-1">{label}</span>
  </button>
);

const MiniInput = ({ label, val, unit }) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-bold text-slate-500 mb-1">{label}</span>
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-2 py-1">
      <input className="bg-transparent w-full text-xs font-bold outline-none" value={val} readOnly />
      <span className="text-[10px] text-slate-400">{unit}</span>
    </div>
  </div>
);

export default Project3DBuildingPreview;
