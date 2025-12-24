import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { NodeMode } from '@/shared/types/app/base';
import { Eye, EyeOff, Play, Square, Trash2, Settings } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

interface GroupSizeControlProps {
  selectedNode: any;
  onSizeChange?: (width: number, height: number) => void;
}

const GroupSizeControl: React.FC<GroupSizeControlProps> = ({
  selectedNode,
  onSizeChange,
}) => {
  const { t } = useTranslation();
  // Extract group size from bounding array [x, y, width, height]
  const groupInfo = selectedNode.groupInfo;
  const bounding = groupInfo?.bounding || [0, 0, 300, 400]; // fallback values
  const currentWidth = bounding[2] || 300;
  const currentHeight = bounding[3] || 400;

  // Store original values when component first mounts or group changes
  const [originalWidth, setOriginalWidth] = useState(currentWidth);
  const [originalHeight, setOriginalHeight] = useState(currentHeight);

  // Local state for real-time preview
  const [previewWidth, setPreviewWidth] = useState(currentWidth);
  const [previewHeight, setPreviewHeight] = useState(currentHeight);

  // Update states when selectedNode changes (different group selected)
  useEffect(() => {
    const newWidth = bounding[2] || 300;
    const newHeight = bounding[3] || 400;

    // Only update if this is a different group
    if (newWidth !== originalWidth || newHeight !== originalHeight) {
      setOriginalWidth(newWidth);
      setOriginalHeight(newHeight);
      setPreviewWidth(newWidth);
      setPreviewHeight(newHeight);
    }
  }, [selectedNode.id]); // Only depend on group ID to detect group changes

  // Handle width change
  const handleWidthChange = (values: number[]) => {
    const newWidth = values[0];
    setPreviewWidth(newWidth);
    if (onSizeChange) {
      onSizeChange(newWidth, previewHeight);
    }
  };

  // Handle height change
  const handleHeightChange = (values: number[]) => {
    const newHeight = values[0];
    setPreviewHeight(newHeight);
    if (onSizeChange) {
      onSizeChange(previewWidth, newHeight);
    }
  };

  // Calculate relative size change based on original values
  const widthChange = ((previewWidth - originalWidth) / originalWidth * 100).toFixed(0);
  const heightChange = ((previewHeight - originalHeight) / originalHeight * 100).toFixed(0);

  // Calculate preview dimensions for overlapping boxes
  const maxContainerWidth = 120;
  const maxContainerHeight = 80;

  // Calculate scale factor based on the larger of original or new size
  const maxWidth = Math.max(originalWidth, previewWidth);
  const maxHeight = Math.max(originalHeight, previewHeight);

  const scaleX = maxContainerWidth / maxWidth;
  const scaleY = maxContainerHeight / maxHeight;
  const scale = Math.min(scaleX, scaleY, 1) * 0.8; // 80% of calculated scale for padding

  // Calculate display dimensions
  const originalDisplayWidth = originalWidth * scale;
  const originalDisplayHeight = originalHeight * scale;
  const newDisplayWidth = previewWidth * scale;
  const newDisplayHeight = previewHeight * scale;

  // Determine container size (use the larger of original or new)
  const containerWidth = Math.max(originalDisplayWidth, newDisplayWidth);
  const containerHeight = Math.max(originalDisplayHeight, newDisplayHeight);

  return (
    <div className="space-y-4">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('node.groupSize')}:</span>

      {/* Size Controls */}
      <div className="space-y-6">
        {/* Width Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-medium text-slate-600 dark:text-slate-400">{t('node.width')}</label>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-mono text-slate-700 dark:text-slate-300 min-w-[80px] text-right">
                {Math.round(previewWidth)}px
              </span>
              {Math.abs(Number(widthChange)) > 0 && (
                <span className={`text-sm font-medium min-w-[50px] text-right ${Number(widthChange) > 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
                  }`}>
                  {Number(widthChange) > 0 ? '+' : ''}{widthChange}%
                </span>
              )}
            </div>
          </div>
          <div className="px-2 py-2">
            <Slider
              value={[previewWidth]}
              onValueChange={handleWidthChange}
              min={100}
              max={1600}
              step={10}
              className="w-full [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_.slider-track]:h-2"
            />
          </div>
        </div>

        {/* Height Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-medium text-slate-600 dark:text-slate-400">{t('node.height')}</label>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-mono text-slate-700 dark:text-slate-300 min-w-[80px] text-right">
                {Math.round(previewHeight)}px
              </span>
              {Math.abs(Number(heightChange)) > 0 && (
                <span className={`text-sm font-medium min-w-[50px] text-right ${Number(heightChange) > 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
                  }`}>
                  {Number(heightChange) > 0 ? '+' : ''}{heightChange}%
                </span>
              )}
            </div>
          </div>
          <div className="px-2 py-2">
            <Slider
              value={[previewHeight]}
              onValueChange={handleHeightChange}
              min={100}
              max={1600}
              step={10}
              className="w-full [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_.slider-track]:h-2"
            />
          </div>
        </div>
      </div>

      {/* Size Preview */}
      <div className="space-y-4 mt-8">
        <span className="text-base font-medium text-slate-600 dark:text-slate-400">{t('node.preview')}:</span>
        <div className="flex flex-col items-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          {/* Overlapping boxes container */}
          <div
            className="relative flex items-center justify-center"
            style={{
              width: `${containerWidth + 20}px`,
              height: `${containerHeight + 20}px`,
              minWidth: '80px',
              minHeight: '60px'
            }}
          >
            {/* Original size box (always rendered first, behind) */}
            <div
              className="absolute border-2 rounded-sm transition-all bg-blue-200/70 dark:bg-blue-800/70 border-blue-400 dark:border-blue-600"
              style={{
                width: `${Math.max(originalDisplayWidth, 16)}px`,
                height: `${Math.max(originalDisplayHeight, 8)}px`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: previewWidth <= originalWidth && previewHeight <= originalHeight ? 2 : 1
              }}
              title={`${t('node.original')}: ${Math.round(originalWidth)}×${Math.round(originalHeight)}`}
            />

            {/* New size box (rendered on top when larger, behind when smaller) */}
            <div
              className="absolute border-2 rounded-sm transition-all bg-green-200/80 dark:bg-green-800/80 border-green-400 dark:border-green-600"
              style={{
                width: `${Math.max(newDisplayWidth, 16)}px`,
                height: `${Math.max(newDisplayHeight, 8)}px`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: previewWidth > originalWidth || previewHeight > originalHeight ? 2 : 1
              }}
              title={`${t('node.new')}: ${Math.round(previewWidth)}×${Math.round(previewHeight)}`}
            />
          </div>

          {/* Size information */}
          <div className="flex flex-col items-center space-y-3 mt-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-sm border bg-blue-200 dark:bg-blue-800 border-blue-400 dark:border-blue-600" />
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                {t('node.original')}: {Math.round(originalWidth)}×{Math.round(originalHeight)}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-sm border bg-green-200 dark:bg-green-800 border-green-400 dark:border-green-600" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                {t('node.new')}: {Math.round(previewWidth)}×{Math.round(previewHeight)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface GroupInspectorProps {
  selectedNode: any;
  isVisible: boolean;
  onClose: () => void;
  onNavigateToNode: (nodeId: number) => void;
  onSelectNode: (node: any) => void;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  getNodeMode: (nodeId: number, originalMode: number) => number;
  onGroupDelete?: (groupId: number) => void;
  // Group size change functionality
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
  onGroupSizeChange,
}) => {
  const { t } = useTranslation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptExecuting, setIsPromptExecuting] = useState(() => {
    // Initialize with current execution state to prevent animation flash
    const currentState = globalWebSocketService.getCurrentExecutionState();
    return currentState.isExecuting;
  });
  const [hasInitialHeightSet, setHasInitialHeightSet] = useState(false);

  // Listen for prompt execution state changes
  useEffect(() => {
    const service = globalWebSocketService;

    // Mark that initial height has been set after first render
    setTimeout(() => {
      setHasInitialHeightSet(true);
    }, 100);

    // Event handlers
    const handleExecuting = (event: any) => {
      const { data } = event;
      setIsPromptExecuting(data.node !== null);
    };

    const handleExecutionComplete = () => {
      setIsPromptExecuting(false);
    };

    const handleProgressState = (event: any) => {
      const { data } = event;
      if (data.nodes) {
        const hasRunningNodes = Object.values(data.nodes).some((node: any) => node.state === 'running');
        setIsPromptExecuting(hasRunningNodes);
      }
    };

    // Subscribe to events
    const listenerIds = [
      service.on('executing', handleExecuting),
      service.on('execution_success', handleExecutionComplete),
      service.on('execution_error', handleExecutionComplete),
      service.on('execution_interrupted', handleExecutionComplete),
      service.on('progress_state', handleProgressState)
    ];

    return () => {
      // Cleanup
      service.offById('executing', listenerIds[0]);
      service.offById('execution_success', listenerIds[1]);
      service.offById('execution_error', listenerIds[2]);
      service.offById('execution_interrupted', listenerIds[3]);
      service.offById('progress_state', listenerIds[4]);
    };
  }, []);

  if (!selectedNode.groupInfo) {
    return null;
  }

  const { groupInfo } = selectedNode;

  // Style and Icon for each mode
  const getModeConfig = (mode: number) => {
    switch (mode) {
      case NodeMode.ALWAYS:
        return {
          label: 'Always',
          color: 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30',
          icon: <Play className="w-3 h-3" />
        };
      case NodeMode.NEVER:
        return {
          label: 'Mute',
          color: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/30',
          icon: <Square className="w-3 h-3" />
        };
      case NodeMode.BYPASS:
        return {
          label: 'Bypass',
          color: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-400/30',
          icon: <EyeOff className="w-3 h-3" />
        };
      default:
        return {
          label: 'Always',
          color: 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30',
          icon: <Play className="w-3 h-3" />
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

  // Calculate dynamic height based on prompt execution state
  const getGroupInspectorHeight = () => {
    // Base header height: 64px (typical header height)
    // Progress bar height when executing: ~80px (based on ExecutionProgressBar component)
    // Additional padding/margins: ~16px
    const baseHeaderHeight = 92;
    const progressBarHeight = isPromptExecuting ? 90 : 0;
    const totalHeaderHeight = baseHeaderHeight + progressBarHeight;

    // Calculate available height (95vh - dynamic header height)
    return `calc(95vh - ${totalHeaderHeight}px)`;
  };

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-50 bg-white/50 backdrop-blur-md border-t border-slate-200/40 shadow-2xl dark:bg-slate-900/50 dark:border-slate-700/40 flex flex-col"
      initial={{ y: '100%', opacity: 0 }}
      animate={{
        y: isVisible ? 0 : '100%',
        opacity: isVisible ? 1 : 0,
        height: getGroupInspectorHeight()
      }}
      transition={{
        type: "spring",
        damping: 25,
        stiffness: 300,
        duration: isVisible ? 0.3 : 0, // Animate only when opening
        height: {
          type: "tween",
          duration: hasInitialHeightSet ? 0.3 : 0
        }
      }}
      style={{
        touchAction: 'pan-y pinch-zoom',
        overscrollBehaviorX: 'none',
        maxHeight: getGroupInspectorHeight()
      } as React.CSSProperties}
      onTouchStart={(e) => {
        // Prevent horizontal swipe gestures on the panel itself
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        const target = e.target as HTMLElement;

        // Allow slider interactions, but prevent other horizontal swipes
        if (!target.closest('[role="slider"]') &&
          !target.closest('[data-slider]') &&
          !target.closest('[data-radix-slider-root]')) {
          e.stopPropagation();
        }
      }}
    >
      {/* Fixed Header */}
      <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {groupInfo.title}
                </h3>
              </div>
              <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
                <span>Group ID: {groupInfo.groupId}</span>
                <span>{t('node.nodesCount', { count: groupInfo.nodeIds.length })}</span>
                <Badge variant="outline" className="text-xs">
                  GROUP
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Settings Button */}
              {onGroupSizeChange && (
                <Button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  variant="ghost"
                  size="sm"
                  className={`h-9 w-9 p-0 flex-shrink-0 rounded-lg transition-colors ${isSettingsOpen
                    ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  title={t('node.groupSettings')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {/* Delete Button */}
              {onGroupDelete && (
                <Button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 flex-shrink-0 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  title={t('node.deleteGroup')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {/* Close Button */}
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                <span className="text-2xl leading-none">×</span>
              </Button>
            </div>
          </div>

          {/* Batch processing buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAllNodesMode(NodeMode.ALWAYS)}
              size="sm"
              className="bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-300 border-green-400/30 dark:border-green-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium"
            >
              <Play className="w-4 h-4 mr-1" />
              {t('node.allAlways')}
            </Button>
            <Button
              onClick={() => setAllNodesMode(NodeMode.NEVER)}
              size="sm"
              className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 border-blue-400/30 dark:border-blue-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium"
            >
              <Square className="w-4 h-4 mr-1" />
              {t('node.allMute')}
            </Button>
            <Button
              onClick={() => setAllNodesMode(NodeMode.BYPASS)}
              size="sm"
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 border-purple-400/30 dark:border-purple-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium"
            >
              <EyeOff className="w-4 h-4 mr-1" />
              {t('node.allBypass')}
            </Button>
          </div>

          {/* Group Settings Section */}
          <AnimatePresence>
            {isSettingsOpen && onGroupSizeChange && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm">
                  <GroupSizeControl
                    selectedNode={selectedNode}
                    onSizeChange={(width: number, height: number) => {
                      onGroupSizeChange(groupInfo.groupId, width, height);
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto p-4"
        style={{
          touchAction: 'pan-y pinch-zoom',
          overscrollBehaviorX: 'none'
        } as React.CSSProperties}
        onTouchStart={(e) => {
          // Prevent horizontal swipe gestures in content area
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          const target = e.target as HTMLElement;

          // Allow slider interactions, but prevent other horizontal swipes
          if (!target.closest('[role="slider"]') &&
            !target.closest('[data-slider]') &&
            !target.closest('[data-radix-slider-root]')) {
            e.stopPropagation();
          }
        }}
      >
        <div
          className="max-w-4xl mx-auto"
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            const target = e.target as HTMLElement;

            // Allow slider interactions only
            if (!target.closest('[role="slider"]') &&
              !target.closest('[data-slider]') &&
              !target.closest('[data-radix-slider-root]')) {
              e.stopPropagation();
            }
          }}
        >
          <div className="space-y-3">
            {groupInfo.nodes.map((node: any) => {
              const nodeMode = getNodeMode(node.id, node.mode || NodeMode.ALWAYS);
              const modeConfig = getModeConfig(nodeMode);

              return (
                <div
                  key={node.id}
                  className="p-3 rounded-lg border border-slate-200/60 bg-white/40 dark:bg-slate-800/40 dark:border-slate-700/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {node.title || node.type}
                        </h4>
                        <Badge className={`text-xs ${modeConfig.color} flex items-center space-x-1`}>
                          {modeConfig.icon}
                          <span>{modeConfig.label}</span>
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400">
                        <span>ID: {node.id}</span>
                        <span>Type: {node.type}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Node mode toggle button (Always → Mute → Bypass → Always) */}
                      <Button
                        onClick={() => toggleNodeMode(node.id, nodeMode)}
                        size="sm"
                        variant="ghost"
                        className={`h-8 px-2 ${nodeMode === NodeMode.ALWAYS
                          ? 'text-blue-700 dark:text-blue-400 hover:bg-blue-500/10'
                          : nodeMode === NodeMode.NEVER
                            ? 'text-purple-700 dark:text-purple-400 hover:bg-purple-500/10'
                            : 'text-green-700 dark:text-green-400 hover:bg-green-500/10'
                          }`}
                        title={
                          nodeMode === NodeMode.ALWAYS
                            ? t('node.clickToMute')
                            : nodeMode === NodeMode.NEVER
                              ? t('node.clickToBypass')
                              : t('node.clickToAlways')
                        }
                      >
                        {nodeMode === NodeMode.ALWAYS ? (
                          <Square className="w-4 h-4" />
                        ) : nodeMode === NodeMode.NEVER ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>

                      {/* Node navigation button */}
                      <Button
                        onClick={() => onNavigateToNode(node.id)}
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-blue-600 dark:text-blue-400"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>

                      {/* Node selection button */}
                      <Button
                        onClick={() => onSelectNode(node)}
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-slate-600 dark:text-slate-400"
                      >
                        {t('common.edit')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {groupInfo.nodes.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>{t('node.noNodesInGroup')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Delete Dialog */}
      {onGroupDelete && (
        <ConfirmDialog
          isOpen={isDeleteDialogOpen}
          title={t('node.deleteGroup')}
          message={t('node.deleteGroupConfirm', { title: groupInfo.title, id: groupInfo.groupId })}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="destructive"
          onConfirm={() => onGroupDelete(groupInfo.groupId)}
          onCancel={() => { }}
          onClose={() => setIsDeleteDialogOpen(false)}
        />
      )}
    </motion.div>
  );
};