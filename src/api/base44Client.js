import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

const originalUploadFile = base44?.integrations?.Core?.UploadFile;

if (originalUploadFile && !originalUploadFile.__solarplanFileUrlNormalized) {
  const normalizedUploadFile = async (...args) => {
    const result = await originalUploadFile(...args);
    const file_url = result?.file_url || result?.url || result?.fileUrl || result?.download_url || result?.public_url || result?.storage_url || result?.attachment_url || result?.file?.url || '';
    return file_url ? { ...result, file_url } : result;
  };

  normalizedUploadFile.__solarplanFileUrlNormalized = true;
  base44.integrations.Core.UploadFile = normalizedUploadFile;
}
