/**
 * ComfyGraphProcessor - Pure functional implementation
 * No state, no classes, only pure functions with parameters
 */

import * as ComfyGraphNode from '@/core/domain/ComfyGraphNode'
import { ComfyGraph, ComfyGraphState } from '@/core/domain/ComfyGraph'
import { ComfyNodeMetadataService } from '@/infrastructure/api/ComfyNodeMetadataService'
import { IObjectInfo } from '@/shared/types/comfy/IComfyObjectInfo'
import { IComfyJson, IComfyJsonNode } from '@/shared/types/app/base'
import preprocessWorkflowJson from '@/core/services/WorkflowJsonPreprocessor'

/**
 * Load workflow data into a new graph
 */
export async function loadWorkflow(
  graph: ComfyGraphState,
  workflowJson: string | object,
  clean: boolean = true,
  preprocess: boolean = true
): Promise<ComfyGraphState> {
  const graphData = typeof workflowJson === 'string'
    ? JSON.parse(workflowJson)
    : workflowJson

  // 🔧 Apply workflow JSON preprocessing before Graph conversion
  // This handles custom nodes like Power Lora Loader at the JSON level
  if (preprocess) {
    await preprocessWorkflowJson(graphData);
  }

  let newGraph = graph
  if (clean) {
    newGraph = ComfyGraph.clearGraph(graph)
  }

  // Configure the graph with preprocessed workflow data
  newGraph = await ComfyGraph.configureGraph(newGraph, graphData as IComfyJson)

  return newGraph
}

/**
 * Create a new graph from workflow JSON
 */
export async function createGraphFromWorkflow(
  workflowJson: string | object,
  objectInfo?: IObjectInfo
): Promise<ComfyGraphState> {
  let graph = ComfyGraph.createComfyGraph()

  // Set metadata if available
  if (objectInfo) {
    graph = ComfyGraph.setMetadata(graph, objectInfo)
  }

  graph = await loadWorkflow(graph, workflowJson, true, true)

  return graph
}

/**
 * Serialize graph to workflow JSON
 */
export function serializeGraphToWorkflow(graph: ComfyGraphState): any {
  return ComfyGraph.serializeGraph(graph)
}

/**
 * Load workflow into graph and return the graph
 */
export async function loadWorkflowToGraph(
  workflowJson: string | object,
  objectInfo?: IObjectInfo,
  clean: boolean = true,
  preprocess: boolean = true // for node patching
): Promise<ComfyGraphState> {
  let graph = ComfyGraph.createComfyGraph()

  if (objectInfo) {
    graph = ComfyGraph.setMetadata(graph, objectInfo)
  }

  return await loadWorkflow(graph, workflowJson, clean, preprocess)
}

/**
 * Serialize graph to JSON
 */
export function serializeGraph(graph: ComfyGraphState): any {
  return serializeGraphToWorkflow(graph)
}

/**
 * Add a new node to a workflow JSON
 * @param workflowJson - The existing workflow JSON
 * @param nodeType - The type of node to add (e.g., "LoadImage")
 * @param position - [x, y] position for the new node
 * @param nodeMetadata - Node metadata from object_info API
 * @returns Updated workflow JSON with the new node
 */
export function addNodeToWorkflow(
  workflowJson: IComfyJson,
  nodeType: string,
  position: [number, number],
  nodeMetadata: any,
  initialValues?: Record<string, any>,
  size?: number[]
): IComfyJson {
  // Generate new node ID (increment last_node_id)
  // Fix: Handle case where last_node_id is missing or NaN (e.g. new workflow)
  let newNodeId: number;
  if (typeof workflowJson.last_node_id === 'number' && !isNaN(workflowJson.last_node_id)) {
    newNodeId = workflowJson.last_node_id + 1;
  } else {
    // Calculate from existing nodes if last_node_id is invalid
    if (workflowJson.nodes && workflowJson.nodes.length > 0) {
      newNodeId = Math.max(...workflowJson.nodes.map(n => n.id)) + 1;
    } else {
      newNodeId = 1;
    }
  }

  // Create the new node instance
  const newNode: IComfyJsonNode = createNodeInstance(
    newNodeId,
    nodeType,
    position,
    nodeMetadata,
    initialValues,
    size
  );

  // Create updated workflow JSON
  const updatedWorkflow: IComfyJson = {
    ...workflowJson,
    last_node_id: newNodeId,
    nodes: [...workflowJson.nodes, newNode]
  };

  return updatedWorkflow;
}

