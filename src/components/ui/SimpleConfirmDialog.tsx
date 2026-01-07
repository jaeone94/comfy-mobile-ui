import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimpleConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    nodeInfo?: string; // e.g. "Something#13"
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export const SimpleConfirmDialog: React.FC<SimpleConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    nodeInfo,
    confirmText,
    cancelText,
    isDestructive = true,
}) => {
    const { t } = useTranslation();

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative w-full max-w-sm bg-[#374151] rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6 text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="relative z-10 flex flex-col items-center text-center space-y-5">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDestructive ? 'bg-black/20' : 'bg-white/20'
                                } shadow-sm`}>
                                <AlertCircle className="w-8 h-8 text-white" />
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black tracking-tight text-white">
                                    {title}
                                </h3>

                                {nodeInfo && (
                                    <div className="inline-block px-3 py-1 rounded-full text-xs font-bold border bg-black/20 text-white/90 border-white/20 mb-1">
                                        {nodeInfo}
                                    </div>
                                )}

                                <p className="leading-relaxed font-bold px-2 text-white/80">
                                    {message}
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10 flex gap-3 pt-4">
                            <Button
                                onClick={onClose}
                                variant="outline"
                                className="flex-1 h-14 rounded-2xl font-bold transition-all bg-black/20 border-white/10 text-white hover:bg-black/40"
                            >
                                {cancelText || t('common.cancel')}
                            </Button>
                            <Button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                variant={isDestructive ? 'destructive' : 'default'}
                                className={`flex-1 h-14 rounded-2xl font-bold shadow-lg transition-transform active:scale-95 ${isDestructive ? 'bg-red-500 hover:bg-red-600 shadow-black/20' : ''
                                    }`}
                            >
                                {confirmText || (isDestructive ? t('common.delete') : t('common.confirm'))}
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
