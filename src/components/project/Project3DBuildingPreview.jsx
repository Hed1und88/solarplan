import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ==========================================
// KONFIGURATION
const PROXY_URL = "https://ai-house-proxy.hedlund1212.workers.dev";
const HF_TOKEN = "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";
// ==========================================

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const sceneRef = useRef(new THREE.Scene());
  const houseRef = useRef(null);

  // Three.js Setup
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

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    sceneRef.current.add(dirLight);
    sceneRef.current.add(new THREE.GridHelper(30, 30, 0x444444, 0x888888));

    // Placeholder Box
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

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  // Hantera flera bilder
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);

    // Skapa förhandsvisningar för galleriet
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
    setSelectedIndex(0);
    setStatus(`Laddat upp ${selectedFiles.length} bilder. Välj en i listan.`);
  };

  const generateModel = async () => {
    if (files.length === 0) return setStatus("Ladda upp bilder först!");
    setLoading(true);
    setStatus("AI:n skapar 3D-modell av vald bild...");

    try {
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: files[selectedIndex],
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Serverfel ${response.status}`);
      }

      setStatus("Modell klar! Laddar in i 3D-vyn...");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      new GLTFLoader().load(url, (gltf) => {
        if (houseRef.current) sceneRef.current.remove(houseRef.current);
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 10 / Math.max(size.x, size.y, size.z);

        model.scale.set(scale, scale, scale);
        model.position.x = -center.x * scale;
        model.position.z = -center.z * scale;
        model.position.y = -box.min.y * scale;

        sceneRef.current.add(model);
        houseRef.current = model;
        setStatus("Klart! Rotera med musen.");
        setLoading(false);
      });
    } catch (err) {
      console.error(err);
      setStatus("Fel: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative', background: '#f0f2f5', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.95)', padding: '20px',
        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', width: '320px', backdropFilter: 'blur(4px)',
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#2c3e50' }}>Hus-AI 3D</h3>

        <p style={{ fontSize: '12px', marginBottom: '10px', color: '#7f8c8d' }}>1. Välj dina husbilder:</p>
        <input type="file" multiple accept="image/*" onChange={handleFileChange} style={{ marginBottom: '15px', fontSize: '12px', width: '100%' }} />

        {/* Galleri för att välja bild */}
        {previews.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px',
            marginBottom: '15px', maxHeight: '150px', overflowY: 'auto',
            padding: '10px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee',
          }}>
            {previews.map((src, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                <img
                  src={src}
                  onClick={() => setSelectedIndex(idx)}
                  style={{
                    width: '100%', height: '50px', objectFit: 'cover', cursor: 'pointer',
                    border: selectedIndex === idx ? '3px solid #2ecc71' : '1px solid #ddd',
                    borderRadius: '4px', transition: 'all 0.2s',
                  }}
                />
                {selectedIndex === idx && <div style={{ position: 'absolute', top: -5, right: -5, background: '#2ecc71', color: 'white', borderRadius: '50%', width: '15px', height: '15px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={generateModel}
          disabled={loading || files.length === 0}
          style={{
            width: '100%', padding: '14px', background: loading ? '#bdc3c7' : '#27ae60',
            color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(39, 174, 96, 0.2)',
          }}
        >
          {loading ? "AI Bearbetar..." : "Skapa 3D av markerad bild"}
        </button>

        {status && (
          <div style={{ marginTop: '15px', padding: '10px', background: '#fff', borderRadius: '6px', borderLeft: `4px solid ${status.includes('Fel') ? '#e74c3c' : '#2ecc71'}` }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#34495e' }}>{status}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