/**
 * Create a node instance based on node metadata
 * @param nodeId - Unique node ID
 * @param nodeType - Node type (e.g., "LoadImage")
 * @param position - [x, y] position
 * @param nodeMetadata - Node metadata from object_info
 * @returns IComfyJsonNode instance
 */
function createNodeInstance(
  nodeId: number,
  nodeType: string,
  position: [number, number],
  nodeMetadata: any,
  initialValues?: Record<string, any>,
  size?: number[]
): IComfyJsonNode {
  // Calculate node size (basic implementation), or use provided size
  const nodeSize = size && size.length === 2
    ? [size[0], size[1]] as [number, number]
    : calculateNodeSize(nodeMetadata);

  // Create input slots (including widget slots, following input_order)
  const inputs = createInputSlots(nodeMetadata.input || {}, nodeMetadata.input_order);

  // Create output slots
  const outputs = createOutputSlots(
    nodeMetadata.output || [],
    nodeMetadata.output_name || []
  );

  // Get default widget values (overridden by initialValues if provided)
  const widgetValues = getDefaultWidgetValues(
    nodeMetadata.input || {},
    nodeMetadata.input_order,
    initialValues
  );

  return {
    id: nodeId,
    type: nodeType,
    pos: position,
    size: nodeSize,
    flags: {},
    order: 0,
    mode: 0,
    inputs: inputs,
    outputs: outputs,
    widgets_values: widgetValues,
    properties: {},
    title: nodeMetadata.display_name || nodeType
  };
}

/**
 * Calculate appropriate node size based on inputs/outputs
 */
function calculateNodeSize(nodeMetadata: any): [number, number] {
  const baseWidth = 200;
  const baseHeight = 60;

  // Count total inputs and outputs for height calculation
  const totalInputs = Object.keys(nodeMetadata.input?.required || {}).length +
    Object.keys(nodeMetadata.input?.optional || {}).length;
  const totalOutputs = (nodeMetadata.output || []).length;

  const maxSlots = Math.max(totalInputs, totalOutputs);
  const slotHeight = 20;

  const calculatedHeight = baseHeight + (maxSlots * slotHeight);

  // Title width consideration
  const titleWidth = (nodeMetadata.display_name || nodeMetadata.name || '').length * 8;
  const calculatedWidth = Math.max(baseWidth, titleWidth + 40);

  return [calculatedWidth, calculatedHeight];
}

/**
 * Create input slots following input_order and including widget slots
 */
