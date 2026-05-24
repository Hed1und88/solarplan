import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = ({ projectData }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const transformRef = useRef(null);
  const orbitRef = useRef(null);

  // State för UI
  const [selectedName, setSelectedName] = useState("Ingen vald");

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. SCENE & CAMERA
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. LIGHTS
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.GridHelper(50, 50, 0xcbd5e1, 0xe2e8f0));

    // 3. CONTROLS (Detta är hjärtat i Aerotool-känslan)
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    // Viktigt: Stoppa kameran från att rotera när vi drar i pilar
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
    });
    scene.add(transform);
    transformRef.current = transform;

    // 4. SKAPA HUSETS MODELL
    const houseGroup = new THREE.Group();
    houseGroup.name = "Huvudbyggnad";

    const wallGeo = new THREE.BoxGeometry(10, 5, 8);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 2.5;
    walls.name = "Väggar";
    houseGroup.add(walls);

    const roofGeo = new THREE.ConeGeometry(7.5, 4, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 7;
    roof.name = "Tak";
    houseGroup.add(roof);

    scene.add(houseGroup);

    // 5. KLICK-FUNKTION (Raycaster)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      // Beräkna musposition exakt i förhållande till 3D-ytan
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const object = intersects[0].object;

        // Om vi klickar på tak eller väggar, välj hela huset för att skala/flytta
        if (object.name === "Tak" || object.name === "Väggar") {
          transform.setMode("translate"); // Byt till "scale" om du vill ändra storlek
          transform.attach(object.parent);
          setSelectedName("Byggnad");
        } else {
          // För hinder (skorstenar etc)
          transform.setMode("translate");
          transform.attach(object);
          setSelectedName(object.name);
        }
      } else {
        // Klick på tom yta = avmarkera
        if (!transform.dragging) {
          transform.detach();
          setSelectedName("Ingen vald");
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // 6. ANIMATION LOOP
    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, []);

  // Funktion för att lägga till hinder (Skorsten/Vent)
  const addObstacle = (type) => {
    const geo = type === 'skorsten' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.3, 0.3, 1.2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x475569 }));
    mesh.position.set(0, 8, 0);
    mesh.name = type.toUpperCase();
    sceneRef.current.add(mesh);

    // Aktivera pilarna direkt på det nya objektet
    transformRef.current.setMode("translate");
    transformRef.current.attach(mesh);
    setSelectedName(mesh.name);
  };

  return (
    <div className="w-full h-full relative bg-slate-50 overflow-hidden font-sans">

      {/* AEROTOOL TOP BAR */}
      <div className="absolute top-0 left-0 w-full h-14 bg-[#004a87] flex items-center justify-between px-6 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#004a87] px-2 py-1 rounded font-black italic">AERO</div>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-white text-xs font-bold tracking-widest uppercase">3D Editor</span>
        </div>

        <div className="flex gap-6">
          <button onClick={() => addObstacle('skorsten')} className="flex flex-col items-center group">
            <span className="text-xl group-hover:scale-110 transition">🧱</span>
            <span className="text-[9px] text-white/70 font-bold mt-1 uppercase">Skorsten</span>
          </button>
          <button onClick={() => addObstacle('vent')} className="flex flex-col items-center group">
            <span className="text-xl group-hover:scale-110 transition">🔘</span>
            <span className="text-[9px] text-white/70 font-bold mt-1 uppercase">Vent</span>
          </button>
        </div>
      </div>

      {/* 3D CANVAS */}
      <div ref={mountRef} className="w-full h-full" />

      {/* FLOATING INFO PANEL (LEFT) */}
      <div className="absolute left-6 top-20 w-64 bg-white/90 backdrop-blur shadow-2xl rounded-2xl p-6 border border-slate-200">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[2px] mb-4">Objekt-Egenskaper</h3>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Markerad:</div>
          <div className="text-sm font-black text-[#004a87]">{selectedName}</div>
        </div>
        <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
          Klicka på ett objekt för att aktivera pilar. Dra i pilarna för att flytta objektet på taket.
        </p>
      </div>

      {/* HELPSKÄRMS-INDIKATOR */}
      <div className="absolute bottom-6 right-6 flex gap-2">
        <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-bold shadow-xl">
          MODE: EDIT
        </div>
      </div>

    </div>
  );
};

export default Project3DBuildingPreview;
