import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Image as ImageIcon, Video, Loader2, RefreshCw, Server, AlertCircle, CheckCircle, Trash2, FolderOpen, Check, X, MousePointer, ChevronLeft, CheckSquare, Copy, LayoutGrid, FolderTree, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { FilePreviewModal } from '../modals/FilePreviewModal';
import { SimpleConfirmDialog } from '../ui/SimpleConfirmDialog';
import { useNavigate } from 'react-router-dom';
import { isImageFile, isVideoFile } from '@/shared/utils/ComfyFileUtils';


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

  // Remove -audio suffix if present
  if (videoNameWithoutExt.endsWith('-audio')) {
    videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
  }

  const normSub = subfolder === '/' ? '' : (subfolder || '');
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

  for (const img of imageFiles) {
    const imgSub = img.subfolder === '/' ? '' : (img.subfolder || '');
    if (imgSub !== normSub || img.type !== type) {
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
  index?: number; // For initial loading optimization
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (file: IComfyFileInfo, selected: boolean) => void;
  fileService: ComfyFileService;
  videoLookupMap: Map<string, IComfyFileInfo>;
  imageLookupMap: Map<string, IComfyFileInfo>;
}

const LazyImage: React.FC<LazyImageProps> = ({
  file,
  onImageClick,
  index = 0,
  isSelectionMode = false,
  isSelected = false,
  onSelectionChange,
  fileService,
  videoLookupMap,
  imageLookupMap
}) => {
  const { t } = useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  // Load first 12 items immediately (2 rows on most screens)
  const [isInView, setIsInView] = useState(index < 12);
  const [hasError, setHasError] = useState(false);
  const [matchingImageThumbnail, setMatchingImageThumbnail] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const { url: serverUrl } = useConnectionStore();
  // Service is now passed via props

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


  // Find matching image thumbnail for video files using the optimized map
  const findMatchingImageForVideo = (videoFilename: string): IComfyFileInfo | null => {
    if (!isVideoFile(videoFilename)) return null;

    let videoNameWithoutExt = videoFilename.substring(0, videoFilename.lastIndexOf('.'));
    if (videoNameWithoutExt.endsWith('-audio')) {
      videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
    }

    const normSub = file.subfolder === '/' ? '' : (file.subfolder || '');
    const key = `${file.type}/${normSub}/${videoNameWithoutExt}`;
    return imageLookupMap.get(key) || null;
  };

  // Check if an image file has a corresponding video (optimized O(1) lookup)
  const hasCorrespondingVideo = useCallback((imageFile: IComfyFileInfo): boolean => {
    const imgNameWithoutExt = imageFile.filename.substring(0, imageFile.filename.lastIndexOf('.'));
    const normSub = imageFile.subfolder === '/' ? '' : (imageFile.subfolder || '');
    const key = `${imageFile.type}/${normSub}/${imgNameWithoutExt}`;
    return videoLookupMap.has(key);
  }, [videoLookupMap]);

  // Get thumbnail URL - only for images
  const thumbnailUrl = isInView && !isVideoFile(file.filename) ? fileService.createDownloadUrl({
    filename: file.filename,
    subfolder: file.subfolder,
    type: file.type,
    preview: true,
    modified: file.modified
  }) : undefined;

  // Try to load matching image thumbnail for videos
  useEffect(() => {
    if (isInView && isVideoFile(file.filename) && !matchingImageThumbnail) {
      const matchingImage = findMatchingImageForVideo(file.filename);
      if (matchingImage) {
        const imageUrl = fileService.createDownloadUrl({
          filename: matchingImage.filename,
          subfolder: matchingImage.subfolder,
          type: matchingImage.type,
          preview: true,
          modified: matchingImage.modified
        });
        setMatchingImageThumbnail(imageUrl);
      } else {
      }
      setIsLoaded(true);
    }
  }, [isInView, file.filename, matchingImageThumbnail, imageLookupMap]);

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
              loading="lazy"
              decoding="async"
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
              loading="lazy"
              decoding="async"
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
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(-1);

  // View mode states
  const [viewMode, setViewMode] = useState<'flat' | 'folders'>('flat');
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);

  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  // Move panel state
  const [showMovePanel, setShowMovePanel] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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
      // Reset navigation when switching categories
      setSelectedSubfolder(null);
    }
  }, [isConnected, hasExtension, loadFiles, activeFolder, activeTab]);


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
    const index = navigableFiles.findIndex(f =>
      f.filename === file.filename &&
      f.subfolder === file.subfolder &&
      f.type === file.type
    );
    setCurrentPreviewIndex(index);

    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);

    try {
      const url = comfyFileService.createDownloadUrl({
        filename: file.filename,
        subfolder: file.subfolder,
        type: file.type,
        modified: file.modified
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
    // If inside a subfolder in folder view, go back to parent folder
    if (viewMode === 'folders' && selectedSubfolder && selectedSubfolder !== '/') {
      const parts = selectedSubfolder.split('/').filter(Boolean);
      if (parts.length <= 1) {
        setSelectedSubfolder('/');
      } else {
        parts.pop();
        setSelectedSubfolder(parts.join('/'));
      }
      return;
    }

    // If at root of folder view, we can either stay or go back to main menu
    // User requested Root Folder to main screen behavior
    if (viewMode === 'folders' && selectedSubfolder === '/') {
      // Just let it fall through to default navigate('/')
    }

    // Otherwise, use default go back behavior
    if (isFileSelectionMode && onBackClick) {
      onBackClick();
    } else {
      navigate('/');
    }
  };

  // Check if any folder is selected
  const isAnyFolderSelected = useMemo(() => {
    return Array.from(selectedFiles).some(key => key.startsWith('folder:'));
  }, [selectedFiles]);

  // Selection mode handlers
  const handleSelectionChange = (file: IComfyFileInfo, selected: boolean, isFolder: boolean = false) => {
    const fileKey = isFolder
      ? `folder:${file.subfolder || (file.filename === 'Root' ? '/' : file.filename)}` // Simplified for folder name but let's use fullPath logic
      : `${file.filename}-${file.subfolder}-${file.type}`;

    // Actually, for folders in our recursive view, info objects have 'fullPath'. 
    // Let's adjust how we call this.

    const newSelected = new Set(selectedFiles);

    if (selected) {
      newSelected.add(fileKey);
    } else {
      newSelected.delete(fileKey);
    }

    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (visibleOnly: boolean = true) => {
    const newSelected = new Set(selectedFiles);

    if (viewMode === 'folders') {
      // In folder mode, select only files (not folders) in the CURRENT path
      const currentPathFilesKeys = folderContent.files.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
      const allCurrentFilesSelected = currentPathFilesKeys.every(key => selectedFiles.has(key));

      if (allCurrentFilesSelected) {
        currentPathFilesKeys.forEach(key => newSelected.delete(key));
      } else {
        currentPathFilesKeys.forEach(key => newSelected.add(key));
      }
    } else {
      // Flat mode behavior
      if (visibleOnly) {
        const visibleKeys = currentFiles.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
        const allVisibleSelected = visibleKeys.every(key => selectedFiles.has(key));

        if (allVisibleSelected) {
          visibleKeys.forEach(key => newSelected.delete(key));
        } else {
          visibleKeys.forEach(key => newSelected.add(key));
        }
      } else {
        const allFilesList = [...files.images, ...files.videos];
        const allKeys = allFilesList.map(f => `${f.filename}-${f.subfolder}-${f.type}`);
        allKeys.forEach(key => newSelected.add(key));
      }
    }

    setSelectedFiles(newSelected);
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
  const handleDeleteClick = () => {
    if (selectedFiles.size === 0) return;

    if (isAnyFolderSelected) {
      setIsDeleteConfirmOpen(true);
    } else {
      handleDeleteSelected();
    }
  };

  const handleDeleteSelected = async () => {
    const allItems = Array.from(selectedFiles);
    const filesToDelete: { filename: string; subfolder?: string; type: string }[] = [];

    // 1. Collect explicitly selected files
    const allFilesFlat = [...files.images, ...files.videos];
    allItems.forEach(key => {
      if (!key.startsWith('folder:')) {
        const file = allFilesFlat.find(f => `${f.filename}-${f.subfolder}-${f.type}` === key);
        if (file) {
          filesToDelete.push({ filename: file.filename, subfolder: file.subfolder, type: file.type });
        }
      }
    });

    // 2. Collect files from selected folders
    const selectedFolderPaths = allItems.filter(k => k.startsWith('folder:')).map(k => k.replace('folder:', ''));

    selectedFolderPaths.forEach(folderPath => {
      const searchPath = folderPath === '/' ? '' : folderPath;
      const folderFiles = allFilesFlat.filter(f => {
        const fSub = f.subfolder || '/';
        return fSub === folderPath || fSub.startsWith(searchPath === '' ? '/' : searchPath + '/');
      });

      folderFiles.forEach(f => {
        // Avoid duplicates
        if (!filesToDelete.some(d => d.filename === f.filename && d.subfolder === f.subfolder && d.type === f.type)) {
          filesToDelete.push({ filename: f.filename, subfolder: f.subfolder, type: f.type });
        }
      });
    });

    if (filesToDelete.length === 0) return;

    // 3. Find matching thumbnails for videos being deleted
    const additionalThumbnails: { filename: string; subfolder?: string; type: string }[] = [];
    filesToDelete.forEach(file => {
      const isVideo = ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(file.filename.split('.').pop()?.toLowerCase() || '');
      if (isVideo) {
        let videoName = file.filename.substring(0, file.filename.lastIndexOf('.'));
        if (videoName.endsWith('-audio')) videoName = videoName.substring(0, videoName.lastIndexOf('-audio'));
        const thumbKey = `${file.type}/${file.subfolder}/${videoName}`;
        const thumb = imageLookupMap.get(thumbKey);
        if (thumb && !filesToDelete.some(d => d.filename === thumb.filename && d.subfolder === thumb.subfolder && d.type === thumb.type)) {
          additionalThumbnails.push({ filename: thumb.filename, subfolder: thumb.subfolder, type: thumb.type });
        }
      }
    });

    const finalDeleteList = [...filesToDelete, ...additionalThumbnails];

    try {
      setLoading(true);
      const result = await comfyFileService.deleteFiles(finalDeleteList);

      if (result.success) {
        console.log(`✅ Successfully deleted ${finalDeleteList.length} items`);
        await loadFiles();
        setSelectedFiles(new Set());
        setIsSelectionMode(false);
        setIsDeleteConfirmOpen(false);
      } else {
        setError(`Failed to delete items: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete operation failed:', error);
      setError('Failed to delete selected items');
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


  // Create optimized lookup maps for images and videos to replace O(N^2) loops
  const videoLookupMap = useMemo(() => {
    const map = new Map<string, IComfyFileInfo>();
    files.videos.forEach(video => {
      let name = video.filename.substring(0, video.filename.lastIndexOf('.'));
      if (name.endsWith('-audio')) name = name.substring(0, name.lastIndexOf('-audio'));
      const normSub = video.subfolder === '/' ? '' : (video.subfolder || '');
      const key = `${video.type}/${normSub}/${name}`;
      map.set(key, video);
    });
    return map;
  }, [files.videos]);

  const imageLookupMap = useMemo(() => {
    const map = new Map<string, IComfyFileInfo>();
    files.images.forEach(img => {
      const name = img.filename.substring(0, img.filename.lastIndexOf('.'));
      const normSub = img.subfolder === '/' ? '' : (img.subfolder || '');
      const key = `${img.type}/${normSub}/${name}`;
      map.set(key, img);
    });
    return map;
  }, [files.images]);

  // Check if an image file has a corresponding video (optimized O(1) lookup)
  const hasCorrespondingVideo = useCallback((imageFile: IComfyFileInfo): boolean => {
    const imgNameWithoutExt = imageFile.filename.substring(0, imageFile.filename.lastIndexOf('.'));
    const normSub = imageFile.subfolder === '/' ? '' : (imageFile.subfolder || '');
    const key = `${imageFile.type}/${normSub}/${imgNameWithoutExt}`;
    return videoLookupMap.has(key);
  }, [videoLookupMap]);

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

  // Extract current level's folders and files
  const folderContent = useMemo(() => {
    const currentPath = selectedSubfolder || '/';
    const subfolders = new Map<string, { count: number, lastFile: IComfyFileInfo, thumbnailFile: IComfyFileInfo, fullPath: string }>();
    const filesInCurrentFolder: IComfyFileInfo[] = [];

    currentFiles.forEach(file => {
      const fileSubfolder = file.subfolder || '/';

      if (fileSubfolder === currentPath) {
        // This file is directly in the current folder
        filesInCurrentFolder.push(file);
      } else if (fileSubfolder.startsWith(currentPath === '/' ? '' : currentPath + '/')) {
        // This file is in a subfolder of the current path
        const relativePath = currentPath === '/'
          ? fileSubfolder
          : fileSubfolder.substring(currentPath.length + 1);

        const directSubfolderName = relativePath.split('/')[0];
        const fullSubfolderPath = currentPath === '/'
          ? directSubfolderName
          : `${currentPath}/${directSubfolderName}`;

        const existing = subfolders.get(directSubfolderName);
        if (existing) {
          existing.count++;
          // If current thumbnail is video, try to replace it with an image if possible
          const isCurrentThumbVideo = isVideoFile(existing.thumbnailFile.filename);

          if (isCurrentThumbVideo) {
            const isNewFileImage = isImageFile(file.filename);
            if (isNewFileImage) {
              existing.thumbnailFile = file;
            }
          }
        } else {
          // Determine best thumbnail: if file is video, try to find matching image
          let thumbnailFile = file;
          const isVideo = isVideoFile(file.filename);

          if (isVideo) {
            let videoName = file.filename.substring(0, file.filename.lastIndexOf('.'));
            if (videoName.endsWith('-audio')) videoName = videoName.substring(0, videoName.lastIndexOf('-audio'));
            const normSub = (file.subfolder || '') === '/' ? '' : (file.subfolder || '');
            const key = `${file.type}/${normSub}/${videoName}`;
            const matchingImg = imageLookupMap.get(key);
            if (matchingImg) {
              thumbnailFile = matchingImg;
            }
          }

          subfolders.set(directSubfolderName, {
            count: 1,
            lastFile: file,
            thumbnailFile: thumbnailFile,
            fullPath: fullSubfolderPath
          });
        }
      }
    });

    const sortedFolders = Array.from(subfolders.entries()).map(([name, info]) => ({
      name,
      ...info
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      folders: sortedFolders,
      files: filesInCurrentFolder
    };
  }, [currentFiles, selectedSubfolder, imageLookupMap]);

  // Files available for navigation in preview modal
  const navigableFiles = useMemo(() => {
    return viewMode === 'folders' ? folderContent.files : currentFiles;
  }, [viewMode, folderContent.files, currentFiles]);

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
                {isFileSelectionMode
                  ? (selectionTitle || t('gallery.selectFile'))
                  : (selectedSubfolder && viewMode === 'folders'
                    ? (selectedSubfolder === '/' ? 'Root' : selectedSubfolder.split('/').pop())
                    : t(`gallery.tabs.${activeTab}`))}
              </h1>
            </div>

            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              {!isSelectionMode && (!selectedSubfolder || selectedSubfolder === '/') && (
                <button
                  onClick={() => {
                    setViewMode(viewMode === 'flat' ? 'folders' : 'flat');
                    setSelectedSubfolder(viewMode === 'flat' ? '/' : null);
                  }}
                  className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 backdrop-blur-xl transition-all duration-300 active:scale-90 shadow-2xl"
                  title={viewMode === 'flat' ? 'Folders' : 'Grid'}
                >
                  {viewMode === 'flat' ? <FolderTree className="h-7 w-7" /> : <LayoutGrid className="h-7 w-7" />}
                </button>
              )}

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
              {!isFileSelectionMode && (
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
              )}
            </div>
          </div>

          {/* Row 2: Sub-label aligned with Title - Scaled Up & Solid White */}
          <div className="pl-[72px]">
            <p className="text-base font-black text-white uppercase tracking-[0.2em]">
              {viewMode === 'folders'
                ? (selectedSubfolder && selectedSubfolder !== '/' ? selectedSubfolder : "Root Folder")
                : (activeFolder === 'all'
                  ? t('gallery.filesTotal', { count: currentFiles.length })
                  : t('gallery.folderSummary', {
                    count: currentFiles.length,
                    folder: t(`gallery.folders.${activeFolder}`),
                    type: t('gallery.actions.files')
                  }))}
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
          <div className="relative">
            <AnimatePresence mode="wait">
              {viewMode === 'folders' ? (
                <motion.div
                  key={`recursive-view-${activeTab}-${selectedSubfolder}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Folders Section First */}
                  {folderContent.folders.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 px-4 mb-8">
                      {folderContent.folders.map((folder) => (
                        <motion.div
                          key={folder.fullPath}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (isSelectionMode) {
                              const key = `folder:${folder.fullPath}`;
                              const newSelected = new Set(selectedFiles);
                              if (newSelected.has(key)) newSelected.delete(key);
                              else newSelected.add(key);
                              setSelectedFiles(newSelected);
                            } else {
                              setSelectedSubfolder(folder.fullPath);
                            }
                          }}
                          className={`bg-slate-900/50 border rounded-3xl overflow-hidden cursor-pointer group hover:bg-slate-800/80 transition-all shadow-xl ${selectedFiles.has(`folder:${folder.fullPath}`) ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-white/10'
                            }`}
                        >
                          <div className="aspect-square relative">
                            {/* Selection Checkbox - Immersive Circle */}
                            {isSelectionMode && (
                              <div className="absolute top-3 left-3 z-30">
                                <div className={`w-7 h-7 rounded-full border-2 border-white/50 backdrop-blur-md flex items-center justify-center transition-all duration-300 ${selectedFiles.has(`folder:${folder.fullPath}`) ? 'bg-blue-600 border-blue-400 scale-110 shadow-lg' : 'bg-black/20 hover:bg-black/40'}`}>
                                  {selectedFiles.has(`folder:${folder.fullPath}`) && <Check className="h-4 w-4 text-white stroke-[3px]" />}
                                </div>
                              </div>
                            )}

                            {/* Folder Thumbnail (latest image in folder) */}
                            <img
                              src={comfyFileService.createDownloadUrl({
                                filename: folder.thumbnailFile.filename,
                                subfolder: folder.thumbnailFile.subfolder,
                                type: folder.thumbnailFile.type,
                                preview: true,
                                modified: folder.thumbnailFile.modified
                              })}
                              alt={folder.name}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                              onError={(e) => {
                                // Fallback to lastFile if thumbnailFile fails
                                if (folder.thumbnailFile !== folder.lastFile) {
                                  (e.target as HTMLImageElement).src = comfyFileService.createDownloadUrl({
                                    filename: folder.lastFile.filename,
                                    subfolder: folder.lastFile.subfolder,
                                    type: folder.lastFile.type,
                                    preview: true,
                                    modified: folder.lastFile.modified
                                  });
                                }
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-black/40 backdrop-blur-md rounded-full p-4 group-hover:bg-blue-600/60 transition-colors">
                                <FolderTree className="h-8 w-8 text-white" />
                              </div>
                            </div>
                            <div className="absolute bottom-3 right-3 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg">
                              {folder.count}
                            </div>
                          </div>
                          <div className="p-4 bg-gradient-to-b from-transparent to-black/80">
                            <p className="text-white font-bold truncate text-sm">
                              {folder.name}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Files Section Second */}
                  {folderContent.files.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px">
                      {folderContent.files.map((file, index) => (
                        <LazyImage
                          key={`${file.filename}-${file.subfolder}-${file.type}-${index}`}
                          file={file}
                          index={index}
                          onImageClick={handleFileClick}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedFiles.has(`${file.filename}-${file.subfolder}-${file.type}`)}
                          onSelectionChange={handleSelectionChange}
                          fileService={comfyFileService}
                          videoLookupMap={videoLookupMap}
                          imageLookupMap={imageLookupMap}
                        />
                      ))}
                    </div>
                  ) : folderContent.folders.length === 0 && (
                    <div className="text-center py-40">
                      <ImageIcon className="h-16 w-16 text-white/10 mx-auto mb-6" />
                      <p className="text-white/30 text-sm font-bold uppercase tracking-widest">{t('gallery.noFiles')}</p>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key={`flat-view-${activeTab}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px"
                >
                  {currentFiles.map((file, index) => (
                    <LazyImage
                      key={`${file.filename}-${file.subfolder}-${file.type}-${index}`}
                      file={file}
                      index={index}
                      onImageClick={handleFileClick}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedFiles.has(`${file.filename}-${file.subfolder}-${file.type}`)}
                      onSelectionChange={handleSelectionChange}
                      fileService={comfyFileService}
                      videoLookupMap={videoLookupMap}
                      imageLookupMap={imageLookupMap}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
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
                  disabled={selectedFiles.size === 0 || isAnyFolderSelected}
                  className={`w-14 h-14 flex items-center justify-center rounded-full backdrop-blur-md border-2 transition-all active:scale-90 ${selectedFiles.size > 0 && !isAnyFolderSelected
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'opacity-0 scale-75 pointer-events-none'
                    }`}
                >
                  <FolderOpen className="h-6 w-6" />
                </button>
              </div>

              {/* Selection Counter - Scaled Up */}
              <div className="flex flex-col items-center">
                <span className="text-white text-xl font-black tracking-tighter text-center leading-tight">
                  {isAnyFolderSelected ? (
                    t('gallery.selectionCombined', {
                      folderCount: Array.from(selectedFiles).filter(k => k.startsWith('folder:')).length,
                      fileCount: Array.from(selectedFiles).filter(k => !k.startsWith('folder:')).length
                    })
                  ) : (
                    t('gallery.selectionSummary', { count: selectedFiles.size, type: t(`gallery.tabs.${activeTab}`) })
                  )}
                </span>
                <span className="text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] mt-0.5">
                  {t('gallery.selectedLabel')}
                </span>
              </div>

              {/* Delete Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleDeleteClick}
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
          files={!isFileSelectionMode ? navigableFiles : undefined}
          initialIndex={currentPreviewIndex}
          comfyFileService={comfyFileService}
        />
      )}
      {/* Folder Delete Confirmation */}
      <SimpleConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteSelected}
        title={t('gallery.deleteConfirmTitle')}
        message={t('gallery.deleteConfirmMessage')}
        confirmText={t('gallery.deleteConfirmConfirm')}
        isDestructive={true}
      />
    </div>
  );
};
