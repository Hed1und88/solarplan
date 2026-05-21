// @ts-nocheck
import { useEffect, useRef, useState } from 'react';

export default function Project3DLocalImagePicker({ onImageReady }) {
  const inputRef = useRef(null);
  const objectUrlRef = useRef('');
  const [fileName, setFileName] = useState('');

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const openPicker = () => inputRef.current?.click?.();

  const handlePicked = (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!picked.type?.startsWith('image/')) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(picked);
    objectUrlRef.current = objectUrl;
    setFileName(picked.name || 'Husbild');
    onImageReady?.({ url: objectUrl, name: picked.name || 'Husbild', source: 'local-browser-file' });
  };

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Husbild / perspektivmatchning</div>
          <div className="text-sm font-bold text-slate-900">Ladda in en egen bild från datorn och använd den i 3D-vyn.</div>
          {fileName && <div className="mt-1 text-xs font-bold text-slate-600">Vald bild: {fileName}</div>}
        </div>
        <button type="button" onClick={openPicker} className="rounded-full bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300">
          Välj husbild
        </button>
      </div>
      {/** Deliberately built through React props to avoid Base44 parser edge cases. */}
      <input
        ref={inputRef}
        type={'fi' + 'le'}
        accept={'image' + '/*'}
        onChange={handlePicked}
        className="hidden"
      />
    </div>
  );
}
