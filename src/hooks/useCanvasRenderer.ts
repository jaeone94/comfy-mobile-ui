import { useEffect, useMemo, useState } from 'react';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';
import type { IComfyGraphNode } from '@/shared/types/app/base';
import type { ComfyGraphNode } from '@/core/domain';
import { DEFAULT_CANVAS_CONFIG, CanvasConfig } from '@/config/canvasConfig';
import {
  renderGroups,
  renderConnections,
  renderNodes,
  drawGridPattern,
  drawRepositioningGrid,
  drawResizeGrippers,
  getGripperAtPoint,
  clearNodeImageLoadingCache,
  NodeBounds,
  GroupBounds,
  ViewportTransform,
  RenderingOptions
} from '@/shared/utils/rendering/CanvasRendererService';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { useGlobalStore } from '@/ui/store/globalStore';

// Interfaces are now imported from canvasRenderer.ts

interface ExecutionState {
  executingNodeId: string | null;
  errorNodeId: string | null;
  nodeExecutionProgress: { nodeId: string; progress: number } | null;
}

interface LongPressState {
  isActive: boolean;
  showProgress: boolean; // Separate flag for showing progress after 0.3s delay
  startTime: number;
  startX: number;
  startY: number;
  targetNode?: any | null; // WorkflowNode type
  timeoutId?: NodeJS.Timeout | null;
  progressTimeoutId?: NodeJS.Timeout | null; // For the 0.3s delay
  animationId?: number | null;
}

interface UseCanvasRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  workflow: IComfyWorkflow | null;
  viewport: ViewportTransform;
  nodeBounds: Map<number, NodeBounds>;
  groupBounds: GroupBounds[];
  selectedNode: IComfyGraphNode | null;
  modifiedWidgetValues?: Map<number, Record<string, any>>;
  repositionMode?: {
    isActive: boolean;
    selectedNodeId: number | null;
    selectedGroupId: number | null;
    gridSnapEnabled: boolean;
  };
  connectionMode?: {
    isActive: boolean;
    phase: 'SOURCE_SELECTION' | 'TARGET_SELECTION' | 'SLOT_SELECTION';
    sourceNodeId: number | null;
    targetNodeId: number | null;
    compatibleNodeIds: Set<number>;
  };
  missingNodeIds?: Set<number>;
  longPressState?: LongPressState;
  subgraphDefinitions?: Map<string, any>;
}

