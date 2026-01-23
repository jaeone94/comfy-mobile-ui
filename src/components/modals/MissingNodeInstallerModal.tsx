import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, PlugZap, RefreshCw, X, Box, Info, Sparkles, AlertCircle, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MANAGER_QUEUE_EVENT,
  MissingNodePackage,
  MissingWorkflowNode,
  ManagerQueueStatus,
  PackageInstallSelection,
  parseManagerQueueStatus,
  queueMissingNodeInstallation,
  resolveMissingNodePackages,
} from '@/services/MissingNodesService';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';

interface LogEntry {
  m: string;
  t?: number;
}

interface MissingNodeInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingNodes: MissingWorkflowNode[];
  onInstallationComplete?: (queuedCount: number) => void;
}

interface PackageRowState {
  selectedVersion: string;
  isInstalling: boolean;
}

export const MissingNodeInstallerModal: React.FC<MissingNodeInstallerModalProps> = ({
  isOpen,
  onClose,
  missingNodes,
  onInstallationComplete,
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [packages, setPackages] = useState<MissingNodePackage[]>([]);
  const [rowState, setRowState] = useState<Record<string, PackageRowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<ManagerQueueStatus | null>(null);
  const [showRebootPrompt, setShowRebootPrompt] = useState(false);
  const pendingInstallCountRef = useRef(0);
  const pendingInstallIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [logMessages, setLogMessages] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const baseTitleSize = '1.5rem';

  const installablePackages = useMemo(
    () => packages.filter((pkg) => pkg.isInstallable),
    [packages],
  );

  useEffect(() => {
    if (isOpen) {
      setIsHeaderCompact(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen, missingNodes.length]);

  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderCompact(!entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0,
        rootMargin: '0px'
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadPackages = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Pre-warm manager queue while loading package info
        ComfyUIService.startManagerQueue().catch(() => { });

        const resolved = await resolveMissingNodePackages(missingNodes);
        if (cancelled) return;
        setPackages(resolved);
        const nextRowState: Record<string, PackageRowState> = {};
        resolved.forEach((pkg) => {
          const defaultVersion = pkg.availableVersions[0] ?? 'latest';
          nextRowState[pkg.packId] = {
            selectedVersion: defaultVersion,
            isInstalling: false,
          };
        });
        setRowState(nextRowState);
      } catch (err) {
        console.error('Failed to resolve missing node packages:', err);
        if (!cancelled) {
          setError(t('missingNodes.resolveFailed'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPackages();

    return () => {
      cancelled = true;
      setQueueStatus(null);
      setShowRebootPrompt(false);
      pendingInstallCountRef.current = 0;
      pendingInstallIdsRef.current.clear();
    };
  }, [isOpen, missingNodes]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: any) => {
      const status = parseManagerQueueStatus(event?.data ?? event);
      if (!status) return;

      setQueueStatus(status);
      if (status.status === 'done') {
        setRowState((prev) => {
          const next: Record<string, PackageRowState> = {};
          Object.entries(prev).forEach(([key, value]) => {
            next[key] = { ...value, isInstalling: false };
          });
          return next;
        });
        setShowRebootPrompt(true);
        toast.success(t('missingNodes.installedSuccess'));

        if (pendingInstallIdsRef.current.size > 0) {
          setPackages((prev) => prev.map((pkg) => (
            pendingInstallIdsRef.current.has(pkg.packId)
              ? { ...pkg, isInstallable: false, isInstalled: true }
              : pkg
          )));
        }

        const completedCount = pendingInstallCountRef.current
          ? pendingInstallCountRef.current
          : pendingInstallIdsRef.current.size || installablePackages.length;

        pendingInstallCountRef.current = 0;
        pendingInstallIdsRef.current.clear();

        if (completedCount > 0) {
          onInstallationComplete?.(completedCount);
        }
      }
    };

    const listenerId = globalWebSocketService.on(MANAGER_QUEUE_EVENT, handler);

    return () => {
      if (listenerId) {
        globalWebSocketService.offById(MANAGER_QUEUE_EVENT, listenerId);
      }
      globalWebSocketService.off(MANAGER_QUEUE_EVENT, handler);
    };
  }, [isOpen, onInstallationComplete, installablePackages.length]);

  // Handle Installation Logs
  useEffect(() => {
    if (!isOpen) return;

    const handleLogs = (event: any) => {
      const logsData = event?.data ?? event;

      let newEntries: LogEntry[] = [];

      // Standard entries format
      if (logsData?.entries && Array.isArray(logsData.entries)) {
        newEntries = logsData.entries;
      }
      // Single message object format { m: '...', t: ... }
      else if (logsData?.m && typeof logsData.m === 'string') {
        newEntries = [{ m: logsData.m, t: logsData.t ?? Date.now() }];
      }
      // Simple string format or other message formats
      else if (typeof logsData === 'string') {
        newEntries = [{ m: logsData, t: Date.now() }];
      }
      else if (logsData?.message && typeof logsData.message === 'string') {
        newEntries = [{ m: logsData.message, t: Date.now() }];
      }
      else if (logsData?.text && typeof logsData.text === 'string') {
        newEntries = [{ m: logsData.text, t: Date.now() }];
      }

      if (newEntries.length > 0) {
        setLogMessages(prev => {
          const next = [...prev, ...newEntries];
          return next.slice(-500);
        });

        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 10);
      }
    };

    // Listen to multiple possible log-related events
    const logsId = ComfyUIService.on('logs', handleLogs);
    const loggingId = ComfyUIService.on('logging', handleLogs);
    const stdoutId = ComfyUIService.on('stdout', handleLogs);
    const stderrId = ComfyUIService.on('stderr', handleLogs);

    // Ensure we are subscribed on the server
    ComfyUIService.subscribeToLogsManually().catch(() => { });

    return () => {
      if (logsId) ComfyUIService.offById('logs', logsId);
      if (loggingId) ComfyUIService.offById('logging', loggingId);
      if (stdoutId) ComfyUIService.offById('stdout', stdoutId);
      if (stderrId) ComfyUIService.offById('stderr', stderrId);
    };
  }, [isOpen]);

  // Auto-open console when installation starts
  useEffect(() => {
    if (!isOpen) return;
    const isAnyInstalling = Object.values(rowState).some(s => s.isInstalling) || (queueStatus?.status === 'in_progress');
    if (isAnyInstalling && !isConsoleOpen && logMessages.length === 0) {
      setIsConsoleOpen(true);
    }
  }, [isOpen, rowState, queueStatus?.status, isConsoleOpen, logMessages.length]);

  const handleVersionChange = (packId: string, version: string) => {
    setRowState((prev) => ({
      ...prev,
      [packId]: {
        ...(prev[packId] ?? { selectedVersion: version, isInstalling: false }),
        selectedVersion: version,
      },
    }));
  };

  const handleInstallPackage = async (pkg: MissingNodePackage) => {
    if (!pkg.isInstallable) {
      toast.error(t('missingNodes.resolveAutoFailed'));
      return;
    }

    const selection: PackageInstallSelection = {
      packId: pkg.packId,
      selectedVersion: rowState[pkg.packId]?.selectedVersion ?? pkg.availableVersions[0] ?? 'latest',
      repository: pkg.repository,
      channel: pkg.channel,
      mode: pkg.mode,
      files: pkg.files,
      installType: pkg.installType,
    };

    setRowState((prev) => ({
      ...prev,
      [pkg.packId]: {
        ...(prev[pkg.packId] ?? { selectedVersion: selection.selectedVersion, isInstalling: false }),
        isInstalling: true,
      },
    }));

    const success = await queueMissingNodeInstallation([selection]);

    if (!success) {
      toast.error(t('missingNodes.queueFailed', { name: pkg.packName ?? pkg.packId }));
      setRowState((prev) => ({
        ...prev,
        [pkg.packId]: {
          ...(prev[pkg.packId] ?? { selectedVersion: selection.selectedVersion, isInstalling: false }),
          isInstalling: false,
        },
      }));
    } else {
      toast.info(t('missingNodes.installationQueued'));
      pendingInstallCountRef.current += 1;
      pendingInstallIdsRef.current.add(pkg.packId);
    }
  };

  const handleInstallAll = async () => {
    const selections: PackageInstallSelection[] = installablePackages.map((pkg) => ({
      packId: pkg.packId,
      selectedVersion: rowState[pkg.packId]?.selectedVersion ?? pkg.availableVersions[0] ?? 'latest',
      repository: pkg.repository,
      channel: pkg.channel,
      mode: pkg.mode,
      files: pkg.files,
      installType: pkg.installType,
    }));

    if (!selections.length) {
      toast.error(t('missingNodes.noInstallable'));
      return;
    }

    const nextRowState: Record<string, PackageRowState> = { ...rowState };
    selections.forEach((selection) => {
      nextRowState[selection.packId] = {
        ...(nextRowState[selection.packId] ?? { selectedVersion: selection.selectedVersion, isInstalling: false }),
        isInstalling: true,
      };
    });
    setRowState(nextRowState);

    const success = await queueMissingNodeInstallation(selections);

    if (!success) {
      toast.error(t('missingNodes.queueAllFailed'));
      setRowState((prev) => {
        const reset: Record<string, PackageRowState> = { ...prev };
        selections.forEach((selection) => {
          reset[selection.packId] = {
            ...(reset[selection.packId] ?? { selectedVersion: selection.selectedVersion, isInstalling: false }),
            isInstalling: false,
          };
        });
        return reset;
      });
    } else {
      toast.info(t('missingNodes.allQueued'));
      pendingInstallCountRef.current += selections.length;
      selections.forEach((selection) => pendingInstallIdsRef.current.add(selection.packId));
    }
  };

  const handleRebootServer = () => {
    onClose();
    navigate('/reboot');
    toast.info(t('missingNodes.navigatingReboot'));
  };

  const renderPackageCard = (pkg: MissingNodePackage) => {
    const state = rowState[pkg.packId] ?? { selectedVersion: pkg.availableVersions[0] ?? 'latest', isInstalling: false };
    const isLatestInstalled = pkg.isInstalled && !pkg.isUpdateAvailable && pkg.installedVersion && pkg.installedVersion === pkg.latestVersion;
    const actionLabel = isLatestInstalled
      ? t('missingNodes.reinstall')
      : pkg.isInstalled
        ? t('missingNodes.update')
        : t('missingNodes.install');

    const badgeVariant = pkg.isInstalled ? 'secondary' : 'outline';

    const getStatusLabel = () => {
      if (!pkg.isInstalled) return t('missingNodes.missing');
      if (pkg.state === 'disabled') return t('missingNodes.disabled');
      return t('missingNodes.installed');
    };

    return (
      <div key={pkg.packId} className="group relative rounded-[24px] bg-black/10 border border-white/5 hover:border-white/10 hover:bg-black/15 transition-all duration-300 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 text-white/40 group-hover:text-violet-400 transition-colors">
                <Box className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white/95 break-all leading-tight mb-0.5">
                  {pkg.packName ?? pkg.packId}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={badgeVariant} className="bg-white/5 text-white/40 border-white/10 text-[8px] font-bold tracking-widest uppercase px-1 py-0 h-4">
                    {getStatusLabel()}
                  </Badge>
                  {pkg.isUpdateAvailable && (
                    <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20 text-[8px] font-bold tracking-widest uppercase px-1 py-0 h-4">
                      {t('missingNodes.updateAvailable')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] font-mono text-white/30 break-all bg-black/20 px-2 py-1 rounded-lg border border-white/5 inline-block">
              {pkg.packId}
            </p>

            {pkg.description && (
              <p className="text-xs text-white/50 leading-relaxed max-w-2xl italic">
                {pkg.description}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t('missingNodes.source')}</span>
                <span className="text-xs text-white/50 font-medium">{pkg.source}</span>
              </div>
              {pkg.repository && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Repo</span>
                  <span className="text-xs text-white/50 font-medium truncate">{pkg.repository}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                {pkg.latestVersion && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t('missingNodes.latest')}</span>
                    <span className="text-xs text-white/50 font-medium">{pkg.latestVersion}</span>
                  </div>
                )}
                {pkg.installedVersion && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t('missingNodes.current')}</span>
                    <span className="text-xs text-white/50 font-medium">{pkg.installedVersion}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-1">
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5">{t('missingNodes.missingNodes')}</p>
              <div className="flex flex-wrap gap-1">
                {pkg.nodeTypes.map(type => (
                  <Badge key={type} className="bg-white/5 text-white/30 border-white/5 text-[8px] font-medium px-1.5 py-0 h-3.5">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch gap-2.5 lg:w-56 pt-2 lg:pt-0">
            <div className="flex-1 space-y-1.5">
              <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest ml-1">
                {t('missingNodes.version')}
              </label>
              <Select
                value={state.selectedVersion}
                onValueChange={(value) => handleVersionChange(pkg.packId, value)}
                disabled={!pkg.isInstallable || state.isInstalling}
              >
                <SelectTrigger className="h-10 rounded-xl border-white/10 bg-black/30 text-white/80 text-xs">
                  <SelectValue placeholder={t('missingNodes.selectVersion')} />
                </SelectTrigger>
                <SelectContent className="z-[130] bg-slate-900 border-white/10 text-white">
                  {pkg.availableVersions.map((version) => (
                    <SelectItem key={version} value={version}>{version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className={`h-10 rounded-xl border transition-all active:scale-95 text-xs ${state.isInstalling
                ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'}`}
              disabled={!pkg.isInstallable || state.isInstalling}
              onClick={() => handleInstallPackage(pkg)}
            >
              {state.isInstalling ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('missingNodes.queued')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <PlugZap className="h-3.5 w-3.5" /> {actionLabel}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 overflow-hidden text-xs">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="relative w-[90vw] h-[85vh] pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Card */}
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-[40px] shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Dynamic Sticky Header */}
            <div
              className={`absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] transition-all duration-300 ease-in-out
                ${isHeaderCompact
                  ? 'pt-2 pb-[13px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10'
                  : 'pt-6 pb-6 pl-6 pr-16 border-transparent bg-black/20 backdrop-blur-0'
                }`}
            >
              {/* Floating Close Button */}
              <div
                className={`absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}
              >
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all pointer-events-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0 pointer-events-none">
                <div className={`flex items-center space-x-2 transition-all duration-300 origin-left ${isHeaderCompact ? 'mb-1 scale-90' : 'mb-3 scale-100'}`}>
                  <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-black/20 text-white/80 border-transparent">
                    INSTALLER
                  </Badge>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                    {t('missingNodes.title')}
                  </span>
                </div>

                <div className="flex items-center min-w-0 transition-all duration-300" style={{ height: isHeaderCompact ? '11px' : '1.75rem' }}>
                  <h2
                    style={{
                      fontSize: baseTitleSize,
                      lineHeight: '1',
                      transform: isHeaderCompact ? `scale(${0.75 / parseFloat(baseTitleSize)})` : 'scale(1)',
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {t('missingNodes.title')}
                  </h2>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Static Top Bumper */}
              <div className="h-[120px] relative pointer-events-none">
                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
              </div>

              <div className="px-5 pb-6 sm:px-6 space-y-5">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 rounded-[32px] bg-black/10 border border-white/5">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 text-violet-400 animate-spin" />
                      <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-violet-300/50 animate-pulse" />
                    </div>
                    <p className="mt-5 text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('missingNodes.loading')}</p>
                  </div>
                )}

                {!isLoading && error && (
                  <div className="p-4 rounded-[20px] bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
                    <div className="p-1.5 rounded-lg bg-red-500/20">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    </div>
                    <p className="text-xs font-medium text-red-200 mt-0.5">{error}</p>
                  </div>
                )}

                {!isLoading && !error && packages.length === 0 && (
                  <div className="text-center py-16 rounded-[32px] bg-black/10 border border-dashed border-white/10">
                    <Box className="h-12 w-12 text-white/10 mx-auto mb-4" />
                    <p className="text-base font-medium text-white/60">{t('missingNodes.allAvailable')}</p>
                  </div>
                )}

                {!isLoading && !error && packages.length > 0 && (
                  <div className="grid grid-cols-1 gap-3">
                    {packages.map(renderPackageCard)}
                  </div>
                )}

                {/* Installation Console */}
                <AnimatePresence>
                  {isConsoleOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="rounded-[24px] bg-black/40 border border-white/10 overflow-hidden flex flex-col"
                    >
                      <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Installation Console</span>
                        </div>
                        <button
                          onClick={() => setIsConsoleOpen(false)}
                          className="text-white/40 hover:text-white transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div
                        ref={logContainerRef}
                        className="h-48 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed custom-scrollbar bg-black/20"
                      >
                        {logMessages.length === 0 ? (
                          <div className="text-white/20 italic">Waiting for installation logs...</div>
                        ) : (
                          logMessages.map((log, i) => (
                            <div key={i} className="text-white/60 mb-1 break-all">
                              <span className="text-violet-400/50 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                              {log.m}
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="px-6 py-4 border-t border-white/10 bg-black/30 backdrop-blur-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                {queueStatus ? (
                  queueStatus.status === 'in_progress' ? (
                    <span className="flex items-center gap-2.5">
                      <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                      {t('missingNodes.installing')}
                      {typeof queueStatus.doneCount === 'number' && (
                        <span className="text-violet-400">
                          {queueStatus.doneCount}/{queueStatus.totalCount}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> {t('missingNodes.queueCompleted')}
                    </span>
                  )
                ) : (
                  <span>{t('missingNodes.selectPackage')}</span>
                )}
              </div>

              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-10 w-10 rounded-xl border transition-all ${isConsoleOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
                  onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                  title="Toggle Console"
                >
                  <Terminal className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-5 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all text-xs"
                  onClick={handleInstallAll}
                  disabled={
                    installablePackages.length === 0 ||
                    installablePackages.every((pkg) => rowState[pkg.packId]?.isInstalling)
                  }
                >
                  <PlugZap className="h-3.5 w-3.5 mr-1.5" /> {t('missingNodes.installAll')}
                </Button>
                {showRebootPrompt && (
                  <Button
                    variant="outline"
                    className="h-10 px-5 rounded-xl border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 active:scale-95 transition-all text-xs"
                    onClick={handleRebootServer}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {t('missingNodes.goToReboot')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default MissingNodeInstallerModal;



