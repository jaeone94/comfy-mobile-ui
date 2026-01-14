import { useState, useCallback } from 'react';
import { WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { findCompatibleNodes, checkNodeCompatibility, hasOutputSlots, hasInputSlots } from '@/shared/utils/nodeCompatibility';

export interface ConnectionMode {
  isActive: boolean;
  phase: 'SOURCE_SELECTION' | 'TARGET_SELECTION' | 'SLOT_SELECTION';
  sourceNode: WorkflowNode | null;
  targetNode: WorkflowNode | null;
  compatibleNodeIds: Set<number>;
  showModal: boolean;
}

interface UseConnectionModeProps {
  workflow?: any;
  onCreateConnection?: (sourceNodeId: number, targetNodeId: number, sourceSlot: number, targetSlot: number) => void;
}

export const useConnectionMode = ({ workflow, onCreateConnection }: UseConnectionModeProps) => {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>({
    isActive: false,
    phase: 'SOURCE_SELECTION',
    sourceNode: null,
    targetNode: null,
    compatibleNodeIds: new Set(),
    showModal: false,
  });

  // Enter connection mode
  const enterConnectionMode = useCallback(() => {
    setConnectionMode({
      isActive: true,
      phase: 'SOURCE_SELECTION',
      sourceNode: null,
      targetNode: null,
      compatibleNodeIds: new Set(),
      showModal: false,
    });

    return true;
  }, []);

  // Exit connection mode
  const exitConnectionMode = useCallback(() => {
    setConnectionMode({
      isActive: false,
      phase: 'SOURCE_SELECTION',
      sourceNode: null,
      targetNode: null,
      compatibleNodeIds: new Set(),
      showModal: false,
    });

    return true;
  }, []);

  // Toggle connection mode
  const toggleConnectionMode = useCallback(() => {
    if (connectionMode.isActive) {
      exitConnectionMode();
    } else {
      enterConnectionMode();
    }
  }, [connectionMode.isActive, enterConnectionMode, exitConnectionMode]);

  // Select source node
  const selectSourceNode = useCallback((node: WorkflowNode) => {
    if (!connectionMode.isActive) return false;


    // Check if the node has output slots (can be used as source)
    if (!hasOutputSlots(node)) {
      return false;
    }

    // Find all compatible nodes using the compatibility utility
    const compatibleNodeIds = new Set<number>();

    if (workflow?.workflow_json?.nodes) {
      const allNodes = workflow.workflow_json.nodes as WorkflowNode[];

      const compatibleNodes = findCompatibleNodes(node, allNodes);

      // Add all compatible node IDs
      compatibleNodes.forEach(nodeId => {
        compatibleNodeIds.add(nodeId);
      });
    }

    setConnectionMode(prev => ({
      ...prev,
      phase: 'TARGET_SELECTION',
      sourceNode: node,
      compatibleNodeIds,
    }));

    return true;
  }, [connectionMode.isActive, workflow]);

  // Select target node
  const selectTargetNode = useCallback((node: WorkflowNode) => {
    if (!connectionMode.isActive || connectionMode.phase !== 'TARGET_SELECTION') return false;
    if (!connectionMode.sourceNode) return false;

    // Check if the node has input slots (can be used as target)
    if (!hasInputSlots(node)) {
      return false;
    }

    // Check if the selected node is compatible
    if (!connectionMode.compatibleNodeIds.has(node.id)) {
      return false;
    }

    // Double-check compatibility and available slots
    const compatibility = checkNodeCompatibility(connectionMode.sourceNode, node);
    if (!compatibility.isCompatible) {
      return false;
    }

    setConnectionMode(prev => ({
      ...prev,
      phase: 'SLOT_SELECTION',
      targetNode: node,
    }));

    return true;
  }, [connectionMode]);

  // Clear source node and restart (also clears target)
  const clearSourceNode = useCallback(() => {
    setConnectionMode(prev => ({
      ...prev,
      phase: 'SOURCE_SELECTION',
      sourceNode: null,
      targetNode: null,
      compatibleNodeIds: new Set(),
      showModal: false,
    }));
  }, []);

  // Clear only target node
  const clearTargetNode = useCallback(() => {
    if (connectionMode.sourceNode) {
      // Go back to target selection phase - compatibility highlights are handled by CanvasRenderer
      setConnectionMode(prev => ({
        ...prev,
        phase: 'TARGET_SELECTION',
        targetNode: null,
      }));
    }
  }, [connectionMode.sourceNode]);

  // Handle node selection based on current phase
  const handleNodeSelection = useCallback((node: WorkflowNode) => {
    if (!connectionMode.isActive) return false;

    switch (connectionMode.phase) {
      case 'SOURCE_SELECTION':
        return selectSourceNode(node);
      case 'TARGET_SELECTION':
        // Check if tapping the already selected source node (deselect)
        if (connectionMode.sourceNode?.id === node.id) {
          clearSourceNode();
          return true;
        }
        return selectTargetNode(node);
      case 'SLOT_SELECTION':
        // Allow deselection of source or target nodes
        if (connectionMode.sourceNode?.id === node.id) {
          clearSourceNode();
          return true;
        }
        if (connectionMode.targetNode?.id === node.id) {
          clearTargetNode();
          return true;
        }
        return false;
      default:
        return false;
    }
  }, [connectionMode, selectSourceNode, selectTargetNode, clearSourceNode, clearTargetNode]);

  // Show connection modal when both nodes are selected
  const showConnectionModal = useCallback(() => {
    if (connectionMode.sourceNode && connectionMode.targetNode) {
      setConnectionMode(prev => ({
        ...prev,
        showModal: true,
      }));
      return true;
    }
    return false;
  }, [connectionMode.sourceNode, connectionMode.targetNode]);

  // Hide connection modal
  const hideConnectionModal = useCallback(() => {
    setConnectionMode(prev => ({
      ...prev,
      showModal: false,
    }));
  }, []);

  // Clear nodes and close modal (for cancel/close actions)
  const clearNodesAndCloseModal = useCallback(() => {
    setConnectionMode(prev => ({
      ...prev,
      phase: 'SOURCE_SELECTION',
      sourceNode: null,
      targetNode: null,
      compatibleNodeIds: new Set(),
      showModal: false,
    }));
  }, []);

  // Handle connection creation from modal
  const handleCreateConnection = useCallback((sourceSlot: number, targetSlot: number) => {
    if (!connectionMode.sourceNode || !connectionMode.targetNode) {
      return;
    }

    if (onCreateConnection) {
      onCreateConnection(
        connectionMode.sourceNode.id,
        connectionMode.targetNode.id,
        sourceSlot,
        targetSlot
      );
    }

    // Stay in connection mode but clear nodes and close modal
    setConnectionMode(prev => ({
      ...prev,
      phase: 'SOURCE_SELECTION',
      sourceNode: null,
      targetNode: null,
      compatibleNodeIds: new Set(),
      showModal: false,
    }));
  }, [connectionMode.sourceNode, connectionMode.targetNode, onCreateConnection]);

  // Cancel connection
  const cancelConnection = useCallback(() => {
    exitConnectionMode();
  }, [exitConnectionMode]);

  // Long press utility: Enter connection mode and immediately select source node
  const enterConnectionModeWithSource = useCallback((node: WorkflowNode) => {
    // Check if valid source
    if (!hasOutputSlots(node)) {
      return false;
    }

    // Find all compatible nodes using the compatibility utility
    const compatibleNodeIds = new Set<number>();

    if (workflow?.workflow_json?.nodes) {
      const allNodes = workflow.workflow_json.nodes as WorkflowNode[];
      const compatibleNodes = findCompatibleNodes(node, allNodes);
      compatibleNodes.forEach(nodeId => {
        compatibleNodeIds.add(nodeId);
      });
    }

    // Single state update to avoid potential render loops
    setConnectionMode({
      isActive: true,
      phase: 'TARGET_SELECTION',
      sourceNode: node,
      targetNode: null,
      compatibleNodeIds,
      showModal: false,
    });

    return true;
  }, [workflow]);


  // Check if node is selectable
  const isNodeSelectable = useCallback((nodeId: number): boolean => {
    if (!connectionMode.isActive) return false;

    switch (connectionMode.phase) {
      case 'SOURCE_SELECTION':
        return true; // All nodes are selectable as source
      case 'TARGET_SELECTION':
        return connectionMode.compatibleNodeIds.has(nodeId);
      case 'SLOT_SELECTION':
        return false; // No more node selection needed
      default:
        return false;
    }
  }, [connectionMode]);

  return {
    connectionMode,
    enterConnectionMode,
    exitConnectionMode,
    toggleConnectionMode,
    handleNodeSelection,
    selectSourceNode,
    selectTargetNode,
    cancelConnection,
    clearSourceNode,
    clearTargetNode,
    isNodeSelectable,
    showConnectionModal,
    hideConnectionModal,
    handleCreateConnection,
    clearNodesAndCloseModal,
    enterConnectionModeWithSource, // Single-step connection mode activation
  };
};