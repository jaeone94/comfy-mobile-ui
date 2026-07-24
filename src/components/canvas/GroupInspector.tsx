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
import { darkenColor } from '@/shared/utils/rendering/CanvasRendererService';

interface GroupInspectorProps {
  selectedNode: any;
  isVisible: boolean;
  onClose: () => void;
  onNavigateToNode: (nodeId: number) => void;
  onSelectNode: (node: any) => void;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  onNodeModeChangeBatch?: (modifications: { nodeId: number, mode: number }[]) => void;
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
  onNodeModeChangeBatch,
  getNodeMode,
  onGroupDelete,
}) => {
  const { t } = useTranslation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  // Constants for title scaling
  const baseTitleSize = '1.875rem'; // text-3xl roughly
  const compactTitleSize = '0.8125rem'; // roughly same as NodeDetailModal

  useEffect(() => {
    if (!isVisible || !scrollContainerRef.current || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderCompact(!entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0,
        rootMargin: '0px'
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  // Reset scroll state on open/close or node change
  useEffect(() => {
    if (isVisible) {
      setIsHeaderCompact(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isVisible, selectedNode.groupInfo?.groupId]);

  if (!selectedNode.groupInfo || !isVisible) {
    return null;
  }

  const { groupInfo } = selectedNode;

  // Calculate if all nodes have the same mode
  const commonMode = React.useMemo(() => {
    if (!groupInfo?.nodes || groupInfo.nodes.length === 0) return null;
    const firstNodeMode = getNodeMode(groupInfo.nodes[0].id, groupInfo.nodes[0].mode || NodeMode.ALWAYS);
    const allSame = groupInfo.nodes.every((node: any) =>
      getNodeMode(node.id, node.mode || NodeMode.ALWAYS) === firstNodeMode
    );
    return allSame ? firstNodeMode : null;
  }, [groupInfo.nodes, getNodeMode]);

  // Style and Icon for each mode
  const getModeConfig = (mode: number) => {
    switch (mode) {
      case NodeMode.ALWAYS:
        return {
          label: t('node.mode.always'),
          color: 'text-[#4ade80]',
          icon: <Play className="w-3.5 h-3.5" />
        };
      case NodeMode.NEVER:
        return {
          label: t('node.mode.mute'),
          color: 'text-[#5b8af5]',
          icon: <VolumeX className="w-3.5 h-3.5" />
        };
      case NodeMode.BYPASS:
        return {
          label: t('node.mode.bypass'),
          color: 'text-[#9a8af0]',
          icon: <Shuffle className="w-3.5 h-3.5" />
        };
      default:
        return {
          label: t('node.mode.always'),
          color: 'text-[#4ade80]',
          icon: <Play className="w-3.5 h-3.5" />
        };
    }
  };

  // Set all nodes to a specific mode
  const setAllNodesMode = (mode: number) => {
    // PREFER BATCH UPDATE if available to avoid race conditions
    if (onNodeModeChangeBatch) {
      const modifications = groupInfo.nodeIds.map((nodeId: number) => ({
        nodeId,
        mode
      }));
      onNodeModeChangeBatch(modifications);
    } else {
      // Fallback
      groupInfo.nodeIds.forEach((nodeId: number) => {
        onNodeModeChange(nodeId, mode);
      });
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-4" style={{ pointerEvents: 'none' }}>
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
          className="relative w-[85vw] max-w-md h-[64vh] pointer-events-auto flex flex-col"
        >
          {/* Action Buttons Row - Positioned above the modal */}
          <div className="absolute top-0 left-0 -translate-y-[calc(100%+12px)] flex items-center w-full min-h-[40px] pointer-events-none">
            <div className="flex items-center pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <div className="flex items-center gap-1 p-1 bg-[#0f1116]/90 backdrop-blur-md rounded-[10px] shadow-xl border border-white/10">
                  {[
                    { id: NodeMode.ALWAYS, icon: Play, activeColor: 'text-[#4ade80]', label: t('node.allAlways') },
                    { id: NodeMode.NEVER, icon: VolumeX, activeColor: 'text-[#5b8af5]', label: t('node.allMute') },
                    { id: NodeMode.BYPASS, icon: Shuffle, activeColor: 'text-[#9a8af0]', label: t('node.allBypass') }
                  ].map((mode) => {
                    const isActive = commonMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setAllNodesMode(mode.id)}
                        title={mode.label}
                        className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-all active:scale-90 
                          ${isActive
                            ? `${mode.activeColor} bg-white/10 ring-1 ring-white/20 shadow-inner`
                            : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                          }`}
                      >
                        <mode.icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>

                <div className="w-[1px] h-6 bg-white/10 mx-1" />

                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="w-[38px] h-[38px] rounded-[10px] bg-[#0f1116]/90 backdrop-blur-md shadow-xl border border-white/10 flex items-center justify-center text-[#f87c7c] hover:text-[#f25555] hover:bg-[#f25555]/10 transition-all active:scale-95"
                  title={t('node.deleteGroup')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          </div>

          {/* Main Card */}
          <div
            style={{ backgroundColor: '#1c212c' }}
            className="relative w-full h-full rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden flex flex-col text-white"
          >
            {/* Dynamic Sticky Header - solid fill matching the canvas node title bar */}
            <div
              style={{ backgroundColor: darkenColor('#1c212c', 0.25) }}
              className={`absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b border-white/[0.06] min-h-[32px] transition-all duration-300 ease-in-out
                ${isHeaderCompact
                  ? 'pt-1.5 pb-[11px] pl-4 pr-[40px]'
                  : 'pt-4 pb-3.5 pl-4 pr-12'
                }`}
            >
              {/* Floating Close Button */}
              <div
                className={`absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}
              >
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-white/[0.06] text-[#9aa3b2] hover:text-white hover:bg-white/[0.1] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0">
                <div
                  className={`flex items-center space-x-2 transition-all duration-300 origin-left ${isHeaderCompact ? 'mb-0.5 scale-90' : 'mb-2 scale-100'}`}
                >
                  <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-black/20 text-white/80">
                    ID: {groupInfo.groupId}
                  </Badge>
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    GROUP
                  </span>
                </div>

                <div
                  className="flex items-center min-w-0 transition-all duration-300"
                  style={{ height: isHeaderCompact ? '12px' : '1.125rem' }}
                >
                  <h2
                    style={{
                      fontSize: '1.125rem',
                      lineHeight: '1',
                      transform: isHeaderCompact ? `scale(${0.75 / 1.125})` : 'scale(1)',
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {groupInfo.title}
                  </h2>
                </div>

                <div
                  className={`inline-flex self-start items-center text-[10px] font-medium px-1.5 rounded-md border m-0 transition-all duration-300 overflow-hidden text-white/80 bg-black/20 border-white/10
                    ${isHeaderCompact
                      ? 'opacity-0 scale-75 h-0 mt-0 py-0 border-transparent'
                      : 'opacity-100 scale-100 h-5 mt-2 py-0.5'
                    }`}
                >
                  {t('node.nodesCount', { count: groupInfo.nodeIds.length })}
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Static Top Bumper */}
              <div className="h-[96px] relative pointer-events-none">
                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
              </div>

              <div className="px-3 py-4">
                {/* Nodes List Stack */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 mb-2 p-1">
                    <MousePointer2 className="w-3.5 h-3.5 text-white/50" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Nodes in Group</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {groupInfo.nodes.map((node: any) => {
                      const nodeMode = getNodeMode(node.id, node.mode || NodeMode.ALWAYS);
                      const modeConfig = getModeConfig(nodeMode);

                      return (
                        <div
                          key={node.id}
                          className="group relative px-2.5 py-2 rounded-[10px] bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all"
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex-1 min-w-0">
                              <div
                                className="flex items-center gap-2 mb-1 cursor-pointer group/title"
                                onClick={() => onSelectNode(node)}
                              >
                                <h4 className="font-semibold text-[12px] text-[#e9ebef] truncate group-hover/title:text-white transition-colors">
                                  {node.title || node.type}
                                </h4>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[9.5px] text-[#565d6b]">
                                <span>ID: {node.id}</span>
                                <span className="truncate">Type: {node.type}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5 bg-black/20 p-0.5 rounded-lg">
                              {/* Discrete mode buttons */}
                              {[
                                { mode: NodeMode.ALWAYS, icon: Play, color: 'text-[#4ade80]', bg: 'bg-[#34c77b]/[0.12]', hover: 'hover:bg-[#34c77b]/[0.2]', label: t('node.mode.always') },
                                { mode: NodeMode.NEVER, icon: VolumeX, color: 'text-[#5b8af5]', bg: 'bg-[#3069f0]/[0.12]', hover: 'hover:bg-[#3069f0]/[0.2]', label: t('node.mode.mute') },
                                { mode: NodeMode.BYPASS, icon: Shuffle, color: 'text-[#9a8af0]', bg: 'bg-[#9a8af0]/[0.12]', hover: 'hover:bg-[#9a8af0]/[0.2]', label: t('node.mode.bypass') }
                              ].map((config) => {
                                const isActive = nodeMode === config.mode;
                                return (
                                  <button
                                    key={config.mode}
                                    onClick={() => onNodeModeChange(node.id, config.mode)}
                                    className={`p-1.5 rounded-[7px] transition-all active:scale-90 ${isActive
                                      ? `${config.color} ${config.bg}`
                                      : 'text-white/20 hover:text-white/60 hover:bg-white/5'
                                      }`}
                                    title={config.label}
                                  >
                                    <config.icon className="w-4 h-4" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {groupInfo.nodes.length === 0 && (
                      <div className="text-center py-12 rounded-xl bg-black/10 border border-dashed border-white/10">
                        <p className="text-white/40 text-[12px]">{t('node.noNodesInGroup')}</p>
                      </div>
                    )}
                  </div>
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