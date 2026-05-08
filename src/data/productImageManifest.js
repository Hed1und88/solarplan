export function productImageKey(product) {
  return `${product?.category || ''}|${product?.brand || ''}|${product?.model || ''}`.toLowerCase().trim();
}

export function slugifyProductImagePart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function localProductImagePath(product) {
  const category = slugifyProductImagePart(product?.category || 'produkt');
  const brand = slugifyProductImagePart(product?.brand || 'brand');
  const model = slugifyProductImagePart(product?.model || product?.name || 'model');
  return `/product-images/${category}/${brand}-${model}.webp`;
}

export const PRODUCT_IMAGE_MANIFEST = [];
