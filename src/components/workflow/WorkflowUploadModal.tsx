import React, { useState, useRef } from 'react';
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
            toast.error('Unsupported file type', {
                description: 'Please drop a JSON workflow or PNG image with workflow metadata.',
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
                toast.error('Unsupported file type', {
                    description: 'Please select a JSON workflow or PNG image with workflow metadata.',
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
                        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                Upload Workflow
                            </h2>
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <div
                                className={`relative w-full aspect-[4/3] rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-4 ${isDragging
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900/50'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                    {isLoading ? (
                                        <Loader2 className="w-8 h-8 animate-spin" />
                                    ) : (
                                        <Upload className="w-8 h-8" />
                                    )}
                                </div>

                                <div className="text-center space-y-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {isLoading ? 'Processing...' : 'Click or drag file to upload'}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Supports .json and .png (with metadata)
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
                                    className="mt-2"
                                >
                                    Select File
                                </Button>
                            </div>

                            {/* Info Alert */}
                            <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex gap-3">
                                <AlertCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        Supported Formats
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        You can upload standard ComfyUI workflow JSON files or PNG images that contain embedded workflow metadata.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Create New Option */}
                        <div className="px-6 pb-6">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-200 dark:border-slate-800" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400">
                                        Or
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
                                className="w-full mt-4 h-12 border-dashed border-2 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 dark:hover:border-blue-500/50 transition-all"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create New Empty Workflow
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default WorkflowUploadModal;
