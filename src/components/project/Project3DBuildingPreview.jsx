import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ==========================================
// 1. KLISTRA IN DIN TOKEN HÄR
const HF_TOKEN = "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";
// ==========================================

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [diag, setDiag] = useState("");
  const sceneRef = useRef(new THREE.Scene());
  const houseRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(10, 10, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    sceneRef.current.add(dirLight);
    sceneRef.current.add(new THREE.GridHelper(20, 20));

    // Start-box
    const geometry = new THREE.BoxGeometry(5, 3, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = 1.5;
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

  // TESTA ANSLUTNING (DIAGNOSTIK)
  const testNetwork = async () => {
    setDiag("Testar anslutning...");
    try {
      await fetch("https://huggingface.co", { mode: 'no-cors' });
      setDiag("✅ Kontakt med HuggingFace OK. Problemet är specifikt för API-underdomänen.");
    } catch (e) {
      setDiag("❌ Totalt stopp. Din dator/webbläsare vägrar prata med HuggingFace överhuvudtaget.");
    }
  };

  const generateModel = async () => {
    if (images.length === 0) return setStatus("Välj bilder först!");
    setLoading(true);
    setStatus("AI:n bearbetar nu dina bilder...");

    try {
      // Vi använder en "Clean URL" för att undvika DNS-cache problem
      const API_URL = `https://api-inference.huggingface.co/models/stabilityai/TripoSR?t=${Date.now()}`;

      const response = await fetch(API_URL, {
        headers: {
          "Authorization": `Bearer ${HF_TOKEN.trim()}`,
          "Content-Type": "application/octet-stream",
        },
        method: "POST",
        body: images[0],
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error("Ogiltig API-nyckel (Token).");
        if (response.status === 429) throw new Error("För många anrop. Vänta en minut.");
        throw new Error(`Serverfel: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      new GLTFLoader().load(url, (gltf) => {
        if (houseRef.current) sceneRef.current.remove(houseRef.current);
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += (box.max.y - box.min.y) / 2;
        model.scale.set(6, 6, 6);

        sceneRef.current.add(model);
        houseRef.current = model;
        setStatus("Modellering klar!");
        setLoading(false);
      });
    } catch (err) {
      console.error("DEBUG:", err);
      // Om felet är DNS-relaterat (ERR_NAME_NOT_RESOLVED)
      setStatus("Nätverksfel: Webbläsaren hittar inte AI-servern.");
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', position: 'relative', background: '#f8f9fa' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', top: 20, left: 20, background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: 280 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 16 }}>Hus-AI (TripoSR)</h3>

        <input
          type="file"
          multiple
          onChange={(e) => setImages(Array.from(e.target.files))}
          style={{ marginBottom: 15, width: '100%', fontSize: 12 }}
        />

        <button
          onClick={generateModel}
          disabled={loading || !images.length}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#ccc' : '#e67e22',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {loading ? "Skapar 3D..." : "Skapa 3D-hus"}
        </button>

        {status && (
          <div style={{ marginTop: 15, padding: 10, background: '#fff5f5', borderRadius: 6, border: '1px solid #feb2b2' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#c53030', fontWeight: '500' }}>{status}</p>
          </div>
        )}

        <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <button onClick={testNetwork} style={{ fontSize: 10, background: 'none', border: '1px solid #ddd', cursor: 'pointer', padding: '5px 10px', borderRadius: 4 }}>
          Kör diagnostik
        </button>
        {diag && <p style={{ fontSize: 9, marginTop: 5, color: '#666' }}>{diag}</p>}
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
