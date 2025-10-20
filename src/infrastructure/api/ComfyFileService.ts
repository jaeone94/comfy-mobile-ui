/**
 * ComfyUI File Service
 * Handles file upload, download, and management operations for ComfyUI server
 */

import axios from 'axios';
import {
  IComfyFileInfo,
  IComfyFileUploadOptions,
  IComfyFileDownloadOptions,
  IComfyFileUploadResponse,
  IComfyFileListResponse,
  IComfyHistoryEntry,
  IComfyQueueStatus,
  ComfyFileType
} from '@/shared/types/comfy/IComfyFile';

export class ComfyFileService {
  private serverUrl: string;
  private timeout: number;

  constructor(serverUrl: string = 'http://localhost:8188', timeout: number = 60000) {
    this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Test connection to ComfyUI server
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`🔍 Testing connection to ComfyUI server: ${this.serverUrl}/system_stats`);
      
      const response = await axios.get(`${this.serverUrl}/system_stats`, { 
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 300 // Only treat 2xx as success
      });
      
      console.log(`✅ ComfyUI server responded with status: ${response.status}`);
      return true;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        console.error(`❌ Connection failed - ${error.code}: Cannot reach ComfyUI server at ${this.serverUrl}`);
      } else if (error.response) {
        console.error(`❌ ComfyUI server responded with error status: ${error.response.status}`);
      } else {
        console.error(`❌ Failed to connect to ComfyUI server:`, error.message);
      }
      return false;
    }
  }

  /**
   * Get server queue status
   */
  async getQueueStatus(): Promise<IComfyQueueStatus | null> {
    try {
      const response = await axios.get<IComfyQueueStatus>(`${this.serverUrl}/queue`);
      return response.data;
    } catch (error) {
      console.error('Failed to get queue status:', error);
      return null;
    }
  }

  /**
   * Get execution history
   */
  async getHistory(limit?: number): Promise<IComfyHistoryEntry[]> {
    try {
      const response = await axios.get(`${this.serverUrl}/history`);
      const historyData = response.data;
      
      if (typeof historyData !== 'object') {
        return [];
      }


      const entries: IComfyHistoryEntry[] = [];
      const allKeys = Object.keys(historyData);
      // Reverse the keys so newest entries come first in our array
      const historyKeys = (limit ? allKeys.slice(-limit) : allKeys).reverse();
      
      for (const key of historyKeys) {
        const entry = historyData[key];
        if (entry && entry.outputs) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
      console.error('Failed to get execution history:', error);
      return [];
    }
  }

  /**
   * Get list of files from server using custom ComfyUI Mobile UI API extension
   */
  async listFiles(): Promise<IComfyFileListResponse> {
    try {
      
      // Try the custom API endpoint first
      try {
        const response = await axios.get(`${this.serverUrl}/comfymobile/api/files/list`);
        
        if (response.data?.status === 'success') {
          const { images, videos, files } = response.data;
          
          console.log('✅ Files loaded via custom API:', {
            images: images.length,
            videos: videos.length,
            files: files.length
          });
          
          // Map the files to include all fields from API
          const mapFiles = (fileArray: any[]) => fileArray.map(file => ({
            filename: file.filename,
            subfolder: file.subfolder || '',
            type: file.type,
            size: file.size,
            modified: file.modified,
            modified_iso: file.modified_iso,
            extension: file.extension
          }));
          
          return {
            images: mapFiles(images || []),
            videos: mapFiles(videos || []),
            files: mapFiles(files || [])
          };
        } else {
          throw new Error('Custom API returned non-success status');
        }
      } catch (apiError) {
        console.warn('Custom API not available, falling back to legacy method:', apiError);
        
        // Fallback: return empty results (legacy /view method doesn't work for listing)
        return { images: [], videos: [], files: [] };
      }
    } catch (error) {
      console.error('Failed to list server files:', error);
      return { images: [], videos: [], files: [] };
    }
  }

  /**
   * Get list of workflows from server using Mobile API Extension
   */
  async listWorkflows(): Promise<{ success: boolean; workflows: any[]; error?: string }> {
    try {
      
      // Try the custom API endpoint for workflows
      const response = await axios.get(`${this.serverUrl}/comfymobile/api/workflows/list`, {
        timeout: 10000 // 10 second timeout
      });
      
      console.log('📡 Workflows API response:', {
        status: response.status,
        data: response.data
      });
      
      if (response.data?.status === 'success') {
        const workflows = response.data.workflows || [];
        
        console.log('✅ Workflows loaded via custom API:', {
          count: response.data.count || workflows.length,
          totalWorkflows: workflows.length,
          firstWorkflow: workflows[0] || null
        });
        
        return {
          success: true,
          workflows: workflows
        };
      } else {
        throw new Error(`API returned status: ${response.data?.status || 'unknown'}`);
      }
    } catch (error: any) {
      console.warn('❌ Workflows API failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        endpoint: `${this.serverUrl}/comfymobile/api/workflows/list`
      });
      
      return {
        success: false,
        workflows: [],
        error: error.response?.data?.message || error.message || 'Failed to load workflows from server'
      };
    }
  }

  /**
   * Check if the ComfyUI Mobile UI API extension is available
   */
  async checkExtensionAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serverUrl}/comfymobile/api/status`, { timeout: 5000 });
      
      console.log('📡 Mobile API Extension response:', {
        status: response.status,
        data: response.data,
        statusField: response.data?.status,
        extensionField: response.data?.extension
      });
      
      const isAvailable = response.data?.status === 'ok' && response.data?.extension === 'ComfyUI Mobile UI API';
      
      return isAvailable;
    } catch (error: any) {
      console.warn('❌ Mobile API Extension check failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        endpoint: `${this.serverUrl}/comfymobile/api/status`
      });
      return false;
    }
  }

  /**
   * Upload workflow file to server using Mobile API Extension
   */
  async uploadWorkflow(file: File, filename?: string, overwrite: boolean = false): Promise<{ success: boolean; message?: string; filename?: string; error?: string }> {
    try {
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      
      if (filename) {
        formData.append('filename', filename);
      }
      
      if (overwrite) {
        formData.append('overwrite', 'true');
      }
      
      const endpoint = `${this.serverUrl}/comfymobile/api/workflows/upload`;
      
      console.log('📤 Uploading workflow to server:', {
        endpoint,
        filename: filename || file.name,
        size: file.size,
        overwrite
      });
      
      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000 // 30 second timeout for upload
      });
      
      console.log('📤 Workflow upload response:', {
        status: response.status,
        dataStatus: response.data?.status,
        filename: response.data?.filename
      });
      
      if (response.data?.status === 'success') {
        console.log('✅ Workflow uploaded successfully:', {
          filename: response.data.filename,
          size: response.data.size
        });
        
        return {
          success: true,
          message: response.data.message,
          filename: response.data.filename
        };
      } else {
        throw new Error(`API returned status: ${response.data?.status || 'unknown'}`);
      }
    } catch (error: any) {
      console.warn('❌ Workflow upload failed:', {
        filename: filename || file.name,
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to upload workflow to server'
      };
    }
  }

  /**
   * Download workflow content from server using Mobile API Extension
   */
  async downloadWorkflow(filename: string): Promise<{ success: boolean; content?: any; error?: string }> {
    try {
      
      // Ensure .json extension
      const workflowFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
      const endpoint = `${this.serverUrl}/comfymobile/api/workflows/content/${encodeURIComponent(workflowFilename)}`;
      
      
      const response = await axios.get(endpoint, {
        timeout: 15000 // 15 second timeout for download
      });
      
      console.log('📡 Workflow download response:', {
        status: response.status,
        dataStatus: response.data?.status,
        hasContent: !!response.data?.content
      });
      
      if (response.data?.status === 'success' && response.data?.content) {
        console.log('✅ Workflow downloaded successfully:', {
          filename: response.data.filename,
          size: response.data.size
        });
        
        return {
          success: true,
          content: response.data.content
        };
      } else {
        throw new Error(`API returned status: ${response.data?.status || 'unknown'}`);
      }
    } catch (error: any) {
      console.warn('❌ Workflow download failed:', {
        filename,
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to download workflow from server'
      };
    }
  }

  /**
   * Download a file from ComfyUI server
   */
  async downloadFile(options: IComfyFileDownloadOptions): Promise<Blob | null> {
    try {
      const { filename, subfolder = '', type = 'output', preview = false } = options;
      
      console.log('📥 [ComfyFileService] downloadFile called with:', {
        filename,
        subfolder,
        type,
        preview,
        serverUrl: this.serverUrl
      });
      
      const encodedFilename = encodeURIComponent(filename);
      const encodedSubfolder = encodeURIComponent(subfolder);
      
      // Construct download URL
      let downloadUrl = `${this.serverUrl}/view?filename=${encodedFilename}&type=${type}`;
      if (subfolder) {
        downloadUrl += `&subfolder=${encodedSubfolder}`;
      }
      if (preview) {
        downloadUrl += `&preview=true`;
      }


      const response = await axios.get(downloadUrl, {
        responseType: 'blob',
        timeout: this.timeout,
      });

      console.log('✅ [ComfyFileService] Download successful:', {
        filename,
        type,
        subfolder,
        responseSize: response.data.size,
        responseType: response.data.type
      });

      return response.data;
    } catch (error: any) {
      console.error(`❌ [ComfyFileService] Failed to download file ${options.filename}:`, {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url
      });
      return null;
    }
  }

  /**
   * Download file as data URL (base64)
   */
  async downloadFileAsDataUrl(options: IComfyFileDownloadOptions): Promise<string | null> {
    try {
      const blob = await this.downloadFile(options);
      if (!blob) return null;

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`Failed to download file as data URL:`, error);
      return null;
    }
  }

  /**
   * Upload a file to ComfyUI server
   */
  async uploadFile(options: IComfyFileUploadOptions): Promise<IComfyFileUploadResponse | null> {
    try {
      const { file, filename, subfolder = '', type = 'input', overwrite = false } = options;

      const formData = new FormData();

      // Add the file
      const finalFilename = filename || (file instanceof File ? file.name : 'upload');
      formData.append('image', file, finalFilename);

      // Add metadata
      if (subfolder) {
        formData.append('subfolder', subfolder);
      }
      if (type) {
        formData.append('type', type);
      }
      if (overwrite) {
        formData.append('overwrite', 'true');
      }

      const response = await axios.post<IComfyFileUploadResponse>(
        `${this.serverUrl}/upload/image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: this.timeout,
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to upload file:', error);
      return null;
    }
  }

  /**
   * Upload a model file to ComfyUI models directory using Mobile API Extension
   */
  async uploadModel(options: {
    file: File | Blob;
    filename?: string;
    folder: string;
    subfolder?: string;
    overwrite?: boolean;
    onProgress?: (progress: number) => void;
  }): Promise<{ success: boolean; message?: string; file_info?: any; error?: string }> {
    try {
      const { file, filename, folder, subfolder = '', overwrite = false, onProgress } = options;

      console.log('📤 Uploading model file:', {
        filename: filename || (file instanceof File ? file.name : 'model'),
        folder,
        subfolder,
        size: file.size,
        overwrite
      });

      const formData = new FormData();

      // Add the file
      const finalFilename = filename || (file instanceof File ? file.name : 'model.safetensors');
      formData.append('file', file, finalFilename);

      // Add metadata
      formData.append('folder', folder);

      if (subfolder) {
        formData.append('subfolder', subfolder);
      }

      if (filename) {
        formData.append('filename', filename);
      }

      if (overwrite) {
        formData.append('overwrite', 'true');
      }

      const endpoint = `${this.serverUrl}/comfymobile/api/models/upload`;

      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 3600000, // 1 hour
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        }
      });

      console.log('📤 Model upload response:', {
        status: response.status,
        success: response.data?.success,
        filename: response.data?.file_info?.filename
      });

      if (response.data?.success) {
        console.log('✅ Model uploaded successfully:', {
          filename: response.data.file_info?.filename,
          size: response.data.file_info?.size_mb + ' MB',
          path: response.data.file_info?.relative_path
        });

        return {
          success: true,
          message: response.data.message,
          file_info: response.data.file_info
        };
      } else {
        throw new Error(`API returned success: false`);
      }
    } catch (error: any) {
      console.warn('❌ Model upload failed:', {
        filename: options.filename || (options.file instanceof File ? options.file.name : 'model'),
        folder: options.folder,
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to upload model file'
      };
    }
  }

  /**
   * Delete a file from ComfyUI server (legacy method)
   */
  async deleteFile(filename: string, subfolder: string = '', type: ComfyFileType = 'input'): Promise<boolean> {
    try {
      const response = await axios.post(`${this.serverUrl}/delete/image`, {
        filename,
        subfolder,
        type
      });

      return response.status === 200;
    } catch (error) {
      console.error(`Failed to delete file ${filename}:`, error);
      return false;
    }
  }

  /**
   * Delete one or multiple files using the Mobile API Extension
   */
  async deleteFiles(files: Array<{filename: string; subfolder?: string; type?: ComfyFileType}>): Promise<{success: boolean; results: any[]; error?: string}> {
    try {
      const response = await axios.delete(`${this.serverUrl}/comfymobile/api/files/delete`, {
        data: { files },
        timeout: this.timeout
      });

      if (response.data?.status === 'success') {
        return {
          success: true,
          results: response.data.results || []
        };
      } else {
        return {
          success: false,
          results: [],
          error: response.data?.message || 'Delete operation failed'
        };
      }
    } catch (error: any) {
      console.error('Failed to delete files:', error);
      return {
        success: false,
        results: [],
        error: error.response?.data?.message || error.message || 'Failed to delete files'
      };
    }
  }

  /**
   * Move one or multiple files between folders using the Mobile API Extension
   */
  async moveFiles(
    files: Array<{filename: string; subfolder?: string; type?: ComfyFileType}>, 
    destinationType: ComfyFileType
  ): Promise<{success: boolean; results: any[]; error?: string}> {
    try {
      const response = await axios.post(`${this.serverUrl}/comfymobile/api/files/move`, {
        files,
        destination_type: destinationType
      }, {
        timeout: this.timeout
      });

      if (response.data?.status === 'success') {
        return {
          success: true,
          results: response.data.results || []
        };
      } else {
        return {
          success: false,
          results: [],
          error: response.data?.message || 'Move operation failed'
        };
      }
    } catch (error: any) {
      console.error('Failed to move files:', error);
      return {
        success: false,
        results: [],
        error: error.response?.data?.message || error.message || 'Failed to move files'
      };
    }
  }

  /**
   * Copy one or multiple files between folders using the Mobile API Extension
   */
  async copyFiles(
    files: Array<{filename: string; subfolder?: string; type?: ComfyFileType}>, 
    destinationType: ComfyFileType
  ): Promise<{success: boolean; results: any[]; error?: string}> {
    try {
      const response = await axios.post(`${this.serverUrl}/comfymobile/api/files/copy`, {
        files,
        destination_type: destinationType
      }, {
        timeout: this.timeout
      });

      if (response.data?.status === 'success') {
        return {
          success: true,
          results: response.data.results || []
        };
      } else {
        return {
          success: false,
          results: [],
          error: response.data?.message || 'Copy operation failed'
        };
      }
    } catch (error: any) {
      console.error('Failed to copy files:', error);
      return {
        success: false,
        results: [],
        error: error.response?.data?.message || error.message || 'Failed to copy files'
      };
    }
  }

  /**
   * Get files from execution history (already sorted by execution time - newest first)
   */
  async getFilesFromHistory(limit: number = 10): Promise<IComfyFileInfo[]> {
    const history = await this.getHistory(limit);
    const files: IComfyFileInfo[] = [];

    // ComfyUI history keys are ordered oldest first, but we want newest first
    // So we reverse the index: newest execution gets order 0, oldest gets higher numbers
    const totalHistoryEntries = history.length;
    
    history.forEach((entry, historyIndex) => {
      Object.values(entry.outputs).forEach(output => {
        if (output.images) {
          // Reverse the order: newest execution = 0, oldest = highest number
          const reversedOrder = totalHistoryEntries - 1 - historyIndex;
          const imagesWithOrder = output.images.map(img => ({
            ...img,
            executionOrder: reversedOrder,
            executionTimestamp: Date.now() - (reversedOrder * 1000) // Higher timestamp for newer
          }));
          files.push(...imagesWithOrder);
        }
        if (output.videos) {
          // Reverse the order: newest execution = 0, oldest = highest number
          const reversedOrder = totalHistoryEntries - 1 - historyIndex;
          const videosWithOrder = output.videos.map(vid => ({
            ...vid,
            executionOrder: reversedOrder,
            executionTimestamp: Date.now() - (reversedOrder * 1000) // Higher timestamp for newer
          }));
          files.push(...videosWithOrder);
        }
        if (output.gifs) {
          // ComfyUI stores videos/gifs in "gifs" key
          const reversedOrder = totalHistoryEntries - 1 - historyIndex;
          const gifsWithOrder = output.gifs.map(gif => ({
            ...gif,
            executionOrder: reversedOrder,
            executionTimestamp: Date.now() - (reversedOrder * 1000) // Higher timestamp for newer
          }));
          files.push(...gifsWithOrder);
        }
      });
    });

    return files;
  }

  /**
   * Download multiple files from history
   */
  async downloadFilesFromHistory(limit: number = 5): Promise<{ filename: string; blob: Blob }[]> {
    const files = await this.getFilesFromHistory(limit);
    const downloads: { filename: string; blob: Blob }[] = [];

    for (const fileInfo of files.slice(0, limit)) {
      const blob = await this.downloadFile({
        filename: fileInfo.filename,
        subfolder: fileInfo.subfolder,
        type: fileInfo.type
      });

      if (blob) {
        downloads.push({
          filename: fileInfo.filename,
          blob
        });
      }

      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return downloads;
  }

  /**
   * Create download URL for a file (for direct browser download)
   */
  createDownloadUrl(options: IComfyFileDownloadOptions): string {
    const { filename, subfolder = '', type = 'output', preview = false } = options;
    
    const encodedFilename = encodeURIComponent(filename);
    const encodedSubfolder = encodeURIComponent(subfolder);
    
    let downloadUrl = `${this.serverUrl}/view?filename=${encodedFilename}&type=${type}`;
    if (subfolder) {
      downloadUrl += `&subfolder=${encodedSubfolder}`;
    }
    if (preview) {
      downloadUrl += `&preview=true`;
    }

    return downloadUrl;
  }

  /**
   * Check if a file exists on the server
   */
  async fileExists(filename: string, subfolder: string = '', type: ComfyFileType = 'output'): Promise<boolean> {
    try {
      const response = await axios.head(this.createDownloadUrl({
        filename,
        subfolder,
        type
      }));
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file info (size, type, etc.)
   */
  async getFileInfo(filename: string, subfolder: string = '', type: ComfyFileType = 'output'): Promise<IComfyFileInfo | null> {
    try {
      const response = await axios.head(this.createDownloadUrl({
        filename,
        subfolder,
        type
      }));

      const contentLength = response.headers['content-length'];
      const lastModified = response.headers['last-modified'];

      return {
        filename,
        subfolder,
        type,
        size: contentLength ? parseInt(contentLength) : undefined,
        lastModified: lastModified ? new Date(lastModified) : undefined
      };
    } catch (error) {
      return null;
    }
  }
}

// Export a default instance
export const comfyFileService = new ComfyFileService();

// Export individual functions for easier importing
export const {
  testConnection,
  downloadFile,
  downloadFileAsDataUrl,
  uploadFile,
  deleteFile,
  listFiles,
  getHistory,
  getQueueStatus,
  createDownloadUrl,
  fileExists,
  getFileInfo
} = comfyFileService;