import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Package, Download, X, AlertTriangle, CheckCircle, Loader2, Key, Settings, Trash2, RotateCcw, PlayCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/ui/store/connectionStore';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { getApiKey } from '@/infrastructure/storage/ApiKeyStorageService';
import { useTranslation } from 'react-i18next';

interface ModelFolder {
  name: string;
  path: string;
  full_path: string;
  file_count: number;
  subfolder_count?: number;
  has_subfolders?: boolean;
}

interface DownloadTask {
  id: string;
  filename: string;
  target_folder: string;
  status: 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'retrying';
  progress: number;
  total_size: number;
  downloaded_size: number;
  speed: number;
  eta: number;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error?: string;
  supports_resume?: boolean;
  retry_count?: number;
  max_retries?: number;
  can_resume?: boolean;
}

const ModelDownload: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isConnected, hasExtension, isCheckingExtension } = useConnectionStore();

  // Form state
  const [downloadUrl, setDownloadUrl] = useState('');
  const [targetFolder, setTargetFolder] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  // API data
  const [folders, setFolders] = useState<ModelFolder[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const hasServerRequirements = isConnected && hasExtension;

  const handleBack = () => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/', { replace: true });
  };

  // Load model folders
  const loadModelFolders = async () => {
    if (!hasServerRequirements) return;

    setIsLoadingFolders(true);
    try {
      const response = await ComfyUIService.fetchModelFolders();
      if (response.success) {
        setFolders(response.folders);
      } else {
        toast.error(t('modelDownload.errors.loadFolders'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error loading model folders:', error);
      toast.error(t('modelDownload.errors.loadFolders'), {
        description: t('modelDownload.toast.genericError')
      });
    } finally {
      setIsLoadingFolders(false);
    }
  };

  // Load downloads
  const loadDownloads = async () => {
    if (!hasServerRequirements) return;

    setIsLoadingDownloads(true);
    try {
      const response = await ComfyUIService.fetchDownloads();
      if (response.success) {
        setDownloads(response.downloads as DownloadTask[]);
      } else {
        toast.error(t('modelDownload.errors.loadDownloads'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error loading downloads:', error);
      toast.error(t('modelDownload.errors.loadDownloads'), {
        description: t('modelDownload.toast.genericError')
      });
    } finally {
      setIsLoadingDownloads(false);
    }
  };

  // Start download
  const handleStartDownload = async () => {
    if (!downloadUrl.trim() || !targetFolder.trim()) {
      toast.error(t('modelDownload.toast.missingFields'), {
        description: t('modelDownload.toast.missingFieldsDesc')
      });
      return;
    }

    setIsStartingDownload(true);
    try {
      // Check if this is a Civitai URL and add API key if available
      let finalUrl = downloadUrl.trim();

      if (finalUrl.includes('civitai.com')) {
        const civitaiApiKey = await getApiKey('civitai');

        if (civitaiApiKey) {
          // Add API key to URL if not already present
          if (!finalUrl.includes('token=')) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}token=${civitaiApiKey}`;

            toast.success(t('modelDownload.toast.civitaiKey'), {
              description: t('modelDownload.toast.civitaiKeyDesc')
            });
          }
        } else if (finalUrl.includes('civitai.com')) {
          // Warn about potential authentication issues
          toast.warning(t('modelDownload.toast.civitaiNoKey'), {
            description: t('modelDownload.toast.civitaiNoKeyDesc')
          });
        }
      }

      const response = await ComfyUIService.startModelDownload({
        url: finalUrl,
        target_folder: targetFolder.trim(),
        filename: customFilename.trim() || undefined,
        overwrite
      });

      if (response.success) {
        toast.success(t('modelDownload.toast.started'), {
          description: `Task ID: ${response.task_id}`
        });

        // Reset form
        setDownloadUrl('');
        setCustomFilename('');
        setOverwrite(false);

        // Reload downloads
        await loadDownloads();
      } else {
        toast.error(t('modelDownload.toast.startFailed'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error starting download:', error);
      toast.error('Failed to start download', {
        description: 'Network error or server unavailable'
      });
    } finally {
      setIsStartingDownload(false);
    }
  };

  // Cancel download
  const handleCancelDownload = async (taskId: string) => {
    try {
      const response = await ComfyUIService.cancelDownload(taskId);
      if (response.success) {
        toast.success('Download cancelled', {
          description: response.message
        });
        await loadDownloads();
      } else {
        toast.error(t('modelDownload.toast.cancelFailed'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      toast.error('Failed to cancel download', {
        description: 'Network error or server unavailable'
      });
    }
  };

  // Resume download
  const handleResumeDownload = async (taskId: string) => {
    try {
      const response = await ComfyUIService.resumeDownload(taskId);
      if (response.success) {
        const resumeInfo = response.resume_info;
        const partialSizeMB = resumeInfo?.partial_size_mb || 0;

        toast.success(t('modelDownload.toast.resumed'), {
          description: partialSizeMB > 0
            ? t('modelDownload.toast.resumeDesc', { size: partialSizeMB.toFixed(1) })
            : t('modelDownload.toast.restartDesc')
        });
        await loadDownloads();
      } else {
        toast.error(t('modelDownload.toast.resumeFailed'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error resuming download:', error);
      toast.error(t('modelDownload.toast.resumeFailed'), {
        description: t('modelDownload.toast.genericError')
      });
    }
  };

  // Retry all failed downloads
  const handleRetryAllFailed = async () => {
    try {
      const response = await ComfyUIService.retryAllFailedDownloads();
      if (response.success) {
        const retriedCount = response.retried_count || 0;
        const totalFailed = response.total_failed || 0;

        if (retriedCount > 0) {
          toast.success('Failed downloads retried', {
            description: `${retriedCount}/${totalFailed} downloads restarted`
          });
        } else {
          toast.info('No failed downloads to retry', {
            description: 'All downloads are either completed or in progress'
          });
        }
        await loadDownloads();
      } else {
        toast.error('Failed to retry downloads', {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error retrying failed downloads:', error);
      toast.error('Failed to retry downloads', {
        description: 'Network error or server unavailable'
      });
    }
  };

  const handleClearHistory = async () => {
    if (!confirm(t('modelDownload.confirmClear'))) {
      return;
    }

    setIsClearingHistory(true);
    try {
      const response = await ComfyUIService.clearDownloadHistory();
      if (response.success) {
        toast.success(t('modelDownload.toast.historyCleared'), {
          description: t('modelDownload.toast.historyClearedDesc', { count: response.cleared_count || 0 })
        });
        await loadDownloads();
      } else {
        toast.error('Failed to clear download history', {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error clearing download history:', error);
      toast.error('Failed to clear download history', {
        description: 'Network error or server unavailable'
      });
    } finally {
      setIsClearingHistory(false);
    }
  };

  // Load data on component mount and when server requirements change
  useEffect(() => {
    if (hasServerRequirements) {
      loadModelFolders();
      loadDownloads();
    }
  }, [hasServerRequirements]);

  // Auto-refresh downloads every 5 seconds
  useEffect(() => {
    if (!hasServerRequirements) return;

    const interval = setInterval(() => {
      loadDownloads();
    }, 5000);

    return () => clearInterval(interval);
  }, [hasServerRequirements]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatFileSize(bytesPerSecond) + '/s';
  };

  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

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
        bottom: 0
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
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 pwa-header bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="sm"
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t('modelDownload.title')}
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                  {t('modelDownload.subtitle')}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/settings/api-keys')}
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
              title={t('modelDownload.manageApiKeys')}
            >
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">{t('modelDownload.manageApiKeys')}</span>
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
          {/* Server Requirements Card */}
          <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>{t('modelDownload.serverRequirements')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">ComfyUI Server Connection</span>
                {isConnected ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <X className="w-3 h-3 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">Mobile UI API Extension</span>
                {isCheckingExtension ? (
                  <Badge variant="outline" className="animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Checking...
                  </Badge>
                ) : hasExtension ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Available
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <X className="w-3 h-3 mr-1" />
                    Not Available
                  </Badge>
                )}
              </div>

              {!hasServerRequirements && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('modelDownload.requirementsDesc')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {hasServerRequirements && (
            <>
              {/* Download Form */}
              <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Download className="h-5 w-5 text-blue-500" />
                    <span>{t('modelDownload.startDownload')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="download-url">{t('modelDownload.modelUrl')}</Label>
                    <Input
                      id="download-url"
                      type="url"
                      placeholder={t('modelDownload.modelUrlPlaceholder')}
                      value={downloadUrl}
                      onChange={(e) => setDownloadUrl(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target-folder">{t('modelDownload.targetFolder')}</Label>
                    <Input
                      id="target-folder"
                      placeholder={t('modelDownload.targetFolderPlaceholder')}
                      value={targetFolder}
                      onChange={(e) => setTargetFolder(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                    {isLoadingFolders ? (
                      <p className="text-sm text-slate-500">Loading folders...</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {folders
                          .sort((a, b) => {
                            // Sort by file count descending first (folders with files on top)
                            if (a.file_count !== b.file_count) {
                              return b.file_count - a.file_count;
                            }
                            // Then sort alphabetically by name
                            return a.name.localeCompare(b.name);
                          })
                          .map((folder) => (
                            <Badge
                              key={folder.name}
                              variant="outline"
                              className={`cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${folder.file_count > 0
                                  ? 'border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                                }`}
                              onClick={() => setTargetFolder(folder.name)}
                              title={t('modelDownload.filesTotal', { count: folder.file_count }) + (folder.has_subfolders ? ` ${t('modelDownload.subfolders', { count: folder.subfolder_count || 0 })}` : '')}
                            >
                              {folder.name} ({folder.file_count}
                              {folder.has_subfolders && (
                                <span className="text-xs opacity-75">
                                  +{folder.subfolder_count}📁
                                </span>
                              )})
                            </Badge>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-filename">{t('modelDownload.customFilename')}</Label>
                    <Input
                      id="custom-filename"
                      placeholder={t('modelDownload.customFilenamePlaceholder')}
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="overwrite"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="overwrite" className="text-sm">
                      {t('modelDownload.overwrite')}
                    </Label>
                  </div>

                  <Button
                    onClick={handleStartDownload}
                    disabled={!downloadUrl.trim() || !targetFolder.trim() || isStartingDownload}
                    className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 active:scale-98 transition-transform duration-75"
                  >
                    {isStartingDownload ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('modelDownload.starting')}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {t('modelDownload.start')}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Downloads List */}
              <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Package className="h-5 w-5 text-purple-500" />
                      <span>{t('modelDownload.activeDownloads')}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {downloads.some(d => d.can_resume) && (
                        <Button
                          onClick={handleRetryAllFailed}
                          variant="ghost"
                          size="sm"
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:scale-95 active:bg-amber-100 dark:active:bg-amber-900/30 transition-transform duration-75"
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          <span className="hidden sm:inline">{t('modelDownload.retryAll')}</span>
                        </Button>
                      )}
                      {downloads.length > 0 && (
                        <Button
                          onClick={handleClearHistory}
                          variant="ghost"
                          size="sm"
                          disabled={isClearingHistory}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 active:bg-red-100 dark:active:bg-red-900/30 transition-transform duration-75"
                        >
                          {isClearingHistory ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">{t('modelDownload.clear')}</span>
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        onClick={loadDownloads}
                        variant="ghost"
                        size="sm"
                        className="active:scale-95 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                      >
                        {t('modelDownload.refresh')}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {downloads.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">
                      {t('modelDownload.noDownloads')}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {downloads.map((download) => (
                        <div
                          key={download.id}
                          className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-3"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {download.filename}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                → {download.target_folder}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              {/* Status Icon */}
                              <div className="flex items-center" title={`${download.status}${download.retry_count && download.retry_count > 0 ? ` (${download.retry_count}/${download.max_retries || 3})` : ''}`}>
                                {download.status === 'completed' && (
                                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                                )}
                                {download.status === 'error' && (
                                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                )}
                                {download.status === 'cancelled' && (
                                  <XCircle className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                                )}
                                {['downloading', 'starting'].includes(download.status) && (
                                  <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                )}
                                {download.status === 'retrying' && (
                                  <div className="relative">
                                    <Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-spin" />
                                    {download.retry_count && download.retry_count > 0 && (
                                      <div className="absolute -top-2 -right-1 bg-amber-600 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                                        {download.retry_count}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {['starting', 'downloading', 'retrying'].includes(download.status) && (
                                <Button
                                  onClick={() => handleCancelDownload(download.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0 active:scale-90 active:bg-red-100 dark:active:bg-red-900/30 transition-transform duration-75"
                                  title="Cancel download"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {download.can_resume && (
                                <Button
                                  onClick={() => handleResumeDownload(download.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex-shrink-0 active:scale-90 active:bg-emerald-100 dark:active:bg-emerald-900/30 transition-transform duration-75"
                                  title="Resume download"
                                >
                                  <PlayCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {['downloading', 'retrying'].includes(download.status) && (
                            <div className="space-y-2">
                              <Progress value={download.progress} className="w-full" />
                              <div className="flex justify-between text-xs text-slate-500">
                                <span>
                                  {formatFileSize(download.downloaded_size)} / {formatFileSize(download.total_size)}
                                  {download.progress > 0 && (
                                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                                      {download.progress.toFixed(1)}%
                                    </span>
                                  )}
                                </span>
                                <span>
                                  {download.speed > 0 && (
                                    <>
                                      {formatSpeed(download.speed)}
                                      {download.eta > 0 && (
                                        <> • ETA: {formatETA(download.eta)}</>
                                      )}
                                    </>
                                  )}
                                  {download.status === 'retrying' && (
                                    <span className="text-amber-600 dark:text-amber-400 ml-2">
                                      {t('modelDownload.status.retrying')}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {download.supports_resume && (
                                <div className="text-xs text-green-600 dark:text-green-400">
                                  {t('modelDownload.status.resumable')}
                                </div>
                              )}
                            </div>
                          )}

                          {download.status === 'error' && (
                            <div className="space-y-2">
                              {download.error && (
                                <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
                                  {download.error}
                                </div>
                              )}
                              {download.can_resume && download.downloaded_size > 0 && (
                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-amber-700 dark:text-amber-300">
                                      {t('modelDownload.status.partial', { size: formatFileSize(download.downloaded_size) })}
                                    </span>
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                      {t('modelDownload.status.canResume')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {download.status === 'cancelled' && download.downloaded_size > 0 && (
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-600 dark:text-slate-400">
                              📁 Partial download saved: {formatFileSize(download.downloaded_size)}
                              {download.can_resume && (
                                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                  • Can resume
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelDownload;