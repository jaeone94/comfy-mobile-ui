import React from 'react';
import { useTranslation } from 'react-i18next';
import { Grid3X3, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface RepositionActionBarProps {
  isActive: boolean;
  gridSnapEnabled: boolean;
  onToggleGridSnap: () => void;
  onCancel: () => void;
  onApply: () => void;
}

export const RepositionActionBar: React.FC<RepositionActionBarProps> = ({
  isActive,
  gridSnapEnabled,
  onToggleGridSnap,
  onCancel,
  onApply,
}) => {
  const { t } = useTranslation();
  if (!isActive) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed left-6 bottom-3 z-40"
      >
        <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 border border-white/20 dark:border-slate-600/20 p-3 relative overflow-hidden">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

          <div className="relative z-10">
            {/* Title */}
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left mb-3">
              {t('node.repositioning')}
            </div>

            {/* Button Group */}
            <div className="flex items-center gap-3">
              {/* Grid Snap Toggle */}
              <Button
                onClick={onToggleGridSnap}
                size="lg"
                variant="outline"
                className={`h-11 px-4 rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px active:scale-95 ${gridSnapEnabled
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50 hover:border-green-300 dark:hover:border-green-700 active:text-green-800 dark:active:text-green-200 active:border-green-400 dark:active:border-green-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-300'
                  } shadow-none hover:shadow-sm active:shadow-none`}
                title={t('node.toggleGridSnap')}
              >
                <Grid3X3 className="w-4 h-4 mr-2" />
                {t('node.gridSnap')}
              </Button>

              {/* Cancel Button */}
              <Button
                onClick={onCancel}
                size="lg"
                variant="outline"
                className="h-11 px-4 rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px active:scale-95 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 active:text-red-800 dark:active:text-red-200 active:border-red-400 dark:active:border-red-600 shadow-none hover:shadow-sm active:shadow-none"
                title={t('node.cancelRepositioning')}
              >
                <X className="w-4 h-4 mr-2" />
                {t('common.cancel')}
              </Button>

              {/* Apply Button */}
              <Button
                onClick={onApply}
                size="lg"
                variant="outline"
                className="h-11 px-4 rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px active:scale-95 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-300 active:text-blue-800 dark:active:text-blue-200 active:border-blue-400 dark:active:border-blue-600 shadow-none hover:shadow-sm active:shadow-none"
                title={t('node.applyChanges')}
              >
                <Check className="w-4 h-4 mr-2" />
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};