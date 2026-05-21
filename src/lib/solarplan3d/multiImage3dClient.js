const ENDPOINT_URL = import.meta.env.VITE_HF_MULTI_3D_ENDPOINT_URL;
const ACCESS_TOKEN = import.meta.env.VITE_HUGGING_FACE_TOKEN;

function base64ToBlob(base64, mimeType = 'model/gltf-binary') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

async function fetchBlobFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Kunde inte hämta GLB från URL (${response.status})`);
  return response.blob();
}

function buildRequestHeaders() {
  const headers = {};
  if (ACCESS_TOKEN) headers.Authorization = ['Bearer', ACCESS_TOKEN].join(' ');
  return headers;
}

export async function generateMultiImageHouseModel(files) {
  if (!ENDPOINT_URL) throw new Error('Saknar VITE_HF_MULTI_3D_ENDPOINT_URL i .env');
  if (!ACCESS_TOKEN) throw new Error('Saknar VITE_HUGGING_FACE_TOKEN i .env');
  if (!files?.length) throw new Error('Inga bilder valda');

  const formData = new FormData();
  files.forEach((file, index) => {
    formData.append('images', file);
    formData.append(`image_${index}_name`, file.name || `image_${index + 1}`);
  });

  const response = await fetch(ENDPOINT_URL, {
    method: 'POST',
    headers: buildRequestHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`3D-generering misslyckades (${response.status}) ${errorText || ''}`.trim());
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('model/gltf-binary') || contentType.includes('application/octet-stream')) return response.blob();

  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (data?.glb_url) return fetchBlobFromUrl(data.glb_url);
    if (data?.output_url) return fetchBlobFromUrl(data.output_url);
    if (data?.url) return fetchBlobFromUrl(data.url);
    if (data?.glb_base64) return base64ToBlob(data.glb_base64, 'model/gltf-binary');
    if (data?.base64) return base64ToBlob(data.base64, 'model/gltf-binary');
    throw new Error('Endpointen svarade med JSON men ingen GLB hittades.');
  }

  return response.blob();
}
