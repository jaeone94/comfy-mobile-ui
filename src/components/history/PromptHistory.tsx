import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Eye, Image as ImageIcon, Video, FileText, Layers, ChevronDown } from 'lucide-react';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { usePromptHistoryStore } from '@/ui/store/promptHistoryStore';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { JsonViewerModal } from '@/components/modals/JsonViewerModal';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { PromptTracker } from '@/utils/promptTracker';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
};

const isVideoFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv'].includes(ext);
};

interface PromptHistoryItem {
  promptId: string;
  timestamp: number;
  status: {
    status_str: string;
    completed: boolean;
  };
  exception_message?: string;
  exception_type?: string;
  workflow?: any;
  outputs?: any;
  rawData?: any;
  isInterrupted?: boolean;
  duration?: number;
}

interface LazyThumbnailProps {
  file: IComfyFileInfo;
  onFileClick: (file: IComfyFileInfo) => void;
  imageLookupMap?: Map<string, IComfyFileInfo>;
}

const LazyThumbnail: React.FC<LazyThumbnailProps> = ({ file, onFileClick, imageLookupMap }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const { url: serverUrl } = useConnectionStore();
  const comfyFileService = new ComfyFileService(serverUrl);

  // Safe Intersection Observer for lazy loading
  useEffect(() => {
    if (isInView) return;

    const element = thumbnailRef.current;
    if (!element) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isInView) {
            setIsInView(true);
            if (observerRef.current) {
              observerRef.current.disconnect();
              observerRef.current = null;
            }
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [isInView]);


  const getFileIcon = (filename: string) => {
    if (isImageFile(filename)) {
      return <ImageIcon className="h-4 w-4 text-blue-400" />;
    } else if (isVideoFile(filename)) {
      return <Video className="h-4 w-4 text-purple-400" />;
    } else {
      return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const thumbnailUrl = useMemo(() => {
    if (!isInView) return undefined;

    // For images, use the file itself
    if (isImageFile(file.filename)) {
      return comfyFileService.createDownloadUrl({
        filename: file.filename,
        subfolder: file.subfolder,
        type: file.type,
        preview: true
      });
    }

    // For videos, try to find matching thumbnail from map
    if (isVideoFile(file.filename) && imageLookupMap) {
      let videoNameWithoutExt = file.filename.substring(0, file.filename.lastIndexOf('.'));
      if (videoNameWithoutExt.endsWith('-audio')) {
        videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
      }

      const subfolder = file.subfolder || '';
      const normalizedSubfolder = subfolder.replace(/\\/g, '/');

      // Try multiple combinations to be resilient
      const searchKeys = [
        `${file.type || 'output'}/${normalizedSubfolder}/${videoNameWithoutExt}`,
        `${file.type || 'output'}/${subfolder}/${videoNameWithoutExt}`,
        `output/${normalizedSubfolder}/${videoNameWithoutExt}`,
        `temp/${normalizedSubfolder}/${videoNameWithoutExt}`,
        `output/${subfolder}/${videoNameWithoutExt}`,
        `temp/${subfolder}/${videoNameWithoutExt}`,
        // Try without subfolder if not found
        `${file.type || 'output'}//${videoNameWithoutExt}`,
        `output//${videoNameWithoutExt}`,
        `temp//${videoNameWithoutExt}`
      ];

      let matchingImage: IComfyFileInfo | undefined;
      for (const key of searchKeys) {
        matchingImage = imageLookupMap.get(key);
        if (matchingImage) break;
      }

      if (matchingImage) {
        return comfyFileService.createDownloadUrl({
          filename: matchingImage.filename,
          subfolder: matchingImage.subfolder || '',
          type: matchingImage.type || 'output',
          preview: true
        });
      }
    }

    return undefined;
  }, [isInView, file, imageLookupMap]);

  const handleImageLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  const handleImageError = useCallback(() => {
    console.warn(`Failed to load thumbnail for: ${file.filename}`);
    setHasError(true);
    setIsLoaded(true);
  }, [file.filename]);

  return (
    <div
      className="flex items-center space-x-3 p-3 bg-white/20 dark:bg-slate-800/20 backdrop-blur-sm border border-white/20 dark:border-slate-700/20 rounded-xl hover:bg-white/30 dark:hover:bg-slate-700/30 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
      onClick={() => onFileClick(file)}
    >
      <div
        ref={thumbnailRef}
        className="flex-shrink-0 w-12 h-12 bg-white/10 dark:bg-slate-700/30 backdrop-blur-sm border border-white/10 dark:border-slate-600/30 rounded-lg overflow-hidden relative"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {!isInView || hasError ? (
            getFileIcon(file.filename)
          ) : !isLoaded && thumbnailUrl ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : !thumbnailUrl ? (
            getFileIcon(file.filename)
          ) : null}
        </div>

        {thumbnailUrl && !hasError && (
          <img
            src={thumbnailUrl}
            alt={file.filename}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading="lazy"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {file.filename}
        </p>
        <div className="flex items-center space-x-2 mt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
            {file.type}
          </span>
          {file.subfolder && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              • {file.subfolder}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const PromptHistoryContent: React.FC<{
  onClose?: () => void;
  isEmbedded?: boolean;
}> = ({ onClose, isEmbedded = false }) => {
  const { t } = useTranslation();
  const { url: serverUrl } = useConnectionStore();
  const [activeTab, setActiveTab] = useState<'queues' | 'outputs'>('queues');

  // Queue tab states
  const [historyData, setHistoryData] = useState<PromptHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [selectedErrorItem, setSelectedErrorItem] = useState<PromptHistoryItem | null>(null);
  const [isErrorDetailOpen, setIsErrorDetailOpen] = useState(false);

  // Outputs tab states
  const [outputFiles, setOutputFiles] = useState<IComfyFileInfo[]>([]);
  const [allFilesForLookup, setAllFilesForLookup] = useState<IComfyFileInfo[]>([]);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [outputsError, setOutputsError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<IComfyFileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Optimized lookup maps for output results
  // We include ALL files from history (even temp) for lookup purposes
  const imageLookupMap = useMemo(() => {
    const map = new Map<string, IComfyFileInfo>();
    allFilesForLookup.forEach(file => {
      if (isImageFile(file.filename)) {
        const name = file.filename.substring(0, file.filename.lastIndexOf('.'));
        const type = file.type || 'output';
        const subfolder = file.subfolder || '';
        const key = `${type}/${subfolder}/${name}`;
        map.set(key, file);
      }
    });
    return map;
  }, [allFilesForLookup]);

  const comfyFileService = new ComfyFileService(serverUrl);

  const getPreviewFileInfo = () => {
    if (previewFile) return {
      filename: previewFile.filename,
      subfolder: previewFile.subfolder,
      type: previewFile.type
    };
    return null;
  };

  const previewInfo = getPreviewFileInfo();

  useEffect(() => {
    if (activeTab === 'queues') {
      fetchHistory();
    } else {
      loadOutputHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [rawHistory, queueStatus] = await Promise.all([
        ComfyUIService.getAllHistory(100),
        ComfyUIService.getQueueStatus()
      ]);

      const allQueueData = [...queueStatus.queue_pending, ...queueStatus.queue_running];
      PromptTracker.syncWithQueueStatus(allQueueData);

      const historyItems: PromptHistoryItem[] = Object.entries(rawHistory)
        .map(([promptId, data]: [string, any]) => {
          let startTime: number | undefined;
          let successTime: number | undefined;
          let isInterrupted = false;
          let calculatedTimestamp: number | undefined;

          if (data.status && data.status.messages) {
            data.status.messages.forEach((msg: any[]) => {
              const type = msg[0];
              const msgData = msg[1];
              if (type === 'execution_start' || type === 'execution_cached') {
                startTime = msgData.timestamp;
              } else if (type === 'execution_success') {
                successTime = msgData.timestamp;
              } else if (type === 'execution_interrupted') {
                isInterrupted = true;
                if (!startTime) startTime = msgData.timestamp;
              }
            });
          }

          calculatedTimestamp = startTime || successTime;

          if (!calculatedTimestamp) {
            const parsedId = parseInt(promptId.split('-')[0]);
            if (!isNaN(parsedId) && parsedId > 946684800000) {
              calculatedTimestamp = parsedId;
            }
          }

          const timestamp = calculatedTimestamp || 0;

          let duration: number | undefined;
          if (startTime && successTime) {
            duration = successTime - startTime;
          }

          let exception_message = data.exception_message;
          let exception_type = data.exception_type;

          if (data.status && data.status.messages) {
            const executionError = data.status.messages.find(
              (msg: any[]) => msg[0] === 'execution_error'
            );
            if (executionError && executionError[1]) {
              exception_message = executionError[1].exception_message || exception_message;
              exception_type = executionError[1].exception_type || exception_type;
            }
          }

          return {
            promptId,
            timestamp,
            status: data.status || { status_str: 'unknown', completed: false },
            exception_message,
            exception_type,
            workflow: data.workflow,
            outputs: data.outputs,
            rawData: data,
            isInterrupted,
            duration
          };
        });

      const runningItems: PromptHistoryItem[] = queueStatus.queue_running.map((queueItem: any) => {
        const promptId = queueItem[1];
        const parsedId = parseInt(promptId.split('-')[0]);
        const timestamp = (!isNaN(parsedId) && parsedId > 946684800000) ? parsedId : Date.now();

        return {
          promptId,
          timestamp,
          status: { status_str: 'executing', completed: false },
          exception_message: undefined,
          exception_type: undefined,
          workflow: queueItem[2],
          outputs: undefined
        };
      });

      const pendingItems: PromptHistoryItem[] = queueStatus.queue_pending.map((queueItem: any) => {
        const promptId = queueItem[1];
        const parsedId = parseInt(promptId.split('-')[0]);
        const timestamp = (!isNaN(parsedId) && parsedId > 946684800000) ? parsedId : Date.now();

        return {
          promptId,
          timestamp,
          status: { status_str: 'pending', completed: false },
          exception_message: undefined,
          exception_type: undefined,
          workflow: queueItem[2],
          outputs: undefined
        };
      });

      const transformedHistory = [...historyItems, ...runningItems, ...pendingItems]
        .sort((a, b) => {
          const getStatusPriority = (status: string) => {
            if (status === 'pending') return 3;
            if (status === 'executing') return 2;
            return 1;
          };

          const priorityA = getStatusPriority(a.status.status_str);
          const priorityB = getStatusPriority(b.status.status_str);

          if (priorityA !== priorityB) {
            return priorityB - priorityA;
          }

          return b.timestamp - a.timestamp;
        });

      setHistoryData(transformedHistory);
    } catch (error) {
      console.error('Failed to fetch prompt history:', error);
      setError('Failed to load queue. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOutputHistory = async () => {
    setOutputsLoading(true);
    setOutputsError(null);

    try {
      const historyFiles = await comfyFileService.getFilesFromHistory(100);

      const sortedFiles = historyFiles.sort((a, b) => {
        if (typeof a.executionOrder === 'number' && typeof b.executionOrder === 'number') {
          return a.executionOrder - b.executionOrder;
        }

        if (a.lastModified && b.lastModified) {
          return b.lastModified.getTime() - a.lastModified.getTime();
        }

        if (typeof a.executionTimestamp === 'number' && typeof b.executionTimestamp === 'number') {
          return b.executionTimestamp - a.executionTimestamp;
        }

        const extractTimestamp = (filename: string): number => {
          const timestampMatch = filename.match(/(\d{8,10})/);
          if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1]);
            return timestamp.toString().length === 8 ? timestamp * 100 : timestamp;
          }
          return 0;
        };

        const timestampA = extractTimestamp(a.filename);
        const timestampB = extractTimestamp(b.filename);

        if (timestampA && timestampB) {
          return timestampB - timestampA;
        }

        return b.filename.localeCompare(a.filename);
      });

      // Filter out temp files and reverse for newest first
      const filteredFiles = sortedFiles.filter(file => file.type !== 'temp');
      setOutputFiles(filteredFiles.reverse());
      setAllFilesForLookup(historyFiles);

      // Also fetch the complete file list from server to build a better lookup map
      // This matches OutputsGallery behavior and handles thumbnails in temp/ elsewhere
      try {
        const serverFiles = await comfyFileService.listFiles();
        const allImages = [...serverFiles.images, ...serverFiles.files.filter(f => isImageFile(f.filename))];
        setAllFilesForLookup(prev => {
          // Merge history files and server files, keeping unique ones (by path)
          const seen = new Set<string>();
          const combined: IComfyFileInfo[] = [];

          [...prev, ...allImages].forEach(f => {
            const key = `${f.type}/${f.subfolder}/${f.filename}`;
            if (!seen.has(key)) {
              seen.add(key);
              combined.push(f);
            }
          });
          return combined;
        });
      } catch (listErr) {
        console.warn('Failed to fetch full file list for lookup map, relying on history only:', listErr);
      }
    } catch (err) {
      console.error('❌ Failed to load output history:', err);
      setOutputsError('Failed to load output history');
    } finally {
      setOutputsLoading(false);
    }
  };


  const formatTimestamp = (timestamp: number): string => {
    if (timestamp === 0) return 'Old History';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('promptHistory.time.justNow');
    if (diffMins < 60) return t('promptHistory.time.ago', { time: `${diffMins}m` });
    if (diffHours < 24) return t('promptHistory.time.ago', { time: `${diffHours}h` });
    if (diffDays < 7) return t('promptHistory.time.ago', { time: `${diffDays}d` });

    return date.toLocaleDateString();
  };

  const formatDuration = (ms: number): string => {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  const getStatusIcon = (item: PromptHistoryItem, hasException: boolean) => {
    const { status, isInterrupted } = item;

    if (isInterrupted) {
      return <Clock className="h-4 w-4 text-orange-400" />;
    }

    if (hasException || status.status_str === 'error') {
      return <XCircle className="h-4 w-4 text-red-400" />;
    }

    if (status.completed) {
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    }

    if (status.status_str === 'executing') {
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
    }

    return <Clock className="h-4 w-4 text-yellow-400" />;
  };

  const getStatusIndicator = (item: PromptHistoryItem, hasException: boolean) => {
    const { status, isInterrupted } = item;

    if (isInterrupted) {
      return <div className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0 shadow-lg shadow-orange-400/50" title={t('promptHistory.status.interrupted')} />;
    }

    if (hasException || status.status_str === 'error') {
      return <div className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0 shadow-lg shadow-red-400/50" title={t('promptHistory.status.error')} />;
    }

    if (status.completed) {
      return <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0 shadow-lg shadow-green-400/50" title={t('promptHistory.status.completed')} />;
    }

    if (status.status_str === 'executing') {
      return <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse flex-shrink-0 shadow-lg shadow-blue-400/50" title={t('promptHistory.status.executing')} />;
    }

    return <div className="w-3 h-3 rounded-full bg-slate-400 flex-shrink-0 shadow-lg shadow-slate-400/50" title={t('promptHistory.status.pending')} />;
  };

  const getShortPromptId = (promptId: string): string => {
    return promptId.length > 12 ? `${promptId.substring(0, 8)}...${promptId.substring(promptId.length - 4)}` : promptId;
  };

  const getOutputFiles = (outputs: any): IComfyFileInfo[] => {
    if (!outputs) return [];

    const files: IComfyFileInfo[] = [];
    Object.values(outputs).forEach((output: any) => {
      if (output.images) {
        output.images.forEach((img: any) => {
          if (img.filename && img.type !== 'temp') {
            files.push({
              filename: img.filename,
              subfolder: img.subfolder || '',
              type: img.type || 'output'
            });
          }
        });
      }
      if (output.gifs) {
        output.gifs.forEach((gif: any) => {
          if (gif.filename && gif.type !== 'temp') {
            files.push({
              filename: gif.filename,
              subfolder: gif.subfolder || '',
              type: gif.type || 'output'
            });
          }
        });
      }
    });

    return files;
  };

  const toggleOutputsExpansion = (promptId: string) => {
    setExpandedPromptId(expandedPromptId === promptId ? null : promptId);
  };

  const handleOutputFileClick = async (file: IComfyFileInfo) => {
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
      setPreviewError('Failed to load file preview');
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
    const file = outputFiles.find(f => f.filename === filename);
    if (file) {
      handleOutputFileClick(file);
    }
  };

  const handleErrorClick = (item: PromptHistoryItem) => {
    setSelectedErrorItem(item);
    setIsErrorDetailOpen(true);
  };


  return (
    <>
      <div className={`flex flex-col h-full overflow-hidden relative ${isEmbedded ? '' : ''}`}>
        {/* Glassmorphism Header with Tabs */}
        <div className={`relative flex flex-col ${isEmbedded ? 'bg-transparent' : 'bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10'}`}>
          <div className={`flex items-center justify-between ${isEmbedded ? 'p-0 pb-3' : 'p-6 pb-4'}`}>
            <div className="flex items-center space-x-3">
              <Layers className={`${isEmbedded ? 'h-5 w-5' : 'h-6 w-6'} text-violet-400 drop-shadow-sm`} />
              <h2 className={`${isEmbedded ? 'text-lg' : 'text-xl'} font-bold text-slate-900 dark:text-white drop-shadow-sm`}>
                {t('promptHistory.title')}
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={activeTab === 'queues' ? fetchHistory : loadOutputHistory}
                disabled={isLoading || outputsLoading}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${(isLoading || outputsLoading) ? 'animate-spin' : ''}`} />
              </Button>
              {onClose && !isEmbedded && (
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Enhanced Glassmorphism Tabs */}
          <div className={`flex ${isEmbedded ? 'px-0 pb-3' : 'px-6 pb-2'}`}>
            <div className="flex bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border border-white/20 dark:border-slate-600/20 rounded-2xl p-1 shadow-lg w-full">
              <button
                onClick={() => setActiveTab('queues')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ${activeTab === 'queues'
                  ? 'bg-white/30 dark:bg-slate-600/30 text-slate-900 dark:text-white shadow-lg backdrop-blur-sm border border-white/20 dark:border-slate-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/10 dark:hover:bg-slate-700/10'
                  }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>{t('promptHistory.queuesTab')}</span>
                  {historyData.length > 0 && activeTab === 'queues' && (
                    <Badge variant="secondary" className="ml-1 bg-white/20 dark:bg-slate-800/30">
                      {historyData.length}
                    </Badge>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('outputs')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ${activeTab === 'outputs'
                  ? 'bg-white/30 dark:bg-slate-600/30 text-slate-900 dark:text-white shadow-lg backdrop-blur-sm border border-white/20 dark:border-slate-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/10 dark:hover:bg-slate-700/10'
                  }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <ImageIcon className="h-4 w-4" />
                  <span>{t('promptHistory.outputsTab')}</span>
                  {outputFiles.length > 0 && activeTab === 'outputs' && (
                    <Badge variant="secondary" className="ml-1 bg-white/20 dark:bg-slate-800/30">
                      {outputFiles.length}
                    </Badge>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'queues' && (
              <motion.div
                key="queues"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto"
              >
                {isLoading && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto mb-4" />
                      <p className="text-slate-600 dark:text-slate-400">{t('promptHistory.loading')}</p>
                    </div>
                  </div>
                )}

                {error && !isLoading && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-4" />
                      <p className="text-red-400 mb-4">{error}</p>
                      <Button
                        onClick={fetchHistory}
                        variant="outline"
                        size="sm"
                        className="bg-white/10 dark:bg-slate-800/20 backdrop-blur-sm border-white/20 dark:border-slate-700/20 hover:bg-white/20 dark:hover:bg-slate-700/30"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('promptHistory.retry')}
                      </Button>
                    </div>
                  </div>
                )}

                {!isLoading && !error && historyData.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <Clock className="h-8 w-8 text-slate-400 mx-auto mb-4" />
                      <p className="text-slate-600 dark:text-slate-400">{t('promptHistory.empty')}</p>
                    </div>
                  </div>
                )}

                {!isLoading && !error && historyData.length > 0 && (
                  <div className={`${isEmbedded ? 'p-1' : 'p-6'} space-y-4`}>
                    {historyData.map((item) => {
                      const hasException = !!(item.exception_message || item.exception_type);

                      return (
                        <div
                          key={item.promptId}
                          className="p-4 bg-white/10 dark:bg-slate-800/10 backdrop-blur-sm border border-white/20 dark:border-slate-700/20 rounded-xl hover:bg-white/20 dark:hover:bg-slate-700/20 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 flex-1 min-w-0">
                                  {getStatusIcon(item, hasException)}
                                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate flex-1">
                                    {getShortPromptId(item.promptId)}
                                  </span>
                                  {getStatusIndicator(item, hasException)}
                                </div>
                                <div className="flex flex-col items-end ml-3">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                                    {formatTimestamp(item.timestamp)}
                                  </span>
                                  {item.duration !== undefined && (
                                    <span className="text-[9px] text-violet-400/70 font-mono mt-0.5">
                                      {formatDuration(item.duration)}
                                    </span>
                                  )}
                                  {item.isInterrupted && (
                                    <span className="text-[9px] text-orange-400 font-bold mt-0.5">
                                      {t('promptHistory.status.interrupted')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {hasException && (
                                <div
                                  className="p-3 bg-red-500/10 backdrop-blur-sm border border-red-400/20 rounded-lg space-y-3 cursor-pointer hover:bg-red-500/20 transition-colors"
                                  onClick={() => handleErrorClick(item)}
                                  title="Click to view full error details"
                                >
                                  {item.exception_type && (
                                    <div className="flex items-start space-x-2">
                                      <XCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                                      <div className="flex-1">
                                        <div className="font-medium text-red-300 mb-1 text-xs">
                                          {t('promptHistory.errorType')}
                                        </div>
                                        <div className="text-[10px] font-mono bg-red-500/20 px-2 py-1 rounded text-red-200">
                                          {item.exception_type}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {item.exception_message && (
                                    <div className="space-y-2">
                                      <div className="font-medium text-red-300 text-xs">
                                        {t('promptHistory.errorMessage')}
                                      </div>
                                      <div className="text-[10px] text-red-200 font-mono bg-red-500/20 p-2 rounded border-l-2 border-red-400 line-clamp-3">
                                        {item.exception_message}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {item.status.completed && !hasException && item.outputs && (
                                <div className="space-y-2">
                                  <Button
                                    onClick={() => toggleOutputsExpansion(item.promptId)}
                                    variant="ghost"
                                    className={`w-full p-3 backdrop-blur-sm border rounded-lg ${expandedPromptId === item.promptId
                                      ? 'bg-green-500/20 border-green-400/40 shadow-lg shadow-green-500/10'
                                      : 'bg-green-500/10 border-green-400/20 hover:bg-green-500/20'
                                      }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center space-x-2">
                                        <CheckCircle className="h-4 w-4 text-green-400" />
                                        <span className="text-xs text-green-300 font-bold">
                                          {t('promptHistory.generatedFiles', { count: getOutputFiles(item.outputs).length })}
                                        </span>
                                      </div>
                                      <ChevronDown className={`h-4 w-4 text-green-400 ${expandedPromptId === item.promptId ? 'rotate-180' : ''}`} />
                                    </div>
                                  </Button>

                                  {expandedPromptId === item.promptId && (
                                    <div className="grid grid-cols-1 gap-1.5 p-1 pt-0">
                                      {getOutputFiles(item.outputs).map((file, idx) => (
                                        <button
                                          key={`${item.promptId}-${idx}`}
                                          onClick={() => handleOutputFileClick(file)}
                                          className="flex items-center space-x-3 p-2.5 bg-white/5 dark:bg-slate-800/10 border border-white/10 dark:border-slate-700/20 rounded-lg hover:bg-white/10 dark:hover:bg-slate-700/20 transition-colors w-full group"
                                        >
                                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/10 rounded-md group-hover:bg-violet-500/20 transition-colors">
                                            {isImageFile(file.filename) ? (
                                              <ImageIcon className="h-4 w-4 text-blue-400 group-hover:text-blue-300" />
                                            ) : isVideoFile(file.filename) ? (
                                              <Video className="h-4 w-4 text-purple-400 group-hover:text-purple-300" />
                                            ) : (
                                              <FileText className="h-4 w-4 text-slate-400" />
                                            )}
                                          </div>
                                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate text-left flex-1">
                                            {file.filename}
                                          </span>
                                          <Eye className="h-3.5 w-3.5 text-slate-500 group-hover:text-violet-400" />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'outputs' && (
              <motion.div
                key="outputs"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto"
              >
                {outputsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto mb-3" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {t('promptHistory.loadingOutputs')}
                      </p>
                    </div>
                  </div>
                )}

                {outputsError && (
                  <div className="p-4 m-4 bg-red-500/10 backdrop-blur-sm border border-red-400/20 rounded-xl">
                    <p className="text-sm text-red-400">{outputsError}</p>
                    <button
                      onClick={loadOutputHistory}
                      className="mt-2 text-xs text-red-300 hover:underline"
                    >
                      {t('promptHistory.tryAgain')}
                    </button>
                  </div>
                )}

                {!outputsLoading && !outputsError && outputFiles.length === 0 && (
                  <div className="text-center py-12 px-4">
                    <ImageIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                      {t('promptHistory.noOutputHistory')}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('promptHistory.noOutputFiles')}
                    </p>
                  </div>
                )}

                {!outputsLoading && !outputsError && outputFiles.length > 0 && (
                  <div className={`${isEmbedded ? 'p-1' : 'p-6'} space-y-3`}>
                    {outputFiles.slice(0, 20).map((file, index) => (
                      <LazyThumbnail
                        key={`${file.filename}-${index}`}
                        file={file}
                        onFileClick={handleOutputFileClick}
                        imageLookupMap={imageLookupMap}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Error Details Modal */}
      {isErrorDetailOpen && selectedErrorItem && (
        <JsonViewerModal
          isOpen={isErrorDetailOpen}
          onClose={() => setIsErrorDetailOpen(false)}
          title={`Error Details: ${getShortPromptId(selectedErrorItem.promptId)}`}
          data={selectedErrorItem.rawData || selectedErrorItem}
          isCompact={isEmbedded}
        />
      )}


      {/* Consolidated File Preview Modal */}
      {previewInfo && (
        <div style={{ zIndex: 10002 }}>
          <FilePreviewModal
            isOpen={!!previewInfo}
            filename={previewInfo.filename}
            isImage={isImageFile(previewInfo.filename)}
            loading={previewLoading}
            error={previewError || undefined}
            url={previewUrl || undefined}
            onClose={handlePreviewClose}
            onRetry={handlePreviewRetry}
            isCompact={isEmbedded}
          />
        </div>
      )}
    </>
  );
};

export const PromptHistory: React.FC = () => {
  const { isOpen, closePromptHistory } = usePromptHistoryStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden"
          >
            <PromptHistoryContent
              onClose={closePromptHistory}
              isEmbedded={false}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};