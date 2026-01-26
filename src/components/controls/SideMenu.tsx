import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Settings, Wifi, WifiOff, Server, Download, Upload, RotateCcw, Package, Trash2, HardDrive, FolderOpen, Database, Layers, Video, Link as LinkIcon, Image, Globe, Info } from 'lucide-react';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { CacheService, CacheClearResult, BrowserCapabilities } from '@/services/cacheService';
import { useNavigate } from 'react-router-dom';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onServerSettingsClick: () => void;
  onImportWorkflowsClick: () => void;
  onUploadWorkflowsClick: () => void;
  onServerRebootClick: () => void;
  onModelDownloadClick: () => void;
  onModelBrowserClick: () => void;
  onBrowserDataBackupClick: () => void;
  onWidgetTypeSettingsClick: () => void;
  onVideoDownloadClick: () => void;
  onChainsClick: () => void;
  onGalleryClick: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onServerSettingsClick,
  onImportWorkflowsClick,
  onUploadWorkflowsClick,
  onServerRebootClick,
  onModelDownloadClick,
  onModelBrowserClick,
  onBrowserDataBackupClick,
  onWidgetTypeSettingsClick,
  onVideoDownloadClick,
  onChainsClick,
  onGalleryClick
}) => {
  const { url, isConnected, error, remoteVersion } = useConnectionStore();
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [clearResult, setClearResult] = useState<CacheClearResult | null>(null);
  const [browserCapabilities, setBrowserCapabilities] = useState<BrowserCapabilities | null>(null);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      loadCacheSize();
      setBrowserCapabilities(CacheService.getBrowserCapabilities());
    }
  }, [isOpen]);

  const loadCacheSize = async () => {
    try {
      const size = await CacheService.getTotalCacheSize();
      setCacheSize(size);
    } catch (error) {
      console.warn('Failed to load cache size:', error);
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    setClearResult(null);

    try {
      const result = await CacheService.clearBrowserCaches();
      setClearResult(result);
      setCacheSize(0);

      if (result.success) {
        setTimeout(() => {
          setClearResult(null);
        }, 3000);
      }
    } catch (error) {
      setClearResult({
        success: false,
        clearedCaches: [],
        errors: [error instanceof Error ? error.message : t('common.unknown')],
        totalSize: 0,
        method: t('common.unknown')
      });
    } finally {
      setIsClearing(false);
    }
  };

  const formatUrl = (url: string) => {
    if (!url) return t('common.notConfigured');
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}:${urlObj.port}`;
    } catch {
      return url;
    }
  };

  return typeof document !== 'undefined' ? ReactDOM.createPortal(
    <>
      {/* Side Menu - Full Screen Overlay */}
      <div className={`fixed inset-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xl z-[9999] transition-all duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-6 border-b border-slate-200/50 dark:border-slate-800/50">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t('menu.title')}
          </h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Server Connection Status */}
            <section className="space-y-4">
              <div className="flex items-center space-x-3 text-blue-600 dark:text-blue-400">
                <Server className="h-6 w-6" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('menu.serverConnection')}
                </h3>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {t('common.status')}
                  </span>
                  <div className="flex items-center space-x-2">
                    {isConnected ? (
                      <>
                        <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 px-3 py-1">
                          {t('common.connected')}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <Badge variant="destructive" className="px-3 py-1">
                          {t('common.disconnected')}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {t('workflow.server')} URL
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                    {formatUrl(url)}
                  </span>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </section>

            {/* Menu Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Navigation */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                  {t('menu.navigation')}
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    onClick={onChainsClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mr-4">
                      <LinkIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.chains')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.chainsSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onGalleryClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 dark:text-pink-400 mr-4">
                      <Image className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.gallery')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.gallerySub')}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Server Management */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                  {t('menu.serverMgmt')}
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    onClick={onServerSettingsClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mr-4">
                      <Settings className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.settings')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.settingsSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onServerRebootClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 mr-4">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.reboot')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.rebootSub')}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Workflow Sync */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                  {t('menu.workflowSync')}
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    onClick={onImportWorkflowsClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 mr-4">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.import')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.importSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onUploadWorkflowsClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mr-4">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.upload')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.uploadSub')}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Model Management */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                  {t('menu.models')}
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    onClick={onModelDownloadClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 dark:text-pink-400 mr-4">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.modelDownload')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.modelDownloadSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onModelBrowserClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400 mr-4">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.modelBrowser')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.modelBrowserSub')}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tools */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                  {t('menu.tools')}
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    onClick={onVideoDownloadClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 mr-4">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.videoDownloader')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.videoDownloaderSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onWidgetTypeSettingsClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mr-4">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.nodePatches')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.nodePatchesSub')}</div>
                    </div>
                  </button>
                  <button
                    onClick={onBrowserDataBackupClick}
                    className="w-full flex items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 mr-4">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t('menu.backup')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('menu.backupSub')}</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <Globe className="h-6 w-6" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('menu.language')}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { code: 'en', label: 'English', flag: '🇺🇸' },
                  { code: 'ko', label: '한국어', flag: '🇰🇷' },
                  { code: 'zh', label: '简体中文', flag: '🇨🇳' },
                  { code: 'ja', label: '日本語', flag: '🇯🇵' }
                ].map((lang) => (
                  <Button
                    key={lang.code}
                    variant={i18n.language === lang.code ? "default" : "outline"}
                    className={`justify-start ${i18n.language === lang.code ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-slate-900'}`}
                    onClick={() => i18n.changeLanguage(lang.code)}
                  >
                    <span className="mr-2 text-base">{lang.flag}</span>
                    {lang.label}
                  </Button>
                ))}
              </div>
            </section>

            {/* App Info & Update Section */}
            <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <Info className="h-6 w-6" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('menu.appInfo')}
                </h3>
              </div>

              <Button
                onClick={() => {
                  if (remoteVersion === 'dev' || remoteVersion === '0.0.0') {
                    // In development mode, checking for updates is disabled
                    import('sonner').then(({ toast }) => {
                      toast.info('Update check is disabled in development mode');
                    });
                    return;
                  }
                  onClose();
                  navigate('/update');
                }}
                variant="outline"
                className={`w-full justify-start text-left h-auto py-3 px-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all group ${(remoteVersion === 'dev' || remoteVersion === '0.0.0')
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-purple-50 dark:hover:bg-purple-900/10 hover:border-purple-200 dark:hover:border-purple-800'
                  }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col items-start gap-1">
                    <div className={`font-medium text-slate-900 dark:text-slate-100 ${(remoteVersion === 'dev' || remoteVersion === '0.0.0') ? '' : 'group-hover:text-purple-600 dark:group-hover:text-purple-400'
                      }`}>
                      {t('menu.checkForUpdates')}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {remoteVersion === 'dev' ? 'dev' : `v${remoteVersion || 'Unknown'}`}
                    </div>
                  </div>
                  <Download className={`h-4 w-4 text-slate-400 ${(remoteVersion === 'dev' || remoteVersion === '0.0.0') ? '' : 'group-hover:text-purple-500'
                    }`} />
                </div>
              </Button>
            </section>

            {/* App Cache Section */}
            <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-400">
                <HardDrive className="h-6 w-6" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('menu.cache')}
                </h3>
              </div>

              <div className="p-5 bg-slate-100 dark:bg-slate-900/50 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {t('menu.cacheUsed')}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono">
                    {CacheService.formatCacheSize(cacheSize)}
                  </span>
                </div>

                <Button
                  onClick={handleClearCache}
                  disabled={isClearing}
                  variant="outline"
                  className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  {isClearing ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {t('menu.cacheClearing')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('menu.cacheClear')}
                    </>
                  )}
                </Button>

                {clearResult && (
                  <div className={`text-xs p-2 rounded ${clearResult.success ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-red-600 bg-red-50 dark:bg-red-900/20'}`}>
                    {clearResult.success ? t('menu.cacheSuccess') : t('menu.cacheFailed')}
                  </div>
                )}
              </div>
            </section>

            {/* Footer */}
            <div className="pt-8 text-center space-y-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                {t('menu.appTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {remoteVersion === 'dev' ? 'dev' : t('menu.version', { version: remoteVersion || '0.0.0' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  ) : null;
};

export default SideMenu;