import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Trash2, RefreshCw, Edit3, Check, X, ChevronLeft, ChevronRight, ArrowDownToLine, ArrowUpFromLine, Settings, Copy } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { INodeWithMetadata } from '@/shared/types/comfy/IComfyObjectInfo';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { NodeMode } from '@/shared/types/app/base';
import { NodeParameterEditor } from '@/components/canvas/NodeParameterEditor';
import { NodeSettingsEditor } from '@/components/canvas/NodeSettingsEditor';
import { GroupInspector } from '@/components/canvas/GroupInspector';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { NodeClipboardService } from '@/services/NodeClipboardService';
import { toast } from 'sonner';

interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  node: ComfyGraphNode;
}

interface EditingParam {
  nodeId: number;
  paramName: string;
}

interface UploadState {
  isUploading: boolean;
  nodeId?: number;
  paramName?: string;
  message?: string;
}

interface NodeInspectorProps {
  selectedNode: ComfyGraphNode;
  nodeMetadata: Map<number, INodeWithMetadata>;
  metadataLoading: boolean;
  metadataError: string | null;
  isNodePanelVisible: boolean;
  editingParam: EditingParam | null;
  editingValue: any;
  uploadState: UploadState;
  nodeBounds: Map<number, NodeBounds>;
  getWidgetValue: (nodeId: number, paramName: string, originalValue: any) => any;
  getNodeMode: (nodeId: number, originalMode: number) => number;
  onClose: () => void;
  onStartEditing: (nodeId: number, paramName: string, value: any) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onEditingValueChange: (value: any) => void;
  onControlAfterGenerateChange?: (nodeId: number, value: string) => void;
  onFilePreview: (filename: string) => void;
  onFileUpload: (nodeId: number, paramName: string) => void;
  onFileUploadDirect?: (nodeId: number, paramName: string, file: File) => void;
  onNavigateToNode: (nodeId: number) => void;
  onSelectNode: (node: ComfyGraphNode) => void;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  modifiedWidgetValues: Map<number, Record<string, any>>;
  // Direct widget value setting (for bypassing edit mode)
  setWidgetValue?: (nodeId: number, paramName: string, value: any) => void;
  // Single execute functionality
  isOutputNode?: boolean;
  canSingleExecute?: boolean;
  isSingleExecuting?: boolean;
  onSingleExecute?: (nodeId: number) => void;
  // Node color change functionality
  onNodeColorChange?: (nodeId: number, bgcolor: string) => void;
  // Node deletion functionality
  onNodeDelete?: (nodeId: number) => void;
  // Group deletion functionality
  onGroupDelete?: (groupId: number) => void;
  // Node refresh functionality
  onNodeRefresh?: (nodeId: number) => void;
  // Node title change functionality
  onNodeTitleChange?: (nodeId: number, title: string) => void;
  // Node size change functionality
  onNodeSizeChange?: (nodeId: number, width: number, height: number) => void;
  // Node collapse functionality
  onNodeCollapseChange?: (nodeId: number, collapsed: boolean) => void;
  // Group size change functionality
  onGroupSizeChange?: (groupId: number, width: number, height: number) => void;
  // Link disconnection functionality
  onDisconnectInput?: (nodeId: number, inputSlot: number) => void;
  onDisconnectOutput?: (nodeId: number, outputSlot: number, linkId: number) => void;
}


