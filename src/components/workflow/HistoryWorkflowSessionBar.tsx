import React from 'react';
import { CopyPlus, Loader2, RotateCcw, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HistoryWorkflowSessionBarProps {
  filename: string;
  nodeCount: number;
  isApplied: boolean;
  isBusy: boolean;
  top: number;
  onRestore: () => void | Promise<void>;
  onApply: () => void;
  onSaveAsNew: () => void | Promise<void>;
}

export const HistoryWorkflowSessionBar: React.FC<HistoryWorkflowSessionBarProps> = ({
  filename,
  nodeCount,
  isApplied,
  isBusy,
  top,
  onRestore,
  onApply,
  onSaveAsNew,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="fixed left-3 right-3 z-40 mx-auto max-w-3xl rounded-[12px] border border-[#3069f0]/35 bg-[#10141d]/95 p-3 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{ top }}
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#3069f0]/18 text-[#7ba3f5]">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-[#e9ebef]">
              {t(isApplied
                ? 'promptHistory.workflowRecovery.appliedTitle'
                : 'promptHistory.workflowRecovery.previewTitle')}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-[#8a919e]" title={filename}>
              {filename} · {t('promptHistory.workflowRecovery.nodeCount', { count: nodeCount })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-none">
          <button
            type="button"
            onClick={onRestore}
            disabled={isBusy}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-[#c8ccd4] transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('promptHistory.workflowRecovery.restore')}
          </button>
          <button
            type="button"
            onClick={onSaveAsNew}
            disabled={isBusy}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-[#c8ccd4] transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
            {t('promptHistory.workflowRecovery.saveAsNew')}
          </button>
          {!isApplied && (
            <button
              type="button"
              onClick={onApply}
              disabled={isBusy}
              className="col-span-2 h-9 rounded-lg bg-[#3069f0] px-3 text-[11px] font-bold text-white transition-colors hover:bg-[#3f78f5] disabled:opacity-50"
            >
              {t('promptHistory.workflowRecovery.apply')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
