import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Video, Download, X, AlertTriangle, CheckCircle, Loader2, Play, ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/ui/store/connectionStore';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import type { LogEntry, LogsWsMessage } from '@/core/domain';

interface VideoDownloadStatus {
  yt_dlp_available: boolean;
  yt_dlp_version: string | null;
  input_directory: string;
  input_writable: boolean;
  supported_sites: string[];
}

interface VideoDownloadResponse {
  success: boolean;
  message: string;
  download_info?: {
    url: string;
    target_directory: string;
    subfolder: string;
    downloaded_file?: string;
    custom_filename?: string;
    details?: string;
  };
  error?: string;
}

const VideoDownloader: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isConnected, hasExtension, isCheckingExtension } = useConnectionStore();

  // Form state
  const [videoUrl, setVideoUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [subfolder, setSubfolder] = useState('');

  // API data
  const [downloadStatus, setDownloadStatus] = useState<VideoDownloadStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Log tracking
  const [logMessages, setLogMessages] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [isDownloadActive, setIsDownloadActive] = useState(false);

  const hasServerRequirements = isConnected && hasExtension;

  const handleBack = () => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/', { replace: true });
  };

  // Listen to log events
  useEffect(() => {
    const handleLogsMessage = (event: any) => {
      // Only process logs when download is active
      if (!isDownloadActive) {
        return;
      }

      const logsData: LogsWsMessage = event.data || event;

      if (logsData.entries && logsData.entries.length > 0) {
        setLogMessages(prev => [...prev, ...logsData.entries]);

        // Auto-scroll to bottom
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 10);
      }
    };

    // Listen to logs WebSocket event (already subscribed globally)
    ComfyUIService.on('logs', handleLogsMessage);

    return () => {
      // Remove event listener on unmount
      ComfyUIService.off('logs', handleLogsMessage);
    };
  }, [isDownloadActive]);

  // Load video download status
  const loadDownloadStatus = async () => {
    if (!hasServerRequirements) return;

    setIsLoadingStatus(true);
    try {
      const response = await ComfyUIService.getVideoDownloadStatus();

      if (response.success) {
        setDownloadStatus(response.status);
      } else {
        toast.error(t('videoDownloader.toast.failed'), {
          description: response.error
        });
      }
    } catch (error) {
      console.error('Error loading video download status:', error);
      toast.error(t('videoDownloader.toast.failed'), {
        description: t('common.error')
      });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Start video download
  const handleStartDownload = async () => {
    if (!videoUrl.trim()) {
      toast.error(t('videoDownloader.toast.missingUrl'), {
        description: t('videoDownloader.toast.provideUrl')
      });
      return;
    }

    setIsDownloading(true);
    setIsDownloadActive(true);
    setLogMessages([]); // Clear previous logs

    // Subscribe to logs before starting download (safe to call multiple times)
    try {
      await ComfyUIService.subscribeToLogsManually();
    } catch (error) {
      console.error('[VideoDownloader] Failed to subscribe to logs:', error);
    }

    try {
      const requestParams: any = {
        url: videoUrl.trim()
      };

      if (customFilename.trim()) {
        requestParams.filename = customFilename.trim();
      }

      if (subfolder.trim()) {
        requestParams.subfolder = subfolder.trim();
      }

      const response = await ComfyUIService.downloadVideo(requestParams);

      if (response.success) {
        toast.success(t('videoDownloader.toast.success'), {
          description: response.download_info?.downloaded_file
            ? t('videoDownloader.toast.savedAs', { file: response.download_info.downloaded_file })
            : response.message
        });

        // Reset form after a delay
        setTimeout(() => {
          setVideoUrl('');
          setCustomFilename('');
          setSubfolder('');
          setIsDownloadActive(false);
          // Keep logs visible for a bit
          setTimeout(() => setLogMessages([]), 3000);
        }, 2000);
      } else {
        setIsDownloadActive(false);
        toast.error(t('videoDownloader.toast.failed'), {
          description: response.error || response.message
        });
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      setIsDownloadActive(false);
      toast.error(t('videoDownloader.toast.failed'), {
        description: t('common.error')
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Upgrade yt-dlp to latest version
  const handleUpgradeYtDlp = async () => {
    setIsUpgrading(true);
    try {
      const response = await ComfyUIService.upgradeYtDlp();

      if (response.success) {
        toast.success(t('videoDownloader.toast.upgradeSuccess'), {
          description: t('videoDownloader.toast.updatedVersion', { version: response.new_version })
        });

        // Reload status to show new version
        await loadDownloadStatus();
      } else {
        toast.error(t('videoDownloader.toast.upgradeFailed'), {
          description: response.error || response.message
        });
      }
    } catch (error) {
      console.error('Error upgrading yt-dlp:', error);
      toast.error(t('videoDownloader.toast.upgradeFailed'), {
        description: t('common.error')
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  // Load data on component mount and when server requirements change
  useEffect(() => {
    if (hasServerRequirements) {
      loadDownloadStatus();
    }
  }, [hasServerRequirements]);

  const getSupportedSitesDisplay = (sites: string[]) => {
    const mainSites = sites.slice(0, 8);
    const remaining = sites.length - mainSites.length;

    return (
      <div className="flex flex-wrap gap-1">
        {mainSites.map((site) => (
          <Badge
            key={site}
            variant="outline"
            className="text-xs border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"
          >
            {site}
          </Badge>
        ))}
        {remaining > 0 && (
          <Badge variant="outline" className="text-xs">
            {t('node.more', { count: remaining })}
          </Badge>
        )}
      </div>
    );
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
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />

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
                  {t('videoDownloader.title')}
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                  {t('videoDownloader.subtitle')}
                </p>
              </div>
            </div>
            <Button
              onClick={() => window.open('https://github.com/yt-dlp/yt-dlp#supported-sites', '_blank')}
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
              title={t('videoDownloader.supportedSites')}
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">{t('videoDownloader.supportedSites')}</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
          {/* Server Requirements Card */}
          <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>{t('videoDownloader.requirements')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t('videoDownloader.serverConnection')}</span>
                {isConnected ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {t('common.connected')}
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <X className="w-3 h-3 mr-1" />
                    {t('common.disconnected')}
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">{t('videoDownloader.mobileExtension')}</span>
                {isCheckingExtension ? (
                  <Badge variant="outline" className="animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {t('gallery.server.checking')}
                  </Badge>
                ) : hasExtension ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {t('gallery.server.available')}
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <X className="w-3 h-3 mr-1" />
                    {t('gallery.server.notFound')}
                  </Badge>
                )}
              </div>

              {downloadStatus && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{t('videoDownloader.ytDlp')}</span>
                    {downloadStatus.yt_dlp_available && (
                      <Button
                        onClick={handleUpgradeYtDlp}
                        disabled={isUpgrading}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20"
                        title={t('videoDownloader.upgradeYtDlp')}
                      >
                        {isUpgrading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  {downloadStatus.yt_dlp_available ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      v{downloadStatus.yt_dlp_version}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <X className="w-3 h-3 mr-1" />
                      {t('common.notConfigured')}
                    </Badge>
                  )}
                </div>
              )}

              {!hasServerRequirements && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('videoDownloader.toast.providedUrl')}
                  </p>
                </div>
              )}

              {hasServerRequirements && downloadStatus && !downloadStatus.yt_dlp_available && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
                    {t('videoDownloader.ytDlpMissing')}
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">pip install yt-dlp</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {hasServerRequirements && downloadStatus?.yt_dlp_available && (
            <>
              {/* Supported Sites Card */}
              <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="h-5 w-5 text-purple-500" />
                    <span>{t('videoDownloader.supportedSites')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    {t('videoDownloader.supportedSitesDesc')}
                  </p>
                  {getSupportedSitesDisplay(downloadStatus.supported_sites)}
                </CardContent>
              </Card>

              {/* Download Form */}
              <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Download className="h-5 w-5 text-blue-500" />
                    <span>{t('videoDownloader.downloadVideo')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="video-url">{t('videoDownloader.videoUrl')}</Label>
                    <Input
                      id="video-url"
                      type="url"
                      placeholder={t('videoDownloader.videoUrlPlaceholder')}
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                    <p className="text-xs text-slate-500">
                      {t('videoDownloader.videoUrlDesc')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-filename">{t('videoDownloader.filename')}</Label>
                    <Input
                      id="custom-filename"
                      placeholder={t('videoDownloader.filenamePlaceholder')}
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                    <p className="text-xs text-slate-500">
                      {t('videoDownloader.filenameDesc')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subfolder">{t('videoDownloader.subfolder')}</Label>
                    <Input
                      id="subfolder"
                      placeholder={t('videoDownloader.subfolderPlaceholder')}
                      value={subfolder}
                      onChange={(e) => setSubfolder(e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                    <p className="text-xs text-slate-500">
                      {t('videoDownloader.subfolderDesc')}
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Video className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {t('videoDownloader.downloadInfo')}
                      </span>
                    </div>
                    <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                      <li>• {t('videoDownloader.infoSave')} <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">{downloadStatus.input_directory}</code></li>
                      <li>• {t('videoDownloader.infoFormat')}</li>
                      <li>• {t('videoDownloader.infoQuality')}</li>
                      <li>• {t('videoDownloader.infoPlayback')}</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleStartDownload}
                    disabled={!videoUrl.trim() || isDownloading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 active:scale-98 transition-transform duration-75"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('videoDownloader.downloading')}
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        {t('videoDownloader.downloadVideo')}
                      </>
                    )}
                  </Button>

                  {/* Log Display - Only shown when download is active or has logs */}
                  {(isDownloadActive || logMessages.length > 0) && (
                    <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2 text-sm">
                          <Video className="h-4 w-4 text-blue-500" />
                          <span>{t('videoDownloader.downloadProgress')}</span>
                          {isDownloading && (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500 ml-auto" />
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div
                          ref={logContainerRef}
                          className="max-h-64 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 rounded-md p-3"
                        >
                          {logMessages.length === 0 ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {t('videoDownloader.waitingLogs')}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {logMessages.map((log, index) => (
                                <div
                                  key={index}
                                  className="text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-all"
                                >
                                  {log.m}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
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

export default VideoDownloader;