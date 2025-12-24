import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, PlugZap, RefreshCw, X } from 'lucide-react';
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

const glassPanelClass = 'bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/20 dark:border-slate-600/20 rounded-3xl shadow-2xl shadow-slate-900/20 dark:shadow-slate-900/40';

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

  const installablePackages = useMemo(
    () => packages.filter((pkg) => pkg.isInstallable),
    [packages],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const loadPackages = async () => {
      setIsLoading(true);
      setError(null);
      try {
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
    if (!isOpen) {
      return;
    }

    const handler = (event: any) => {
      const status = parseManagerQueueStatus(event?.data ?? event);
      if (!status) {
        return;
      }
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
    // Navigate to the reboot page instead of directly calling the API
    onClose();
    navigate('/reboot');
    toast.info(t('missingNodes.navigatingReboot'));
  };

  const renderPackageCard = (pkg: MissingNodePackage) => {
    const state = rowState[pkg.packId] ?? { selectedVersion: pkg.availableVersions[0] ?? 'latest', isInstalling: false };
    const actionLabel = pkg.isInstalled ? t('missingNodes.update') : t('missingNodes.install');
    const badgeVariant = pkg.isInstalled ? 'secondary' : 'outline';

    return (
      <div key={pkg.packId} className={`${glassPanelClass} p-5 space-y-4`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {pkg.packName ?? pkg.packId}
              </h3>
              <Badge variant={badgeVariant} className="uppercase tracking-wide text-xs">
                {pkg.isInstalled ? t('missingNodes.installed') : t('missingNodes.missing')}
              </Badge>
              {pkg.isUpdateAvailable && (
                <Badge variant="destructive" className="uppercase tracking-wide text-xs">
                  {t('missingNodes.updateAvailable')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 break-all">{pkg.packId}</p>
            {pkg.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {pkg.description}
              </p>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              <span>{t('missingNodes.source')} {pkg.source}</span>
              {pkg.repository && <span>{t('missingNodes.repository')} {pkg.repository}</span>}
              {pkg.latestVersion && <span>{t('missingNodes.latest')} {pkg.latestVersion}</span>}
              {pkg.installedVersion && <span>{t('missingNodes.current')} {pkg.installedVersion}</span>}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('missingNodes.missingNodes')} {pkg.nodeTypes.join(', ')}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 md:min-w-[220px]">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {t('missingNodes.version')}
              </label>
              <Select
                value={state.selectedVersion}
                onValueChange={(value) => handleVersionChange(pkg.packId, value)}
                disabled={!pkg.isInstallable || state.isInstalling}
              >
                <SelectTrigger className="h-11 rounded-xl border-white/30 dark:border-slate-700/40 bg-white/40 dark:bg-slate-900/40 text-sm">
                  <SelectValue placeholder={t('missingNodes.selectVersion')} />
                </SelectTrigger>
                <SelectContent className="z-[120] backdrop-blur-xl bg-white/70 dark:bg-slate-900/80 border border-white/30 dark:border-slate-700/40">
                  {pkg.availableVersions.map((version) => (
                    <SelectItem key={version} value={version} className="text-sm">
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="h-11 rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:bg-white/40 dark:hover:bg-slate-800/40"
              disabled={!pkg.isInstallable || state.isInstalling}
              onClick={() => handleInstallPackage(pkg)}
            >
              {state.isInstalling ? (
                <span className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('missingNodes.queued')}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <PlugZap className="h-4 w-4" /> {actionLabel}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md pwa-modal"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pwa-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`relative w-full max-w-3xl ${glassPanelClass} overflow-hidden`}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

              <div className="relative flex items-center justify-between px-6 py-5 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {t('missingNodes.title')}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t('missingNodes.subtitle')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="relative max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-600 dark:text-slate-300">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="mt-3 text-sm">{t('missingNodes.loading')}</p>
                  </div>
                )}

                {!isLoading && error && (
                  <div className="rounded-2xl border border-red-200/40 bg-red-500/10 px-4 py-4 text-sm text-red-600 backdrop-blur-sm dark:border-red-500/30 dark:text-red-400">
                    {error}
                  </div>
                )}

                {!isLoading && !error && packages.length === 0 && (
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-6 text-center text-sm text-slate-600 backdrop-blur-sm dark:border-slate-600/20 dark:bg-slate-700/10 dark:text-slate-300">
                    {t('missingNodes.allAvailable')}
                  </div>
                )}

                {!isLoading && !error && packages.length > 0 && (
                  <div className="space-y-4">
                    {packages.map(renderPackageCard)}
                  </div>
                )}
              </div>

              <div className="relative flex flex-col gap-3 border-t border-white/10 px-6 py-4 backdrop-blur-sm dark:border-slate-600/10 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {queueStatus ? (
                    queueStatus.status === 'in_progress' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('missingNodes.installing')}
                        {typeof queueStatus.doneCount === 'number' && typeof queueStatus.totalCount === 'number' && (
                          <span>
                            {t('missingNodes.completed', { done: queueStatus.doneCount, total: queueStatus.totalCount })}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>{t('missingNodes.queueCompleted')}</span>
                    )
                  ) : (
                    <span>{t('missingNodes.selectPackage')}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border border-white/30 bg-white/10 text-slate-700 backdrop-blur-sm transition-colors hover:bg-white/20 dark:border-slate-600/30 dark:bg-slate-800/20 dark:text-slate-200 dark:hover:bg-slate-700/20"
                    onClick={handleInstallAll}
                    disabled={
                      installablePackages.length === 0 ||
                      installablePackages.every((pkg) => rowState[pkg.packId]?.isInstalling)
                    }
                  >
                    <span className="flex items-center gap-2">
                      <PlugZap className="h-4 w-4" /> {t('missingNodes.installAll')}
                    </span>
                  </Button>
                  {showRebootPrompt && (
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border border-white/30 bg-white/10 text-slate-700 backdrop-blur-sm transition-colors hover:bg-white/20 dark:border-slate-600/30 dark:bg-slate-800/20 dark:text-slate-200 dark:hover:bg-slate-700/20"
                      onClick={handleRebootServer}
                    >
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" /> {t('missingNodes.goToReboot')}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MissingNodeInstallerModal;



