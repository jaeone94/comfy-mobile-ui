import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NodeMode } from '@/shared/types/app/base';
import { Eye, EyeOff, Play, Square, Trash2, X, MousePointer2, VolumeX, Shuffle } from 'lucide-react';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { SimpleConfirmDialog } from '@/components/ui/SimpleConfirmDialog';

interface GroupInspectorProps {
  selectedNode: any;
  isVisible: boolean;
  onClose: () => void;
  onNavigateToNode: (nodeId: number) => void;
  onSelectNode: (node: any) => void;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  getNodeMode: (nodeId: number, originalMode: number) => number;
  onGroupDelete?: (groupId: number) => void;
  // Group size change functionality - Removed as per user request
  onGroupSizeChange?: (groupId: number, width: number, height: number) => void;
}

export const GroupInspector: React.FC<GroupInspectorProps> = ({
  selectedNode,
  isVisible,
  onClose,
  onNavigateToNode,
  onSelectNode,
  onNodeModeChange,
  getNodeMode,
  onGroupDelete,
}) => {
  const { t } = useTranslation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  if (!selectedNode.groupInfo || !isVisible) {
    return null;
  }

  const { groupInfo } = selectedNode;

  // Style and Icon for each mode
  const getModeConfig = (mode: number) => {
    switch (mode) {
      case NodeMode.ALWAYS:
        return {
          label: t('node.mode.always'),
          color: 'text-emerald-400',
          icon: <Play className="w-3.5 h-3.5" />
        };
      case NodeMode.NEVER:
        return {
          label: t('node.mode.mute'),
          color: 'text-[#3b82f6]',
          icon: <VolumeX className="w-3.5 h-3.5" />
        };
      case NodeMode.BYPASS:
        return {
          label: t('node.mode.bypass'),
          color: 'text-[#9333ea]',
          icon: <Shuffle className="w-3.5 h-3.5" />
        };
      default:
        return {
          label: t('node.mode.always'),
          color: 'text-emerald-400',
          icon: <Play className="w-3.5 h-3.5" />
        };
    }
  };

  // Set all nodes to a specific mode
  const setAllNodesMode = (mode: number) => {
    groupInfo.nodeIds.forEach((nodeId: number) => {
      onNodeModeChange(nodeId, mode);
    });
  };

  // Toggle node mode (Always → Mute → Bypass → Always)
  const toggleNodeMode = (nodeId: number, currentMode: number) => {
    let nextMode: number;
    switch (currentMode) {
      case NodeMode.ALWAYS:
        nextMode = NodeMode.NEVER; // Always → Mute
        break;
      case NodeMode.NEVER:
        nextMode = NodeMode.BYPASS; // Mute → Bypass
        break;
      case NodeMode.BYPASS:
        nextMode = NodeMode.ALWAYS; // Bypass → Always
        break;
      default:
        nextMode = NodeMode.ALWAYS;
        break;
    }
    onNodeModeChange(nodeId, nextMode);
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'none' }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md pointer-events-auto"
          onClick={onClose}
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="relative w-[80vw] h-[75vh] pointer-events-auto flex flex-col"
        >
          {/* Action Buttons Row - Positioned above the modal */}
          <div className="absolute top-0 left-0 -translate-y-[calc(100%+16px)] flex items-center w-full min-h-[48px] pointer-events-none">
            <div className="flex items-center pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <div className="flex items-center gap-1 p-1 bg-[#374151] rounded-full shadow-xl border border-white/10">
                  {[
                    { id: NodeMode.ALWAYS, icon: Play, activeColor: 'text-emerald-400', label: t('node.allAlways') },
                    { id: NodeMode.NEVER, icon: VolumeX, activeColor: 'text-[#3b82f6]', label: t('node.allMute') },
                    { id: NodeMode.BYPASS, icon: Shuffle, activeColor: 'text-[#9333ea]', label: t('node.allBypass') }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setAllNodesMode(mode.id)}
                      title={mode.label}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 text-white/40 hover:text-white/80 hover:bg-white/5"
                    >
                      <mode.icon className="w-5 h-5" />
                    </button>
                  ))}
                </div>

                <div className="w-[1px] h-6 bg-white/10 mx-1" />

                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/10 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
                  title={t('node.deleteGroup')}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </motion.div>
            </div>
          </div>

          {/* Main Card */}
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-3xl shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Floating Close Button */}
            <div className="absolute top-5 right-5 z-20">
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8 custom-scrollbar">
              {/* Group Identity Header */}
              <div className="mb-8 -mx-6 -mt-6 px-8 py-8 bg-black/20">
                <div className="mb-2 pt-2">
                  <div className="flex items-center space-x-2 mb-3">
                    <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-white/80">
                      ID: {groupInfo.groupId}
                    </Badge>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                      GROUP
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white/95">
                    {groupInfo.title}
                  </h2>
                  <p className="text-white/60 text-sm mt-1">
                    {t('node.nodesCount', { count: groupInfo.nodeIds.length })}
                  </p>
                </div>
              </div>

              {/* Nodes List Stack */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2 p-1">
                  <MousePointer2 className="w-4 h-4 text-white/50" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nodes in Group</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {groupInfo.nodes.map((node: any) => {
                    const nodeMode = getNodeMode(node.id, node.mode || NodeMode.ALWAYS);
                    const modeConfig = getModeConfig(nodeMode);

                    return (
                      <div
                        key={node.id}
                        className="group relative p-4 rounded-2xl bg-black/10 border border-white/5 hover:bg-black/20 hover:border-white/10 transition-all"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div
                              className="flex items-center gap-2 mb-1 cursor-pointer group/title"
                              onClick={() => onSelectNode(node)}
                            >
                              <h4 className="font-bold text-base text-white/90 truncate group-hover/title:text-white transition-colors">
                                {node.title || node.type}
                              </h4>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-medium text-white/40">
                              <span>ID: {node.id}</span>
                              <span className="truncate">Type: {node.type}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl">
                            {/* Discrete mode buttons */}
                            {[
                              { mode: NodeMode.ALWAYS, icon: Play, color: 'text-emerald-400', bg: 'bg-emerald-400/10', hover: 'hover:bg-emerald-400/20', label: t('node.mode.always') },
                              { mode: NodeMode.NEVER, icon: VolumeX, color: 'text-[#3b82f6]', bg: 'bg-[#3b82f6]/10', hover: 'hover:bg-[#3b82f6]/20', label: t('node.mode.mute') },
                              { mode: NodeMode.BYPASS, icon: Shuffle, color: 'text-[#9333ea]', bg: 'bg-[#9333ea]/10', hover: 'hover:bg-[#9333ea]/20', label: t('node.mode.bypass') }
                            ].map((config) => {
                              const isActive = nodeMode === config.mode;
                              return (
                                <button
                                  key={config.mode}
                                  onClick={() => onNodeModeChange(node.id, config.mode)}
                                  className={`p-2 rounded-lg transition-all active:scale-90 ${isActive
                                      ? `${config.color} ${config.bg}`
                                      : 'text-white/20 hover:text-white/60 hover:bg-white/5'
                                    }`}
                                  title={config.label}
                                >
                                  <config.icon className="w-5 h-5" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {groupInfo.nodes.length === 0 && (
                    <div className="text-center py-12 rounded-3xl bg-black/10 border border-dashed border-white/10">
                      <p className="text-white/40 text-sm">{t('node.noNodesInGroup')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Delete Confirmation */}
          <SimpleConfirmDialog
            isOpen={isDeleteDialogOpen}
            onClose={() => setIsDeleteDialogOpen(false)}
            onConfirm={() => {
              onGroupDelete?.(groupInfo.groupId);
              setIsDeleteDialogOpen(false);
              onClose();
            }}
            title={t('node.deleteGroup')}
            message={t('node.deleteGroupConfirm', { title: groupInfo.title, id: groupInfo.groupId })}
            confirmText={t('common.delete')}
            isDestructive={true}
          />
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};