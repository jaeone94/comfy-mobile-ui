import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { X, Image, Video, Download, ExternalLink, Info, ChevronLeft, ChevronRight, Workflow, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { isImageFile } from '@/shared/utils/ComfyFileUtils';
import { extractWorkflowFromPng } from '@/utils/pngMetadataExtractor';
import type { IComfyJson } from '@/shared/types/app/IComfyJson';

interface FilePreviewModalProps {
  isOpen: boolean;
  filename: string;
  isImage: boolean;
  loading?: boolean;
  error?: string;
  url?: string;
  onClose: () => void;
  onRetry: (filename: string) => void;
  onMediaError?: (error: string) => void;
  fileSize?: number;
  fileType?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  isCompact?: boolean;
  // Navigation props (v2)
  files?: IComfyFileInfo[];
  initialIndex?: number;
  comfyFileService?: ComfyFileService;
  hasMoreFiles?: boolean;
  isLoadingMoreFiles?: boolean;
  onLoadMoreFiles?: () => void | Promise<void>;
  /** Shown only when the current PNG contains complete ComfyUI workflow metadata. */
  onOpenWorkflow?: (workflow: IComfyJson, filename: string) => void | Promise<void>;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  filename: initialFilename,
  isImage: initialIsImage,
  loading: initialLoading = false,
  error: initialError,
  url: initialUrl,
  onClose,
  onRetry,
  onMediaError,
  fileSize: initialFileSize,
  fileType: initialFileType,
  dimensions: initialDimensions,
  duration: initialDuration,
  isCompact = false,
  files = [],
  initialIndex = -1,
  comfyFileService,
  hasMoreFiles = false,
  isLoadingMoreFiles = false,
  onLoadMoreFiles,
  onOpenWorkflow
}) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [embeddedWorkflow, setEmbeddedWorkflow] = useState<IComfyJson | null>(null);
  const [isCheckingWorkflow, setIsCheckingWorkflow] = useState(false);
  const [isOpeningWorkflow, setIsOpeningWorkflow] = useState(false);
  const [slideDirection, setSlideDirection] = useState(0);
  const canOpenWorkflow = Boolean(onOpenWorkflow);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isImageZoomedRef = useRef(false);
  const loadMoreRequestedAtRef = useRef(-1);

  // Internal navigation state
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Current file derived states
  const [filename, setFilename] = useState(initialFilename);
  const [isImage, setIsImage] = useState(initialIsImage);
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(initialError);
  const [fileSize, setFileSize] = useState(initialFileSize);
  const [fileType, setFileType] = useState(initialFileType);
  const [dimensions, setDimensions] = useState(initialDimensions);
  const [duration, setDuration] = useState(initialDuration);

  // Reset to initial when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setFilename(initialFilename);
      setIsImage(initialIsImage);
      setUrl(initialUrl);
      setLoading(initialLoading);
      setError(initialError);
      setFileSize(initialFileSize);
      setFileType(initialFileType);
      setDimensions(initialDimensions);
      setDuration(initialDuration);
      setShowInfo(false);
      setSlideDirection(0);
      isImageZoomedRef.current = false;
    }
  }, [isOpen, initialIndex, initialFilename, initialIsImage, initialUrl, initialLoading, initialError, initialFileSize, initialFileType, initialDimensions, initialDuration]);

  useEffect(() => {
    if (!isOpen || !onLoadMoreFiles || !hasMoreFiles || isLoadingMoreFiles || files.length === 0) return;
    if (currentIndex < files.length - 3 || loadMoreRequestedAtRef.current === files.length) return;

    loadMoreRequestedAtRef.current = files.length;
    Promise.resolve(onLoadMoreFiles()).catch((loadError) => {
      console.error('[FilePreviewModal] Failed to load more history files:', loadError);
      loadMoreRequestedAtRef.current = -1;
    });
  }, [currentIndex, files.length, hasMoreFiles, isLoadingMoreFiles, isOpen, onLoadMoreFiles]);

  useEffect(() => {
    let cancelled = false;

    const inspectWorkflowMetadata = async () => {
      setEmbeddedWorkflow(null);
      if (!isOpen || !canOpenWorkflow || !url || !filename.toLowerCase().endsWith('.png')) {
        setIsCheckingWorkflow(false);
        return;
      }

      setIsCheckingWorkflow(true);
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const blob = await response.blob();
        const pngFile = new File([blob], filename, { type: 'image/png' });
        const result = await extractWorkflowFromPng(pngFile);
        const workflow = result.success ? result.data?.workflow : undefined;
        if (!cancelled && workflow && Array.isArray(workflow.nodes)) {
          setEmbeddedWorkflow(workflow as IComfyJson);
        }
      } catch (metadataError) {
        console.debug('[FilePreviewModal] No readable workflow metadata:', metadataError);
      } finally {
        if (!cancelled) setIsCheckingWorkflow(false);
      }
    };

    inspectWorkflowMetadata();
    return () => {
      cancelled = true;
    };
  }, [isOpen, canOpenWorkflow, url, filename]);

  // Handle navigation
  const navigateToFile = useCallback((index: number) => {
    if (index < 0 || index >= files.length || !comfyFileService) return;

    const file = files[index];
    setSlideDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
    setFilename(file.filename);
    setIsImage(isImageFile(file.filename));
    setLoading(true);
    setError(undefined);
    setShowInfo(false);

    // Create new URL with cache busting (modified timestamp)
    const newUrl = comfyFileService.createDownloadUrl({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type,
      modified: file.modified
    });
    setUrl(newUrl);

    // Update metadata if available
    setFileSize(file.size);
    setFileType(file.type);
    // Note: dimensions and duration might need separate API calls if not in IComfyFileInfo
    // But for now we just clear them or use what's there
    setDimensions(undefined);
    setDuration(undefined);
    isImageZoomedRef.current = false;

    // Simulate small loading delay for better UX transition
    setTimeout(() => {
      setLoading(false);
    }, 100);
  }, [files, comfyFileService, currentIndex]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      navigateToFile(currentIndex - 1);
    }
  }, [currentIndex, navigateToFile]);

  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      navigateToFile(currentIndex + 1);
    } else if (hasMoreFiles && !isLoadingMoreFiles) {
      void onLoadMoreFiles?.();
    }
  }, [currentIndex, files.length, hasMoreFiles, isLoadingMoreFiles, navigateToFile, onLoadMoreFiles]);

  const handleCarouselTouchStart = useCallback((event: React.TouchEvent) => {
    if (files.length <= 1 || event.touches.length !== 1 || isImageZoomedRef.current) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [files.length]);

  const handleCarouselTouchEnd = useCallback((event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1 || isImageZoomedRef.current) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    if (deltaX > 0) handlePrevious();
    else handleNext();
  }, [handleNext, handlePrevious]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || files.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, files.length, currentIndex, handlePrevious, handleNext, onClose]);

  // Prevent body scroll when modal is open (iOS Safari fix)
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
      return () => {
        document.body.classList.remove('modal-open');
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageError = () => {
    console.error('❌ Failed to load image in browser:', filename);
    onMediaError?.(t('media.failedToDisplayImage'));
  };

  const handleVideoError = () => {
    console.error('❌ Failed to load video in browser:', filename);
    onMediaError?.(t('media.failedToDisplayVideo'));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('media.fileSizes.bytes')}`;
    const k = 1024;
    const sizes = [
      t('media.fileSizes.bytes'),
      t('media.fileSizes.kb'),
      t('media.fileSizes.mb'),
      t('media.fileSizes.gb')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toUpperCase() || '';
  };

  const handleDownload = () => {
    if (!url) return;

    setIsDownloading(true);
    try {
      // Create a hidden link and trigger download directly via browser
      // This avoids loading the entire file into memory (Blob)
      const link = document.body.appendChild(document.createElement('a'));

      // Add download attribute to suggest filename
      link.download = filename;
      link.href = url;

      // Important: for many browsers, cross-origin download attribute doesn't work 
      // without server headers. But simple link navigation is safer for memory.
      link.click();
      link.remove();

      toast.success(t('media.downloadStarted'), {
        description: t('media.downloadStartedDesc', { filename }),
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast.error(t('media.downloadFailed'), {
        description: t('media.downloadFailedDesc'),
      });
    } finally {
      setIsDownloading(false);
    }
  };


  const handleOpenInNewTab = () => {
    if (!url) return;
    window.open(url, '_blank');
  };

  const handleOpenWorkflow = async () => {
    if (!embeddedWorkflow || !onOpenWorkflow || isOpeningWorkflow) return;
    setIsOpeningWorkflow(true);
    try {
      await onOpenWorkflow(embeddedWorkflow, filename);
    } catch (openError) {
      // The caller owns the localized error UI. Keep this preview open so
      // the user can retry or close it themselves.
      console.error('[FilePreviewModal] Failed to open embedded workflow:', openError);
    } finally {
      setIsOpeningWorkflow(false);
    }
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
 className={`${isCompact ? 'absolute h-full' : 'fixed h-[100dvh]'} top-0 left-0 right-0 bottom-0 z-[99999] bg-[#101217] flex flex-col ${isCompact ? 'px-0 pt-0 pb-0' : ''} overflow-hidden`}
          data-file-preview-modal
        >
          {/* Header (Always Visible unless Compact) */}
          {!isCompact && (
            <div className="flex items-center justify-between gap-3 flex-shrink-0 bg-white/80 dark:bg-[#0b0c0f]/80 backdrop-blur-xl p-4 md:px-8 md:py-5 border-b border-white/[0.08] z-[100003] shadow-sm">
              <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
                <div className={`p-2.5 rounded-xl flex-shrink-0 shadow-sm ${isImage ? 'bg-[#3069f0]/15 text-[#5b8af5]' : 'bg-[#9a8af0]/15 text-purple-500'}`}>
                  {isImage ? (
                    <Image className="w-5 h-5 md:w-6 md:h-6" />
                  ) : (
                    <Video className="w-5 h-5 md:w-6 md:h-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[12px] md:text-[14px] font-bold text-[#e9ebef] truncate tracking-tight" title={filename}>
                    {filename}
                  </h3>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[10px] md:text-xs font-medium bg-white/[0.06] text-[#8a919e] border-none px-2">
                      {getFileExtension(filename)}
                    </Badge>
                    {fileSize && (
                      <Badge variant="secondary" className="text-[10px] md:text-xs font-medium bg-white/[0.06] text-[#8a919e] border-none px-2">
                        {formatFileSize(fileSize)}
                      </Badge>
                    )}
                    {dimensions && (
                      <Badge variant="secondary" className="text-[10px] md:text-xs font-medium bg-white/[0.06] text-[#8a919e] border-none px-2">
                        {dimensions.width}×{dimensions.height}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 md:space-x-3 flex-shrink-0">
                {/* Action Buttons - Always Visible if URL exists */}
                {url && (
                  <>
                    <Button
                      onClick={() => setShowInfo(!showInfo)}
                      variant="ghost"
                      size="sm"
 className="h-10 w-10 p-0 rounded-xl hover:bg-white/[0.06] dark:hover:bg-[#14171e] text-[#71798a]"
                      title={t('media.showFileInfo')}
                    >
                      <Info className="w-5 h-5" />
                    </Button>

                    <Button
                      onClick={handleOpenInNewTab}
                      variant="ghost"
                      size="sm"
 className="h-10 w-10 p-0 rounded-xl hover:bg-white/[0.06] dark:hover:bg-[#14171e] text-[#71798a]"
                      title={t('media.openInNewTab')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </Button>

                    <Button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      variant="ghost"
                      size="sm"
 className="h-10 px-3 md:px-4 rounded-xl hover:bg-white/[0.06] dark:hover:bg-[#14171e] text-[#71798a] font-semibold"
                      title={t('media.downloadFile')}
                    >
                      <Download className="w-5 h-5 md:mr-2" />
                      <span className="hidden md:inline">{isDownloading ? t('media.downloading') : t('media.download')}</span>
                    </Button>
                  </>
                )}

                {(isCheckingWorkflow || embeddedWorkflow) && (
                  <Button
                    onClick={handleOpenWorkflow}
                    disabled={!embeddedWorkflow || isOpeningWorkflow}
                    variant="ghost"
                    size="sm"
                    className="h-10 px-3 md:px-4 rounded-xl bg-[#3069f0]/15 text-[#7ba3f5] hover:bg-[#3069f0]/25 font-semibold disabled:opacity-50"
                    aria-label={t('promptHistory.workflowRecovery.open')}
                    title={isCheckingWorkflow ? t('promptHistory.workflowRecovery.checking') : t('promptHistory.workflowRecovery.open')}
                  >
                    {isCheckingWorkflow || isOpeningWorkflow ? (
                      <Loader2 className="w-5 h-5 animate-spin md:mr-2" />
                    ) : (
                      <Workflow className="w-5 h-5 md:mr-2" />
                    )}
                    <span className="hidden md:inline">
                      {isCheckingWorkflow ? t('promptHistory.workflowRecovery.checking') : t('promptHistory.workflowRecovery.open')}
                    </span>
                  </Button>
                )}

                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="sm"
 className="h-10 w-10 md:w-auto md:px-4 rounded-xl bg-white/[0.06] text-[#8a919e] dark:text-[#c8ccd4] hover:bg-white/[0.08] font-bold"
                  title={t('common.close')}
                >
                  <X className="w-5 h-5 md:mr-1.5" />
                  <span className="hidden md:inline">{t('common.close')}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Compact Mode Close Overlay Button */}
          {isCompact && (
            <div className="absolute top-4 right-4 z-[100001]">
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
 className="h-10 w-10 p-0 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md border border-white/20 text-white shadow-lg transition-all active:scale-90"
                title={t('common.close')}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}

          {/* File Info Panel */}
          <AnimatePresence>
            {showInfo && url && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
 className="border-b border-white/[0.08] bg-white/[0.04]/50 dark:bg-[#14171e]/50 backdrop-blur-sm"
              >
                <div className="p-4 md:px-8 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs md:text-[12px]">
                    <div>
                      <span className="text-[#71798a] dark:text-[#71798a] uppercase font-black tracking-tighter">{t('media.type')}</span>
                      <div className="text-[#c8ccd4] dark:text-[#d5d9e0] font-bold mt-0.5">{fileType || getFileExtension(filename)}</div>
                    </div>
                    {fileSize && (
                      <div>
                        <span className="text-[#71798a] dark:text-[#71798a] uppercase font-black tracking-tighter">{t('media.size')}</span>
                        <div className="text-[#c8ccd4] dark:text-[#d5d9e0] font-bold mt-0.5">{formatFileSize(fileSize)}</div>
                      </div>
                    )}
                    {dimensions && (
                      <div>
                        <span className="text-[#71798a] dark:text-[#71798a] uppercase font-black tracking-tighter">{t('media.dimensions')}</span>
                        <div className="text-[#c8ccd4] dark:text-[#d5d9e0] font-bold mt-0.5">{dimensions.width} × {dimensions.height}</div>
                      </div>
                    )}
                    {duration && (
                      <div>
                        <span className="text-[#71798a] dark:text-[#71798a] uppercase font-black tracking-tighter">{t('media.duration')}</span>
                        <div className="text-[#c8ccd4] dark:text-[#d5d9e0] font-bold mt-0.5">{formatDuration(duration)}</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[#71798a] dark:text-[#71798a] uppercase font-black tracking-tighter">{t('media.filename')}</span>
                    <div className="text-[#c8ccd4] dark:text-[#d5d9e0] font-mono text-xs break-all mt-0.5 opacity-80">{filename}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content Area - No Padding for Full Experience */}
          <div className="flex-1 relative overflow-hidden flex flex-col min-h-0 bg-black/20">
            {/* Loading Overlay */}
            {loading && (
              <div className="absolute inset-0 z-[100004] flex items-center justify-center bg-white/40 dark:bg-[#0b0c0f]/40 backdrop-blur-[2px]">
                <div className="text-center">
                  <div className="w-12 h-10 border-3 border-[#3069f0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-[#8a919e] dark:text-[#c8ccd4] text-[12px] font-bold tracking-tight">{t('media.loadingPreview')}</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="flex items-center justify-center flex-1 z-[100005] bg-[#101217]">
                <div className="text-center p-4">
                  <div className="w-20 h-20 bg-[#f25555]/15 rounded-xl flex items-center justify-center mx-auto mb-6">
                    <X className="w-10 h-10 text-[#f25555]" />
                  </div>
                  <p className="text-[#f25555] font-bold text-[15px] mb-2">{t('media.previewFailed')}</p>
                  <p className="text-[#71798a] mb-8 max-w-md mx-auto">{error}</p>
                  <Button
                    onClick={() => onRetry(filename)}
                    variant="outline"
 className="bg-white/[0.06] border-none text-[#c8ccd4] dark:text-[#d5d9e0] hover:bg-white/[0.08] px-8 py-6 rounded-xl font-bold"
                  >
                    {t('common.retry')}
                  </Button>
                </div>
              </div>
            )}

            {/* Media Content */}
            {url && !error && (
              <div
                className="flex-1 flex items-center justify-center min-h-0"
                onTouchStartCapture={handleCarouselTouchStart}
                onTouchEndCapture={handleCarouselTouchEnd}
                onTouchCancelCapture={() => {
                  touchStartRef.current = null;
                }}
              >
                <AnimatePresence initial={false} mode="popLayout" custom={slideDirection}>
                  <motion.div
                    key={url}
                    custom={slideDirection}
                    initial={{ opacity: 0, x: slideDirection * 90 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: slideDirection * -90 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="absolute inset-0 flex h-full w-full items-center justify-center"
                  >
                    {isImage ? (
                      <TransformWrapper
                        initialScale={1}
                        minScale={0.5}
                        maxScale={8}
                        centerOnInit
                        onTransformed={(_, state) => {
                          isImageZoomedRef.current = state.scale > 1.02;
                        }}
                      >
                        <TransformComponent
                          wrapperStyle={{ width: "100%", height: "100%" }}
                          contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <img
                            src={url}
                            alt={filename}
                            className="max-w-full max-h-full object-contain"
                            onError={handleImageError}
                          />
                        </TransformComponent>
                      </TransformWrapper>
                    ) : (
                      <video
                        src={`${url}#t=0.001`}
                        controls
                        preload="auto"
                        className="max-w-full max-h-full object-contain"
                        onError={handleVideoError}
                        {...(isCompact ? { playsInline: true, "webkit-playsinline": "true" } : {})}
                      >
                        {t('media.videoNotSupported')}
                      </video>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation Arrows - Static Mounting to avoid re-animation on file shift */}
                {!isCompact && files.length > 1 && (
                  <>
                    {/* Previous Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevious();
                      }}
                      disabled={currentIndex <= 0}
 className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-[100006] w-14 h-10 md:w-20 md:h-20 flex items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 text-white backdrop-blur-xl border border-white/10 transition-all active:scale-90 shadow-2xl group disabled:opacity-0 disabled:pointer-events-none`}
                      title={t('common.previous')}
                    >
                      <ChevronLeft className="w-8 h-8 md:w-12 md:h-10 group-active:-translate-x-1 transition-transform" />
                    </button>

                    {/* Next Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNext();
                      }}
                      disabled={currentIndex >= files.length - 1 && (!hasMoreFiles || isLoadingMoreFiles)}
 className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-[100006] w-14 h-10 md:w-20 md:h-20 flex items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 text-white backdrop-blur-xl border border-white/10 transition-all active:scale-90 shadow-2xl group disabled:opacity-0 disabled:pointer-events-none`}
                      title={t('common.next')}
                    >
                      {isLoadingMoreFiles && currentIndex >= files.length - 1 ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <ChevronRight className="w-8 h-8 md:w-12 md:h-10 group-active:translate-x-1 transition-transform" />
                      )}
                    </button>

                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (isCompact) return content;
  return createPortal(content, document.body);
};