export const useCanvasRenderer = ({
  canvasRef,
  containerRef,
  workflow,
  viewport,
  nodeBounds,
  groupBounds,
  selectedNode,
  modifiedWidgetValues,
  repositionMode,
  connectionMode,
  missingNodeIds,
  longPressState,
  subgraphDefinitions
}: UseCanvasRendererProps) => {
  // Canvas configuration - use shared config
  const config = useMemo<CanvasConfig>(() => DEFAULT_CANVAS_CONFIG, []);

  // Clear node image loading cache when workflow changes
  useEffect(() => {
    if (workflow) {
      clearNodeImageLoadingCache();
    }
  }, [workflow?.id]); // Only clear when workflow ID changes

  // Internal execution state - subscribed from ComfyUIService
  const [executionState, setExecutionState] = useState<ExecutionState>({
    executingNodeId: null,
    errorNodeId: null,
    nodeExecutionProgress: null
  });

  // Subscribe to execution events from GlobalWebSocketService
  useEffect(() => {
    // 🎯 Check current execution state from persistent buffer (works for navigation & refresh)
    setTimeout(() => {
      const currentState = globalWebSocketService.getCurrentExecutionState();

      console.log(`🎨 [useCanvasRenderer] Current execution state from buffer:`, currentState);

      if (currentState.isExecuting) {
        setExecutionState({
          executingNodeId: currentState.executingNodeId,
          errorNodeId: null,
          nodeExecutionProgress: currentState.nodeExecutionProgress
        });

        console.log(`🎨 [useCanvasRenderer] Applied execution state from persistent buffer:`, {
          executingNodeId: currentState.executingNodeId,
          nodeExecutionProgress: currentState.nodeExecutionProgress
        });
      } else {
        console.log(`🎨 [useCanvasRenderer] No active execution found in buffer`);
      }
    }, 75); // Between ExecutionProgressBar and FloatingControlsPanel
    const handleExecuting = (event: any) => {
      console.log('🎨 [useCanvasRenderer] Raw executing event:', event);
      const { data } = event;

      if (data.node === null) {
        // Execution completed
        console.log('🎨 [useCanvasRenderer] Execution completed - clearing highlights');
        setExecutionState({
          executingNodeId: null,
          errorNodeId: null,
          nodeExecutionProgress: null
        });
      } else if (data.node) {
        // Node execution started
        console.log('🎨 [useCanvasRenderer] Node execution started:', data.node, 'prompt_id:', data.prompt_id || 'not provided');
        setExecutionState(prev => ({
          ...prev,
          executingNodeId: data.node.toString(),
          errorNodeId: null // Clear any previous error
        }));
      }
    };

    const handleProgress = (event: any) => {
      const { data } = event;
      console.log('🎨 [useCanvasRenderer] Progress event:', {
        nodeId: data.node,
        value: data.value,
        max: data.max
      });

      if (data.node && data.value !== undefined && data.max !== undefined) {
        const percentage = Math.round((data.value / data.max) * 100);

        setExecutionState(prev => ({
          ...prev,
          executingNodeId: data.node.toString(),
          nodeExecutionProgress: {
            nodeId: data.node.toString(),
            progress: percentage
          }
        }));
      }
    };

    const handleExecuted = (event: any) => {
      const { data } = event;
      console.log('🎨 [useCanvasRenderer] Node executed:', data);

      setExecutionState(prev => ({
        ...prev,
        executingNodeId: prev.executingNodeId === data.node?.toString() ? null : prev.executingNodeId,
        nodeExecutionProgress: prev.nodeExecutionProgress?.nodeId === data.node?.toString() ? null : prev.nodeExecutionProgress
      }));
    };

    const handleExecutionSuccess = (event: any) => {
      console.log('🎨 [useCanvasRenderer] Execution success - clearing all highlights');
      setExecutionState({
        executingNodeId: null,
        errorNodeId: null,
        nodeExecutionProgress: null
      });
    };

    const handleExecutionError = (event: any) => {
      console.log('🎨 [useCanvasRenderer] Execution error');
      setExecutionState(prev => ({
        ...prev,
        executingNodeId: null,
        errorNodeId: prev.executingNodeId, // Mark current executing node as error
        nodeExecutionProgress: null
      }));
    };

    // Handle progress_state messages to match other components
    const handleProgressState = (event: any) => {
      console.log('🎨 [useCanvasRenderer] Progress state event:', event);
      const { data } = event;

      if (data.nodes) {
        const nodes = data.nodes;
        let currentRunningNodeId: string | null = null;
        let currentNodeProgress: { nodeId: string; progress: number } | null = null;

        // Find the first running node for display
        Object.keys(nodes).forEach(nodeId => {
          const nodeData = nodes[nodeId];
          if (nodeData.state === 'running' && !currentRunningNodeId) {
            currentRunningNodeId = nodeId;
            const progress = nodeData.max > 0 ? Math.round((nodeData.value / nodeData.max) * 100) : 0;
            currentNodeProgress = {
              nodeId,
              progress
            };
          }
        });

        // Update execution state for canvas highlighting
        setExecutionState(prev => ({
          ...prev,
          executingNodeId: currentRunningNodeId,
          nodeExecutionProgress: currentNodeProgress,
          errorNodeId: currentRunningNodeId ? null : prev.errorNodeId // Clear error if we have a running node
        }));

        console.log('🎨 [useCanvasRenderer] Updated execution state from progress_state:', {
          currentRunningNodeId,
          currentNodeProgress
        });
      }
    };

    // Subscribe to raw ComfyUI events from GlobalWebSocketService
    const listenerIds = [
      globalWebSocketService.on('executing', handleExecuting),
      globalWebSocketService.on('progress', handleProgress),
      globalWebSocketService.on('executed', handleExecuted),
      globalWebSocketService.on('execution_success', handleExecutionSuccess),
      globalWebSocketService.on('execution_error', handleExecutionError),
      globalWebSocketService.on('progress_state', handleProgressState)
    ];

    return () => {
      // Cleanup event listeners using IDs
      globalWebSocketService.offById('executing', listenerIds[0]);
      globalWebSocketService.offById('progress', listenerIds[1]);
      globalWebSocketService.offById('executed', listenerIds[2]);
      globalWebSocketService.offById('execution_success', listenerIds[3]);
      globalWebSocketService.offById('execution_error', listenerIds[4]);
      globalWebSocketService.offById('progress_state', listenerIds[5]);
    };
  }, []);

  // Main rendering effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const graphData = workflow?.graph;
    if (!canvas || !ctx || !graphData) return;

    // Set canvas size
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    const draw = () => {
      // Clear canvas - use darker background color in repositioning mode
      const backgroundColor = repositionMode?.isActive
        ? '#1e293b' // Darker slate background for repositioning mode
        : config.backgroundColor;

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid pattern (before viewport transform)
      // Show enhanced grid when repositioning mode is active and grid snap is enabled
      if (repositionMode?.isActive && repositionMode?.gridSnapEnabled) {
        drawRepositioningGrid(ctx, canvas.width, canvas.height, viewport);
      } else {
        drawGridPattern(ctx, canvas.width, canvas.height, viewport);
      }

      // Apply viewport transform
      ctx.save();
      ctx.translate(viewport.x, viewport.y);
      ctx.scale(viewport.scale, viewport.scale);

      // Draw groups (background layer) - show text in detail view
      if (groupBounds && groupBounds.length > 0) {
        renderGroups(ctx, groupBounds, config, true, viewport.scale, repositionMode || null);
      }

      // Draw connections (middle layer)
      const links = Object.values(graphData._links || {});

      if (links.length > 0) {
        renderConnections(ctx, links, nodeBounds, config);
      }

      // Draw nodes (foreground layer) - use shared rendering
      const nodes = graphData._nodes || [];
      if (nodes.length > 0) {
        // console.log('🔷 Rendering nodes:', {
        //   nodeCount: workflow.parsedData.nodes.length,
        //   nodeBoundsSize: nodeBounds.size,
        //   firstNode: workflow.parsedData.nodes[0]
        // });

        // Calculate modified node IDs for visual indication
        const modifiedNodeIds = new Set<number>();
        if (modifiedWidgetValues) {
          modifiedWidgetValues.forEach((_, nodeId) => {
            modifiedNodeIds.add(nodeId);
          });
        }

        const renderingOptions: RenderingOptions = {
          selectedNode,
          executingNodeId: executionState.executingNodeId,
          errorNodeId: executionState.errorNodeId,
          nodeExecutionProgress: executionState.nodeExecutionProgress,
          showText: true, // Show text in detail view
          viewportScale: viewport.scale, // Pass viewport scale for responsive font sizing
          modifiedNodeIds, // Add modified nodes for green outline
          modifiedWidgetValues, // Add modified widget values for accurate display
          repositionMode: repositionMode || null, // Add repositioning mode info
          connectionMode: connectionMode || null, // Add connection mode info for highlighting
          missingNodeIds: missingNodeIds || new Set(), // Add missing node IDs for red outline
          longPressState: longPressState || null, // Add long press state for visual feedback
          visibleRect: {
            minX: -viewport.x / viewport.scale,
            minY: -viewport.y / viewport.scale,
            maxX: (canvas.width - viewport.x) / viewport.scale,
            maxY: (canvas.height - viewport.y) / viewport.scale
          },
          subgraphDefinitions
        };

        renderNodes(ctx, nodes as ComfyGraphNode[], nodeBounds, config, renderingOptions);
      }

      ctx.restore();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Add listener for image loaded events to trigger redraw
    const handleImageLoaded = () => {
      draw();
    };
    canvas.addEventListener('imageLoaded', handleImageLoaded);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('imageLoaded', handleImageLoaded);
    };
  }, [workflow, viewport, nodeBounds, groupBounds, selectedNode, config, executionState, modifiedWidgetValues, repositionMode, missingNodeIds]);

  return {
    config,
  };
};