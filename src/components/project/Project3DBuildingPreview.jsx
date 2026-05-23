import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ==========================================
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

  // FUNKTION FÖR ATT FÖRMINSKA BILDEN
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024; // AI:n behöver inte mer än så här
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
        };
      };
    });
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
    setSelectedIndex(0);
  };

  const generateModel = async () => {
    if (files.length === 0) return setStatus("Välj bilder först!");
    setLoading(true);
    setStatus("Optimerar bild och förbereder AI-analys...");

    try {
      // 1. Komprimera bilden först!
      const optimizedBlob = await compressImage(files[selectedIndex]);

      setStatus("Skickar till AI (detta kan ta 20-40 sekunder)...");

      const response = await fetch(`${PROXY_URL}?t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: optimizedBlob,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Anslutningen bröts av servern.");
      }

      setStatus("Modell mottagen! Bearbetar 3D...");
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
        setStatus("Klart!");
        setLoading(false);
      });
    } catch (err) {
      console.error(err);
      setStatus("Fel: " + err.message + ". Prova en annan bild.");
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative', background: '#f0f2f5' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 20, left: 20, background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', width: '320px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>3D Hus-Generator</h3>
        <input type="file" multiple accept="image/*" onChange={handleFileChange} style={{ marginBottom: '15px', fontSize: '12px', width: '100%' }} />
        {previews.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '15px', maxHeight: '150px', overflowY: 'auto', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
            {previews.map((src, idx) => (
              <img key={idx} src={src} onClick={() => setSelectedIndex(idx)} style={{ width: '100%', height: '50px', objectFit: 'cover', cursor: 'pointer', border: selectedIndex === idx ? '3px solid #2ecc71' : '1px solid #ddd', borderRadius: '4px' }} />
            ))}
          </div>
        )}
        <button onClick={generateModel} disabled={loading || files.length === 0} style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          {loading ? "AI arbetar..." : "Skapa 3D av markerad bild"}
        </button>
        {status && <p style={{ marginTop: '10px', fontSize: '11px', color: '#34495e', textAlign: 'center' }}>{status}</p>}
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
