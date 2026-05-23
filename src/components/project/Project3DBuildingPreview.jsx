import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [selectedObject, setSelectedObject] = useState(null);

  // Refs för Three.js
  const sceneRef = useRef(new THREE.Scene());
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const transformRef = useRef(null);
  const orbitRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. SETUP SCENE (Ren och ljus bakgrund som Aerotool)
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 12, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. LJUS
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);

    // 3. KONTROLLER
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
    });
    scene.add(transform);
    transformRef.current = transform;

    // 4. GRID & MARK
    const grid = new THREE.GridHelper(50, 50, 0xcbd5e1, 0xe2e8f0);
    scene.add(grid);

    // 5. SKAPA HUSETS GRUNDMODELL (Klickbar)
    const houseGroup = new THREE.Group();

    // Väggar
    const wallGeo = new THREE.BoxGeometry(10, 5, 8);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 2.5;
    walls.name = "Husväggar";
    houseGroup.add(walls);

    // Tak (Detta kan vi senare göra mer avancerat)
    const roofGeo = new THREE.BoxGeometry(11, 0.5, 9);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 5.25;
    roof.name = "Takyta";
    houseGroup.add(roof);

    scene.add(houseGroup);

    // 6. KLICK-DETEKTERING (Raycaster)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const clickedObj = intersects[0].object;
        // Vi vill bara kunna flytta hinder, inte själva huset i detta läge
        if (clickedObj.name !== "Husväggar" && clickedObj.name !== "GridHelper") {
          transform.attach(clickedObj);
          setSelectedObject(clickedObj);
        }
      } else {
        // Om vi klickar på tom yta, avmarkera
        if (!transform.dragging) {
          transform.detach();
          setSelectedObject(null);
        }
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);

    // 7. ANIMATIONSLOOP
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

  // FUNKTION: LÄGG TILL HINDER (Fönster, Skorsten etc)
  const addObstacle = (type) => {
    let geo, mat, name;
    if (type === 'skorsten') {
      geo = new THREE.BoxGeometry(0.8, 2, 0.8);
      mat = new THREE.MeshStandardMaterial({ color: 0x475569 });
      name = "Skorsten";
    } else if (type === 'vent') {
      geo = new THREE.CylinderGeometry(0.2, 0.2, 0.8);
      mat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
      name = "Ventilation";
    } else if (type === 'fonster') {
      geo = new THREE.BoxGeometry(1.2, 0.1, 1.8);
      mat = new THREE.MeshStandardMaterial({ color: 0xadd8e6, transparent: true, opacity: 0.7 });
      name = "Takfönster";
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 5.5, 0); // Placera på taket
    mesh.name = name;
    sceneRef.current.add(mesh);

    // Aktivera flytt-pilar direkt
    transformRef.current.attach(mesh);
    setSelectedObject(mesh);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#f1f5f9', borderRadius: '12px', overflow: 'hidden' }}>

      {/* 3D-VY */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* FLYTANDE VERKTYGSFÄLT (Hinder) */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '10px',
        background: 'rgba(255,255,255,0.9)',
        padding: '10px 20px',
        borderRadius: '100px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(5px)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <ToolButton icon="🧱" label="Skorsten" onClick={() => addObstacle('skorsten')} />
        <ToolButton icon="🪟" label="Fönster" onClick={() => addObstacle('fonster')} />
        <ToolButton icon="🔘" label="Vent" onClick={() => addObstacle('vent')} />
        <ToolButton icon="🪜" label="Stege" onClick={() => {}} />
      </div>

      {/* OBJEKT-INFO (Visas när man klickar på något) */}
      {selectedObject && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'white',
          padding: '15px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          width: '200px',
        }}>
          <h4 style={{ margin: '0 0 5px 0', fontSize: '14px' }}>{selectedObject.name}</h4>
          <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '15px' }}>Använd pilarna för att placera objektet exakt.</p>
          <button
            onClick={() => {
              sceneRef.current.remove(selectedObject);
              transformRef.current.detach();
              setSelectedObject(null);
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: '#fee2e2',
              color: '#dc2626',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Ta bort
          </button>
        </div>
      )}

      {/* STATUS-INDIKATOR */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'white', padding: '8px 15px', borderRadius: '100px', fontSize: '12px', fontWeight: '600', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        🟢 Redigeringsläge
      </div>
    </div>
  );
};

// Knapp-komponent för verktygsfältet
const ToolButton = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '5px 10px',
      borderRadius: '8px',
      transition: 'background 0.2s',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
  >
    <span style={{ fontSize: '20px' }}>{icon}</span>
    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', marginTop: '2px' }}>{label}</span>
  </button>
);

export default Project3DBuildingPreview;
