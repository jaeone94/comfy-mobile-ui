/**
 * WorkflowEditor - Main workflow visualization and editing interface
 * 
 * Uses ComfyGraph for data operations with canvas rendering
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IComfyJson } from '@/shared/types/app/IComfyJson';
import type { NodeWidgetModifications } from '@/shared/types/widgets/widgetModifications';

// Core Services
import { WorkflowGraphService, serializeGraph, loadWorkflowToGraph, addNodeToWorkflow, removeNodeWithLinks, removeGroup, createInputSlots, createOutputSlots } from '@/core/services/WorkflowGraphService';
import { ConnectionService } from '@/services/ConnectionService';
import { detectMissingWorkflowNodes, MissingWorkflowNode, resolveMissingNodePackages } from '@/services/MissingNodesService';
import { detectMissingModels, formatMissingModelsMessage, getUniqueMissingModels } from '@/services/MissingModelsService';
import { ComfyGraph } from '@/core/domain/ComfyGraph';

// Infrastructure Services
import { getWorkflow, updateWorkflow, loadAllWorkflows, saveAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { ComfyNodeMetadataService } from '@/infrastructure/api/ComfyNodeMetadataService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { convertGraphToAPI } from '@/infrastructure/api/ComfyApiFunctions';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { NodeClipboardService } from '@/services/NodeClipboardService';

// Utilities
import { PromptTracker } from '@/utils/promptTracker';
import { setControlAfterGenerate } from '@/shared/utils/workflowMetadata';
import { wrapGraphNodesForLogging } from '@/utils/GraphChangeLogger';
// import { WorkflowManager } from '@/services/workflowManager'; // Missing, will comment out

// Components
import { WorkflowHeader } from '@/components/workflow/WorkflowHeader';
import { WorkflowCanvas } from '@/components/canvas/WorkflowCanvas';
// import { NodeInspector } from '@/components/canvas/NodeInspector'; // Replaced
import { NodeDetailModal } from '@/components/canvas/NodeDetailModal';
import WorkflowSnapshots from '@/components/workflow/WorkflowSnapshots';
import { QuickActionPanel } from '@/components/controls/QuickActionPanel';
import { FloatingControlsPanel } from '@/components/controls/FloatingControlsPanel';
import { RepositionActionBar } from '@/components/controls/RepositionActionBar';
import { CircularMenu, CircularMenuRef } from '@/components/canvas/CircularMenu';
import { ConnectionBar } from '@/components/canvas/ConnectionBar';
import { ConnectionModal } from '@/components/canvas/ConnectionModal';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { GroupModeModal } from '@/components/ui/GroupModeModal';
import { JsonViewerModal } from '@/components/modals/JsonViewerModal';
import { NodeAddModal } from '@/components/modals/NodeAddModal';
import { SimpleConfirmDialog } from '@/components/ui/SimpleConfirmDialog';
import MissingNodeInstallerModal from '@/components/modals/MissingNodeInstallerModal';
import MissingModelDetectorModal from '@/components/modals/MissingModelDetectorModal';

// Hooks
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import { useCanvasRenderer } from '@/hooks/useCanvasRenderer';
import { useWidgetValueEditor } from '@/hooks/useWidgetValueEditor';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useMobileOptimizations } from '@/hooks/useMobileOptimizations';
import { useWorkflowStorage } from '@/hooks/useWorkflowStorage';
import { useConnectionMode } from '@/hooks/useConnectionMode';

// Stores
import { useConnectionStore } from '@/ui/store/connectionStore';
import { useGlobalStore } from '@/ui/store/globalStore';

// Types
import type { IComfyGraphNode, IComfyWorkflow, IComfyWidget } from '@/shared/types/app/base';
import { NodeMode } from '@/shared/types/app/base';
import { INodeWithMetadata } from '@/shared/types/comfy/IComfyObjectInfo';
import { IComfyGraphGroup } from '@/shared/types/app/base';

// Utils
import { SeedProcessingUtils, autoChangeSeed } from '@/shared/utils/seedProcessing';
import { calculateAllBounds, ViewportTransform, NodeBounds, GroupBounds, clearNodeImageCache } from '@/shared/utils/rendering/CanvasRendererService';
import { mapGroupsWithNodes, Group } from '@/utils/GroupNodeMapper';

// Constants
import { VIRTUAL_NODES } from '@/shared/constants/virtualNodes';

const WorkflowEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const circularMenuRef = useRef<CircularMenuRef>(null);

  // ComfyGraph instance  
  const comfyGraphRef = useRef<any | null>(null);

  // Global store (for current workflow tracking)
  const { setWorkflow: setGlobalWorkflow } = useGlobalStore();

  // Workflow state
  const [workflow, setWorkflow] = useState<IComfyWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Canvas state
  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, scale: 1.0 });
  const [selectedNode, setSelectedNode] = useState<IComfyGraphNode | null>(null);
  const [nodeBounds, setNodeBounds] = useState<Map<number, NodeBounds>>(new Map());
  const [groupBounds, setGroupBounds] = useState<GroupBounds[]>([]);
  const [canvasUpdateTrigger, setCanvasUpdateTrigger] = useState(0); // Trigger for canvas-only updates

  // Auto-fit tracking
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  // Metadata
  const [nodeMetadata, setNodeMetadata] = useState<Map<number, INodeWithMetadata>>(new Map());
  const [metadataLoading, setMetadataLoading] = useState<boolean>(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [objectInfo, setObjectInfo] = useState<any>(null);
  const [missingNodeIds, setMissingNodeIds] = useState<Set<number>>(new Set());
  const [missingWorkflowNodes, setMissingWorkflowNodes] = useState<MissingWorkflowNode[]>([]);
  const [isMissingNodeModalOpen, setIsMissingNodeModalOpen] = useState(false);
  const [installablePackageCount, setInstallablePackageCount] = useState<number>(0);
  const [missingModels, setMissingModels] = useState<ReturnType<typeof detectMissingModels>>([]);
  const [isMissingModelModalOpen, setIsMissingModelModalOpen] = useState(false);

  // UI state
  const [isNodePanelVisible, setIsNodePanelVisible] = useState<boolean>(false);
  const [isGroupModeModalOpen, setIsGroupModeModalOpen] = useState<boolean>(false);
  const [isWorkflowSnapshotsOpen, setIsWorkflowSnapshotsOpen] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [isJsonViewerOpen, setIsJsonViewerOpen] = useState<boolean>(false);
  const [jsonViewerData, setJsonViewerData] = useState<{ title: string; data: any } | null>(null);

  // Queue refresh trigger
  const [queueRefreshTrigger, setQueueRefreshTrigger] = useState<number>(0);
  const [uploadState, setUploadState] = useState<any>({ isUploading: false });
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [nodeIdToDelete, setNodeIdToDelete] = useState<number | null>(null);


  // Circular Menu State
  const [circularMenuState, setCircularMenuState] = useState<{
    isOpen: boolean;
    center: { x: number; y: number };
    pointer: { x: number; y: number } | null;
    initialPointer: { x: number; y: number } | null;
    context: 'CANVAS' | 'NODE' | 'NODE_COLOR' | 'NODE_MODE';
    nodeId: number | null;
  }>({
    isOpen: false,
    center: { x: 0, y: 0 },
    pointer: null,
    initialPointer: null,
    context: 'CANVAS',
    nodeId: null,
  });

  // Connection state
  const { url: serverUrl, isConnected } = useConnectionStore();

  // Get groups with mapped nodes
  const workflowGroups = useMemo((): Group[] => {
    if (!workflow?.graph?._groups || !workflow?.graph?._nodes) {
      return [];
    }
    return mapGroupsWithNodes(workflow.graph._groups, workflow.graph._nodes);
  }, [workflow?.graph?._groups, workflow?.graph?._nodes]);

  // Get searchable nodes for advanced search
  const searchableNodes = useMemo(() => {
    if (!workflow?.graph?._nodes) {
      return [];
    }
    return workflow.graph._nodes.map(node => ({
      id: node.id,
      type: node.type,
      title: node.title
    }));
  }, [workflow?.graph?._nodes]);

  // #region Hooks

  // Workflow storage hook
  const workflowStorage = useWorkflowStorage();

  // Current prompt tracking
  const currentPromptIdRef = useRef<string | null>(null);

  // Widget value editor hook
  const widgetEditor = useWidgetValueEditor();

  // Handle create connection - add new link between nodes using ConnectionService
  const handleCreateConnection = useCallback(async (
    sourceNodeId: number,
    targetNodeId: number,
    sourceSlot: number,
    targetSlot: number
  ) => {
    if (!id || !workflow) {
      return;
    }

    try {
      // Get current workflow_json and graph
      const currentWorkflowJson = workflow.workflow_json;
      const currentGraph = workflow.graph;

      if (!currentWorkflowJson || !currentGraph) {
        return;
      }

      // Use ConnectionService to create the connection
      const { updatedWorkflowJson, updatedGraph, newLinkId } = ConnectionService.createConnection(
        currentWorkflowJson,
        currentGraph,
        sourceNodeId,
        targetNodeId,
        sourceSlot,
        targetSlot
      );

      // Save the updated workflow
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        graph: updatedGraph,
        modifiedAt: new Date()
      };

      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Reload the workflow using the same logic as initial app entry
      await loadWorkflow();

    } catch (error) {
      console.error('Error creating connection:', error);
    }
  }, [id, workflow]);

  // Connection mode hook
  const connectionMode = useConnectionMode({
    workflow,
    onCreateConnection: handleCreateConnection
  });

  // Canvas interaction hook
  const canvasInteraction = useCanvasInteraction({
    canvasRef,
    viewport,
    setViewport,
    selectedNode,
    setSelectedNode: (node: IComfyGraphNode | null) => {
      // Check if we're in connection mode
      if (connectionMode.connectionMode.isActive && node) {
        // Handle node selection for connection mode
        connectionMode.handleNodeSelection(node as any);
      } else {
        // Normal node selection for inspector
        setSelectedNode(node);
        if (node) {
          setIsNodePanelVisible(true);
        } else {
          setIsNodePanelVisible(false);
        }
      }
    },
    nodeBounds,
    setNodeBounds,
    groupBounds,
    setGroupBounds,
    workflowGroups,
    workflow, // Pass workflow data for real-time group-node mapping
    workflowId: id,
    connectionMode: {
      isActive: connectionMode.connectionMode.isActive,
      phase: connectionMode.connectionMode.phase,
      sourceNodeId: connectionMode.connectionMode.sourceNode?.id || null,
      targetNodeId: connectionMode.connectionMode.targetNode?.id || null,
      compatibleNodeIds: connectionMode.connectionMode.compatibleNodeIds
    },
    // Long press callback - open circular menu
    onNodeLongPress: (node: any, position: { x: number; y: number }) => {
      setCircularMenuState({
        isOpen: true,
        center: position,
        pointer: position,
        initialPointer: position,
        context: 'NODE',
        nodeId: typeof node.id === 'string' ? parseInt(node.id) : node.id
      });
    },
    onCanvasLongPress: (worldPos: { x: number; y: number }, screenPos?: { x: number; y: number }) => {
      if (screenPos) {
        setCircularMenuState({
          isOpen: true,
          center: screenPos,
          pointer: screenPos,
          initialPointer: screenPos,
          context: 'CANVAS',
          nodeId: null
        });
      }
    },
    // Menu interaction callbacks
    isMenuOpen: circularMenuState.isOpen,
    onMenuDrag: (position: { x: number; y: number }) => {
      setCircularMenuState(prev => ({ ...prev, pointer: position }));
    },
    onMenuRelease: () => {
      circularMenuRef.current?.handleRelease();
    }
  });

  // Canvas renderer hook
  useCanvasRenderer({
    canvasRef,
    containerRef,
    workflow,
    viewport,
    nodeBounds,
    groupBounds,
    selectedNode,
    modifiedWidgetValues: widgetEditor.modifiedWidgetValues,
    repositionMode: {
      isActive: canvasInteraction.repositionMode.isActive,
      selectedNodeId: canvasInteraction.repositionMode.selectedNodeId,
      selectedGroupId: canvasInteraction.repositionMode.selectedGroupId,
      gridSnapEnabled: canvasInteraction.repositionMode.gridSnapEnabled
    },
    connectionMode: {
      isActive: connectionMode.connectionMode.isActive,
      phase: connectionMode.connectionMode.phase,
      sourceNodeId: connectionMode.connectionMode.sourceNode?.id || null,
      targetNodeId: connectionMode.connectionMode.targetNode?.id || null,
      compatibleNodeIds: connectionMode.connectionMode.compatibleNodeIds
    },
    missingNodeIds,
    longPressState: canvasInteraction.longPressState
  });

  // #endregion Hooks

  // #region useEffects
  // Trigger queue refresh when workflow ID changes (navigation between workflows)
  useEffect(() => {
    if (id) {
      setQueueRefreshTrigger(prev => prev + 1);
    }
  }, [id]);

  // Load workflow on mount
  useEffect(() => {
    loadWorkflow();
  }, [id]);

  // #endregion useEffects

  // #region workflow storage actions
  // Load workflow from storage
  const loadWorkflow = async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get workflow from storage
      const storedWorkflow = await getWorkflow(id);
      if (!storedWorkflow) {
        throw new Error(t('workflow.loadFailed'));
      }

      const workflowData = (storedWorkflow as any).workflow_json;

      if (!workflowData) {
        throw new Error(t('workflow.noJson'));
      }

      // Fetch object info for accurate widget initialization
      const fetchedObjectInfo = await ComfyNodeMetadataService.fetchObjectInfo();
      setObjectInfo(fetchedObjectInfo);
      const graph = await WorkflowGraphService.createGraphFromWorkflow(workflowData, fetchedObjectInfo);


      if (!graph) {
        throw new Error(t('workflow.loadFailed'));
      }

      // ?뵩 GraphChangeLogger: Wrap all nodes for comprehensive value change tracking
      wrapGraphNodesForLogging(graph);

      // Store ComfyGraph instance for serialize() method usage
      comfyGraphRef.current = graph;

      // Use nodes directly from ComfyGraphProcessor - no conversion
      const nodes = graph._nodes || [];

      // Check for missing models in node widgets (COMBO widgets)
      const detectedMissingModels = detectMissingModels(nodes);
      setMissingModels(detectedMissingModels);

      if (detectedMissingModels.length > 0) {
        const uniqueMissingModels = getUniqueMissingModels(detectedMissingModels);
        const formattedMessage = formatMissingModelsMessage(detectedMissingModels);

        toast.error(`Missing models detected`, {
          description: `${t('workflow.missingModelsDesc')}\n${formattedMessage}`,
          duration: 10000,
        });

        console.warn('Missing models detected:', detectedMissingModels);
      } else {
        setIsMissingModelModalOpen(false);
      }

      // ??Check for missing node types and show notification (excluding virtual nodes)
      const detectedMissingNodes = detectMissingWorkflowNodes(workflowData as IComfyJson, fetchedObjectInfo);
      setMissingWorkflowNodes(detectedMissingNodes);

      const missingNodeIdsSet = new Set<number>(detectedMissingNodes.map((node) => node.id));
      setMissingNodeIds(missingNodeIdsSet);

      if (detectedMissingNodes.length > 0) {
        const nodeTypeList = Array.from(new Set(detectedMissingNodes.map((node) => node.type))).join(', ');
        toast.error(`Missing node types detected`, {
          description: `${t('workflow.missingNodesDesc', { nodeTypeList })}`,
          duration: 8000,
        });
      } else {
        setIsMissingNodeModalOpen(false);
      }

      if (detectedMissingNodes.length > 0) {
        try {
          const resolvedPackages = await resolveMissingNodePackages(detectedMissingNodes);
          const installableCount = resolvedPackages.filter((pkg) => pkg.isInstallable).length;
          setInstallablePackageCount(installableCount);
        } catch (packageLookupError) {
          console.error('Failed to resolve missing node packages for install badge:', packageLookupError);
          setInstallablePackageCount(0);
        }
      } else {
        setInstallablePackageCount(0);
      }
      // Mock uses groups, real LiteGraph might use _groups
      const groups = (graph as any).groups || graph._groups || [];

      // Convert LLink objects to array format for canvas renderer
      const links: any[] = [];
      if (graph._links) {
        for (const linkId in graph._links) {
          const link = graph._links[linkId];
          // Convert LLink to array format: [id, origin_id, origin_slot, target_id, target_slot, type]
          links.push([
            link.id,
            link.origin_id,
            link.origin_slot,
            link.target_id,
            link.target_slot,
            link.type || null
          ] as any);
        }
      }

      // Use ComfyGraphNode directly - canvas renderer supports pos: [x, y], size: [w, h] format
      const workflow: IComfyWorkflow = {
        ...storedWorkflow,
        workflow_json: storedWorkflow.workflow_json,
        graph: {
          _nodes: nodes as any,
          _links: links.reduce((acc, link) => {
            // link is array: [id, origin_id, origin_slot, target_id, target_slot, type]
            const linkId = link[0]; // first element is id
            acc[linkId] = {
              id: link[0],
              origin_id: link[1],
              origin_slot: link[2],
              target_id: link[3],
              target_slot: link[4],
              type: link[5]
            };
            return acc;
          }, {} as Record<number, any>),
          _groups: groups,
          last_node_id: storedWorkflow.workflow_json?.last_node_id || 0,
          last_link_id: storedWorkflow.workflow_json?.last_link_id || 0
        } as any,
        // Backward compatibility
        parsedData: {
          _nodes: nodes as any,
          _links: links.reduce((acc, link) => {
            // link is array: [id, origin_id, origin_slot, target_id, target_slot, type]
            const linkId = link[0]; // first element is id
            acc[linkId] = {
              id: link[0],
              origin_id: link[1],
              origin_slot: link[2],
              target_id: link[3],
              target_slot: link[4],
              type: link[5]
            };
            return acc;
          }, {} as Record<number, any>),
          _groups: groups,
          last_node_id: 0,
          last_link_id: 0
        } as any,
        nodeCount: nodes.length
      };

      setWorkflow(workflow);

      // Update global store with current workflow for message filtering
      setGlobalWorkflow(workflow);

      // Create NodeBounds from ComfyGraphNode structure
      const calculatedNodeBounds = new Map<number, NodeBounds>();

      nodes.forEach((node: any) => {
        // ComfyGraphNode: pos: [x, y], size: [w, h]
        const x = node.pos?.[0] || 0;
        const y = node.pos?.[1] || 0;
        let width = node.size?.[0] || 200;
        let height = node.size?.[1] || 100;

        // Check if node is collapsed and adjust size
        const isCollapsed = node.flags?.collapsed === true;
        if (isCollapsed) {
          width = 80;  // Fixed smaller width for collapsed nodes
          height = 30; // Fixed smaller height for collapsed nodes
        }

        calculatedNodeBounds.set(node.id, {
          x,
          y,
          width,
          height,
          node: node as any
        });
      });

      // Create group bounds using existing convertLiteGraphGroups
      const calculatedGroupBounds = convertLiteGraphGroups(groups);

      setNodeBounds(calculatedNodeBounds);
      setGroupBounds(calculatedGroupBounds);

      // Load metadata if connected
      if (isConnected) {
        loadNodeMetadata(nodes);
      }

      // Check for active execution and emit synthetic event to trigger component activation
      try {
        const isCurrentlyExecuting = globalWebSocketService.getIsProcessing();
        const currentPromptId = globalWebSocketService.getCurrentPromptId();

        if (isCurrentlyExecuting && currentPromptId) {
          // Check if the current prompt belongs to this workflow using PromptTracker
          const runningPromptForThisWorkflow = PromptTracker.getRunningPromptForWorkflow(id);

          if (runningPromptForThisWorkflow && runningPromptForThisWorkflow.promptId === currentPromptId) {

            // Add small delay to ensure all components are mounted and their event listeners are set up
            setTimeout(() => {
              // Emit synthetic execution_started event to activate components
              globalWebSocketService.emit('execution_started', {
                type: 'execution_started',
                promptId: currentPromptId,
                timestamp: Date.now(),
                synthetic: true, // Mark as synthetic for debugging
                workflowId: id
              });
            }, 100); // 100ms delay to ensure components are ready
          }
        }
      } catch (error) {
        console.warn('Failed to check execution state for synthetic event:', error);
      }

    } catch (error) {
      console.error('Failed to load workflow:', error);
      setError(error instanceof Error ? error.message : 'Failed to load workflow');
      toast.error(t('workflow.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Load node metadata
  const loadNodeMetadata = async (nodes: IComfyGraphNode[]) => {
    if (!nodes || nodes.length === 0) return;

    setMetadataLoading(true);
    setMetadataError(null);

    try {
      const metadataMap = new Map<number, INodeWithMetadata>();

      // Fetch object info once for all nodes
      const fetchedObjectInfo = await ComfyNodeMetadataService.fetchObjectInfo();
      setObjectInfo(fetchedObjectInfo);

      for (const node of nodes) {
        const metadata = fetchedObjectInfo[node.type] || null;
        if (metadata) {
          // Create proper metadata structure for the node
          const nodeWithMetadata: INodeWithMetadata = {
            nodeId: Number(node.id),
            nodeType: node.type,
            displayName: node.title || node.type,
            category: metadata.category || 'Unknown',
            inputParameters: [],
            widgetParameters: [], // Will be filled from widget initialization
            parameters: [],
            outputs: []
          };

          // Extract widgets from node if they exist (check both widgets and _widgets)
          const allWidgets = [
            ...(((node as any).widgets) || []),
            ...(((node as any)._widgets) || [])
          ];

          if (allWidgets.length > 0) {
            nodeWithMetadata.widgetParameters = allWidgets.map((widget: any) => ({
              name: widget.name,
              type: widget.type || 'STRING',
              config: widget.options || {},
              required: false,
              value: widget.value
            }));
          }

          metadataMap.set(Number(node.id), nodeWithMetadata);
        }
      }

      setNodeMetadata(metadataMap);
    } catch (error) {
      console.error('Failed to load node metadata:', error);
      setMetadataError(error instanceof Error ? error.message : 'Failed to load metadata');
    } finally {
      setMetadataLoading(false);
    }
  };

  // Apply changes to workflow
  const handleSaveChanges = useCallback(async () => {
    if (!workflow) {
      console.error('No workflow to save');
      return;
    }

    setIsSaving(true);
    setSaveSucceeded(false);

    try {

      // Use ComfyGraph instance (serialize() method available)
      const currentGraph = comfyGraphRef.current;
      if (!currentGraph) {
        throw new Error('No ComfyGraph instance available');
      }

      // Apply changes to Graph
      const modifiedValues = widgetEditor.modifiedWidgetValues;

      // createModifiedGraph returns a copy, so we need to apply changes directly to the original Graph
      if (modifiedValues.size > 0) {

        modifiedValues.forEach((nodeModifications, nodeId) => {
          const graphNode = currentGraph._nodes?.find((n: any) => Number(n.id) === nodeId);
          if (graphNode) {
            Object.entries(nodeModifications).forEach(([paramName, newValue]) => {
              // Handle special _node_mode parameter
              if (paramName === '_node_mode') {
                const modeName = newValue === 0 ? 'ALWAYS' : newValue === 2 ? 'MUTE' : newValue === 4 ? 'BYPASS' : `UNKNOWN(${newValue})`;
                console.log(`Setting node ${nodeId} mode to ${newValue} (${modeName})`);
                graphNode.mode = newValue;
                return; // Skip widget processing for node mode
              }

              console.log(`Node ${nodeId} current structure:`, {
                hasWidgets: !!graphNode.widgets,
                widgetNames: graphNode.widgets?.map((w: any) => w.name),
                has_widgets: !!graphNode._widgets,
                hasWidgets_values: !!graphNode.widgets_values,
                widgets_values_type: Array.isArray(graphNode.widgets_values) ? 'array' : typeof graphNode.widgets_values,
                widgets_values_content: graphNode.widgets_values
              });

              let modified = false;

              // Method 1: Update widgets array (for runtime display)
              if (graphNode.widgets) {
                const widget = graphNode.widgets.find((w: any) => w.name === paramName);
                if (widget) {
                  const oldValue = widget.value;
                  widget.value = newValue;
                  modified = true;
                }
              }

              // Method 2: Update _widgets array (alternative location)
              if (graphNode._widgets) {
                const _widget = graphNode._widgets.find((w: any) => w.name === paramName);
                if (_widget) {
                  const oldValue = _widget.value;
                  _widget.value = newValue;
                  modified = true;
                }
              }

              // Method 3: Update widgets_values object (discovered structure)
              if (graphNode.widgets_values && typeof graphNode.widgets_values === 'object' && !Array.isArray(graphNode.widgets_values)) {
                if (paramName in graphNode.widgets_values) {
                  const oldValue = graphNode.widgets_values[paramName];
                  graphNode.widgets_values[paramName] = newValue;
                  modified = true;
                }
              }

              // Method 4: Update widgets_values array (traditional structure)
              if (graphNode.widgets_values && Array.isArray(graphNode.widgets_values)) {
                const widgetIndex = graphNode.widgets?.findIndex((w: any) => w.name === paramName);
                if (widgetIndex !== -1 && widgetIndex < graphNode.widgets_values.length) {
                  const oldValue = graphNode.widgets_values[widgetIndex];
                  graphNode.widgets_values[widgetIndex] = newValue;
                  modified = true;
                }
              }

              if (!modified) {
                console.warn(`Could not update widget "${paramName}" in any location for node ${nodeId}`);
              }
            });
          } else {
            console.warn(`Graph node ${nodeId} not found`);
          }
        });

      }

      // serialize
      const serializedData = currentGraph.serialize();

      // Update workflow_json
      const updatedWorkflowJson = serializedData;

      // Update entire workflow object
      const updatedWorkflow: IComfyWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      // Save to IndexedDB
      try {
        await updateWorkflow(updatedWorkflow);
      } catch (error) {
        console.error('Failed to save workflow:', error);
        setIsSaving(false);
        return;
      }

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Clear modifications
      widgetEditor.clearModifications();

      // Re-detect missing models after save - same as initial load
      if (comfyGraphRef.current) {
        // Use _nodes like in initial load
        const nodes = comfyGraphRef.current._nodes || [];
        const detectedMissingModels = detectMissingModels(nodes);
        setMissingModels(detectedMissingModels);
      }

      // Success animation
      setIsSaving(false);
      setSaveSucceeded(true);

      // Reset success state after animation completes
      setTimeout(() => {
        setSaveSucceeded(false);
      }, 1500); // Reset 0.5s after WorkflowHeader hides the checkmark

    } catch (error) {
      console.error('Failed to save workflow:', error);
      setIsSaving(false);
    }
  }, [workflow, widgetEditor]);
  // #endregion workflow storage actions

  // #region prompt actions
  // Execute workflow using our completed Graph to API conversion
  const handleExecute = async () => {
    if (!comfyGraphRef.current || !isConnected || !workflow) {
      toast.error(t('workflow.submitFailed'));
      return;
    }

    try {
      setIsExecuting(true);


      // Step 1: Get connection info and modified values
      const { url: serverUrl } = useConnectionStore.getState();
      const modifiedValues = widgetEditor.modifiedWidgetValues;

      try {
        const seedChanges = await autoChangeSeed(workflow, nodeMetadata, {
          getWidgetValue: (nodeId: number, paramName: string, defaultValue: any) => {
            const value = widgetEditor.getWidgetValue(nodeId, paramName, defaultValue);
            return value;
          },
          setWidgetValue: (nodeId: number, paramName: string, value: any) => {
            widgetEditor.setWidgetValue(nodeId, paramName, value);
          }
        });

        if (seedChanges.length > 0) {
          seedChanges.forEach(change => {
          });

          // Verify changes are in widget editor state
        } else {
        }
      } catch (error) {
        console.error('Error during seed processing:', error);
        // Continue execution even if seed processing fails
      }

      // Step 3: Create modified graph with current changes (including new seed values)
      const originalGraph = comfyGraphRef.current;
      const tempGraph = createModifiedGraph(originalGraph, widgetEditor.modifiedWidgetValues);

      // Step 4: Convert modified graph to API format using our completed function      
      const { apiWorkflow, nodeCount } = convertGraphToAPI(tempGraph);

      // Step 5: Submit to server with workflow tracking information
      const promptId = await ComfyUIService.executeWorkflow(apiWorkflow, {
        workflowId: id, // Use the workflow ID from URL params
        workflowName: workflow?.name || t('workflow.newWorkflowName')
      });

      currentPromptIdRef.current = promptId;
    } catch (error) {
      console.error('Workflow execution failed:', error);
      toast.error(t('workflow.submitFailed'));
    } finally {
      setIsExecuting(false);
    }
  };

  // Create modified graph with current changes (including new seed values)
  const createModifiedGraph = useCallback((originalGraph: any, modifications: Map<number, Record<string, any>>) => {

    // 1. Graph runtime copy (object structure preserved without serialization)
    const modifiedGraph = {
      _nodes: originalGraph._nodes.map((node: any) => ({
        ...node,
        // widgets array copy (runtime object preservation)
        widgets: node.widgets ? [...node.widgets] : undefined,
        _widgets: node._widgets ? [...node._widgets] : undefined,
        // widgets_values array copy
        widgets_values: Array.isArray(node.widgets_values)
          ? [...node.widgets_values]
          : node.widgets_values ? { ...node.widgets_values } : undefined
      })),
      _links: { ...originalGraph._links },
      _groups: originalGraph._groups ? [...originalGraph._groups] : [],
      last_node_id: originalGraph.last_node_id || 0,
      last_link_id: originalGraph.last_link_id || 0
    };

    // 2. Apply modifications
    if (modifications.size > 0) {

      modifications.forEach((nodeModifications, nodeId) => {
        const graphNode = modifiedGraph._nodes?.find((n: any) => Number(n.id) === nodeId);
        if (graphNode) {
          Object.entries(nodeModifications).forEach(([paramName, newValue]) => {
            let modified = false;

            // Method 1: Update widgets array (for runtime display)
            if (graphNode.widgets) {
              const widget = graphNode.widgets.find((w: any) => w.name === paramName);
              if (widget) {
                widget.value = newValue;
                modified = true;
              }
            }

            // Method 2: Update _widgets array (alternative location)
            if (graphNode._widgets) {
              const _widget = graphNode._widgets.find((w: any) => w.name === paramName);
              if (_widget) {
                _widget.value = newValue;
                modified = true;
              }
            }

            // Method 3: Update widgets_values object (discovered structure)
            if (graphNode.widgets_values && typeof graphNode.widgets_values === 'object' && !Array.isArray(graphNode.widgets_values)) {
              if (paramName in graphNode.widgets_values) {
                graphNode.widgets_values[paramName] = newValue;
                modified = true;
              }
            }

            // Method 4: Update widgets_values array (traditional structure)
            if (graphNode.widgets_values && Array.isArray(graphNode.widgets_values)) {
              const widgetIndex = graphNode.widgets?.findIndex((w: any) => w.name === paramName);
              if (widgetIndex !== -1 && widgetIndex < graphNode.widgets_values.length) {
                graphNode.widgets_values[widgetIndex] = newValue;
                modified = true;
              }
            }

            if (!modified) {
              console.warn(`Could not update widget "${paramName}" in any location for node ${nodeId}`);
            }
          });
        } else {
          console.warn(`Graph node ${nodeId} not found`);
        }
      });

    }

    return modifiedGraph;
  }, []);

  // Handle interrupt
  const handleInterrupt = useCallback(async () => {

    if (!currentPromptIdRef.current) {
    }

    try {
      await ComfyUIService.interruptExecution();
    } catch (error) {
      console.error('INTERRUPT: Failed to interrupt:', error);
      toast.error(t('workflow.interruptFailed'));
    }
  }, []);

  // Handle clear queue
  const handleClearQueue = useCallback(async () => {
    try {
      await ComfyUIService.clearQueue();
      toast.success(t('workflow.queueCleared'));
    } catch (error) {
      console.error('Failed to clear queue:', error);
      toast.error(t('workflow.clearQueueFailed'));
    }
  }, []);

  // #endregion prompt actions

  // #region helper functions for tools
  // Handle workflow snapshots
  const handleShowWorkflowSnapshots = useCallback(() => {
    setIsWorkflowSnapshotsOpen(true);
  }, []);

  // Handle JSON data viewers
  const handleShowWorkflowJson = useCallback(() => {
    if (workflow?.workflow_json) {
      setJsonViewerData({
        title: t('workflow.jsonTitle'),
        data: workflow.workflow_json
      });
      setIsJsonViewerOpen(true);
    } else {
      toast.error(t('workflow.noJson'));
    }
  }, [workflow]);

  const handleShowObjectInfo = useCallback(() => {
    if (objectInfo) {
      setJsonViewerData({
        title: t('workflow.objectInfoTitle'),
        data: objectInfo
      });
      setIsJsonViewerOpen(true);
    } else {
      toast.error(t('workflow.noObjectInfo'));
    }
  }, [objectInfo]);

  // Handle save snapshot - serialize current graph
  const handleSaveSnapshot = useCallback(async (workflowId: string, title: string): Promise<IComfyJson> => {
    if (!comfyGraphRef.current) {
      throw new Error(t('workflow.noGraph'));
    }

    try {
      // Serialize current graph to IComfyJson
      const serializedWorkflow = serializeGraph(comfyGraphRef.current);

      return serializedWorkflow;
    } catch (error) {
      console.error('Failed to serialize workflow for snapshot:', error);
      throw new Error(t('workflow.serializeFailed'));
    }
  }, []);

  // Handle load snapshot - update workflow_json and reload using initial entry logic
  const handleLoadSnapshot = useCallback(async (snapshotData: IComfyJson) => {
    if (!id || !workflow) {
      toast.error(t('workflow.snapshotLoadFailed'));
      return;
    }

    try {
      setIsLoading(true);

      // Count nodes for user feedback
      const nodeCount = Object.keys(snapshotData.nodes || {}).length;

      // Update the workflow's workflow_json with snapshot data
      const updatedWorkflow = {
        ...workflow,
        workflow_json: snapshotData,
        modifiedAt: new Date()
      };

      // Save updated workflow to IndexedDB
      await updateWorkflow(updatedWorkflow);

      // Clear any existing modifications before reload
      widgetEditor.clearModifications();

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Reload the workflow using the same logic as initial app entry
      await loadWorkflow();

      toast.success(t('workflow.snapshotLoaded', { count: nodeCount }));

    } catch (error) {
      console.error('Failed to load snapshot:', error);
      toast.error(t('workflow.snapshotLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [id, workflow, widgetEditor, loadWorkflow]);

  // Auto-fit on initial load only (defined after canvasInteraction)
  useEffect(() => {
    if (nodeBounds.size > 0 && canvasRef.current && !hasAutoFitted) {
      // Small delay to ensure canvas is properly sized
      const timer = setTimeout(() => {
        canvasInteraction.handleZoomFit();
        setHasAutoFitted(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodeBounds, canvasInteraction.handleZoomFit, hasAutoFitted]);

  // Handle node search using shared navigation logic (defined after canvasInteraction)
  const handleSearchNode = useCallback((nodeId: string) => {
    if (!comfyGraphRef.current) return;

    const numericNodeId = parseInt(nodeId, 10);
    if (isNaN(numericNodeId)) {
      toast.error(t('workflow.invalidNodeId'));
      return;
    }

    // Use shared navigation function from useCanvasInteraction
    const success = canvasInteraction.handleNavigateToNode(numericNodeId);

    if (!success) {
      toast.error(t('workflow.nodeNotFound', { id: numericNodeId }));
      return;
    }

    // Also select the node for better visual feedback
    const targetNode = comfyGraphRef.current.getNodeById(numericNodeId);
    if (targetNode) {
      setSelectedNode(targetNode);
      setIsNodePanelVisible(true);
    }

    toast.success(t('workflow.focusedOnNode', { id: numericNodeId }));
  }, [canvasInteraction]);

  // Handle control_after_generate changes - update workflow metadata
  const handleControlAfterGenerateChange = useCallback(async (nodeId: number, value: string) => {
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph instance available for metadata update');
      return;
    }


    try {
      // Update the workflow metadata
      const updatedWorkflowJson = setControlAfterGenerate(workflow.workflow_json, nodeId, value);

      // Also update the ComfyGraph instance's metadata for proper serialization
      (comfyGraphRef.current as any)._mobileUIMetadata = updatedWorkflowJson.mobile_ui_metadata;

      // Update the workflow state
      const updatedWorkflow: IComfyWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson
      };

      setWorkflow(updatedWorkflow);
      setGlobalWorkflow(updatedWorkflow);

      // Also save to storage immediately to persist the change
      try {
        await updateWorkflow(updatedWorkflow);
      } catch (error) {
        console.error('Failed to save workflow to storage:', error);
      }

    } catch (error) {
      console.error('Failed to update control_after_generate metadata:', error);
    }
  }, [workflow]);

  // Mobile optimizations
  useMobileOptimizations(isNodePanelVisible, selectedNode);

  // File operations
  const fileOperations = useFileOperations({
    onSetWidgetValue: widgetEditor.setWidgetValue
  });

  // Convert LiteGraph groups to group bounds (only if needed for compatibility)
  const convertLiteGraphGroups = useCallback((groups: IComfyGraphGroup[]): GroupBounds[] => {
    if (!groups || !Array.isArray(groups)) return [];

    return groups.map((group: IComfyGraphGroup) => {
      const bounding = group.bounding;
      if (!bounding) return null;

      const [x, y, width, height] = bounding;

      return {
        x: x,
        y: y,
        width: width,
        height: height,
        title: group.title || '',
        color: group.color || '#444',
        id: group.id // Use the actual group ID from ComfyUI, not array index!
      };
    }).filter(Boolean) as GroupBounds[];
  }, []);
  // #endregion helper functions for tools

  // #region Node Actions
  // Handle add node from circular menu
  const handleAddNodeFromMenu = useCallback((position: { x: number; y: number }) => {
    const { x, y } = position;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const worldX = (x - rect.left - viewport.x) / viewport.scale;
      const worldY = (y - rect.top - viewport.y) / viewport.scale;

      canvasInteraction.setNodeAddPosition({
        canvasX: x - rect.left,
        canvasY: y - rect.top,
        worldX,
        worldY
      });
      canvasInteraction.setIsNodeAddModalOpen(true);
    }
  }, [viewport, canvasInteraction]);

  // Handle add node - add new node to workflow_json and reload
  const handleAddNode = useCallback(async (nodeType: string, nodeMetadata: any, position: { worldX: number; worldY: number }, initialValues?: Record<string, any>, size?: number[], title?: string) => {
    if (!workflow) {
      toast.error(t('workflow.snapshotLoadFailed')); // Or a more specific error
      return;
    }

    try {
      // Get current workflow_json
      const currentWorkflowJson = workflow.workflow_json;
      if (!currentWorkflowJson) {
        toast.error(t('workflow.noJson'));
        return;
      }

      // Add node to workflow JSON using WorkflowGraphService
      const updatedWorkflowJson = addNodeToWorkflow(
        currentWorkflowJson,
        nodeType,
        [position.worldX, position.worldY],
        nodeMetadata,
        initialValues,
        size
      );

      // Update the workflow with new workflow_json
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        nodeCount: updatedWorkflowJson.nodes?.length || 0,
        modifiedAt: new Date()
      };

      // Save updated workflow to IndexedDB
      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Reload the workflow using the same logic as initial app entry
      await loadWorkflow();

      toast.success(t('workflow.nodeAdded', { type: nodeMetadata.display_name || nodeType }));
    } catch (error) {
      console.error('Failed to add node:', error);
      toast.error(t('workflow.nodeAddFailed'));
    }
  }, [id, workflow, loadWorkflow]);

  // Handle node copy to clipboard
  const handleNodeCopy = useCallback((nodeId: number) => {
    if (!comfyGraphRef.current) return;

    const node = comfyGraphRef.current.getNodeById(nodeId);
    if (!node) {
      toast.error(t('workflow.nodeNotFound', { id: nodeId }));
      return;
    }

    try {
      // Extract comprehensive widget map by name
      const widgetMap: Record<string, any> = {};
      const widgets = node.getWidgets();
      widgets.forEach((w: IComfyWidget) => {
        if (w.name) {
          widgetMap[w.name] = w.value;
        }
      });

      const success = NodeClipboardService.saveNode({
        originalNodeId: nodeId,
        type: node.type || '',
        title: node.title || node.type || '',
        widgets: widgetMap,
        color: (node as any).bgcolor || (node as any).color,
        size: node.size ? [node.size[0], node.size[1]] : undefined
      });

      if (success) {
        toast.success(t('node.copySuccess'));
      } else {
        toast.error(t('node.copyError'));
      }
    } catch (error) {
      console.error('Failed to copy node:', error);
      toast.error(t('node.copyError'));
    }
  }, [t]);

  // Force re-render utility
  const forceRender = useCallback(() => {
    setRenderTrigger(prev => prev + 1);
  }, []);

  // handleSearchNode will be defined after canvasInteraction

  // Handle manual seed randomization
  const handleRandomizeSeeds = useCallback(async (isForceRandomize: boolean = true) => {

    if (!workflow || !nodeMetadata) {
      console.warn('RANDOMIZE: Missing workflow or metadata');
      toast.error(t('workflow.loadFailed'));
      return;
    }

    try {
      // Use autoChangeSeed function with force randomization
      const seedChanges = await autoChangeSeed(workflow, nodeMetadata, {
        getWidgetValue: widgetEditor.getWidgetValue,
        setWidgetValue: widgetEditor.setWidgetValue
      }, isForceRandomize);

      if (seedChanges.length > 0) {
        toast.success(t('workflow.randomizedSeeds', { count: seedChanges.length }), {
          description: t('workflow.updatedSeedsInNodes', { count: new Set(seedChanges.map(c => c.nodeId)).size }),
          duration: 3000,
        });

        // Force re-render to show updated values
        forceRender();
      } else {
        toast.info(t('workflow.noSeedsFound'), {
          description: t('workflow.noSeedsFoundDesc'),
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('RANDOMIZE: Failed to randomize seeds:', error);
      toast.error(t('workflow.randomizeFailed'), {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        duration: 5000,
      });
    }
  }, [workflow, nodeMetadata, widgetEditor.getWidgetValue, widgetEditor.setWidgetValue, forceRender]);


  // Handle group mode change
  const handleGroupModeChange = useCallback((groupId: number, mode: NodeMode) => {
    const group = workflowGroups.find(g => g.id === groupId);
    if (!group) return;

    // Apply mode to all nodes in the group
    group.nodeIds.forEach(nodeId => {
      widgetEditor.setNodeMode(nodeId, mode);
    });

    const modeNames: Record<NodeMode, string> = {
      [NodeMode.ALWAYS]: 'Always',
      [NodeMode.ON_EVENT]: 'On Event',
      [NodeMode.NEVER]: 'Mute',
      [NodeMode.ON_TRIGGER]: 'On Trigger',
      [NodeMode.BYPASS]: 'Bypass'
    };

    toast.success(t('workflow.appliedGroupMode', {
      mode: modeNames[mode],
      count: group.nodeIds.length,
      title: group.title
    }));
    forceRender();
  }, [workflowGroups, widgetEditor, forceRender]);

  const handleNodeColorChange = async (nodeId: number, bgcolor: string) => {
    // Update node bgcolor in both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      // 1. Update ComfyGraph node immediately (for instant visual feedback)
      const comfyNode = comfyGraphRef.current.getNodeById(nodeId);
      if (comfyNode) {
        if (bgcolor === '') {
          delete comfyNode.bgcolor;
        } else {
          comfyNode.bgcolor = bgcolor;
        }
        console.log(`Updated ComfyGraph node ${nodeId} bgcolor immediately:`, {
          nodeId,
          newBgcolor: bgcolor === '' ? 'cleared' : bgcolor
        });

        // Update selectedNode state if it's the same node for UI refresh
        if (selectedNode && selectedNode.id === nodeId) {
          // Update the bgcolor property directly on the original instance
          // instead of creating a shallow copy that loses internal state
          if (bgcolor === '') {
            delete (selectedNode as any).bgcolor;
          } else {
            (selectedNode as any).bgcolor = bgcolor;
          }

          // The color change will be reflected through the ComfyGraph rendering
          // No need to trigger React re-render since NodeInspector should remain stable
        }
      }

      // 2. Update workflow_json for persistence
      const updatedWorkflowJson = JSON.parse(JSON.stringify(workflow.workflow_json));

      // Update node bgcolor in workflow_json nodes array
      if (updatedWorkflowJson.nodes && Array.isArray(updatedWorkflowJson.nodes)) {
        const nodeIndex = updatedWorkflowJson.nodes.findIndex((node: any) => node.id === nodeId);
        if (nodeIndex !== -1) {
          // If bgcolor is empty string, delete the property; otherwise set it
          if (bgcolor === '') {
            delete updatedWorkflowJson.nodes[nodeIndex].bgcolor;
          } else {
            updatedWorkflowJson.nodes[nodeIndex].bgcolor = bgcolor;
          }
        } else {
          console.warn(`Node ${nodeId} not found in workflow_json.nodes array`);
          return;
        }
      } else if (updatedWorkflowJson.nodes && typeof updatedWorkflowJson.nodes === 'object') {
        // Handle object format (alternative format)
        const nodeKey = nodeId.toString();
        if (updatedWorkflowJson.nodes[nodeKey]) {
          if (bgcolor === '') {
            delete updatedWorkflowJson.nodes[nodeKey].bgcolor;
          } else {
            updatedWorkflowJson.nodes[nodeKey].bgcolor = bgcolor;
          }
        } else {
          console.warn(`Node ${nodeId} not found in workflow_json.nodes object`);
          return;
        }
      }

      // Create updated workflow with new workflow_json
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson
      };

      // Save updated workflow to IndexedDB
      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);


    } catch (error) {
      console.error('Failed to update node color:', error);
    }
  }

  const handleNodeDelete = async (nodeId: number) => {
    // Close circular menu first
    setCircularMenuState(prev => ({ ...prev, isOpen: false }));

    // Set nodeId to trigger confirmation dialog
    setNodeIdToDelete(nodeId);
  }

  const confirmNodeDelete = async () => {
    if (nodeIdToDelete === null) return;

    const nodeId = nodeIdToDelete;
    setNodeIdToDelete(null);

    // Delete node and its links from both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      // 1. Use WorkflowGraphService to remove node and links
      const { workflowJson: updatedWorkflowJson, comfyGraph: updatedComfyGraph } = removeNodeWithLinks(
        workflow.workflow_json,
        comfyGraphRef.current,
        nodeId
      );

      // 2. Update the refs immediately for instant visual feedback
      comfyGraphRef.current = updatedComfyGraph;

      // 3. Clear selected node if it's the deleted one
      if (selectedNode && (typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id) === nodeId) {
        setSelectedNode(null);
        setIsNodePanelVisible(false);
      }

      // 4. Update and save the workflow
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        nodeCount: updatedWorkflowJson.nodes?.length || 0
      };

      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Reload the workflow using the same logic as initial app entry
      await loadWorkflow();

      toast.success(t('workflow.nodeDeleted', { id: nodeId }));

    } catch (error) {
      console.error('Failed to delete node:', error);
      toast.error(t('workflow.nodeDeleteFailed'));
    }
  }

  const handleGroupDelete = async (groupId: number) => {
    // Delete group from both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      // 1. Use WorkflowGraphService to remove group
      const { workflowJson: updatedWorkflowJson, comfyGraph: updatedComfyGraph } = removeGroup(
        workflow.workflow_json,
        comfyGraphRef.current,
        groupId
      );

      // 2. Update the refs immediately for instant visual feedback
      comfyGraphRef.current = updatedComfyGraph;

      // 3. Update and save the workflow
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson
      };

      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Reload the workflow using the same logic as initial app entry
      await loadWorkflow();

      // 4. Clear selected node if it was the group that was deleted
      if (selectedNode && (selectedNode as any).groupInfo && (selectedNode as any).groupInfo.groupId === groupId) {
        setSelectedNode(null);
      }

      toast.success(t('workflow.groupDeleted', { id: groupId }));

    } catch (error) {
      console.error('Failed to delete group:', error);
      toast.error(t('workflow.groupDeleteFailed'));
    }
  }

  // Disconnect a single input link
  const handleDisconnectInput = async (nodeId: number, inputSlot: number) => {
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      // Find the node in both JSON and Graph
      const jsonNode = workflow.workflow_json.nodes.find((n: any) => n.id === nodeId);
      const graphNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === nodeId);

      if (!jsonNode || !graphNode || !jsonNode.inputs || !jsonNode.inputs[inputSlot]) {
        console.warn('Node or input slot not found');
        return;
      }

      const linkId = jsonNode.inputs[inputSlot].link;
      if (!linkId) {
        console.warn('No link to disconnect');
        return;
      }

      // 1. Update ComfyGraph directly (for instant visual feedback)
      if (graphNode.inputs && graphNode.inputs[inputSlot]) {
        graphNode.inputs[inputSlot].link = null;
      }

      // Remove link from ComfyGraph _links
      if (comfyGraphRef.current._links && comfyGraphRef.current._links[linkId]) {
        delete comfyGraphRef.current._links[linkId];
      }

      // Remove link from source node outputs in ComfyGraph
      comfyGraphRef.current._nodes?.forEach((node: any) => {
        if (node.outputs) {
          node.outputs.forEach((output: any) => {
            if (output.links && Array.isArray(output.links)) {
              output.links = output.links.filter((id: number) => id !== linkId);
            }
          });
        }
      });

      // 2. Update workflow_json DIRECTLY (in-place) for persistence
      // Remove link from workflow_json links array
      workflow.workflow_json.links = workflow.workflow_json.links.filter((link: any) => link[0] !== linkId);

      // Clear the input link in workflow_json
      const targetJsonNode = workflow.workflow_json.nodes.find((n: any) => n.id === nodeId);
      if (targetJsonNode && targetJsonNode.inputs && targetJsonNode.inputs[inputSlot]) {
        targetJsonNode.inputs[inputSlot].link = null;
      }

      // Remove link from source node outputs in workflow_json
      workflow.workflow_json.nodes.forEach((node: any) => {
        if (node.outputs) {
          node.outputs.forEach((output: any) => {
            if (output.links && Array.isArray(output.links)) {
              const linkIndex = output.links.indexOf(linkId);
              if (linkIndex !== -1) {
                output.links.splice(linkIndex, 1);
              }
            }
          });
        }
      });

      // 3. Update workflow.graph directly (in-place, no copy) to avoid React re-render
      if (workflow.graph && workflow.graph._links) {
        // Remove link from graph _links object directly
        if (workflow.graph._links[linkId]) {
          delete workflow.graph._links[linkId];
        }

        // Clear the input link in graph _nodes directly
        if (workflow.graph._nodes) {
          const targetGraphNode = workflow.graph._nodes.find((n: any) => n.id === nodeId);
          if (targetGraphNode && targetGraphNode.inputs && targetGraphNode.inputs[inputSlot]) {
            targetGraphNode.inputs[inputSlot].link = null;
          }

          // Remove link from source node outputs in graph directly
          workflow.graph._nodes.forEach((node: any) => {
            if (node.outputs) {
              node.outputs.forEach((output: any) => {
                if (output.links && Array.isArray(output.links)) {
                  const linkIndex = output.links.indexOf(linkId);
                  if (linkIndex !== -1) {
                    output.links.splice(linkIndex, 1);
                  }
                }
              });
            }
          });
        }
      }

      // 4. Use the directly modified workflow for backend save
      const updatedWorkflow = workflow; // Already modified in-place

      // Save to backend asynchronously without updating React state
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save workflow:', error);
        toast.error(t('workflow.updateError'));
      });

      // Trigger canvas redraw with imperceptible viewport change
      setViewport(prev => ({ ...prev, scale: prev.scale + 0.00001 }));
      setTimeout(() => {
        setViewport(prev => ({ ...prev, scale: prev.scale - 0.00001 }));
      }, 10);

      toast.success(t('workflow.disconnected'));

    } catch (error) {
      console.error('Failed to disconnect input:', error);
      toast.error(t('workflow.disconnectFailed'));
    }
  };

  // Disconnect a single output link
  const handleDisconnectOutput = async (nodeId: number, outputSlot: number, linkId: number) => {
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      // Find the node in both JSON and Graph
      const jsonNode = workflow.workflow_json.nodes.find((n: any) => n.id === nodeId);
      const graphNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === nodeId);

      if (!jsonNode || !graphNode || !jsonNode.outputs || !jsonNode.outputs[outputSlot]) {
        console.warn('Node or output slot not found');
        return;
      }

      // Find the target node's input link BEFORE removing from links array
      const linkInfo = workflow.workflow_json.links.find(link => link[0] === linkId);

      // 1. Update ComfyGraph directly (for instant visual feedback)
      // Remove link from ComfyGraph _links
      if (comfyGraphRef.current._links && comfyGraphRef.current._links[linkId]) {
        delete comfyGraphRef.current._links[linkId];
      }

      // Clear the target node's input link in ComfyGraph
      if (linkInfo) {
        const [, , , targetNodeId, targetSlot] = linkInfo;
        const targetGraphNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === targetNodeId);

        if (targetGraphNode && targetGraphNode.inputs && targetGraphNode.inputs[targetSlot]) {
          targetGraphNode.inputs[targetSlot].link = null;
        }
      }

      // Remove link from source node outputs in ComfyGraph
      if (graphNode.outputs && graphNode.outputs[outputSlot] && graphNode.outputs[outputSlot].links) {
        graphNode.outputs[outputSlot].links = graphNode.outputs[outputSlot].links.filter((id: number) => id !== linkId);
      }

      // 2. Update workflow_json DIRECTLY (in-place) for persistence
      // Remove link from workflow_json links array
      workflow.workflow_json.links = workflow.workflow_json.links.filter((link: any) => link[0] !== linkId);

      // Clear the target node's input link in workflow_json
      if (linkInfo) {
        const [, , , targetNodeId, targetSlot] = linkInfo;
        const targetJsonNode = workflow.workflow_json.nodes.find((n: any) => n.id === targetNodeId);

        if (targetJsonNode && targetJsonNode.inputs && targetJsonNode.inputs[targetSlot]) {
          targetJsonNode.inputs[targetSlot].link = null;
        }
      }

      // Remove link from source node outputs in workflow_json
      const sourceJsonNode = workflow.workflow_json.nodes.find((n: any) => n.id === nodeId);
      if (sourceJsonNode && sourceJsonNode.outputs && sourceJsonNode.outputs[outputSlot] && sourceJsonNode.outputs[outputSlot].links) {
        const linkIndex = sourceJsonNode.outputs[outputSlot].links.indexOf(linkId);
        if (linkIndex !== -1) {
          sourceJsonNode.outputs[outputSlot].links.splice(linkIndex, 1);
        }
      }

      // 3. Update workflow.graph directly (in-place, no copy) to avoid React re-render
      if (workflow.graph && workflow.graph._links) {
        // Remove link from graph _links object directly
        if (workflow.graph._links[linkId]) {
          delete workflow.graph._links[linkId];
        }

        // Clear the target node's input link in graph _nodes directly
        if (linkInfo && workflow.graph._nodes) {
          const [, , , targetNodeId, targetSlot] = linkInfo;
          const targetGraphNode = workflow.graph._nodes.find((n: any) => n.id === targetNodeId);

          if (targetGraphNode && targetGraphNode.inputs && targetGraphNode.inputs[targetSlot]) {
            targetGraphNode.inputs[targetSlot].link = null;
          }
        }

        // Remove link from source node outputs in graph directly
        if (workflow.graph._nodes) {
          const sourceGraphNode = workflow.graph._nodes.find((n: any) => n.id === nodeId);
          if (sourceGraphNode && sourceGraphNode.outputs && sourceGraphNode.outputs[outputSlot] && sourceGraphNode.outputs[outputSlot].links) {
            const linkIndex = sourceGraphNode.outputs[outputSlot].links.indexOf(linkId);
            if (linkIndex !== -1) {
              sourceGraphNode.outputs[outputSlot].links.splice(linkIndex, 1);
            }
          }
        }
      }

      // 4. Use the directly modified workflow for backend save
      const updatedWorkflow = workflow; // Already modified in-place

      // Save to backend asynchronously without updating React state
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save workflow:', error);
        toast.error(t('workflow.updateError'));
      });

      // Trigger canvas redraw with imperceptible viewport change
      setViewport(prev => ({ ...prev, scale: prev.scale + 0.00001 }));
      setTimeout(() => {
        setViewport(prev => ({ ...prev, scale: prev.scale - 0.00001 }));
      }, 10);

      toast.success(t('workflow.disconnected'));

    } catch (error) {
      console.error('Failed to disconnect output:', error);
      toast.error(t('workflow.disconnectFailed'));
    }
  };

  // Refresh node slots function - supports both single node and full workflow refresh
  const refreshNodeSlots = async (nodeIds?: number[]) => {
    if (!workflow?.workflow_json || !comfyGraphRef.current || !objectInfo) {
      console.warn('No workflow, ComfyGraph, or objectInfo available');
      toast.error(t('workflow.refreshFailed'));
      return;
    }

    try {
      // Determine which nodes to refresh
      let targetNodeIds: number[];
      if (nodeIds && nodeIds.length > 0) {
        targetNodeIds = nodeIds;
      } else {
        // Refresh all nodes in the workflow
        targetNodeIds = workflow.workflow_json.nodes?.map((n: any) => n.id) || [];
      }

      if (targetNodeIds.length === 0) {
        toast.info(t('workflow.noNodesToRefresh'));
        return;
      }

      let refreshedCount = 0;
      let skippedCount = 0;
      const updatedNodes = [...(workflow.workflow_json.nodes || [])];

      // Process each target node
      for (const nodeId of targetNodeIds) {
        const currentNode = updatedNodes.find((n: any) => n.id === nodeId);
        if (!currentNode) {
          console.warn(`Node ${nodeId} not found in workflow`);
          skippedCount++;
          continue;
        }

        const nodeType = currentNode.type;
        if (!nodeType) {
          console.warn(`Node ${nodeId} has no type`);
          skippedCount++;
          continue;
        }

        // Get fresh metadata from objectInfo
        const nodeMetadata = objectInfo[nodeType];
        if (!nodeMetadata) {
          console.warn(`Node type "${nodeType}" not found on server`);
          skippedCount++;
          continue;
        }

        // Get existing slots to preserve connections
        const existingInputs = currentNode.inputs || [];
        const existingOutputs = currentNode.outputs || [];

        // Create fresh template slots from metadata
        const templateInputs = createInputSlots(nodeMetadata.input || {}, nodeMetadata.input_order);
        const templateOutputs = createOutputSlots(
          nodeMetadata.output || [],
          nodeMetadata.output_name || []
        );

        // merge: preserve all existing slots and add new template slots
        const existingInputsByName = new Map(existingInputs.map(slot => [slot.name, slot]));
        const existingOutputsByName = new Map(existingOutputs.map(slot => [slot.name, slot]));
        const templateInputsByName = new Map(templateInputs.map(slot => [slot.name, slot]));
        const templateOutputsByName = new Map(templateOutputs.map(slot => [slot.name, slot]));

        // Start with existing inputs and add new template inputs
        const mergedInputs = existingInputs.map(slot => {
          // Ensure widget slots have link: null property
          if (slot.widget && slot.link === undefined) {
            return { ...slot, link: null };
          }
          return slot;
        });
        for (const templateSlot of templateInputs) {
          if (!existingInputsByName.has(templateSlot.name)) {
            // Add new slot from template if it doesn't exist
            mergedInputs.push(templateSlot);
          }
        }

        // Start with existing outputs and add new template outputs
        const mergedOutputs = [...existingOutputs];
        for (const templateSlot of templateOutputs) {
          if (!existingOutputsByName.has(templateSlot.name)) {
            // Add new slot from template if it doesn't exist
            mergedOutputs.push(templateSlot);
          }
        }

        // Update the node in the nodes array
        const nodeIndex = updatedNodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex !== -1) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            inputs: mergedInputs,
            outputs: mergedOutputs
          };
          refreshedCount++;
        }

        // Update ComfyGraph node
        const graphNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === nodeId);
        if (graphNode) {
          graphNode.inputs = mergedInputs;
          graphNode.outputs = mergedOutputs;
        }
      }

      // Update workflow JSON with all changes
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        nodes: updatedNodes
      };

      // Save the updated workflow
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson
      };

      await updateWorkflow(updatedWorkflow);
      setWorkflow(updatedWorkflow);

      // Close node panel if it was a single node refresh
      if (nodeIds && nodeIds.length === 1) {
        setIsNodePanelVisible(false);
        setSelectedNode(null);
      }

      // Reload the workflow to ensure all systems are synchronized
      await loadWorkflow();

      // Show appropriate success message
      if (nodeIds && nodeIds.length === 1) {
        toast.success(t('workflow.nodeRefreshed', { id: nodeIds[0] }));
      } else {
        toast.success(t('workflow.workflowRefreshed', { refreshedCount }) +
          (skippedCount > 0 ? t('workflow.nodesSkipped', { count: skippedCount }) : ''));
      }

    } catch (error) {
      console.error('Failed to refresh node slots:', error);
      toast.error(t('workflow.refreshFailed'));
    }
  };

  const handleNodeRefresh = async (nodeId: number) => {
    await refreshNodeSlots([nodeId]);
  };

  const handleNodeTitleChange = async (nodeId: number, title: string) => {
    // Update node title in both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      console.log('Updating node title:', { nodeId, title });

      // 1. Update ComfyGraph node immediately (for instant visual feedback)
      const comfyNode = comfyGraphRef.current.getNodeById(nodeId);
      if (comfyNode) {
        // Update the node title using ComfyGraphNode's setTitle method
        if (typeof (comfyNode as any).setTitle === 'function') {
          (comfyNode as any).setTitle(title);
          console.log('Used setTitle method on ComfyGraph node');
        } else {
          // Fallback: set title directly
          (comfyNode as any).title = title;
          console.log('Set title directly on ComfyGraph node');
        }
        console.log(`Updated ComfyGraph node ${nodeId} title immediately:`, title);
      }

      // Also find in workflow.graph for consistency
      if (workflow.graph) {
        const node = workflow.graph._nodes?.find(n => n.id === nodeId);
        if (node) {
          if (typeof (node as any).setTitle === 'function') {
            (node as any).setTitle(title);
          } else {
            (node as any).title = title;
          }
        }
      }

      // Update workflow_json for persistence - SHALLOW copy to preserve references
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        nodes: workflow.workflow_json.nodes ? [...workflow.workflow_json.nodes] : []
      };

      // Update only the specific node's title in workflow_json
      if (Array.isArray(updatedWorkflowJson.nodes)) {
        const nodeIndex = updatedWorkflowJson.nodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex !== -1) {
          // Shallow copy the node and update only the title
          updatedWorkflowJson.nodes[nodeIndex] = {
            ...updatedWorkflowJson.nodes[nodeIndex],
            title: title
          };
          console.log('Updated title in nodes array');
        }
      }

      // Save to backend
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modified_at: new Date().toISOString()
      };

      await updateWorkflow(updatedWorkflow);

      // Update local workflow state without full reload
      setWorkflow(updatedWorkflow);

      // Update selected node to reflect changes in UI
      if (selectedNode && selectedNode.id === nodeId) {
        const updatedNode = comfyGraphRef.current?.getNodeById(nodeId);
        if (updatedNode) {
          // Force React to detect the change by clearing and resetting
          setSelectedNode(null);
          setTimeout(() => {
            setSelectedNode(updatedNode as any);
          }, 0);
        }
      }

      toast.success(t('workflow.titleUpdated'));
    } catch (error) {
      console.error('Failed to update node title:', error);
      toast.error(t('workflow.titleUpdateFailed'));
    }
  };

  const handleNodeSizeChange = (nodeId: number, width: number, height: number) => {
    if (!workflow?.graph) return;

    try {
      console.log('Updating node size:', { nodeId, width, height });

      // Find the node in the graph
      const node = workflow.graph._nodes?.find(n => n.id === nodeId);
      if (!node) {
        console.error('Node not found:', nodeId);
        return;
      }

      // Update the node's size immediately for real-time canvas update
      (node as any).size = [width, height];

      // Update workflow_json for persistence - SHALLOW copy to preserve references
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        nodes: workflow.workflow_json.nodes ? [...workflow.workflow_json.nodes] : []
      };

      // Update only the specific node's size in workflow_json
      if (Array.isArray(updatedWorkflowJson.nodes)) {
        const nodeIndex = updatedWorkflowJson.nodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex !== -1) {
          // Shallow copy the node and update only the size
          updatedWorkflowJson.nodes[nodeIndex] = {
            ...updatedWorkflowJson.nodes[nodeIndex],
            size: [width, height]
          };
        }
      }

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modified_at: new Date().toISOString()
      };

      setWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
          // Update the size on the actual graph node (already done above)
          // Just update the bounds size for rendering, keep the original node reference
          newBounds.set(nodeId, {
            ...existingBounds,
            width,
            height,
            node: node as any // Use the actual updated graph node reference
          });
        }
        return newBounds;
      });

      // Update selected node to reflect changes in UI immediately
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(node as any);
      }

      // Save to backend asynchronously (don't await)
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save node size to backend:', error);
        // Don't show error toast for background saves to avoid interrupting user experience
      });

      console.log('Node size updated successfully');
    } catch (error) {
      console.error('Failed to update node size:', error);
      toast.error(t('workflow.sizeUpdateFailed'));
    }
  };

  const handleNodeModeChange = (nodeId: number, mode: number) => {
    if (!workflow?.graph) return;

    try {
      console.log('Updating node mode:', { nodeId, mode });

      // Find the node in the graph
      const node = workflow.graph._nodes?.find(n => n.id === nodeId);
      if (!node) {
        console.error('Node not found:', nodeId);
        return;
      }

      // Update the node's mode immediately for real-time canvas update
      node.mode = mode;

      // Update workflow_json for persistence - SHALLOW copy to preserve references
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        nodes: workflow.workflow_json.nodes ? [...workflow.workflow_json.nodes] : []
      };

      // Update only the specific node's mode in workflow_json
      if (Array.isArray(updatedWorkflowJson.nodes)) {
        const nodeIndex = updatedWorkflowJson.nodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex !== -1) {
          // Shallow copy the node and update only the mode
          updatedWorkflowJson.nodes[nodeIndex] = {
            ...updatedWorkflowJson.nodes[nodeIndex],
            mode: mode
          };
        }
      }

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modified_at: new Date().toISOString()
      };

      setWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering with new mode
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
          // Redraw with the updated node reference to reflect mode change (visual status)
          newBounds.set(nodeId, {
            ...existingBounds,
            node: node as any
          });
        }
        return newBounds;
      });

      // Update selected node to reflect changes in UI immediately
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(node as any);
      }

      // Save to backend asynchronously (don't await)
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save node mode to backend:', error);
      });

      console.log('Node mode updated successfully');
    } catch (error) {
      console.error('Failed to update node mode:', error);
      toast.error(t('workflow.modeUpdateFailed'));
    }
  };

  const handleNodeCollapseChange = (nodeId: number, collapsed: boolean) => {
    if (!workflow?.graph) return;

    try {
      console.log('Updating node collapse:', { nodeId, collapsed });

      // Find the node in the graph
      const node = workflow.graph._nodes?.find(n => n.id === nodeId);
      if (!node) {
        console.error('Node not found:', nodeId);
        return;
      }

      // Update the node's collapsed state immediately for real-time canvas update
      if (!(node as any).flags) {
        (node as any).flags = {};
      }
      (node as any).flags.collapsed = collapsed;

      // Update workflow_json for persistence - SHALLOW copy to preserve references
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        nodes: workflow.workflow_json.nodes ? [...workflow.workflow_json.nodes] : []
      };

      // Update only the specific node's flags in workflow_json
      if (Array.isArray(updatedWorkflowJson.nodes)) {
        const nodeIndex = updatedWorkflowJson.nodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex !== -1) {
          // Shallow copy the node and update only the flags
          updatedWorkflowJson.nodes[nodeIndex] = {
            ...updatedWorkflowJson.nodes[nodeIndex],
            flags: {
              ...updatedWorkflowJson.nodes[nodeIndex].flags,
              collapsed: collapsed
            }
          };
        }
      }

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modified_at: new Date().toISOString()
      };

      setWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering with collapse state
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
          // Update the flags on the actual graph node (already done above)
          // Just update the bounds size for rendering, keep the original node reference
          newBounds.set(nodeId, {
            ...existingBounds,
            // Apply collapsed size if collapsed, otherwise keep original size
            width: collapsed ? 80 : (existingBounds.node.size?.[0] || 200),
            height: collapsed ? 30 : (existingBounds.node.size?.[1] || 100),
            node: node as any // Use the actual updated graph node reference
          });
        }
        return newBounds;
      });

      // Update selected node to reflect changes in UI immediately
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(node as any);
      }

      // Save to backend asynchronously (don't await)
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save node collapse to backend:', error);
        // Don't show error toast for background saves to avoid interrupting user experience
      });

      console.log('Node collapse updated successfully');
    } catch (error) {
      console.error('Failed to update node collapse:', error);
      toast.error(t('workflow.collapseUpdateFailed'));
    }
  };

  const handleGroupSizeChange = (groupId: number, width: number, height: number) => {
    if (!workflow?.graph) return;

    try {
      console.log('Updating group size:', { groupId, width, height });

      // Find the group in the graph
      const group = workflow.graph._groups?.find(g => g.id === groupId);
      if (!group) {
        console.error('Group not found:', groupId);
        return;
      }

      // Update the group's bounding size immediately for real-time canvas update
      if (group.bounding && Array.isArray(group.bounding) && group.bounding.length >= 4) {
        // Group bounding format: [x, y, width, height]
        group.bounding[2] = width;  // width
        group.bounding[3] = height; // height
      }

      // Update workflow_json for persistence - SHALLOW copy to preserve references
      const updatedWorkflowJson = {
        ...workflow.workflow_json,
        groups: workflow.workflow_json.groups ? [...workflow.workflow_json.groups] : []
      };

      // Update only the specific group's bounding in workflow_json
      if (Array.isArray(updatedWorkflowJson.groups)) {
        const groupIndex = updatedWorkflowJson.groups.findIndex((g: any) => g.id === groupId);
        if (groupIndex !== -1) {
          // Shallow copy the group and update only the bounding
          const updatedGroup = {
            ...updatedWorkflowJson.groups[groupIndex],
            bounding: [...(updatedWorkflowJson.groups[groupIndex].bounding || [0, 0, width, height])]
          };

          // Update the width and height in bounding array
          if (updatedGroup.bounding.length >= 4) {
            updatedGroup.bounding[2] = width;  // width
            updatedGroup.bounding[3] = height; // height
          }

          updatedWorkflowJson.groups[groupIndex] = updatedGroup;
        }
      }

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modified_at: new Date().toISOString()
      };

      setWorkflow(updatedWorkflow);

      // Update groupBounds for immediate canvas rendering
      setGroupBounds(prevBounds => {
        return prevBounds.map(bounds => {
          if (bounds.id === groupId) {
            return {
              ...bounds,
              width,
              height,
              group: group as any // Use the actual updated graph group reference
            };
          }
          return bounds;
        });
      });

      // Save to backend asynchronously (don't await)
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save group size to backend:', error);
        // Don't show error toast for background saves to avoid interrupting user experience
      });

      console.log('Group size updated successfully');
    } catch (error) {
      console.error('Failed to update group size:', error);
      toast.error(t('workflow.groupSizeUpdateFailed'));
    }
  };

  // Get current node mode (for group mode analysis)
  const getCurrentNodeMode = useCallback((nodeId: number): NodeMode | null => {
    const node = workflow?.graph?._nodes?.find(n => n.id === nodeId);
    if (!node) return null;

    // Get mode from widgetEditor, with original node mode as fallback
    const originalMode = node.mode !== undefined ? node.mode : NodeMode.ALWAYS;
    return widgetEditor.getNodeMode(nodeId, originalMode);
  }, [workflow?.graph?._nodes, widgetEditor]);



  // #endregion Node Actions

  // #region UI
  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" style={{ height: '100dvh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('workflow.loading')}</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !workflow) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" style={{ height: '100dvh' }}>
        <div className="text-center max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">{t('workflow.loadFailed')}</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            {t('workflow.backToList')}
          </button>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="pwa-container relative w-full via-blue-50/30 to-cyan-50/30">
      {/* Header */}
      <WorkflowHeader
        workflow={workflow!}
        selectedNode={selectedNode}
        hasUnsavedChanges={widgetEditor.hasModifications()}
        isSaving={isSaving}
        saveSucceeded={saveSucceeded}
        onNavigateBack={() => {
          // If NodeInspector or GroupInspector is open, close it first
          if (isNodePanelVisible) {
            // Clear image cache for the node when inspector closes
            // as widget values may have changed
            if (selectedNode?.id) {
              const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
              clearNodeImageCache(nodeId);

              // Trigger canvas redraw to reload images
              if (canvasRef.current) {
                canvasRef.current.dispatchEvent(new Event('imageLoaded'));
              }
            }
            setIsNodePanelVisible(false);
            setSelectedNode(null);
          } else {
            navigate('/');
          }
        }}
        onSaveChanges={handleSaveChanges}
      />

      {/* Canvas */}
      <WorkflowCanvas
        containerRef={containerRef}
        canvasRef={canvasRef}
        isDragging={canvasInteraction.isDragging}
        longPressState={canvasInteraction.longPressState}
        onMouseDown={canvasInteraction.handleMouseDown}
        onMouseMove={canvasInteraction.handleMouseMove}
        onMouseUp={canvasInteraction.handleMouseUp}
        onWheel={canvasInteraction.handleWheel}
        onTouchStart={canvasInteraction.handleTouchStart}
        onTouchMove={canvasInteraction.handleTouchMove}
        onTouchEnd={canvasInteraction.handleTouchEnd}
      />

      {/* Floating Control Panel - Hidden during repositioning and connection mode */}
      {!canvasInteraction.repositionMode.isActive && !connectionMode.connectionMode.isActive && (
        <QuickActionPanel
          workflow={workflow}
          onExecute={handleExecute}
          onInterrupt={handleInterrupt}
          onClearQueue={handleClearQueue}
          refreshQueueTrigger={queueRefreshTrigger}
        />
      )}

      {/* Repositioning Action Bar (Bottom Left) */}
      <RepositionActionBar
        isActive={canvasInteraction.repositionMode.isActive}
        gridSnapEnabled={canvasInteraction.repositionMode.gridSnapEnabled}
        onToggleGridSnap={canvasInteraction.toggleGridSnap}
        onCancel={canvasInteraction.cancelReposition}
        onApply={async () => {
          const changes = canvasInteraction.applyReposition();
          if (changes) { // Temporarily remove length check to debug
            try {
              // Get current workflow_json
              const currentWorkflowJson = workflow?.workflow_json;
              if (!currentWorkflowJson) {
                return;
              }

              // Create a deep copy of workflow_json to avoid mutation
              const updatedWorkflowJson = JSON.parse(JSON.stringify(currentWorkflowJson));

              // Update node positions directly in workflow_json nodes array
              if (changes.nodeChanges && changes.nodeChanges.length > 0) {
                if (updatedWorkflowJson.nodes && Array.isArray(updatedWorkflowJson.nodes)) {
                  changes.nodeChanges.forEach(change => {
                    const nodeIndex = updatedWorkflowJson.nodes.findIndex((node: any) => node.id === change.nodeId);
                    if (nodeIndex !== -1) {
                      // Update pos property directly in the workflow JSON
                      updatedWorkflowJson.nodes[nodeIndex].pos = change.newPosition;
                    } else {
                      console.warn(`Node ${change.nodeId} not found in workflow_json.nodes array`);
                    }
                  });
                }
              }

              // Update group positions in workflow_json groups array
              // ComfyUI groups use 'bounding' array: [x, y, width, height]
              if (changes.groupChanges && changes.groupChanges.length > 0 && updatedWorkflowJson.groups) {
                if (Array.isArray(updatedWorkflowJson.groups)) {
                  changes.groupChanges.forEach(change => {
                    const groupIndex = updatedWorkflowJson.groups.findIndex((group: any) => group.id === change.groupId);
                    if (groupIndex !== -1) {
                      // Update bounding array [x, y, width, height] - only modify x and y (indices 0 and 1)
                      const currentBounding = updatedWorkflowJson.groups[groupIndex].bounding;
                      if (Array.isArray(currentBounding) && currentBounding.length >= 4) {
                        updatedWorkflowJson.groups[groupIndex].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          currentBounding[2],    // width (unchanged)
                          currentBounding[3]     // height (unchanged)
                        ];
                      } else {
                        console.warn(`Group ${change.groupId} has invalid bounding format:`, currentBounding);
                      }
                    } else {
                      console.warn(`Group ${change.groupId} not found in workflow_json.groups array`);
                    }
                  });
                } else if (typeof updatedWorkflowJson.groups === 'object') {
                  // Handle object format (alternative format)
                  changes.groupChanges.forEach(change => {
                    const groupKey = change.groupId.toString();
                    if (updatedWorkflowJson.groups[groupKey]) {
                      const currentBounding = updatedWorkflowJson.groups[groupKey].bounding;
                      if (Array.isArray(currentBounding) && currentBounding.length >= 4) {
                        updatedWorkflowJson.groups[groupKey].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          currentBounding[2],    // width (unchanged)
                          currentBounding[3]     // height (unchanged)
                        ];
                      } else {
                        console.warn(`Group ${change.groupId} has invalid bounding format:`, currentBounding);
                      }
                    } else {
                      console.warn(`Group ${change.groupId} not found in workflow_json.groups object`);
                    }
                  });
                }
              }

              // Also check extra.ds.groups for group positions (ComfyUI format)
              if (changes.groupChanges && changes.groupChanges.length > 0 && updatedWorkflowJson.extra?.ds?.groups) {
                if (Array.isArray(updatedWorkflowJson.extra.ds.groups)) {
                  changes.groupChanges.forEach(change => {
                    const groupIndex = updatedWorkflowJson.extra.ds.groups.findIndex((group: any) => group.id === change.groupId);
                    if (groupIndex !== -1) {
                      // Update bounding array [x, y, width, height] - only modify x and y
                      const currentBounding = updatedWorkflowJson.extra.ds.groups[groupIndex].bounding;
                      if (Array.isArray(currentBounding) && currentBounding.length >= 4) {
                        updatedWorkflowJson.extra.ds.groups[groupIndex].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          currentBounding[2],    // width (unchanged)
                          currentBounding[3]     // height (unchanged)
                        ];
                      }
                    }
                  });
                }
              }

              // Update resize changes (both node sizes and group sizes)
              if (changes.resizeChanges && changes.resizeChanges.length > 0) {
                changes.resizeChanges.forEach(change => {
                  if (change.nodeId) {
                    // Update node size
                    if (updatedWorkflowJson.nodes && Array.isArray(updatedWorkflowJson.nodes)) {
                      const nodeIndex = updatedWorkflowJson.nodes.findIndex((node: any) => node.id === change.nodeId);
                      if (nodeIndex !== -1) {
                        // Update size property directly in the workflow JSON
                        updatedWorkflowJson.nodes[nodeIndex].size = change.newSize;
                        // Also update position if it changed during resize
                        updatedWorkflowJson.nodes[nodeIndex].pos = change.newPosition;
                        console.log(`Updated node ${change.nodeId} size to [${change.newSize[0]}, ${change.newSize[1]}] and position to [${change.newPosition[0]}, ${change.newPosition[1]}]`);
                      } else {
                        console.warn(`Node ${change.nodeId} not found in workflow_json.nodes array for resize`);
                      }
                    }
                  } else if (change.groupId) {
                    // Update group size and position
                    if (updatedWorkflowJson.groups && Array.isArray(updatedWorkflowJson.groups)) {
                      const groupIndex = updatedWorkflowJson.groups.findIndex((group: any) => group.id === change.groupId);
                      if (groupIndex !== -1) {
                        // Update bounding array [x, y, width, height] with new values
                        updatedWorkflowJson.groups[groupIndex].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          change.newSize[0],     // width
                          change.newSize[1]      // height
                        ];
                        console.log(`Updated group ${change.groupId} size to [${change.newSize[0]}, ${change.newSize[1]}] and position to [${change.newPosition[0]}, ${change.newPosition[1]}]`);
                      } else {
                        console.warn(`Group ${change.groupId} not found in workflow_json.groups array for resize`);
                      }
                    } else if (typeof updatedWorkflowJson.groups === 'object') {
                      // Handle object format (alternative format)
                      const groupKey = change.groupId.toString();
                      if (updatedWorkflowJson.groups[groupKey]) {
                        updatedWorkflowJson.groups[groupKey].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          change.newSize[0],     // width
                          change.newSize[1]      // height
                        ];
                        console.log(`Updated group ${change.groupId} (object format) size to [${change.newSize[0]}, ${change.newSize[1]}] and position to [${change.newPosition[0]}, ${change.newPosition[1]}]`);
                      } else {
                        console.warn(`Group ${change.groupId} not found in workflow_json.groups object for resize`);
                      }
                    }

                    // Also update extra.ds.groups if it exists (ComfyUI format)
                    if (updatedWorkflowJson.extra?.ds?.groups && Array.isArray(updatedWorkflowJson.extra.ds.groups)) {
                      const groupIndex = updatedWorkflowJson.extra.ds.groups.findIndex((group: any) => group.id === change.groupId);
                      if (groupIndex !== -1) {
                        updatedWorkflowJson.extra.ds.groups[groupIndex].bounding = [
                          change.newPosition[0], // x
                          change.newPosition[1], // y
                          change.newSize[0],     // width
                          change.newSize[1]      // height
                        ];
                      }
                    }
                  }
                });
              }

              // Update the workflow with modified workflow_json
              const updatedWorkflow = {
                ...workflow!,
                workflow_json: updatedWorkflowJson,
                modifiedAt: new Date()
              };

              // Save updated workflow to IndexedDB
              await updateWorkflow(updatedWorkflow);

              // Update local workflow state
              setWorkflow(updatedWorkflow);

              const totalChanges = (changes.nodeChanges?.length || 0) + (changes.groupChanges?.length || 0) + (changes.resizeChanges?.length || 0);
              console.log(`Repositioning applied successfully: ${changes.nodeChanges?.length || 0} nodes, ${changes.groupChanges?.length || 0} groups, and ${changes.resizeChanges?.length || 0} resize changes updated (${totalChanges} total)`);

              await loadWorkflow();

            } catch (error) {
              console.error('Failed to apply repositioning:', error);
            }
          }
        }}
      />

      {/* Connection Bar (Bottom) */}
      <ConnectionBar
        isVisible={connectionMode.connectionMode.isActive}
        sourceNode={connectionMode.connectionMode.sourceNode}
        targetNode={connectionMode.connectionMode.targetNode}
        onCancel={connectionMode.cancelConnection}
        onClearSource={connectionMode.clearSourceNode}
        onClearTarget={connectionMode.clearTargetNode}
        onProceed={connectionMode.showConnectionModal}
      />

      {/* Connection Modal */}
      <ConnectionModal
        isVisible={connectionMode.connectionMode.showModal}
        sourceNode={connectionMode.connectionMode.sourceNode}
        targetNode={connectionMode.connectionMode.targetNode}
        onClose={connectionMode.clearNodesAndCloseModal}
        onCreateConnection={connectionMode.handleCreateConnection}
      />

      {/* Workflow Controls Panel (Right Top) - Hidden during repositioning and connection mode */}
      {!canvasInteraction.repositionMode.isActive && !connectionMode.connectionMode.isActive && (
        <FloatingControlsPanel
          onRandomizeSeeds={handleRandomizeSeeds}
          onShowGroupModer={() => setIsGroupModeModalOpen(true)}
          onShowWorkflowSnapshots={handleShowWorkflowSnapshots}
          onSearchNode={handleSearchNode}
          onNavigateToNode={canvasInteraction.handleNavigateToNode}
          onSelectNode={setSelectedNode}
          onOpenNodePanel={() => setIsNodePanelVisible(true)}
          nodes={searchableNodes}
          nodeBounds={nodeBounds}
          onZoomFit={canvasInteraction.handleZoomFit}
          onShowWorkflowJson={handleShowWorkflowJson}
          onShowObjectInfo={handleShowObjectInfo}
          onRefreshWorkflow={() => refreshNodeSlots()}
          missingModels={missingModels}
          onOpenMissingModelDetector={() => setIsMissingModelModalOpen(true)}
          repositionMode={{
            isActive: canvasInteraction.repositionMode.isActive
          }}
          onToggleRepositionMode={() => {
            if (canvasInteraction.repositionMode.isActive) {
              // Cancel repositioning mode (restore original positions)
              canvasInteraction.cancelReposition();
            } else {
              // Enter repositioning mode - will activate globally
              // User can then click on any node to select it for repositioning
              canvasInteraction.enterRepositionMode();
            }
          }}
          connectionMode={{
            isActive: connectionMode.connectionMode.isActive
          }}
          onToggleConnectionMode={connectionMode.toggleConnectionMode}
          installablePackageCount={installablePackageCount}
          missingNodesCount={missingWorkflowNodes.length}
          onShowMissingNodeInstaller={() => setIsMissingNodeModalOpen(true)}
        />
      )}


      {/* Selected Node Panel (Now NodeDetailModal) */}
      {isNodePanelVisible && selectedNode && (
        <NodeDetailModal
          selectedNode={selectedNode as any}
          nodeMetadata={nodeMetadata}
          metadataLoading={metadataLoading}
          metadataError={metadataError}
          editingParam={widgetEditor.editingParam}
          editingValue={widgetEditor.editingValue}
          modifiedWidgetValues={widgetEditor.modifiedWidgetValues}
          uploadState={uploadState}
          nodeBounds={nodeBounds as any}
          getWidgetValue={widgetEditor.getWidgetValue}
          getNodeMode={widgetEditor.getNodeMode}
          onClose={() => {
            // Clear image cache for the node when inspector closes
            // as widget values may have changed
            if (selectedNode?.id) {
              const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
              clearNodeImageCache(nodeId);

              // Trigger canvas redraw to reload images
              if (canvasRef.current) {
                canvasRef.current.dispatchEvent(new Event('imageLoaded'));
              }
            }
            setIsNodePanelVisible(false);
            setSelectedNode(null);
          }}
          onStartEditing={widgetEditor.startEditingParam}
          onCancelEditing={widgetEditor.cancelEditingParam}
          onSaveEditing={widgetEditor.saveEditingParam}
          onEditingValueChange={widgetEditor.updateEditingValue}
          onControlAfterGenerateChange={handleControlAfterGenerateChange}
          onFilePreview={fileOperations.handleFilePreview}
          onFileUpload={(nodeId: number, paramName: string) => {
            fileOperations.handleFileUpload(nodeId, paramName, fileInputRef);
          }}
          onFileUploadDirect={fileOperations.handleFileUploadDirect}
          onNodeModeChange={handleNodeModeChange}
          setWidgetValue={widgetEditor.setWidgetValue}
          onNavigateToNode={(nodeId: number) => {
            // Use shared navigation function from useCanvasInteraction
            canvasInteraction.handleNavigateToNode(nodeId);
          }}
          onSelectNode={(node: IComfyGraphNode) => {
            // Select the provided node directly
            setSelectedNode(node);
            setIsNodePanelVisible(true);
          }}
          onCopyNode={handleNodeCopy}
          onNodeColorChange={handleNodeColorChange}
          onNodeDelete={handleNodeDelete}
          onGroupDelete={handleGroupDelete}
          onNodeRefresh={handleNodeRefresh}
          onNodeTitleChange={handleNodeTitleChange}
          onNodeSizeChange={handleNodeSizeChange}
          onNodeCollapseChange={handleNodeCollapseChange}
          onGroupSizeChange={handleGroupSizeChange}
          onDisconnectInput={handleDisconnectInput}
          onDisconnectOutput={handleDisconnectOutput}
        />
      )}

      {/* Workflow Snapshots */}
      <MissingNodeInstallerModal
        isOpen={isMissingNodeModalOpen}
        onClose={() => setIsMissingNodeModalOpen(false)}
        missingNodes={missingWorkflowNodes}
        onInstallationComplete={(queuedCount) => {
          if (queuedCount > 0) {
            setInstallablePackageCount((prev) => Math.max(prev - queuedCount, 0));
          }
        }}
      />
      <MissingModelDetectorModal
        isOpen={isMissingModelModalOpen}
        onClose={() => {
          setIsMissingModelModalOpen(false);
          // Re-detect missing models same as initial load
          if (comfyGraphRef.current) {
            // Use _nodes like in initial load
            const nodes = comfyGraphRef.current._nodes || [];
            const detectedMissingModels = detectMissingModels(nodes);
            setMissingModels(detectedMissingModels);
          }
        }}
        missingModels={missingModels}
        widgetEditor={widgetEditor}
      />
      <WorkflowSnapshots
        isOpen={isWorkflowSnapshotsOpen}
        onClose={() => setIsWorkflowSnapshotsOpen(false)}
        currentWorkflowId={id || ''}
        onSaveSnapshot={handleSaveSnapshot}
        onLoadSnapshot={handleLoadSnapshot}
        serverUrl={serverUrl || 'http://localhost:8188'}
      />

      {/* Group Mode Modal */}
      <GroupModeModal
        isOpen={isGroupModeModalOpen}
        onClose={() => setIsGroupModeModalOpen(false)}
        groups={workflowGroups}
        onGroupModeChange={handleGroupModeChange}
        getCurrentNodeMode={getCurrentNodeMode}
        title={t('workflow.groupModeControl')}
      />


      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={fileOperations.previewModal.isOpen}
        filename={fileOperations.previewModal.filename}
        isImage={fileOperations.previewModal.isImage}
        loading={fileOperations.previewModal.loading}
        error={fileOperations.previewModal.error}
        url={fileOperations.previewModal.url}
        onClose={fileOperations.closePreview}
        onRetry={fileOperations.handleFilePreview}
      />

      {/* JSON Viewer Modal */}
      <JsonViewerModal
        isOpen={isJsonViewerOpen}
        onClose={() => setIsJsonViewerOpen(false)}
        title={jsonViewerData?.title || ''}
        data={jsonViewerData?.data || {}}
      />

      {/* Node Add Modal */}
      <NodeAddModal
        isOpen={canvasInteraction.isNodeAddModalOpen}
        onClose={() => canvasInteraction.setIsNodeAddModalOpen(false)}
        graph={comfyGraphRef.current}
        position={canvasInteraction.nodeAddPosition}
        onNodeAdd={handleAddNode}
      />

      {/* Hidden File Input for Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={fileOperations.handleFileSelect}
      />
      <CircularMenu
        ref={circularMenuRef}
        circularMenuState={circularMenuState}
        setCircularMenuState={setCircularMenuState}
        workflow={workflow}
        onNodeColorChange={handleNodeColorChange}
        onNodeModeChange={handleNodeModeChange}
        onNodeDelete={handleNodeDelete}
        onPanMode={() => {
          setCircularMenuState(prev => ({ ...prev, isOpen: false }));
          toast.info(t('workflow.panModeActive'));
        }}
        onToggleConnectionMode={connectionMode.toggleConnectionMode}
        onEnterConnectionModeWithSource={(nodeId: number) => {
          const node = comfyGraphRef.current?.getNodeById(nodeId);
          if (node) {
            connectionMode.enterConnectionModeWithSource(node);
          }
        }}
        onEnterRepositionMode={(nodeId?: number) => canvasInteraction.enterRepositionMode(nodeId)}
        onCopyNode={handleNodeCopy}
        onNodeCollapseChange={handleNodeCollapseChange}
        onAddNode={handleAddNodeFromMenu}
        onClose={() => setCircularMenuState(prev => ({ ...prev, isOpen: false }))}
      />

      <SimpleConfirmDialog
        isOpen={nodeIdToDelete !== null}
        onClose={() => setNodeIdToDelete(null)}
        onConfirm={confirmNodeDelete}
        title={t('node.deleteConfirmTitle')}
        message={t('node.deleteConfirmMessage')}
        nodeInfo={(() => {
          if (nodeIdToDelete === null) return undefined;
          const node = comfyGraphRef.current?.getNodeById(nodeIdToDelete);
          return node ? `${node.title || node.type}#${node.id}` : `#${nodeIdToDelete}`;
        })()}
        confirmText={t('common.delete')}
        isDestructive={true}
      />
    </div>
  );
  // #endregion UI
};

export default WorkflowEditor;


