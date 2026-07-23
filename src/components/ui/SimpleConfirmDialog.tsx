import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';

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
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative w-full max-w-[300px] bg-[#101217] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-4 text-[#e9ebef]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center gap-2.5">
                            <div
                                className="w-9 h-9 rounded-[10px] flex items-center justify-center border"
                                style={isDestructive
                                    ? { background: 'rgba(242,85,85,0.1)', borderColor: 'rgba(242,85,85,0.3)' }
                                    : { background: 'rgba(48,105,240,0.1)', borderColor: 'rgba(48,105,240,0.3)' }}
                            >
                                <AlertCircle className={`w-4 h-4 ${isDestructive ? 'text-[#f25555]' : 'text-[#5b8af5]'}`} strokeWidth={1.8} />
                            </div>

                            <h3 className="text-[14px] font-bold leading-tight">{title}</h3>

                            {nodeInfo && (
                                <div className="inline-block px-2 py-0.5 rounded-md font-mono text-[10px] border bg-white/[0.05] text-[#c8ccd4] border-white/[0.08]">
                                    {nodeInfo}
                                </div>
                            )}

                            <p className="text-[11.5px] leading-relaxed text-[#8a919e]">{message}</p>
                        </div>

                        <div className="flex gap-2 pt-3.5">
                            <button
                                onClick={onClose}
                                className="flex-1 h-9 rounded-[10px] text-[12px] font-semibold border border-white/[0.08] text-[#c8ccd4] transition-colors hover:bg-white/[0.07]"
                                style={{ background: 'rgba(255,255,255,0.05)' }}
                            >
                                {cancelText || t('common.cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`flex-1 h-9 rounded-[10px] text-[12px] font-semibold text-white transition-all active:scale-95 ${isDestructive ? 'bg-[#f25555] hover:bg-[#f36d6d]' : 'bg-[#3069f0] hover:bg-[#3f78f5]'
                                    }`}
                            >
                                {confirmText || (isDestructive ? t('common.delete') : t('common.confirm'))}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
