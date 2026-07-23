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
          className="fixed bottom-6 left-4 right-4 z-50 flex justify-center"
        >
          {/* Frosted Clear Ice ConnectionBar */}
          <div className="rounded-[14px] border border-white/[0.09] p-2 relative overflow-hidden w-full max-w-[340px]"
            style={{ background: 'rgba(15,17,22,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-1.5 pl-0.5">
                <h3 className="font-mono text-[9px] font-semibold text-[#7ba3f5]/80 tracking-[0.12em] uppercase truncate">
                  {getStatusMessage()}
                </h3>
                <Button
                  onClick={onCancel}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 bg-white/[0.05] hover:bg-white/[0.09] text-[#9aa3b2] hover:text-white rounded-md border border-white/[0.07] transition-all shrink-0 ml-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Node Selection Area - Compacted */}
              <div className="flex items-center space-x-1.5 mb-1.5">
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
                      w-full relative rounded-lg border border-dashed min-h-[36px] flex items-center justify-center transition-all duration-200 py-1
                      ${sourceNode
                        ? 'border-[#3069f0]/40 bg-[#3069f0]/[0.12]'
                        : 'border-white/10 bg-white/5 cursor-default'
                      }
                    `}
                  >
                    {sourceNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-[10.5px] font-semibold text-[#7ba3f5] break-all leading-tight line-clamp-1 px-1">
                          {sourceNode.type}
                        </div>
                        <div className="font-mono text-[8.5px] text-[#5b8af5] mt-0.5">
                          ID: {sourceNode.id}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-[10.5px] text-[#71798a] font-medium">
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
                      ? 'text-[#5b8af5]'
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
                      w-full relative rounded-lg border border-dashed min-h-[36px] flex items-center justify-center transition-all duration-200 py-1
                      ${targetNode
                        ? 'border-[#f25555]/40 bg-[#f25555]/[0.12]'
                        : 'border-white/10 bg-white/5 cursor-default'
                      }
                    `}
                  >
                    {targetNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-[10.5px] font-semibold text-[#f8b3b3] break-all leading-tight line-clamp-1 px-1">
                          {targetNode.type}
                        </div>
                        <div className="font-mono text-[8.5px] text-[#f87c7c] mt-0.5">
                          ID: {targetNode.id}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-[10.5px] text-[#71798a] font-medium">
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
                  className="h-8 flex-1 rounded-lg bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.08] text-[#c8ccd4] text-[11.5px] font-semibold transition-all active:scale-95"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={onProceed}
                  disabled={!canProceed}
                  className={`
                    h-8 flex-1 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold active:scale-95
                    ${canProceed
                      ? 'bg-[#3069f0] hover:bg-[#3f78f5] text-white'
                      : 'bg-white/5 text-white/20 border-white/5'
                    }
                  `}
                >
                  <CheckCircle className="h-3 w-3" />
                  <span>{t('node.connectNodes')}</span>
                </Button>
              </div>

            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};