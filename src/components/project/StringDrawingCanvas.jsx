import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, RotateCcw, Pencil, Eraser, Undo2 } from 'lucide-react';

export default function StringDrawingCanvas({ imageUrl, lines, onLinesChange, onImageUpload }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState([]);
  const [tool, setTool] = useState('draw');
  const [color, setColor] = useState('#ef4444');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => onImageUpload(ev.target.result, file);
      reader.readAsDataURL(file);
    }
  };

  const getPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleStart = (e) => {
    if (tool !== 'draw') return;
    e.preventDefault();
    setDrawing(true);
    const pos = getPos(e);
    setCurrentLine([pos]);
  };

  const handleMove = useCallback((e) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentLine(prev => [...prev, pos]);
  }, [drawing]);

  const handleEnd = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    if (currentLine.length > 1) {
      onLinesChange([...lines, { points: currentLine, color, id: Date.now().toString() }]);
    }
    setCurrentLine([]);
  }, [drawing, currentLine, lines, color, onLinesChange]);

  const handleUndo = () => {
    onLinesChange(lines.slice(0, -1));
  };

  const handleClear = () => {
    onLinesChange([]);
  };

  const renderLine = (points, lineColor, key) => {
    if (points.length < 2) return null;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return (
      <path key={key} d={d} stroke={lineColor} strokeWidth="0.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    );
  };

  if (!imageUrl) {
    return (
      <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/30">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Upload className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Ladda upp bild på anläggning</h3>
        <p className="text-sm text-muted-foreground mb-4">Ta ett foto på den befintliga solpanelsanläggningen</p>
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={tool === 'draw' ? 'default' : 'outline'} onClick={() => setTool('draw')} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Rita
          </Button>
          <div className="flex gap-1 ml-2">
            {colors.map(c => (
              <button
                key={c}
                className="w-6 h-6 rounded-full border-2 transition-transform"
                style={{ backgroundColor: c, borderColor: c === color ? 'white' : 'transparent', transform: c === color ? 'scale(1.2)' : 'scale(1)', boxShadow: c === color ? '0 0 0 2px ' + c : 'none' }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleUndo} disabled={lines.length === 0} className="gap-1">
            <Undo2 className="w-3.5 h-3.5" /> Ångra
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} disabled={lines.length === 0} className="gap-1">
            <Eraser className="w-3.5 h-3.5" /> Rensa
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1">
            <Upload className="w-3.5 h-3.5" /> Galleri
          </Button>
          <Button size="sm" variant="outline" onClick={() => cameraInputRef.current?.click()} className="gap-1">
            <Camera className="w-3.5 h-3.5" /> Kamera
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        </div>
      </div>
      <div ref={canvasRef} className="relative rounded-xl overflow-hidden shadow-lg bg-black select-none" style={{ touchAction: 'none' }}>
        <img src={imageUrl} alt="Anläggning" className="w-full h-auto block" draggable={false} />
        <svg
          ref={overlayRef}
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        >
          {lines.map((line, i) => renderLine(line.points, line.color, line.id || i))}
          {currentLine.length > 1 && renderLine(currentLine, color, 'current')}
        </svg>
      </div>
    </div>
  );
}