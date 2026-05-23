import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);

  // --- HUSETS MÅTT (STATER) ---
  const [houseSize, setHouseSize] = useState({
    width: 10,
    height: 6,
    depth: 8,
    roofHeight: 4,
    dormerWidth: 3,   // Takkupa bredd
    dormerHeight: 2,  // Takkupa höjd
    porchWidth: 4,    // Veranda bredd
    porchHeight: 3,   // Veranda höjd
  });

  const sceneRef = useRef(new THREE.Scene());
  const houseGroupRef = useRef(new THREE.Group());

  useEffect(() => {
    if (!mountRef.current) return;

    // SCENE SETUP
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0xf0f2f5, 1);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // LJUS
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    sceneRef.current.add(dirLight);

    // MARK & GRID
    const grid = new THREE.GridHelper(40, 40, 0xcccccc, 0xeeeeee);
    sceneRef.current.add(grid);

    sceneRef.current.add(houseGroupRef.current);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(sceneRef.current, camera);
    };
    animate();

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  // UPPDATERA MODELLEN NÄR MÅTTEN ÄNDRAS
  useEffect(() => {
    const group = houseGroupRef.current;
    while (group.children.length > 0) { group.remove(group.children[0]); }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Vit träpanel
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Svart takpannor
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 }); // Blå detaljer

    // 1. HUVUDKROPP
    const bodyGeo = new THREE.BoxGeometry(houseSize.width, houseSize.height, houseSize.depth);
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.y = houseSize.height / 2;
    group.add(body);

    // 2. TAK (Gavel)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-houseSize.width / 2, 0);
    roofShape.lineTo(houseSize.width / 2, 0);
    roofShape.lineTo(0, houseSize.roofHeight);
    roofShape.lineTo(-houseSize.width / 2, 0);

    const roofExtrude = new THREE.ExtrudeGeometry(roofShape, {
      depth: houseSize.depth + 0.5,
      bevelEnabled: false,
    });
    const roof = new THREE.Mesh(roofExtrude, roofMat);
    roof.rotation.y = Math.PI; // Vrid för att matcha djupet
    roof.position.set(0, houseSize.height, houseSize.depth / 2 + 0.25);
    group.add(roof);

    // 3. TAKKUPA (Dormer) - Som på din bild
    const dormerGeo = new THREE.BoxGeometry(houseSize.dormerWidth, houseSize.dormerHeight, 2);
    const dormer = new THREE.Mesh(dormerGeo, wallMat);
    dormer.position.set(0, houseSize.height + houseSize.dormerHeight / 2, houseSize.depth / 2 - 0.5);
    group.add(dormer);

    const dRoofShape = new THREE.Shape();
    dRoofShape.moveTo(-houseSize.dormerWidth / 2 - 0.2, 0);
    dRoofShape.lineTo(houseSize.dormerWidth / 2 + 0.2, 0);
    dRoofShape.lineTo(0, 1);
    dRoofShape.lineTo(-houseSize.dormerWidth / 2 - 0.2, 0);

    const dRoofGeo = new THREE.ExtrudeGeometry(dRoofShape, { depth: 2.2, bevelEnabled: false });
    const dRoof = new THREE.Mesh(dRoofGeo, roofMat);
    dRoof.position.set(0, houseSize.height + houseSize.dormerHeight, houseSize.depth / 2 + 1);
    group.add(dRoof);

    // 4. VERANDA / ENTRÉ
    const porchGeo = new THREE.BoxGeometry(houseSize.porchWidth, houseSize.porchHeight, 2);
    const porch = new THREE.Mesh(porchGeo, wallMat);
    porch.position.set(0, houseSize.porchHeight / 2, houseSize.depth / 2 + 1);
    group.add(porch);

    detailMat.dispose();
  }, [houseSize]);

  const updateVal = (key, val) => {
    setHouseSize(prev => ({ ...prev, [key]: parseFloat(val) }));
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '700px', display: 'flex', fontFamily: 'sans-serif' }}>
      {/* 3D-VY */}
      <div ref={mountRef} style={{ flex: 1, background: '#f0f2f5' }} />

      {/* KONTROLLPANEL */}
      <div style={{ width: '350px', background: 'white', padding: '25px', boxShadow: '-5px 0 15px rgba(0,0,0,0.05)', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#2c3e50' }}>Husarkitekten 1.0</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <Control label="Husbredd" val={houseSize.width} min="5" max="20" onChange={(v) => updateVal('width', v)} />
          <Control label="Husdjup" val={houseSize.depth} min="5" max="20" onChange={(v) => updateVal('depth', v)} />
          <Control label="Våningshöjd" val={houseSize.height} min="2" max="10" onChange={(v) => updateVal('height', v)} />
          <hr style={{ border: '0.5px solid #eee', width: '100%' }} />
          <Control label="Takhöjd" val={houseSize.roofHeight} min="1" max="8" onChange={(v) => updateVal('roofHeight', v)} />
          <Control label="Takkupa Bredd" val={houseSize.dormerWidth} min="1" max="6" onChange={(v) => updateVal('dormerWidth', v)} />
          <hr style={{ border: '0.5px solid #eee', width: '100%' }} />
          <Control label="Veranda Bredd" val={houseSize.porchWidth} min="1" max="8" onChange={(v) => updateVal('porchWidth', v)} />
          <Control label="Veranda Höjd" val={houseSize.porchHeight} min="1" max="5" onChange={(v) => updateVal('porchHeight', v)} />
        </div>

        <div style={{ marginTop: '30px', padding: '15px', background: '#e8f4fd', borderRadius: '8px' }}>
          <p style={{ fontSize: '13px', color: '#2980b9', margin: 0 }}>
            <strong>Tips:</strong> Använd reglagen för att matcha måtten på bilden. Du kan rotera huset med musen för att se det från alla håll.
          </p>
        </div>
      </div>
    </div>
  );
};

// Enkel komponent för reglage
const Control = ({ label, val, min, max, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
      <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#34495e' }}>{label}</label>
      <span style={{ fontSize: '12px', color: '#7f8c8d' }}>{val}m</span>
    </div>
    <input
      type="range" min={min} max={max} step="0.1" value={val}
      onChange={(e) => onChange(e.target.value)}
      style={{ cursor: 'pointer' }}
    />
  </div>
);

export default Project3DBuildingPreview;
