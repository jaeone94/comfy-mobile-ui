import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Folder, FileText, Trash2, AlertTriangle, FolderInput } from 'lucide-react';
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
    onMove?: (folder: FolderItem) => void;
}

const FolderDetailModal: React.FC<FolderDetailModalProps> = ({
    isOpen,
    folder,
    folderStructure,
    allWorkflows,
    onClose,
    onDelete,
    onMove,
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
                        className="relative w-full max-w-md bg-[#101217] rounded-xl shadow-2xl border border-white/10 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none rounded-xl" />

                        {showDeleteConfirm ? (
                            // Delete Confirmation View
                            <div className="p-4 space-y-6">
                                <div className="flex flex-col items-center text-center space-y-2.5">
                                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                                        <AlertTriangle className="w-8 h-8 text-[#f87c7c]" />
                                    </div>
                                    <h3 className="text-[14px] font-bold text-[#e9ebef]">
                                        {t('folder.deleteConfirm')}
                                    </h3>
                                    <p className="text-[12px] text-[#8a919e] leading-relaxed">
                                        {t('folder.deleteMessage', { workflowCount, subfolderCount })}
                                        <br /><br />
                                        {t('folder.deleteConfirmQuery')}
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        variant="outline"
                                        className="flex-1 py-3 rounded-xl border-white/[0.08]"
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
                                <div className="relative z-10 flex items-center justify-between px-4 py-4 border-b border-white/[0.08]">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shadow-lg">
                                            <Folder className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-[14px] font-bold text-[#e9ebef] truncate">
                                                {folder.name}
                                            </h2>
                                            <p className="text-xs text-[#8a919e]">
                                                {t('folder.details')}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="flex-shrink-0 ml-3 p-2 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-all duration-200 rounded-xl"
                                        aria-label={t('common.close')}
                                    >
                                        <X className="w-5 h-5 text-[#c8ccd4]" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-4 space-y-6 relative z-10">
                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div className="bg-white/[0.03] rounded-[10px] p-3 border border-white/[0.08] flex flex-col items-center justify-center text-center">
                                            <span className="text-[15px] font-bold text-[#e9ebef] mb-1">
                                                {workflowCount}
                                            </span>
                                            <span className="text-xs text-[#71798a] font-medium">
                                                {t('workflow.listTitle')}
                                            </span>
                                        </div>
                                        <div className="bg-white/[0.03] rounded-[10px] p-3 border border-white/[0.08] flex flex-col items-center justify-center text-center">
                                            <span className="text-[15px] font-bold text-[#e9ebef] mb-1">
                                                {subfolderCount}
                                            </span>
                                            <span className="text-xs text-[#71798a] font-medium">
                                                {t('folder.subfolders')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Preview Grid */}
                                    {previewWorkflows.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[12px] font-medium text-[#c8ccd4]">
                                                {t('common.preview')}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {previewWorkflows.map((wf) => (
                                                    <div
                                                        key={wf.id}
                                                        className="aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.07] relative"
                                                    >
                                                        {wf.thumbnail ? (
                                                            <img
                                                                src={wf.thumbnail}
                                                                alt={wf.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <FileText className="w-6 h-6 text-[#565d6b]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Created Date */}
                                    <div className="bg-white/[0.03] rounded-[10px] p-3 border border-white/[0.08] flex items-center justify-between">
                                        <span className="text-[12px] text-[#8a919e]">{t('workflow.created')}</span>
                                        <span className="text-[12px] font-medium text-[#e9ebef]">
                                            {new Date(folder.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="relative z-10 px-4 py-4 border-t border-white/[0.08] bg-[#0f1116]/90 backdrop-blur-xl flex gap-3">
                                    {onMove && (
                                        <Button
                                            onClick={() => onMove(folder)}
                                            variant="ghost"
                                            className="flex-1 py-3 rounded-[10px] bg-blue-500/10 border border-blue-400/30 text-[#5b8af5] hover:bg-blue-500/20 hover:text-blue-700 dark:hover:text-blue-300 flex items-center justify-center gap-2"
                                        >
                                            <FolderInput className="w-5 h-5" />
                                            {t('folder.moveTitle')}
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleDeleteClick}
                                        variant="ghost"
                                        className="flex-1 py-3 rounded-[10px] bg-red-500/10 border border-red-400/30 text-[#f87c7c] hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 flex items-center justify-center gap-2"
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
