import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ImageLightbox({ imageUrl, onClose, children }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Close on escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const zoom = (delta) => {
    setScale(s => Math.min(8, Math.max(0.5, s + delta)));
  };

  const reset = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

  const handleWheel = (e) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 0.2 : -0.2);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setPanning(true);
    setPanStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (!panning) return;
    setTranslate({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [panning, panStart]);

  const handleMouseUp = useCallback(() => setPanning(false), []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Touch pinch zoom
  const lastTouchDist = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      setPanning(true);
      setPanStart({ x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y });
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist.current) {
        const delta = (dist - lastTouchDist.current) * 0.01;
        zoom(delta);
      }
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && panning) {
      setTranslate({ x: e.touches[0].clientX - panStart.x, y: e.touches[0].clientY - panStart.y });
    }
  };

  const handleTouchEnd = () => {
    lastTouchDist.current = null;
    setPanning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => zoom(0.5)}>
            <ZoomIn className="w-4 h-4" /> Zooma in
          </Button>
          <Button variant="outline" size="sm" className="gap-1 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => zoom(-0.5)}>
            <ZoomOut className="w-4 h-4" /> Zooma ut
          </Button>
          <Button variant="outline" size="sm" className="gap-1 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={reset}>
            <RotateCcw className="w-4 h-4" /> Återställ
          </Button>
          <span className="text-white/50 text-sm ml-2">{Math.round(scale * 100)}%</span>
        </div>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="relative">
            <img
              src={imageUrl}
              alt="Förstorad bild"
              className="max-w-[90vw] max-h-[80vh] block rounded-lg shadow-2xl"
              draggable={false}
            />
            {children}
          </div>
        </div>
      </div>

      <p className="text-center text-white/30 text-xs py-2 shrink-0">Scrolla eller nyp för att zooma • Dra för att panorera • ESC för att stänga</p>
    </div>
  );
}