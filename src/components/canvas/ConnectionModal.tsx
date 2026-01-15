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

  /**
   * Get color for a specific slot type (copied from NodeDetailModal for consistency)
   */
  const getSlotColor = (type: string | undefined): string => {
    if (!type || typeof type !== 'string') return '#10b981'; // Default Green for unknown/untyped

    // Normalize type
    const normalizedType = type.toUpperCase();

    // Color mapping for common ComfyUI types
    const colorMap: Record<string, string> = {
      'IMAGE': '#64B5F6',        // Blue
      'LATENT': '#E040FB',       // Purple
      'MODEL': '#7986CB',        // Indigo
      'CLIP': '#FFD54F',         // Amber/Yellow
      'VAE': '#FF5252',          // Red
      'CONDITIONING': '#FFB74D', // Orange
      'MASK': '#81C784',         // Green
      'FLOAT': '#4DB6AC',        // Teal
      'INT': '#4DB6AC',          // Teal
      'NUMBER': '#4DB6AC',       // Teal
      'STRING': '#A1887F',       // Brown
      'BOOLEAN': '#90A4AE',      // Blue Grey
      'CONTROL_NET': '#009688',  // Teal Dark
      'STYLE_MODEL': '#AFB42B',  // Lime
      'CLIP_VISION': '#795548',  // Brown Dark
      'CLIP_VISION_OUTPUT': '#795548',  // Brown Dark
    };

    return colorMap[normalizedType] || '#10b981'; // Default to green if not found
  };

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
            className="fixed inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md z-[100] pwa-modal"
            onClick={onClose}
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pwa-modal" style={{ pointerEvents: 'none' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
              className="relative w-full max-w-lg h-[75vh] pointer-events-auto flex flex-col overflow-hidden rounded-3xl shadow-2xl border border-white/10 text-white"
              style={{ backgroundColor: '#374151' }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/10 bg-black/20 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-2.5 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                      <Cable className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold tracking-tight text-white">
                        {t('node.createConnection')}
                      </h2>
                      <p className="text-xs font-bold uppercase tracking-widest text-white/80 mt-0.5">
                        {t('node.chooseSlots')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all active:scale-90"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Node Information Cards - Added min-w-0 to prevent overflow */}
              <div className="px-6 py-6 bg-black/10 flex items-center justify-between gap-3 border-b border-white/5">
                {/* Source Node */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                      {t('node.source')}
                    </span>
                  </div>
                  <div className="p-3 bg-blue-500/15 rounded-2xl border border-blue-500/30">
                    <div className="text-sm font-black text-blue-200 truncate" title={sourceNode.type}>
                      {sourceNode.type}
                    </div>
                    <div className="text-[10px] font-mono text-blue-300/80 mt-0.5">
                      ID: {sourceNode.id}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 p-1.5 bg-white/5 rounded-full">
                  <ArrowRight className="h-3.5 w-3.5 text-white/40" />
                </div>

                {/* Target Node */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-end space-x-2 mb-2 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                      {t('node.target')}
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  </div>
                  <div className="p-3 bg-red-500/15 rounded-2xl border border-red-500/30 text-right">
                    <div className="text-sm font-black text-red-200 truncate" title={targetNode.type}>
                      {targetNode.type}
                    </div>
                    <div className="text-[10px] font-mono text-red-300/80 mt-0.5">
                      ID: {targetNode.id}
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Options List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/5">
                {compatibility.isCompatible ? (
                  <div className="p-6 space-y-3">
                    <div className="flex items-center space-x-2 mb-2 px-1">
                      <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                        {t('node.availableConnections', { count: compatibility.compatibleConnections.length })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {compatibility.compatibleConnections.map((connection, index) => {
                        const isNameMatch = connection.sourceSlotName.toLowerCase() === connection.targetSlotName.toLowerCase();
                        const displayType = Array.isArray(connection.connectionType) ? 'COMBO' : connection.connectionType;

                        return (
                          <motion.button
                            key={`${connection.sourceSlot}-${connection.targetSlot}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => handleConnectionSelect(connection.sourceSlot, connection.targetSlot)}
                            className="w-full relative group"
                          >
                            <div className="p-4 bg-black/20 hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                              <div className="flex items-center justify-between gap-4">
                                {/* Source Info */}
                                <div className="flex-1 min-w-0 text-left">
                                  <div className={`text-sm font-bold transition-colors ${isNameMatch ? 'text-green-400' : 'text-white'}`}>
                                    {connection.sourceSlotName}
                                  </div>
                                  <div className="text-[10px] font-mono text-white/60 mt-0.5">
                                    {t('node.slot', { index: connection.sourceSlot })}
                                  </div>
                                </div>

                                {/* Connection Type Chip */}
                                <div className="flex flex-col items-center gap-1.5">
                                  <div
                                    className="px-2 py-0.5 rounded-md border transition-colors"
                                    style={{
                                      backgroundColor: `${getSlotColor(typeof connection.connectionType === 'string' ? connection.connectionType : 'COMBO')}20`,
                                      borderColor: `${getSlotColor(typeof connection.connectionType === 'string' ? connection.connectionType : 'COMBO')}40`,
                                    }}
                                  >
                                    <span
                                      className="text-[10px] font-black uppercase tracking-tighter"
                                      style={{ color: getSlotColor(typeof connection.connectionType === 'string' ? connection.connectionType : 'COMBO') }}
                                    >
                                      {displayType}
                                    </span>
                                  </div>
                                  <ArrowRight
                                    className="h-3.5 w-3.5 transition-colors"
                                    style={{ color: `${getSlotColor(typeof connection.connectionType === 'string' ? connection.connectionType : 'COMBO')}60` }}
                                  />
                                </div>

                                {/* Target Info */}
                                <div className="flex-1 min-w-0 text-right">
                                  <div className={`text-sm font-bold transition-colors ${isNameMatch ? 'text-green-400' : 'text-white'}`}>
                                    {connection.targetSlotName}
                                  </div>
                                  <div className="text-[10px] font-mono text-white/60 mt-0.5">
                                    {t('node.slot', { index: connection.targetSlot })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                    <div className="w-16 h-16 mb-4 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
                      <X className="h-8 w-8 text-red-400" />
                    </div>
                    <h3 className="text-lg font-extrabold text-white pr-4">
                      {t('node.noCompatibleConnections')}
                    </h3>
                    <p className="text-sm text-white/80 mt-2">
                      {t('node.noConnectionsDesc')}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-5 bg-black/20 border-t border-white/10">
                <Button
                  onClick={onClose}
                  className="w-full h-12 rounded-[22px] bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold transition-all active:scale-95"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};