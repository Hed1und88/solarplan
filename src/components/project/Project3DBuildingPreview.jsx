import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HF_TOKEN = "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";

const Project3DBuildingPreview = () => {
  const mountRef = useRef(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const sceneRef = useRef(new THREE.Scene());
  const houseRef = useRef(null);
  const rendererRef = useRef(null);
  const modelUrlRef = useRef("");

  useEffect(() => {
    if (!mountRef.current) return;
    const mountNode = mountRef.current;
    const width = mountNode.clientWidth;
    const height = mountNode.clientHeight;
    const scene = sceneRef.current;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(8, 8, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    scene.background = new THREE.Color(0xf0f2f5);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    scene.add(new THREE.GridHelper(20, 20));
    const geometry = new THREE.BoxGeometry(4, 2, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const placeholder = new THREE.Mesh(geometry, material);
    placeholder.position.y = 1;
    scene.add(placeholder);
    houseRef.current = placeholder;

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountNode) return;
      const nextWidth = mountNode.clientWidth;
      const nextHeight = mountNode.clientHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
      if (modelUrlRef.current) {
        URL.revokeObjectURL(modelUrlRef.current);
        modelUrlRef.current = "";
      }
      scene.clear();
      houseRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  const handleGenerate = async () => {
    if (images.length === 0) {
      setStatus("Välj minst en bild först.");
      return;
    }

    setLoading(true);
    setStatus("Ansluter till AI-server...");

    try {
      const API_URL = "https://api-inference.huggingface.co/models/stabilityai/TripoSR";

      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${HF_TOKEN.trim()}`,
          "Content-Type": "application/octet-stream",
        },
        method: "POST",
        body: images[0],
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Fel: ${response.status} - ${errText}`);
      }

      setStatus("Bearbetar 3D-data...");
      const blob = await response.blob();

      if (modelUrlRef.current) {
        URL.revokeObjectURL(modelUrlRef.current);
      }
      const modelUrl = URL.createObjectURL(blob);
      modelUrlRef.current = modelUrl;

      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          try {
            const newHouse = gltf?.scene;
            if (!(newHouse instanceof THREE.Object3D)) {
              throw new Error("AI-modellen är inte ett giltigt Three.js Object3D.");
            }

            if (houseRef.current instanceof THREE.Object3D) {
              sceneRef.current.remove(houseRef.current);
            }

            const box = new THREE.Box3().setFromObject(newHouse);
            const size = box.getSize(new THREE.Vector3());
            const maxSize = Math.max(size.x, size.y, size.z);
            if (!Number.isFinite(maxSize) || maxSize <= 0) {
              throw new Error("AI-modellen saknar giltig storlek.");
            }

            const scaleFactor = 4 / maxSize;
            newHouse.scale.set(scaleFactor, scaleFactor, scaleFactor);

            const scaledBox = new THREE.Box3().setFromObject(newHouse);
            const center = scaledBox.getCenter(new THREE.Vector3());
            newHouse.position.x -= center.x;
            newHouse.position.z -= center.z;
            newHouse.position.y -= scaledBox.min.y;

            sceneRef.current.add(newHouse);
            houseRef.current = newHouse;
            setStatus("Huset är klart!");
          } catch (err) {
            console.error("DETALJERAT FEL:", err);
            setStatus(`Fel: ${err.message}`);
          } finally {
            setLoading(false);
          }
        },
        undefined,
        (err) => {
          console.error("DETALJERAT FEL:", err);
          setStatus("Fel: Kunde inte tolka 3D-filen.");
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("DETALJERAT FEL:", err);
      setStatus(`Fel: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />

      <div style={{ position: 'absolute', top: 20, left: 20, background: 'white', padding: 15, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', width: 260 }}>
        <b style={{ display: 'block', marginBottom: 10 }}>AI 3D-Modellering</b>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setImages(Array.from(e.target.files || []))}
          style={{ fontSize: '12px', marginBottom: 10, width: '100%' }}
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {loading ? "Jobbar..." : "Skapa 3D-hus"}
        </button>
        {status && <p style={{ fontSize: '12px', color: status.includes('Fel') ? 'red' : 'green', marginTop: 10 }}>{status}</p>}
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
