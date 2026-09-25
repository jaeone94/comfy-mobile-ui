// ComfyUI file utilities
import { ComfyFileService } from '../../infrastructure/api/ComfyFileService';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';

/**
 * Check if a file is an image based on extension
 */
export function isImageFile(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  // Remove any tags like [input] before checking extension
  const cleanFilename = filename.replace(/\s*\[.*?\]\s*$/, '');
  const ext = cleanFilename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
}

/**
 * Check if a file is a video based on extension
 */
export function isVideoFile(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  // Remove any tags like [input] before checking extension
  const cleanFilename = filename.replace(/\s*\[.*?\]\s*$/, '');
  const ext = cleanFilename.toLowerCase().split('.').pop();
  return ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext || '');
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get file type category
 */
export function getFileCategory(filename: string): 'image' | 'video' | 'unknown' {
  if (isImageFile(filename)) return 'image';
  if (isVideoFile(filename)) return 'video';
  return 'unknown';
}

/**
 * Parse ComfyUI file path
 * @example "subfolder/image.png" -> { filename: "image.png", subfolder: "subfolder" }
 */
export function parseComfyFilePath(path: string): { filename: string; subfolder?: string } {
  const lastSlashIndex = path.lastIndexOf('/');
  
  if (lastSlashIndex === -1) {
    return { filename: path };
  }
  
  return {
    filename: path.substring(lastSlashIndex + 1),
    subfolder: path.substring(0, lastSlashIndex)
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  
  const mimeTypes: Record<string, string> = {
    // Images
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'mkv': 'video/x-matroska',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',
    'mpg': 'video/mpeg',
    'mpeg': 'video/mpeg',
    
    // Default
    'default': 'application/octet-stream'
  };
  
  return mimeTypes[ext] || mimeTypes['default'];
}

/**
 * Create data URL from blob
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert data URL to blob
 */
export async function dataURLToBlob(dataURL: string): Promise<Blob> {
  const response = await fetch(dataURL);
  return response.blob();
}

/**
 * Check if browser supports media type
 */
export function supportsMediaType(mimeType: string): boolean {
  // Check video support
  if (mimeType.startsWith('video/')) {
    const video = document.createElement('video');
    return video.canPlayType(mimeType) !== '';
  }
  
  // Check image support
  if (mimeType.startsWith('image/')) {
    // Most modern browsers support common image formats
    return true;
  }
  
  return false;
}

/**
 * Format file size for display
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Create thumbnail from image file
 */
export async function createImageThumbnail(
  file: File | Blob,
  maxWidth: number = 150,
  maxHeight: number = 150,
  quality: number = 0.8
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate thumbnail dimensions
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      } else {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Create thumbnail from video file
 * Captures a frame at the specified time (default: 1 second)
 */
export async function createVideoThumbnail(
  file: File | Blob,
  maxWidth: number = 150,
  maxHeight: number = 150,
  captureTime: number = 1.0,
  quality: number = 0.8
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.preload = 'metadata';
    video.currentTime = captureTime;
    
    video.onloadeddata = () => {
      // Wait a bit to ensure the frame is loaded
      setTimeout(() => {
        // Calculate thumbnail dimensions
        let { videoWidth: width, videoHeight: height } = video;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          canvas.toBlob((blob) => {
            // Clean up
            URL.revokeObjectURL(video.src);
            resolve(blob);
          }, 'image/jpeg', quality);
        } else {
          URL.revokeObjectURL(video.src);
          resolve(null);
        }
      }, 100);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Create thumbnail from media file (auto-detects type)
 */
export async function createMediaThumbnail(
  file: File | Blob,
  filename: string,
  maxWidth: number = 150,
  maxHeight: number = 150,
  quality: number = 0.8
): Promise<Blob | null> {
  if (isImageFile(filename)) {
    return createImageThumbnail(file, maxWidth, maxHeight, quality);
  } else if (isVideoFile(filename)) {
    return createVideoThumbnail(file, maxWidth, maxHeight, 1.0, quality);
  }
  return null;
}

/**
 * Validate file for ComfyUI upload
 */
export function validateFileForUpload(file: File): { valid: boolean; error?: string } {
  // Check file size (100MB limit)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  // Check if it's an image or video
  if (!isImageFile(file.name) && !isVideoFile(file.name)) {
    return { valid: false, error: 'Only image and video files are supported' };
  }

  return { valid: true };
}

/**
 * Get recent files from history with type filtering
 */
export async function getRecentFiles(
  fileService: ComfyFileService,
  type: 'images' | 'videos' | 'all' = 'all',
  limit: number = 10
): Promise<IComfyFileInfo[]> {
  const files = await fileService.getFilesFromHistory(limit * 2); // Get more to filter
  
  const filteredFiles = files.filter(file => {
    if (type === 'images') return isImageFile(file.filename);
    if (type === 'videos') return isVideoFile(file.filename);
    return true;
  });

  return filteredFiles.slice(0, limit);
}

/**
 * Batch download files
 */
export async function batchDownloadFiles(
  fileService: ComfyFileService,
  files: IComfyFileInfo[],
  onProgress?: (current: number, total: number) => void
): Promise<{ filename: string; blob: Blob }[]> {
  const downloads: { filename: string; blob: Blob }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length);

    const blob = await fileService.downloadFile({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type
    });

    if (blob) {
      downloads.push({ filename: file.filename, blob });
    }

    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return downloads;
}

/**
 * Create file service instance with custom server URL
 */
export function createFileService(serverUrl?: string): ComfyFileService {
  return new ComfyFileService(serverUrl || 'http://localhost:8188');
}