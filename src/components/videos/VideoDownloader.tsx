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
            className="text-xs border-white/10 bg-white/5 text-white/40"
          >
            {site}
          </Badge>
        ))}
        {remaining > 0 && (
          <Badge variant="outline" className="text-xs border-white/10 bg-white/5 text-white/20">
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
      {/* Main Background with Dark Theme */}
      <div className="absolute inset-0 bg-[#0b0c0f]" />

      {/* Glassmorphism Background Overlay */}
      <div className="hidden" />

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
        <header className="sticky top-0 z-50 pwa-header bg-[#0b0c0f]/95 backdrop-blur-xl border-b border-white/[0.08] relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="sm"
                className="bg-white/[0.045] border border-white/[0.08] hover:bg-white/[0.08] transition-all h-9 w-9 p-0 flex-shrink-0 rounded-[10px] text-[#c8ccd4]"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-[15px] font-bold text-[#e9ebef] leading-none">
                  {t('videoDownloader.title')}
                </h1>
                <p className="font-mono text-[9px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-1">
                  {t('videoDownloader.subtitle')}
                </p>
              </div>
            </div>
            <Button
              onClick={() => window.open('https://github.com/yt-dlp/yt-dlp#supported-sites', '_blank')}
              variant="outline"
              size="sm"
              className="border-white/10 text-white/60 hover:bg-white/10 hover:text-white h-9 w-9 p-0 rounded-lg flex items-center justify-center transition-transform active:scale-95"
              title={t('videoDownloader.supportedSites')}
            >
              <Globe className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-4 py-5 max-w-4xl space-y-2">
          {/* Server Requirements Card */}
          <Card className="border border-white/[0.08] bg-white/[0.025] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <AlertTriangle className="h-4 w-4 text-[#ffa348]" />
                <span>{t('videoDownloader.requirements')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-[#9aa3b2]">{t('videoDownloader.serverConnection')}</span>
                {isConnected ? (
                  <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {t('common.connected')}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                    <X className="w-3 h-3 mr-1" />
                    {t('common.disconnected')}
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-[#9aa3b2]">{t('videoDownloader.mobileExtension')}</span>
                {isCheckingExtension ? (
                  <Badge variant="outline" className="animate-pulse border-white/10 text-white/40">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {t('gallery.server.checking')}
                  </Badge>
                ) : hasExtension ? (
                  <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {t('gallery.server.available')}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                    <X className="w-3 h-3 mr-1" />
                    {t('gallery.server.notFound')}
                  </Badge>
                )}
              </div>

              {downloadStatus && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[12.5px] text-[#9aa3b2]">{t('videoDownloader.ytDlp')}</span>
                    {downloadStatus.yt_dlp_available && (
                      <Button
                        onClick={handleUpgradeYtDlp}
                        disabled={isUpgrading}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-[#5b8af5] hover:text-[#7ba3f5] hover:bg-[#3069f0]/10"
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
                    <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      v{downloadStatus.yt_dlp_version}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                      <X className="w-3 h-3 mr-1" />
                      {t('common.notConfigured')}
                    </Badge>
                  )}
                </div>
              )}

              {!hasServerRequirements && (
                <div className="p-4 bg-[#ffa348]/10 border border-amber-500/20 rounded-lg">
                  <p className="text-[12px] text-[#ffa348]">
                    {t('videoDownloader.toast.providedUrl')}
                  </p>
                </div>
              )}

              {hasServerRequirements && downloadStatus && !downloadStatus.yt_dlp_available && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-[12px] text-red-700 dark:text-red-300 font-medium mb-2">
                    {t('videoDownloader.ytDlpMissing')}
                  </p>
                  <p className="text-[12px] text-red-600 dark:text-[#f87c7c]">
                    <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">pip install yt-dlp</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {hasServerRequirements && downloadStatus?.yt_dlp_available && (
            <>
              {/* Supported Sites Card */}
              <Card className="border border-white/[0.08] bg-white/[0.025] shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-white/90">
                    <Globe className="h-5 w-5 text-[#9a8af0]" />
                    <span>{t('videoDownloader.supportedSites')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[12px] text-white/40 mb-3">
                    {t('videoDownloader.supportedSitesDesc')}
                  </p>
                  {getSupportedSitesDisplay(downloadStatus.supported_sites)}
                </CardContent>
              </Card>

              {/* Download Form */}
              <Card className="border border-white/[0.08] bg-white/[0.025] shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-white/90">
                    <Download className="h-4 w-4 text-[#5b8af5]" />
                    <span>{t('videoDownloader.downloadVideo')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="space-y-2">
                    <Label htmlFor="video-url" className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase">{t('videoDownloader.videoUrl')}</Label>
                    <Input
                      id="video-url"
                      type="url"
                      placeholder={t('videoDownloader.videoUrlPlaceholder')}
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="h-[42px] px-3 font-mono text-[11.5px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#3069f0]/50"
                    />
                    <p className="text-xs text-white/40">
                      {t('videoDownloader.videoUrlDesc')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-filename" className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase">{t('videoDownloader.filename')}</Label>
                    <Input
                      id="custom-filename"
                      placeholder={t('videoDownloader.filenamePlaceholder')}
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      className="h-[42px] px-3 font-mono text-[11.5px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#3069f0]/50"
                    />
                    <p className="text-xs text-white/40">
                      {t('videoDownloader.filenameDesc')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subfolder" className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase">{t('videoDownloader.subfolder')}</Label>
                    <Input
                      id="subfolder"
                      placeholder={t('videoDownloader.subfolderPlaceholder')}
                      value={subfolder}
                      onChange={(e) => setSubfolder(e.target.value)}
                      className="h-[42px] px-3 font-mono text-[11.5px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#3069f0]/50"
                    />
                    <p className="text-xs text-white/40">
                      {t('videoDownloader.subfolderDesc')}
                    </p>
                  </div>

                  <div className="p-3 bg-[#3069f0]/10 border border-[#3069f0]/20 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Video className="h-4 w-4 text-[#5b8af5]" />
                      <span className="text-[12px] font-medium text-[#7ba3f5]">
                        {t('videoDownloader.downloadInfo')}
                      </span>
                    </div>
                    <ul className="text-xs text-[#7ba3f5]/70 space-y-1">
                      <li>• {t('videoDownloader.infoSave')} <code className="bg-[#3069f0]/20 px-1 rounded text-[#7ba3f5]">{downloadStatus.input_directory}</code></li>
                      <li>• {t('videoDownloader.infoFormat')}</li>
                      <li>• {t('videoDownloader.infoQuality')}</li>
                      <li>• {t('videoDownloader.infoPlayback')}</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleStartDownload}
                    disabled={!videoUrl.trim() || isDownloading}
                    className="w-full h-11 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] text-white text-[13px] font-semibold shadow-[0_2px_12px_rgba(48,105,240,0.3)] active:scale-98 transition-transform duration-75 disabled:opacity-50"
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
                    <Card className="border border-white/[0.08] bg-white/[0.025] shadow-none mt-4">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2 text-[12px] text-white/90">
                          <Video className="h-4 w-4 text-[#5b8af5]" />
                          <span>{t('videoDownloader.downloadProgress')}</span>
                          {isDownloading && (
                            <Loader2 className="w-4 h-4 animate-spin text-[#5b8af5] ml-auto" />
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div
                          ref={logContainerRef}
                          className="max-h-64 overflow-y-auto rounded-lg border border-white/[0.08] p-3 custom-scrollbar" style={{ background: '#08090c' }}
                        >
                          {logMessages.length === 0 ? (
                            <div className="text-xs text-white/20 font-mono">
                              {t('videoDownloader.waitingLogs')}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {logMessages.map((log, index) => (
                                <div
                                  key={index}
                                  className="text-xs font-mono text-white/40 whitespace-pre-wrap break-all"
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