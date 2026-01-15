import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, CheckCircle } from 'lucide-react';
import { WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { Button } from '@/components/ui/button';

interface ConnectionBarProps {
  isVisible: boolean;
  sourceNode: WorkflowNode | null;
  targetNode: WorkflowNode | null;
  onCancel: () => void;
  onProceed: () => void;
  onClearSource?: () => void;
  onClearTarget?: () => void;
}

export const ConnectionBar: React.FC<ConnectionBarProps> = ({
  isVisible,
  sourceNode,
  targetNode,
  onCancel,
  onProceed,
  onClearSource,
  onClearTarget,
}) => {
  const { t } = useTranslation();
  const canProceed = sourceNode && targetNode;

  // Generate status message
  const getStatusMessage = () => {
    if (!sourceNode && !targetNode) {
      return t('node.selectSourceToStart');
    } else if (sourceNode && !targetNode) {
      return t('node.selectTargetToConnect');
    } else if (sourceNode && targetNode) {
      return t('node.readyToConnect');
    }
    return t('node.connectionModeActive');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-6 left-4 right-4 z-50"
        >
          {/* Frosted Clear Ice ConnectionBar */}
          <div className="bg-slate-600/40 backdrop-blur-3xl rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/30 p-4 relative overflow-hidden">
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-white/90 tracking-tight">
                  {t('node.createConnection')}
                </h3>
                <Button
                  onClick={onCancel}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-full transition-all"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Node Selection Area - Compacted */}
              <div className="flex items-center space-x-2 mb-4">
                {/* Source Node Slot */}
                <div className="flex-1">
                  <button
                    onClick={() => {
                      if (sourceNode && onClearSource) {
                        onClearSource();
                      }
                    }}
                    disabled={!sourceNode}
                    className={`
                      w-full relative rounded-[18px] border-2 border-dashed min-h-[52px] flex items-center justify-center transition-all duration-200 py-1.5
                      ${sourceNode
                        ? 'border-blue-500/40 bg-blue-500/20 hover:bg-blue-500/30'
                        : 'border-white/10 bg-white/5 cursor-default'
                      }
                    `}
                  >
                    {sourceNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-[11px] font-bold text-blue-300 break-all leading-tight">
                          {sourceNode.type}
                        </div>
                        <div className="text-[9px] text-blue-400 mt-0.5 font-medium">
                          ID: {sourceNode.id}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-[11px] text-white/40 font-bold">
                          {t('node.sourceNode')}
                        </div>
                      </div>
                    )}
                  </button>
                </div>

                {/* Arrow Indicator - Small */}
                <div className="flex-shrink-0">
                  <ArrowRight className={`
                    h-4 w-4 transition-colors duration-200
                    ${canProceed
                      ? 'text-blue-400'
                      : 'text-white/20'
                    }
                  `} />
                </div>

                {/* Target Node Slot */}
                <div className="flex-1">
                  <button
                    onClick={() => {
                      if (targetNode && onClearTarget) {
                        onClearTarget();
                      }
                    }}
                    disabled={!targetNode}
                    className={`
                      w-full relative rounded-[18px] border-2 border-dashed min-h-[52px] flex items-center justify-center transition-all duration-200 py-1.5
                      ${targetNode
                        ? 'border-red-500/40 bg-red-500/20 hover:bg-red-500/30'
                        : 'border-white/10 bg-white/5 cursor-default'
                      }
                    `}
                  >
                    {targetNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-[11px] font-bold text-red-300 break-all leading-tight">
                          {targetNode.type}
                        </div>
                        <div className="text-[9px] text-red-400 mt-0.5 font-medium">
                          ID: {targetNode.id}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-[11px] text-white/40 font-bold">
                          {t('node.targetNode')}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons - Larger */}
              <div className="flex space-x-2">
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="h-12 flex-1 rounded-[22px] bg-white/10 border-white/10 hover:bg-white/20 text-white font-bold transition-all active:scale-95"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={onProceed}
                  disabled={!canProceed}
                  className={`
                    h-12 flex-1 rounded-[22px] shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 font-black active:scale-95
                    ${canProceed
                      ? 'bg-blue-500/80 hover:bg-blue-600 text-white'
                      : 'bg-white/5 text-white/20 border-white/5'
                    }
                  `}
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>{t('node.connectNodes')}</span>
                </Button>
              </div>

              {/* Status Indicator - Slim */}
              <div className="mt-3 h-6 flex items-center justify-center">
                <motion.div
                  key={getStatusMessage()}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="px-3 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20"
                >
                  <div className="text-[10px] font-bold text-blue-300/80 tracking-wide uppercase">
                    {getStatusMessage()}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};