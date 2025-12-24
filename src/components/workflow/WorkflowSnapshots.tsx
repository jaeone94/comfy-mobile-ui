import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Camera,
  Save,
  Upload,
  Trash2,
  Calendar,
  FileText,
  AlertTriangle,
  X,
  ArrowLeft,
  Clock,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WorkflowSnapshotListItem,
  SaveSnapshotRequest,
  SaveSnapshotResponse,
  LoadSnapshotResponse,
  ListSnapshotsResponse,
  DeleteSnapshotResponse
} from '@/shared/types/app/workflowSnapshot';
import { IComfyJson } from '@/shared/types/app/IComfyJson';

interface WorkflowSnapshotsProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkflowId: string;
  onSaveSnapshot: (workflowId: string, title: string) => Promise<IComfyJson>; // Returns serialized workflow data
  onLoadSnapshot: (snapshotData: IComfyJson) => void; // Loads snapshot data into current workflow
  serverUrl: string;
}

export const WorkflowSnapshots: React.FC<WorkflowSnapshotsProps> = ({
  isOpen,
  onClose,
  currentWorkflowId,
  onSaveSnapshot,
  onLoadSnapshot,
  serverUrl
}) => {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<WorkflowSnapshotListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  // Save snapshot states
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation states  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [snapshotToDelete, setSnapshotToDelete] = useState<WorkflowSnapshotListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load warning states
  const [loadWarningOpen, setLoadWarningOpen] = useState(false);
  const [snapshotToLoad, setSnapshotToLoad] = useState<WorkflowSnapshotListItem | null>(null);

  // Rename modal states
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [snapshotToRename, setSnapshotToRename] = useState<WorkflowSnapshotListItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Remove tab state - only show current workflow snapshots

  // API call helper
  const apiCall = async (endpoint: string, options?: RequestInit) => {
    try {
      const response = await fetch(`${serverUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };

  // Load snapshots - only current workflow snapshots
  const loadSnapshots = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Always load only current workflow snapshots
      const endpoint = `/comfymobile/api/snapshots/workflow/${currentWorkflowId}`;

      const response: ListSnapshotsResponse = await apiCall(endpoint);

      if (response.success) {
        setSnapshots(response.snapshots);
      } else {
        setError(response.error || t('workflow.snapshot.loadFailed'));
      }
    } catch (error) {
      setError(t('common.serverError'));
      console.error('Load snapshots error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Save snapshot
  const handleSaveSnapshot = async () => {
    if (!saveTitle.trim()) {
      setError(t('workflow.snapshot.titleRequired'));
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // Get serialized workflow data from parent
      const workflowData = await onSaveSnapshot(currentWorkflowId, saveTitle.trim());

      // Send to API
      const requestData: SaveSnapshotRequest = {
        workflow_id: currentWorkflowId,
        title: saveTitle.trim(),
        workflow_snapshot: workflowData
      };

      const response: SaveSnapshotResponse = await apiCall('/comfymobile/api/snapshots', {
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      if (response.success) {
        setIsSaveModalOpen(false);
        setSaveTitle('');
        loadSnapshots(); // Refresh the list

        // Show success message (you can replace this with a toast)
        console.log('Snapshot saved successfully:', response.message);
      } else {
        setError(response.error || t('workflow.snapshot.saveFailed'));
      }
    } catch (error) {
      setError(t('workflow.snapshot.saveFailed'));
      console.error('Save snapshot error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Show load warning modal
  const showLoadWarning = (snapshot: WorkflowSnapshotListItem) => {
    setSnapshotToLoad(snapshot);
    setLoadWarningOpen(true);
  };

  // Show rename modal
  const showRenameModal = (snapshot: WorkflowSnapshotListItem) => {
    setSnapshotToRename(snapshot);
    setRenameTitle(snapshot.title);
    setRenameModalOpen(true);
  };

  // Rename snapshot
  const handleRenameSnapshot = async () => {
    if (!snapshotToRename || !renameTitle.trim()) {
      setError(t('workflow.snapshot.renameRequired'));
      return;
    }

    setIsRenaming(true);
    setError('');

    try {
      const response = await apiCall(`/comfymobile/api/snapshots/${snapshotToRename.filename}/rename`, {
        method: 'PUT',
        body: JSON.stringify({
          title: renameTitle.trim()
        })
      });

      if (response.success) {
        setRenameModalOpen(false);
        setSnapshotToRename(null);
        setRenameTitle('');
        loadSnapshots(); // Refresh the list

        console.log('Snapshot renamed successfully:', response.message);
      } else {
        setError(response.error || t('workflow.snapshot.renameFailed'));
      }
    } catch (error) {
      setError(t('workflow.snapshot.renameFailed'));
      console.error('Rename snapshot error:', error);
    } finally {
      setIsRenaming(false);
    }
  };

  // Load snapshot (after confirmation)
  const handleLoadSnapshot = async () => {
    if (!snapshotToLoad) return;

    setIsLoading(true);
    setError('');
    setLoadWarningOpen(false);

    try {
      const response: LoadSnapshotResponse = await apiCall(`/comfymobile/api/snapshots/${snapshotToLoad.filename}`);

      if (response.success && response.snapshot) {
        onLoadSnapshot(response.snapshot.workflow_snapshot);
        onClose(); // Close the modal after loading

        console.log('Snapshot loaded successfully:', response.message);
      } else {
        setError(response.error || t('workflow.snapshot.loadFailed'));
      }
    } catch (error) {
      setError(t('workflow.snapshot.loadFailed'));
      console.error('Load snapshot error:', error);
    } finally {
      setIsLoading(false);
      setSnapshotToLoad(null);
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async () => {
    if (!snapshotToDelete) return;

    setIsDeleting(true);
    setError('');

    try {
      const response: DeleteSnapshotResponse = await apiCall(`/comfymobile/api/snapshots/${snapshotToDelete.filename}`, {
        method: 'DELETE'
      });

      if (response.success) {
        setDeleteConfirmOpen(false);
        setSnapshotToDelete(null);
        loadSnapshots(); // Refresh the list

        console.log('Snapshot deleted successfully:', response.message);
      } else {
        setError(response.error || t('workflow.snapshot.deleteFailed'));
      }
    } catch (error) {
      setError(t('workflow.snapshot.deleteFailed'));
      console.error('Delete snapshot error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Load snapshots when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
    }
  }, [isOpen, currentWorkflowId]);

  // Live timer update
  useEffect(() => {
    if (!isOpen) return;

    const updateTime = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      setCurrentTime(timeString);
    };

    // Initial update
    updateTime();

    // Update every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Enhanced Glassmorphism Modal Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pwa-modal z-50 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md"
            onClick={onClose}
          >
            {/* Full Screen Main Snapshots Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-0 pwa-modal flex items-center justify-center p-4"
            >
              <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">
                {/* Gradient Overlay for Enhanced Glass Effect */}
                <div className="absolute inset-0 pwa-modal bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
                {/* Glassmorphism Header */}
                <div className="relative flex items-center justify-between p-6 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                  <div className="flex items-center space-x-3">
                    <Camera className="h-5 w-5 text-blue-500 dark:text-blue-400 drop-shadow-sm" />
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                      {t('workflow.snapshot.title')}
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  {/* Current Status (HEAD) Item */}
                  <div className="bg-gradient-to-r from-blue-50/80 to-cyan-50/80 dark:from-blue-950/40 dark:to-cyan-950/40 backdrop-blur border-2 border-dashed border-blue-200 dark:border-blue-700 p-4 rounded-xl relative">
                    <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-lg">
                      HEAD
                    </div>
                    <div className="space-y-3">
                      <div className="font-semibold text-blue-800 dark:text-blue-200 text-base leading-tight flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 animate-pulse"></div>
                        {t('workflow.snapshot.currentState')}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-blue-600/80 dark:text-blue-300/80">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className="font-mono">{currentTime || t('workflow.snapshot.live')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          <span>{t('workflow.snapshot.uncapturedChanges')}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          onClick={() => setIsSaveModalOpen(true)}
                          disabled={!currentWorkflowId}
                          className="flex-1 h-10 px-4 rounded-lg bg-blue-600/10 border-2 border-blue-300 dark:border-blue-600 hover:bg-blue-600/20 dark:hover:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 font-medium transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {t('workflow.snapshot.saveButton')}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Error Display */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-100/80 dark:bg-red-900/40 backdrop-blur-sm border border-red-200/50 dark:border-red-800/50 rounded-2xl"
                    >
                      <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm flex-1">{error}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-red-200/50 dark:hover:bg-red-800/50 rounded-full"
                          onClick={() => setError('')}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Snapshots List */}
                  <div className="max-h-[50vh] overflow-y-auto space-y-3">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600/20 border-t-blue-600"></div>
                      </div>
                    ) : snapshots.length === 0 ? (
                      <div className="text-center py-12 px-4 text-slate-600 dark:text-slate-400">
                        <div className="bg-slate-100/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                          <Camera className="h-8 w-8" />
                        </div>
                        <p className="text-lg font-medium mb-2">No snapshots yet</p>
                        <p className="text-sm leading-relaxed opacity-80">
                          Save your first workflow snapshot to<br />
                          preserve current settings
                        </p>
                      </div>
                    ) : (
                      snapshots.map((snapshot, index) => (
                        <motion.div
                          key={snapshot.filename}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-white/30 dark:bg-slate-800/30 backdrop-blur p-4 rounded-xl border border-slate-200/40 dark:border-slate-700/40 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          {/* Mobile-first layout */}
                          <div className="space-y-3">
                            {/* Title with Edit Button */}
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-tight flex-1 min-w-0">
                                {snapshot.title}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => showRenameModal(snapshot)}
                                className="ml-2 h-8 w-8 p-0 rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-150 active:scale-95 flex-shrink-0"
                                title={t('workflow.snapshot.rename')}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            {/* Info row */}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{formatDate(snapshot.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                <span>{formatFileSize(snapshot.fileSize)}</span>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-1">
                              <Button
                                variant="outline"
                                onClick={() => showLoadWarning(snapshot)}
                                disabled={isLoading}
                                className="flex-1 h-11 px-4 rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 active:text-blue-800 dark:active:text-blue-200 active:border-blue-400 dark:active:border-blue-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {t('workflow.snapshot.load')}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSnapshotToDelete(snapshot);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="h-11 w-11 rounded-xl bg-transparent border transition-all duration-150 p-0 active:scale-95 active:translate-y-px border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 active:text-red-800 dark:active:text-red-200 active:border-red-400 dark:active:border-red-600 shadow-none hover:shadow-sm active:shadow-none"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Snapshot Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pwa-modal z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setIsSaveModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-slate-900/30"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200/40 dark:border-slate-700/40">
                <div className="flex items-center space-x-3">
                  <Save className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Save Snapshot
                  </h2>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5">
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('workflow.snapshot.saveDesc')}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Snapshot Name
                  </label>
                  <Input
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    placeholder={t('workflow.snapshot.savePlaceholder')}
                    disabled={isSaving}
                    onKeyPress={(e) => e.key === 'Enter' && !isSaving && handleSaveSnapshot()}
                    className="h-12 text-base bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-xl focus:border-slate-300/50 dark:focus:border-slate-600/50"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={isSaving}
                  className="w-full sm:w-auto h-12 text-base rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 active:text-slate-800 dark:active:text-slate-200 active:border-slate-400 dark:active:border-slate-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveSnapshot}
                  disabled={isSaving || !saveTitle.trim()}
                  className="w-full sm:w-auto h-12 text-base font-medium rounded-xl bg-transparent border transition-all duration-150 active:translate-y-px border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-300 dark:hover:border-green-700 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 active:text-green-800 dark:active:text-green-200 active:border-green-400 dark:active:border-green-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  {isSaving ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600/20 border-t-green-600 mr-2"></div>
                      {t('common.saving')}
                    </div>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t('workflow.snapshot.saveButton')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Snapshot Modal */}
      <AnimatePresence>
        {renameModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pwa-modal z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setRenameModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-slate-900/30"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200/40 dark:border-slate-700/40">
                <div className="flex items-center space-x-3">
                  <Edit3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t('workflow.snapshot.renameTitle')}
                  </h2>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5">
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('workflow.snapshot.renameDesc')}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Snapshot Name
                  </label>
                  <Input
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    placeholder={t('workflow.snapshot.renamePlaceholder')}
                    disabled={isRenaming}
                    onKeyPress={(e) => e.key === 'Enter' && !isRenaming && handleRenameSnapshot()}
                    className="h-12 text-base bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-xl focus:border-slate-300/50 dark:focus:border-slate-600/50"
                    autoFocus
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setRenameModalOpen(false)}
                  disabled={isRenaming}
                  className="w-full sm:w-auto h-12 text-base rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 active:text-slate-800 dark:active:text-slate-200 active:border-slate-400 dark:active:border-slate-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRenameSnapshot}
                  disabled={isRenaming || !renameTitle.trim()}
                  className="w-full sm:w-auto h-12 text-base font-medium rounded-xl bg-transparent border transition-all duration-150 active:translate-y-px border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 active:text-blue-800 dark:active:text-blue-200 active:border-blue-400 dark:active:border-blue-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  {isRenaming ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600/20 border-t-blue-600 mr-2"></div>
                      {t('workflow.snapshot.renaming')}
                    </div>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t('common.saveChanges')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load Warning Modal */}
      <AnimatePresence>
        {loadWarningOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pwa-modal z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setLoadWarningOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-slate-900/30"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200/40 dark:border-slate-700/40">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  <h2 className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                    {t('workflow.snapshot.loadWarningTitle')}
                  </h2>
                </div>
              </div>

              {/* Content */}
              {snapshotToLoad && (
                <div className="p-6 space-y-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Loading this snapshot will <strong>replace your current workflow state</strong>.
                    If you haven't saved your current changes to a snapshot, they will be lost permanently.
                  </div>

                  <div className="p-4 bg-orange-50/80 dark:bg-orange-950/40 backdrop-blur border border-orange-200/40 dark:border-orange-800/40 rounded-xl">
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                      {t('workflow.snapshot.loadingLabel', { title: snapshotToLoad.title })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t('workflow.snapshot.createdOn', { date: formatDate(snapshotToLoad.createdAt) })}
                    </div>
                  </div>

                  <div className="p-4 bg-red-50/80 dark:bg-red-950/40 backdrop-blur border border-red-200/40 dark:border-red-800/40 rounded-xl">
                    <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <div className="text-sm font-medium">
                        {t('workflow.snapshot.loadWarningCritical')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="p-6 pt-0 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setLoadWarningOpen(false)}
                  disabled={isLoading}
                  className="w-full sm:w-auto h-12 text-base rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 active:text-slate-800 dark:active:text-slate-200 active:border-slate-400 dark:active:border-slate-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLoadSnapshot}
                  disabled={isLoading}
                  className="w-full sm:w-auto h-12 text-base font-medium rounded-xl bg-transparent border transition-all duration-150 active:translate-y-px border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 active:text-orange-800 dark:active:text-orange-200 active:border-orange-400 dark:active:border-orange-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-600/20 border-t-orange-600 mr-2"></div>
                      {t('common.loading')}
                    </div>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {t('workflow.snapshot.loadAnyway')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pwa-modal z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white/50 dark:bg-slate-800/50 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-slate-900/30"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200/40 dark:border-slate-700/40">
                <div className="flex items-center space-x-3">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
                    {t('workflow.snapshot.deleteTitle')}
                  </h2>
                </div>
              </div>

              {/* Content */}
              {snapshotToDelete && (
                <div className="p-6 space-y-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('workflow.snapshot.deleteDesc')}
                  </div>

                  <div className="p-4 bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 rounded-xl">
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                      {snapshotToDelete.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t('workflow.snapshot.createdOn', { date: formatDate(snapshotToDelete.createdAt) })}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="p-6 pt-0 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="w-full sm:w-auto h-12 text-base rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 active:text-slate-800 dark:active:text-slate-200 active:border-slate-400 dark:active:border-slate-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDeleteSnapshot}
                  disabled={isDeleting}
                  className="w-full sm:w-auto h-12 text-base font-medium rounded-xl bg-transparent border transition-all duration-150 active:translate-y-px border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 active:text-red-800 dark:active:text-red-200 active:border-red-400 dark:active:border-red-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
                >
                  {isDeleting ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600/20 border-t-red-600 mr-2"></div>
                      {t('common.deleting')}
                    </div>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('common.delete')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WorkflowSnapshots;