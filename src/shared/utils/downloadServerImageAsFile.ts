import type { ComfyFileService } from '@/infrastructure/api/ComfyFileService';

export async function downloadServerImageAsFile(
  comfyFileService: Pick<ComfyFileService, 'downloadFile'> | null | undefined,
  path: string
): Promise<File | null> {
  if (!comfyFileService) {
    return null;
  }

  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return null;
  }

  let filename = normalizedPath;
  let subfolder = '';
  if (normalizedPath.includes('/')) {
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    subfolder = normalizedPath.substring(0, lastSlashIndex);
    filename = normalizedPath.substring(lastSlashIndex + 1);
  }

  const locations: Array<{ type: 'input' | 'output' | 'temp'; subfolder: string }> = [
    { type: 'input', subfolder },
    { type: 'output', subfolder },
    { type: 'temp', subfolder }
  ];

  for (const location of locations) {
    try {
      const blob = await comfyFileService.downloadFile({
        filename,
        subfolder: location.subfolder,
        type: location.type
      });

      if (blob && blob.size > 0) {
        return new File([blob], filename, { type: blob.type || 'image/png' });
      }
    } catch (downloadError) {
      console.warn('Mask source lookup failed for location:', {
        type: location.type,
        subfolder: location.subfolder,
        filename,
        error: downloadError
      });
    }
  }

  return null;
}
