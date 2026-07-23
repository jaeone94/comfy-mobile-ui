import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText, Loader2, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface WorkflowUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (file: File) => Promise<void>;
    onCreateEmpty?: () => void;
    isLoading?: boolean;
}

const WorkflowUploadModal: React.FC<WorkflowUploadModalProps> = ({
    isOpen,
    onClose,
    onUpload,
    onCreateEmpty,
    isLoading = false,
}) => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        let targetFile = files.find((file) => file.name.toLowerCase().endsWith('.json'));

        if (!targetFile) {
            targetFile = files.find((file) => file.type.includes('image/png'));
        }

        if (targetFile) {
            onUpload(targetFile);
        } else {
            toast.error(t('workflow.import.unsupportedType'), {
                description: t('workflow.import.unsupportedDesc'),
            });
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const isJson = file.name.toLowerCase().endsWith('.json');
            const isPng = file.type.includes('image/png');

            if (isJson || isPng) {
                onUpload(file);
            } else {
                toast.error(t('workflow.import.unsupportedType'), {
                    description: t('workflow.import.unsupportedDesc'),
                });
            }
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !isLoading) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
                    onClick={handleBackdropClick}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-sm bg-[#101217] rounded-xl shadow-2xl border border-white/10 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between h-11 px-4 border-b border-white/[0.08]">
                            <h2 className="text-[14px] font-bold text-[#e9ebef]">
                                {t('workflow.uploadModal.title')}
                            </h2>
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="p-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg border border-white/[0.08] transition-colors disabled:opacity-50"
                            >
                                <X className="w-4 h-4 text-[#9aa3b2]" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            <div
                                className={`relative w-full aspect-[16/9] rounded-[10px] border border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-2.5 ${isDragging
                                    ? 'border-[#3069f0]/60 bg-[#3069f0]/[0.08]'
                                    : 'border-white/[0.13] hover:border-white/25 bg-white/[0.02]'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <div className="w-9 h-9 rounded-[10px] border border-[#3069f0]/30 flex items-center justify-center text-[#5b8af5]" style={{ background: 'rgba(48,105,240,0.1)' }}>
                                    {isLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Upload className="w-4 h-4" strokeWidth={1.8} />
                                    )}
                                </div>

                                <div className="text-center space-y-1">
                                    <p className="text-[12px] font-semibold text-[#e9ebef]">
                                        {isLoading ? t('common.processing') : t('workflow.uploadModal.dragDrop')}
                                    </p>
                                    <p className="font-mono text-[9.5px] text-[#565d6b] uppercase tracking-[0.08em]">
                                        {t('workflow.uploadModal.supportedExt')}
                                    </p>
                                </div>

                                <Input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,.png"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    disabled={isLoading}
                                />

                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                    variant="outline"
                                    className="mt-1 h-8 px-3 rounded-lg text-[11.5px] bg-white/[0.05] border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.08]"
                                >
                                    {t('common.selectFile')}
                                </Button>
                            </div>

                            {/* Info Alert */}
                            <div className="mt-3 p-2.5 rounded-[10px] bg-white/[0.03] border border-white/[0.07] flex gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-[#565d6b] flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                                <div className="space-y-1">
                                    <p className="text-[11.5px] font-semibold text-[#c8ccd4]">
                                        {t('workflow.uploadModal.formatsTitle')}
                                    </p>
                                    <p className="text-[10.5px] text-[#66758a] leading-relaxed">
                                        {t('workflow.uploadModal.formatsDesc')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Create New Option */}
                        <div className="px-4 pb-4">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-white/[0.07]" />
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-[#101217] px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#565d6b]">
                                        {t('common.or')}
                                    </span>
                                </div>
                            </div>

                            <Button
                                onClick={() => {
                                    onClose();
                                    onCreateEmpty?.();
                                }}
                                disabled={isLoading}
                                variant="outline"
                                className="w-full mt-3 h-9 rounded-[10px] text-[12px] border-dashed border border-white/[0.13] text-[#8a919e] bg-transparent hover:border-[#3069f0]/50 hover:text-[#5b8af5] hover:bg-transparent transition-all"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('workflow.uploadModal.createNew')}
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default WorkflowUploadModal;