export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  nodeMetadata,
  metadataLoading,
  metadataError,
  isNodePanelVisible,
  editingParam,
  editingValue,
  uploadState,
  nodeBounds,
  getWidgetValue,
  getNodeMode,
  modifiedWidgetValues,
  onClose,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onEditingValueChange,
  onControlAfterGenerateChange,
  onFilePreview,
  onFileUpload,
  onFileUploadDirect,
  onNavigateToNode,
  onSelectNode,
  onNodeModeChange,
  setWidgetValue,
  // Single execute props
  isOutputNode = false,
  canSingleExecute = false,
  isSingleExecuting = false,
  onSingleExecute,
  // Node color change prop
  onNodeColorChange,
  // Node deletion prop
  onNodeDelete,
  // Group deletion prop
  onGroupDelete,
  // Node refresh prop
  onNodeRefresh,
  // Node title change prop
  onNodeTitleChange,
  // Node size change props
  onNodeSizeChange,
  onNodeCollapseChange,
  // Group size change prop
  onGroupSizeChange,
  // Link disconnection props
  onDisconnectInput,
  onDisconnectOutput,
}) => {
  const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
  const metadata = nodeMetadata.get(nodeId);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [currentSlide, setCurrentSlide] = useState(1); // 0: inputs, 1: main, 2: outputs
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptExecuting, setIsPromptExecuting] = useState(() => {
    // Initialize with current execution state to prevent animation flash
    const currentState = globalWebSocketService.getCurrentExecutionState();
    return currentState.isExecuting;
  });
  const [hasInitialHeightSet, setHasInitialHeightSet] = useState(false);

  // Get current node bgcolor from selectedNode
  const currentBgColor = selectedNode.bgcolor || undefined;

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

  // Title editing handlers
  const handleStartEditingTitle = () => {
    setEditingTitleValue(selectedNode.title || '');
    setIsEditingTitle(true);
  };

  const handleSaveTitleChange = () => {
    if (onNodeTitleChange) {
      onNodeTitleChange(nodeId, editingTitleValue.trim());
    }
    setIsEditingTitle(false);
    setEditingTitleValue('');
  };

  const handleCancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditingTitleValue('');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitleChange();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelTitleEdit();
    }
  };

  const handleCopyNode = () => {
    try {
      // Collect current widget values
      const currentWidgets: Record<string, any> = {};

      // Get widgets from node structure
      const widgets = (selectedNode as any).widgets || [];
      const _widgets = (selectedNode as any)._widgets || [];
      const allWidgets = [...widgets, ..._widgets];

      allWidgets.forEach((w: any) => {
        if (w.name) {
          // Use getWidgetValue to account for any modified values not yet saved to graph
          const val = getWidgetValue(nodeId, w.name, w.value);
          currentWidgets[w.name] = val;
        }
      });

      const success = NodeClipboardService.saveNode({
        originalNodeId: nodeId,
        type: selectedNode.type,
        title: metadata?.displayName || selectedNode.title || selectedNode.type,
        widgets: currentWidgets,
        color: selectedNode.bgcolor,
        size: selectedNode.size ? Array.from(selectedNode.size) : undefined
      });

      if (success) {
        toast.success("Node copied to clipboard", {
          description: "You can paste it from the Add Node menu",
          duration: 2000
        });
      } else {
        toast.error("Failed to copy node");
      }
    } catch (error) {
      console.error("Copy failed:", error);
      toast.error("An error occurred while copying");
    }
  };

  // Group node detection (WorkflowNode type's groupInfo property check)
  const isGroupNode = selectedNode.type === 'GROUP_NODE' && 'groupInfo' in selectedNode && selectedNode.groupInfo;

  // If it's a group node, render GroupInspector
  if (isGroupNode) {
    return (
      <GroupInspector
        selectedNode={selectedNode}
        isVisible={isNodePanelVisible}
        onClose={onClose}
        onNavigateToNode={onNavigateToNode}
        onSelectNode={onSelectNode}
        onNodeModeChange={onNodeModeChange}
        getNodeMode={getNodeMode}
        onGroupDelete={onGroupDelete}
        onGroupSizeChange={onGroupSizeChange}
      />
    );
  }

  // Create color filter based on node bgcolor
  const getColorFilter = (bgcolor?: string) => {
    if (!bgcolor) return {};

    // Convert hex to RGB and apply subtle overlay
    const hex = bgcolor.replace('#', '');
    let r, g, b;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return {};
    }

    return {
      backgroundImage: `linear-gradient(rgba(${r}, ${g}, ${b}, 0.12), rgba(${r}, ${g}, ${b}, 0.06))`,
      borderTopColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
    };
  };

  // Calculate dynamic height based on prompt execution state
  const getNodeInspectorHeight = () => {
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
        y: isNodePanelVisible ? 0 : '100%',
        opacity: isNodePanelVisible ? 1 : 0,
        height: getNodeInspectorHeight()
      }}
      transition={{
        type: "spring",
        damping: 25,
        stiffness: 300,
        duration: isNodePanelVisible ? 0.3 : 0, // Animate only when opening
        height: {
          type: "tween",
          duration: hasInitialHeightSet ? 0.3 : 0
        }
      }}
      style={{
        touchAction: 'pan-y pinch-zoom',
        overscrollBehaviorX: 'none',
        maxHeight: getNodeInspectorHeight(),
        ...getColorFilter(currentBgColor)
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
      <div className="border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="p-4">
          <div className="max-w-4xl mx-auto">
            {/* Title Row */}
            <div className="flex items-center justify-between mb-1 gap-3">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {isEditingTitle ? (
                  <>
                    <input
                      type="text"
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onKeyDown={handleTitleKeyDown}
                      className="flex-1 px-2 py-1 text-lg font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter node title..."
                      autoFocus
                    />
                    <Button
                      onClick={handleSaveTitleChange}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/20"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={handleCancelTitleEdit}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {metadata?.displayName || selectedNode.title || selectedNode.type}
                    </h3>
                    {onNodeTitleChange && (
                      <Button
                        onClick={handleStartEditingTitle}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Edit node title"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {!isEditingTitle && (
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {/* Copy Button */}
                  <Button
                    onClick={handleCopyNode}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    title="Copy node settings"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {/* Refresh Button */}
                  {onNodeRefresh && (
                    <Button
                      onClick={() => onNodeRefresh(nodeId)}
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 flex-shrink-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      title="Refresh node input/output slots"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  {/* Settings Button - Now combines all settings */}
                  <Button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    variant="ghost"
                    size="sm"
                    className={`h-9 w-9 p-0 flex-shrink-0 rounded-lg transition-all ${isSettingsOpen
                        ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                        : 'hover:bg-orange-100 dark:hover:bg-orange-900/20 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300'
                      }`}
                    title="Node settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  {/* Delete Button */}
                  {onNodeDelete && (
                    <Button
                      onClick={() => setIsDeleteDialogOpen(true)}
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 flex-shrink-0 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {/* Close Button */}
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    <span className="text-xl leading-none">×</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Info Row */}
            <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400 mb-2">
              <span>ID: {nodeId}</span>
              <span>Type: {selectedNode.type}</span>
              {metadata?.category && (
                <Badge variant="outline" className="text-xs">
                  {metadata.category}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Carousel Navigation - Hide when settings are open */}
        {!isSettingsOpen && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
            <Button
              onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
              disabled={currentSlide === 0}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentSlide(0)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentSlide === 0
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>Input Slots</span>
              </button>
              <button
                onClick={() => setCurrentSlide(1)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentSlide === 1
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>Node Controls</span>
              </button>
              <button
                onClick={() => setCurrentSlide(2)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentSlide === 2
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                <ArrowUpFromLine className="w-4 h-4" />
                <span>Output Slots</span>
              </button>
            </div>

            <Button
              onClick={() => setCurrentSlide(Math.min(2, currentSlide + 1))}
              disabled={currentSlide === 2}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Content Area - Either Settings or Parameters */}
      <div className="flex-1 relative overflow-hidden">
        {/* NodeSettingsEditor - Shown when settings button is clicked */}
        <NodeSettingsEditor
          selectedNode={selectedNode}
          getNodeMode={getNodeMode}
          onNodeModeChange={onNodeModeChange}
          onNodeColorChange={onNodeColorChange}
          onNodeSizeChange={onNodeSizeChange}
          onNodeCollapseChange={onNodeCollapseChange}
          isVisible={isSettingsOpen}
        />

        {/* NodeParameterEditor - Shown when settings are closed */}
        <div
          className={`absolute inset-0 overflow-y-auto p-4 ${isSettingsOpen ? 'hidden' : ''}`}
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
            <NodeParameterEditor
              selectedNode={selectedNode}
              metadata={metadata || null}
              metadataLoading={metadataLoading}
              metadataError={metadataError}
              editingParam={editingParam}
              editingValue={editingValue}
              uploadState={uploadState}
              nodeBounds={nodeBounds}
              getWidgetValue={getWidgetValue}
              getNodeMode={getNodeMode}
              modifiedWidgetValues={modifiedWidgetValues}
              onStartEditing={onStartEditing}
              onCancelEditing={onCancelEditing}
              onSaveEditing={onSaveEditing}
              onEditingValueChange={onEditingValueChange}
              onControlAfterGenerateChange={onControlAfterGenerateChange}
              onNodeModeChange={onNodeModeChange}
              onFilePreview={onFilePreview}
              onFileUpload={onFileUpload}
              onFileUploadDirect={onFileUploadDirect}
              onNavigateToNode={onNavigateToNode}
              onSelectNode={onSelectNode}
              setWidgetValue={setWidgetValue}
              // Single execute props
              isOutputNode={isOutputNode}
              canSingleExecute={canSingleExecute}
              isSingleExecuting={isSingleExecuting}
              onSingleExecute={onSingleExecute}
              // Carousel props
              currentSlide={currentSlide}
              // Link disconnection props
              onDisconnectInput={onDisconnectInput}
              onDisconnectOutput={onDisconnectOutput}
            />
          </div>
        </div>
      </div>

      {/* Confirm Delete Dialog */}
      {onNodeDelete && (
        <ConfirmDialog
          isOpen={isDeleteDialogOpen}
          title="Delete Node"
          message={`Are you sure you want to delete node ${nodeId} (${metadata?.displayName || selectedNode.title || selectedNode.type})? All connected links will also be removed.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="destructive"
          onConfirm={() => onNodeDelete(nodeId)}
          onCancel={() => { }}
          onClose={() => setIsDeleteDialogOpen(false)}
        />
      )}
    </motion.div>
  );
};