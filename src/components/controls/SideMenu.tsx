import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { X, Settings, Download, Upload, RotateCcw, Package, Trash2, FolderOpen, Database, Layers, Video, Link as LinkIcon, Image, ChevronRight, ChevronDown, Check, KeyRound } from 'lucide-react';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { CacheService, CacheClearResult, BrowserCapabilities } from '@/services/cacheService';
import { useNavigate } from 'react-router-dom';
import { useLatentPreviewStore, PreviewMethod } from '@/ui/store/latentPreviewStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onServerSettingsClick: () => void;
  onApiKeysClick: () => void;
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

// Design-spec section tints (icon tile bg + icon color per section)
const TINT = {
  nav: { bg: 'rgba(61,123,253,.1)', fg: '#5b8af5' },
  mgmt: { bg: 'rgba(154,123,240,.1)', fg: '#9a8af0' },
  sync: { bg: 'rgba(79,184,186,.12)', fg: '#56bfc1' },
  models: { bg: 'rgba(240,171,82,.1)', fg: '#e0a860' },
  tools: { bg: 'rgba(122,167,232,.09)', fg: '#8fa8d8' },
  old: { bg: 'rgba(255,255,255,.05)', fg: '#8a919e' },
} as const;

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-mono text-[10px] font-semibold text-[#565d6b] tracking-[0.14em] mb-[9px] uppercase whitespace-nowrap">
    {children}
  </div>
);

const GroupCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`border border-white/[0.08] rounded-xl overflow-hidden ${className}`}
    style={{ background: 'rgba(255,255,255,0.025)' }}
  >
    {children}
  </div>
);

