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
          {/* Glassmorphism ConnectionBar */}
          <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 p-4 relative overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('node.createConnection')}
                </h3>
                <Button
                  onClick={onCancel}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Node Selection Area */}
              <div className="flex items-center space-x-3 mb-4">
                {/* Source Node Slot */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    {t('node.sourceNode')}
                  </label>
                  <button
                    onClick={() => {
                      if (sourceNode && onClearSource) {
                        onClearSource();
                      }
                    }}
                    disabled={!sourceNode}
                    className={`
                      w-full relative rounded-2xl border-2 border-dashed min-h-16 flex items-center justify-center transition-all duration-200 py-2
                      ${sourceNode
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer'
                        : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 cursor-default'
                      }
                    `}
                  >
                    {sourceNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-sm font-medium text-blue-700 dark:text-blue-300 break-all leading-tight">
                          {sourceNode.type}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          ID: {sourceNode.id} • {t('node.clickToClear')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {t('node.tapANode')}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {t('node.toSelectSource')}
                        </div>
                      </div>
                    )}
                  </button>
                </div>

                {/* Arrow Indicator */}
                <div className="flex-shrink-0 py-4">
                  <div className={`
                    p-2 rounded-full transition-all duration-200
                    ${canProceed
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-slate-100 dark:bg-slate-800'
                    }
                  `}>
                    <ArrowRight className={`
                      h-4 w-4 transition-colors duration-200
                      ${canProceed
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                      }
                    `} />
                  </div>
                </div>

                {/* Target Node Slot */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    {t('node.targetNode')}
                  </label>
                  <button
                    onClick={() => {
                      if (targetNode && onClearTarget) {
                        onClearTarget();
                      }
                    }}
                    disabled={!targetNode}
                    className={`
                      w-full relative rounded-2xl border-2 border-dashed min-h-16 flex items-center justify-center transition-all duration-200 py-2
                      ${targetNode
                        ? 'border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer'
                        : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 cursor-default'
                      }
                    `}
                  >
                    {targetNode ? (
                      <div className="text-center px-2 w-full">
                        <div className="text-sm font-medium text-red-700 dark:text-red-300 break-all leading-tight">
                          {targetNode.type}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          ID: {targetNode.id} • {t('node.clickToClear')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {sourceNode ? t('node.tapTargetNode') : t('node.selectSourceFirst')}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {sourceNode ? t('node.toConnect') : ''}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="flex-1 bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 hover:bg-white/30 dark:hover:bg-slate-700/30 text-slate-800 dark:text-slate-200"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={onProceed}
                  disabled={!canProceed}
                  className={`
                    flex-1 shadow-lg backdrop-blur-sm transition-all duration-200 flex items-center justify-center space-x-2
                    ${canProceed
                      ? 'bg-green-600/90 hover:bg-green-700/90 text-white hover:shadow-xl'
                      : 'bg-slate-400/50 text-slate-500 cursor-not-allowed'
                    }
                  `}
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{t('node.connectNodes')}</span>
                </Button>
              </div>

              {/* Status Indicator - Fixed Height */}
              <div className="mt-3 h-8 flex items-center justify-center">
                <motion.div
                  key={getStatusMessage()}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="text-xs text-blue-700 dark:text-blue-300 text-center">
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