import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = ({ projectData }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const [selectedObj, setSelectedObj] = useState(null);

  // Refs för Three.js instanser
  const refs = useRef({
    camera: null,
    renderer: null,
    orbit: null,
    transform: null,
    house: null,
  });

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. GRUNDINSTÄLLNINGAR
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    refs.current.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    refs.current.renderer = renderer;

    // 2. LJUS & MILJÖ
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(10, 20, 10);
    scene.add(sun);
    scene.add(new THREE.GridHelper(40, 40, 0xd1d5db, 0xe2e8f0));

    // 3. KONTROLLER (AEROTOOL LOGIK)
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    refs.current.orbit = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value; // Lås kameran när vi drar i pilar
    });
    scene.add(transform);
    refs.current.transform = transform;

    // 4. SKAPA HUSET (Som en grupp)
    const houseGroup = new THREE.Group();
    houseGroup.name = "BUILDING_GROUP";

    const wallGeo = new THREE.BoxGeometry(10, 5, 8);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 2.5;
    walls.name = "WALLS";
    houseGroup.add(walls);

    const roofGeo = new THREE.ConeGeometry(7.5, 4, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 7;
    roof.name = "ROOF";
    houseGroup.add(roof);

    scene.add(houseGroup);
    refs.current.house = houseGroup;

    // 5. KLICK- OCH MARKERINGSLOGIK
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Återställ alla färger först
      scene.traverse((child) => {
        if (child.isMesh && (child.name === "WALLS" || child.name === "ROOF")) {
          child.material.emissive.setHex(0x000000); // Ta bort gult sken
        }
      });

      if (intersects.length > 0) {
        let obj = intersects[0].object;

        // Om vi klickar på tak eller väggar -> Markera hela huset
        if (obj.name === "WALLS" || obj.name === "ROOF") {
          // Visuell feedback: Gör kanterna/ytan gulaktig
          obj.material.emissive.setHex(0x333300);

          transform.setMode("scale"); // Hus ändrar man storlek på
          transform.attach(houseGroup);
          setSelectedObj("BYGGNAD");
        } else if (obj.name.includes("OBSTACLE")) {
          // För hinder (skorstenar) -> Flytta dem
          transform.setMode("translate");
          transform.attach(obj);
          setSelectedObj(obj.name.split('_')[1]);
        }
      } else {
        if (!transform.dragging) {
          transform.detach();
          setSelectedObj(null);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handleMouseDown);

    // 6. ANIMATION
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

  // Funktion för att spawna hinder
  const addObstacle = (type) => {
    const geo = type === 'SKORSTEN' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.3, 0.3, 1.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 8, 0);
    mesh.name = `OBSTACLE_${type}`;
    sceneRef.current.add(mesh);

    refs.current.transform.setMode("translate");
    refs.current.transform.attach(mesh);
    setSelectedObj(type);
  };

  return (
    <div className="w-full h-full relative bg-[#f1f5f9] font-sans overflow-hidden">

      {/* AEROTOOL TOP BAR */}
      <div className="absolute top-0 left-0 w-full h-14 bg-[#004a87] flex items-center justify-between px-6 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#004a87] px-2 py-0.5 rounded font-black text-sm">AERO</div>
          <span className="text-white text-[10px] font-bold tracking-widest uppercase opacity-70">Solar Designer Pro</span>
        </div>

        <div className="flex gap-4">
          <button onClick={() => addObstacle('SKORSTEN')} className="flex flex-col items-center group">
            <span className="text-lg">🧱</span>
            <span className="text-[8px] text-white font-bold uppercase">Skorsten</span>
          </button>
          <button onClick={() => addObstacle('VENT')} className="flex flex-col items-center group">
            <span className="text-lg">🔘</span>
            <span className="text-[8px] text-white font-bold uppercase">Vent</span>
          </button>
        </div>
      </div>

      {/* 3D CANVAS */}
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />

      {/* FLOATING INSPECTOR (LEFT) */}
      <div className="absolute left-6 top-20 w-60 bg-white/95 backdrop-blur shadow-2xl rounded-xl p-5 border border-slate-200">
        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Inspektör</h3>

        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[9px] text-slate-400 font-bold uppercase">Valt objekt</div>
            <div className="text-xs font-black text-[#004a87] mt-1">{selectedObj || "Ingen markerad"}</div>
          </div>

          {selectedObj && (
            <div className="text-[10px] text-slate-500 leading-relaxed bg-yellow-50 p-3 rounded-lg border border-yellow-100">
              <span className="font-bold text-yellow-700">TIPS:</span>
              {selectedObj === "BYGGNAD"
                ? " Dra i de GULA boxarna för att ändra husets storlek."
                : " Dra i PILARNA för att flytta objektet på taket."}
            </div>
          )}
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="absolute bottom-6 left-6 bg-slate-900 text-white px-4 py-1.5 rounded-full text-[9px] font-bold tracking-widest flex items-center gap-2 shadow-xl">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
        3D ENGINE ACTIVE
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