const MenuRow: React.FC<{
  icon: React.ReactNode;
  tint: { bg: string; fg: string };
  label: string;
  sub?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  divider?: boolean;
}> = ({ icon, tint, label, sub, onClick, trailing, divider = true }) => {
  const content = (
    <>
      <span
        className="w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[13.5px] font-semibold leading-[1.3] text-[#e9ebef] truncate">{label}</span>
        {sub && <span className="block text-[11px] leading-[1.3] text-[#66758a] mt-0.5 truncate">{sub}</span>}
      </span>
      {trailing ?? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#4a5261]" strokeWidth={2} />}
    </>
  );
  const cls = `w-full h-[58px] flex items-center gap-3 px-3.5 ${divider ? 'border-b border-white/[0.05]' : ''} ${onClick ? 'active:bg-white/[0.03] transition-colors' : ''}`;
  return onClick ? (
    <button onClick={onClick} className={cls}>{content}</button>
  ) : (
    <div className={cls}>{content}</div>
  );
};

const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onServerSettingsClick,
  onApiKeysClick,
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
  const [, setBrowserCapabilities] = useState<BrowserCapabilities | null>(null);
  const [isOldOpen, setIsOldOpen] = useState(true);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { previewMethod, setPreviewMethod } = useLatentPreviewStore();

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

  const updatesDisabled = remoteVersion === 'dev' || remoteVersion === '0.0.0';

  return typeof document !== 'undefined' ? ReactDOM.createPortal(
    <>
      {/* Side Menu - Full Screen Overlay */}
      <div
        className={`fixed inset-0 z-[9999] transition-all duration-300 ease-out flex flex-col text-[#e9ebef] ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}`}
        style={{ background: '#0b0c0f' }}
      >
        {/* Header (56px) */}
        <div className="flex-none h-14 flex items-center justify-between px-[18px] border-b border-white/[0.08]">
          <h2 className="text-[17px] font-bold leading-none">{t('menu.title')}</h2>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-[10px] border border-white/[0.08] flex items-center justify-center text-[#c8ccd4] hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.045)' }}
          >
            <X className="w-[15px] h-[15px]" strokeWidth={1.9} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-[18px]">
            {/* SERVER */}
            <div>
              <SectionLabel>{t('menu.serverConnection')}</SectionLabel>
              <GroupCard className="px-3.5">
                <div className="h-[42px] flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#c8ccd4]">{t('common.status')}</span>
                  {isConnected ? (
                    <span
                      className="flex items-center gap-[7px] px-2.5 py-[5px] rounded-lg border text-[11.5px] font-semibold"
                      style={{ background: 'rgba(52,199,123,.12)', borderColor: 'rgba(52,199,123,.28)', color: '#4ade80' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                      {t('common.connected')}
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-[7px] px-2.5 py-[5px] rounded-lg border text-[11.5px] font-semibold"
                      style={{ background: 'rgba(242,85,85,.12)', borderColor: 'rgba(242,85,85,.3)', color: '#f87c7c' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f25555]" />
                      {t('common.disconnected')}
                    </span>
                  )}
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="h-[42px] flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-[#c8ccd4] shrink-0">{t('workflow.server')} URL</span>
                  <span
                    className="font-mono text-[11.5px] text-[#8a919e] px-[9px] py-[5px] rounded-[7px] border border-white/[0.07] truncate"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    {formatUrl(url)}
                  </span>
                </div>
                {error && (
                  <div className="mb-2.5 rounded-[10px] border border-[#f25555]/30 bg-[#f25555]/10 px-3 py-2 text-[11.5px] text-[#f87c7c]">
                    {error}
                  </div>
                )}
              </GroupCard>
            </div>

            {/* NAVIGATION */}
            <div>
              <SectionLabel>{t('menu.navigation')}</SectionLabel>
              <GroupCard>
                <MenuRow
                  icon={<Image className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.nav}
                  label={t('menu.gallery')}
                  sub={t('menu.gallerySub')}
                  onClick={onGalleryClick}
                  divider={false}
                />
              </GroupCard>
            </div>

            {/* SERVER MANAGEMENT */}
            <div>
              <SectionLabel>{t('menu.serverMgmt')}</SectionLabel>
              <GroupCard>
                <MenuRow
                  icon={<Settings className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.mgmt}
                  label={t('menu.settings')}
                  sub={t('menu.settingsSub')}
                  onClick={onServerSettingsClick}
                />
                <MenuRow
                  icon={<KeyRound className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.mgmt}
                  label={t('menu.apiKeys')}
                  sub={t('menu.apiKeysSub')}
                  onClick={onApiKeysClick}
                />
                <MenuRow
                  icon={<RotateCcw className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.mgmt}
                  label={t('menu.reboot')}
                  sub={t('menu.rebootSub')}
                  onClick={onServerRebootClick}
                />
                <MenuRow
                  icon={<Image className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.mgmt}
                  label={t('latentPreview.title')}
                  sub={t('latentPreview.mode')}
                  divider={false}
                  trailing={
                    <Select
                      value={previewMethod}
                      onValueChange={(value) => setPreviewMethod(value as PreviewMethod)}
                    >
                      <SelectTrigger
                        className="h-8 w-[110px] rounded-lg border-white/[0.08] text-[11.5px] text-[#c8ccd4] shadow-none dark:bg-transparent"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="z-[10001]">
                        <SelectItem value="none">{t('latentPreview.methods.none')}</SelectItem>
                        <SelectItem value="auto">{t('latentPreview.methods.auto')}</SelectItem>
                        <SelectItem value="latent2rgb">{t('latentPreview.methods.fast')}</SelectItem>
                        <SelectItem value="taesd">{t('latentPreview.methods.slow')}</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              </GroupCard>
            </div>

            {/* WORKFLOW SYNC */}
            <div>
              <SectionLabel>{t('menu.workflowSync')}</SectionLabel>
              <GroupCard>
                <MenuRow
                  icon={<Download className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.sync}
                  label={t('menu.import')}
                  sub={t('menu.importSub')}
                  onClick={onImportWorkflowsClick}
                />
                <MenuRow
                  icon={<Upload className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.sync}
                  label={t('menu.upload')}
                  sub={t('menu.uploadSub')}
                  onClick={onUploadWorkflowsClick}
                  divider={false}
                />
              </GroupCard>
            </div>

            {/* MODELS */}
            <div>
              <SectionLabel>{t('menu.models')}</SectionLabel>
              <GroupCard>
                <MenuRow
                  icon={<Package className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.models}
                  label={t('menu.modelDownload')}
                  sub={t('menu.modelDownloadSub')}
                  onClick={onModelDownloadClick}
                />
                <MenuRow
                  icon={<FolderOpen className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.models}
                  label={t('menu.modelBrowser')}
                  sub={t('menu.modelBrowserSub')}
                  onClick={onModelBrowserClick}
                  divider={false}
                />
              </GroupCard>
            </div>

            {/* TOOLS */}
            <div>
              <SectionLabel>{t('menu.tools')}</SectionLabel>
              <GroupCard>
                <MenuRow
                  icon={<Video className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.tools}
                  label={t('menu.videoDownloader')}
                  sub={t('menu.videoDownloaderSub')}
                  onClick={onVideoDownloadClick}
                />
                <MenuRow
                  icon={<Database className="w-4 h-4" strokeWidth={1.8} />}
                  tint={TINT.tools}
                  label={t('menu.backup')}
                  sub={t('menu.backupSub')}
                  onClick={onBrowserDataBackupClick}
                  divider={false}
                />
              </GroupCard>
            </div>

            {/* OLD (legacy features, collapsed by default) */}
            <div>
              <button
                onClick={() => setIsOldOpen((v) => !v)}
                className="w-full flex items-center gap-2 mb-[9px]"
              >
                <span className="font-mono text-[10px] font-semibold text-[#565d6b] tracking-[0.14em] uppercase">OLD</span>
                <span className="flex-1 h-px bg-white/[0.06]" />
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#565d6b] transition-transform duration-200 ${isOldOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                />
              </button>
              {isOldOpen && (
                <GroupCard>
                  <MenuRow
                    icon={<LinkIcon className="w-4 h-4" strokeWidth={1.8} />}
                    tint={TINT.old}
                    label={t('menu.chains')}
                    sub={t('menu.chainsSub')}
                    onClick={onChainsClick}
                  />
                  <MenuRow
                    icon={<Layers className="w-4 h-4" strokeWidth={1.8} />}
                    tint={TINT.old}
                    label={t('menu.nodePatches')}
                    sub={t('menu.nodePatchesSub')}
                    onClick={onWidgetTypeSettingsClick}
                    divider={false}
                  />
                </GroupCard>
              )}
            </div>

            {/* LANGUAGE */}
            <div>
              <SectionLabel>{t('menu.language')}</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { code: 'en', label: 'English' },
                  { code: 'ko', label: '한국어' },
                  { code: 'zh', label: '简体中文' },
                  { code: 'ja', label: '日本語' }
                ].map((lang) => {
                  const active = i18n.language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className={`h-10 flex items-center justify-between px-3.5 rounded-[10px] border text-[12.5px] font-medium transition-colors ${active
                        ? 'border-[#3069f0]/40 text-[#7ba3f5]'
                        : 'border-white/[0.08] text-[#9aa3b2] hover:text-[#c8ccd4]'
                        }`}
                      style={{ background: active ? 'rgba(61,123,253,.1)' : 'rgba(255,255,255,0.025)' }}
                    >
                      {lang.label}
                      {active && <Check className="w-[13px] h-[13px]" strokeWidth={2.2} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* APP INFO */}
            <div>
              <SectionLabel>{t('menu.appInfo')}</SectionLabel>
              <GroupCard>
                <button
                  onClick={() => {
                    if (updatesDisabled) {
                      import('sonner').then(({ toast }) => {
                        toast.info('Update check is disabled in development mode');
                      });
                      return;
                    }
                    onClose();
                    navigate('/update');
                  }}
                  className={`w-full h-[58px] flex items-center gap-3 px-3.5 transition-colors ${updatesDisabled ? 'opacity-50' : 'active:bg-white/[0.03]'}`}
                >
                  <span className="w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center" style={{ background: TINT.tools.bg, color: TINT.tools.fg }}>
                    <Download className="w-4 h-4" strokeWidth={1.8} />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-[13.5px] font-semibold leading-[1.3] text-[#e9ebef]">{t('menu.checkForUpdates')}</span>
                    <span className="block font-mono text-[10px] text-[#565d6b] mt-0.5">
                      {remoteVersion === 'dev' ? 'dev' : `v${remoteVersion || 'Unknown'}`}
                    </span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#4a5261]" strokeWidth={2} />
                </button>
              </GroupCard>
            </div>

            {/* CACHE */}
            <div>
              <SectionLabel>{t('menu.cache')}</SectionLabel>
              <GroupCard className="px-3.5 py-1">
                <div className="h-[42px] flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#c8ccd4]">{t('menu.cacheUsed')}</span>
                  <span className="font-mono text-[11.5px] text-[#8a919e]">
                    {CacheService.formatCacheSize(cacheSize)}
                  </span>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="py-2.5">
                  <button
                    onClick={handleClearCache}
                    disabled={isClearing}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-[10px] border text-[12.5px] font-semibold transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(242,85,85,.1)', borderColor: 'rgba(242,85,85,.3)', color: '#f87c7c' }}
                  >
                    {isClearing ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t('menu.cacheClearing')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                        {t('menu.cacheClear')}
                      </>
                    )}
                  </button>
                  {clearResult && (
                    <div className={`mt-2 text-[11px] px-2.5 py-1.5 rounded-lg ${clearResult.success
                      ? 'text-[#4ade80] bg-[#34c77b]/10 border border-[#34c77b]/25'
                      : 'text-[#f87c7c] bg-[#f25555]/10 border border-[#f25555]/25'
                      }`}>
                      {clearResult.success ? t('menu.cacheSuccess') : t('menu.cacheFailed')}
                    </div>
                  )}
                </div>
              </GroupCard>
            </div>

            {/* Footer */}
            <div className="pt-4 pb-2 text-center">
              <div className="text-[13px] font-bold text-[#c8ccd4]">{t('menu.appTitle')}</div>
              <div className="font-mono text-[10px] text-[#565d6b] mt-1">
                {remoteVersion === 'dev' ? 'dev' : t('menu.version', { version: remoteVersion || '0.0.0' })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  ) : null;
};

export default SideMenu;
