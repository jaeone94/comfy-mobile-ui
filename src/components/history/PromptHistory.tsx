import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Eye, Image as ImageIcon, Video, FileText, Layers } from 'lucide-react';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { usePromptHistoryStore } from '@/ui/store/promptHistoryStore';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { JsonViewerModal } from '@/components/modals/JsonViewerModal';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { PromptTracker } from '@/utils/promptTracker';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { motion, AnimatePresence } from 'framer-motion';

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
}

interface LazyThumbnailProps {
  file: IComfyFileInfo;
  onFileClick: (file: IComfyFileInfo) => void;
}

const LazyThumbnail: React.FC<LazyThumbnailProps> = ({ file, onFileClick }) => {
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

  const isImageFile = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
  };

  const isVideoFile = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext);
  };

  const getFileIcon = (filename: string) => {
    if (isImageFile(filename)) {
      return <ImageIcon className="h-4 w-4 text-blue-400" />;
    } else if (isVideoFile(filename)) {
      return <Video className="h-4 w-4 text-purple-400" />;
    } else {
      return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const thumbnailUrl = isInView && isImageFile(file.filename)
    ? comfyFileService.createDownloadUrl({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type,
      preview: true
    })
    : undefined;

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
          ) : (
            getFileIcon(file.filename)
          )}
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

