import { useState } from 'react';
import { Package } from 'lucide-react';

function colorFor(category) {
  if (category === 'solpanel') return '#f97316';
  if (category === 'vaxelriktare') return '#2563eb';
  if (category === 'batteri') return '#16a34a';
  if (category === 'montagesystem') return '#ca8a04';
  return '#64748b';
}

function typeFor(category) {
  if (category === 'solpanel') return 'SOLPANEL';
  if (category === 'vaxelriktare') return 'VÄXELRIKTARE';
  if (category === 'batteri') return 'BATTERI';
  if (category === 'montagesystem') return 'MONTAGE';
  return 'PRODUKT';
}

function valueFor(product) {
  if (product?.power_watts) return `${product.power_watts} W`;
  if (product?.capacity_kwh) return `${product.capacity_kwh} kWh`;
  return product?.unit || 'st';
}

function FallbackVisual({ product, compact }) {
  const color = colorFor(product?.category);
  const brand = product?.brand || 'Produkt';
  const model = product?.model || product?.name || '';
  const type = typeFor(product?.category);
  const value = valueFor(product);

  return (
    <svg viewBox="0 0 640 360" className="h-full w-full">
      <rect width="640" height="360" rx="36" fill="#f8fafc" />
      <rect x="32" y="32" width="576" height="296" rx="28" fill="#ffffff" stroke="#e2e8f0" strokeWidth="4" />
      <rect x="56" y="56" width={compact ? '190' : '220'} height="44" rx="22" fill={color} />
      <text x={compact ? '151' : '166'} y="85" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="700" fill="white">{type}</text>
      <text x="56" y="155" fontFamily="Arial, sans-serif" fontSize={compact ? '34' : '42'} fontWeight="800" fill="#0f172a">{String(brand).slice(0, compact ? 15 : 20)}</text>
      <text x="56" y="205" fontFamily="Arial, sans-serif" fontSize={compact ? '22' : '28'} fontWeight="600" fill="#334155">{String(model).slice(0, compact ? 24 : 34)}</text>
      <text x="56" y="278" fontFamily="Arial, sans-serif" fontSize={compact ? '28' : '34'} fontWeight="800" fill={color}>{value}</text>
      <circle cx="530" cy="248" r="58" fill={color} opacity="0.14" />
      <circle cx="530" cy="248" r="34" fill={color} opacity="0.28" />
      {!brand && <Package x="496" y="214" width="68" height="68" color={color} />}
    </svg>
  );
}

export default function ProductVisual({ product, className = 'w-full h-28', compact = false }) {
  const [failed, setFailed] = useState(false);
  const hasRealImage = Boolean(product?.image_url) && !String(product.image_url).startsWith('data:image/svg+xml') && !failed;

  return (
    <div className={`${className} overflow-hidden rounded-lg bg-muted`}>
      {hasRealImage ? (
        <img
          src={product.image_url}
          alt={product.name || `${product.brand || ''} ${product.model || ''}`.trim() || 'Produktbild'}
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <FallbackVisual product={product} compact={compact} />
      )}
    </div>
  );
}
