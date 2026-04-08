import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Move, Maximize2 } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

export default function ImageCanvas({ imageUrl, items, onItemsChange, itemRenderer, onImageUpload, label }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be picked again
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => onImageUpload(ev.target.result, file);
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    setDragOffset({
      x: e.clientX - rect.left - (item.x / 100) * rect.width,
      y: e.clientY - rect.top - (item.y / 100) * rect.height,
    });
    setDragging(itemId);
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    onItemsChange(items.map(item =>
      item.id === dragging ? { ...item, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) } : item
    ));
  }, [dragging, dragOffset, items, onItemsChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleTouchStart = (e, itemId) => {
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    setDragOffset({
      x: touch.clientX - rect.left - (item.x / 100) * rect.width,
      y: touch.clientY - rect.top - (item.y / 100) * rect.height,
    });
    setDragging(itemId);
  };

  const handleTouchMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((touch.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((touch.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    onItemsChange(items.map(item =>
      item.id === dragging ? { ...item, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) } : item
    ));
  }, [dragging, dragOffset, items, onItemsChange]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [dragging, handleTouchMove, handleMouseUp]);

  if (!imageUrl) {
    return (
      <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/30 hover:bg-muted/50 transition-colors">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Upload className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-semibold mb-2">{label || 'Ladda upp bild'}</h3>
        <p className="text-sm text-muted-foreground mb-4">Ta ett foto eller välj en bild från enheten</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Välj från galleri
          </Button>
          <Button className="gap-2" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="w-4 h-4" /> Ta foto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Move className="w-3.5 h-3.5" /> Dra för att flytta • Klicka på bilden för att förstora
          </p>
          <div className="flex gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            <Button variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Galleri
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="w-3.5 h-3.5" /> Kamera
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setLightboxOpen(true)}>
              <Maximize2 className="w-3.5 h-3.5" /> Förstora
            </Button>
          </div>
        </div>

        <div
          ref={canvasRef}
          className="relative rounded-xl overflow-hidden shadow-lg bg-black select-none cursor-pointer"
          style={{ touchAction: 'none' }}
          onClick={(e) => {
            // Only open lightbox if not dragging an item
            if (!dragging && e.target === e.currentTarget || e.target.tagName === 'IMG') {
              setLightboxOpen(true);
            }
          }}
        >
          <img
            src={imageUrl}
            alt="Projektbild"
            className="w-full h-auto block"
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />
          {imageLoaded && items.map(item => (
            <div
              key={item.id}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `scale(${item.scale || 1})`,
                transformOrigin: 'top left',
                zIndex: 10,
              }}
              onMouseDown={e => handleMouseDown(e, item.id)}
              onTouchStart={e => handleTouchStart(e, item.id)}
              onClick={e => e.stopPropagation()}
            >
              {itemRenderer(item)}
            </div>
          ))}
        </div>
      </div>

      {lightboxOpen && (
        <ImageLightbox imageUrl={imageUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}