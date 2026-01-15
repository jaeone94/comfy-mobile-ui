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
        className="fixed right-6 bottom-4 z-40"
      >
        <div className="bg-slate-600/40 backdrop-blur-3xl rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/30 p-4 relative overflow-hidden">
          <div className="relative z-10">
            {/* Title */}
            <div className="text-sm font-bold text-white/90 text-left mb-3 tracking-tight">
              {t('node.repositioning')}
            </div>

            {/* Button Group */}
            <div className="flex items-center gap-2">
              {/* Grid Snap Toggle */}
              <Button
                onClick={onToggleGridSnap}
                size="lg"
                variant="outline"
                className={`h-11 px-5 rounded-[22px] bg-white/10 dark:bg-white/10 border transition-all duration-150 font-bold active:scale-95 ${gridSnapEnabled
                  ? 'border-green-500/40 text-green-400 bg-green-500/20 hover:bg-green-500/30 hover:text-green-300'
                  : 'border-white/10 text-white/50 hover:bg-white/20 hover:text-white'
                  } shadow-none`}
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
                className="h-11 px-5 rounded-[22px] bg-white/10 dark:bg-white/10 border transition-all duration-150 font-bold active:scale-95 border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 shadow-none"
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
                className="h-11 px-6 rounded-[22px] bg-blue-500/20 border-blue-500/40 transition-all duration-150 font-bold active:scale-95 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300 shadow-none"
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