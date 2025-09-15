import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface BackupInfo {
  hasBackup: boolean;
  createdAt?: string;
  size?: number;
}

export const BrowserDataBackup: React.FC = () => {
  const navigate = useNavigate();
  const { url: serverUrl, isConnected, hasExtension, isCheckingExtension, checkExtension } = useConnectionStore();
  const [backupInfo, setBackupInfo] = useState<BackupInfo>({ hasBackup: false });
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingBackup, setIsCheckingBackup] = useState(true);
  const [error, setError] = useState<string>('');
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
    onConfirm: () => {}
  });

  // Check extension availability on mount
  useEffect(() => {
    if (isConnected && !hasExtension && !isCheckingExtension) {
      checkExtension();
    }
  }, [isConnected, hasExtension, isCheckingExtension, checkExtension]);

  // Check if backup exists on server
  const checkBackupStatus = async () => {
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
  };

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
  const collectBrowserData = async () => {
    const data: any = {};

    // Collect localStorage data
    try {
      const workflowsData = localStorage.getItem('comfyui_workflows');
      if (workflowsData) {
        data.localStorage = {
          comfyui_workflows: workflowsData
        };
      }
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
            
            // Get apiKeys if store exists
            if (db.objectStoreNames.contains('apiKeys')) {
              const apiKeysTransaction = db.transaction(['apiKeys'], 'readonly');
              const apiKeysStore = apiKeysTransaction.objectStore('apiKeys');
              const apiKeysRequest = apiKeysStore.getAll();

              apiKeysRequest.onsuccess = () => {
                data.indexedDB.apiKeys = apiKeysRequest.result;
                console.log(`Collected ${apiKeysRequest.result.length} API keys`);
              };
            } else {
              console.log('apiKeys store not found');
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
      title: 'Create Backup',
      message: 'This will create a backup of your browser data on the server. Any existing backup will be overwritten.',
      confirmText: 'Create Backup',
      onConfirm: handleBackup
    });
  };

  // Show restore confirmation dialog
  const showRestoreConfirmation = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'restore',
      title: 'Restore Backup',
      message: 'This will restore your browser data from the server backup. All current data will be replaced and the page will reload.',
      confirmText: 'Restore Data',
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
      onConfirm: () => {}
    });
  };

  // Backup browser data to server
  const handleBackup = async () => {
    closeConfirmDialog();
    try {
      setIsLoading(true);
      setError('');

      // Collect data
      const browserData = await collectBrowserData();

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
        toast.success('Browser data backed up successfully');
        await checkBackupStatus(); // Refresh backup status
      } else {
        const error = await response.text();
        throw new Error(error);
      }
    } catch (error) {
      const errorMessage = `Failed to backup data: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

        toast.success('Browser data restored successfully');
        
        // Ask user to reload page for changes to take effect
        setTimeout(() => {
          if (confirm('Data restored successfully. Reload the page to see changes?')) {
            window.location.reload();
          }
        }, 1000);
        
      } else {
        const error = await response.text();
        throw new Error(error);
      }
    } catch (error) {
      const errorMessage = `Failed to restore data: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
  }, [isConnected, hasExtension]);

  // If not connected, show connection required state
  if (!isConnected) {
    return (
      <div className="pwa-container bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative z-10 p-4">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
                size="sm"
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Browser Data Backup
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Server connection required
                </p>
              </div>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="bg-orange-50/80 dark:bg-orange-950/40 backdrop-blur border border-orange-200/40 dark:border-orange-800/40 rounded-2xl shadow-xl p-8">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-orange-600 p-3 rounded-full">
                  <Server className="w-6 h-6 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-orange-900 dark:text-orange-100 mb-2">
                Server Connection Required
              </h1>
              <p className="text-orange-800 dark:text-orange-200 mb-6">
                Connect to a ComfyUI server to use browser data backup and restore features.
              </p>
              <Button
                onClick={() => navigate('/settings/server')}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure Server
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // If checking extension, show loading state
  if (isCheckingExtension) {
    return (
      <div className="pwa-container bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Checking Extension...</h2>
            <p className="text-slate-600 dark:text-slate-400">Verifying ComfyUI Mobile API extension</p>
          </div>
        </div>
      </div>
    );
  }

  // If no extension, show extension required state
  if (!hasExtension) {
    return (
      <div className="pwa-container bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-900">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <Button
              onClick={() => navigate(-1)}
              variant="ghost"
              className="absolute top-4 left-4 text-slate-600 dark:text-slate-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="bg-red-50/80 dark:bg-red-950/40 backdrop-blur border border-red-200/40 dark:border-red-800/40 rounded-2xl shadow-xl p-8">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-red-600 p-3 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
                Extension Required
              </h1>
              <p className="text-red-800 dark:text-red-200 mb-6">
                The ComfyUI Mobile API extension is required for browser data backup functionality. 
                Please install the extension in your ComfyUI custom_nodes directory.
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => window.open('https://github.com/jaeone94/comfy-mobile-ui', '_blank')}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Extension
                </Button>
                <Button
                  variant="outline"
                  onClick={() => checkExtension()}
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
                >
                  Retry Check
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="pwa-container bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
        <div className="relative z-10 p-4">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              size="sm"
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Browser Data Backup
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Backup and restore your data
              </p>
            </div>
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8 max-w-2xl">

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/50 dark:bg-slate-800/50 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-slate-900/30 p-6 space-y-6"
          >
            
            {/* Backup Status */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center">
                <HardDrive className="w-5 h-5 mr-2" />
                Backup Status
              </h2>
              
              {isCheckingBackup ? (
                <div className="flex items-center space-x-3 p-4 bg-slate-100/80 dark:bg-slate-700/50 rounded-xl">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400/20 border-t-slate-600"></div>
                  <span className="text-slate-600 dark:text-slate-400">Checking backup status...</span>
                </div>
              ) : backupInfo.hasBackup ? (
                <div className="p-4 bg-green-50/80 dark:bg-green-950/40 border border-green-200/40 dark:border-green-800/40 rounded-xl">
                  <div className="flex items-center space-x-2 text-green-700 dark:text-green-300 mb-2">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-semibold">Backup Available</span>
                  </div>
                  <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
                    {backupInfo.createdAt && (
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>Created: {formatDate(backupInfo.createdAt)}</span>
                      </div>
                    )}
                    {backupInfo.size && (
                      <div className="flex items-center space-x-1">
                        <Database className="h-3 w-3" />
                        <span>Size: {formatFileSize(backupInfo.size)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-orange-50/80 dark:bg-orange-950/40 border border-orange-200/40 dark:border-orange-800/40 rounded-xl">
                  <div className="flex items-center space-x-2 text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-semibold">No backup found</span>
                  </div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    Create your first backup to secure your workflows and settings
                  </p>
                </div>
              )}
            </div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 bg-red-50/80 dark:bg-red-950/40 border border-red-200/40 dark:border-red-800/40 rounded-xl"
                >
                  <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Error</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    onClick={() => setError('')}
                  >
                    Dismiss
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Backup Button */}
              <Button
                onClick={showBackupConfirmation}
                disabled={isLoading}
                className="h-14 text-base font-medium rounded-xl bg-transparent border-2 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600/20 border-t-blue-600 mr-2"></div>
                    Creating Backup...
                  </div>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Create Backup
                  </>
                )}
              </Button>

              {/* Restore Button */}
              <Button
                onClick={showRestoreConfirmation}
                disabled={isLoading || !backupInfo.hasBackup}
                className="h-14 text-base font-medium rounded-xl bg-transparent border-2 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-950/50 text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600/20 border-t-green-600 mr-2"></div>
                    Restoring...
                  </div>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Restore Backup
                  </>
                )}
              </Button>
            </div>

            {/* Information */}
            <div className="p-4 bg-slate-100/80 dark:bg-slate-700/50 rounded-xl">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">What gets backed up:</h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• Workflow data (localStorage: comfyui_workflows)</li>
                <li>• API keys (IndexedDB: apiKeys)</li>
                <li>• Workflow storage (IndexedDB: workflows)</li>
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-3">
                Note: Only one backup file is maintained. New backups overwrite the existing one.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Confirmation Dialog */}
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 pwa-modal z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="relative max-w-md w-full bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 flex flex-col overflow-hidden">
              {/* Gradient Overlay for Enhanced Glass Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

              {/* Dialog Header */}
              <div className="relative flex items-center justify-between p-4 border-b border-white/10 dark:border-slate-600/10 flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <div className={`w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center border ${
                    confirmDialog.type === 'backup'
                      ? 'bg-blue-500/20 border-blue-400/30'
                      : 'bg-orange-500/20 border-orange-400/30'
                  }`}>
                    {confirmDialog.type === 'backup' ? (
                      <Download className="w-4 h-4 text-blue-300" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-orange-300" />
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {confirmDialog.title}
                  </h3>
                </div>
              </div>

              {/* Dialog Content */}
              <div className="relative p-4">
                <p className="text-white/90 mb-4">
                  {confirmDialog.message}
                </p>
                {confirmDialog.type === 'restore' && (
                  <div className="p-3 bg-orange-500/10 border border-orange-400/20 rounded-lg mb-4">
                    <p className="text-orange-200 text-sm font-medium">⚠️ Warning</p>
                    <p className="text-orange-300/90 text-sm mt-1">
                      This action cannot be undone. Make sure you have a current backup if needed.
                    </p>
                  </div>
                )}
              </div>

              {/* Dialog Footer */}
              <div className="relative flex justify-end gap-2 p-4 border-t border-white/10 dark:border-slate-600/10 flex-shrink-0">
                <Button
                  onClick={closeConfirmDialog}
                  variant="outline"
                  className="bg-white/10 backdrop-blur-sm text-white/90 border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDialog.onConfirm}
                  className={`backdrop-blur-sm text-white transition-all duration-300 ${
                    confirmDialog.type === 'backup'
                      ? 'bg-blue-500/80 hover:bg-blue-500/90 border border-blue-400/30 hover:border-blue-400/50'
                      : 'bg-orange-500/80 hover:bg-orange-500/90 border border-orange-400/30 hover:border-orange-400/50'
                  }`}
                >
                  {confirmDialog.confirmText}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
};

export default BrowserDataBackup;