export function createInputSlots(inputSpec: any, inputOrder?: any): any[] {
  const slots: any[] = [];

  // Create ordered list of inputs based on input_order
  const orderedInputs: Array<{ name: string, spec: any, required: boolean }> = [];

  // Get input order arrays
  const requiredOrder = inputOrder?.required || [];
  const optionalOrder = inputOrder?.optional || [];

  // Add required inputs in order
  requiredOrder.forEach((name: string) => {
    if (inputSpec.required && inputSpec.required[name]) {
      orderedInputs.push({
        name,
        spec: inputSpec.required[name],
        required: true
      });
    }
  });

  // Add optional inputs in order
  optionalOrder.forEach((name: string) => {
    if (inputSpec.optional && inputSpec.optional[name]) {
      orderedInputs.push({
        name,
        spec: inputSpec.optional[name],
        required: false
      });
    }
  });

  // Add any remaining required inputs not in order (fallback)
  Object.entries(inputSpec.required || {}).forEach(([name, spec]) => {
    if (!orderedInputs.find(input => input.name === name)) {
      orderedInputs.push({ name, spec, required: true });
    }
  });

  // Add any remaining optional inputs not in order (fallback)  
  Object.entries(inputSpec.optional || {}).forEach(([name, spec]) => {
    if (!orderedInputs.find(input => input.name === name)) {
      orderedInputs.push({ name, spec, required: false });
    }
  });

  // Process ordered inputs
  orderedInputs.forEach(({ name, spec, required }) => {
    let dataType = Array.isArray(spec) ? spec[0] : spec;
    const config = Array.isArray(spec) && spec.length > 1 ? spec[1] : {};

    // Handle COMBO type (when first element is an array)
    if (Array.isArray(dataType)) {
      // This is a COMBO type - the first element is an array of options
      const slot = {
        name: name,
        type: "COMBO",
        link: null,
        widget: {
          type: "combo",
          name: name,
          options: dataType  // The array of combo options
        }
      };
      slots.push(slot);
    } else {
      // Regular type processing
      if (shouldCreateWidget(dataType, config)) {
        // Widget slot - include widget property
        slots.push({
          name: name,
          type: dataType,
          link: null,
          widget: {
            type: getWidgetType(dataType, config),
            name: name
          }
        });
      } else {
        // Connection slot only
        slots.push({
          name: name,
          type: dataType,
          link: null
        });
      }
    }
  });

  return slots;
}

/**
 * Create output slots
 */
export function createOutputSlots(outputs: string[], outputNames: string[]): any[] {
  return outputs.map((outputType, index) => ({
    name: outputNames[index] || outputType,
    type: outputType,
    links: null
  }));
}

/**
 * Determine if an input should be a widget instead of a connection slot
 */
function shouldCreateWidget(dataType: string | string[], config: any): boolean {
  // COMBO type (when dataType is an array) is always a widget
  if (Array.isArray(dataType)) {
    return true;
  }

  // Basic data types are widgets
  const widgetTypes = ['INT', 'FLOAT', 'STRING', 'BOOLEAN'];

  if (widgetTypes.includes(dataType)) {
    return true;
  }

  // Combo/select inputs are widgets
  if (config && (config.values || config.options)) {
    return true;
  }

  // Upload inputs are widgets
  if (config && (config.image_upload || config.file_upload)) {
    return true;
  }

  return false;
}

/**
 * Get default values for widgets in the same order as input slots
 */
function getDefaultWidgetValues(
  inputSpec: any,
  inputOrder?: any,
  initialValues?: Record<string, any>
): any[] {
  const values: any[] = [];

  // Create ordered list of inputs (same logic as createInputSlots)
  const orderedInputs: Array<{ name: string, spec: any, required: boolean }> = [];

  // Get input order arrays
  const requiredOrder = inputOrder?.required || [];
  const optionalOrder = inputOrder?.optional || [];

  // Add required inputs in order
  requiredOrder.forEach((name: string) => {
    if (inputSpec.required && inputSpec.required[name]) {
      orderedInputs.push({
        name,
        spec: inputSpec.required[name],
        required: true
      });
    }
  });

  // Add optional inputs in order
  optionalOrder.forEach((name: string) => {
    if (inputSpec.optional && inputSpec.optional[name]) {
      orderedInputs.push({
        name,
        spec: inputSpec.optional[name],
        required: false
      });
    }
  });

  // Add any remaining required inputs not in order (fallback)
  Object.entries(inputSpec.required || {}).forEach(([name, spec]) => {
    if (!orderedInputs.find(input => input.name === name)) {
      orderedInputs.push({ name, spec, required: true });
    }
  });

  // Add any remaining optional inputs not in order (fallback)  
  Object.entries(inputSpec.optional || {}).forEach(([name, spec]) => {
    if (!orderedInputs.find(input => input.name === name)) {
      orderedInputs.push({ name, spec, required: false });
    }
  });

  // Process ordered inputs for widget values
  orderedInputs.forEach(({ name, spec, required }) => {
    let dataType = Array.isArray(spec) ? spec[0] : spec;
    const config = Array.isArray(spec) && spec.length > 1 ? spec[1] : {};

    if (shouldCreateWidget(dataType, config)) {
      if (Array.isArray(dataType)) {
        // COMBO type
        let defaultValue = null;
        if (initialValues && name in initialValues) {
          defaultValue = initialValues[name];
          console.log(`[WorkflowGraphService] Using initial value for COMBO ${name}:`, defaultValue);
        } else {
          // use first option as default
          defaultValue = dataType[0] || null;
        }
        values.push(defaultValue);
      } else {
        // Regular widget type
        // Use initial value if available and valid
        let defaultValue = null;
        if (initialValues && name in initialValues) {
          defaultValue = initialValues[name];
          console.log(`[WorkflowGraphService] Using initial value for ${name}:`, defaultValue);
        } else {
          defaultValue = getDefaultValue(dataType, config);
        }

        values.push(defaultValue);

        // Special case: if this is an INT widget named 'seed' or 'noise_seed', 
        // append an additional "Fixed" string value
        if (dataType === 'INT' && (name === 'seed' || name === 'noise_seed')) {
          values.push("Fixed");
        }
      }
    }
  });

  return values;
}

