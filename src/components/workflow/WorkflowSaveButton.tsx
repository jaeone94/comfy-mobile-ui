import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// Custom morphing icon component (reused from WorkflowHeader)
const SaveToCheckIcon: React.FC<{
    isSaving: boolean;
    isSuccess: boolean;
    size?: number
}> = ({ isSaving, isSuccess, size = 16 }) => {
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <AnimatePresence mode="wait">
                {isSaving ? (
                    <motion.div
                        key="saving"
                        initial={{ opacity: 0, rotate: -90 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0, rotate: 90 }}
                        transition={{ duration: 0.13 }}
                        className="absolute flex items-center justify-center"
                        style={{ width: size, height: size }}
                    >
                        <Loader2 style={{ width: size, height: size }} className="animate-spin" />
                    </motion.div>
                ) : isSuccess ? (
                    <motion.svg
                        key="success"
                        className="absolute"
                        style={{ width: size * 1.5, height: size * 1.5 }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, ease: "backOut" }}
                    >
                        <motion.path
                            d="M9 12l2 2 4-4"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.25, delay: 0.05 }}
                        />
                    </motion.svg>
                ) : (
                    <motion.svg
                        key="save"
                        className="absolute"
                        style={{ width: size, height: size }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ opacity: 0, scale: 1.2 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.13 }}
                    >
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17,21 17,13 7,13 7,21" />
                        <polyline points="7,3 7,8 15,8" />
                    </motion.svg>
                )}
            </AnimatePresence>
        </div>
    );
};

interface WorkflowSaveButtonProps {
    hasUnsavedChanges?: boolean;
    isSaving?: boolean;
    saveSucceeded?: boolean;
    onSaveChanges?: () => void;
}

export const WorkflowSaveButton: React.FC<WorkflowSaveButtonProps> = ({
    hasUnsavedChanges = false,
    isSaving = false,
    saveSucceeded = false,
    onSaveChanges
}) => {
    const { t } = useTranslation();
    const [showCheckmark, setShowCheckmark] = useState(false);

    // Handle save success animation
    useEffect(() => {
        if (saveSucceeded) {
            setShowCheckmark(true);
            const timer = setTimeout(() => {
                setShowCheckmark(false);
            }, 1000); // Show checkmark for 1 second before fade out
            return () => clearTimeout(timer);
        }
    }, [saveSucceeded]);

    const isVisible = hasUnsavedChanges || isSaving || showCheckmark;

    return (
        <div className="fixed right-6 bottom-34 z-40 pointer-events-none flex flex-col items-center">
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.8 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
                        transition={{ duration: 0.3, ease: "backOut" }}
                        className="pointer-events-auto"
                    >
                        <div className="bg-slate-600/40 backdrop-blur-3xl rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/30 p-1.5">
                            <Button
                                onClick={onSaveChanges}
                                disabled={isSaving || showCheckmark}
                                size="icon"
                                className={`text-white border border-white/20 backdrop-blur-md shadow-lg transition-all duration-300 h-11 w-11 p-0 rounded-full ${showCheckmark
                                    ? 'bg-emerald-500/80'
                                    : isSaving
                                        ? 'bg-gray-500/80 cursor-not-allowed'
                                        : 'bg-green-500/80 hover:bg-green-600/90 hover:shadow-xl'
                                    }`}
                                title={showCheckmark ? t('common.saved') : isSaving ? t('common.saving') : t('workflow.saveChanges')}
                            >
                                <SaveToCheckIcon
                                    isSaving={isSaving}
                                    isSuccess={showCheckmark}
                                    size={20}
                                />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
