import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Image as ImageIcon, Video, Loader2, RefreshCw, Server, AlertCircle, CheckCircle, Trash2, FolderOpen, Check, X, MousePointer, ChevronLeft, CheckSquare, Copy } from 'lucide-react';
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative aspect-square bg-slate-900 overflow-hidden cursor-pointer group ${isSelected ? 'z-10' : ''}`}
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
              className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(true);
              }}
            />
          )}
        </>
      )}

      {/* Selection Checkbox - Immersive Circle */}
      {isSelectionMode && (
        <div className="absolute top-3 left-3 z-30">
          <div className={`w-7 h-7 rounded-full border-2 border-white/50 backdrop-blur-md flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-blue-600 border-blue-400 scale-110 shadow-lg' : 'bg-black/20 hover:bg-black/40'}`}>
            {isSelected && <Check className="h-4 w-4 text-white stroke-[3px]" />}
          </div>
        </div>
      )}

      {/* Selected State Overlay */}
      {isSelected && (
        <div className="absolute inset-0 border-4 border-blue-500 z-20 pointer-events-none shadow-[inset_0_0_20px_rgba(59,130,246,0.3)]" />
      )}

      {/* Folder Type Badge - Simplified */}
      <div className="absolute top-3 right-3 z-30">
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase backdrop-blur-md border border-white/20 ${file.type === 'input' ? 'bg-emerald-500/80 text-white' :
          file.type === 'output' ? 'bg-blue-500/80 text-white' :
            'bg-amber-500/80 text-white'
          }`}>
          {file.type}
        </div>
      </div>

      {/* Immersive Filename Overlay on Hover */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
        <p className="text-white text-xs font-bold truncate tracking-tight">
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
  initialFolder?: FolderType;
}

export const OutputsGallery: React.FC<OutputsGalleryProps> = ({
  isFileSelectionMode = false,
  allowImages = true,
  allowVideos = true,
  onFileSelect,
  onBackClick,
  selectionTitle,
  initialFolder = 'output'
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(
    allowImages ? 'images' : allowVideos ? 'videos' : 'images'
  );
  const [activeFolder, setActiveFolder] = useState<FolderType>(initialFolder);
  const [headerHeight, setHeaderHeight] = useState(160); // Default fallback
  const headerRef = useRef<HTMLElement>(null);
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
  // Move panel state
  const [showMovePanel, setShowMovePanel] = useState(false);

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
            console.log(`✅ File copied to input folder: ${file.filename} `);
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

  // Update header height dynamically
  useEffect(() => {
    if (!headerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(entry.contentRect.height);
      }
    });

    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleGoBack = () => {
    if (isFileSelectionMode && onBackClick) {
      onBackClick();
    } else {
      navigate('/');
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

  const handleSelectAll = (visibleOnly: boolean = true) => {
    if (visibleOnly) {
      const visibleKeys = currentFiles.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
      const allVisibleSelected = visibleKeys.every(key => selectedFiles.has(key));

      const newSelected = new Set(selectedFiles);
      if (allVisibleSelected) {
        // Deselect all visible
        visibleKeys.forEach(key => newSelected.delete(key));
      } else {
        // Select all visible
        visibleKeys.forEach(key => newSelected.add(key));
      }
      setSelectedFiles(newSelected);
    } else {
      // Legacy behavior: select everything (all images and all videos)
      const allFilesList = [...files.images, ...files.videos];
      const allKeys = allFilesList.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
      setSelectedFiles(new Set(allKeys));
    }
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
        setShowMovePanel(false);
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
        setShowMovePanel(false);
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
    <div className="fixed inset-0 bg-black overflow-y-auto overflow-x-hidden pt-safe pb-safe z-0">
      {/* Immersive Fixed Header */}
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-50 pointer-events-none"
      >
        <div
          className="absolute inset-x-0 top-0 h-full backdrop-blur-xl bg-gradient-to-b from-black/25 via-black/10 to-transparent"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)'
          }}
        />
        {/* Balanced Padding & Multi-row Header Layout */}
        <div className="relative flex flex-col p-4 pt-6 md:px-8 pointer-events-auto space-y-0.5">
          {/* Row 1: Back Button | Title | Selection Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleGoBack}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all active:scale-95 shadow-lg backdrop-blur-md border border-white/10"
                title={t('common.back')}
              >
                <ChevronLeft className="h-8 w-8 text-white stroke-[2.5]" />
              </button>
              <h1 className="text-4xl font-black text-white leading-none tracking-tighter">
                {isFileSelectionMode ? (selectionTitle || t('gallery.selectFile')) : t(`gallery.tabs.${activeTab}`)}
              </h1>
            </div>

            <div className="flex items-center space-x-2">
              {/* Refresh Button - Added per user request */}
              <AnimatePresence>
                {!isSelectionMode && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.5, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.5, x: 20 }}
                    onClick={loadFiles}
                    disabled={loading}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 backdrop-blur-xl transition-all duration-300 active:scale-90 shadow-2xl disabled:opacity-50"
                    title={t('gallery.refreshFiles')}
                  >
                    <RefreshCw className={`h-7 w-7 ${loading ? 'animate-spin' : ''}`} />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Select All Button - Added per user request */}
              <AnimatePresence>
                {isSelectionMode && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.5, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.5, x: 20 }}
                    onClick={() => handleSelectAll(true)}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 backdrop-blur-xl transition-all duration-300 active:scale-90 shadow-2xl"
                    title={t('gallery.selectAll')}
                  >
                    <CheckCircle className="h-7 w-7" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Selection/X Button - Balanced Size */}
              <button
                onClick={toggleSelectionMode}
                className={`w-14 h-14 flex items-center justify-center rounded-full border-2 transition-all duration-300 active:scale-90 shadow-2xl ${isSelectionMode
                  ? 'bg-white border-white text-black'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20 backdrop-blur-xl'
                  }`}
                title={isSelectionMode ? t('gallery.exitSelectionMode') : t('gallery.enterSelectionMode')}
              >
                {isSelectionMode ? <X className="h-7 w-7" /> : <CheckSquare className="h-7 w-7" />}
              </button>
            </div>
          </div>

          {/* Row 2: Sub-label aligned with Title - Scaled Up & Solid White */}
          <div className="pl-[72px]">
            <p className="text-base font-black text-white uppercase tracking-[0.2em]">
              {activeFolder === 'all'
                ? t('gallery.filesTotal', { count: currentFiles.length })
                : t('gallery.folderSummary', {
                  count: currentFiles.length,
                  folder: t(`gallery.folders.${activeFolder}`),
                  type: t('gallery.actions.files')
                })}
            </p>
          </div>
        </div>
      </header>
      {/* Main Grid Content - Dynamic Padding (header height for overlap feel) */}
      <main
        className="w-full pb-80"
        style={{ paddingTop: `${headerHeight}px` }}
      >
        {loading && totalFiles === 0 ? (
          <div className="flex flex-col items-center justify-center py-40">
            <Loader2 className="h-10 w-10 text-white/30 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-6 py-20 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4 opacity-50" />
            <p className="text-white/60 text-sm font-medium mb-6">{error}</p>
            <Button onClick={loadFiles} variant="outline" className="text-white border-white/20 hover:bg-white/10 rounded-full">
              {t('common.retry')}
            </Button>
          </div>
        ) : currentFiles.length === 0 ? (
          <div className="text-center py-40">
            <ImageIcon className="h-16 w-16 text-white/10 mx-auto mb-6" />
            <p className="text-white/30 text-sm font-bold uppercase tracking-widest">{t('gallery.noFiles')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px">
            {currentFiles.map((file, index) => (
              <LazyImage
                key={`${file.filename}-${file.subfolder}-${file.type}-${index}`}
                file={file}
                index={index}
                onImageClick={handleFileClick}
                allFiles={activeTab === 'videos' ? files : undefined}
                isSelectionMode={isSelectionMode}
                isSelected={selectedFiles.has(`${file.filename}-${file.subfolder}-${file.type}`)}
                onSelectionChange={handleSelectionChange}
              />
            ))}
          </div>
        )}
      </main>

      {/* Immersive Footer - Fixed pointer events to allow scroll */}
      <footer className="fixed bottom-0 inset-x-0 z-50 bg-gradient-to-t from-black/25 via-black/10 to-transparent pt-20 pb-10 pointer-events-none">
        <div className="px-6 md:px-12 max-w-2xl mx-auto flex items-center justify-between pointer-events-auto">
          {isSelectionMode ? (
            // Selection Mode Footer
            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
              {/* Move Button */}
              <div className="flex justify-start relative">
                <AnimatePresence>
                  {showMovePanel && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-20 left-0 bg-zinc-900 border border-white/10 rounded-3xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[180px]"
                    >
                      {(['input', 'output', 'temp'] as const).filter(f => f !== activeFolder).map(f => (
                        <button
                          key={f}
                          onClick={() => handleMoveSelected(f)}
                          className="w-full flex items-center space-x-4 px-5 py-4 hover:bg-white/5 rounded-2xl transition-colors text-white text-base font-black uppercase tracking-tight"
                        >
                          <FolderOpen className="h-5 w-5 text-blue-400" />
                          <span>{t(`gallery.folders.${f}`)}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  onClick={() => setShowMovePanel(!showMovePanel)}
                  disabled={selectedFiles.size === 0}
                  className={`w-14 h-14 flex items-center justify-center rounded-full backdrop-blur-md border-2 transition-all active:scale-90 ${selectedFiles.size > 0
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'opacity-0 scale-75 pointer-events-none'
                    }`}
                >
                  <FolderOpen className="h-6 w-6" />
                </button>
              </div>

              {/* Selection Counter - Scaled Up */}
              <div className="flex flex-col items-center">
                <span className="text-white text-2xl font-black tracking-tighter">
                  {t('gallery.selectionSummary', { count: selectedFiles.size, type: t(`gallery.tabs.${activeTab}`) })}
                </span>
                <span className="text-blue-400 text-xs font-black uppercase tracking-[0.3em] mt-1">
                  {t('gallery.selectedLabel')}
                </span>
              </div>

              {/* Delete Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedFiles.size === 0}
                  className={`w-14 h-14 flex items-center justify-center rounded-full backdrop-blur-md border-2 transition-all active:scale-90 ${selectedFiles.size > 0
                    ? 'bg-red-500/80 text-white border-red-500/40 shadow-lg shadow-red-500/20'
                    : 'bg-white/5 text-white/10 border-white/5 grayscale pointer-events-none'
                    }`}
                >
                  <Trash2 className="h-6 w-6" />
                </button>
              </div>
            </div>
          ) : (
            // Normal Mode Footer - Responsive Alignment
            <div className="flex items-center justify-between w-full flex-wrap gap-4 overflow-visible">
              {/* Type Toggle Button - Larger */}
              <div className="flex-shrink-0">
                <button
                  onClick={() => {
                    setActiveTab(activeTab === 'images' ? 'videos' : 'images');
                    window.scrollTo(0, 0);
                  }}
                  className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border-2 border-white/20 text-white hover:bg-white/20 active:scale-90 transition-all shadow-2xl"
                >
                  {activeTab === 'images' ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
                </button>
              </div>

              {/* Tab Switcher (Folders) - Centered or Right Aligned if narrow */}
              <div className="flex bg-white/10 backdrop-blur-2xl rounded-full p-2 border border-white/20 shadow-2xl mx-auto sm:mx-auto ml-auto">
                {(['input', 'output', 'temp'] as FolderType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setActiveFolder(f);
                      window.scrollTo(0, 0);
                    }}
                    className={`px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${activeFolder === f
                      ? 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.3)]'
                      : 'text-white hover:bg-white/10'
                      }`}
                  >
                    {t(`gallery.folders.${f}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </footer>
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