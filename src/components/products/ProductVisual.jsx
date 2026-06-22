import { useState } from 'react';
import { ImageOff, Ruler } from 'lucide-react';
import { productMountingProfiles } from '@/lib/productDocuments';

function hasUsableImageUrl(url) {
  const value = String(url || '').trim();
  return value.startsWith('https://') && !value.startsWith('data:image') && !value.includes('placeholder');
}

export default function ProductVisual({ product, className = 'w-full h-28' }) {
  const [failed, setFailed] = useState(false);
  const showImage = hasUsableImageUrl(product?.image_url) && !failed;
  const mountingProfiles = productMountingProfiles(product);

  return (
    <div className={`${className} relative overflow-hidden rounded-lg bg-muted`}>
      {showImage ? (
        <img
          src={product.image_url}
          alt={product.name || `${product.brand || ''} ${product.model || ''}`.trim() || 'Produktbild'}
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted text-center text-muted-foreground">
          <ImageOff className="h-5 w-5" />
          <span className="text-[11px] font-medium">Bild saknas</span>
        </div>
      )}

      {mountingProfiles.length > 0 && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 rounded-lg border border-blue-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-blue-900">
            <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />Lastklassade klämprofiler</span>
            <span>{mountingProfiles.length} st</span>
          </div>
          <div className="mt-0.5 truncate text-[9px] text-blue-800">
            {mountingProfiles.map(profile => profile.load_notation).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