/**
 * Get widget type for UI rendering
 */
function getWidgetType(dataType: string, config: any): string {
  if (config && (config.values || config.options)) {
    return 'combo';
  }

  switch (dataType) {
    case 'INT':
    case 'FLOAT':
      return 'number';
    case 'BOOLEAN':
      return 'toggle';
    case 'STRING':
      return config?.multiline ? 'textarea' : 'text';
    default:
      return 'text';
  }
}

/**
 * Get default value for a specific input type
 */
function getDefaultValue(dataType: string, config: any): any {
  if (config && 'default' in config) {
    return config.default;
  }

  switch (dataType) {
    case 'INT':
      return config?.min || 0;
    case 'FLOAT':
      return config?.min || 0.0;
    case 'BOOLEAN':
      return false;
    case 'STRING':
      return '';
    default:
      if (config?.values && config.values.length > 0) {
        return config.values[0];
      }
      return null;
  }
}

/**
 * Collect all link IDs associated with a node from workflow JSON
 * @param workflowJson - The workflow JSON
 * @param nodeId - The node ID to collect links for
 * @returns Array of link IDs that are connected to this node
 */
export function collectNodeLinkIds(workflowJson: IComfyJson, nodeId: number): number[] {
  const linkIds: Set<number> = new Set();

  // Find the target node
  const targetNode = workflowJson.nodes?.find(node => node.id === nodeId);
  if (!targetNode) {
    return [];
  }

  // Collect link IDs from node's inputs
  if (targetNode.inputs) {
    for (const input of targetNode.inputs) {
      if (input.link !== null && input.link !== undefined) {
        linkIds.add(input.link);
      }
    }
  }

  // Collect link IDs from node's outputs
  if (targetNode.outputs) {
    for (const output of targetNode.outputs) {
      if (output.links) {
        // Handle both array and null cases
        if (Array.isArray(output.links)) {
          output.links.forEach((linkId: number) => {
            if (linkId !== null && linkId !== undefined) {
              linkIds.add(linkId);
            }
          });
        }
      }
    }
  }

  return Array.from(linkIds);
}

/**
 * Remove a node and all its associated links from workflow JSON and ComfyGraph
 * @param workflowJson - The workflow JSON
 * @param comfyGraph - The ComfyGraph instance  
 * @param nodeId - The node ID to remove
 * @returns Object containing updated workflowJson and comfyGraph
 */
