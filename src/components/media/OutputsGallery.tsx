import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Image as ImageIcon, Video, Loader2, RefreshCw, Server, AlertCircle, CheckCircle, Trash2, FolderOpen, Check, X, MousePointer, CheckSquare, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { FilePreviewModal } from '../modals/FilePreviewModal';
import { useNavigate } from 'react-router-dom';


type TabType = 'images' | 'videos';
type FolderType = 'input' | 'output' | 'temp' | 'all';

// Utility function to find matching image file for a video
const findMatchingImageFile = (
  videoFilename: string,
  imageFiles: IComfyFileInfo[],
  subfolder?: string,
  type?: string
): IComfyFileInfo | null => {
  // Get video filename without extension
  let videoNameWithoutExt = videoFilename.substring(0, videoFilename.lastIndexOf('.'));

  // Remove -audio suffix if present (e.g., "something-video-audio" -> "something-video")
  if (videoNameWithoutExt.endsWith('-audio')) {
    videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
  }

  // Look for image with same name but image extension in the SAME subfolder and folder type
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

  for (const img of imageFiles) {
    // Must match subfolder and folder type (input/output/temp) as well as filename
    if (img.subfolder !== subfolder || img.type !== type) {
      continue;
    }

    const imgNameWithoutExt = img.filename.substring(0, img.filename.lastIndexOf('.'));
    const imgExt = img.filename.split('.').pop()?.toLowerCase() || '';

    if (imgNameWithoutExt === videoNameWithoutExt && imageExtensions.includes(imgExt)) {
      return img;
    }
  }

  return null;
};

interface LazyImageProps {
  file: IComfyFileInfo;
  onImageClick: (file: IComfyFileInfo) => void;
  allFiles?: { images: IComfyFileInfo[]; videos: IComfyFileInfo[] }; // For finding matching thumbnails
  index?: number; // For initial loading optimization
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (file: IComfyFileInfo, selected: boolean) => void;
}

