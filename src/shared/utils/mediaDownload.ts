import { withComfyAuth } from '@/infrastructure/auth/ComfyAuthService';

/** Use the attachment response for remote media; keep existing local Blob downloads. */
export function getMediaDownloadUrl(previewUrl: string, baseUrl?: string): string {
  if (previewUrl.startsWith('blob:')) return previewUrl;
  const url = new URL(previewUrl, baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported media URL');
  const suffix = ['/comfymobile/api/files/view', '/comfymobile/api/files/download', '/view']
    .find(path => url.pathname.endsWith(path));
  if (!suffix || !url.searchParams.get('filename')) throw new Error('Missing media file location');
  url.pathname = url.pathname.slice(0, -suffix.length) + '/comfymobile/api/files/download';
  // Preserve auth and file identity, but never download a thumbnail/preview variant.
  for (const key of [...url.searchParams.keys()]) {
    if (!['filename', 'subfolder', 'type', 'token'].includes(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return withComfyAuth(url.toString());
}
