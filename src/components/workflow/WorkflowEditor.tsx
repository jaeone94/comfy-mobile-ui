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
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';

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
import { WorkflowSnapshots } from '@/components/workflow/WorkflowSnapshots';
import { QuickActionPanel } from '@/components/controls/QuickActionPanel';
import { FloatingControlsPanel } from '@/components/controls/FloatingControlsPanel';
import { RepositionActionBar } from '@/components/controls/RepositionActionBar';
import { CircularMenu, CircularMenuRef } from '@/components/canvas/CircularMenu';
import { WorkflowContextMenu } from '@/components/canvas/WorkflowContextMenu';
import { ConnectionBar } from '@/components/canvas/ConnectionBar';
import { ConnectionModal } from '@/components/canvas/ConnectionModal';
import { DirectConnectionPanel } from '@/components/canvas/DirectConnectionPanel';
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

import { DEFAULT_CANVAS_CONFIG } from '@/config/canvasConfig';

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
  const {
    setWorkflow: setGlobalWorkflow,
    syncWorkflow,
    updateWorkflowJson,
    sessionStack,
    pushSession,
    popSession,
    jumpToSession,
    updateCurrentSessionValues,
    getSelectedGraph,
    getSelectedSubgraphId
  } = useGlobalStore();

  const currentGraph = getSelectedGraph(); // Get current graph from session stack or workflow

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

  // Metadata
  const [nodeMetadata, setNodeMetadata] = useState<Map<number, INodeWithMetadata>>(new Map());
  const [metadataLoading, setMetadataLoading] = useState<boolean>(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [objectInfo, setObjectInfo] = useState<any>(null);
  const [missingNodeIds, setMissingNodeIds] = useState<Set<number>>(new Set());
  const [missingWorkflowNodes, setMissingWorkflowNodes] = useState<MissingWorkflowNode[]>([]);
  const [isMissingNodeModalOpen, setIsMissingNodeModalOpen] = useState(false);
  const lastFittedSubgraphIdRef = useRef<string | null>(null);
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
  const [renderTrigger, setRenderTrigger] = useState(0); // State to force re-renders

  // Force re-render utility (moved up for hoisting)
  const forceRender = useCallback(() => {
    setRenderTrigger(prev => prev + 1);
  }, []);
  const [nodeIdToDelete, setNodeIdToDelete] = useState<number | null>(null);

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false); // Internal state for DropdownMenu component sync


  // Circular Menu State (For Touch)
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

  // Context Menu State (For Mouse)
  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    context: 'CANVAS' | 'NODE';
    nodeId: number | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    context: 'CANVAS',
    nodeId: null,
  });

  // Connection state
  const { url: serverUrl, isConnected } = useConnectionStore();

  // Get groups with mapped nodes
  const workflowGroups = useMemo((): Group[] => {
    if (!currentGraph?._groups || !currentGraph?._nodes) {
      return [];
    }
    return mapGroupsWithNodes(currentGraph._groups, currentGraph._nodes);
  }, [currentGraph?._groups, currentGraph?._nodes]);

  // Get searchable nodes for advanced search
  const searchableNodes = useMemo(() => {
    if (!currentGraph?._nodes) {
      return [];
    }
    return currentGraph._nodes.map((node: any) => ({
      id: node.id,
      type: node.type,
      title: node.title
    }));
  }, [currentGraph?._nodes]);

  // #region Hooks

  // Workflow storage hook
  const workflowStorage = useWorkflowStorage();

  // Current prompt tracking
  const currentPromptIdRef = useRef<string | null>(null);

  // Widget value editor hook
  const widgetEditor = useWidgetValueEditor();

  // Sync comfyGraphRef and WidgetEditor with current session
  useEffect(() => {
    comfyGraphRef.current = currentGraph;

    // Recalculate and update bounds for the new graph (Main or Subgraph)
    // This ensures the renderer draws the correct nodes/groups for the active session
    if (currentGraph && currentGraph._nodes) {
      const { nodeBounds: newBounds, groupBounds: newGroupBounds } = calculateAllBounds(
        currentGraph._nodes,
        currentGraph._groups,
        DEFAULT_CANVAS_CONFIG
      );
      setNodeBounds(newBounds);
      setGroupBounds(newGroupBounds);
    }

    // Update widget editor state from current session
    const currentSession = sessionStack[sessionStack.length - 1];
    if (currentSession) {
      // Only update if we are essentially initializing or switching contexts

      // We perform this sync ONLY if the graph reference changed.
      // Since this effect depends on [currentGraph], it runs when graph ref changes.

      widgetEditor.setModifiedWidgetValues(currentSession.modifiedWidgetValues);

      // Force render to update canvas with new graph
      setCanvasUpdateTrigger(prev => prev + 1);
      // setRenderTrigger(prev => prev + 1); // Removed to prevent infinite loop (renderTrigger is a dependency)
    }
  }, [currentGraph, renderTrigger]); // CRITICAL: Added renderTrigger for no-reload updates

  // Sync back to store when widget values change
  useEffect(() => {
    updateCurrentSessionValues(widgetEditor.modifiedWidgetValues);
  }, [widgetEditor.modifiedWidgetValues, updateCurrentSessionValues]);

  // Handle Enter Subgraph
  const handleEnterSubgraph = useCallback(async (nodeType: string, title: string) => {
    // 🔍 1. Resolve Definition: Search session stack from top to bottom for the most recent definition
    let subgraphDef: any = null;
    const state = useGlobalStore.getState();

    // Search from most recent session's graph back to root
    for (let i = state.sessionStack.length - 1; i >= 0; i--) {
      const sessionGraph = state.sessionStack[i].graph;
      if (sessionGraph && sessionGraph.subgraphs?.has(nodeType)) {
        subgraphDef = sessionGraph.subgraphs.get(nodeType);
        break;
      }
    }

    // Fallback to latest workflow_json if not found in graphs
    if (!subgraphDef) {
      const latestWorkflow = state.workflow || workflow;
      if (latestWorkflow?.workflow_json) {
        const json = latestWorkflow.workflow_json as any;
        const definitions = json.definitions;
        if (definitions && definitions.subgraphs) {
          if (Array.isArray(definitions.subgraphs)) {
            subgraphDef = definitions.subgraphs.find((s: any) => s.id === nodeType || s.name === nodeType);
          } else {
            subgraphDef = definitions.subgraphs[nodeType];
          }
        }
        if (!subgraphDef && Array.isArray(json.subgraphs)) {
          subgraphDef = json.subgraphs.find((s: any) => s.id === nodeType || s.name === nodeType);
        }
      }
    }

    if (subgraphDef) {
      // Create new ComfyGraph instance
      const newGraph = new ComfyGraph();
      if (objectInfo) {
        newGraph.setMetadata(objectInfo);
      }

      // 🔗 IMPORTANT: Propagate ALL known subgraph definitions to the new graph
      // This allows the new graph to correctly identify its OWN nested subgraph nodes
      const allKnownSubgraphs = new Map<string, any>();

      // Collect from root JSON first
      const rootJson = state.workflow?.workflow_json as any;
      if (rootJson) {
        const rootDefs = rootJson.definitions?.subgraphs || rootJson.subgraphs;
        if (Array.isArray(rootDefs)) {
          rootDefs.forEach(d => allKnownSubgraphs.set(d.id || d.name, d));
        } else if (typeof rootDefs === 'object') {
          Object.entries(rootDefs).forEach(([k, d]) => allKnownSubgraphs.set(k, d));
        }
      }

      // Override with definitions from the session stack (more recent)
      state.sessionStack.forEach(session => {
        if (session.graph?.subgraphs) {
          session.graph.subgraphs.forEach((def, key) => {
            allKnownSubgraphs.set(key, def);
          });
        }
      });

      // Set collected subgraphs to the new graph
      newGraph.subgraphs = allKnownSubgraphs;
      newGraph.name = subgraphDef.name || title;
      newGraph.id = subgraphDef.id || nodeType;

      // Ensure nodes property exists
      if (!subgraphDef.nodes) subgraphDef.nodes = [];
      if (!subgraphDef.links) subgraphDef.links = [];
      if (!subgraphDef.groups) subgraphDef.groups = [];

      // Configure it with subgraph data
      const graphData: IComfyJson = {
        id: newGraph.id,
        name: newGraph.name,
        nodes: subgraphDef.nodes,
        links: subgraphDef.links,
        groups: subgraphDef.groups,
        subgraphs: Array.from(allKnownSubgraphs.values()), // 🔗 Pass ALL known subgraphs to configure for nested recognition
        config: {},
        extra: {},
        version: 0.4
      } as any;

      await newGraph.configure(graphData);

      // Verify and find/inject virtual GraphInput/GraphOutput nodes
      const inputNode = newGraph._nodes.find(n => n.type === 'GraphInput');
      const outputNode = newGraph._nodes.find(n => n.type === 'GraphOutput');

      const inputId = inputNode ? inputNode.id : -10;
      const outputId = outputNode ? outputNode.id : -20;

      if (!inputNode) {
        // Inject virtual GraphInput node if missing
        const inputBounding = subgraphDef.inputNode?.bounding;
        const pos = inputBounding ? [inputBounding[0], inputBounding[1]] : [-300, 200];
        const size = inputBounding ? [inputBounding[2], inputBounding[3]] : [200, 300];

        newGraph._nodes.push({
          id: inputId,
          type: 'GraphInput',
          title: 'Input',
          pos: pos,
          size: size,
          flags: {},
          inputs: [],
          outputs: subgraphDef.inputs?.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            links: input.linkIds || [],
            slot_index: index
          })) || [],
          mode: 0,
        } as any);
      } else {
        // Sync slots for existing input node
        inputNode.outputs = subgraphDef.inputs?.map((input: any, index: number) => ({
          name: input.name,
          type: input.type,
          links: input.linkIds || [],
          slot_index: index
        })) || [];
      }

      if (!outputNode) {
        // Inject virtual GraphOutput node if missing
        const outputBounding = subgraphDef.outputNode?.bounding;
        const pos = outputBounding ? [outputBounding[0], outputBounding[1]] : [1200, 200];
        const size = outputBounding ? [outputBounding[2], outputBounding[3]] : [200, 300];

        newGraph._nodes.push({
          id: outputId,
          type: 'GraphOutput',
          title: 'Output',
          pos: pos,
          size: size,
          flags: {},
          inputs: subgraphDef.outputs?.map((output: any, index: number) => ({
            name: output.name,
            type: output.type,
            link: output.linkIds?.[0] || null,
            slot_index: index
          })) || [],
          outputs: [],
          mode: 0,
        } as any);
      } else {
        // Sync slots for existing output node
        outputNode.inputs = subgraphDef.outputs?.map((output: any, index: number) => ({
          name: output.name,
          type: output.type,
          link: output.linkIds?.[0] || null,
          slot_index: index
        })) || [];
      }

      // 🔗 3b. Subgraph Link Normalization
      // Force all internal links to point to the correct virtual node slots
      subgraphDef.inputs?.forEach((input: any, index: number) => {
        input.linkIds?.forEach((linkId: number) => {
          const link = newGraph._links[linkId];
          if (link) {
            link.origin_id = inputId;
            link.origin_slot = index;
          }
        });
      });

      subgraphDef.outputs?.forEach((output: any, index: number) => {
        output.linkIds?.forEach((linkId: number) => {
          const link = newGraph._links[linkId];
          if (link) {
            link.target_id = outputId;
            link.target_slot = index;
          }
        });
      });

      // Push to stack
      pushSession({
        graph: newGraph,
        modifiedWidgetValues: new Map(),
        subgraphId: nodeType,
        title: title
      });

      toast.success(`Entered subgraph: ${title}`);
    } else {
      // If not found in JSON, fallback to comfyGraphRef (legacy fallback)
      const defs = comfyGraphRef.current?.subgraphs;
      const legacyDef = defs?.get(nodeType);

      if (legacyDef) {
        console.warn("Subgraph found in Graph but NOT in JSON. Using legacy fallback.");
        // ... (Same logic for legacy if desired, but for now just error to force JSON structure correctness)
        toast.error("Subgraph definition desync - Please reload workflow");
      } else {
        toast.error("Subgraph definition not found");
      }
    }
  }, [pushSession, workflow]);
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
      const currentGraph = comfyGraphRef.current; // Use ref instead of state for latest graph

      if (!currentWorkflowJson || !currentGraph) {
        return;
      }

      // Use ConnectionService to create the connection
      // Note: createConnection usually returns a new graph or mutated copy.
      // We need to verify if it mutates in place or returns new. 
      // Assuming it returns updated structures.
      const { updatedWorkflowJson, updatedGraph, newLinkId } = ConnectionService.createConnection(
        currentWorkflowJson,
        currentGraph,
        sourceNodeId,
        targetNodeId,
        sourceSlot,
        targetSlot
      );

      // Update refs immediately
      comfyGraphRef.current = updatedGraph;

      // Update nodeBounds with new node references (crucial for CanvasRenderer to see updated slots)
      setNodeBounds(prev => {
        const newMap = new Map(prev);
        // Update source node ref
        const newSourceNode = updatedGraph._nodes.find((n: any) => n.id === sourceNodeId);
        if (newSourceNode && newMap.has(sourceNodeId)) {
          newMap.set(sourceNodeId, { ...newMap.get(sourceNodeId)!, node: newSourceNode });
        }
        // Update target node ref
        const newTargetNode = updatedGraph._nodes.find((n: any) => n.id === targetNodeId);
        if (newTargetNode && newMap.has(targetNodeId)) {
          newMap.set(targetNodeId, { ...newMap.get(targetNodeId)!, node: newTargetNode });
        }
        return newMap;
      });

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

      // CRITICAL: Use syncWorkflow instead of loadWorkflow(true) to avoid flicker
      syncWorkflow(updatedWorkflow);

      // Force render 
      forceRender();

      // Viewport Hack: Trigger canvas redraw by imperceptibly changing viewport
      // This forces the CanvasRenderer to re-evaluate the graph immediately
      setViewport(prev => ({ ...prev, scale: prev.scale + 0.00001 }));
      setTimeout(() => {
        setViewport(prev => ({ ...prev, scale: prev.scale - 0.00001 }));
      }, 10);

      // Play sound or feedback?
      // toast.success("Connected"); 

    } catch (error) {
      console.error('Error creating connection:', error);
    }
  }, [id, workflow, syncWorkflow, forceRender]);

  // Connection mode hook
  const connectionMode = useConnectionMode({
    workflow,
    onCreateConnection: handleCreateConnection
  });

  // Handle batch connection application from DirectConnectionPanel
  const handleApplyBatchConnections = useCallback(async (updates: {
    toAdd: { sourceNodeId: number, targetNodeId: number, sourceSlot: number, targetSlot: number }[],
    toRemove: number[]
  }) => {
    if (!id || !workflow || !comfyGraphRef.current) return;

    try {
      const { updatedWorkflowJson, updatedGraph } = ConnectionService.applyBatchConnections(
        workflow.workflow_json,
        comfyGraphRef.current,
        updates
      );

      // Same update logic as handleCreateConnection but for multiple changes
      comfyGraphRef.current = updatedGraph;

      // Update nodeBounds for all affected nodes
      setNodeBounds(prev => {
        const newMap = new Map(prev);
        updatedGraph._nodes.forEach((node: any) => {
          if (newMap.has(node.id)) {
            newMap.set(node.id, { ...newMap.get(node.id)!, node });
          }
        });
        return newMap;
      });

      const updatedWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        graph: updatedGraph,
        modifiedAt: new Date()
      };

      await updateWorkflow(updatedWorkflow);
      setWorkflow(updatedWorkflow);
      syncWorkflow(updatedWorkflow);

      // Cleanup connection mode state
      connectionMode.clearNodesAndCloseModal();

      forceRender();

      // Flash viewport to force refresh connections
      setViewport(prev => ({ ...prev, scale: prev.scale + 0.00001 }));
      setTimeout(() => setViewport(prev => ({ ...prev, scale: prev.scale - 0.00001 })), 20);

      toast.success(t('workflow.connectionBatchApplied'));
    } catch (error) {
      console.error('Error applying batch connections:', error);
      toast.error(t('workflow.connectionBatchFailed'));
    }
  }, [id, workflow, connectionMode, syncWorkflow, forceRender, t]);

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
    // Context Menu Callbacks (Mouse)
    onNodeContextMenu: (node: any, position: { x: number; y: number }) => {
      setContextMenuState({
        isOpen: true,
        x: position.x,
        y: position.y,
        context: 'NODE',
        nodeId: typeof node.id === 'string' ? parseInt(node.id) : node.id
      });
    },
    onCanvasContextMenu: (worldPos: { x: number; y: number }, screenPos?: { x: number; y: number }) => {
      if (screenPos) {
        setContextMenuState({
          isOpen: true,
          x: screenPos.x,
          y: screenPos.y,
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

  // Normalize subgraph definitions to Map for consistent access
  const subgraphDefinitionsMap = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Start with definitions from root JSON
    const rawDefs = (workflow?.workflow_json as any)?.extra_info?.extra_pnginfo?.workflow?.subgraphs ||
      (workflow?.workflow_json as any)?.subgraphs ||
      (workflow?.workflow_json as any)?.definitions?.subgraphs;

    if (rawDefs) {
      if (Array.isArray(rawDefs)) {
        rawDefs.forEach((def: any) => {
          if (def && (def.id || def.name)) {
            map.set(def.id || def.name, def);
          }
        });
      } else if (typeof rawDefs === 'object') {
        Object.entries(rawDefs).forEach(([key, def]: [string, any]) => {
          map.set(key, def);
        });
      }
    }

    // 2. Override with definitions from the current session stack (more recent)
    // This is crucial for nested subgraphs where internal changes haven't reached root JSON yet
    sessionStack.forEach(session => {
      if (session.graph?.subgraphs) {
        session.graph.subgraphs.forEach((def, key) => {
          map.set(key, def);
        });
      }
    });

    return map;
  }, [workflow?.workflow_json, sessionStack]);

  // Canvas renderer hook
  useCanvasRenderer({
    canvasRef,
    containerRef,
    // Pass a derived workflow object that uses currentGraph (from session stack)
    // This ensures the renderer shows the correct graph (root or subgraph)
    workflow: useMemo(() => {
      if (!workflow || !currentGraph) return workflow;

      // Map ComfyGraph links (Object) to array format expected by renderer
      const linksArray = currentGraph._links
        ? (Array.isArray(currentGraph._links)
          ? currentGraph._links
          : Object.values(currentGraph._links))
        : [];

      return {
        ...workflow,
        graph: {
          ...workflow.graph,
          _nodes: currentGraph._nodes || [],
          _links: linksArray.reduce((acc: any, link: any) => {
            // Map back to Record<number, any> if needed by renderer or just pass array if supported
            // The renderer likely expects the format we initialized with.
            // Let's stick to the structure we saw in loadWorkflow:
            // Record<number, LinkData>
            if (link && link.id) acc[link.id] = link;
            return acc;
          }, {}),
          // ... group mapping omitted for brevity if unchanged ...
          _groups: currentGraph._groups || []
        }
      } as any;
    }, [workflow, currentGraph]),
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
    longPressState: canvasInteraction.longPressState,
    subgraphDefinitions: subgraphDefinitionsMap
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

  // Load node metadata when connection is established (recovers from direct refresh load skip)
  useEffect(() => {
    if (isConnected && workflow?.graph?._nodes && nodeMetadata.size === 0 && !metadataLoading) {
      console.log('Connection established, loading node metadata...');
      loadNodeMetadata(workflow.graph._nodes);
    }
  }, [isConnected, workflow?.graph?._nodes, nodeMetadata.size, metadataLoading]);

  // #endregion useEffects

  // #region workflow storage actions
  // Load workflow from storage
  const loadWorkflow = async (isReload: boolean = false) => {
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
      // Pass the instantiated graph so session stack works with class methods (serialize etc)
      if (isReload) {
        syncWorkflow(workflow);
      } else {
        setGlobalWorkflow(workflow, graph);
      }

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

      // Use ROOT Graph instance for serialization to prevent overwriting main workflow with subgraph
      // We must always save the entire project structure from the root
      const rootSession = sessionStack[0];
      const rootGraph = rootSession?.graph || comfyGraphRef.current;

      if (!rootGraph) {
        throw new Error('No Root Graph instance available');
      }

      // Apply changes to CURRENT Graph (which might be a subgraph)
      // The changes made to the subgraph object will be reflected in the root graph 
      // because subgraphs are referenced within the root graph structure
      const currentGraph = comfyGraphRef.current;
      const modifiedValues = widgetEditor.modifiedWidgetValues;

      // createModifiedGraph returns a copy, so we need to apply changes directly to the original Graph
      if (modifiedValues.size > 0 && currentGraph) {

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

      // serialize ROOT graph
      const serializedData = rootGraph.serialize();

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
  }, [workflow, t]);

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

  // Auto-fit ONLY on session transitions (initial load, enter subgraph, exit subgraph)
  const currentSubgraphId = getSelectedSubgraphId();
  useEffect(() => {
    // Only attempt fit if we have nodes and canvas interaction is ready
    if (nodeBounds.size > 0 && canvasRef.current && canvasInteraction) {
      // Check if this graph has already been fitted in this session instance
      if (currentSubgraphId !== lastFittedSubgraphIdRef.current) {
        // Small delay to ensure canvas is properly sized and nodes are laid out
        const timer = setTimeout(() => {
          canvasInteraction.handleZoomFit();
          lastFittedSubgraphIdRef.current = currentSubgraphId;
        }, 300);
        return () => clearTimeout(timer);
      }
    }
    // Dependency on nodeBounds is required to wait for initial results, 
    // but the ref check prevents re-triggering on node movement.
  }, [nodeBounds, currentSubgraphId, canvasInteraction]);

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

  /**
   * Helper function to find and update a node in the correct session (root or subgraph)
   */
  const updateNodeInWorkflow = useCallback((workflowJson: IComfyJson, nodeId: number, updateFn: (node: any) => any): IComfyJson => {
    const currentSubgraphId = getSelectedSubgraphId();
    const isRoot = !currentSubgraphId || currentSubgraphId === id;

    // PERFORM DEEP COPY to ensure absolute immutability
    const updatedWorkflow = JSON.parse(JSON.stringify(workflowJson));

    if (isRoot) {
      if (updatedWorkflow.nodes) {
        updatedWorkflow.nodes = updatedWorkflow.nodes.map((node: any) =>
          node.id === nodeId ? updateFn(node) : node
        );
      }
    } else {
      // Find the subgraph definition
      let subgraphs = updatedWorkflow.subgraphs;
      let usingDefinitions = false;
      if (updatedWorkflow.definitions?.subgraphs) {
        subgraphs = updatedWorkflow.definitions.subgraphs;
        usingDefinitions = true;
      }

      if (Array.isArray(subgraphs)) {
        const subgraph = subgraphs.find((s: any) => s.id === currentSubgraphId);
        if (subgraph && subgraph.nodes) {
          subgraph.nodes = subgraph.nodes.map((node: any) =>
            node.id === nodeId ? updateFn(node) : node
          );
        }
      }
    }

    return updatedWorkflow;
  }, [id, getSelectedSubgraphId]);

  /**
   * Helper to apply bulk repositioning changes to the correct session in workflow_json
   */
  const applyRepositioningToSession = useCallback((workflowJson: IComfyJson, changes: any): IComfyJson => {
    const currentSubgraphId = getSelectedSubgraphId();
    const isRoot = !currentSubgraphId || currentSubgraphId === id;

    // Deep copy
    const updatedWorkflow = JSON.parse(JSON.stringify(workflowJson));

    // Determine targeting container
    let container: any = updatedWorkflow;
    if (!isRoot) {
      let subgraphs = updatedWorkflow.subgraphs;
      if (updatedWorkflow.definitions?.subgraphs) {
        subgraphs = updatedWorkflow.definitions.subgraphs;
      }

      if (Array.isArray(subgraphs)) {
        container = subgraphs.find((s: any) => s.id === currentSubgraphId);
      }
    }

    if (!container) return updatedWorkflow;

    // 1. Update node positions
    if (changes.nodeChanges && Array.isArray(container.nodes)) {
      changes.nodeChanges.forEach((change: any) => {
        const node = container.nodes.find((n: any) => n.id == change.nodeId);
        if (node) {
          node.pos = change.newPosition;
        }
      });
    }

    // 2. Update group positions
    if (changes.groupChanges) {
      const updateGroup = (group: any, change: any) => {
        if (group && Array.isArray(group.bounding) && group.bounding.length >= 4) {
          group.bounding[0] = change.newPosition[0];
          group.bounding[1] = change.newPosition[1];
        }
      };

      if (Array.isArray(container.groups)) {
        changes.groupChanges.forEach((change: any) => {
          const group = container.groups.find((g: any) => g.id == change.groupId);
          updateGroup(group, change);
        });
      } else if (container.groups && typeof container.groups === 'object') {
        changes.groupChanges.forEach((change: any) => {
          updateGroup(container.groups[change.groupId.toString()], change);
        });
      }

      // Also update extra.ds.groups if in root
      if (isRoot && updatedWorkflow.extra?.ds?.groups && Array.isArray(updatedWorkflow.extra.ds.groups)) {
        changes.groupChanges.forEach((change: any) => {
          const group = updatedWorkflow.extra.ds.groups.find((g: any) => g.id == change.groupId);
          updateGroup(group, change);
        });
      }
    }

    // 3. Update resize changes
    if (changes.resizeChanges) {
      changes.resizeChanges.forEach((change: any) => {
        if (change.nodeId !== undefined && change.nodeId !== null && Array.isArray(container.nodes)) {
          const node = container.nodes.find((n: any) => n.id == change.nodeId);
          if (node) {
            node.size = change.newSize;
            node.pos = change.newPosition;
          }
        } else if (change.groupId !== undefined && change.groupId !== null) {
          const updateGroupResize = (group: any) => {
            if (group) {
              group.bounding = [
                change.newPosition[0],
                change.newPosition[1],
                change.newSize[0],
                change.newSize[1]
              ];
            }
          };

          if (Array.isArray(container.groups)) {
            updateGroupResize(container.groups.find((g: any) => g.id == change.groupId));
          } else if (container.groups && typeof container.groups === 'object') {
            updateGroupResize(container.groups[change.groupId.toString()]);
          }

          if (isRoot && updatedWorkflow.extra?.ds?.groups && Array.isArray(updatedWorkflow.extra.ds.groups)) {
            updateGroupResize(updatedWorkflow.extra.ds.groups.find((g: any) => g.id == change.groupId));
          }
        }
      });
    }

    return updatedWorkflow;
  }, [id, getSelectedSubgraphId]);

  // Handle add node - add new node to workflow_json and reload
  const handleAddNode = useCallback(async (nodeType: string, nodeMetadata: any, position: { worldX: number; worldY: number }, initialValues?: Record<string, any>, size?: number[], title?: string) => {
    if (!workflow) {
      toast.error(t('workflow.snapshotLoadFailed')); // Or a more specific error
      return;
    }

    try {
      // Get current workflow_json
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      if (!latestWorkflow?.workflow_json) {
        console.warn('No workflow_json available for adding node');
        return;
      }
      const currentWorkflowJson = latestWorkflow.workflow_json;

      const currentSubgraphId = getSelectedSubgraphId();
      const isRoot = !currentSubgraphId || currentSubgraphId === id;

      let updatedWorkflowJson = JSON.parse(JSON.stringify(currentWorkflowJson)); // Deep copy to ensure no reference issues
      let updatedSubgraphRes: any = null;

      // CRITICAL: Always use the ref to get the live graph, preventing stale closure issues
      const currentGraph = comfyGraphRef.current;

      if (isRoot) {
        // Root addition
        updatedWorkflowJson = addNodeToWorkflow(
          currentWorkflowJson,
          nodeType,
          [position.worldX, position.worldY],
          nodeMetadata,
          initialValues,
          size,
          title
        );
      } else {
        // Subgraph addition: deep copy to update definition
        updatedWorkflowJson = JSON.parse(JSON.stringify(currentWorkflowJson));

        let subgraphs = updatedWorkflowJson.subgraphs;
        let usingDefinitions = false;
        if (updatedWorkflowJson.definitions?.subgraphs) {
          subgraphs = updatedWorkflowJson.definitions.subgraphs;
          usingDefinitions = true;
        }

        if (Array.isArray(subgraphs)) {
          const subgraphIdx = subgraphs.findIndex((s: any) => s.id === currentSubgraphId);
          if (subgraphIdx !== -1) {
            const subgraph = subgraphs[subgraphIdx];

            // Map subgraph-specific lastNodeId if available, otherwise let it fallback to Math.max(nodes)
            const subgraphProxy = {
              ...subgraph,
              last_node_id: subgraph.state?.lastNodeId
            } as any;

            updatedSubgraphRes = addNodeToWorkflow(
              subgraphProxy,
              nodeType,
              [position.worldX, position.worldY],
              nodeMetadata,
              initialValues,
              size,
              title
            );

            // Update subgraph in collection
            subgraphs[subgraphIdx].nodes = updatedSubgraphRes.nodes;

            // Sync back the local last_node_id to the subgraph's state
            // Ensure state object exists if it's the first node
            if (!subgraphs[subgraphIdx].state) {
              subgraphs[subgraphIdx].state = { lastNodeId: updatedSubgraphRes.last_node_id };
            } else {
              subgraphs[subgraphIdx].state.lastNodeId = updatedSubgraphRes.last_node_id;
            }

            // Merge metadata if present
            if (updatedSubgraphRes.mobile_ui_metadata?.control_after_generate) {
              if (!updatedWorkflowJson.mobile_ui_metadata) {
                updatedWorkflowJson.mobile_ui_metadata = updatedSubgraphRes.mobile_ui_metadata;
              } else {
                updatedWorkflowJson.mobile_ui_metadata.control_after_generate = {
                  ...updatedWorkflowJson.mobile_ui_metadata.control_after_generate,
                  ...updatedSubgraphRes.mobile_ui_metadata.control_after_generate
                };
              }
            }
          } else {
            // Fallback if subgraph not found in either location
            updatedWorkflowJson = addNodeToWorkflow(currentWorkflowJson, nodeType, [position.worldX, position.worldY], nodeMetadata, initialValues, size, title);
          }
        } else {
          updatedWorkflowJson = addNodeToWorkflow(currentWorkflowJson, nodeType, [position.worldX, position.worldY], nodeMetadata, initialValues, size, title);
        }
      }

      // Update the workflow with new workflow_json
      const updatedWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        nodeCount: updatedWorkflowJson.nodes?.length || 0,
        modifiedAt: new Date()
      };

      // Save updated workflow to IndexedDB
      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // NO-RELOAD OPTIMIZATION: Manually update graph and bounds
      // 1. Identify the new node
      const newNodeId = updatedSubgraphRes ? updatedSubgraphRes.last_node_id : updatedWorkflowJson.last_node_id;

      // Find node data in the relevant source (root vs subgraph)
      let newNodeData: any;
      if (isRoot) {
        newNodeData = updatedWorkflowJson.nodes.find((n: { id: any; }) => n.id === newNodeId);
      } else if (updatedSubgraphRes?.nodes) {
        newNodeData = updatedSubgraphRes.nodes.find((n: IComfyGraphNode) => n.id === newNodeId);
        // Fallback: If ID lookup fails (rare ID mismatch), take the last node if count matches
        if (!newNodeData && updatedSubgraphRes.nodes.length > 0) {
          console.warn('handleAddNode: ID lookup failed, using last node in subgraph result');
          newNodeData = updatedSubgraphRes.nodes[updatedSubgraphRes.nodes.length - 1];
        }
      }

      if (newNodeData && currentGraph) {
        // 2. Create ComfyGraphNode instance
        const newNode = new ComfyGraphNode(newNodeId, nodeType, newNodeData);

        // FIX: Force widget initialization for new nodes to prevent visible "hollow" state
        if (typeof (newNode as any).initializeWidgets === 'function') {
          // We might not have updatedWorkflowJson in scope with the correct metadata if it was modified in subgraph
          // But 'updatedWorkflow' has the latest workflow_json.mobile_ui_metadata
          // Actually 'updatedWorkflowJson' in this scope IS the latest for this operation.
          // However, mobile_ui_metadata is at the root of workflow_json.
          const metadata = updatedWorkflowJson.mobile_ui_metadata ||
            (workflow?.workflow_json?.mobile_ui_metadata);

          (newNode as any).initializeWidgets(
            initialValues || newNodeData.widgets_values || [], // Use initial values or node's default widget values
            nodeMetadata,
            metadata
          );
        }

        // 3. Add to live graph
        currentGraph._nodes.push(newNode);
        // Sync graph last_node_id
        currentGraph.last_node_id = newNodeId;

        // 4. Update bounds
        setNodeBounds(prev => {
          const newMap = new Map(prev);
          const isCollapsed = newNodeData.flags?.collapsed === true;
          newMap.set(newNodeId, {
            x: newNodeData.pos[0],
            y: newNodeData.pos[1],
            width: isCollapsed ? 80 : (newNodeData.size[0] || 200),
            height: isCollapsed ? 30 : (newNodeData.size[1] || 100),
            node: newNodeData
          });
          return newMap;
        });

        // 5. Update nodeMetadata Map for immediate UI feedback (category badge etc)
        // Note: nodeMetadata (arg) is the type-level objectInfo from the server
        setNodeMetadata(prev => {
          const newMap = new Map(prev);
          const newNodeMetadataEntry: INodeWithMetadata = {
            nodeId: Number(newNodeId),
            nodeType: nodeType,
            displayName: title || nodeMetadata.display_name || nodeType,
            category: nodeMetadata.category || 'Unknown',
            inputParameters: [],
            widgetParameters: (newNode as any).widgets?.map((w: any) => ({
              name: w.name,
              type: w.type || 'STRING',
              config: w.options || {},
              required: false,
              value: w.value
            })) || [],
            parameters: [],
            outputs: []
          };
          newMap.set(Number(newNodeId), newNodeMetadataEntry);
          return newMap;
        });
      }

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Force render
      forceRender();

      toast.success(t('workflow.nodeAdded', { type: nodeMetadata.display_name || nodeType }));
    } catch (error) {
      console.error('Failed to add node:', error);
      toast.error(t('workflow.nodeAddFailed'));
    }
  }, [id, workflow, handleEnterSubgraph]);

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

  const handleNodeModeChange = useCallback(async (nodeId: number, mode: number) => {
    if (!workflow || !currentGraph) return;

    try {
      console.log('Updating node mode:', { nodeId, mode });

      // Find the node in the CURRENT graph session
      const node = currentGraph.getNodeById(nodeId);
      if (!node) {
        console.error('Node not found in current session:', nodeId);
        return;
      }

      // Update the node's mode immediately for real-time canvas update
      node.mode = mode;

      // Update workflow_json for persistence
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for update');
        return;
      }

      const updatedWorkflowJson = updateNodeInWorkflow(currentWorkflowJson, nodeId, (node: any) => ({
        ...node,
        mode: mode
      }));

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow: IComfyWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      setWorkflow(updatedWorkflow);

      // Save to backend
      await updateWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering with new mode
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
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

      console.log('Node mode updated successfully in session');
    } catch (error) {
      console.error('Failed to update node mode:', error);
      toast.error(t('workflow.modeUpdateFailed'));
    }
  }, [workflow, currentGraph, syncWorkflow, selectedNode, t]);

  const handleNodeModeChangeBatch = useCallback(async (modifications: { nodeId: number, mode: number }[]) => {
    if (!workflow || !currentGraph) return;

    try {
      console.log('Updating node mode batch:', modifications);

      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for batch update');
        return;
      }

      // Clone current JSON once for efficient batch updates
      const updatedWorkflowJson: IComfyJson = JSON.parse(JSON.stringify(currentWorkflowJson));
      const nodes = updatedWorkflowJson.nodes || [];

      // 1. Apply updates to Live Graph and cloned JSON
      const affectedNodeIds = new Set<number>();

      for (const { nodeId, mode } of modifications) {
        // Live Graph Update
        const node = currentGraph.getNodeById(nodeId);
        if (node) {
          node.mode = mode;
          affectedNodeIds.add(nodeId);
        }

        // JSON Update
        const jsonNodeIndex = nodes.findIndex((n: any) => n.id === nodeId);
        if (jsonNodeIndex >= 0) {
          nodes[jsonNodeIndex] = {
            ...nodes[jsonNodeIndex],
            mode: mode
          };
        }
      }

      // Update local workflow state immediately
      const updatedWorkflow: IComfyWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      setWorkflow(updatedWorkflow);

      // Save to backend
      await updateWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        for (const nodeId of affectedNodeIds) {
          const existingBounds = newBounds.get(nodeId);
          const node = currentGraph.getNodeById(nodeId);
          if (existingBounds && node) {
            newBounds.set(nodeId, {
              ...existingBounds,
              node: node as any
            });
          }
        }
        return newBounds;
      });

      // Update selected node if it was affected
      const selectedNodeId = selectedNode ? (typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : (selectedNode.id as number)) : null;
      if (selectedNodeId !== null && affectedNodeIds.has(selectedNodeId)) {
        const updatedNode = currentGraph.getNodeById(selectedNodeId);
        if (updatedNode) setSelectedNode(updatedNode as any);
      }

      console.log('Batch node mode updated successfully in session');
    } catch (error) {
      console.error('Failed to update batch node mode:', error);
      toast.error(t('workflow.modeUpdateFailed'));
    }
  }, [workflow, currentGraph, syncWorkflow, selectedNode, t]);


  // Handle group mode change
  const handleGroupModeChange = useCallback(async (groupId: number, mode: NodeMode) => {
    const group = workflowGroups.find(g => g.id === groupId);
    if (!group) return;

    const modifications = group.nodeIds.map(nodeId => ({
      nodeId,
      mode
    }));

    await handleNodeModeChangeBatch(modifications);

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
  }, [workflowGroups, handleNodeModeChangeBatch, t]);

  const handleNodeColorChange = async (nodeId: number, bgcolor: string) => {
    // Update node bgcolor in both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !currentGraph) {
      console.warn('No workflow_json or currentGraph available');
      return;
    }

    try {
      // 1. Update ComfyGraph node immediately (for instant visual feedback)
      const comfyNode = currentGraph.getNodeById(nodeId);
      if (comfyNode) {
        if (bgcolor === '') {
          delete comfyNode.bgcolor;
        } else {
          comfyNode.bgcolor = bgcolor;
        }
        console.log(`Updated ComfyGraph node ${nodeId} bgcolor immediately in session:`, {
          nodeId,
          newBgcolor: bgcolor === '' ? 'cleared' : bgcolor
        });

        // Update selectedNode state if it's the same node for UI refresh
        if (selectedNode && selectedNode.id === nodeId) {
          if (bgcolor === '') {
            delete (selectedNode as any).bgcolor;
          } else {
            (selectedNode as any).bgcolor = bgcolor;
          }
        }
      }

      // 2. Update workflow_json for persistence
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for update');
        return;
      }

      const updatedWorkflowJson = updateNodeInWorkflow(currentWorkflowJson, nodeId, (node: any) => ({
        ...node,
        bgcolor: bgcolor === '' ? undefined : bgcolor
      }));

      // Create updated workflow with new workflow_json
      const updatedWorkflow: IComfyWorkflow = {
        ...workflow,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      // Save updated workflow to IndexedDB
      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Force graph update in global store for all session-aware components
      // Use syncWorkflow to preserve the session stack!
      syncWorkflow(updatedWorkflow);

      console.log('Node color updated successfully in session');
    } catch (error) {
      console.error('Failed to update node color:', error);
    }
  };

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
    const latestWorkflow = useGlobalStore.getState().workflow || workflow;
    if (!latestWorkflow?.workflow_json || !comfyGraphRef.current) {
      console.warn('No workflow_json or ComfyGraph available');
      return;
    }

    try {
      const currentSubgraphId = getSelectedSubgraphId();
      const isRoot = !currentSubgraphId || currentSubgraphId === id;

      let updatedWorkflowJson: IComfyJson;
      let updatedComfyGraph: ComfyGraph | undefined = comfyGraphRef.current; // Initialize with current graph

      if (isRoot) {
        // 1. Use WorkflowGraphService to remove node and links from root
        const result = removeNodeWithLinks(
          latestWorkflow.workflow_json,
          comfyGraphRef.current,
          nodeId
        );
        updatedWorkflowJson = result.workflowJson;
        // updatedComfyGraph = result.comfyGraph; // Unused, we mutate below
      } else {
        // Subgraph deletion: deep copy to update definition
        updatedWorkflowJson = JSON.parse(JSON.stringify(latestWorkflow.workflow_json));
        const subgraphs = updatedWorkflowJson.subgraphs || (updatedWorkflowJson as any).definitions?.subgraphs;

        if (Array.isArray(subgraphs)) {
          const subgraphIdx = subgraphs.findIndex((s: any) => s.id === currentSubgraphId);
          if (subgraphIdx !== -1) {
            // Treat subgraph as a partial IComfyJson for removal logic
            const { workflowJson: updatedSubgraph } = removeNodeWithLinks(
              subgraphs[subgraphIdx] as IComfyJson,
              comfyGraphRef.current,
              nodeId
            );

            // Update record in collection
            subgraphs[subgraphIdx].nodes = updatedSubgraph.nodes;
            subgraphs[subgraphIdx].links = updatedSubgraph.links;
            // updatedComfyGraph = newSubGraph; // Unused

            // Cleanup metadata for the deleted node
            if (updatedWorkflowJson.mobile_ui_metadata?.control_after_generate) {
              delete updatedWorkflowJson.mobile_ui_metadata.control_after_generate[nodeId];
            }
          } else {
            const result = removeNodeWithLinks(latestWorkflow.workflow_json, comfyGraphRef.current, nodeId);
            updatedWorkflowJson = result.workflowJson;
          }
        } else {
          // Fallback
          const result = removeNodeWithLinks(latestWorkflow.workflow_json, comfyGraphRef.current, nodeId);
          updatedWorkflowJson = result.workflowJson;
        }
      }

      // 2. Update the refs immediately for instant visual feedback (IN-PLACE MUTATION)
      // Use existing collectNodeLinkIds to identify what to remove from graph
      const linkIdsToRemove = WorkflowGraphService.collectNodeLinkIds(
        isRoot ? latestWorkflow.workflow_json : (updatedWorkflowJson as any),
        nodeId
      );

      const liveGraph = comfyGraphRef.current;

      // Remove links from ComfyGraph._links
      linkIdsToRemove.forEach(linkId => {
        if (liveGraph._links[linkId]) {
          delete liveGraph._links[linkId];
        }
      });

      // Remove the node from ComfyGraph._nodes
      if (liveGraph._nodes) {
        liveGraph._nodes = liveGraph._nodes.filter((n: any) => {
          const nId = typeof n.id === 'string' ? parseInt(n.id) : n.id;
          return nId !== nodeId;
        });
      }

      updatedComfyGraph = liveGraph; // Keep reference the same

      // 3. Clear selected node if it's the deleted one
      if (selectedNode && (typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id) === nodeId) {
        setSelectedNode(null);
        setIsNodePanelVisible(false);
      }

      // 4. Update nodeBounds manually (No-Reload Optimization)
      setNodeBounds(prev => {
        const newMap = new Map(prev);
        newMap.delete(nodeId);
        return newMap;
      });

      // 5. Update and save the workflow
      const updatedWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        graph: updatedComfyGraph, // CRITICAL: Update the live graph in the store object
        nodeCount: updatedWorkflowJson.nodes?.length || 0
      };

      await updateWorkflow(updatedWorkflow);

      // Update local workflow state
      setWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Reload removed (No-Reload Optimization)
      // await loadWorkflow(true);

      // If we were in a subgraph, re-enter it -> Not needed if we don't reload
      toast.success(t('workflow.nodeDeleted', { id: nodeId }));

    } catch (error) {
      console.error('Failed to delete node:', error);
      toast.error(t('workflow.nodeDeleteFailed'));
    }
  };

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
      // Create shallow copy to trigger React updates
      const updatedWorkflow = { ...workflow };

      // Save to backend asynchronously without updating React state
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save workflow:', error);
        toast.error(t('workflow.updateError'));
      });

      // Update local state and sync
      setWorkflow(updatedWorkflow);
      syncWorkflow(updatedWorkflow);
      forceRender();

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
      // Create shallow copy to trigger React updates
      const updatedWorkflow = { ...workflow };

      // Save to backend asynchronously without updating React state
      updateWorkflow(updatedWorkflow).catch(error => {
        console.error('Failed to save workflow:', error);
        toast.error(t('workflow.updateError'));
      });

      // Update local state and sync
      setWorkflow(updatedWorkflow);
      syncWorkflow(updatedWorkflow);
      forceRender();

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
  const refreshNodeSlots = async (nodeIds?: number[], silent: boolean = false) => {
    if (!workflow?.workflow_json || !comfyGraphRef.current || !objectInfo) {
      console.warn('No workflow, ComfyGraph, or objectInfo available');
      if (!silent) toast.error(t('workflow.refreshFailed'));
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
        if (!silent) toast.info(t('workflow.noNodesToRefresh'));
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
        // FIX: Use live graph data if available to prevent reverting converted widgets (Bug 3)
        const liveGraphNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === nodeId);
        const existingInputs = liveGraphNode?.inputs || currentNode.inputs || [];
        const existingOutputs = liveGraphNode?.outputs || currentNode.outputs || [];

        // Create fresh template slots from metadata
        const templateInputs = createInputSlots(nodeMetadata.input || {}, nodeMetadata.input_order);
        const templateOutputs = createOutputSlots(
          nodeMetadata.output || [],
          nodeMetadata.output_name || []
        );

        // merge: preserve all existing slots and add new template slots
        const existingInputsByName = new Map(existingInputs.map((slot: any) => [slot.name, slot]));
        const existingOutputsByName = new Map(existingOutputs.map((slot: any) => [slot.name, slot]));
        const templateInputsByName = new Map(templateInputs.map((slot: any) => [slot.name, slot]));
        const templateOutputsByName = new Map(templateOutputs.map((slot: any) => [slot.name, slot]));

        // Start with existing inputs and add new template inputs
        const mergedInputs = existingInputs.map((slot: any) => {
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

          // FIX: Re-initialize widgets to ensure they match inputs/metadata
          // This is critical for "hollow" nodes that might have failed initial widget creation
          if (typeof (graphNode as any).initializeWidgets === 'function') {
            // Pass widget values (or empty array if new/hollow), server metadata, and workflow metadata
            (graphNode as any).initializeWidgets(
              currentNode.widgets_values || [],
              nodeMetadata,
              workflow.workflow_json.mobile_ui_metadata
            );
          }
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

      // CRITICAL FIX: Use syncWorkflow instead of setWorkflow
      // setWorkflow(updatedWorkflow) resets the session stack!
      syncWorkflow(updatedWorkflow);
      // setWorkflow(updatedWorkflow); // DISABLED to prevent stack reset

      // Close node panel if it was a single node refresh
      if (nodeIds && nodeIds.length === 1) {
        // Only if we want to close it? User might want to keep it open?
        // Original code closed it. Let's keep it closed or refresh selectedNode?
        // If we keep it open, we must ensure selectedNode is updated.
        // Let's close it for safety as original logic did, or refresh it.
        // Re-selecting the node from the graph is safer.
        const nodeId = nodeIds[0];
        const refreshedNode = comfyGraphRef.current._nodes?.find((n: any) => n.id === nodeId);
        if (refreshedNode) {
          console.log('Refreshed node logic: updating selectedNode');
          setSelectedNode(refreshedNode);
        }
        // setIsNodePanelVisible(false); // Let's try keeping it open if it's just a refresh!
      } else {
        setIsNodePanelVisible(false);
        setSelectedNode(null);
      }

      // Reload the workflow to ensure all systems are synchronized, preserving session
      // await loadWorkflow(true); // DISABLED: loadWorkflow reverts changes if DB is async laggy OR resets stack.
      // We already updated the graph manually above.
      forceRender(); // Ensure UI updates

      if (!silent) {
        // Show appropriate success message
        if (nodeIds && nodeIds.length === 1) {
          toast.success(t('workflow.nodeRefreshed', { id: nodeIds[0] }));
        } else {
          toast.success(t('workflow.workflowRefreshed', { refreshedCount }) +
            (skippedCount > 0 ? t('workflow.nodesSkipped', { count: skippedCount }) : ''));
        }
      }

    } catch (error) {
      console.error('Failed to refresh node slots:', error);
      if (!silent) toast.error(t('workflow.refreshFailed'));
    }
  };

  const handleNodeRefresh = async (nodeId: number, silent: boolean = false) => {
    await refreshNodeSlots([nodeId], silent);
  };

  const handleNodeTitleChange = async (nodeId: number, title: string) => {
    // Update node title in both workflow_json and ComfyGraph
    if (!workflow?.workflow_json || !currentGraph) {
      console.warn('No workflow_json or currentGraph available');
      return;
    }

    try {
      console.log('Updating node title:', { nodeId, title });

      // 1. Update ComfyGraph node immediately (for instant visual feedback)
      const comfyNode = currentGraph.getNodeById(nodeId);
      if (comfyNode) {
        // Update the node title
        (comfyNode as any).title = title;
        console.log(`Updated ComfyGraph node ${nodeId} title immediately in session:`, title);
      }

      // Update workflow_json for persistence
      // Update workflow_json for persistence
      // FIX: Use latest workflow from store to prevent race conditions
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for update');
        return;
      }

      const updatedWorkflowJson = updateNodeInWorkflow(currentWorkflowJson, nodeId, (node) => ({
        ...node,
        title: title
      }));

      // Save to backend
      const updatedWorkflow: IComfyWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      await updateWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Update local workflow state without full reload
      setWorkflow(updatedWorkflow);

      // Update selected node to reflect changes in UI
      if (selectedNode && selectedNode.id === nodeId) {
        // Fix: Do not spread the node object as it strips methods (like getWidgets)
        setSelectedNode(comfyNode);
      }

      toast.success(t('workflow.titleUpdated'));
    } catch (error) {
      console.error('Failed to update node title:', error);
      toast.error(t('workflow.titleUpdateFailed'));
    }
  };

  const handleNodeSizeChange = async (nodeId: number, width: number, height: number) => {
    if (!workflow || !currentGraph) return;

    try {
      console.log('Updating node size:', { nodeId, width, height });

      // Find the node in the CURRENT graph session
      const node = currentGraph.getNodeById(nodeId);
      if (!node) {
        console.error('Node not found in current session:', nodeId);
        return;
      }

      // Update the node's size immediately for real-time canvas update
      (node as any).size = [width, height];

      // Update workflow_json for persistence
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for update');
        return;
      }

      const updatedWorkflowJson = updateNodeInWorkflow(currentWorkflowJson, nodeId, (node: any) => ({
        ...node,
        size: [width, height]
      }));

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow: IComfyWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      setWorkflow(updatedWorkflow);

      // Save to backend
      await updateWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
          newBounds.set(nodeId, {
            ...existingBounds,
            width,
            height,
            node: node as any
          });
        }
        return newBounds;
      });

      // Update selected node to reflect changes in UI immediately
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(node as any);
      }

      console.log('Node size updated successfully in session');
    } catch (error) {
      console.error('Failed to update node size:', error);
      toast.error(t('workflow.sizeUpdateFailed'));
    }
  };


  const handleNodeCollapseChange = async (nodeId: number, collapsed: boolean) => {
    if (!workflow || !currentGraph) return;

    try {
      console.log('Updating node collapse:', { nodeId, collapsed });

      // Find the node in the CURRENT graph session
      const node = currentGraph.getNodeById(nodeId);
      if (!node) {
        console.error('Node not found in current session:', nodeId);
        return;
      }

      // Update the node's collapsed state immediately for real-time canvas update
      if (!(node as any).flags) {
        (node as any).flags = {};
      }
      (node as any).flags.collapsed = collapsed;

      // Update workflow_json for persistence
      const latestWorkflow = useGlobalStore.getState().workflow || workflow;
      const currentWorkflowJson = latestWorkflow?.workflow_json || workflow?.workflow_json;

      if (!currentWorkflowJson) {
        console.warn('No workflow_json available for update');
        return;
      }

      const updatedWorkflowJson = updateNodeInWorkflow(currentWorkflowJson, nodeId, (node: any) => {
        const updated = {
          ...node,
          flags: {
            ...node.flags,
            collapsed: collapsed
          }
        };
        return updated;
      });

      // Update local workflow state immediately for UI responsiveness
      const updatedWorkflow: IComfyWorkflow = {
        ...(latestWorkflow || workflow)!,
        workflow_json: updatedWorkflowJson,
        modifiedAt: new Date()
      };

      setWorkflow(updatedWorkflow);

      // Save to backend
      await updateWorkflow(updatedWorkflow);

      // Sync with global store while preserving stack
      syncWorkflow(updatedWorkflow);

      // Update nodeBounds for immediate canvas rendering with collapse state
      setNodeBounds(prevBounds => {
        const newBounds = new Map(prevBounds);
        const existingBounds = newBounds.get(nodeId);
        if (existingBounds) {
          newBounds.set(nodeId, {
            ...existingBounds,
            width: collapsed ? 80 : (node.size?.[0] || 200),
            height: collapsed ? 30 : (node.size?.[1] || 100),
            node: node as any
          });
        }
        return newBounds;
      });

      // Update selected node to reflect changes in UI immediately
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(node as any);
      }

      console.log('Node collapse updated successfully in session');
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
        sessionStack={sessionStack}
        onNavigateBreadcrumb={jumpToSession}
        onNavigateBack={() => {
          // Check if we are in a subgraph session
          if (sessionStack.length > 1) {
            popSession();
            return;
          }

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
        onContextMenu={canvasInteraction.handleContextMenu}
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
          if (changes) {
            try {
              const latestWorkflow = useGlobalStore.getState().workflow || workflow;
              if (!latestWorkflow?.workflow_json) return;

              // Apply all changes using the session-aware helper
              const updatedWorkflowJson = applyRepositioningToSession(latestWorkflow.workflow_json, changes);

              // Update the workflow state
              // Ensure we preserve the graph instance from the latest workflow
              const updatedWorkflow: IComfyWorkflow = {
                ...latestWorkflow,
                workflow_json: updatedWorkflowJson,
                // Explicitly preserve graph reference just in case spreading behaves unexpectedly
                graph: latestWorkflow.graph,
                modifiedAt: new Date()
              };

              console.log('RepositionActionBar: Syncing workflow', {
                hasGraph: !!updatedWorkflow.graph,
                isComfyGraph: updatedWorkflow.graph instanceof ComfyGraph,
                // Check if graph has nodes instances
                hasNodeInstances: updatedWorkflow.graph?._nodes?.[0] instanceof ComfyGraphNode
              });

              // Save to backend and state
              console.log('RepositionActionBar: Saving workflow_json', {
                nodeCount: updatedWorkflowJson.nodes?.length,
                sampleNodePos: updatedWorkflowJson.nodes?.find(n => n.id === changes.nodeChanges?.[0]?.nodeId)?.pos
              });
              await updateWorkflow(updatedWorkflow);
              // CRITICAL FIX: Use syncWorkflow instead of setWorkflow to avoid resetting the session stack
              // setWorkflow(updatedWorkflow) resets sessionStack to [root], killing the active subgraph session
              syncWorkflow(updatedWorkflow);

              const totalChanges = (changes.nodeChanges?.length || 0) + (changes.groupChanges?.length || 0) + (changes.resizeChanges?.length || 0);
              console.log(`Repositioning applied to session: ${totalChanges} changes`);

              // NO-RELOAD OPTIMIZATION: Manually update graph and bounds
              // CRITICAL: Always use the ref to get the live graph
              const liveGraph = comfyGraphRef.current;

              if (liveGraph) {
                // 1. Update Nodes
                if (changes.nodeChanges) {
                  changes.nodeChanges.forEach(change => {
                    const node = liveGraph.getNodeById(change.nodeId);
                    if (node) {
                      console.log(`[Reposition Debug] Updating node ${node.id} pos. Widgets check:`, {
                        hasWidgetsProp: 'widgets' in node,
                        widgetsLength: (node as any).widgets?.length,
                        underscoreWidgets: (node as any)._widgets,
                        isInstance: node instanceof ComfyGraphNode
                      });
                      node.pos = [...change.newPosition];
                      // Preserve widgets? They should be preserved as we just updated pos.

                      // Force refresh selectedNode if it matches
                      if (selectedNode && (selectedNode.id === node.id || parseInt(selectedNode.id as any) === node.id)) {
                        console.log('[Reposition Debug] Refreshed selectedNode reference');
                        setSelectedNode(node);
                      }
                    }
                  });
                }

                // 2. Update Groups
                if (changes.groupChanges && liveGraph._groups) {
                  changes.groupChanges.forEach(change => {
                    const group = liveGraph._groups.find((g: any) => g.id == change.groupId);
                    if (group) {
                      if (change.newPosition) {
                        group.pos = [...change.newPosition];
                        // FIX: Update bounding as well because CanvasRendererService uses it
                        if (group.bounding && Array.isArray(group.bounding) && group.bounding.length >= 2) {
                          group.bounding[0] = change.newPosition[0];
                          group.bounding[1] = change.newPosition[1];
                        }
                        if (group._bounding && Array.isArray(group._bounding) && group._bounding.length >= 2) {
                          group._bounding[0] = change.newPosition[0];
                          group._bounding[1] = change.newPosition[1];
                        }
                      }
                    }
                  });
                }

                // 3. Update Resizes
                if (changes.resizeChanges) {
                  changes.resizeChanges.forEach(change => {
                    if (change.nodeId !== undefined && change.nodeId !== null) {
                      const node = liveGraph.getNodeById(change.nodeId);
                      if (node && change.newSize) {
                        node.size = [...change.newSize];
                        if (change.newPosition) {
                          node.pos = [...change.newPosition];
                        }
                      }
                    } else if (change.groupId !== undefined && change.groupId !== null && liveGraph._groups) {
                      const group = liveGraph._groups.find((g: any) => g.id == change.groupId);
                      if (group && change.newSize) {
                        group.size = [...change.newSize];

                        // FIX: Update bounding as well because CanvasRendererService uses it for bounds calculation
                        // Use newPosition if provided (it usually is for top/left resizes), else fall back to current
                        const currentBounding = group._bounding || group.bounding || [0, 0, 0, 0];
                        const posX = change.newPosition ? change.newPosition[0] : (group.pos ? group.pos[0] : currentBounding[0]);
                        const posY = change.newPosition ? change.newPosition[1] : (group.pos ? group.pos[1] : currentBounding[1]);

                        const newBounding = [posX, posY, change.newSize[0], change.newSize[1]];
                        group.bounding = [...newBounding];
                        if (group._bounding) group._bounding = [...newBounding];
                        if (change.newPosition) group.pos = [...change.newPosition];
                      }
                    }
                  });
                }
              }

              // 4. Update Bounds State
              setNodeBounds(prev => {
                const newMap = new Map(prev);
                if (changes.nodeChanges) {
                  changes.nodeChanges.forEach(change => {
                    const existing = newMap.get(change.nodeId);
                    if (existing) {
                      newMap.set(change.nodeId, { ...existing, x: change.newPosition[0], y: change.newPosition[1] });
                    }
                  });
                }
                if (changes.resizeChanges) {
                  changes.resizeChanges.forEach(change => {
                    if (change.nodeId) {
                      const existing = newMap.get(change.nodeId);
                      if (existing) {
                        newMap.set(change.nodeId, {
                          ...existing,
                          width: change.newSize[0],
                          height: change.newSize[1],
                          x: change.newPosition ? change.newPosition[0] : existing.x,
                          y: change.newPosition ? change.newPosition[1] : existing.y
                        });
                      }
                    }
                  });
                }
                return newMap;
              });

              // Update Group Bounds if needed
              if (changes.groupChanges || changes.resizeChanges) {
                setGroupBounds(prev => {
                  // prev is an array, we need to map over it or recreate it
                  // Actually setGroupBounds expects GroupBounds[]
                  // So we map the array
                  return prev.map(existing => {
                    // Check for position change
                    const posChange = changes.groupChanges?.find(c => c.groupId == existing.id);
                    // Check for resize change
                    const resizeChange = changes.resizeChanges?.find(c => c.groupId == existing.id);

                    if (!posChange && !resizeChange) return existing;

                    return {
                      ...existing,
                      x: posChange ? posChange.newPosition[0] : (resizeChange?.newPosition ? resizeChange.newPosition[0] : existing.x),
                      y: posChange ? posChange.newPosition[1] : (resizeChange?.newPosition ? resizeChange.newPosition[1] : existing.y),
                      width: resizeChange ? resizeChange.newSize[0] : existing.width,
                      height: resizeChange ? resizeChange.newSize[1] : existing.height
                    };
                  });
                });
              }

              // Refresh UI preserving session
              // await loadWorkflow(true);
              // syncWorkflow(updatedWorkflow); // Already synced above
              forceRender();

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
      <DirectConnectionPanel
        isVisible={connectionMode.connectionMode.showModal}
        sourceNode={connectionMode.connectionMode.sourceNode}
        targetNode={connectionMode.connectionMode.targetNode}
        workflow={workflow}
        onClose={connectionMode.clearNodesAndCloseModal}
        onApply={handleApplyBatchConnections}
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
          onAutoRefreshNode={(nodeId: number) => handleNodeRefresh(nodeId, true)}
          onNodeTitleChange={handleNodeTitleChange}
          onNodeSizeChange={handleNodeSizeChange}
          onNodeCollapseChange={handleNodeCollapseChange}
          onGroupSizeChange={handleGroupSizeChange}
          onDisconnectInput={handleDisconnectInput}
          onDisconnectOutput={handleDisconnectOutput}
          onEnterSubgraph={handleEnterSubgraph}
          subgraphDefinition={subgraphDefinitionsMap.get(selectedNode.type)}
          onNodeModeChangeBatch={handleNodeModeChangeBatch}
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
        downloadFilename={jsonViewerData?.title === t('workflow.jsonTitle') ? workflow?.name : undefined}
      />

      {/* Node Add Modal */}
      <NodeAddModal
        isOpen={canvasInteraction.isNodeAddModalOpen}
        onClose={() => canvasInteraction.setIsNodeAddModalOpen(false)}
        graph={currentGraph}
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
        graph={currentGraph} // Pass the active session graph
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
        onEnterSubgraph={handleEnterSubgraph}
        onAddNode={handleAddNodeFromMenu}
        onClose={() => setCircularMenuState(prev => ({ ...prev, isOpen: false }))}
      />

      <WorkflowContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState(prev => ({ ...prev, isOpen: false }))}
        graph={currentGraph} // Pass the active session graph
        onNodeColorChange={handleNodeColorChange}
        onNodeModeChange={handleNodeModeChange}
        onNodeDelete={handleNodeDelete}
        onEnterConnectionModeWithSource={(nodeId: number) => {
          const node = comfyGraphRef.current?.getNodeById(nodeId);
          if (node) {
            connectionMode.enterConnectionModeWithSource(node);
          }
        }}
        onEnterRepositionMode={(nodeId?: number) => canvasInteraction.enterRepositionMode(nodeId)}
        onCopyNode={handleNodeCopy}
        onAddNode={handleAddNodeFromMenu}
        onToggleConnectionMode={connectionMode.toggleConnectionMode}
        onNodeCollapseChange={handleNodeCollapseChange}
        onEnterSubgraph={handleEnterSubgraph}
        getNodeFlags={(nodeId: number) => {
          return currentGraph?.getNodeById(nodeId)?.flags || {};
        }}
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


