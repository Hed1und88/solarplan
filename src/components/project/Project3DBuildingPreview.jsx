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
  const modelUrlRef = useRef("");

  useEffect(() => {
    if (!mountRef.current) return;
    const mountNode = mountRef.current;
    const width = mountNode.clientWidth;
    const height = mountNode.clientHeight;
    const scene = sceneRef.current;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(10, 10, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    scene.add(new THREE.GridHelper(20, 20));

    const geometry = new THREE.BoxGeometry(5, 3, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = 1.5;
    scene.add(cube);
    houseRef.current = cube;

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
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
    };
  }, []);

  const generateModel = async () => {
    if (images.length === 0) {
      alert("Ladda upp bilder först!");
      return;
    }

    setLoading(true);
    setStatus("AI skapar husmodell...");

    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/TripoSR",
        {
          mode: "cors",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN.trim()}`,
            "Content-Type": "application/octet-stream",
          },
          method: "POST",
          body: images[0],
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`API Svar: ${response.status}${errorText ? ` - ${errorText}` : ""}`);
      }

      const blob = await response.blob();
      if (modelUrlRef.current) URL.revokeObjectURL(modelUrlRef.current);
      const url = URL.createObjectURL(blob);
      modelUrlRef.current = url;

      new GLTFLoader().load(
        url,
        (gltf) => {
          try {
            const model = gltf?.scene;
            if (!(model instanceof THREE.Object3D)) {
              throw new Error("AI-modellen är inte ett giltigt Three.js Object3D.");
            }

            if (houseRef.current instanceof THREE.Object3D) {
              sceneRef.current.remove(houseRef.current);
            }

            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxSize = Math.max(size.x, size.y, size.z);

            if (!Number.isFinite(maxSize) || maxSize <= 0) {
              throw new Error("AI-modellen saknar giltig storlek.");
            }

            model.position.sub(center);
            model.position.y += size.y / 2;
            model.scale.setScalar(5 / maxSize);

            sceneRef.current.add(model);
            houseRef.current = model;
            setStatus("Klart!");
          } catch (err) {
            console.error(err);
            setStatus(`Fel: ${err.message}`);
          } finally {
            setLoading(false);
          }
        },
        undefined,
        (err) => {
          console.error(err);
          setStatus("Fel: Kunde inte tolka 3D-filen.");
          setLoading(false);
        }
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof TypeError
        ? "Connection blocked by browser or network. Please check your internet/firewall."
        : err.message;
      setStatus(`Fel: ${message}`);
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative', background: '#eee' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 10, left: 10, background: 'white', padding: 15, borderRadius: 8, width: 220 }}>
        <input type="file" multiple accept="image/*" onChange={(e) => setImages(Array.from(e.target.files || []))} style={{ fontSize: 10 }} />
        <button onClick={generateModel} disabled={loading} style={{ width: '100%', marginTop: 10, padding: 8, cursor: 'pointer' }}>
          {loading ? "Skapar..." : "Skapa 3D-hus"}
        </button>
        <p style={{ fontSize: 10, color: 'red' }}>{status}</p>
      </div>
    </div>
  );
};

export default Project3DBuildingPreview;