export const PromptHistory: React.FC = () => {
  const { isOpen, closePromptHistory } = usePromptHistoryStore();
  const { url: serverUrl } = useConnectionStore();
  const [activeTab, setActiveTab] = useState<'queues' | 'outputs'>('queues');

  // Queue tab states
  const [historyData, setHistoryData] = useState<PromptHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [selectedErrorItem, setSelectedErrorItem] = useState<PromptHistoryItem | null>(null);
  const [isErrorDetailOpen, setIsErrorDetailOpen] = useState(false);

  // Outputs tab states
  const [outputFiles, setOutputFiles] = useState<IComfyFileInfo[]>([]);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [outputsError, setOutputsError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<IComfyFileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const comfyFileService = new ComfyFileService(serverUrl);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'queues') {
        fetchHistory();
      } else {
        loadOutputHistory();
      }
    }
  }, [isOpen, activeTab]);

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
          const timestamp = parseInt(promptId.split('-')[0]) || Date.now();

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
            rawData: data
          };
        });

      const runningItems: PromptHistoryItem[] = queueStatus.queue_running.map((queueItem: any) => {
        const promptId = queueItem[1];
        const timestamp = parseInt(promptId.split('-')[0]) || Date.now();

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
        const timestamp = parseInt(promptId.split('-')[0]) || Date.now();

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
      const historyFiles = await comfyFileService.getFilesFromHistory(20);

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
    } catch (err) {
      console.error('❌ Failed to load output history:', err);
      setOutputsError('Failed to load output history');
    } finally {
      setOutputsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: PromptHistoryItem['status'], hasException: boolean) => {
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

  const getStatusIndicator = (status: PromptHistoryItem['status'], hasException: boolean) => {
    if (hasException || status.status_str === 'error') {
      return <div className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0 shadow-lg shadow-red-400/50" title="Error" />;
    }

    if (status.completed) {
      return <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0 shadow-lg shadow-green-400/50" title="Completed" />;
    }

    if (status.status_str === 'executing') {
      return <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse flex-shrink-0 shadow-lg shadow-blue-400/50" title="Running" />;
    }

    return <div className="w-3 h-3 rounded-full bg-slate-400 flex-shrink-0 shadow-lg shadow-slate-400/50" title="Pending" />;
  };

  const getShortPromptId = (promptId: string): string => {
    return promptId.length > 12 ? `${promptId.substring(0, 8)}...${promptId.substring(promptId.length - 4)}` : promptId;
  };

  const getOutputFiles = (outputs: any): any[] => {
    if (!outputs) return [];

    const files: any[] = [];
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

  const handleViewOutputs = (outputs: any) => {
    const files = getOutputFiles(outputs);
    if (files.length > 0) {
      setSelectedFiles(files);
      setPreviewFileIndex(0);
      setIsFilesModalOpen(true);
    }
  };

  const handleFilePreview = (file: any) => {
    const fileIndex = selectedFiles.findIndex(f => f.filename === file.filename);
    if (fileIndex >= 0) {
      setPreviewFileIndex(fileIndex);
      setIsPreviewOpen(true);
    }
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

  const isVideoFile = (filename: string): boolean => {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.gif'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* Enhanced Glassmorphism Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md z-[9999] pwa-modal"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999
        }}
      >
        {/* Full Screen Enhanced Glassmorphism Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 flex items-center justify-center p-4 pwa-modal"
        >
          <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
            {/* Glassmorphism Header with Tabs */}
            <div className="relative flex flex-col bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center space-x-3">
                  <Layers className="h-6 w-6 text-violet-400 drop-shadow-sm" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                    Queue & Outputs
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
                  <Button
                    onClick={closePromptHistory}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Enhanced Glassmorphism Tabs */}
              <div className="flex px-6 pb-2">
                <div className="flex bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border border-white/20 dark:border-slate-600/20 rounded-2xl p-1 shadow-lg">
                  <button
                    onClick={() => setActiveTab('queues')}
                    className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ${activeTab === 'queues'
                      ? 'bg-white/30 dark:bg-slate-600/30 text-slate-900 dark:text-white shadow-lg backdrop-blur-sm border border-white/20 dark:border-slate-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/10 dark:hover:bg-slate-700/10'
                      }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4" />
                      <span>Queues</span>
                      {historyData.length > 0 && activeTab === 'queues' && (
                        <Badge variant="secondary" className="ml-1 bg-white/20 dark:bg-slate-800/30">
                          {historyData.length}
                        </Badge>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('outputs')}
                    className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300 ${activeTab === 'outputs'
                      ? 'bg-white/30 dark:bg-slate-600/30 text-slate-900 dark:text-white shadow-lg backdrop-blur-sm border border-white/20 dark:border-slate-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/10 dark:hover:bg-slate-700/10'
                      }`}
                  >
                    <div className="flex items-center space-x-2">
                      <ImageIcon className="h-4 w-4" />
                      <span>Outputs</span>
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
                          <p className="text-slate-600 dark:text-slate-400">Loading queue...</p>
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
                            Retry
                          </Button>
                        </div>
                      </div>
                    )}

                    {!isLoading && !error && historyData.length === 0 && (
                      <div className="flex-1 flex items-center justify-center py-12">
                        <div className="text-center">
                          <Clock className="h-8 w-8 text-slate-400 mx-auto mb-4" />
                          <p className="text-slate-600 dark:text-slate-400">No queue items found</p>
                        </div>
                      </div>
                    )}

                    {!isLoading && !error && historyData.length > 0 && (
                      <div className="p-6 space-y-4">
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
                                      {getStatusIcon(item.status, hasException)}
                                      <span className="font-mono text-sm text-slate-700 dark:text-slate-300 truncate flex-1">
                                        {getShortPromptId(item.promptId)}
                                      </span>
                                      {getStatusIndicator(item.status, hasException)}
                                    </div>
                                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-3 flex-shrink-0">
                                      {formatTimestamp(item.timestamp)}
                                    </span>
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
                                            <div className="font-medium text-red-300 mb-1">
                                              Error Type (Click for details)
                                            </div>
                                            <div className="text-sm font-mono bg-red-500/20 px-2 py-1 rounded text-red-200">
                                              {item.exception_type}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {item.exception_message && (
                                        <div className="space-y-2">
                                          <div className="font-medium text-red-300 text-sm">
                                            Error Message
                                          </div>
                                          <div className="text-sm text-red-200 font-mono bg-red-500/20 p-2 rounded border-l-2 border-red-400">
                                            {item.exception_message}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {item.status.completed && !hasException && item.outputs && (
                                    <Button
                                      onClick={() => handleViewOutputs(item.outputs)}
                                      variant="ghost"
                                      className="w-full p-3 bg-green-500/10 backdrop-blur-sm border border-green-400/20 rounded-lg hover:bg-green-500/20 transition-colors"
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center space-x-2">
                                          <CheckCircle className="h-4 w-4 text-green-400" />
                                          <span className="text-sm text-green-300">
                                            Generated {getOutputFiles(item.outputs).length} file(s)
                                          </span>
                                        </div>
                                        <Eye className="h-4 w-4 text-green-400" />
                                      </div>
                                    </Button>
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
                            Loading output history...
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
                          Try again
                        </button>
                      </div>
                    )}

                    {!outputsLoading && !outputsError && outputFiles.length === 0 && (
                      <div className="text-center py-12 px-4">
                        <ImageIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                          No Output History
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          No output files found in the current session
                        </p>
                      </div>
                    )}

                    {!outputsLoading && !outputsError && outputFiles.length > 0 && (
                      <div className="p-6 space-y-3">
                        {outputFiles.map((file, index) => (
                          <LazyThumbnail
                            key={`${file.filename}-${index}`}
                            file={file}
                            onFileClick={handleOutputFileClick}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Error Details Modal */}
      {isErrorDetailOpen && selectedErrorItem && (
        <JsonViewerModal
          isOpen={isErrorDetailOpen}
          onClose={() => setIsErrorDetailOpen(false)}
          title={`Error Details: ${getShortPromptId(selectedErrorItem.promptId)}`}
          data={selectedErrorItem.rawData || selectedErrorItem}
        />
      )}

      {/* Enhanced Glassmorphism Files List Modal */}
      {isFilesModalOpen && selectedFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pwa-modal"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/20 dark:border-slate-700/20 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
          >
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

            <div className="relative flex items-center justify-between p-6 border-b border-white/10 dark:border-slate-700/10 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 drop-shadow-sm">
                Generated Files ({selectedFiles.length})
              </h3>
              <Button
                onClick={() => setIsFilesModalOpen(false)}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-3">
                {selectedFiles.map((file, index) => (
                  <Button
                    key={index}
                    onClick={() => handleFilePreview(file)}
                    variant="outline"
                    className="p-4 h-auto flex items-center space-x-3 bg-white/20 dark:bg-slate-800/20 backdrop-blur-sm border border-white/20 dark:border-slate-700/20 rounded-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                  >
                    <Eye className="h-5 w-5 text-violet-400" />
                    <span className="text-left flex-1 truncate text-slate-900 dark:text-slate-100">{file.filename}</span>
                  </Button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* File Preview Modal for Queue outputs */}
      {isPreviewOpen && selectedFiles.length > 0 && selectedFiles[previewFileIndex] && (
        <div style={{ zIndex: 10002 }}>
          <FilePreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            filename={selectedFiles[previewFileIndex].filename}
            isImage={isImageFile(selectedFiles[previewFileIndex].filename)}
            url={comfyFileService.createDownloadUrl({
              filename: selectedFiles[previewFileIndex].filename,
              subfolder: selectedFiles[previewFileIndex].subfolder,
              type: selectedFiles[previewFileIndex].type
            })}
            onRetry={(filename) => {
              const file = selectedFiles.find(f => f.filename === filename);
              if (file) handleFilePreview(file);
            }}
            fileType={isVideoFile(selectedFiles[previewFileIndex].filename) ? 'video' : isImageFile(selectedFiles[previewFileIndex].filename) ? 'image' : 'unknown'}
            loading={false}
          />
        </div>
      )}

      {/* File Preview Modal for Outputs tab */}
      {previewFile && (
        <div style={{ zIndex: 10002 }}>
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
        </div>
      )}
    </AnimatePresence>
  );
};