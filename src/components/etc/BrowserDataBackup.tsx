import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/ui/store/connectionStore';
import {
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  HardDrive,
  Server,
  ArrowLeft,
  Settings,
  Shield,
  ShieldAlert,
  ArrowRightLeft
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BackupInfo {
  hasBackup: boolean;
  createdAt?: string;
  size?: number;
}

export const BrowserDataBackup: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { url: serverUrl, isConnected, hasExtension, isCheckingExtension, checkExtension } = useConnectionStore();
  const [backupInfo, setBackupInfo] = useState<BackupInfo>({ hasBackup: false });
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingBackup, setIsCheckingBackup] = useState(true);
  const [error, setError] = useState<string>('');

  // Migration options
  const [includeApiKeys, setIncludeApiKeys] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'backup' | 'restore' | null;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => { }
  });

  // Check extension availability on mount
  useEffect(() => {
    if (isConnected && !hasExtension && !isCheckingExtension) {
      checkExtension();
    }
  }, [isConnected, hasExtension, isCheckingExtension, checkExtension]);

  // Check if backup exists on server
  const checkBackupStatus = useCallback(async () => {
    try {
      setIsCheckingBackup(true);
      const response = await fetch(`${serverUrl}/comfymobile/api/backup/status`);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          setBackupInfo(data);
        } else {
          // Server returned HTML instead of JSON - likely endpoint not found
          console.warn('Backup status endpoint returned HTML instead of JSON');
          setBackupInfo({ hasBackup: false });
        }
      } else if (response.status === 404) {
        // Endpoint not found - extension might not support backup yet
        console.warn('Backup status endpoint not found (404)');
        setBackupInfo({ hasBackup: false });
      } else {
        console.warn('Failed to check backup status:', response.status, response.statusText);
        setBackupInfo({ hasBackup: false });
      }
    } catch (error) {
      console.error('Error checking backup status:', error);
      setBackupInfo({ hasBackup: false });
    } finally {
      setIsCheckingBackup(false);
    }
  }, [serverUrl]);

  // Get current IndexedDB version dynamically
  const getCurrentDBVersion = async (): Promise<number> => {
    return new Promise((resolve, reject) => {
      // Try to open without specifying version to get current version
      const request = indexedDB.open('ComfyMobileUI');

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const version = db.version;
        db.close();
        resolve(version);
      };

      request.onerror = () => {
        // If DB doesn't exist, assume version 1
        resolve(1);
      };
    });
  };

  // Collect browser data for backup
  const collectBrowserData = async (opts: { includeApiKeys: boolean }) => {
    const data: {
      localStorage: Record<string, string | null>;
      indexedDB: {
        apiKeys?: any[];
        workflows?: any[];
      };
    } = {
      localStorage: {},
      indexedDB: {}
    };

    // Collect localStorage data
    try {
      // Core keys required for the app to function
      const coreKeys = [
        'comfyui_workflows',
        'comfy-workflow-folders',
        'comfyui_custom_widget_types',
        'comfyui_node_patches',
        'i18nextLng' // Language preference
      ];

      coreKeys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data.localStorage[key] = value;
        }
      });

      console.log(`Collected ${Object.keys(data.localStorage).length} core localStorage keys`);
    } catch (error) {
      console.error('Error collecting localStorage data:', error);
    }

    // Collect IndexedDB data with dynamic version detection
    try {
      data.indexedDB = {};

      // Get current DB version first
      const currentVersion = await getCurrentDBVersion();
      console.log(`Opening IndexedDB with detected version: ${currentVersion}`);

      // Get data from IndexedDB using current version
      const dbRequest = indexedDB.open('ComfyMobileUI', currentVersion);

      await new Promise((resolve, reject) => {
        dbRequest.onsuccess = async (event) => {
          try {
            const db = (event.target as IDBOpenDBRequest).result;
            console.log('Available object stores:', Array.from(db.objectStoreNames));

            // Get apiKeys if store exists and user opted in
            if (opts.includeApiKeys && db.objectStoreNames.contains('apiKeys')) {
              const apiKeysTransaction = db.transaction(['apiKeys'], 'readonly');
              const apiKeysStore = apiKeysTransaction.objectStore('apiKeys');
              const apiKeysRequest = apiKeysStore.getAll();

              apiKeysRequest.onsuccess = () => {
                data.indexedDB.apiKeys = apiKeysRequest.result;
                console.log(`Collected ${apiKeysRequest.result.length} API keys`);
              };
            } else {
              console.log(opts.includeApiKeys ? 'apiKeys store not found' : 'API keys excluded by user');
            }

            // Get workflows if store exists
            if (db.objectStoreNames.contains('workflows')) {
              const workflowsTransaction = db.transaction(['workflows'], 'readonly');
              const workflowsStore = workflowsTransaction.objectStore('workflows');
              const workflowsRequest = workflowsStore.getAll();

              workflowsRequest.onsuccess = () => {
                data.indexedDB.workflows = workflowsRequest.result;
                console.log(`Collected ${workflowsRequest.result.length} workflows`);
                db.close();
                resolve(data);
              };
            } else {
              console.log('workflows store not found');
              db.close();
              resolve(data);
            }
          } catch (error) {
            reject(error);
          }
        };

        dbRequest.onerror = () => reject(dbRequest.error);
      });
    } catch (error) {
      console.error('Error collecting IndexedDB data:', error);
    }

    return data;
  };

  // Show backup confirmation dialog
  const showBackupConfirmation = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'backup',
      title: t('backup.dialog.backupTitle'),
      message: t('backup.dialog.backupMessage'),
      confirmText: t('backup.dialog.confirmBackup'),
      onConfirm: handleBackup
    });
  };

  // Show restore confirmation dialog
  const showRestoreConfirmation = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'restore',
      title: t('backup.dialog.restoreTitle'),
      message: t('backup.dialog.restoreMessage'),
      confirmText: t('backup.dialog.confirmRestore'),
      onConfirm: handleRestore
    });
  };

  // Close confirmation dialog
  const closeConfirmDialog = () => {
    setConfirmDialog({
      isOpen: false,
      type: null,
      title: '',
      message: '',
      confirmText: '',
      onConfirm: () => { }
    });
  };

  // Backup browser data to server
  const handleBackup = async () => {
    closeConfirmDialog();
    try {
      setIsLoading(true);
      setError('');

      // Collect data with current options
      const browserData = await collectBrowserData({
        includeApiKeys
      });

      // Send to server
      const response = await fetch(`${serverUrl}/comfymobile/api/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(browserData)
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(t('backup.toast.backupSuccess'));
        await checkBackupStatus(); // Refresh backup status
      } else {
        const error = await response.text();
        throw new Error(error);
      }
    } catch (error) {
      const errorMessage = t('backup.toast.backupFailed', { error: error instanceof Error ? error.message : 'Unknown error' });
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Restore browser data from server
  const handleRestore = async () => {
    closeConfirmDialog();
    try {
      setIsLoading(true);
      setError('');

      // Get backup data from server
      const response = await fetch(`${serverUrl}/comfymobile/api/backup/restore`, {
        method: 'POST'
      });

      if (response.ok) {
        const backupData = await response.json();

        // Restore localStorage
        if (backupData.localStorage) {
          Object.entries(backupData.localStorage).forEach(([key, value]) => {
            localStorage.setItem(key, value as string);
          });
        }

        // Restore IndexedDB
        if (backupData.indexedDB) {
          await restoreIndexedDBData(backupData.indexedDB);
        }

        toast.success(t('backup.toast.restoreSuccess'));

        // Ask user to reload page for changes to take effect
        setTimeout(() => {
          if (confirm(t('backup.toast.reloadPrompt'))) {
            window.location.reload();
          }
        }, 1000);

      } else {
        const error = await response.text();
        throw new Error(error);
      }
    } catch (error) {
      const errorMessage = t('backup.toast.restoreFailed', { error: error instanceof Error ? error.message : 'Unknown error' });
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to restore IndexedDB data with dynamic version detection
  const restoreIndexedDBData = async (indexedDBData: any) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Get current DB version
        const currentVersion = await getCurrentDBVersion();
        console.log(`Restoring to IndexedDB with version: ${currentVersion}`);

        const request = indexedDB.open('ComfyMobileUI', currentVersion);

        request.onsuccess = async (event) => {
          try {
            const db = (event.target as IDBOpenDBRequest).result;
            console.log('Available stores for restore:', Array.from(db.objectStoreNames));

            // Restore apiKeys if data and store both exist
            if (indexedDBData.apiKeys && db.objectStoreNames.contains('apiKeys')) {
              console.log(`Restoring ${indexedDBData.apiKeys.length} API keys`);
              const transaction = db.transaction(['apiKeys'], 'readwrite');
              const store = transaction.objectStore('apiKeys');

              // Clear existing data
              await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve(undefined);
                clearRequest.onerror = () => reject(clearRequest.error);
              });

              // Add restored data
              for (const item of indexedDBData.apiKeys) {
                await new Promise((resolve, reject) => {
                  const addRequest = store.add(item);
                  addRequest.onsuccess = () => resolve(undefined);
                  addRequest.onerror = () => reject(addRequest.error);
                });
              }
              console.log('API keys restored successfully');
            } else if (indexedDBData.apiKeys) {
              console.warn('apiKeys data exists in backup but apiKeys store not found in current DB');
            }

            // Restore workflows if data and store both exist
            if (indexedDBData.workflows && db.objectStoreNames.contains('workflows')) {
              console.log(`Restoring ${indexedDBData.workflows.length} workflows`);
              const transaction = db.transaction(['workflows'], 'readwrite');
              const store = transaction.objectStore('workflows');

              // Clear existing data
              await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve(undefined);
                clearRequest.onerror = () => reject(clearRequest.error);
              });

              // Add restored data
              for (const item of indexedDBData.workflows) {
                await new Promise((resolve, reject) => {
                  const addRequest = store.add(item);
                  addRequest.onsuccess = () => resolve(undefined);
                  addRequest.onerror = () => reject(addRequest.error);
                });
              }
              console.log('Workflows restored successfully');
            } else if (indexedDBData.workflows) {
              console.warn('workflows data exists in backup but workflows store not found in current DB');
            }

            db.close();
            resolve(undefined);
          } catch (error) {
            console.error('Error during IndexedDB restore:', error);
            reject(error);
          }
        };

        request.onerror = () => {
          console.error('Failed to open IndexedDB for restore:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Error getting current DB version for restore:', error);
        reject(error);
      }
    });
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  useEffect(() => {
    // Only check backup status if connected and has extension
    if (isConnected && hasExtension) {
      checkBackupStatus();
    } else {
      setIsCheckingBackup(false);
    }
  }, [isConnected, hasExtension, checkBackupStatus]);

  // If not connected, show connection required state
  if (!isConnected) {
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
          bottom: 0,
          touchAction: 'none'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
        <div className="absolute inset-0 bg-black/5 dark:bg-black/10 pointer-events-none" />

        <div
          className="absolute top-0 left-0 right-0 bottom-0"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            position: 'absolute'
          }}
        >
          <header className="sticky top-0 z-50 bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 p-4">
              <div className="flex items-center space-x-4">
                <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="bg-white/20 dark:bg-slate-700/20 h-10 w-10 p-0 rounded-lg">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('backup.title')}</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('backup.subtitle')}</p>
                </div>
              </div>
            </div>
          </header>
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-orange-50/80 dark:bg-orange-950/40 backdrop-blur border border-orange-200/40 dark:border-orange-800/40 rounded-2xl p-8 text-center shadow-xl">
              <div className="bg-orange-600 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <Server className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-orange-900 dark:text-orange-100 mb-2">{t('backup.serverRequired')}</h1>
              <p className="text-orange-800 dark:text-orange-200 mb-6">{t('backup.connectPrompt')}</p>
              <Button onClick={() => navigate('/settings/server')} className="bg-orange-600 hover:bg-orange-700 text-white">
                <Settings className="h-4 w-4 mr-2" />
                {t('backup.configureServer')}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // If checking extension, show loading state
  if (isCheckingExtension) {
    return (
      <div className="pwa-container bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-900 flex items-center justify-center h-[100dvh]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('backup.checkingExtension')}</h2>
            <p className="text-slate-600 dark:text-slate-400">{t('backup.verifyingExtension')}</p>
          </div>
        </div>
      </div>
    );
  }

  // If no extension, show extension required state
  if (!hasExtension) {
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
          bottom: 0,
          touchAction: 'none'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-900" />
        <div
          className="absolute top-0 left-0 right-0 bottom-0"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            position: 'absolute'
          }}
        >
          <div className="container mx-auto px-4 py-8 max-w-2xl relative">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <Button onClick={() => navigate(-1)} variant="ghost" className="absolute top-0 left-0 text-slate-600 dark:text-slate-400">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="bg-red-50/80 dark:bg-red-950/40 backdrop-blur border border-red-200/40 dark:border-red-800/40 rounded-2xl shadow-xl p-8 mt-12">
                <div className="bg-red-600 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">{t('backup.extensionRequired')}</h1>
                <p className="text-red-800 dark:text-red-200 mb-6">{t('backup.extensionRequiredDesc')}</p>
                <div className="space-y-3 flex flex-col items-center">
                  <Button onClick={() => window.open('https://github.com/jaeone94/comfy-mobile-ui', '_blank')} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    {t('backup.downloadExtension')}
                  </Button>
                  <Button variant="outline" onClick={() => checkExtension()} className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 w-full sm:w-auto">
                    {t('backup.retryCheck')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

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
        bottom: 0,
        touchAction: 'none'
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      <div className="absolute inset-0 bg-black/5 dark:bg-black/10 pointer-events-none" />

      <div
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        <header className="sticky top-0 z-50 bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 p-4">
            <div className="flex items-center space-x-4">
              <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="bg-white/20 dark:bg-slate-700/20 h-10 w-10 p-0 rounded-lg">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('backup.title')}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('backup.subtitle')}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-2xl relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/50 dark:bg-slate-800/50 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl p-6 space-y-6">

            {/* Backup Status */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center">
                <HardDrive className="w-5 h-5 mr-2" />
                {t('backup.status.title')}
              </h2>

              {isCheckingBackup ? (
                <div className="flex items-center space-x-3 p-4 bg-slate-100/80 dark:bg-slate-700/50 rounded-xl">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400/20 border-t-slate-600"></div>
                  <span className="text-slate-600 dark:text-slate-400">{t('backup.status.checking')}</span>
                </div>
              ) : backupInfo.hasBackup ? (
                <div className="p-4 bg-green-50/80 dark:bg-green-950/40 border border-green-200/40 dark:border-green-800/40 rounded-xl">
                  <div className="flex items-center space-x-2 text-green-700 dark:text-green-300 mb-2">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-semibold">{t('backup.status.available')}</span>
                  </div>
                  <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
                    {backupInfo.createdAt && (
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{t('backup.status.created', { date: formatDate(backupInfo.createdAt) })}</span>
                      </div>
                    )}
                    {backupInfo.size && (
                      <div className="flex items-center space-x-1">
                        <Database className="h-3 w-3" />
                        <span>{t('backup.status.size', { size: formatFileSize(backupInfo.size) })}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-orange-50/80 dark:bg-orange-950/40 border border-orange-200/40 dark:border-orange-800/40 rounded-xl">
                  <div className="flex items-center space-x-2 text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-semibold">{t('backup.status.notFound')}</span>
                  </div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">{t('backup.status.createFirst')}</p>
                </div>
              )}
            </div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 bg-red-50/80 dark:bg-red-950/40 border border-red-200/40 dark:border-red-800/40 rounded-xl">
                  <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Error</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                  <Button variant="ghost" size="sm" className="mt-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" onClick={() => setError('')}>Dismiss</Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button onClick={showBackupConfirmation} disabled={isLoading} className="h-14 text-base font-medium rounded-xl bg-transparent border-2 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-all shadow-sm hover:shadow-md active:scale-95">
                {isLoading ? (
                  <div className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600/20 border-t-blue-600 mr-2"></div>{t('backup.action.creating')}</div>
                ) : (
                  <><Download className="h-4 w-4 mr-2" />{t('backup.action.create')}</>
                )}
              </Button>

              <Button onClick={showRestoreConfirmation} disabled={isLoading || !backupInfo.hasBackup} className="h-14 text-base font-medium rounded-xl bg-transparent border-2 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-950/50 text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 disabled:border-slate-300 disabled:text-slate-400 transition-all shadow-sm hover:shadow-md active:scale-95">
                {isLoading ? (
                  <div className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600/20 border-t-green-600 mr-2"></div>{t('backup.action.restoring')}</div>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{t('backup.action.restore')}</>
                )}
              </Button>
            </div>

            {/* Information & Options */}
            <div className="p-5 bg-slate-100/80 dark:bg-slate-700/50 rounded-2xl border border-slate-200/50 dark:border-slate-600/30">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center mb-3">
                <Shield className="w-4 h-4 mr-2 text-blue-500" />
                {t('backup.info.title')}
              </h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-3">
                <li className="flex items-center justify-between group">
                  <div className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">•</span>
                    <span>{t('backup.info.workflows')}</span>
                  </div>
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-[10px] py-0 h-4 opacity-60">CORE</Badge>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">•</span>
                    <span>{t('backup.info.folders')}</span>
                  </div>
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-[10px] py-0 h-4 opacity-60">CORE</Badge>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">•</span>
                    <span>{t('backup.info.storage')}</span>
                  </div>
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-[10px] py-0 h-4 opacity-60">CORE</Badge>
                </li>

                <li className="flex items-center justify-between">
                  <div className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">•</span>
                    <span>{t('backup.info.settings')}</span>
                  </div>
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-[10px] py-0 h-4 opacity-60">CORE</Badge>
                </li>

                {includeApiKeys && (
                  <motion.li
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between font-medium text-blue-600 dark:text-blue-400"
                  >
                    <div className="flex items-start">
                      <span className="text-blue-500 mr-2 mt-0.5">•</span>
                      <span>{t('backup.info.apiKeys')}</span>
                    </div>
                    <Badge variant="outline" className="border-amber-500 text-amber-500 bg-amber-500/10 text-[10px] py-0 h-4">WARNING</Badge>
                  </motion.li>
                )}
              </ul>

              <Separator className="my-4 bg-slate-200 dark:bg-slate-600" />

              <div className="space-y-4">

                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center text-sm font-semibold text-slate-800 dark:text-slate-200">
                      <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
                      {t('backup.options.includeApiKeys')}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{t('backup.options.includeApiKeysDesc')}</p>
                  </div>
                  <Switch id="include-apikeys" checked={includeApiKeys} onCheckedChange={setIncludeApiKeys} />
                </div>

                {includeApiKeys && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-xl">
                    <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400 font-medium">{t('backup.options.securityWarning')}</p>
                  </motion.div>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-4 italic">{t('backup.info.note')}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 pwa-modal z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative max-w-md w-full bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 flex flex-col overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
            <div className="relative flex items-center justify-between p-4 border-b border-white/10 dark:border-slate-600/10 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${confirmDialog.type === 'backup' ? 'bg-blue-500/20 border-blue-400/30' : 'bg-orange-500/20 border-orange-400/30'}`}>
                  {confirmDialog.type === 'backup' ? <Download className="w-4 h-4 text-blue-300" /> : <AlertTriangle className="w-4 h-4 text-orange-300" />}
                </div>
                <h3 className="text-lg font-semibold text-white">{confirmDialog.title}</h3>
              </div>
            </div>
            <div className="relative p-4">
              <p className="text-white/90 mb-4">{confirmDialog.message}</p>
              {confirmDialog.type === 'restore' && (
                <div className="p-3 bg-orange-500/10 border border-orange-400/20 rounded-lg mb-4">
                  <p className="text-orange-200 text-sm font-medium">⚠️ {t('backup.dialog.warning')}</p>
                  <p className="text-orange-300/90 text-sm mt-1">{t('backup.dialog.warningMessage')}</p>
                </div>
              )}
            </div>
            <div className="relative flex justify-end gap-2 p-4 border-t border-white/10 dark:border-slate-600/10 flex-shrink-0">
              <Button onClick={closeConfirmDialog} variant="outline" className="bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20 transition-all duration-300">{t('backup.dialog.cancel')}</Button>
              <Button onClick={confirmDialog.onConfirm} className={`backdrop-blur-sm text-white transition-all duration-300 ${confirmDialog.type === 'backup' ? 'bg-blue-500/80 hover:bg-blue-500/90 border border-blue-400/30' : 'bg-orange-500/80 hover:bg-orange-500/90 border border-orange-400/30'}`}>{confirmDialog.confirmText}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowserDataBackup;