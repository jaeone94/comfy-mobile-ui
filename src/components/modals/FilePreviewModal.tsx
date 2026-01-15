import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { X, Image, Video, Download, ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

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
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  filename,
  isImage,
  loading = false,
  error,
  url,
  onClose,
  onRetry,
  onMediaError,
  fileSize,
  fileType,
  dimensions,
  duration,
}) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Prevent body scroll when modal is open (iOS Safari fix)
  React.useEffect(() => {
    if (isOpen) {
      // Add CSS class to prevent scrolling
      document.body.classList.add('modal-open');

      return () => {
        // Remove CSS class to restore scrolling
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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 bottom-0 z-[99999] bg-white dark:bg-slate-900 flex flex-col pwa-modal"
        >
          {/* Enhanced Header */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200 dark:border-slate-700 gap-3 flex-shrink-0 bg-white dark:bg-slate-900">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className={`p-2 rounded-xl flex-shrink-0 ${isImage ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                {isImage ? (
                  <Image className="w-5 h-5" />
                ) : (
                  <Video className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100 truncate" title={filename}>
                  {filename}
                </h3>
                <div className="flex items-center flex-wrap gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {getFileExtension(filename)}
                  </Badge>
                  {fileSize && (
                    <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {formatFileSize(fileSize)}
                    </Badge>
                  )}
                  {dimensions && (
                    <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {dimensions.width}×{dimensions.height}
                    </Badge>
                  )}
                  {duration && (
                    <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {formatDuration(duration)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1 md:space-x-2 flex-shrink-0">
              {/* Action Buttons */}
              {url && !loading && !error && (
                <>
                  <Button
                    onClick={() => setShowInfo(!showInfo)}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    title={t('media.showFileInfo')}
                  >
                    <Info className="w-4 h-4" />
                  </Button>

                  <Button
                    onClick={handleOpenInNewTab}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    title={t('media.openInNewTab')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>

                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
                    title={t('media.downloadFile')}
                  >
                    <Download className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">{isDownloading ? t('media.downloading') : t('media.download')}</span>
                  </Button>
                </>
              )}

              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-9 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700"
                title={t('common.close')}
              >
                <X className="w-4 h-4 md:mr-1" />
                <span className="hidden md:inline">{t('common.close')}</span>
              </Button>
            </div>
          </div>

          {/* File Info Panel */}
          <AnimatePresence>
            {showInfo && url && !loading && !error && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">{t('media.type')}:</span>
                      <div className="text-slate-700 dark:text-slate-200 font-medium">{fileType || getFileExtension(filename)}</div>
                    </div>
                    {fileSize && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('media.size')}:</span>
                        <div className="text-slate-700 dark:text-slate-200 font-medium">{formatFileSize(fileSize)}</div>
                      </div>
                    )}
                    {dimensions && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('media.dimensions')}:</span>
                        <div className="text-slate-700 dark:text-slate-200 font-medium">{dimensions.width} × {dimensions.height}</div>
                      </div>
                    )}
                    {duration && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('media.duration')}:</span>
                        <div className="text-slate-700 dark:text-slate-200 font-medium">{formatDuration(duration)}</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t('media.filename')}:</span>
                    <div className="text-slate-700 dark:text-slate-200 font-mono text-sm break-all">{filename}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Enhanced Content */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {loading && (
              <div className="flex items-center justify-center flex-1">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                  <p className="text-slate-700 dark:text-slate-200 text-lg font-medium">{t('media.loadingPreview')}</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-2">{t('media.downloadingFile', { filename })}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center flex-1">
                <div className="text-center">
                  <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <X className="w-10 h-10 text-red-400" />
                  </div>
                  <p className="text-red-400 font-medium text-lg mb-2">{t('media.previewFailed')}</p>
                  <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
                  <Button
                    onClick={() => onRetry(filename)}
                    variant="outline"
                    className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {t('common.retry')}
                  </Button>
                </div>
              </div>
            )}

            {url && !loading && !error && (
              <div className="flex-1 flex items-center justify-center min-h-0 p-6">
                <div className="w-full h-full flex items-center justify-center max-w-full max-h-full">
                  {isImage ? (
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={8}
                      centerOnInit
                    >
                      <TransformComponent
                        wrapperStyle={{ width: "100%", height: "100%" }}
                        contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <img
                          src={url}
                          alt={filename}
                          className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                          onError={handleImageError}
                        />
                      </TransformComponent>
                    </TransformWrapper>
                  ) : (
                    <video
                      src={`${url}#t=0.001`}
                      controls
                      preload="auto"
                      className="content-fit rounded-xl shadow-lg"
                      onError={handleVideoError}
                    >
                      {t('media.videoNotSupported')}
                    </video>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};