import { IComfyJson, IComfyGraph } from '@/shared/types/app/base';

export interface ConnectionServiceResult {
  updatedWorkflowJson: IComfyJson;
  updatedGraph: IComfyGraph;
  newLinkId: number;
}

/**
 * Service for managing connections between nodes in ComfyUI workflows
 * Handles both workflow_json and ComfyGraph data structures
 */
export class ConnectionService {
  /**
   * Creates a new connection between two nodes
   * @param workflowJson - Current workflow JSON data
   * @param graph - Current ComfyGraph data  
   * @param sourceNodeId - ID of the source node
   * @param targetNodeId - ID of the target node
   * @param sourceSlot - Index of the source output slot
   * @param targetSlot - Index of the target input slot
   * @returns Updated workflow data with new connection
   */
  static createConnection(
    workflowJson: IComfyJson,
    graph: IComfyGraph,
    sourceNodeId: number,
    targetNodeId: number,
    sourceSlot: number,
    targetSlot: number
  ): ConnectionServiceResult {
    // Clone the workflow JSON (POJO) to avoid mutations
    const updatedWorkflowJson = JSON.parse(JSON.stringify(workflowJson)) as IComfyJson;

    // CRITICAL: Do NOT deep clone the graph using JSON methods as it destroys ComfyGraphNode instances (methods/widgets)
    // We will mutate the graph structure cautiously or return the same graph instance with updates
    // For this use case, since we want to preserve node instances, we'll treat 'graph' as the live graph 
    // and mutate it (or its structure) directly, but robustly.
    // However, to respect the "updatedGraph" contract, we can return the same reference if we mutate in place.
    const updatedGraph = graph;

    // Generate new link ID
    const newLinkId = Math.max(
      updatedWorkflowJson.last_link_id || 0,
      updatedGraph.last_link_id || 0
    ) + 1;

    // Find nodes
    const targetJsonNode = updatedWorkflowJson.nodes.find(n => n.id === targetNodeId);
    const targetGraphNode = updatedGraph._nodes.find(n => n.id === targetNodeId);
    const sourceJsonNode = updatedWorkflowJson.nodes.find(n => n.id === sourceNodeId);
    const sourceGraphNode = updatedGraph._nodes.find(n => n.id === sourceNodeId);

    if (!targetJsonNode || !targetGraphNode || !sourceJsonNode || !sourceGraphNode) {
      throw new Error(`Node not found: source ${sourceNodeId} or target ${targetNodeId}`);
    }

    // Get connection type from source output slot
    const sourceOutputSlot = sourceGraphNode.outputs?.[sourceSlot];
    const connectionType = sourceOutputSlot?.type || 'UNKNOWN';

    // Handle existing connection removal
    this.removeExistingConnection(
      updatedWorkflowJson,
      updatedGraph,
      targetJsonNode,
      targetSlot
    );

    // 1. Add new link to workflow_json.links (2D array format)
    if (!updatedWorkflowJson.links) {
      updatedWorkflowJson.links = [];
    }
    updatedWorkflowJson.links.push([
      newLinkId,           // link id
      sourceNodeId,        // source node id
      sourceSlot,          // source slot index
      targetNodeId,        // target node id
      targetSlot,          // target slot index
      connectionType       // connection type
    ]);

    // 2. Add new link to graph._links (object format)
    if (!updatedGraph._links) {
      updatedGraph._links = {};
    }
    updatedGraph._links[newLinkId] = {
      id: newLinkId,
      origin_id: sourceNodeId,
      origin_slot: sourceSlot,
      target_id: targetNodeId,
      target_slot: targetSlot,
      type: connectionType
    };

    // 3. Update target node's input slot
    this.updateTargetInputSlot(targetJsonNode, targetGraphNode, targetSlot, newLinkId);

    // 4. Update source node's output slot links array
    this.updateSourceOutputSlot(sourceJsonNode, sourceGraphNode, sourceSlot, newLinkId);

    // Update last_link_id
    updatedWorkflowJson.last_link_id = newLinkId;
    updatedGraph.last_link_id = newLinkId;

    return {
      updatedWorkflowJson,
      updatedGraph,
      newLinkId
    };
  }

