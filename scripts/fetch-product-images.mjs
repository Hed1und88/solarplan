import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'product-images.manifest.json');
const outRoot = path.join(root, 'public', 'product-images');

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function imagePath(item) {
  const category = slug(item.category || 'produkt');
  const brand = slug(item.brand || 'brand');
  const model = slug(item.model || item.name || 'model');
  return {
    dir: path.join(outRoot, category),
    file: path.join(outRoot, category, `${brand}-${model}.webp`),
    publicPath: `/product-images/${category}/${brand}-${model}.webp`,
  };
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'user-agent': 'SolarPlan product image importer' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(file, Buffer.from(arrayBuffer));
}

async function main() {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest)) throw new Error('product-images.manifest.json must contain an array');

  const imported = [];
  const failed = [];

  for (const item of manifest) {
    if (!item.image_source_url) {
      failed.push({ ...item, error: 'missing image_source_url' });
      continue;
    }

    const target = imagePath(item);
    await fs.mkdir(target.dir, { recursive: true });

    try {
      console.log(`Downloading ${item.brand || ''} ${item.model || ''}`);
      await download(item.image_source_url, target.file);
      imported.push({ ...item, image_url: target.publicPath });
    } catch (error) {
      failed.push({ ...item, error: error.message });
    }
  }

  await fs.writeFile(path.join(root, 'product-images.imported.json'), JSON.stringify(imported, null, 2));
  await fs.writeFile(path.join(root, 'product-images.failed.json'), JSON.stringify(failed, null, 2));
  console.log(`Imported: ${imported.length}`);
  console.log(`Failed: ${failed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