export function removeNodeWithLinks(
  workflowJson: IComfyJson,
  comfyGraph: ComfyGraph,
  nodeId: number
): { workflowJson: IComfyJson; comfyGraph: ComfyGraph } {

  // 1. Collect all link IDs associated with the node
  const linkIdsToRemove = collectNodeLinkIds(workflowJson, nodeId);

  // 2. Create deep copy of workflow JSON for safe mutation
  const updatedWorkflowJson: IComfyJson = JSON.parse(JSON.stringify(workflowJson));

  // 3. Remove links from workflow JSON links array
  if (updatedWorkflowJson.links && Array.isArray(updatedWorkflowJson.links)) {
    updatedWorkflowJson.links = updatedWorkflowJson.links.filter(link => {
      // Link format: [linkId, sourceNodeId, sourceSlot, targetNodeId, targetSlot, type]
      const linkId = link[0];
      return !linkIdsToRemove.includes(linkId);
    });
  }

  // 4. Remove the node from workflow JSON nodes array
  if (updatedWorkflowJson.nodes && Array.isArray(updatedWorkflowJson.nodes)) {
    updatedWorkflowJson.nodes = updatedWorkflowJson.nodes.filter(node => node.id !== nodeId);
  }

  // 5. Remove links from other nodes that reference the deleted links
  if (updatedWorkflowJson.nodes) {
    updatedWorkflowJson.nodes.forEach(node => {
      // Clean up input links
      if (node.inputs) {
        node.inputs.forEach(input => {
          if (input.link !== null && input.link !== undefined && linkIdsToRemove.includes(input.link)) {
            input.link = null;
          }
        });
      }

      // Clean up output links
      if (node.outputs) {
        node.outputs.forEach(output => {
          if (output.links && Array.isArray(output.links)) {
            output.links = output.links.filter((linkId: number) =>
              linkId === null || linkId === undefined || !linkIdsToRemove.includes(linkId)
            );
            // Convert empty array to null if needed for consistency
            if (output.links.length === 0) {
              output.links = null;
            }
          }
        });
      }
    });
  }

  // 6. Update ComfyGraph - remove links first, then the node
  const updatedComfyGraph = new ComfyGraph();
  Object.assign(updatedComfyGraph, comfyGraph);

  // Remove links from ComfyGraph._links
  linkIdsToRemove.forEach(linkId => {
    if (updatedComfyGraph._links[linkId]) {
      delete updatedComfyGraph._links[linkId];
    }
  });

  // Remove the node from ComfyGraph._nodes
  updatedComfyGraph._nodes = updatedComfyGraph._nodes.filter(node => {
    const nodeIdNumber = typeof node.id === 'string' ? parseInt(node.id) : node.id;
    return nodeIdNumber !== nodeId;
  });

  return {
    workflowJson: updatedWorkflowJson,
    comfyGraph: updatedComfyGraph
  };
}

/**
 * Remove a group from workflow JSON and graph
 */
export function removeGroup(
  workflowJson: IComfyJson,
  comfyGraph: ComfyGraph,
  groupId: number
): { workflowJson: IComfyJson; comfyGraph: ComfyGraph } {

  // 1. Create deep copy of workflow JSON for safe mutation
  const updatedWorkflowJson: IComfyJson = JSON.parse(JSON.stringify(workflowJson));

  // 2. Remove the group from workflow JSON groups array
  if (updatedWorkflowJson.groups && Array.isArray(updatedWorkflowJson.groups)) {
    updatedWorkflowJson.groups = updatedWorkflowJson.groups.filter(group => group.id !== groupId);
  }

  // 3. Create updated ComfyGraph
  const updatedGraph = new ComfyGraph();

  console.log(`✅ Group ${groupId} removed from workflow and graph`);

  return { workflowJson: updatedWorkflowJson, comfyGraph: updatedGraph };
}

// Main export object containing all workflow graph service functions
export const WorkflowGraphService = {
  loadWorkflow,
  createGraphFromWorkflow,
  serializeGraphToWorkflow,
  loadWorkflowToGraph,
  serializeGraph,
  addNodeToWorkflow,
  collectNodeLinkIds,
  removeNodeWithLinks,
  removeGroup
} as const;

// Backward compatibility
export const ComfyGraphProcessor = WorkflowGraphService;