import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  Save,
  Upload,
  Trash2,
  FileText,
  AlertTriangle,
  X,
  Clock,
  Edit3,
  Search,
  Loader2,
  Sparkles,
  ChevronRight,
  History
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
import { toast } from 'sonner';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    if (!isOpen || !currentWorkflowId) return;
    setIsLoading(true);
    setError('');

    try {
      const endpoint = `/comfymobile/api/snapshots/workflow/${currentWorkflowId}`;
      const response: ListSnapshotsResponse = await apiCall(endpoint);

      if (response.success) {
        setSnapshots(response.snapshots);
      } else {
        setError(response.error || t('workflow.snapshot.loadFailed'));
      }
    } catch (error) {
      setError(t('common.serverError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Save snapshot
  const handleSaveSnapshot = async () => {
    if (!saveTitle.trim()) {
      toast.error(t('workflow.snapshot.titleRequired'));
      return;
    }

    setIsSaving(true);
    try {
      const workflowData = await onSaveSnapshot(currentWorkflowId, saveTitle.trim());
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
        toast.success(t('workflow.updateSuccess'));
        loadSnapshots();
      } else {
        toast.error(response.error || t('workflow.snapshot.saveFailed'));
      }
    } catch (error) {
      toast.error(t('workflow.snapshot.saveFailed'));
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
      toast.error(t('workflow.snapshot.renameRequired'));
      return;
    }

    setIsRenaming(true);
    try {
      const response = await apiCall(`/comfymobile/api/snapshots/${snapshotToRename.filename}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ title: renameTitle.trim() })
      });

      if (response.success) {
        setRenameModalOpen(false);
        setSnapshotToRename(null);
        setRenameTitle('');
        toast.success(t('workflow.updateSuccess'));
        loadSnapshots();
      } else {
        toast.error(response.error || t('workflow.snapshot.renameFailed'));
      }
    } catch (error) {
      toast.error(t('workflow.snapshot.renameFailed'));
    } finally {
      setIsRenaming(false);
    }
  };

  // Load snapshot
  const handleLoadSnapshot = async () => {
    if (!snapshotToLoad) return;

    setIsLoading(true);
    setLoadWarningOpen(false);

    try {
      const response: LoadSnapshotResponse = await apiCall(`/comfymobile/api/snapshots/${snapshotToLoad.filename}`);

      if (response.success && response.snapshot) {
        onLoadSnapshot(response.snapshot.workflow_snapshot);
        toast.success(t('workflow.snapshot.loadSuccess'));
        onClose();
      } else {
        toast.error(response.error || t('workflow.snapshot.loadFailed'));
      }
    } catch (error) {
      toast.error(t('workflow.snapshot.loadFailed'));
    } finally {
      setIsLoading(false);
      setSnapshotToLoad(null);
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async () => {
    if (!snapshotToDelete) return;

    setIsDeleting(true);
    try {
      const response: DeleteSnapshotResponse = await apiCall(`/comfymobile/api/snapshots/${snapshotToDelete.filename}`, {
        method: 'DELETE'
      });

      if (response.success) {
        setDeleteConfirmOpen(false);
        setSnapshotToDelete(null);
        toast.success(t('workflow.snapshot.deleteSuccess'));
        loadSnapshots();
      } else {
        toast.error(response.error || t('workflow.snapshot.deleteFailed'));
      }
    } catch (error) {
      toast.error(t('workflow.snapshot.deleteFailed'));
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
      setCurrentTime(now.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const filteredSnapshots = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return snapshots;
    return snapshots.filter(s => s.title.toLowerCase().includes(query));
  }, [snapshots, searchQuery]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  const baseTitleSize = '1.875rem';

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-hidden">
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
          className="relative w-[85vw] h-[80vh] pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-[40px] shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Sticky Header */}
            <div className="absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] pt-2 pb-[13px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 scale-75">
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all pointer-events-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0 pointer-events-none">
                <div className="flex items-center space-x-2 mb-1 scale-90 origin-left">
                  <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-white/80 border-transparent">
                    HISTORY
                  </Badge>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                    {t('workflow.snapshot.title')}
                  </span>
                </div>
                <div className="flex items-center min-w-0 h-[13px]">
                  <h2
                    style={{
                      fontSize: baseTitleSize,
                      lineHeight: '1',
                      transform: `scale(${0.8125 / 1.875})`,
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {t('workflow.snapshot.title')}
                  </h2>
                </div>
              </div>
            </div>

            {/* Persistent Controls Bar */}
            <div className="absolute left-0 w-full z-20 px-4 sm:px-8 top-[68px]">
              <div className="flex items-center gap-2 bg-[#374151]/90 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('workflow.searchPlaceholder')}
                    className="w-full bg-black/40 border-white/10 text-xs text-white/90 placeholder:text-white/20 h-10 pl-9 pr-8 rounded-xl focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20 transition-all duration-300 border shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3 text-white/40" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              <div className="h-[140px] relative pointer-events-none" />

              <div className="px-6 pb-8 sm:px-8">
                {/* HEAD Section */}
                {!searchQuery && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3 p-1">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">
                        {t('workflow.snapshot.live')}
                      </span>
                    </div>
                    <div className="relative rounded-3xl bg-blue-500/5 border border-blue-500/20 p-5 flex items-center justify-between group/live">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover/live:opacity-100 transition-opacity rounded-3xl" />
                      <div className="flex items-center space-x-4 min-w-0 relative z-10 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 flex-shrink-0">
                          <History className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-bold text-white/95 text-sm tracking-tight">{t('workflow.snapshot.currentState')}</span>
                          <span className="text-[10px] font-medium text-blue-400/60 uppercase tracking-wider tabular-nums">{currentTime} • {t('workflow.snapshot.uncapturedChanges')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 relative z-10">
                        <Button
                          onClick={() => setIsSaveModalOpen(true)}
                          disabled={!currentWorkflowId || isSaving}
                          variant="ghost"
                          className="h-9 px-4 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/20 rounded-xl transition-all shadow-lg shadow-blue-600/10 active:scale-95 flex items-center gap-2"
                        >
                          <Camera className="w-4 h-4" />
                          <span className="hidden sm:inline-block font-bold text-[10px] uppercase tracking-wider">{t('workflow.snapshot.saveButton')}</span>
                        </Button>
                        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 font-bold px-3 py-1 rounded-full text-[10px] animate-pulse">
                          HEAD
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 animate-spin text-white/20" />
                      <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-blue-400/50 animate-pulse" />
                    </div>
                  </div>
                ) : filteredSnapshots.length === 0 ? (
                  <div className="text-center py-12 rounded-[32px] bg-black/20 border border-dashed border-white/10">
                    <History className="h-10 w-10 text-white/10 mx-auto mb-3" />
                    <p className="text-white/40 text-sm font-medium">{t('workflow.snapshot.noSnapshots')}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-2 p-1">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-white/50" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                          {t('menu.workflowSnapshots')} ({filteredSnapshots.length})
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {filteredSnapshots.map((snapshot) => (
                        <div
                          key={snapshot.filename}
                          className="group relative rounded-3xl bg-black/10 border border-white/5 hover:bg-black/20 hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center p-4 overflow-hidden gap-4"
                        >
                          <div className="flex items-center space-x-4 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-white/10 group-hover:border-white/10 transition-all flex-shrink-0">
                              <FileText className="w-5 h-5 text-white/40 group-hover:text-white/60" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-white/90 truncate text-sm tracking-tight mb-1">{snapshot.title}</span>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-white/20 uppercase tracking-wider">
                                <span className="whitespace-nowrap">{formatDate(snapshot.createdAt)}</span>
                                <span className="hidden sm:inline">•</span>
                                <span className="whitespace-nowrap">{formatFileSize(snapshot.fileSize)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-white/5 md:pt-0 md:border-t-0 md:ml-4">
                            <button
                              onClick={() => showRenameModal(snapshot)}
                              className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all border border-white/5 flex-shrink-0"
                              title={t('workflow.snapshot.rename')}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setSnapshotToDelete(snapshot); setDeleteConfirmOpen(true); }}
                              className="p-2.5 rounded-xl bg-white/5 text-red-400/40 hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/5 flex-shrink-0"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => showLoadWarning(snapshot)}
                              className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all border border-blue-500/20 active:scale-95 h-11 px-4 flex items-center gap-2 flex-shrink-0"
                            >
                              <Upload className="w-4 h-4" />
                              <span className="font-bold text-[10px] uppercase tracking-widest">{t('workflow.snapshot.load')}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sub-modals - Enhanced design */}
      <AnimatePresence>
        {(isSaveModalOpen || renameModalOpen || loadWarningOpen || deleteConfirmOpen) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => {
                setIsSaveModalOpen(false);
                setRenameModalOpen(false);
                setLoadWarningOpen(false);
                setDeleteConfirmOpen(false);
              }}
            />

            {/* Save Modal */}
            {isSaveModalOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-[#1F2937] rounded-[32px] border border-white/10 shadow-2xl p-8 space-y-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                    <Save className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t('workflow.snapshot.saveTitle')}</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-white/50 leading-relaxed">{t('workflow.snapshot.saveDesc')}</p>
                  <Input
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    placeholder={t('workflow.snapshot.savePlaceholder')}
                    className="bg-black/40 border-white/10 text-white rounded-2xl h-12 px-5"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-white/40 hover:bg-white/5" onClick={() => setIsSaveModalOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={handleSaveSnapshot} disabled={isSaving || !saveTitle.trim()}>
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Rename Modal */}
            {renameModalOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-[#1F2937] rounded-[32px] border border-white/10 shadow-2xl p-8 space-y-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                    <Edit3 className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t('workflow.snapshot.renameTitle')}</h3>
                </div>
                <div className="space-y-4">
                  <Input
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    className="bg-black/40 border-white/10 text-white rounded-2xl h-12 px-5"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-white/40 hover:bg-white/5" onClick={() => setRenameModalOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={handleRenameSnapshot} disabled={isRenaming || !renameTitle.trim()}>
                    {isRenaming ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Load Warning Modal */}
            {loadWarningOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-[#1F2937] rounded-[32px] border border-white/10 shadow-2xl p-8 space-y-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t('workflow.snapshot.loadWarningTitle')}</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-white/50 leading-relaxed font-medium">{t('workflow.snapshot.loadWarningDesc')}</p>
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">{t('workflow.snapshot.loadingLabel', { title: '' })}</p>
                    <p className="text-sm font-bold text-white/90">{snapshotToLoad?.title}</p>
                  </div>
                  <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20">
                    <p className="text-xs font-bold text-red-400">{t('workflow.snapshot.loadWarningCritical')}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-white/40 hover:bg-white/5" onClick={() => setLoadWarningOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={handleLoadSnapshot}>
                    {t('workflow.snapshot.loadAnyway')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Delete Modal */}
            {deleteConfirmOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-[#1F2937] rounded-[32px] border border-white/10 shadow-2xl p-8 space-y-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                    <Trash2 className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t('workflow.snapshot.deleteTitle')}</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-white/50 leading-relaxed">{t('workflow.snapshot.deleteDesc')}</p>
                  <p className="font-bold text-white/90 text-sm">{snapshotToDelete?.title}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-white/40 hover:bg-white/5" onClick={() => setDeleteConfirmOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1 h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold" onClick={handleDeleteSnapshot} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.delete')}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>
    </AnimatePresence>,
    document.body
  );
};