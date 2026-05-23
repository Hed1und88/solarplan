import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ==========================================
// 1. DIN PROXY-URL (Bekräftad fungerande!)
const PROXY_URL = "https://ai-house-proxy.hedlund1212.workers.dev";

// 2. KLISTRA IN DIN HUGGING FACE TOKEN HÄR
const HF_TOKEN = "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";
// ==========================================

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const sceneRef = useRef(new THREE.Scene());
  const houseRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(12, 12, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Ljusinställningar för att se modellen bra
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    sceneRef.current.add(dirLight);

    // Grid (Marken)
    const grid = new THREE.GridHelper(30, 30, 0x444444, 0x888888);
    sceneRef.current.add(grid);

    // Start-box (Visas innan AI-modellen är klar)
    const geometry = new THREE.BoxGeometry(6, 4, 6);
    const material = new THREE.MeshStandardMaterial({ color: 0x34495e, wireframe: true });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = 2;
    sceneRef.current.add(cube);
    houseRef.current = cube;

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(sceneRef.current, camera);
    };
    animate();

    return () => {
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, []);

  const generateModel = async () => {
    if (images.length === 0) return setStatus("Välj en bild på huset först!");
    setLoading(true);
    setStatus("Kopplar upp mot AI-tunneln...");

    try {
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN.trim()}`,
          "Content-Type": "application/octet-stream",
        },
        body: images[0], // Skickar din uppladdade bild
      });

      if (!response.ok) {
        const errorMsg = await response.text();
        throw new Error(`AI-fel: ${response.status}. ${errorMsg}`);
      }

      setStatus("Bearbetar 3D-data... Detta kan ta 10-20 sekunder.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        // Ta bort placeholder-boxen
        if (houseRef.current) sceneRef.current.remove(houseRef.current);

        const model = gltf.scene;

        // Centrera och skala modellen automatiskt
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Skala upp den så den ser bra ut (ca 8 enheter stor)
        const scale = 8 / Math.max(size.x, size.y, size.z);
        model.scale.set(scale, scale, scale);

        // Sätt den på marken (y=0)
        model.position.x = -center.x * scale;
        model.position.z = -center.z * scale;
        model.position.y = -box.min.y * scale;

        sceneRef.current.add(model);
        houseRef.current = model;

        setStatus("Klart! Du kan nu rotera huset.");
        setLoading(false);
      }, undefined, (err) => {
        throw new Error("Kunde inte läsa 3D-filen från AI:n.");
      });

    } catch (err) {
      console.error("DETALJERAT FEL:", err);
      setStatus("Fel: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative', background: '#ecf0f1', borderRadius: '15px', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute',
        top: 25,
        left: 25,
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '25px',
        borderRadius: '15px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        width: '300px',
        backdropFilter: 'blur(5px)',
        border: '1px solid rgba(255,255,255,0.3)',
      }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#2c3e50' }}>Hus-Preview 3D</h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#7f8c8d' }}>Skapa en 3D-modell från en bild</p>

        <label style={{ display: 'block', marginBottom: '10px', fontSize: '13px', fontWeight: 'bold' }}>Ladda upp bild:</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImages(Array.from(e.target.files))}
          style={{ marginBottom: '20px', width: '100%', fontSize: '12px' }}
        />

        <button
          onClick={generateModel}
          disabled={loading || !images.length}
          style={{
            width: '100%',
            padding: '14px',
            background: loading ? '#bdc3c7' : '#2ecc71',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          {loading ? "AI arbetar..." : "Generera 3D-hus"}
        </button>

        {status && (
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: status.includes('Fel') ? '#fdecea' : '#e8f8f5',
            borderRadius: '8px',
            border: `1px solid ${status.includes('Fel') ? '#f5c6cb' : '#a3e4d7'}`,
          }}>
            <p style={{
              margin: 0,
              fontSize: '12px',
              color: status.includes('Fel') ? '#721c24' : '#145a32',
              textAlign: 'center',
              lineHeight: '1.4',
            }}>
              {status}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
