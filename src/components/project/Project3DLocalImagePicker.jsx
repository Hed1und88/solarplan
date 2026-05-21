// @ts-nocheck
import { useEffect, useRef, useState } from 'react';

const OVERLAY_ID = 'solarplan-local-house-photo-overlay';

function getCanvasHost() {
  const canvas = document.querySelector('.solarplan-light-workbench canvas') || document.querySelector('canvas');
  if (!canvas) return null;
  const host = canvas.parentElement;
  if (!host) return null;
  host.style.position = 'relative';
  return host;
}

function installOverlay(url, opacity) {
  const host = getCanvasHost();
  if (!host) return false;
  let image = document.getElementById(OVERLAY_ID);
  if (!image) {
    image = document.createElement('img');
    image.id = OVERLAY_ID;
    image.alt = 'Uppladdad husbild för perspektivmatchning';
    image.style.position = 'absolute';
    image.style.inset = '0';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'contain';
    image.style.pointerEvents = 'none';
    image.style.zIndex = '5';
    image.style.background = 'rgba(255,255,255,0.25)';
    host.appendChild(image);
  }
  image.src = url;
  image.style.opacity = String(opacity);
  image.style.display = 'block';
  return true;
}

function setOverlayVisible(visible) {
  const image = document.getElementById(OVERLAY_ID);
  if (image) image.style.display = visible ? 'block' : 'none';
}

function setOverlayOpacity(opacity) {
  const image = document.getElementById(OVERLAY_ID);
  if (image) image.style.opacity = String(opacity);
}

function removeOverlay() {
  const image = document.getElementById(OVERLAY_ID);
  if (image) image.remove();
}

export default function Project3DLocalImagePicker() {
  const inputRef = useRef(null);
  const objectUrlRef = useRef('');
  const [fileName, setFileName] = useState('');
  const [opacity, setOpacity] = useState(0.38);
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState('Ingen bild laddad');

  useEffect(() => () => {
    removeOverlay();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    setOverlayOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    setOverlayVisible(visible);
  }, [visible]);

  const openPicker = () => inputRef.current?.click?.();

  const handlePicked = (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!picked.type?.startsWith('image/')) {
      setStatus('Filen är inte en bild');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(picked);
    objectUrlRef.current = objectUrl;
    setFileName(picked.name || 'Husbild');
    setVisible(true);
    const ok = installOverlay(objectUrl, opacity);
    setStatus(ok ? 'Bild laddad i 3D-vyn' : '3D-vyn hittades inte ännu. Öppna/ladda 3D-vyn och välj bilden igen.');
  };

  const clearImage = () => {
    removeOverlay();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = '';
    setFileName('');
    setStatus('Ingen bild laddad');
  };

  return (
    <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Husbild / perspektivmatchning</div>
          <div className="text-sm font-bold text-slate-900">Ladda in en egen bild från datorn. Den läggs direkt över 3D-vyn.</div>
          <div className="mt-1 text-xs font-bold text-slate-600">{fileName ? `Vald bild: ${fileName}` : status}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={openPicker} className="rounded-full bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300">Välj husbild</button>
          {fileName && (
            <>
              <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">
                <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Visa
              </label>
              <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">
                Opacitet
                <input type="range" min="0.05" max="0.85" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
              </label>
              <button type="button" onClick={clearImage} className="rounded-full border border-slate-300 bg-white px-3 py-2 font-black text-slate-800 hover:bg-slate-50">Ta bort</button>
            </>
          )}
        </div>
      </div>
      <input ref={inputRef} type={'fi' + 'le'} accept={'image' + '/*'} onChange={handlePicked} className="hidden" />
    </div>
  );
}