const LazyImage: React.FC<LazyImageProps> = ({
  file,
  onImageClick,
  allFiles,
  index = 0,
  isSelectionMode = false,
  isSelected = false,
  onSelectionChange
}) => {
  const { t } = useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  // Load first 12 items immediately (2 rows on most screens)
  const [isInView, setIsInView] = useState(index < 12);
  const [hasError, setHasError] = useState(false);
  const [matchingImageThumbnail, setMatchingImageThumbnail] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const { url: serverUrl } = useConnectionStore();
  const comfyFileService = new ComfyFileService(serverUrl);

  // Intersection Observer for lazy loading (skip for first 12 items)
  useEffect(() => {
    // Skip lazy loading for first 12 items
    if (index < 12) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);

      // Check if element is already in view on mount
      const rect = imgRef.current.getBoundingClientRect();
      const isInitiallyVisible = rect.top >= 0 && rect.top <= window.innerHeight;
      if (isInitiallyVisible) {
        setIsInView(true);
        observer.disconnect();
      }
    }

    return () => observer.disconnect();
  }, [index]);

  const isVideoFile = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext);
  };

  // Find matching image thumbnail for video files
  const findMatchingImageForVideo = (videoFilename: string): IComfyFileInfo | null => {
    if (!allFiles?.images || !isVideoFile(videoFilename)) return null;

    return findMatchingImageFile(videoFilename, allFiles.images, file.subfolder, file.type);
  };

  // Check if an image file has a corresponding video (for filtering out thumbnails)
  const hasCorrespondingVideo = (imageFile: IComfyFileInfo): boolean => {
    if (!allFiles?.videos) return false;

    // Get image filename without extension
    const imgNameWithoutExt = imageFile.filename.substring(0, imageFile.filename.lastIndexOf('.'));

    // Look for video with same name in the SAME subfolder and folder type
    const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm'];

    for (const video of allFiles.videos) {
      // Must match subfolder and folder type (input/output/temp) as well as filename
      if (video.subfolder !== imageFile.subfolder || video.type !== imageFile.type) {
        continue;
      }

      let videoNameWithoutExt = video.filename.substring(0, video.filename.lastIndexOf('.'));
      const videoExt = video.filename.split('.').pop()?.toLowerCase() || '';

      // Remove -audio suffix if present (e.g., "something-video-audio" -> "something-video")
      if (videoNameWithoutExt.endsWith('-audio')) {
        videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
      }

      if (imgNameWithoutExt === videoNameWithoutExt && videoExtensions.includes(videoExt)) {
        return true; // Found corresponding video
      }
    }

    return false;
  };

  // Get thumbnail URL - only for images
  const thumbnailUrl = isInView && !isVideoFile(file.filename) ? comfyFileService.createDownloadUrl({
    filename: file.filename,
    subfolder: file.subfolder,
    type: file.type,
    preview: true
  }) : undefined;

  // Try to load matching image thumbnail for videos
  useEffect(() => {
    if (isInView && isVideoFile(file.filename) && !matchingImageThumbnail) {
      const matchingImage = findMatchingImageForVideo(file.filename);
      if (matchingImage) {
        const imageUrl = comfyFileService.createDownloadUrl({
          filename: matchingImage.filename,
          subfolder: matchingImage.subfolder,
          type: matchingImage.type,
          preview: true
        });
        setMatchingImageThumbnail(imageUrl);
      } else {
      }
      setIsLoaded(true);
    }
  }, [isInView, file.filename, matchingImageThumbnail, allFiles]);

  const handleClick = () => {
    if (isSelectionMode && onSelectionChange) {
      onSelectionChange(file, !isSelected);
    } else {
      onImageClick(file);
    }
  };

  return (
    <motion.div
      ref={imgRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden cursor-pointer group ${isSelected ? 'ring-2 ring-blue-500' : ''
        }`}
      onClick={handleClick}
    >
      {/* Loading Placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          {isInView ? (
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          ) : (
            <div className="h-8 w-8 bg-slate-300 dark:bg-slate-700 rounded animate-pulse" />
          )}
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
          <div className="text-center">
            {isVideoFile(file.filename) ? (
              <Video className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            ) : (
              <ImageIcon className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('media.failedToLoad')}</p>
          </div>
        </div>
      )}

      {/* Video Thumbnail or Image */}
      {isVideoFile(file.filename) ? (
        <>
          {/* Use matching image thumbnail if available, otherwise show placeholder */}
          {matchingImageThumbnail && !hasError ? (
            <img
              src={matchingImageThumbnail}
              alt={file.filename}
              className="w-full h-full object-cover"
              onError={() => {
                setMatchingImageThumbnail(null);
                setHasError(true);
              }}
            />
          ) : (
            /* Video placeholder when no thumbnail available */
            <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
              <Video className="h-12 w-12 text-slate-400" />
            </div>
          )}
          {/* Video Overlay Icon */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/50 rounded-full p-3">
              <Video className="h-8 w-8 text-white" />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Regular Image */}
          {thumbnailUrl && !hasError && (
            <img
              src={thumbnailUrl}
              alt={file.filename}
              className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(true);
              }}
            />
          )}
        </>
      )}

      {/* Selection Checkbox */}
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-20">
          <div className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${isSelected ? 'bg-blue-500' : 'bg-black/30'
            }`}>
            {isSelected && <Check className="h-4 w-4 text-white" />}
          </div>
        </div>
      )}

      {/* Folder Type Badge */}
      <div className="absolute top-2 right-2 z-20">
        <Badge
          variant="secondary"
          className={`text-xs ${file.type === 'input' ? 'bg-green-500/80 text-white' :
            file.type === 'output' ? 'bg-blue-500/80 text-white' :
              'bg-orange-500/80 text-white'
            }`}
        >
          {file.type}
        </Badge>
      </div>

      {/* Filename Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-xs font-medium truncate">
          {file.filename}
        </p>
      </div>
    </motion.div>
  );
};

interface OutputsGalleryProps {
  isFileSelectionMode?: boolean;
  allowImages?: boolean;
  allowVideos?: boolean;
  onFileSelect?: (filename: string) => void;
  onBackClick?: () => void;
  selectionTitle?: string;
}

export const OutputsGallery: React.FC<OutputsGalleryProps> = ({
  isFileSelectionMode = false,
  allowImages = true,
  allowVideos = true,
  onFileSelect,
  onBackClick,
  selectionTitle
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(
    allowImages ? 'images' : allowVideos ? 'videos' : 'images'
  );
  const [activeFolder, setActiveFolder] = useState<FolderType>('all');
  const [files, setFiles] = useState<{ images: IComfyFileInfo[]; videos: IComfyFileInfo[] }>({
    images: [],
    videos: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<IComfyFileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const { url: serverUrl, isConnected, hasExtension, isCheckingExtension, checkExtension } = useConnectionStore();

  // Memoize the service instance to prevent infinite loops
  const comfyFileService = useMemo(() => new ComfyFileService(serverUrl), [serverUrl]);


  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fileList = await comfyFileService.listFiles();

      // Sort by modification time (newest first), fallback to filename if no modified field
      const sortByModified = (a: IComfyFileInfo, b: IComfyFileInfo) => {
        if (a.modified !== undefined && b.modified !== undefined) {
          return b.modified - a.modified; // Newest first
        }
        // Fallback to filename comparison if modified is not available
        return b.filename.localeCompare(a.filename);
      };

      // Filter files based on active folder selection
      let filteredImages = fileList.images;
      let filteredVideos = fileList.videos;

      if (activeFolder === 'all') {
        // All Tab: temp folder excluded, input/output only
        filteredImages = fileList.images.filter(f => f.type !== 'temp');
        filteredVideos = fileList.videos.filter(f => f.type !== 'temp');
      } else {
        // Specific folder selected: display only that folder
        filteredImages = fileList.images.filter(f => f.type === activeFolder);
        filteredVideos = fileList.videos.filter(f => f.type === activeFolder);
      }

      setFiles({
        images: filteredImages.sort(sortByModified),
        videos: filteredVideos.sort(sortByModified)
      });

      console.log('🔍 Files loaded:', {
        folder: activeFolder,
        totalImages: fileList.images.length,
        filteredImages: filteredImages.length,
        totalVideos: fileList.videos.length,
        filteredVideos: filteredVideos.length
      });
    } catch (err) {
      console.error('❌ Failed to load files:', err);
      setError(t('gallery.loadingError') || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [comfyFileService, activeFolder]);


  // Load files when server requirements are met or folder changes
  useEffect(() => {
    if (isConnected && hasExtension) {
      loadFiles();
    }
  }, [isConnected, hasExtension, loadFiles]);


  const handleRetryConnection = () => {
    setError(null);
    checkExtension();
  };

  const handleFileClick = async (file: IComfyFileInfo) => {
    // File selection mode: handle file selection with auto-copy if needed
    if (isFileSelectionMode && onFileSelect) {
      try {
        // If file is not in input folder, copy it to input first
        if (file.type !== 'input') {
          setLoading(true);
          const result = await comfyFileService.copyFiles([{
            filename: file.filename,
            subfolder: file.subfolder,
            type: file.type
          }], 'input');

          if (result.success) {
            console.log(`✅ File copied to input folder: ${file.filename}`);
            // Return the full path including subfolder since it's now in input
            const fullPath = file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename;
            onFileSelect(fullPath);
          } else {
            setError(`${t('gallery.copyError') || 'Failed to copy file'}: ${result.error}`);
            return;
          }
        } else {
          // File is already in input, use directly with full path including subfolder
          const fullPath = file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename;
          onFileSelect(fullPath);
        }
      } catch (error) {
        console.error('Failed to process file selection:', error);
        setError(t('gallery.processSelectionError') || 'Failed to process file selection');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Normal preview mode
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);

    try {
      const url = comfyFileService.createDownloadUrl({
        filename: file.filename,
        subfolder: file.subfolder,
        type: file.type
      });
      setPreviewUrl(url);
    } catch (err) {
      console.error('❌ Failed to create preview URL:', err);
      setPreviewError(t('media.failedToLoad') || 'Failed to load file preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewClose = () => {
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewError(null);
  };

  const handlePreviewRetry = (filename: string) => {
    const allFiles = [...files.images, ...files.videos];
    const file = allFiles.find(f => f.filename === filename);
    if (file) {
      handleFileClick(file);
    }
  };

  const handleGoBack = () => {
    if (isFileSelectionMode && onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };

  // Selection mode handlers
  const handleSelectionChange = (file: IComfyFileInfo, selected: boolean) => {
    const fileKey = `${file.filename}-${file.subfolder}-${file.type}`;
    const newSelected = new Set(selectedFiles);

    if (selected) {
      newSelected.add(fileKey);
    } else {
      newSelected.delete(fileKey);
    }

    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    const allFiles = [...files.images, ...files.videos];
    const allKeys = allFiles.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
    setSelectedFiles(new Set(allKeys));
  };

  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedFiles(new Set());
    }
  };

  // File operations
  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;

    const allFiles = [...files.images, ...files.videos];
    const selectedFilesList = allFiles.filter(f =>
      selectedFiles.has(`${f.filename}-${f.subfolder}-${f.type}`)
    );

    const filesToDelete = selectedFilesList.map(f => ({
      filename: f.filename,
      subfolder: f.subfolder,
      type: f.type
    }));

    // For each video file being deleted, also find and delete its matching thumbnail image
    const additionalThumbnailsToDelete: { filename: string; subfolder?: string; type: string }[] = [];

    for (const file of selectedFilesList) {
      const isVideo = file.filename.split('.').pop()?.toLowerCase() || '';
      const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm'];

      if (videoExtensions.includes(isVideo)) {
        // This is a video file, find its matching thumbnail
        const matchingThumbnail = findMatchingImageFile(file.filename, files.images, file.subfolder, file.type);

        if (matchingThumbnail) {
          // Check if the thumbnail is not already selected for deletion
          const thumbnailKey = `${matchingThumbnail.filename}-${matchingThumbnail.subfolder}-${matchingThumbnail.type}`;
          if (!selectedFiles.has(thumbnailKey)) {
            additionalThumbnailsToDelete.push({
              filename: matchingThumbnail.filename,
              subfolder: matchingThumbnail.subfolder,
              type: matchingThumbnail.type
            });
            console.log(`🎬 Found thumbnail to delete with video: ${matchingThumbnail.filename}`);
          }
        }
      }
    }

    // Combine original files and additional thumbnails
    const allFilesToDelete = [...filesToDelete, ...additionalThumbnailsToDelete];

    try {
      setLoading(true);
      const result = await comfyFileService.deleteFiles(allFilesToDelete);

      if (result.success) {
        const totalDeleted = allFilesToDelete.length;
        const thumbnailsDeleted = additionalThumbnailsToDelete.length;
        console.log(`✅ Successfully deleted ${totalDeleted} files${thumbnailsDeleted > 0 ? ` (including ${thumbnailsDeleted} thumbnails)` : ''}`);
        await loadFiles(); // Refresh the file list
        setSelectedFiles(new Set());
        setIsSelectionMode(false);
      } else {
        setError(`Failed to delete files: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete operation failed:', error);
      setError('Failed to delete selected files');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveSelected = async (destinationType: 'input' | 'output' | 'temp') => {
    if (selectedFiles.size === 0) return;

    const allFiles = [...files.images, ...files.videos];
    const filesToMove = allFiles.filter(f =>
      selectedFiles.has(`${f.filename}-${f.subfolder}-${f.type}`)
    ).map(f => ({
      filename: f.filename,
      subfolder: f.subfolder,
      type: f.type
    }));

    try {
      setLoading(true);
      const result = await comfyFileService.moveFiles(filesToMove, destinationType);

      if (result.success) {
        console.log(`✅ Successfully moved ${filesToMove.length} files to ${destinationType}`);
        await loadFiles(); // Refresh the file list
        setSelectedFiles(new Set());
        setIsSelectionMode(false);
      } else {
        setError(`Failed to move files: ${result.error}`);
      }
    } catch (error) {
      console.error('Move operation failed:', error);
      setError('Failed to move selected files');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySelected = async (destinationType: 'input' | 'output' | 'temp') => {
    if (selectedFiles.size === 0) return;

    const allFiles = [...files.images, ...files.videos];
    const filesToCopy = allFiles.filter(f =>
      selectedFiles.has(`${f.filename}-${f.subfolder}-${f.type}`)
    ).map(f => ({
      filename: f.filename,
      subfolder: f.subfolder,
      type: f.type
    }));

    try {
      setLoading(true);
      const result = await comfyFileService.copyFiles(filesToCopy, destinationType);

      if (result.success) {
        console.log(`✅ Successfully copied ${filesToCopy.length} files to ${destinationType}`);
        await loadFiles(); // Refresh the file list
        setSelectedFiles(new Set());
        setIsSelectionMode(false);
      } else {
        setError(`Failed to copy files: ${result.error}`);
      }
    } catch (error) {
      console.error('Copy operation failed:', error);
      setError('Failed to copy selected files');
    } finally {
      setLoading(false);
    }
  };

  const isImageFile = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
  };

  // Helper function to check if image has corresponding video
  const hasCorrespondingVideo = useCallback((imageFile: IComfyFileInfo): boolean => {
    if (!files.videos || files.videos.length === 0) return false;

    // Get image filename without extension
    const imgNameWithoutExt = imageFile.filename.substring(0, imageFile.filename.lastIndexOf('.'));

    // Look for video with same name in the SAME subfolder and folder type
    const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm'];

    for (const video of files.videos) {
      // Must match subfolder and folder type (input/output/temp) as well as filename
      if (video.subfolder !== imageFile.subfolder || video.type !== imageFile.type) {
        continue;
      }

      let videoNameWithoutExt = video.filename.substring(0, video.filename.lastIndexOf('.'));
      const videoExt = video.filename.split('.').pop()?.toLowerCase() || '';

      // Remove -audio suffix if present (e.g., "something-video-audio" -> "something-video")
      if (videoNameWithoutExt.endsWith('-audio')) {
        videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
      }

      if (imgNameWithoutExt === videoNameWithoutExt && videoExtensions.includes(videoExt)) {
        return true; // Found corresponding video
      }
    }

    return false;
  }, [files.videos]);

  // Calculate filtered image count (excluding thumbnails)
  const filteredImageCount = useMemo(() => {
    return files.images.filter(img => !hasCorrespondingVideo(img)).length;
  }, [files.images, hasCorrespondingVideo]);

  // Apply thumbnail filtering only for images tab
  const currentFiles = useMemo(() => {
    if (activeTab === 'images') {
      // Filter out thumbnail images that have corresponding videos
      return files.images.filter(img => !hasCorrespondingVideo(img));
    }

    // For videos tab, return all videos (no filtering needed)
    return files[activeTab];
  }, [files, activeTab, hasCorrespondingVideo]);
  const totalFiles = files.images.length + files.videos.length;

  return (
    <div
      className="bg-black transition-colors duration-300 pwa-container"
      style={{
        overflow: 'hidden',
        height: '100dvh',
        maxHeight: '100dvh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        touchAction: 'none'
      }}
    >
      {/* Main Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />

      {/* Glassmorphism Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

      {/* Main Scrollable Content Area */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        {/* Fixed Header inside scroll area */}
        <header className="sticky top-0 z-50 pwa-header bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative flex items-center justify-between p-4 z-10">
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleGoBack}
                variant="outline"
                size="sm"
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {isFileSelectionMode ? (selectionTitle || t('gallery.selectFile')) : t('gallery.title')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('gallery.filesTotal', { count: totalFiles })}
                  {isSelectionMode && selectedFiles.size > 0 && (
                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                      • {t('gallery.selectedCount', { count: selectedFiles.size })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              {isSelectionMode ? (
                <>
                  <Button
                    onClick={handleDeselectAll}
                    variant="ghost"
                    size="sm"
                    disabled={selectedFiles.size === 0}
                    className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg"
                    title={t('gallery.clearSelection')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleSelectAll}
                    variant="ghost"
                    size="sm"
                    className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg"
                    title={t('gallery.selectAll')}
                  >
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  onClick={loadFiles}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg"
                  title={t('gallery.refreshFiles')}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              )}
              <Button
                onClick={toggleSelectionMode}
                variant={isSelectionMode ? "default" : "outline"}
                size="sm"
                className={`bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg ${isSelectionMode
                  ? 'bg-blue-500/80 dark:bg-blue-500/80 border-blue-400/50 text-white'
                  : ''
                  }`}
                title={isSelectionMode ? t('gallery.exitSelectionMode') : t('gallery.enterSelectionMode')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Folder Filter - Hidden in selection mode */}
          {!isSelectionMode && (
            <div className="relative px-4 pb-2 z-10">
              <div className="flex space-x-1 bg-white/10 dark:bg-slate-800/10 backdrop-blur-md rounded-lg p-1 border border-white/20 dark:border-slate-600/20 shadow-lg">
                {(['all', 'input', 'output', 'temp'] as FolderType[]).map((folderType) => (
                  <button
                    key={folderType}
                    onClick={() => {
                      setActiveFolder(folderType);
                      window.scrollTo(0, 0);
                    }}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeFolder === folderType
                      ? 'bg-white/30 dark:bg-slate-700/30 text-slate-900 dark:text-slate-100 shadow-sm backdrop-blur-sm border border-white/20 dark:border-slate-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/20 dark:hover:bg-slate-700/20 backdrop-blur-sm'
                      }`}
                  >
                    <FolderOpen className="h-3 w-3" />
                    <span className="capitalize">{t(`gallery.folders.${folderType}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media Type Tabs - Hidden in selection mode */}
          {!isSelectionMode && (
            <div className="relative flex px-4 pb-4 z-10">
              <div className="flex space-x-1 bg-white/10 dark:bg-slate-800/10 backdrop-blur-md rounded-lg p-1 border border-white/20 dark:border-slate-600/20 shadow-lg">
                {allowImages && (
                  <button
                    onClick={() => {
                      setActiveTab('images');
                      window.scrollTo(0, 0);
                    }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'images'
                      ? 'bg-white/30 dark:bg-slate-700/30 text-slate-900 dark:text-slate-100 shadow-sm backdrop-blur-sm border border-white/20 dark:border-slate-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/20 dark:hover:bg-slate-700/20 backdrop-blur-sm'
                      }`}
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span>{t('gallery.tabs.images')}</span>
                    <Badge variant="secondary" className="ml-1">
                      {filteredImageCount}
                    </Badge>
                  </button>
                )}
                {allowVideos && (
                  <button
                    onClick={() => {
                      setActiveTab('videos');
                      window.scrollTo(0, 0);
                    }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'videos'
                      ? 'bg-white/30 dark:bg-slate-700/30 text-slate-900 dark:text-slate-100 shadow-sm backdrop-blur-sm border border-white/20 dark:border-slate-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/20 dark:hover:bg-slate-700/20 backdrop-blur-sm'
                      }`}
                  >
                    <Video className="h-4 w-4" />
                    <span>{t('gallery.tabs.videos')}</span>
                    <Badge variant="secondary" className="ml-1">
                      {files.videos.length}
                    </Badge>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Selection Actions Panel */}
          {isSelectionMode && selectedFiles.size > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-blue-700 dark:text-blue-300">
                    <Check className="h-4 w-4" />
                    <span>{t('gallery.selectedCount', { count: selectedFiles.size })}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {/* Move buttons */}
                    <Button
                      onClick={() => handleMoveSelected('input')}
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      className="h-8 px-2 text-xs text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/20"
                      title={t('gallery.actions.moveToInput')}
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      {t('gallery.actions.in')}
                    </Button>
                    <Button
                      onClick={() => handleMoveSelected('output')}
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      className="h-8 px-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                      title={t('gallery.actions.moveToOutput')}
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      {t('gallery.actions.out')}
                    </Button>
                    <Button
                      onClick={() => handleMoveSelected('temp')}
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      className="h-8 px-2 text-xs text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                      title={t('gallery.actions.moveToTemp')}
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      {t('gallery.actions.tmp')}
                    </Button>
                    {/* Copy button - copies to output folder by default */}
                    <Button
                      onClick={() => handleCopySelected('output')}
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      className="h-8 w-8 p-0 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/20"
                      title={t('gallery.actions.copyToOutput')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {/* Delete button */}
                    <Button
                      onClick={handleDeleteSelected}
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      className="h-8 w-8 p-0 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
                      title={t('gallery.actions.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Server Status Check */}
        {(isCheckingExtension || !isConnected || !hasExtension) && (
          <div className="p-4">
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>{t('gallery.server.requirements')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isCheckingExtension ? (
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {t('gallery.server.checking')}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Server Connection Status */}
                    <div className="flex items-center space-x-3">
                      {isConnected ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        ComfyUI Server: {isConnected ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">{t('gallery.server.connected')}</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">{t('gallery.server.disconnected')}</span>
                        )}
                      </span>
                    </div>

                    {/* API Extension Status */}
                    <div className="flex items-center space-x-3">
                      {hasExtension ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        Mobile UI API Extension: {hasExtension ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">{t('gallery.server.available')}</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">{t('gallery.server.notFound')}</span>
                        )}
                      </span>
                    </div>

                    {/* Error Messages */}
                    {(!isConnected || !hasExtension) && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">{t('gallery.server.issuesFound')}</h4>
                        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                          {!isConnected && <li>• {t('gallery.server.cannotConnect')}</li>}
                          {isConnected && !hasExtension && <li>• {t('gallery.server.extensionNotFound')}</li>}
                        </ul>

                        {!hasExtension && isConnected && (
                          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>To fix:</strong> {t('gallery.server.installInstruction')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Retry Buttons */}
                    <div className="flex justify-end gap-2 mt-4">
                      <Button onClick={handleRetryConnection} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('gallery.server.recheck')}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Content */}
        <main className="p-4 relative z-10">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('gallery.loading')}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="max-w-md mx-auto p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
              <Button
                onClick={loadFiles}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {t('common.retry')}
              </Button>
            </div>
          )}

          {!loading && !error && currentFiles.length === 0 && (
            <div className="text-center py-12">
              {activeTab === 'images' ? (
                <ImageIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              ) : (
                <Video className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              )}
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                {t('gallery.noFilesFound', { type: t(`gallery.tabs.${activeTab}`) })}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('gallery.noFilesDescription', { type: t(`gallery.tabs.${activeTab}`) })}
              </p>
              <Button onClick={loadFiles} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('common.refresh')}
              </Button>
            </div>
          )}

          {!loading && !error && currentFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence>
                {currentFiles.map((file, index) => {
                  const fileKey = `${file.filename}-${file.subfolder}-${file.type}`;
                  const isSelected = selectedFiles.has(fileKey);

                  return (
                    <LazyImage
                      key={`${file.filename}-${index}`}
                      file={file}
                      onImageClick={handleFileClick}
                      allFiles={files}
                      index={index}
                      isSelectionMode={isSelectionMode}
                      isSelected={isSelected}
                      onSelectionChange={handleSelectionChange}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          isOpen={!!previewFile}
          filename={previewFile.filename}
          isImage={isImageFile(previewFile.filename)}
          loading={previewLoading}
          error={previewError || undefined}
          url={previewUrl || undefined}
          onClose={handlePreviewClose}
          onRetry={handlePreviewRetry}
        />
      )}
    </div>
  );
};