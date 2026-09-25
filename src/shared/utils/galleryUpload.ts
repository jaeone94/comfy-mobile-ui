import type { IComfyFileUploadResponse } from '@/shared/types/comfy/IComfyFile';

export interface GalleryUploadProgress {
  completed: number;
  total: number;
  uploaded: number;
  failed: string[];
  unsupported: string[];
}

// Match image formats that the gallery can display and ComfyUI can load.
export const isGalleryUploadImage = (file: File) =>
  /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name) && (!file.type || file.type.startsWith('image/'));

export const isGalleryUploadVideo = (file: File) =>
  /\.(mp4|mov|webm|mkv|avi|flv|wmv|m4v)$/i.test(file.name) &&
  (!file.type || file.type.startsWith('video/') || file.type === 'application/octet-stream');

export async function uploadGalleryMedia(
  files: File[],
  upload: (file: File) => Promise<IComfyFileUploadResponse | null>,
  onProgress: (progress: GalleryUploadProgress) => void,
  signal: AbortSignal,
  kind: 'images' | 'videos' = 'images',
): Promise<GalleryUploadProgress> {
  const result: GalleryUploadProgress = { completed: 0, total: files.length, uploaded: 0, failed: [], unsupported: [] };
  // Keep phone memory and the server load bounded. One failure must not stop the batch.
  for (const file of files) {
    if (signal.aborted) break;
    if (!(kind === 'images' ? isGalleryUploadImage(file) : isGalleryUploadVideo(file))) {
      result.unsupported.push(file.name);
    } else {
      try {
        const response = await upload(file);
        if (signal.aborted) break;
        if (response?.name) result.uploaded++;
        else result.failed.push(file.name);
      } catch {
        if (signal.aborted) break;
        result.failed.push(file.name);
      }
    }
    result.completed++;
    onProgress({ ...result, failed: [...result.failed], unsupported: [...result.unsupported] });
  }
  return result;
}
