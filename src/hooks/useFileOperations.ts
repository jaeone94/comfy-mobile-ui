import { useState } from 'react';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { isImageFile, isVideoFile } from '@/shared/utils/ComfyFileUtils';
import { extractVideoThumbnail } from '@/shared/utils/VideoUtils';
import { useConnectionStore } from '@/ui/store/connectionStore';

interface UploadState {
  isUploading: boolean;
  nodeId?: number;
  paramName?: string;
  message?: string;
}

interface PreviewModal {
  isOpen: boolean;
  filename: string;
  isImage: boolean;
  url?: string;
  loading?: boolean;
  error?: string;
}

interface ErrorDialog {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
}

interface UseFileOperationsProps {
  onSetWidgetValue: (nodeId: number, paramName: string, value: any) => void;
}

export const useFileOperations = ({ onSetWidgetValue }: UseFileOperationsProps) => {
  const { url: serverUrl } = useConnectionStore();
  
  // File preview states
  const [previewModal, setPreviewModal] = useState<PreviewModal>({ 
    isOpen: false, 
    filename: '', 
    isImage: false 
  });
  
  // Error dialog state
  const [errorDialog, setErrorDialog] = useState<ErrorDialog>({ 
    isOpen: false, 
    title: '', 
    message: '' 
  });

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>({ 
    isUploading: false 
  });

  // Create fileService dynamically based on current server URL
  const getFileService = () => {
    const currentUrl = serverUrl || 'http://localhost:8188';
    return new ComfyFileService(currentUrl);
  };

  // File preview handler
  const handleFilePreview = async (filename: string) => {
    
    if (!filename || typeof filename !== 'string') {
      console.error('❌ Invalid filename:', filename);
      setErrorDialog({
        isOpen: true,
        title: 'Invalid File',
        message: 'File name is invalid or empty.',
        details: `Received: ${JSON.stringify(filename)}`
      });
      return;
    }
    
    const isImage = isImageFile(filename);
    const isVideo = isVideoFile(filename);
    
    
    if (!isImage && !isVideo) {
      setErrorDialog({
        isOpen: true,
        title: 'Unsupported File Type',
        message: 'Only image and video files can be previewed.',
        details: `File: ${filename}\nSupported image types: png, jpg, jpeg, gif, bmp, webp, svg\nSupported video types: mp4, avi, mov, mkv, webm, flv, wmv`
      });
      return;
    }
    
    // Show loading modal immediately
    setPreviewModal({
      isOpen: true,
      filename,
      isImage,
      loading: true
    });
    
    try {
      const fileService = getFileService();
      
      // First check server connection
      const isConnected = await fileService.testConnection();
      
      if (!isConnected) {
        setPreviewModal(prev => ({ ...prev, loading: false, error: 'Server connection failed' }));
        setErrorDialog({
          isOpen: true,
          title: 'Server Connection Failed',
          message: 'Cannot connect to ComfyUI server.',
          details: `Server URL: ${serverUrl || 'http://localhost:8188'}\nPlease ensure ComfyUI is running and accessible.\n\nTo change the server URL, go to Settings > Server Settings.`
        });
        return;
      }
      
      // Parse filename and subfolder
      // Handle cases like "pasted/image.png" or "subfolder/filename.ext"
      let actualFilename: string;
      let subfolder: string = '';
      
      if (filename.includes('/')) {
        const lastSlashIndex = filename.lastIndexOf('/');
        subfolder = filename.substring(0, lastSlashIndex);
        actualFilename = filename.substring(lastSlashIndex + 1);
      } else {
        actualFilename = filename;
      }
      
      // For widget values, search in input first, then fallback to output and temp
      const locations = [
        { type: 'input', subfolder, description: 'Input files (widget values)' },
        { type: 'output', subfolder, description: 'Output files (fallback)' },
        { type: 'temp', subfolder, description: 'Temporary files (fallback)' }
      ];
      
      let blob: Blob | null = null;
      let successLocation = '';
      
      for (const location of locations) {
        
        try {
          blob = await fileService.downloadFile({
            filename: actualFilename,
            type: location.type,
            subfolder: location.subfolder
          });
          
          if (blob && blob.size > 0) {
            successLocation = `${location.type}${location.subfolder ? '/' + location.subfolder : ''}`;
            break;
          } else {
          }
        } catch (locationError) {
        }
      }
      
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        
        setPreviewModal({
          isOpen: true,
          filename,
          isImage,
          url,
          loading: false
        });
      } else {
        console.error('❌ File not found in any location');
        setPreviewModal(prev => ({ ...prev, loading: false, error: 'File not found' }));
        setErrorDialog({
          isOpen: true,
          title: 'File Not Found',
          message: `Could not find the file "${actualFilename}" on the ComfyUI server.`,
          details: `Original path: ${filename}\nParsed: ${actualFilename}${subfolder ? ` (subfolder: ${subfolder})` : ''}\n\nSearched in locations:\n${locations.map(loc => `- ${loc.type}${loc.subfolder ? '/' + loc.subfolder : ''} (${loc.description})`).join('\n')}\n\nNote: Widget values typically contain input files. Make sure the file exists in the ComfyUI input directory.`
        });
      }
    } catch (error) {
      console.error('💥 File preview error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = error instanceof Error ? error.stack : String(error);
      
      setPreviewModal(prev => ({ ...prev, loading: false, error: errorMessage }));
      setErrorDialog({
        isOpen: true,
        title: 'File Preview Error',
        message: `Failed to load file preview: ${errorMessage}`,
        details: `File: ${filename}\nError details:\n${errorDetails}`
      });
    }
  };

  // File upload handler
  const handleFileUpload = (nodeId: number, paramName: string, fileInputRef: React.RefObject<HTMLInputElement | null>) => {
    
    // Set up file input data for the specific node/param
    if (fileInputRef.current) {
      fileInputRef.current.dataset.nodeId = nodeId.toString();
      fileInputRef.current.dataset.paramName = paramName;
      fileInputRef.current.click();
    } else {
      console.error('❌ FileInputRef.current is null!');
    }
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const nodeId = parseInt(e.target.dataset.nodeId || '0');
    const paramName = e.target.dataset.paramName || '';
    
    
    // Validate file type
    if (!isImageFile(file.name) && !isVideoFile(file.name)) {
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ Invalid file type. Only images and videos are supported.` 
      });
      
      // Reset upload state after showing error message
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
      return;
    }
    
    // Check file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ File too large (${fileSizeMB}MB). Max: 100MB` 
      });
      
      // Reset upload state after showing error message
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
      return;
    }
    
    // Check server connection before upload
    try {
      const fileService = getFileService();
      const isConnected = await fileService.testConnection();
      if (!isConnected) {
        setErrorDialog({
          isOpen: true,
          title: 'Server Connection Failed',
          message: 'Cannot connect to ComfyUI server for file upload.',
          details: `Server URL: ${serverUrl || 'http://localhost:8188'}\nPlease ensure ComfyUI is running and accessible before uploading files.`
        });
        return;
      }
    } catch (error) {
      console.error('❌ Server connection test failed:', error);
      setErrorDialog({
        isOpen: true,
        title: 'Server Connection Error',
        message: 'Failed to test server connection before upload.',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\nServer: ${serverUrl || 'http://localhost:8188'}`
      });
      return;
    }
    
    // Start upload with progress message
    setUploadState({ 
      isUploading: true, 
      nodeId, 
      paramName,
      message: `Uploading "${file.name}"...` 
    });
    
    try {
      const fileService = getFileService();
      
      // Upload the main file
      const result = await fileService.uploadFile({
        file,
        filename: file.name,
        type: 'input', // Always upload to input folder for widget values
        overwrite: true
      });
      
      if (result) {
        const filename = result.name;
        const subfolder = result.subfolder;
        const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
        
        // If it's a video file, also extract and upload thumbnail
        let thumbnailUploaded = false;
        if (isVideoFile(file.name)) {
          try {
            setUploadState({ 
              isUploading: true,
              nodeId, 
              paramName,
              message: `Generating thumbnail for "${file.name}"...` 
            });
            
            const thumbnailFile = await extractVideoThumbnail(file, {
              maxWidth: 800,
              maxHeight: 600,
              format: 'png'
            });
            
            const thumbnailResult = await fileService.uploadFile({
              file: thumbnailFile,
              filename: thumbnailFile.name,
              subfolder: subfolder, // Same subfolder as video
              type: 'input',
              overwrite: true
            });
            
            if (thumbnailResult) {
              thumbnailUploaded = true;
              console.log(`📸 Video thumbnail uploaded: ${thumbnailResult.name}`);
            }
          } catch (thumbnailError) {
            console.warn('⚠️ Failed to create/upload video thumbnail:', thumbnailError);
            // Continue without thumbnail - don't fail the main upload
          }
        }
        
        // Update the widget value with the new filename
        onSetWidgetValue(nodeId, paramName, fullPath);
        
        // Show success state briefly, then reset
        setUploadState({ 
          isUploading: false,
          nodeId,
          paramName,
          message: `✅ Uploaded "${filename}" successfully!${thumbnailUploaded ? ' (with thumbnail)' : ''}` 
        });
        
        // Reset upload state after showing success message
        setTimeout(() => {
          setUploadState({ isUploading: false });
        }, 2000);
        
      } else {
        throw new Error('Upload failed - no response from server');
      }
      
    } catch (error) {
      console.error('💥 Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Show error state briefly
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ Upload failed: ${errorMessage}` 
      });
      
      // Reset upload state after showing error message
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
    } finally {
      // Clear the file input value to allow re-uploading the same file
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Close preview modal
  const closePreview = () => {
    if (previewModal.url) {
      URL.revokeObjectURL(previewModal.url);
    }
    setPreviewModal({ isOpen: false, filename: '', isImage: false });
  };

  // Close error dialog
  const closeErrorDialog = () => {
    setErrorDialog({ isOpen: false, title: '', message: '' });
  };

  // Handle direct file upload (from clipboard or album)
  const handleFileUploadDirect = async (nodeId: number, paramName: string, file: File): Promise<void> => {
    
    // Validate file type based on the parameter
    // For now, we'll accept both images and videos unless restricted
    if (!isImageFile(file.name) && !isVideoFile(file.name)) {
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ Invalid file type. Only images and videos are supported.` 
      });
      
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
      return;
    }
    
    // Check file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ File too large (${fileSizeMB}MB). Max: 100MB` 
      });
      
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
      return;
    }
    
    // Check server connection before upload
    try {
      const fileService = getFileService();
      const isConnected = await fileService.testConnection();
      if (!isConnected) {
        setErrorDialog({
          isOpen: true,
          title: 'Server Connection Failed',
          message: 'Cannot connect to ComfyUI server for file upload.',
          details: `Server URL: ${serverUrl || 'http://localhost:8188'}\nPlease ensure ComfyUI is running and accessible before uploading files.`
        });
        return;
      }
    } catch (error) {
      console.error('❌ Server connection test failed:', error);
      setErrorDialog({
        isOpen: true,
        title: 'Server Connection Error',
        message: 'Failed to test server connection before upload.',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\nServer: ${serverUrl || 'http://localhost:8188'}`
      });
      return;
    }
    
    // Start upload with progress message
    setUploadState({ 
      isUploading: true, 
      nodeId, 
      paramName,
      message: `Uploading "${file.name}"...` 
    });
    
    try {
      const fileService = getFileService();
      
      // Upload the main file
      const result = await fileService.uploadFile({
        file,
        filename: file.name,
        type: 'input', // Always upload to input folder for widget values
        overwrite: true
      });
      
      if (result) {
        const filename = result.name;
        const subfolder = result.subfolder;
        const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
        
        // If it's a video file, also extract and upload thumbnail
        let thumbnailUploaded = false;
        if (isVideoFile(file.name)) {
          try {
            setUploadState({ 
              isUploading: true,
              nodeId, 
              paramName,
              message: `Generating thumbnail for "${file.name}"...` 
            });
            
            const thumbnailFile = await extractVideoThumbnail(file, {
              maxWidth: 800,
              maxHeight: 600,
              format: 'png'
            });
            
            const thumbnailResult = await fileService.uploadFile({
              file: thumbnailFile,
              filename: thumbnailFile.name,
              subfolder: subfolder, // Same subfolder as video
              type: 'input',
              overwrite: true
            });
            
            if (thumbnailResult) {
              thumbnailUploaded = true;
              console.log(`📸 Video thumbnail uploaded: ${thumbnailResult.name}`);
            }
          } catch (thumbnailError) {
            console.warn('⚠️ Failed to create/upload video thumbnail:', thumbnailError);
            // Continue without thumbnail - don't fail the main upload
          }
        }
        
        // Update the widget value with the new filename
        onSetWidgetValue(nodeId, paramName, fullPath);
        
        // Show success state briefly, then reset
        setUploadState({ 
          isUploading: false,
          nodeId,
          paramName,
          message: `✅ Uploaded "${filename}" successfully!${thumbnailUploaded ? ' (with thumbnail)' : ''}` 
        });
        
        // Reset upload state after showing success message
        setTimeout(() => {
          setUploadState({ isUploading: false });
        }, 2000);
        
      } else {
        throw new Error('Upload failed - no response from server');
      }
      
    } catch (error) {
      console.error('💥 Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Show error state briefly
      setUploadState({ 
        isUploading: false,
        nodeId,
        paramName,
        message: `❌ Upload failed: ${errorMessage}` 
      });
      
      // Reset upload state after showing error message
      setTimeout(() => {
        setUploadState({ isUploading: false });
      }, 4000);
    }
  };

  return {
    // State
    previewModal,
    errorDialog,
    uploadState,
    
    // Functions
    handleFilePreview,
    handleFileUpload,
    handleFileSelect,
    handleFileUploadDirect,
    closePreview,
    closeErrorDialog,
  };
};
