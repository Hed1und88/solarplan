import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Vi tar emot props (data) från din huvudfil (ProjectDetails/Editor)
const Project3DBuildingPreview = ({ projectData, onUpdateObstacle }) => {
  const mountRef = useRef(null);
  const [selectedObject, setSelectedObject] = useState(null);

  // Three.js Refs
  const sceneRef = useRef(new THREE.Scene());
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const transformRef = useRef(null);
  const houseGroupRef = useRef(new THREE.Group());

  // --- HÄMTA DATA FRÅN APPEN ---
  // Om projectData saknas använder vi standardvärden
  const tilt = projectData?.tilt || 20;
  const width = projectData?.width || 10;
  const depth = projectData?.depth || 8;
  const wallHeight = 4;

  // Beräkna takhöjd baserat på lutning (trigonometri)
  // Höjd = (Bredd/2) * tan(vinkel)
  const roofHeight = (width / 2) * Math.tan((tilt * Math.PI) / 180);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. SCENE SETUP (Aerotool-look: Ljust och rent)
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(40, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(15, 12, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. LJUS & KONTROLLER
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
    scene.add(transform);
    transformRef.current = transform;

    scene.add(new THREE.GridHelper(40, 40, 0xd1d5db, 0xe5e7eb));
    scene.add(houseGroupRef.current);

    // 3. ANIMATION
    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    // 4. KLICK-EVENT
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.name !== "base" && obj.name !== "") {
          transform.attach(obj);
          setSelectedObject(obj);
        }
      } else {
        transform.detach();
        setSelectedObject(null);
      }
    };
    renderer.domElement.addEventListener('mousedown', onClick);

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  // --- UPPDATERA GEOMETRI NÄR LUTNING/BREDD ÄNDRAS ---
  useEffect(() => {
    const group = houseGroupRef.current;
    while (group.children.length > 0) { group.remove(group.children[0]); }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155 });

    // Väggar
    const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
    walls.position.y = wallHeight / 2;
    walls.name = "base";
    group.add(walls);

    // Sadeltak (Prisma-geometri)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-width / 2, 0);
    roofShape.lineTo(width / 2, 0);
    roofShape.lineTo(0, roofHeight);
    roofShape.lineTo(-width / 2, 0);

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: depth + 0.4, bevelEnabled: false });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI;
    roof.position.set(0, wallHeight, depth / 2 + 0.2);
    roof.name = "base";
    group.add(roof);

  }, [tilt, width, depth, roofHeight]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#f8fafc' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* FLOATING TOOLS (Aerotool style) */}
      <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '10px', background: 'white', padding: '10px', borderRadius: '50px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <button onClick={() => addObstacle('skorsten')} style={toolBtnStyle}>🧱 Skorsten</button>
        <button onClick={() => addObstacle('vent')} style={toolBtnStyle}>🔘 Vent</button>
        <button onClick={() => addObstacle('fonster')} style={toolBtnStyle}>🪟 Fönster</button>
      </div>

      {selectedObject && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', background: 'white', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '180px' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 'bold' }}>Valt objekt: {selectedObject.name}</p>
          <button onClick={() => { sceneRef.current.remove(selectedObject); transformRef.current.detach(); setSelectedObject(null); }} style={{ width: '100%', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px', borderRadius: '5px', cursor: 'pointer' }}>Ta bort</button>
        </div>
      )}
    </div>
  );

  function addObstacle(type) {
    const geo = type === 'skorsten' ? new THREE.BoxGeometry(0.8, 2, 0.8) : new THREE.CylinderGeometry(0.2, 0.2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, wallHeight + 1, 0);
    mesh.name = type;
    sceneRef.current.add(mesh);
    transformRef.current.attach(mesh);
    setSelectedObject(mesh);
  }
};

const toolBtnStyle = { border: 'none', background: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569' };

export default Project3DBuildingPreview;
