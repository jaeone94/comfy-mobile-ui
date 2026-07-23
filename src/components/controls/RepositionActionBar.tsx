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
        className="fixed right-4 sm:right-6 bottom-4 z-40 max-w-[calc(100vw-2rem)]"
      >
        <div className="rounded-[14px] border border-white/[0.09] p-1.5 relative flex items-center gap-1.5"
          style={{ background: 'rgba(15,17,22,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
          {/* Grid Snap toggle (icon tile) */}
          <button
            onClick={onToggleGridSnap}
            className={`w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all duration-150 active:scale-95 ${gridSnapEnabled
              ? 'border-[#34c77b]/30 text-[#4ade80]'
              : 'border-white/[0.08] text-[#8a919e] hover:text-[#c8ccd4]'
              }`}
            style={{ background: gridSnapEnabled ? 'rgba(52,199,123,0.13)' : 'rgba(255,255,255,0.05)' }}
            title={t('node.toggleGridSnap')}
          >
            <Grid3X3 className="w-[15px] h-[15px]" strokeWidth={1.8} />
          </button>

          <span className="w-px h-[22px] bg-white/[0.08]" />

          {/* Cancel */}
          <button
            onClick={onCancel}
            className="h-10 px-3.5 rounded-[10px] border flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap transition-all duration-150 active:scale-95"
            style={{ background: 'rgba(242,85,85,0.1)', borderColor: 'rgba(242,85,85,0.3)', color: '#f87c7c' }}
            title={t('node.cancelRepositioning')}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.9} />
            {t('common.cancel')}
          </button>

          {/* Apply */}
          <button
            onClick={onApply}
            className="h-10 px-3.5 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] flex items-center gap-1.5 text-[12px] font-semibold text-white whitespace-nowrap transition-all duration-150 active:scale-95"
            title={t('node.applyChanges')}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
            {t('common.confirm')}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};