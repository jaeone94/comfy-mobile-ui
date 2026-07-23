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
  // Videos never gate the loading overlay (poster/placeholder shows instantly)
  const [isLoaded, setIsLoaded] = useState(() => isVideoFile(file.filename));
  const [hasError, setHasError] = useState(false);
  const { url: serverUrl } = useConnectionStore();
  // Lazy loading is delegated to the browser (loading="lazy" on the <img>)
  // and offscreen render cost to CSS content-visibility on the tile — no
  // per-item IntersectionObserver: at thousands of items, one observer per
  // tile plus a framer-motion instance per tile dominated mount time.


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
  const thumbnailUrl = !isVideoFile(file.filename) ? fileService.createDownloadUrl({
    filename: file.filename,
    subfolder: file.subfolder,
    type: file.type,
    preview: true,
    modified: file.modified
  }) : undefined;

  // Matching image poster for videos: an O(1) map lookup, so compute it
  // directly; the poster <img> below is browser-lazy like everything else.
  const [posterFailed, setPosterFailed] = useState(false);
  const matchingImageThumbnail = useMemo(() => {
    if (!isVideoFile(file.filename) || posterFailed) return null;
    const matchingImage = findMatchingImageForVideo(file.filename);
    if (!matchingImage) return null;
    return fileService.createDownloadUrl({
      filename: matchingImage.filename,
      subfolder: matchingImage.subfolder,
      type: matchingImage.type,
      preview: true,
      modified: matchingImage.modified
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, imageLookupMap, posterFailed]);

  const handleClick = () => {
    if (isSelectionMode && onSelectionChange) {
      onSelectionChange(file, !isSelected);
    } else {
      onImageClick(file);
    }
  };

  return (
    <div
      className={`relative aspect-square overflow-hidden cursor-pointer group transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] ${isSelected ? 'z-10' : ''}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 256px', background: '#0d1016' }}
      onClick={handleClick}
    >
      {/* Loading Placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 bg-white/[0.06] rounded animate-pulse" />
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0d1016' }}>
          <div className="text-center">
            {isVideoFile(file.filename) ? (
              <Video className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.6} />
            ) : (
              <ImageIcon className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.6} />
            )}
            <p className="text-xs text-[#565d6b]">{t('media.failedToLoad')}</p>
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
                setPosterFailed(true);
                setHasError(true);
              }}
            />
          ) : (
            /* Video placeholder when no thumbnail available */
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#0d1016' }}>
              <Video className="h-10 w-10 text-white/20" strokeWidth={1.6} />
            </div>
          )}
          {/* Video Overlay Icon */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-lg p-2 border border-white/[0.12]" style={{ background: 'rgba(5,6,8,0.72)' }}>
              <Video className="h-5 w-5 text-[#e9ebef]" strokeWidth={1.8} />
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

      {/* Selected State Overlay (blue wash + border, per design spec) */}
      {isSelected && (
        <div
          className="absolute inset-0 z-20 pointer-events-none border-2 border-[#3069f0]"
          style={{ background: 'rgba(48,105,240,0.28)' }}
        />
      )}

      {/* Selection Checkbox - square check */}
      {isSelectionMode && (
        <div className="absolute top-1.5 left-1.5 z-30">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${isSelected ? 'bg-[#3069f0]' : 'border-[1.5px] border-white/55'}`}
            style={isSelected ? undefined : { background: 'rgba(5,6,8,0.4)' }}
          >
            {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={2.6} />}
          </div>
        </div>
      )}

      {/* Folder Type Badge - mono micro chip */}
      <div className="absolute top-1.5 right-1.5 z-30">
        <div
          className="px-1.5 py-[3px] rounded-md font-mono text-[8.5px] font-semibold tracking-[0.1em] uppercase border border-white/[0.12] text-[#e9ebef]"
          style={{ background: 'rgba(5,6,8,0.72)' }}
        >
          {file.type}
        </div>
      </div>

      {/* Filename Overlay on Hover */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
        <p className="text-[#e9ebef] font-mono text-[10px] truncate">
          {file.filename}
        </p>
      </div>
    </div>
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
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden pt-safe pb-safe z-0" style={{ background: '#050608' }}>
      {/* Immersive Fixed Header */}
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-50 pointer-events-none"
      >
        <div
          className="absolute inset-x-0 top-0 h-full"
          style={{ background: 'linear-gradient(to bottom, rgba(5,6,8,.92) 30%, transparent)' }}
        />
        {/* Single-row header: back tile | title + mono sub | action tiles */}
        <div className="relative flex items-center gap-2.5 px-3.5 pt-3 pb-2 md:px-8 pointer-events-auto">
          <button
            onClick={handleGoBack}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[10px] border border-white/10 text-[#e9ebef] backdrop-blur-md transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            title={t('common.back')}
          >
            <ChevronLeft className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-[19px] font-extrabold text-white leading-[1.15] tracking-[-0.01em] truncate">
              {isFileSelectionMode
                ? (selectionTitle || t('gallery.selectFile'))
                : (selectedSubfolder && viewMode === 'folders'
                  ? (selectedSubfolder === '/' ? 'Root' : selectedSubfolder.split('/').pop())
                  : t(`gallery.tabs.${activeTab}`))}
            </h1>
            <p className={`font-mono text-[9px] font-medium tracking-[0.14em] uppercase mt-[3px] truncate ${isSelectionMode ? 'text-[#7ba3f5]' : 'text-[#8a919e]'}`}>
              {isSelectionMode
                ? `${selectedFiles.size} SELECTED`
                : (viewMode === 'folders'
                  ? (selectedSubfolder && selectedSubfolder !== '/' ? selectedSubfolder : 'Root Folder')
                  : (activeFolder === 'all'
                    ? t('gallery.filesTotal', { count: currentFiles.length })
                    : t('gallery.folderSummary', {
                      count: currentFiles.length,
                      folder: t(`gallery.folders.${activeFolder}`),
                      type: t('gallery.actions.files')
                    })))}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Toggle */}
            {!isSelectionMode && (!selectedSubfolder || selectedSubfolder === '/') && (
              <button
                onClick={() => {
                  setViewMode(viewMode === 'flat' ? 'folders' : 'flat');
                  setSelectedSubfolder(viewMode === 'flat' ? '/' : null);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-[10px] border border-white/10 text-[#c8ccd4] backdrop-blur-md transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                title={viewMode === 'flat' ? 'Folders' : 'Grid'}
              >
                {viewMode === 'flat' ? <FolderTree className="h-4 w-4" strokeWidth={1.8} /> : <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />}
              </button>
            )}

            {/* Refresh */}
            <AnimatePresence>
              {!isSelectionMode && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.5, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.5, x: 20 }}
                  onClick={loadFiles}
                  disabled={loading}
                  className="w-9 h-9 flex items-center justify-center rounded-[10px] border border-white/10 text-[#c8ccd4] backdrop-blur-md transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                  title={t('gallery.refreshFiles')}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Select All (labeled chip, selection mode) */}
            <AnimatePresence>
              {isSelectionMode && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.5, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.5, x: 20 }}
                  onClick={() => handleSelectAll(true)}
                  className="h-9 px-3 flex items-center rounded-[10px] border border-white/10 text-[#c8ccd4] text-[11.5px] font-semibold whitespace-nowrap backdrop-blur-md transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                  title={t('gallery.selectAll')}
                >
                  {t('gallery.selectAll')}
                </motion.button>
              )}
            </AnimatePresence>

            {/* Selection toggle */}
            {!isFileSelectionMode && (
              <button
                onClick={toggleSelectionMode}
                className={`w-9 h-9 flex items-center justify-center rounded-[10px] border backdrop-blur-md transition-all active:scale-95 ${isSelectionMode
                  ? 'bg-[#e9ebef] border-[#e9ebef] text-[#0b0c0f]'
                  : 'border-white/10 text-[#c8ccd4]'
                  }`}
                style={isSelectionMode ? undefined : { background: 'rgba(255,255,255,0.06)' }}
                title={isSelectionMode ? t('gallery.exitSelectionMode') : t('gallery.enterSelectionMode')}
              >
                {isSelectionMode ? <X className="h-4 w-4" strokeWidth={2} /> : <CheckSquare className="h-4 w-4" strokeWidth={1.8} />}
              </button>
            )}
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
                          className={`border rounded-xl overflow-hidden cursor-pointer group transition-all ${selectedFiles.has(`folder:${folder.fullPath}`) ? 'border-[#3069f0]/70 ring-1 ring-[#3069f0]/40' : 'border-white/[0.08] hover:border-white/[0.16]'
                            }`}
                          style={{ background: '#101217' }}
                        >
                          <div className="aspect-square relative">
                            {/* Selection Checkbox - Immersive Circle */}
                            {isSelectionMode && (
                              <div className="absolute top-3 left-3 z-30">
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${selectedFiles.has(`folder:${folder.fullPath}`) ? 'bg-[#3069f0]' : 'border-[1.5px] border-white/55 bg-black/40'}`}>
                                  {selectedFiles.has(`folder:${folder.fullPath}`) && <Check className="h-3 w-3 text-white" strokeWidth={2.6} />}
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
                              <div className="rounded-xl p-3 border border-white/[0.12] group-hover:border-[#3069f0]/50 transition-colors" style={{ background: 'rgba(5,6,8,0.6)' }}>
                                <FolderTree className="h-6 w-6 text-[#e9ebef]" strokeWidth={1.7} />
                              </div>
                            </div>
                            <div className="absolute bottom-2 right-2 font-mono text-[9px] font-semibold text-[#7ba3f5] px-1.5 py-[3px] rounded-md border border-[#3069f0]/25" style={{ background: 'rgba(61,123,253,0.1)' }}>
                              {folder.count}
                            </div>
                          </div>
                          <div className="px-3 py-2.5 border-t border-white/[0.06]">
                            <p className="text-[#e9ebef] font-semibold truncate text-[12.5px]">
                              {folder.name}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Files Section Second */}
                  {folderContent.files.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-0.5">
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
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-0.5"
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

      {/* Immersive Footer */}
      <footer
        className="fixed bottom-0 inset-x-0 z-50 pt-16 pb-4 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(5,6,8,.92) 25%, transparent)' }}
      >
        <div className="px-3.5 md:px-12 max-w-2xl mx-auto pointer-events-auto">
          {isSelectionMode ? (
            // Selection Mode: centered floating glass bar (Move | Delete)
            <div className="flex justify-center relative">
              <AnimatePresence>
                {showMovePanel && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-16 border border-white/10 rounded-xl p-1.5 min-w-[170px] overflow-hidden"
                    style={{ background: 'rgba(15,17,22,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 20px 48px rgba(0,0,0,0.55)' }}
                  >
                    {(['input', 'output', 'temp'] as const).filter(f => f !== activeFolder).map(f => (
                      <button
                        key={f}
                        onClick={() => handleMoveSelected(f)}
                        className="w-full h-10 flex items-center gap-2.5 px-3 hover:bg-white/5 rounded-lg transition-colors text-[#d5d9e0] font-mono text-[11px] font-semibold tracking-[0.1em] uppercase"
                      >
                        <FolderOpen className="h-[15px] w-[15px] text-[#5b8af5]" strokeWidth={1.8} />
                        <span>{t(`gallery.folders.${f}`)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className="flex items-center gap-1.5 p-1.5 rounded-[14px] border border-white/10"
                style={{ background: 'rgba(15,17,22,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
              >
                <button
                  onClick={() => setShowMovePanel(!showMovePanel)}
                  disabled={selectedFiles.size === 0 || isAnyFolderSelected}
                  className="h-10 px-[18px] flex items-center gap-2 rounded-[10px] border border-white/[0.08] text-[#c8ccd4] text-[12.5px] font-semibold whitespace-nowrap transition-all active:scale-95 disabled:opacity-35"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <FolderOpen className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  {t('workflow.move')}
                </button>
                <span className="w-px h-[22px] bg-white/[0.08]" />
                <button
                  onClick={handleDeleteClick}
                  disabled={selectedFiles.size === 0}
                  className="h-10 px-[18px] flex items-center gap-2 rounded-[10px] border text-[12.5px] font-semibold whitespace-nowrap transition-all active:scale-95 disabled:opacity-35"
                  style={{ background: 'rgba(242,85,85,0.12)', borderColor: 'rgba(242,85,85,0.3)', color: '#f87c7c' }}
                >
                  <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : (
            // Normal Mode: media-type toggle + INPUT/OUTPUT/TEMP segment control
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setActiveTab(activeTab === 'images' ? 'videos' : 'images');
                  window.scrollTo(0, 0);
                }}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-white/10 text-[#c8ccd4] transition-all active:scale-95"
                style={{ background: 'rgba(15,17,22,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
              >
                {activeTab === 'images' ? <Video className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
              </button>

              <div
                className="flex-1 h-11 flex gap-[3px] p-1 rounded-xl border border-white/10"
                style={{ background: 'rgba(15,17,22,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
              >
                {(['input', 'output', 'temp'] as FolderType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setActiveFolder(f);
                      window.scrollTo(0, 0);
                    }}
                    className={`flex-1 rounded-lg font-mono text-[10px] tracking-[0.12em] uppercase transition-all active:scale-[0.98] ${activeFolder === f
                      ? 'bg-[#e9ebef] text-[#0b0c0f] font-bold'
                      : 'text-[#71798a] font-semibold hover:text-[#9aa3b2]'
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