  /**
   * Removes existing connection from target input slot if it exists
   */
  private static removeExistingConnection(
    workflowJson: IComfyJson,
    graph: IComfyGraph,
    targetJsonNode: any,
    targetSlot: number
  ) {
    const targetInputSlot = targetJsonNode.inputs?.[targetSlot];
    if (!targetInputSlot?.link) return;

    const existingLinkId = targetInputSlot.link;

    // Remove from workflow_json.links array
    if (workflowJson.links) {
      workflowJson.links = workflowJson.links.filter((link: any[]) =>
        link[0] !== existingLinkId
      );
    }

    // Remove from graph._links object
    if (graph._links && graph._links[existingLinkId]) {
      delete graph._links[existingLinkId];
    }

    // Remove from all source nodes' output links arrays
    this.removeFromSourceOutputs(workflowJson.nodes, existingLinkId);
    this.removeFromSourceOutputs(graph._nodes, existingLinkId);
  }

  /**
   * Removes link ID from source node output slots
   */
  private static removeFromSourceOutputs(nodes: any[], linkId: number) {
    nodes.forEach(node => {
      if (node.outputs) {
        node.outputs.forEach((output: any) => {
          if (output.links && Array.isArray(output.links)) {
            output.links = output.links.filter((id: number) => id !== linkId);
          }
        });
      }
    });
  }

  /**
   * Updates target node's input slot with new link
   */
  private static updateTargetInputSlot(
    targetJsonNode: any,
    targetGraphNode: any,
    targetSlot: number,
    newLinkId: number
  ) {
    // Initialize inputs array if needed
    if (!targetJsonNode.inputs) targetJsonNode.inputs = [];
    if (!targetGraphNode.inputs) targetGraphNode.inputs = [];

    // Initialize slot object if needed
    if (!targetJsonNode.inputs[targetSlot]) {
      targetJsonNode.inputs[targetSlot] = {};
    }
    if (!targetGraphNode.inputs[targetSlot]) {
      targetGraphNode.inputs[targetSlot] = {};
    }

    // Set link ID
    targetJsonNode.inputs[targetSlot].link = newLinkId;
    targetGraphNode.inputs[targetSlot].link = newLinkId;
  }

  /**
   * Updates source node's output slot with new link
   */
  private static updateSourceOutputSlot(
    sourceJsonNode: any,
    sourceGraphNode: any,
    sourceSlot: number,
    newLinkId: number
  ) {
    // Initialize outputs arrays if needed
    if (!sourceJsonNode.outputs) sourceJsonNode.outputs = [];
    if (!sourceGraphNode.outputs) sourceGraphNode.outputs = [];

    // Initialize slot objects if needed
    if (!sourceJsonNode.outputs[sourceSlot]) {
      sourceJsonNode.outputs[sourceSlot] = {};
    }
    if (!sourceGraphNode.outputs[sourceSlot]) {
      sourceGraphNode.outputs[sourceSlot] = {};
    }

    // Initialize links arrays if needed
    if (!sourceJsonNode.outputs[sourceSlot].links) {
      sourceJsonNode.outputs[sourceSlot].links = [];
    }
    if (!sourceGraphNode.outputs[sourceSlot].links) {
      sourceGraphNode.outputs[sourceSlot].links = [];
    }

    // Add link ID if not already present
    if (!sourceJsonNode.outputs[sourceSlot].links.includes(newLinkId)) {
      sourceJsonNode.outputs[sourceSlot].links.push(newLinkId);
    }
    if (!sourceGraphNode.outputs[sourceSlot].links.includes(newLinkId)) {
      sourceGraphNode.outputs[sourceSlot].links.push(newLinkId);
    }
  }
}