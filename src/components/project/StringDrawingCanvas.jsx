import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera } from 'lucide-react';

const STRING_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#e879f9'];

export default function StringDrawingCanvas({ imageUrl, strings, onStringsChange, onImageUpload, activeStringId }) {
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Long-press state
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const progressTimer = useRef(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [hoverPos, setHoverPos] = useState(null);

  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef([]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { currentPointsRef.current = currentPoints; }, [currentPoints]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = (ev) => onImageUpload(ev.target.result, file);
      reader.readAsDataURL(file);
    }
  };

  const getPos = (clientX, clientY) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  // ── Long-press to start drawing ──
  const startLongPress = (cx, cy) => {
    longPressFired.current = false;
    setLongPressProgress(0);
    const startTime = Date.now();
    progressTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startTime) / 2000) * 100);
      setLongPressProgress(pct);
    }, 30);
    longPressTimer.current = setTimeout(() => {
      clearInterval(progressTimer.current);
      longPressFired.current = true;
      const pos = getPos(cx, cy);
      setIsDrawing(true);
      isDrawingRef.current = true;
      const pts = [pos];
      setCurrentPoints(pts);
      currentPointsRef.current = pts;
      setLongPressProgress(0);
    }, 2000);
  };

  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
    clearInterval(progressTimer.current);
    if (!longPressFired.current) setLongPressProgress(0);
  };

  // ── Add point on click ──
  const addPoint = (cx, cy) => {
    if (!isDrawingRef.current) return;
    const pos = getPos(cx, cy);
    const next = [...currentPointsRef.current, pos];
    setCurrentPoints(next);
    currentPointsRef.current = next;
  };

  // ── Finish string on double-click ──
  const finishString = () => {
    if (!isDrawingRef.current) return;
    const pts = currentPointsRef.current;
    if (pts.length >= 2 && activeStringId) {
      onStringsChange(prev => prev.map(s => s.id === activeStringId ? { ...s, points: pts } : s));
    }
    setIsDrawing(false); isDrawingRef.current = false;
    setCurrentPoints([]); currentPointsRef.current = [];
    setHoverPos(null);
  };

  // ── Mouse handlers ──
  const clickCount = useRef(0);
  const clickTimer = useRef(null);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (!isDrawingRef.current) {
      startLongPress(e.clientX, e.clientY);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawingRef.current) return;
    const pos = getPos(e.clientX, e.clientY);
    setHoverPos(pos);
  };

  const handleMouseUp = (e) => {
    cancelLongPress();
    if (!isDrawingRef.current) return;
    // Detect double-click
    clickCount.current += 1;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        if (clickCount.current === 1) addPoint(e.clientX, e.clientY);
        clickCount.current = 0;
      }, 250);
    } else if (clickCount.current >= 2) {
      clearTimeout(clickTimer.current);
      clickCount.current = 0;
      finishString();
    }
  };

  // ── Touch handlers ──
  const lastTouchPos = useRef(null);
  const touchClickCount = useRef(0);
  const touchClickTimer = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) { cancelLongPress(); return; }
    const t = e.touches[0];
    lastTouchPos.current = { x: t.clientX, y: t.clientY };
    if (!isDrawingRef.current) startLongPress(t.clientX, t.clientY);
  };

  const handleTouchMove = (e) => {
    cancelLongPress();
    if (!isDrawingRef.current) return;
    const t = e.touches[0];
    const pos = getPos(t.clientX, t.clientY);
    setHoverPos(pos);
  };

  const handleTouchEnd = (e) => {
    cancelLongPress();
    if (!isDrawingRef.current) return;
    const t = e.changedTouches[0];
    const start = lastTouchPos.current || { x: t.clientX, y: t.clientY };
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) return;

    touchClickCount.current += 1;
    if (touchClickCount.current === 1) {
      touchClickTimer.current = setTimeout(() => {
        if (touchClickCount.current === 1) addPoint(t.clientX, t.clientY);
        touchClickCount.current = 0;
      }, 300);
    } else if (touchClickCount.current >= 2) {
      clearTimeout(touchClickTimer.current);
      touchClickCount.current = 0;
      finishString();
    }
  };

  const activeString = strings.find(s => s.id === activeStringId);
  const drawColor = activeString?.color || STRING_COLORS[strings.length % STRING_COLORS.length];

  if (!imageUrl) {
    return (
      <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/30">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Upload className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Ladda upp bild på anläggning</h3>
        <p className="text-sm text-muted-foreground mb-4">Ta ett foto eller välj från galleri</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Galleri
          </Button>
          <Button className="gap-2" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="w-4 h-4" /> Kamera
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Image buttons */}
      <div className="flex gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        <Button size="sm" variant="outline" className="gap-1" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> Galleri
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => cameraInputRef.current?.click()}>
          <Camera className="w-3.5 h-3.5" /> Kamera
        </Button>
      </div>

      {/* Status */}
      <div className="text-xs px-2 py-1.5 rounded-lg bg-muted text-muted-foreground flex items-center gap-2">
        {!isDrawing && !activeStringId && <span>Välj en slinga nedan → håll 2 sek på bilden för att starta ritning</span>}
        {!isDrawing && activeStringId && <span>✋ <strong>Håll 2 sek</strong> på första panelen för att starta <span style={{ color: drawColor }}>●</span> {activeString?.name}</span>}
        {isDrawing && (
          <>
            <span className="animate-pulse" style={{ color: drawColor }}>●</span>
            <span>Ritar <strong>{activeString?.name}</strong> — klicka nästa panel • <strong>dubbelklicka</strong> för att avsluta</span>
            <span className="ml-auto text-xs">{currentPoints.length} punkter</span>
          </>
        )}
        {longPressProgress > 0 && longPressProgress < 100 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-yellow-600">Håll kvar...</span>
            <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-yellow-500 transition-all" style={{ width: `${longPressProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden shadow-lg select-none bg-black"
        style={{ touchAction: 'none', cursor: isDrawing ? 'crosshair' : (activeStringId ? 'cell' : 'default') }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img src={imageUrl} alt="Anläggning" className="w-full h-auto block" draggable={false} />
        <svg
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Existing strings */}
          {strings.map(str => str.points && str.points.length >= 2 && (
            <g key={str.id}>
              <polyline
                points={str.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={str.color}
                strokeWidth="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {str.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="0.8" fill={str.color} stroke="white" strokeWidth="0.2" />
              ))}
              {/* Label at midpoint */}
              {str.points.length >= 2 && (() => {
                const mid = str.points[Math.floor(str.points.length / 2)];
                return (
                  <text x={mid.x} y={mid.y - 2} fill="white" fontSize="2.5" textAnchor="middle"
                    style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}>
                    {str.name}
                  </text>
                );
              })()}
            </g>
          ))}
          {/* Current drawing */}
          {isDrawing && currentPoints.length >= 1 && (
            <g>
              {currentPoints.length >= 2 && (
                <polyline
                  points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke={drawColor} strokeWidth="0.6"
                  strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 0.5"
                />
              )}
              {hoverPos && currentPoints.length >= 1 && (
                <line
                  x1={currentPoints[currentPoints.length - 1].x}
                  y1={currentPoints[currentPoints.length - 1].y}
                  x2={hoverPos.x} y2={hoverPos.y}
                  stroke={drawColor} strokeWidth="0.4" strokeDasharray="0.8 0.5" opacity={0.6}
                />
              )}
              {currentPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="0.9" fill={drawColor} stroke="white" strokeWidth="0.25" />
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
