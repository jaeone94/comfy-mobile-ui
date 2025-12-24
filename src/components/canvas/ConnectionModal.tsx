import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Cable } from 'lucide-react';
import { WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { Button } from '@/components/ui/button';
import { checkNodeCompatibility } from '@/shared/utils/nodeCompatibility';

interface ConnectionModalProps {
  isVisible: boolean;
  sourceNode: WorkflowNode | null;
  targetNode: WorkflowNode | null;
  onClose: () => void;
  onCreateConnection: (sourceSlot: number, targetSlot: number) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isVisible,
  sourceNode,
  targetNode,
  onClose,
  onCreateConnection,
}) => {
  const { t } = useTranslation();
  // Get compatible connections
  const compatibility = React.useMemo(() => {
    if (!sourceNode || !targetNode) {
      return { isCompatible: false, compatibleConnections: [] };
    }
    return checkNodeCompatibility(sourceNode, targetNode);
  }, [sourceNode, targetNode]);

  const handleConnectionSelect = (sourceSlot: number, targetSlot: number) => {
    onCreateConnection(sourceSlot, targetSlot);
    // Don't call onClose() here - let the hook handle modal state after connection
  };

  if (!sourceNode || !targetNode) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 pwa-modal"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 50 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-4 z-50 flex items-center justify-center pwa-modal"
          >
            <div className="w-full max-w-lg max-h-full bg-white/10 dark:bg-slate-900/10 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 dark:border-slate-600/30 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/20 dark:border-slate-600/20 bg-gradient-to-r from-white/20 via-blue-50/30 to-purple-50/30 dark:from-slate-800/20 dark:via-blue-900/20 dark:to-purple-900/20 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white/20 dark:bg-slate-700/30 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                      <Cable className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {t('node.createConnection')}
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {t('node.chooseSlots')}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 hover:bg-white/30 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200 rounded-xl backdrop-blur-sm"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Node Information */}
              <div className="px-6 py-4 bg-gradient-to-r from-white/10 via-slate-50/20 to-slate-100/20 dark:from-slate-800/20 dark:via-slate-700/20 dark:to-slate-600/20 border-b border-white/20 dark:border-slate-600/20 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  {/* Source Node */}
                  <div className="flex-1 text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {t('node.source')}
                    </div>
                    <div className="px-3 py-2 bg-blue-100/50 dark:bg-blue-900/20 backdrop-blur-sm rounded-xl border border-blue-200/50 dark:border-blue-800/50">
                      <div className="text-sm font-medium text-blue-800 dark:text-blue-200 break-all leading-tight">
                        {sourceNode.type}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        ID: {sourceNode.id}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="px-4">
                    <div className="p-2 bg-white/20 dark:bg-slate-700/30 backdrop-blur-sm rounded-full border border-white/30 dark:border-slate-600/30">
                      <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>

                  {/* Target Node */}
                  <div className="flex-1 text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {t('node.target')}
                    </div>
                    <div className="px-3 py-2 bg-red-100/50 dark:bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-200/50 dark:border-red-800/50">
                      <div className="text-sm font-medium text-red-800 dark:text-red-200 break-all leading-tight">
                        {targetNode.type}
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        ID: {targetNode.id}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Options */}
              <div className="flex-1 overflow-y-auto max-h-96">
                {compatibility.isCompatible ? (
                  <div className="p-6 space-y-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                      {t('node.availableConnections', { count: compatibility.compatibleConnections.length })}
                    </div>

                    {compatibility.compatibleConnections.map((connection, index) => {
                      // Check if slot names match for highlighting
                      const isNameMatch = connection.sourceSlotName.toLowerCase() === connection.targetSlotName.toLowerCase();

                      // Format connection type - show COMBO for array types
                      const displayType = Array.isArray(connection.connectionType) ? 'COMBO' : connection.connectionType;

                      return (
                        <motion.button
                          key={`${connection.sourceSlot}-${connection.targetSlot}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => handleConnectionSelect(connection.sourceSlot, connection.targetSlot)}
                          className="w-full p-4 bg-white/20 dark:bg-slate-800/20 hover:bg-blue-50/30 dark:hover:bg-blue-900/30 backdrop-blur-sm border border-white/30 dark:border-slate-700/30 hover:border-blue-300/50 dark:hover:border-blue-600/50 rounded-2xl transition-all duration-200 group"
                        >
                          <div className="flex items-center justify-between">
                            {/* Source Slot */}
                            <div className="flex-1 text-left min-w-0">
                              <div className={`text-sm font-medium break-all leading-tight ${isNameMatch
                                  ? 'text-green-800 dark:text-green-200 bg-green-100/60 dark:bg-green-900/40 px-2 py-1 rounded-md border border-green-300/40 dark:border-green-600/40 inline-block'
                                  : 'text-slate-800 dark:text-slate-200'
                                }`}>
                                {connection.sourceSlotName}
                              </div>
                              <div className="text-xs text-green-600 dark:text-green-400 font-mono mt-1">
                                {t('node.slot', { index: connection.sourceSlot })}
                              </div>
                            </div>

                            {/* Connection Type & Arrow */}
                            <div className="flex items-center space-x-3 px-4 flex-shrink-0">
                              <div className="px-2 py-1 bg-purple-100/50 dark:bg-purple-900/20 backdrop-blur-sm rounded-lg border border-purple-200/50 dark:border-purple-800/50">
                                <div className="text-xs font-medium text-purple-700 dark:text-purple-300 break-all leading-tight">
                                  {displayType}
                                </div>
                              </div>
                              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                            </div>

                            {/* Target Slot */}
                            <div className="flex-1 text-right min-w-0">
                              <div className={`text-sm font-medium break-all leading-tight ${isNameMatch
                                  ? 'text-green-800 dark:text-green-200 bg-green-100/60 dark:bg-green-900/40 px-2 py-1 rounded-md border border-green-300/40 dark:border-green-600/40 inline-block'
                                  : 'text-slate-800 dark:text-slate-200'
                                }`}>
                                {connection.targetSlotName}
                              </div>
                              <div className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1">
                                {t('node.slot', { index: connection.targetSlot })}
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                      <X className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                      {t('node.noCompatibleConnections')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {t('node.noConnectionsDesc')}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/20 dark:border-slate-600/20 bg-gradient-to-r from-white/10 via-slate-50/20 to-slate-100/20 dark:from-slate-800/20 dark:via-slate-700/20 dark:to-slate-600/20 backdrop-blur-sm">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full bg-white/20 dark:bg-slate-700/30 backdrop-blur-sm border-white/30 dark:border-slate-600/30 hover:bg-white/30 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};