import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const numeric = value => Number.parseFloat(String(value || '').replace('px', '')) || 0;

export default function MapViewportLock() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;

    const handlePointerDown = event => {
      const host = document.querySelector('[data-map-host="canvas"]');
      const image = host?.querySelector('img[alt="Kartbild"]');
      const layer = image?.parentElement;
      const viewport = layer?.parentElement;
      const panButton = document.querySelector('button[title="Panorera kartbild"]');
      if (!image || !layer || !viewport || !layer.contains(event.target)) return;
      if (!panButton || !String(panButton.className).includes('bg-orange-50')) return;

      const width = numeric(layer.style.width) || image.naturalWidth || 1600;
      const height = numeric(layer.style.height) || image.naturalHeight || 1000;
      const rect = viewport.getBoundingClientRect();
      const fit = Math.min(rect.width / width, rect.height / height);
      const match = String(layer.style.transform || '').match(/scale\(([-+\d.eE]+)\)/);
      const scale = match ? Number(match[1]) : fit;

      if (scale <= fit + 0.0001) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [location.pathname]);

  return null;
}
