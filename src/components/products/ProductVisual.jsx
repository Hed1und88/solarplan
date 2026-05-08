import { useState } from 'react';
import { ImageOff } from 'lucide-react';

function hasUsableImageUrl(url) {
  const value = String(url || '').trim();
  return value.startsWith('https://') && !value.startsWith('data:image') && !value.includes('placeholder');
}

export default function ProductVisual({ product, className = 'w-full h-28' }) {
  const [failed, setFailed] = useState(false);
  const showImage = hasUsableImageUrl(product?.image_url) && !failed;

  return (
    <div className={`${className} overflow-hidden rounded-lg bg-muted`}>
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
    </div>
  );
}
