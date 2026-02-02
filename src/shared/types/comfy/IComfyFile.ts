/**
 * ComfyUI File Operations Types
 * Types for file upload, download, and management operations
 */

export interface IComfyFileInfo {
  filename: string;
  subfolder: string;
  type: string;
  size?: number;
  modified?: number;           // Unix timestamp from API
  modified_iso?: string;       // ISO format timestamp from API
  lastModified?: Date;
  executionOrder?: number;     // History order (0 = newest execution)
  executionTimestamp?: number; // Approximate timestamp from execution order
}

export interface IComfyFileUploadOptions {
  file: File | Blob;
  filename?: string;
  subfolder?: string;
  type?: 'input' | 'temp' | 'output' | string;
  overwrite?: boolean;
}

export interface IComfyFileDownloadOptions {
  filename: string;
  subfolder?: string;
  type?: 'input' | 'temp' | 'output' | string;
  preview?: boolean;
  modified?: number | string | Date;
}

export interface IComfyFileUploadResponse {
  name: string;
  subfolder: string;
  type: string;
}

export interface IComfyServerResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface IComfyFileListResponse {
  images: IComfyFileInfo[];
  videos: IComfyFileInfo[];
  files: IComfyFileInfo[];
}

export interface IComfyHistoryEntry {
  prompt: any[];
  outputs: Record<string, {
    images?: IComfyFileInfo[];
    videos?: IComfyFileInfo[];
    gifs?: IComfyFileInfo[];  // ComfyUI stores videos/gifs in "gifs" key
    [key: string]: any;
  }>;
}

export interface IComfyQueueStatus {
  queue_running: Array<any>;
  queue_pending: Array<any>;
}

export type ComfyFileType = 'input' | 'output' | 'temp' | 'models' | 'checkpoints' | string;