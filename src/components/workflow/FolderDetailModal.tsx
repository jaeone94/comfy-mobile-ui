import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Folder, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { FolderItem, FolderStructure } from '@/types/folder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';

interface FolderDetailModalProps {
    isOpen: boolean;
    folder: FolderItem | null;
    folderStructure: FolderStructure;
    allWorkflows: Workflow[];
    onClose: () => void;
    onDelete: (folderId: string) => void;
}

const FolderDetailModal: React.FC<FolderDetailModalProps> = ({
    isOpen,
    folder,
    folderStructure,
    allWorkflows,
    onClose,
    onDelete,
}) => {
    const { t } = useTranslation();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    if (!folder) return null;

    // Calculate stats
    const workflowCount = folder.workflows.length;
    const subfolderCount = folder.children.length;

    // Get preview workflows (first 4)
    const previewWorkflows = folder.workflows
        .slice(0, 4)
        .map(id => allWorkflows.find(w => w.id === id))
        .filter((w): w is Workflow => !!w);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            if (showDeleteConfirm) {
                setShowDeleteConfirm(false);
            } else {
                onClose();
            }
        }
    };

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        onDelete(folder.id);
        setShowDeleteConfirm(false);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
                    onClick={handleBackdropClick}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative w-full max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />

                        {showDeleteConfirm ? (
                            // Delete Confirmation View
                            <div className="p-6 space-y-6">
                                <div className="flex flex-col items-center text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                                        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                        {t('folder.deleteConfirm')}
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                        {t('folder.deleteMessage', { workflowCount, subfolderCount })}
                                        <br /><br />
                                        {t('folder.deleteConfirmQuery')}
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        variant="outline"
                                        className="flex-1 py-3 rounded-xl border-slate-200 dark:border-slate-700"
                                    >
                                        {t('common.cancel')}
                                    </Button>
                                    <Button
                                        onClick={handleConfirmDelete}
                                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white border-none"
                                    >
                                        {t('folder.confirmDelete')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            // Normal Detail View
                            <>
                                {/* Header */}
                                <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 dark:border-slate-600/10">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shadow-lg">
                                            <Folder className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                                                {folder.name}
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-400">
                                                {t('folder.details')}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="flex-shrink-0 ml-3 p-2 bg-white/30 dark:bg-slate-700/30 backdrop-blur-sm border border-white/20 dark:border-slate-600/20 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-200 rounded-xl"
                                        aria-label={t('common.close')}
                                    >
                                        <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-6 space-y-6 relative z-10">
                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 flex flex-col items-center justify-center text-center">
                                            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                                                {workflowCount}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {t('workflow.listTitle')}
                                            </span>
                                        </div>
                                        <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 flex flex-col items-center justify-center text-center">
                                            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                                                {subfolderCount}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {t('folder.subfolders')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Preview Grid */}
                                    {previewWorkflows.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {t('common.preview')}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {previewWorkflows.map((wf) => (
                                                    <div
                                                        key={wf.id}
                                                        className="aspect-square rounded-xl overflow-hidden bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/30 dark:border-slate-600/30 relative"
                                                    >
                                                        {wf.thumbnail ? (
                                                            <img
                                                                src={wf.thumbnail}
                                                                alt={wf.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <FileText className="w-6 h-6 text-slate-400" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Created Date */}
                                    <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 flex items-center justify-between">
                                        <span className="text-sm text-slate-600 dark:text-slate-400">{t('workflow.created')}</span>
                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {new Date(folder.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="relative z-10 px-6 py-4 border-t border-white/10 dark:border-slate-600/10 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl">
                                    <Button
                                        onClick={handleDeleteClick}
                                        variant="ghost"
                                        className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 flex items-center justify-center gap-2"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        {t('folder.deleteFolder')}
                                    </Button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default FolderDetailModal;
