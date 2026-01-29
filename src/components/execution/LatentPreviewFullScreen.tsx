import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2 } from 'lucide-react';
import { useLatentPreviewStore } from '@/ui/store/latentPreviewStore';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

interface LatentPreviewFullScreenProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LatentPreviewFullScreen: React.FC<LatentPreviewFullScreenProps> = ({ isOpen, onClose }) => {
    const { imageUrl, nodeId } = useLatentPreviewStore();
    const { t } = useTranslation();

    if (!imageUrl) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200000] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
                    onClick={onClose}
                >
                    {/* Header Controls */}
                    <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between pointer-events-none"
                    >
                        <div className="flex flex-col">
                            <span className="text-white/40 text-xs font-medium uppercase tracking-widest">{t('latentPreview.fullScreen.title')}</span>
                            {nodeId && nodeId !== 'unknown' && (
                                <span className="text-white text-lg font-bold">{t('latentPreview.fullScreen.node', { id: nodeId })}</span>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white pointer-events-auto"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                        >
                            <X className="h-6 w-6" />
                        </Button>
                    </motion.div>

                    {/* Image Container */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative max-w-full max-h-[85vh] shadow-2xl rounded-2xl overflow-hidden border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={imageUrl}
                            alt="Full Latent Preview"
                            className="max-w-full max-h-[85vh] object-contain"
                        />
                    </motion.div>

                    <div className="absolute bottom-10 text-white/20 text-[10px] uppercase tracking-[0.2em] pointer-events-none">
                        {t('latentPreview.fullScreen.close')}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
