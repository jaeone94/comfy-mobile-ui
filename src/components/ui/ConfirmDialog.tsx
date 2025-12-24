import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'destructive',
  onConfirm,
  onCancel,
  onClose,
  icon
}) => {
  const { t } = useTranslation();
  const finalConfirmText = confirmText || t('common.confirm');
  const finalCancelText = cancelText || t('common.cancel');
  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onCancel();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Enhanced Glassmorphism Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-xl z-[99999] pwa-modal"
            onClick={onClose}
          />

          {/* Enhanced Glassmorphism Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 pwa-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full max-w-md mx-auto overflow-hidden">
              {/* Gradient Overlay for Enhanced Glass Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

              {/* Glassmorphism Header */}
              <div className="relative flex items-center justify-between p-6 pb-4 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <div className="flex items-center space-x-3">
                  {icon || (
                    <div className="p-2 rounded-full bg-red-500/20 dark:bg-red-400/20">
                      <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400 drop-shadow-sm" />
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white drop-shadow-sm">
                    {title}
                  </h3>
                </div>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Glassmorphism Content */}
              <div className="relative px-6 py-4">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed drop-shadow-sm">
                  {message}
                </p>
              </div>

              {/* Glassmorphism Actions */}
              <div className="relative px-6 pb-6 flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 hover:bg-white/30 dark:hover:bg-slate-700/30 text-slate-800 dark:text-slate-200 transition-all duration-200"
                >
                  {finalCancelText}
                </Button>
                <Button
                  variant={confirmVariant}
                  onClick={handleConfirm}
                  className="bg-red-600/90 hover:bg-red-700/90 text-white shadow-lg hover:shadow-xl backdrop-blur-sm transition-all duration-200"
                >
                  {finalConfirmText}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};