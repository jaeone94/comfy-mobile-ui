/**
 * ComfyUI API Functions - Pure functional approach
 * All functions take serverUrl as parameter instead of using global state
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { loadWorkflowToGraph, serializeGraphToWorkflow } from '@/core/services/WorkflowGraphService';
import { PromptWebSocketService, ExecutionMonitorResult } from '../websocket/PromptWebSocketService';
import processCustomNodes from '@/core/services/CustomNodeProcessor';
import type {
  IComfyPromptResponse,
  IComfyHistoryResponse,
  ExecutionOptions,
  IComfyNodeOutput,
  ExecutionStatus,
  ServerInfo,
} from '@/shared/types/comfy/IComfyAPI';

// ============================================================================
// BYPASS NODE AND REROUTE NODE ROUTING FUNCTIONS
// ============================================================================

/**
 * Handle bypass node routing by connecting inputs to outputs through type matching
 * @param bypassNode The bypass node to process
 * @param outputSlot The output slot being requested
 * @param graph The complete graph for link resolution
 * @returns The routed connection [nodeId, outputIndex] or null if no match
 */
function routeBypassNode(bypassNode: any, outputSlot: number, graph: any): [string, number] | null {
  console.log(`🔍 routeBypassNode: node ${bypassNode.id}, outputSlot ${outputSlot}`);

  // Get the output definition for the requested slot
  const outputDef = bypassNode.outputs?.[outputSlot];
  if (!outputDef) {
    console.log(`🔍 No output definition for slot ${outputSlot}`);
    return null;
  }

  const requestedType = outputDef.type;
  console.log(`🔍 Requested type: ${requestedType}`);

  // Create search order: [requested_slot, all_input_slots...]
  const inputSlots = bypassNode.inputs ? Array.from({ length: bypassNode.inputs.length }, (_, i) => i) : [];
  const searchOrder = [outputSlot, ...inputSlots];
  console.log(`🔍 Search order: [${searchOrder.join(', ')}]`);

  // Find matching input by type, prioritizing same position
  for (const inputIndex of searchOrder) {
    const input = bypassNode.inputs?.[inputIndex];
    if (!input) {
      console.log(`🔍 No input at index ${inputIndex}`);
      continue;
    }

    console.log(`🔍 Input ${inputIndex}: type=${input.type}, link=${input.link}, name=${input.name}`);

    // Check type match
    if (input.type === requestedType && input.link !== null && input.link !== undefined) {
      console.log(`🔍 Type match found! Looking for sourceLink for link ${input.link}`);
      // Find the source of this input link
      const sourceLink = findSourceForLink(graph, input.link);
      console.log(`🔍 SourceLink result:`, sourceLink);
      if (sourceLink) {
        // Recursively resolve if source is also bypass
        const sourceNode = graph._nodes.find((n: any) => String(n.id) === String(sourceLink.sourceNodeId));
        if (sourceNode && sourceNode.mode === 4) {
          console.log(`🔍 Source is bypass, recursing...`);
          // Source is also bypass, recursively route
          return routeBypassNode(sourceNode, sourceLink.outputIndex, graph);
        }

        console.log(`🔍 Found final route: [${sourceLink.sourceNodeId}, ${sourceLink.outputIndex}]`);
        // Source is normal node, return connection
        return [String(sourceLink.sourceNodeId), sourceLink.outputIndex];
      }
    }
  }

  console.log(`🔍 No route found for node ${bypassNode.id} output ${outputSlot}`);
  return null;
}

/**
 * Handle Reroute node routing (simpler than bypass - just one input to one output)
 * @param rerouteNode The Reroute node to process  
 * @param graph The complete graph for link resolution
 * @returns The routed connection [nodeId, outputIndex] or null if no connection
 */
function routeRerouteNode(rerouteNode: any, graph: any): [string, number] | null {
  console.log(`🔍 routeRerouteNode: node ${rerouteNode.id}`);

  // Reroute nodes have exactly one input and one output
  if (!rerouteNode.inputs || rerouteNode.inputs.length === 0) {
    console.log(`🔍 Reroute node ${rerouteNode.id} has no inputs`);
    return null;
  }

  const input = rerouteNode.inputs[0];
  if (input.link === null || input.link === undefined) {
    console.log(`🔍 Reroute node ${rerouteNode.id} input not connected`);
    return null;
  }

  console.log(`🔍 Reroute node ${rerouteNode.id} input link: ${input.link}`);

  // Find the source of this input link
  const sourceLink = findSourceForLink(graph, input.link);
  if (sourceLink) {
    // Check if source is also a Reroute node - recursively resolve
    const sourceNode = graph._nodes.find((n: any) => String(n.id) === String(sourceLink.sourceNodeId));
    if (sourceNode && sourceNode.type === 'Reroute') {
      console.log(`🔍 Source is also Reroute, recursing...`);
      return routeRerouteNode(sourceNode, graph);
    }

    console.log(`🔍 Reroute node ${rerouteNode.id} routes to: [${sourceLink.sourceNodeId}, ${sourceLink.outputIndex}]`);
    return [String(sourceLink.sourceNodeId), sourceLink.outputIndex];
  }

  console.log(`🔍 No route found for Reroute node ${rerouteNode.id}`);
  return null;
}

/**
 * Build a map of all bypass nodes and their routing information
 * @param graph The complete graph
 * @returns Map of bypass routes: nodeId-outputSlot -> [sourceNodeId, sourceOutputSlot]
 */
function buildBypassRoutingMap(graph: any): Map<string, [string, number] | null> {
  console.log(`🔍 buildBypassRoutingMap received graph with:`, {
    hasLinks: !!graph.links,
    has_links: !!graph._links,
    linksKeys: graph.links ? Object.keys(graph.links) : 'none',
    _linksKeys: graph._links ? Object.keys(graph._links) : 'none',
    topLevelKeys: Object.keys(graph)
  });

  const routingMap = new Map<string, [string, number] | null>();

  // Find all bypass nodes
  const bypassNodes = graph._nodes.filter((node: any) => node.mode === 4);
  console.log(`🔀 Building bypass routing map: found ${bypassNodes.length} bypass nodes`);

  for (const bypassNode of bypassNodes) {
    console.log(`🔀 Processing bypass node ${bypassNode.id} (${bypassNode.type})`);
    // Map each output slot of this bypass node
    if (bypassNode.outputs) {
      for (let outputIndex = 0; outputIndex < bypassNode.outputs.length; outputIndex++) {
        const routeKey = `${bypassNode.id}-${outputIndex}`;
        const route = routeBypassNode(bypassNode, outputIndex, graph);
        console.log(`🔀 Route ${routeKey} -> ${route ? `[${route[0]}, ${route[1]}]` : 'null'}`);
        routingMap.set(routeKey, route);
      }
    }
  }

  console.log(`🔀 Bypass routing map built with ${routingMap.size} routes`);
  return routingMap;
}

/**
 * Build a map of all Reroute nodes and their routing information
 * @param graph The complete graph
 * @returns Map of Reroute routes: nodeId -> [sourceNodeId, sourceOutputSlot]
 */
function buildRerouteRoutingMap(graph: any): Map<string, [string, number] | null> {
  console.log(`🔄 Building Reroute routing map...`);

  const routingMap = new Map<string, [string, number] | null>();

  // Find all Reroute nodes
  const rerouteNodes = graph._nodes.filter((node: any) => node.type === 'Reroute');
  console.log(`🔄 Building Reroute routing map: found ${rerouteNodes.length} Reroute nodes`);

  for (const rerouteNode of rerouteNodes) {
    console.log(`🔄 Processing Reroute node ${rerouteNode.id}`);
    const route = routeRerouteNode(rerouteNode, graph);
    console.log(`🔄 Route ${rerouteNode.id} -> ${route ? `[${route[0]}, ${route[1]}]` : 'null'}`);
    routingMap.set(String(rerouteNode.id), route);
  }

  console.log(`🔄 Reroute routing map built with ${routingMap.size} routes`);
  return routingMap;
}

/**
 * Handle PrimitiveNode processing - updates connected widgets with primitive value
 * @param primitiveNode The PrimitiveNode to process  
 * @param graph The complete graph for link resolution
 */
function processPrimitiveNode(primitiveNode: any, graph: any): void {
  console.log(`🔍 processPrimitiveNode: node ${primitiveNode.id}`);

  // PrimitiveNode should have a value in its widgets_values[0]
  if (!primitiveNode.widgets_values || primitiveNode.widgets_values.length === 0) {
    console.log(`🔍 PrimitiveNode ${primitiveNode.id} has no widgets_values`);
    return;
  }

  const primitiveValue = primitiveNode.widgets_values[0];
  console.log(`🔍 PrimitiveNode ${primitiveNode.id} value: ${primitiveValue}`);

  // Find all nodes that are connected to this PrimitiveNode's output
  if (!graph._links) {
    console.log(`🔍 No links in graph for PrimitiveNode ${primitiveNode.id}`);
    return;
  }

  // Find links where this primitive node is the source (origin)
  const outgoingLinks = Object.values(graph._links).filter((link: any) =>
    String(link.origin_id) === String(primitiveNode.id)
  );

  console.log(`🔍 PrimitiveNode ${primitiveNode.id} has ${outgoingLinks.length} outgoing links`);

  for (const link of outgoingLinks) {
    const targetNodeId = String((link as any).target_id);
    const targetSlot = (link as any).target_slot;

    console.log(`🔍 Processing link to node ${targetNodeId}, slot ${targetSlot}`);

    // Find the target node
    const targetNode = graph._nodes.find((n: any) => String(n.id) === targetNodeId);
    if (!targetNode) {
      console.log(`🔍 Target node ${targetNodeId} not found`);
      continue;
    }

    // Find the input slot that corresponds to this link
    if (!targetNode.inputs || targetSlot >= targetNode.inputs.length) {
      console.log(`🔍 Target node ${targetNodeId} invalid input slot ${targetSlot}`);
      continue;
    }

    const inputSlot = targetNode.inputs[targetSlot];
    console.log(`🔍 Target input: ${inputSlot.name} on node ${targetNodeId}`);

    // Update the target node's widget_values for this parameter
    // We need to find the widget index for this input parameter BEFORE unlinking
    updateNodeWidgetValue(targetNode, inputSlot.name, primitiveValue, graph);

    // Set the input link to null since we're replacing it with the actual value
    inputSlot.link = null;
    console.log(`🔍 Unlinked input ${inputSlot.name} on node ${targetNodeId} and set value to ${primitiveValue}`);
  }
}

/**
 * Update a node's widget_values for a specific parameter
 * @param node The target node to update
 * @param paramName The parameter name to update
 * @param value The new value to set
 * @param graph The complete graph for context
 */
function updateNodeWidgetValue(node: any, paramName: string, value: any, graph: any): void {
  console.log(`🔍 updateNodeWidgetValue: node ${node.id}, param ${paramName}, value ${value}`);

  // Initialize widgets_values if it doesn't exist
  if (!node.widgets_values) {
    node.widgets_values = [];
    console.log(`🔍 Initialized widgets_values for node ${node.id}`);
  }

  // For array format widgets_values, we need to find the correct index
  if (Array.isArray(node.widgets_values)) {
    // We need to determine the parameter order for this node
    // This is a simplified approach - in a real implementation, 
    // you might need to use metadata service to get the correct index

    // Try to find the parameter index by examining inputs
    let paramIndex = -1;
    if (node.inputs) {
      // For PrimitiveNode processing, we need to find the index among all widget parameters
      // This includes both currently unlinked inputs AND the one we're about to unlink

      // First, find the input we're trying to set
      const targetInputIndex = node.inputs.findIndex((input: any) => input.name === paramName);

      if (targetInputIndex !== -1) {
        // Count how many inputs before this one would be widgets (not linked or about to be unlinked)
        paramIndex = 0;
        for (let i = 0; i < targetInputIndex; i++) {
          const input = node.inputs[i];
          // Count inputs that are either unlinked or will become widget parameters
          if (input.link === null) {
            paramIndex++;
          }
        }

        // Ensure the array is large enough
        while (node.widgets_values.length <= paramIndex) {
          node.widgets_values.push(null);
        }

        node.widgets_values[paramIndex] = value;
        console.log(`🔍 Updated widgets_values[${paramIndex}] = ${value} for node ${node.id} (input: ${paramName})`);
        return;
      } else {
        console.log(`🔍 Input ${paramName} not found in node ${node.id} inputs`);
      }
    }

    console.log(`🔍 Could not determine parameter index for ${paramName} on node ${node.id}`);
  } else if (typeof node.widgets_values === 'object') {
    // Object format
    node.widgets_values[paramName] = value;
    console.log(`🔍 Updated widgets_values.${paramName} = ${value} for node ${node.id}`);
  }
}

/**
 * Build a map of all PrimitiveNode processing information and apply them
 * @param graph The complete graph
 * @returns void - PrimitiveNodes are processed in place
 */
function processPrimitiveNodes(graph: any): void {
  console.log(`🔄 Processing PrimitiveNodes...`);

  // Find all PrimitiveNode nodes
  const primitiveNodes = graph._nodes.filter((node: any) => node.type === 'PrimitiveNode');
  console.log(`🔄 Found ${primitiveNodes.length} PrimitiveNode nodes`);

  for (const primitiveNode of primitiveNodes) {
    console.log(`🔄 Processing PrimitiveNode ${primitiveNode.id}`);
    processPrimitiveNode(primitiveNode, graph);
  }

  console.log(`🔄 PrimitiveNode processing complete`);
}

/**
 * Resolve a connection, handling bypass and Reroute nodes transparently with recursive resolution
 * @param nodeId The target node ID
 * @param outputIndex The output slot index  
 * @param graph The complete graph
 * @param bypassRoutes Pre-computed bypass routing map
 * @param rerouteRoutes Pre-computed Reroute routing map
 * @returns Final resolved connection [nodeId, outputIndex] or original if not bypass/reroute
 */
function resolveConnection(
  nodeId: string,
  outputIndex: number,
  graph: any,
  bypassRoutes: Map<string, [string, number] | null>,
  rerouteRoutes: Map<string, [string, number] | null>
): [string, number] {
  console.log(`🔄 resolveConnection: ${nodeId}-${outputIndex}`);

  // Check for bypass node routing first
  const bypassRouteKey = `${nodeId}-${outputIndex}`;
  const bypassRoute = bypassRoutes.get(bypassRouteKey);

  if (bypassRoute) {
    console.log(`🔄 Found bypass route: ${nodeId}-${outputIndex} -> ${bypassRoute[0]}-${bypassRoute[1]}`);
    // Recursively resolve in case the bypass target is also a virtual node
    return resolveConnection(bypassRoute[0], bypassRoute[1], graph, bypassRoutes, rerouteRoutes);
  }

  // Check for Reroute node routing  
  const rerouteRoute = rerouteRoutes.get(nodeId);

  if (rerouteRoute) {
    console.log(`🔄 Found reroute route: ${nodeId} -> ${rerouteRoute[0]}-${rerouteRoute[1]}`);
    // Recursively resolve in case the reroute target is also a virtual node
    return resolveConnection(rerouteRoute[0], rerouteRoute[1], graph, bypassRoutes, rerouteRoutes);
  }

  console.log(`🔄 Final resolution: ${nodeId}-${outputIndex}`);
  // Not a bypass or reroute connection, return as-is
  return [nodeId, outputIndex];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Process date format strings like %date:yyyyMMdd% or %date:yyyy-MM-dd%
 * Converts them to actual date strings based on current date
 */
function processDateFormatString(input: string): string {
  const datePattern = /%date:([^%]+)%/g;
  const currentDate = new Date();

  return input.replace(datePattern, (match, format) => {
    try {
      return formatDate(currentDate, format);
    } catch (error) {
      console.warn(`⚠️ Failed to format date with pattern "${format}": ${error}`);
      return match; // Return original if formatting fails
    }
  });
}

/**
 * Format date according to the given pattern
 * Supports: yyyy, MM, dd, yyyy-MM-dd, yyyyMMdd, etc.
 */
function formatDate(date: Date, pattern: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return pattern
    .replace(/yyyy/g, String(year))
    .replace(/MM/g, month)
    .replace(/dd/g, day);
}

/**
 * Preprocess Graph widget values - filter control_after_generate values and process date formats
 */
function preprocessGraphWidgets(graph: any): void {

  const controlValues = ["fixed", "increment", "decrement", "randomize"];

  if (!graph._nodes) return;

  for (const node of graph._nodes) {
    // Filter control_after_generate values from sampler nodes
    if (node.type.toLowerCase().includes('sampler')) {
      // For array widgets_values, filter out control values
      if (Array.isArray(node.widgets_values)) {
        const originalValues = [...node.widgets_values];
        node.widgets_values = node.widgets_values.filter((value: any) =>
          !controlValues.some(controlValue =>
            String(value).toLowerCase() === controlValue.toLowerCase()
          )
        );

        if (originalValues.length !== node.widgets_values.length) {
          const removedValues = originalValues.filter((value: any) =>
            controlValues.some(controlValue =>
              String(value).toLowerCase() === controlValue.toLowerCase()
            )
          );
        }
      }

      // For object widgets_values, remove control properties
      if (node.widgets_values && typeof node.widgets_values === 'object' && !Array.isArray(node.widgets_values)) {
        for (const [key, value] of Object.entries(node.widgets_values)) {
          if (controlValues.some(controlValue =>
            String(value).toLowerCase() === controlValue.toLowerCase()
          )) {
            delete node.widgets_values[key];
          }
        }
      }
    }

    // Process date format strings for filename_prefix in widgets_values
    if (Array.isArray(node.widgets_values)) {
      for (let i = 0; i < node.widgets_values.length; i++) {
        const value = node.widgets_values[i];
        if (typeof value === 'string' && value.includes('%date:')) {
          const processedValue = processDateFormatString(value);
          if (value !== processedValue) {
            node.widgets_values[i] = processedValue;
          }
        }
      }
    }

    if (node.widgets_values && typeof node.widgets_values === 'object' && !Array.isArray(node.widgets_values)) {
      for (const [key, value] of Object.entries(node.widgets_values)) {
        if (typeof value === 'string' && value.includes('%date:')) {
          const processedValue = processDateFormatString(value);
          if (value !== processedValue) {
            node.widgets_values[key] = processedValue;
          }
        }
      }
    }

    // Process date format strings in _widgets array (new approach)
    if (Array.isArray(node._widgets)) {
      for (const widget of node._widgets) {
        if (typeof widget.value === 'string' && widget.value.includes('%date:')) {
          const processedValue = processDateFormatString(widget.value);
          if (widget.value !== processedValue) {
            console.log(`📅 Converting date format in widget "${widget.name}": "${widget.value}" -> "${processedValue}"`);
            widget.value = processedValue;
          }
        }
      }
    }
  }
}

/**
 * Legacy preprocessing function (kept for compatibility)
 */
function preprocessWorkflow(workflowData: any): void {
  // This function is now deprecated in favor of preprocessGraphWidgets
  // but kept for backward compatibility
}

// Types
export interface ComfyAPIConfig {
  timeout?: number;
  retries?: number;
}

export interface ExecutionResult {
  promptId: string;
  success: boolean;
  outputs?: IComfyNodeOutput[];
  error?: string;
}

// Utility functions
const generateClientId = (): string => {
  return `comfy-mobile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const generatePromptId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get server information and available node types
 */
export const getServerInfo = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<ServerInfo> => {
  const { timeout = 5000 } = config;

  try {
    const response = await axios.get(`${serverUrl}/object_info`, { timeout });

    return {
      version: response.data?.version || 'unknown',
      nodeTypes: Object.keys(response.data || {}),
      objectInfo: response.data
    } as unknown as ServerInfo;
  } catch (error) {
    console.error('Failed to get server info:', error);
    throw new Error(`Failed to connect to ComfyUI server at ${serverUrl}`);
  }
};

/**
 * Clear server cache
 */
export const clearCache = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<boolean> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/free`, {
      unload_models: true,
      free_memory: true
    }, { timeout });

    return response.status === 200;
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return false;
  }
};

/**
 * Clear VRAM
 */
export const clearVRAM = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<boolean> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/free`, {
      unload_models: true,
      free_memory: true
    }, { timeout });

    return response.status === 200;
  } catch (error) {
    console.error('Failed to clear VRAM:', error);
    return false;
  }
};

/**
 * Convert workflow JSON directly to API format (all-in-one function)
 * @param workflowJson The workflow JSON object from ComfyUI
 * @param serverUrl The ComfyUI server URL for fetching object_info
 * @param config Optional configuration
 * @returns API workflow ready for execution
 */
export const convertJsonToAPI = async (
  workflowJson: any,
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<{ apiWorkflow: any; nodeCount: number }> => {
  const { timeout = 5000 } = config;

  try {
    console.log('🚀 convertJsonToAPI: Starting workflow JSON to API conversion...');

    // Step 1: Get object info from server
    console.log('📡 Fetching object_info from server...');
    const response = await axios.get(`${serverUrl}/object_info`, { timeout });
    const objectInfo = response.data;

    // Step 2: Convert JSON to Graph (disable preprocessing to avoid custom node mapping dependency)
    console.log('🔄 Converting JSON to Graph...');
    const graph = await loadWorkflowToGraph(workflowJson, objectInfo, true, false);

    // Step 3: Convert Graph to API format
    console.log('🔧 Converting Graph to API format...');
    const result = convertGraphToAPI(graph);

    console.log('✅ convertJsonToAPI: Conversion complete');
    return result;

  } catch (error) {
    console.error('❌ convertJsonToAPI failed:', error);
    throw new Error(`Failed to convert workflow JSON to API format: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Convert Graph to API format (Enhanced with legacy logic for better accuracy)
 */
export const convertGraphToAPI = (graph: any): { apiWorkflow: any; nodeCount: number } => {


  if (!graph._nodes || !Array.isArray(graph._nodes)) {
    throw new Error('Invalid graph structure: missing or invalid _nodes');
  }

  /* =========================================================================
   * STEP 1: Deep Copy Graph to Prevent Mutation
   * =========================================================================
   * 
   * Purpose: Creates a deep copy of the original LiteGraph structure to prevent 
   * any mutations during the conversion process.
   * 
   * Input Graph Structure:
   * ```json
   * {
   *   "_nodes": [
   *     {
   *       "id": 1,
   *       "type": "KSampler",
   *       "inputs": [
   *         { "name": "model", "type": "MODEL", "link": 5, "slot_index": 0, "widget": null },
   *         { "name": "seed", "type": "INT", "link": null, "slot_index": 1, "widget": {"name": "seed"} }
   *       ],
   *       "outputs": [
   *         { "name": "LATENT", "type": "LATENT", "links": [8], "slot_index": 0 }
   *       ],
   *       "widgets_values": [12345, "randomize", 20, 7.5, "euler", "normal"]
   *     }
   *   ],
   *   "_links": {
   *     "5": { "id": 5, "origin_id": 2, "origin_slot": 0, "target_id": 1, "target_slot": 0 },
   *     "8": { "id": 8, "origin_id": 1, "origin_slot": 0, "target_id": 9, "target_slot": 0 }
   *   }
   * }
   * ```
   * 
   * Output: Identical structure but deeply cloned (safe for mutation)
   * - All node arrays (inputs, outputs, widgets_values) are now independent copies
   * - Links object is duplicated to prevent reference sharing
   */
  let workingGraph = deepCopyGraph(graph);

  /* =========================================================================
   * STEP 2-4: Preprocess Variables and SetNode Registration
   * =========================================================================
   * 
   * Purpose: Handles ComfyUI's variable system by processing SetNode declarations 
   * and preparing for GetNode resolution. Also preprocesses widget values to clean 
   * control_after_generate values.
   * 
   * Input Graph (nodes with control values and SetNode):
   * ```json
   * {
   *   "_nodes": [
   *     {
   *       "id": 1, "type": "SetNode",
   *       "inputs": [{"name": "value", "type": "MODEL", "link": 15}],
   *       "widgets_values": ["my_model_var"]
   *     },
   *     {
   *       "id": 2, "type": "KSampler", 
   *       "widgets_values": [12345, "randomize", 20, 7.5] // Contains control values
   *     },
   *     {
   *       "id": 3, "type": "GetNode",
   *       "widgets_values": ["my_model_var"]
   *     }
   *   ]
   * }
   * ```
   * 
   * Output Graph (control values filtered, SetNodes registered):
   * ```json
   * {
   *   "_nodes": [
   *     {"id": 1, "type": "SetNode", "widgets_values": ["my_model_var"]},
   *     {"id": 2, "type": "KSampler", "widgets_values": [12345, 20, 7.5]}, // "randomize" removed
   *     {"id": 3, "type": "GetNode", "widgets_values": ["my_model_var"]}
   *   ]
   * }
   * ```
   * 
   * Variable Store Created:
   * ```json
   * {
   *   "my_model_var": {
   *     "sourceNodeId": "1",
   *     "dataType": "MODEL", 
   *     "value": ["5", 0] // [sourceNodeId, outputSlot] from link resolution
   *   }
   * }
   * ```
   */
  const { workingGraph: processedGraph, variableStore } = preprocessVariablesAndSetNodes(workingGraph);
  workingGraph = processedGraph;

  /* =========================================================================
   * STEP 5: Resolve GetNode Connections
   * =========================================================================
   * 
   * Purpose: Replaces GetNode references with direct connections to their 
   * variable sources, effectively "flattening" the variable system into direct links.
   * 
   * Input Graph (with GetNode still connected):
   * ```json
   * {
   *   "_nodes": [...], // Contains GetNode that references "my_model_var"
   *   "_links": {
   *     "20": {"origin_id": 3, "origin_slot": 0, "target_id": 10, "target_slot": 0} // GetNode to KSampler
   *   }
   * }
   * ```
   * 
   * Output Graph (GetNode connections replaced with direct variable source links):
   * ```json
   * {
   *   "_nodes": [...], // Same nodes, GetNode still present but bypassed
   *   "_links": {
   *     "20": {"origin_id": 3, "origin_slot": 0, "target_id": 10, "target_slot": 0}, // Old GetNode link
   *     "21": {"origin_id": 5, "origin_slot": 0, "target_id": 10, "target_slot": 0} // NEW: Direct variable source link
   *   }
   * }
   * ```
   * 
   * Key Changes:
   * - New links created that bypass GetNode and connect directly to variable sources
   * - Target nodes' inputs are updated to point to new direct links
   * - Original GetNode links remain but are effectively unused
   */
  workingGraph = resolveGetNodeConnections(workingGraph, variableStore);

  /* =========================================================================
   * STEP 5.5: Build Bypass and Reroute Routing Maps (Critical Timing!)
   * =========================================================================
   * 
   * Purpose: Creates routing maps for bypass and Reroute nodes BEFORE virtual nodes are removed.
   * This is critical because these nodes will be filtered out in the next step, 
   * but we need their connection information for proper API routing.
   * 
   * Input Graph (with bypass and Reroute nodes present):
   * ```json
   * {
   *   "_nodes": [
   *     {
   *       "id": 7, "type": "Switch", "mode": 4, // mode 4 = bypass
   *       "inputs": [
   *         {"name": "input_A", "type": "LATENT", "link": 12},
   *         {"name": "input_B", "type": "LATENT", "link": 13}
   *       ],
   *       "outputs": [{"name": "output", "type": "LATENT", "links": [14]}]
   *     },
   *     {
   *       "id": 8, "type": "Reroute", // Simple routing node
   *       "inputs": [{"name": "input", "type": "LATENT", "link": 15}],
   *       "outputs": [{"name": "output", "type": "LATENT", "links": [16]}]
   *     }
   *   ]
   * }
   * ```
   * 
   * Routing Maps Created:
   * ```json
   * // Bypass Routing Map:
   * {
   *   "7-0": ["5", 1] // bypass node 7, output slot 0 routes to node 5, output slot 1
   * }
   * 
   * // Reroute Routing Map:  
   * {
   *   "8": ["6", 0] // Reroute node 8 routes to node 6, output slot 0
   * }
   * ```
   * 
   * Key Operations:
   * - Identifies all nodes with mode === 4 (bypass) and type === 'Reroute'
   * - For bypass nodes: determines which input should be routed through for each output
   * - For Reroute nodes: simple 1-to-1 input->output mapping
   * - Creates mappings that will be used later during API conversion
   * - Must happen BEFORE virtual nodes are removed!
   */
  const bypassRoutingMap = buildBypassRoutingMap(workingGraph);
  const rerouteRoutingMap = buildRerouteRoutingMap(workingGraph);

  /* =========================================================================
   * STEP 5.7: Process PrimitiveNode Virtual Nodes
   * =========================================================================
   * 
   * Purpose: Process PrimitiveNode virtual nodes BEFORE they are removed.
   * PrimitiveNodes contain constant values that need to be applied to connected widgets.
   * 
   * Processing Logic:
   * 1. Find all PrimitiveNode nodes in the graph
   * 2. For each PrimitiveNode, get its value from widgets_values[0]
   * 3. Find all nodes connected to this PrimitiveNode's output
   * 4. Update the connected node's widget_values with the primitive value
   * 5. Set the input link to null (unlink the connection)
   * 
   * Example:
   * - PrimitiveNode(5) has widgets_values: ["Hello World"]
   * - Connected to CLIPTextEncode(10) input "text"  
   * - After processing: CLIPTextEncode(10) gets "Hello World" in its widgets_values
   * - Connection is removed: CLIPTextEncode(10).inputs["text"].link = null
   */
  processPrimitiveNodes(workingGraph);

  /* =========================================================================
   * STEP 6: Filter Out Virtual Nodes  
   * =========================================================================
   * 
   * Purpose: Removes nodes that exist only for LiteGraph UI purposes and don't 
   * correspond to actual ComfyUI backend processing nodes.
   * 
   * Input Graph (with virtual nodes):
   * ```json
   * {
   *   "_nodes": [
   *     {"id": 1, "type": "KSampler"},        // Real processing node
   *     {"id": 2, "type": "Note"},            // Virtual UI node  
   *     {"id": 3, "type": "SetNode"},         // Virtual variable node
   *     {"id": 4, "type": "Reroute"},         // Virtual routing node
   *     {"id": 5, "type": "CLIPTextEncode"},  // Real processing node
   *     {"id": 6, "type": "PrimitiveNode"},   // Virtual primitive node
   *     {"id": 7, "type": "Switch", "mode": 4} // Bypass node (removed)
   *   ]
   * }
   * ```
   * 
   * Output Graph (only real processing nodes):
   * ```json
   * {
   *   "_nodes": [
   *     {"id": 1, "type": "KSampler"},        // Kept - real node
   *     {"id": 5, "type": "CLIPTextEncode"}   // Kept - real node
   *   ],
   *   "_links": {...} // Links remain unchanged
   * }
   * ```
   * 
   * Virtual Node Types Removed:
   * - Note, MarkdownNote (documentation)
   * - Reroute, PrimitiveNode (connection helpers)  
   * - SetNode, GetNode (variable system - already processed)
   * - rgthree utility nodes (Fast Groups Bypasser, Display Any, etc.)
   * - Any node with mode === 4 (bypassed nodes)
   */
  workingGraph = filterOutVirtualNodes(workingGraph);

  /* =========================================================================
   * STEP 7: Transform Graph Nodes to ComfyUI API Format
   * =========================================================================
   * 
   * Purpose: Converts the cleaned LiteGraph structure into ComfyUI's expected 
   * API format with proper input handling, widget processing, and bypass routing.
   * 
   * Input Graph (cleaned LiteGraph structure):
   * ```json
   * {
   *   "_nodes": [
   *     {
   *       "id": 1, "type": "KSampler",
   *       "inputs": [
   *         {"name": "model", "type": "MODEL", "link": 5, "widget": null},
   *         {"name": "seed", "type": "INT", "link": null, "widget": {"name": "seed"}}
   *       ],
   *       "widgets_values": [12345, 20, 7.5, "euler", "normal"]
   *     }
   *   ],
   *   "_links": {"5": {"origin_id": 2, "origin_slot": 0, "target_id": 1, "target_slot": 0}}
   * }
   * ```
   * 
   * Output API Workflow (ComfyUI format):
   * ```json
   * {
   *   "1": {
   *     "inputs": {
   *       "model": ["2", 0],     // Connection: [nodeId, outputSlot]
   *       "seed": 12345,         // Widget value
   *       "steps": 20,           // Widget value  
   *       "cfg": 7.5,            // Widget value
   *       "sampler_name": "euler", // Widget value
   *       "scheduler": "normal"   // Widget value
   *     },
   *     "class_type": "KSampler",
   *     "_meta": {"title": "KSampler"}
   *   }
   * }
   * ```
   * 
   * Key Transformations:
   * - Node IDs become object keys
   * - Links become [sourceNodeId, outputSlot] arrays  
   * - Widget values mapped to correct input names using input.widget relationships
   * - Bypass connections resolved through routing map
   * - Muted nodes (mode === 2) are skipped
   */
  console.log(`🚀 Step 7: Starting API conversion with ${workingGraph._nodes.length} nodes`);
  let { apiWorkflow, nodeCount } = transformGraphNodesToApiFormat(workingGraph, bypassRoutingMap, rerouteRoutingMap);

  /* =========================================================================
   * STEP 8: Remove Orphaned Connections 
   * =========================================================================
   * 
   * Purpose: Cleans up any connections in the API workflow that reference 
   * nodes which were removed in previous steps (virtual nodes, bypass nodes, etc.)
   * 
   * Input API Workflow (with potential orphaned connections):
   * ```json
   * {
   *   "1": {
   *     "inputs": {
   *       "model": ["2", 0],        // Valid connection
   *       "positive": ["3", 0],     // Node 3 was removed - ORPHANED  
   *       "seed": 12345
   *     },
   *     "class_type": "KSampler"
   *   }
   * }
   * ```
   * 
   * Output API Workflow (orphaned connections removed):
   * ```json
   * {
   *   "1": {
   *     "inputs": {
   *       "model": ["2", 0],        // Valid connection kept
   *       "seed": 12345             // Widget values unaffected
   *     },
   *     "class_type": "KSampler"
   *   }
   * }
   * ```
   * 
   * Key Operations:
   * - Scans all inputs for [nodeId, outputSlot] connection arrays
   * - Checks if referenced nodeId exists in the current API workflow
   * - Removes connections to non-existent nodes
   * - Leaves widget values and valid connections unchanged
   */
  console.log('🚀 Step 8: Cleaning up broken connections...');
  apiWorkflow = removeOrphanedConnections(apiWorkflow);

  /* =========================================================================
   * STEP 9: Apply Custom Node Processing (API Stage)
   * =========================================================================
   * 
   * Purpose: Handle custom nodes that require API-specific transformations.
   * Currently minimal processing as most custom node handling is done 
   * during the workflow-to-Graph conversion process.
   * 
   * API Stage Processing:
   * - Reserved for transformations that can only happen after API conversion
   * - Currently no active custom node processing needed
   */
  console.log('🚀 Step 9: Applying API-stage custom node processing...');
  // Currently no custom node processing needed at API stage
  // processCustomNodes(apiWorkflow); // Reserved for future API-specific transformations

  return { apiWorkflow, nodeCount };
};

// @deprecated
// Use convertGraphToAPI instead
export const convertGraphToAPI_old = (graph: any): { apiWorkflow: any; nodeCount: number } => {
  // Step 1: Create a DEEP working copy for processing (fixed shallow copy issue)
  const workingGraph = {
    ...graph,
    _nodes: [...graph._nodes.map((node: any) => ({
      ...node,
      // Deep copy inputs and outputs arrays to prevent original graph modification
      inputs: node.inputs ? node.inputs.map((input: any) => ({ ...input })) : undefined,
      outputs: node.outputs ? node.outputs.map((output: any) => ({
        ...output,
        links: output.links ? [...output.links] : []
      })) : undefined,
      // Deep copy widgets_values if it's an array
      widgets_values: Array.isArray(node.widgets_values) ? [...node.widgets_values] : node.widgets_values
    }))],
    _links: { ...graph._links }
  };

  // Step 2: Preprocess working graph widget values (not original graph!)
  preprocessGraphWidgets(workingGraph);

  // Step 3: Initialize variable store for SetNode/GetNode processing (from legacy)
  const variableStore: Record<string, { sourceNodeId: string; dataType: string; value: any }> = {};

  // Step 4: Process all SetNode for variable registration (legacy logic)
  for (const node of workingGraph._nodes as any[]) {
    const nodeId = String(node.id);
    const nodeType = node.type;

    if (nodeType === 'SetNode' || nodeType === 'easy setNode') {
      // Extract variable name from widgets_values[0]
      const variableName = node.widgets_values && node.widgets_values[0] ? String(node.widgets_values[0]) : '';

      if (variableName) {
        // Get the input connection for the data value
        let dataValue: any = null;
        let dataType = 'UNKNOWN';

        // Check if SetNode has input connections
        if (node.inputs && node.inputs.length > 0) {
          const dataInput = node.inputs[0]; // Usually the first input is the data
          if (dataInput.link !== null) {
            // Find the source connection
            const sourceLink = findSourceForLink(workingGraph, dataInput.link);
            if (sourceLink) {
              dataValue = [sourceLink.sourceNodeId.toString(), sourceLink.outputIndex];
              dataType = dataInput.type || 'UNKNOWN';
            }
          }
        }

        // Store the variable information
        variableStore[variableName] = {
          sourceNodeId: nodeId,
          dataType,
          value: dataValue
        };

      }
    }
  }


  // Step 5: Process GetNode connections (legacy logic)
  const newLinks: Record<number, any> = { ...workingGraph._links };
  let nextLinkId = Math.max(...Object.keys(newLinks).map(Number)) + 1;

  for (const node of workingGraph._nodes as any[]) {
    if (node.type === 'GetNode' || node.type === 'easy getNode') {
      // Get variable name from GetNode
      const variableName = node.widgets_values && node.widgets_values[0] ? String(node.widgets_values[0]) : '';
      const variable = variableStore[variableName];

      if (variable && variable.value) {

        // Find all nodes that reference this GetNode
        for (const targetNode of workingGraph._nodes) {
          if (targetNode.inputs) {
            for (const input of targetNode.inputs) {
              if (input.link !== null) {
                const link = workingGraph._links[input.link];
                if (link && link.origin_id === node.id) { // This input connects to our GetNode

                  // Create new direct connection from variable source to target
                  const [sourceNodeId, sourceSlot] = variable.value;
                  const newLink = {
                    id: nextLinkId,
                    origin_id: Number(sourceNodeId),
                    origin_slot: sourceSlot,
                    target_id: targetNode.id,
                    target_slot: input.slot_index,
                    type: variable.dataType
                  };
                  newLinks[nextLinkId] = newLink;

                  // Update the input to point to the new link
                  input.link = nextLinkId;

                  nextLinkId++;
                }
              }
            }
          }
        }
      }
    }
  }

  // Update working graph with new links
  workingGraph._links = newLinks;

  // Step 6: Remove virtual nodes (legacy logic)
  const originalCount = workingGraph._nodes.length;
  workingGraph._nodes = workingGraph._nodes.filter((node: any) => !isVirtualNode(node));

  // Step 7: Convert processed graph to API format using inputs + widgets_values (legacy approach)
  const apiWorkflow: Record<string, any> = {};
  let nodeCount = 0;

  // Process each node to create API format
  for (const node of workingGraph._nodes as any[]) {
    const nodeId = String(node.id);
    const nodeType = node.type;

    // Validate essential node properties
    if (!nodeType) {
      console.error(`❌ Node ${nodeId} is missing type property:`, node);
      throw new Error(`Node ${nodeId} is missing type property`);
    }

    // Skip muted/bypassed/never nodes
    if (node.mode === 2 || node.mode === 4) {
      continue;
    }

    const inputs: Record<string, any> = {};

    // Step 1: Process all connections (inputs with links) first
    if (node.inputs) {
      for (const input of node.inputs) {
        if (input.link !== null && input.link !== undefined) {
          // Find the corresponding link
          const link = workingGraph._links[input.link];
          if (link) {
            inputs[input.name] = [String(link.origin_id), link.origin_slot];
          }
        }
      }
    }

    // Step 2: Process widget values using proper widget skipping logic (legacy approach)
    if (node.widgets_values && Array.isArray(node.widgets_values)) {

      // Build mapping: which widgets_values index corresponds to which input
      let widgetIndex = 0;

      if (node.inputs) {
        for (const input of node.inputs as any[]) {
          // Check if this input has a widget (can be controlled by widgets_values)
          if (input.widget) {

            // If this input is connected (has link), skip the widget value
            if (input.link !== null && input.link !== undefined) {
              widgetIndex++; // Skip this widget value

              // Special handling for control_after_generate - skip additional value
              if ((input.name === 'seed' || input.name === 'noise_seed') && widgetIndex < node.widgets_values.length) {
                const nextValue = node.widgets_values[widgetIndex];
                const CONTROL_VALUES = ['fixed', 'increment', 'decrement', 'randomize'];
                if (CONTROL_VALUES.includes(nextValue)) {
                  widgetIndex++; // Skip control value too
                }
              }
            } else {
              // Input is not connected, use widget value
              if (widgetIndex < node.widgets_values.length) {
                let widgetValue = node.widgets_values[widgetIndex];

                // Skip control_after_generate values
                const CONTROL_VALUES = ['fixed', 'increment', 'decrement', 'randomize'];
                if (CONTROL_VALUES.includes(widgetValue)) {
                  widgetIndex++;

                  // Get next value if available
                  if (widgetIndex < node.widgets_values.length) {
                    widgetValue = node.widgets_values[widgetIndex];
                  } else {
                    continue;
                  }
                }

                inputs[input.name] = widgetValue;
                widgetIndex++;
              } else {
              }
            }
          }
        }
      }

      // Handle any remaining widget values as param_N
      while (widgetIndex < node.widgets_values.length) {
        const paramName = `param_${widgetIndex - (node.inputs?.filter((i: any) => i.widget).length || 0)}`;
        inputs[paramName] = node.widgets_values[widgetIndex];
        widgetIndex++;
      }
    }

    // Step 3: Handle object-format widgets_values (newer ComfyUI extension format)
    if (node.widgets_values && typeof node.widgets_values === 'object' && !Array.isArray(node.widgets_values)) {
      for (const [widgetName, widgetValue] of Object.entries(node.widgets_values)) {
        // Only set widget value if input doesn't already have a connection
        if (!inputs[widgetName]) {
          inputs[widgetName] = widgetValue;
        }
      }
    }

    apiWorkflow[nodeId] = {
      inputs,
      class_type: nodeType,
      _meta: {
        title: node.title || nodeType
      }
    };

    nodeCount++;
  }

  // Step 8: Clean up inputs connected to removed nodes (legacy logic)
  for (const [nodeId, nodeData] of Object.entries(apiWorkflow)) {
    for (const [inputName, input] of Object.entries(nodeData.inputs)) {
      // Handle [nodeId, slotIndex] connections
      if (Array.isArray(input) && input.length === 2) {
        const [connectedNodeId] = input;

        // If connected node was removed, delete this connection
        if (!apiWorkflow[connectedNodeId]) {
          delete nodeData.inputs[inputName];
        }
      }
    }
  }


  return { apiWorkflow, nodeCount };
};

/**
 * Step 8: Clean up inputs connected to removed/non-existent nodes
 */
function removeOrphanedConnections(apiWorkflow: any): any {
  console.log('🧹 Cleaning up broken input connections...');

  for (const [nodeId, nodeData] of Object.entries(apiWorkflow)) {
    const node = nodeData as any;
    if (!node.inputs) continue;

    const inputsToRemove: string[] = [];

    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      // Handle [nodeId, slotIndex] connections
      if (Array.isArray(inputValue) && inputValue.length === 2) {
        const [connectedNodeId] = inputValue;

        // If connected node doesn't exist in API workflow, mark for removal
        if (!apiWorkflow[connectedNodeId]) {
          console.log(`🧹 Removing broken connection: ${nodeId}.${inputName} -> ${connectedNodeId} (node not found)`);
          inputsToRemove.push(inputName);
        }
      }
    }

    // Remove broken connections
    for (const inputName of inputsToRemove) {
      delete node.inputs[inputName];
    }
  }

  return apiWorkflow;
}


// ===== Step-by-Step Processing Functions =====

/**
 * Step 1: Create deep copy of graph to avoid mutating the original
 */
function deepCopyGraph(graph: any) {
  console.log('🔄 Step 1: Creating deep copy of graph...');
  const workingGraph = {
    ...graph,
    _nodes: [...graph._nodes.map((node: any) => ({
      ...node,
      // Deep copy inputs and outputs arrays to prevent original graph modification
      inputs: node.inputs ? node.inputs.map((input: any) => ({ ...input })) : undefined,
      outputs: node.outputs ? node.outputs.map((output: any) => ({
        ...output,
        links: output.links ? [...output.links] : []
      })) : undefined,
      // Deep copy widgets_values if it's an array
      widgets_values: Array.isArray(node.widgets_values) ? [...node.widgets_values] : node.widgets_values
    }))],
    _links: { ...graph._links }
  };

  console.log(`✅ Deep copy created: ${workingGraph._nodes.length} nodes, ${Object.keys(workingGraph._links).length} links`);
  return workingGraph;
}

/**
 * Step 2-4: Process variables (SetNode/GetNode logic)
 */
function preprocessVariablesAndSetNodes(workingGraph: any) {
  console.log('🔄 Step 2-4: Processing variables...');

  // Step 2: Preprocess working graph widget values (not original graph!)
  preprocessGraphWidgets(workingGraph);

  // Step 3: Initialize variable store for SetNode/GetNode processing (from legacy)
  const variableStore: Record<string, { sourceNodeId: string; dataType: string; value: any }> = {};

  // Step 4: Process all SetNode for variable registration (legacy logic)
  for (const node of workingGraph._nodes as any[]) {
    const nodeId = String(node.id);
    const nodeType = node.type;

    if (nodeType === 'SetNode' || nodeType === 'easy setNode') {
      // Extract variable name from widgets_values[0]
      const variableName = node.widgets_values && node.widgets_values[0] ? String(node.widgets_values[0]) : '';

      if (variableName) {
        // Get the input connection for the data value
        let dataValue: any = null;
        let dataType = 'UNKNOWN';

        // Check if SetNode has input connections
        if (node.inputs && node.inputs.length > 0) {
          const dataInput = node.inputs[0]; // Usually the first input is the data
          if (dataInput.link !== null) {
            // Find the source connection
            const sourceLink = findSourceForLink(workingGraph, dataInput.link);
            if (sourceLink) {
              dataValue = [sourceLink.sourceNodeId.toString(), sourceLink.outputIndex];
              dataType = dataInput.type || 'UNKNOWN';
            }
          }
        }

        // Store the variable information
        variableStore[variableName] = {
          sourceNodeId: nodeId,
          dataType,
          value: dataValue
        };
      }
    }
  }

  console.log(`✅ Variable processing complete: ${Object.keys(variableStore).length} variables`);
  return { workingGraph, variableStore };
}

/**
 * Step 5: Process GetNode connections and SetNode output bypass
 */
function resolveGetNodeConnections(workingGraph: any, variableStore: Record<string, any>) {
  console.log('🔄 Step 5: Processing GetNode connections and SetNode output bypass...');

  const newLinks: Record<number, any> = { ...workingGraph._links };
  let nextLinkId = Math.max(...Object.keys(newLinks).map(Number)) + 1;

  // Process GetNode connections (variable references)
  for (const node of workingGraph._nodes as any[]) {
    if (node.type === 'GetNode' || node.type === 'easy getNode') {
      const variableName = Array.isArray(node.widgets_values) && node.widgets_values[0]
        ? String(node.widgets_values[0])
        : '';
      const variable = variableStore[variableName];

      if (variable && variable.value) {
        for (const targetNode of workingGraph._nodes) {
          if (targetNode.inputs) {
            for (const input of targetNode.inputs) {
              if (input.link !== null) {
                const link = workingGraph._links[input.link];
                if (link && link.origin_id === node.id) {
                  const [sourceNodeId, sourceSlot] = variable.value;
                  const newLink = {
                    id: nextLinkId,
                    origin_id: Number(sourceNodeId),
                    origin_slot: sourceSlot,
                    target_id: targetNode.id,
                    target_slot: input.slot_index,
                    type: variable.dataType
                  };
                  newLinks[nextLinkId] = newLink;
                  input.link = nextLinkId;
                  nextLinkId++;
                }
              }
            }
          }
        }
      }
    }
  }

  // Process SetNode output bypass (direct passthrough connections)
  for (const node of workingGraph._nodes as any[]) {
    if (node.type === 'SetNode' || node.type === 'easy setNode') {
      if (!node.inputs || node.inputs.length === 0) {
        continue;
      }

      const setNodeInput = node.inputs[0];
      if (setNodeInput.link === null || setNodeInput.link === undefined) {
        continue;
      }

      const inputLink = newLinks[setNodeInput.link];
      if (!inputLink) {
        continue;
      }

      const sourceNodeId = inputLink.origin_id;
      const sourceSlot = inputLink.origin_slot;

      const sourceNode = workingGraph._nodes.find((n: any) => n.id === sourceNodeId);
      if (!sourceNode || !sourceNode.outputs || !sourceNode.outputs[sourceSlot]) {
        continue;
      }

      const sourceOutput = sourceNode.outputs[sourceSlot];

      if (!node.outputs || node.outputs.length === 0) {
        continue;
      }

      for (const output of node.outputs) {
        if (!output.links || output.links.length === 0) {
          continue;
        }

        for (const outputLinkId of output.links) {
          const outputLink = newLinks[outputLinkId];
          if (!outputLink) {
            continue;
          }

          outputLink.origin_id = sourceNodeId;
          outputLink.origin_slot = sourceSlot;

          if (sourceOutput.links && Array.isArray(sourceOutput.links)) {
            if (!sourceOutput.links.includes(outputLinkId)) {
              sourceOutput.links.push(outputLinkId);
            }
          } else {
            sourceOutput.links = [outputLinkId];
          }
        }
      }
    }
  }

  workingGraph._links = newLinks;
  return workingGraph;
}

/**
 * Step 6: Remove virtual nodes using blacklist
 * Virtual nodes removed: Note, MarkdownNote, Reroute, PrimitiveNode, SetNode, GetNode, etc.
 * Resulting graph shape: { _nodes: [actual processing nodes], _links: {...} }
 */
function filterOutVirtualNodes(workingGraph: any) {
  console.log('🔄 Step 6: Removing virtual nodes...');

  const originalCount = workingGraph._nodes.length;
  const beforeNodes = workingGraph._nodes.map((n: any) => `${n.id}(${n.type})`);

  workingGraph._nodes = workingGraph._nodes.filter((node: any) => !isVirtualNode(node));

  const afterNodes = workingGraph._nodes.map((n: any) => `${n.id}(${n.type})`);
  const removedCount = originalCount - workingGraph._nodes.length;

  console.log(`✅ Virtual nodes removed: ${removedCount} removed, ${workingGraph._nodes.length} remaining`);
  console.log(`   Before: [${beforeNodes.join(', ')}]`);
  console.log(`   After:  [${afterNodes.join(', ')}]`);
  console.log(`   Graph shape: { _nodes: [${afterNodes.join(', ')}], _links: ${Object.keys(workingGraph._links).length} links }`);

  return workingGraph;
}

/**
 * Process widget values using proper widget-input mapping logic
 *
 * HISTORY:
 * - 2025-09-22: Initial implementation using widgets_values array with index mapping
 * - 2025-09-22: Bug found in DWPreprocessor - connected inputs incorrectly consuming widget indices
 * - 2025-09-22: Attempted fix by skipping connected inputs (continue instead of widgetIndex++)
 * - 2025-09-22: Discovered complex edge case: some connected inputs DO have values in widgets_values that need skipping
 * - 2025-09-22: Implemented _widgets-based approach for more reliable widget value mapping
 *
 * CURRENT APPROACH: Use _widgets array for direct name-based mapping (bypasses index calculation complexity)
 * FALLBACK: Keep old widgets_values logic for compatibility with nodes that don't have _widgets
 */
function processNodeWidgetInputs(node: any, apiNodeInputs: Record<string, any>): void {
  // NEW APPROACH (2025-09-22): Use _widgets for direct widget name -> value mapping
  // This avoids complex index calculations and connected input edge cases
  if (node._widgets && Array.isArray(node._widgets)) {
    console.log(`🔧 Using _widgets approach for node ${node.id} (${node.type})`);

    for (const widget of node._widgets) {
      // Check if this widget corresponds to a connected input
      const correspondingInput = node.inputs?.find((input: any) =>
        input.name === widget.name && input.link !== null && input.link !== undefined
      );

      // Only use widget value if the input is not connected
      if (!correspondingInput) {
        // Apply date format conversion if needed
        let finalValue = widget.value;
        if (typeof widget.value === 'string' && widget.value.includes('%date:')) {
          finalValue = processDateFormatString(widget.value);
          if (finalValue !== widget.value) {
            console.log(`  📅 Converted date format in widget "${widget.name}": "${widget.value}" -> "${finalValue}"`);
          }
        }

        apiNodeInputs[widget.name] = finalValue;
        console.log(`  ✅ Widget ${widget.name} = ${finalValue} (disconnected)`);
      } else {
        console.log(`  ⏭️ Widget ${widget.name} skipped (input connected to link ${correspondingInput.link})`);
      }
    }
    return;
  }

  // FALLBACK: Old widgets_values array approach (keep for compatibility)
  // Issue: Complex index mapping can fail with certain node configurations
  console.log(`🔧 Using widgets_values fallback for node ${node.id} (${node.type})`);

  if (!node.widgets_values || !Array.isArray(node.widgets_values)) {
    return;
  }

  /* =========================================================================
   * OLD LOGIC (Pre-2025-09-22): widgets_values array with index mapping
   * =========================================================================
   *
   * KNOWN ISSUES:
   * - Connected inputs with widgets create index calculation complexity
   * - Some connected inputs have values in widgets_values that must be skipped
   * - Index miscalculation leads to wrong values assigned (e.g., DWPreprocessor bug)
   *
   * ATTEMPTED FIXES:
   * - Skip connected inputs without incrementing widgetIndex (caused other issues)
   * - Complex logic to handle control_after_generate values
   *
   * RESULT: Fragile and error-prone for complex node configurations
   */

  // Build mapping: which widgets_values index corresponds to which input
  let widgetIndex = 0;

  if (node.inputs) {
    for (const input of node.inputs as any[]) {
      // Check if this input has a widget (can be controlled by widgets_values)
      if (input.widget) {

        // ORIGINAL APPROACH: Connected inputs consume widget values (need to skip them)
        if (input.link !== null && input.link !== undefined) {
          widgetIndex++; // Skip this widget value

          // Special handling for control_after_generate - skip additional value
          if ((input.name === 'seed' || input.name === 'noise_seed') && widgetIndex < node.widgets_values.length) {
            const nextValue = node.widgets_values[widgetIndex];
            const CONTROL_VALUES = ['fixed', 'increment', 'decrement', 'randomize'];
            if (CONTROL_VALUES.includes(nextValue)) {
              widgetIndex++; // Skip control value too
            }
          }
        } else {
          // Input is not connected, use widget value
          if (widgetIndex < node.widgets_values.length) {
            let widgetValue = node.widgets_values[widgetIndex];

            // Skip control_after_generate values
            const CONTROL_VALUES = ['fixed', 'increment', 'decrement', 'randomize'];
            if (CONTROL_VALUES.includes(widgetValue)) {
              widgetIndex++;

              // Get next value if available
              if (widgetIndex < node.widgets_values.length) {
                widgetValue = node.widgets_values[widgetIndex];
              } else {
                continue;
              }
            }

            apiNodeInputs[input.name] = widgetValue;
            widgetIndex++;

            // Special handling for control_after_generate - skip additional value
            if ((input.name === 'seed' || input.name === 'noise_seed') && widgetIndex < node.widgets_values.length) {
              const nextValue = node.widgets_values[widgetIndex];
              const CONTROL_VALUES = ['fixed', 'increment', 'decrement', 'randomize'];
              if (CONTROL_VALUES.includes(nextValue)) {
                widgetIndex++; // Skip control value too
              }
            }
          }
        }
      }
    }
  }

  // Handle any remaining widget values as param_N
  while (widgetIndex < node.widgets_values.length) {
    const paramName = `param_${widgetIndex - (node.inputs?.filter((i: any) => i.widget).length || 0)}`;
    apiNodeInputs[paramName] = node.widgets_values[widgetIndex];
    widgetIndex++;
  }
}

/**
 * Process object-format widgets_values (newer ComfyUI extension format)
 */
function processNodeWidgetObject(node: any, apiNodeInputs: Record<string, any>): void {
  if (node.widgets_values && typeof node.widgets_values === 'object' && !Array.isArray(node.widgets_values)) {
    for (const [widgetName, widgetValue] of Object.entries(node.widgets_values)) {
      // Only set widget value if input doesn't already have a connection
      if (!apiNodeInputs[widgetName]) {
        apiNodeInputs[widgetName] = widgetValue;
      }
    }
  }
}

/**
 * Step 7: Convert nodes to API format with bypass and Reroute routing
 */
function transformGraphNodesToApiFormat(
  workingGraph: any,
  bypassRoutingMap: Map<string, [string, number] | null>,
  rerouteRoutingMap: Map<string, [string, number] | null>
) {
  console.log('🔄 Step 7: Converting nodes to API format...');

  const apiWorkflow: Record<string, any> = {};
  let nodeCount = 0;

  // Process each node to create API format
  for (const node of workingGraph._nodes as any[]) {
    const nodeId = String(node.id);

    // Skip bypass nodes (mode 4) in API output
    if (node.mode === 4) {
      console.log(`⏭️ Skipping bypass node: ${nodeId} (${node.type})`);
      continue;
    }

    // Skip muted nodes (mode 2) in API output  
    if (node.mode === 2) {
      console.log(`🔇 Skipping muted node: ${nodeId} (${node.type})`);
      continue;
    }

    console.log(`🔄 Processing node: ${nodeId} (${node.type})`);

    // Create API node structure
    const apiNode: any = {
      inputs: {},
      class_type: node.comfyClass || node.type,
      _meta: {}
    };

    // Add title if present
    if (node.title) {
      apiNode._meta.title = node.title;
    }

    // Step 1: Process all connections (inputs with links) first
    if (node.inputs) {
      for (const input of node.inputs) {
        if (input.link !== null && input.link !== undefined) {
          // Find the corresponding link
          const link = workingGraph._links[input.link];
          if (link) {
            // Resolve connection through bypass and Reroute routing if needed
            console.log(`🔗 Processing connection: ${link.origin_id}-${link.origin_slot} -> ${node.id}-${input.slot_index} (${input.name})`);
            const [finalNodeId, finalOutputIndex] = resolveConnection(
              String(link.origin_id),
              link.origin_slot,
              workingGraph,
              bypassRoutingMap,
              rerouteRoutingMap
            );
            console.log(`🔗 Resolved to: ${finalNodeId}-${finalOutputIndex}`);
            apiNode.inputs[input.name] = [finalNodeId, finalOutputIndex];
          }
        }
      }
    }

    // Step 2: Process widget values using proper widget-input mapping logic
    processNodeWidgetInputs(node, apiNode.inputs);

    // Step 3: Handle object-format widgets_values (newer ComfyUI extension format)
    processNodeWidgetObject(node, apiNode.inputs);

    apiWorkflow[nodeId] = apiNode;
    nodeCount++;
  }

  console.log(`✅ API conversion complete: ${nodeCount} nodes processed`);
  return { apiWorkflow, nodeCount };
}

/**
 * Helper function to find source for a given link (Graph structure)
 */
function findSourceForLink(graph: any, linkId: number): { sourceNodeId: number; outputIndex: number } | null {
  // Use graph._links (structured object: {"1": {...}, "2": {...}})
  const link = graph._links?.[linkId.toString()];
  if (!link) {
    console.log(`🔍 findSourceForLink: No link found for ID ${linkId} in graph._links`);
    return null;
  }

  console.log(`🔍 findSourceForLink: Found link {id: ${link.id}, origin: ${link.origin_id}-${link.origin_slot}, target: ${link.target_id}-${link.target_slot}}`);
  return {
    sourceNodeId: link.origin_id,
    outputIndex: link.origin_slot
  };
}

/**
 * Helper function to check if a node is virtual (doesn't execute on backend)
 */
function isVirtualNode(node: any): boolean {
  const virtualNodeTypes = new Set([
    'Note',
    'MarkdownNote',
    'Reroute',
    'PrimitiveNode',
    'SetNode',
    'easy setNode',
    'GetNode',
    'easy getNode',
    // rgthree extension nodes
    'Fast Groups Bypasser (rgthree)',
    'Fast Groups Muter (rgthree)',
    'Display Any (rgthree)',
    'Bookmark (rgthree)',
    'Context (rgthree)',
    'Context Switch (rgthree)',
    'Context Merge (rgthree)',
    'Image Comparer (rgthree)',
    'Pipe To/From (rgthree)',
    'Constant (rgthree)',
    'Label (rgthree)',
    'Fast Muter (rgthree)',     // Mute control
    'Mute / Bypass Repeater (rgthree)',     // Mute / Bypass control
  ]);

  return virtualNodeTypes.has(node.type);
}

/**
 * Helper: Find alternative source for a broken link
 */
function findAlternativeSource(graph: any, inputName: string, inputType: string): { sourceNodeId: number; outputIndex: number } | null {
  if (!graph._nodes) return null;


  // Look for nodes that output the required type
  for (const node of graph._nodes) {
    if (node.outputs && Array.isArray(node.outputs)) {
      for (let outputIndex = 0; outputIndex < node.outputs.length; outputIndex++) {
        const output = node.outputs[outputIndex];

        // Check if this output matches the required type and has links
        if (output.type === inputType && output.links && output.links.length > 0) {
          // For positive/negative CONDITIONING, prioritize certain node types
          if (inputType === 'CONDITIONING') {
            if (inputName === 'positive' && output.name === 'positive') {
              return { sourceNodeId: node.id, outputIndex };
            }
            if (inputName === 'negative' && output.name === 'negative') {
              return { sourceNodeId: node.id, outputIndex };
            }
          }

          // For LATENT type
          if (inputType === 'LATENT' && inputName === 'latent_image') {
            return { sourceNodeId: node.id, outputIndex };
          }
        }
      }
    }
  }

  return null;
}


/**
 * Convert special ComfyUI workflow values to proper API values
 */
function convertSpecialWidgetValue(paramName: string, value: any, nodeType: string): any {
  // Handle date format strings in filename_prefix
  if (paramName === 'filename_prefix' && typeof value === 'string') {
    return processDateFormatString(value);
  }

  return value; // Return unchanged if no conversion needed
}

/**
 * Monitor workflow execution using WebSocket
 */
async function monitorExecution(
  serverUrl: string,
  promptId: string,
  clientId: string,
  timeout: number,
  keepWebSocketOpen?: boolean,
  additionalMonitoringTime?: number
): Promise<{ success: boolean; outputs?: IComfyNodeOutput[]; error?: string }> {

  try {

    // Create WebSocket service
    const promptWS = new PromptWebSocketService({
      serverUrl,
      promptId,
      clientId,
      timeoutMs: timeout,
      keepConnectionOpen: keepWebSocketOpen,
      additionalMonitoringTime: additionalMonitoringTime
    });

    // Start monitoring and wait for completion
    const result = await promptWS.startMonitoring();


    // Additional monitoring period if requested
    if (keepWebSocketOpen && additionalMonitoringTime && result.success) {

      // Setup additional error listener
      let additionalErrors: any[] = [];
      const errorListener = (data: any) => {
        additionalErrors.push(data);
      };

      promptWS.on('execution_error', errorListener);

      // Wait for additional monitoring period
      await new Promise(resolve => setTimeout(resolve, additionalMonitoringTime));

      promptWS.off('execution_error', errorListener);
      promptWS.close();


      // If we found additional errors, update the result
      if (additionalErrors.length > 0) {
        return {
          success: false,
          error: `Additional execution errors detected: ${JSON.stringify(additionalErrors)}`
        };
      }
    }

    return {
      success: result.success,
      outputs: result.finalOutputs,
      error: result.success ? undefined : (result.error?.message || `Execution failed: ${result.completionReason}`)
    };

  } catch (error) {
    console.error(`❌ Failed to monitor execution:`, error);
    return {
      success: false,
      error: 'Failed to monitor execution'
    };
  }
}

/**
 * Get prompt history
 */
export const getPromptHistory = async (
  serverUrl: string,
  maxItems: number = 100,
  config: ComfyAPIConfig = {}
): Promise<IComfyHistoryResponse> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.get(`${serverUrl}/history/${maxItems}`, { timeout });
    return response.data;
  } catch (error) {
    console.error('Failed to get prompt history:', error);
    throw error;
  }
};

/**
 * Get queue status
 */
export const getQueueStatus = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<any> => {
  const { timeout = 5000 } = config;

  try {
    const response = await axios.get(`${serverUrl}/queue`, { timeout });
    return response.data;
  } catch (error) {
    console.error('Failed to get queue status:', error);
    throw error;
  }
};

/**
 * Interrupt execution
 */
export const interruptExecution = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<boolean> => {
  const { timeout = 5000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/interrupt`, {}, { timeout });
    return response.status === 200;
  } catch (error) {
    console.error('Failed to interrupt execution:', error);
    return false;
  }
};

/**
 * Reboot server
 */
export const rebootServer = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<boolean> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/reboot`, {
      confirm: true
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout
    });

    if (response.status === 200) {
      return true;
    } else {
      console.error('❌ Server reboot failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('💥 Server reboot error:', error);
    return false;
  }
};

/**
 * Fetch model folders from the ComfyUI models directory
 */
export const fetchModelFolders = async (
  serverUrl: string,
  config: ComfyAPIConfig = {}
): Promise<{
  success: boolean;
  folders: Array<{
    name: string;
    path: string;
    full_path: string;
    file_count: number;
  }>;
  error?: string;
}> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/folders`, {
      timeout
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching model folders:', error);
    return {
      success: false,
      folders: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Start downloading a model file
 */
export const startModelDownload = async (
  serverUrl: string,
  params: {
    url: string;
    target_folder: string;
    filename?: string;
    overwrite?: boolean;
  },
  config: ComfyAPIConfig = {}
): Promise<{
  success: boolean;
  task_id?: string;
  download_info?: any;
  message?: string;
  error?: string;
}> => {
  const { timeout = 15000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/download`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout
    });

    return response.data;
  } catch (error) {
    console.error('Error starting model download:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Cancel a download task
 */
export const cancelDownload = async (
  serverUrl: string,
  taskId: string,
  config: ComfyAPIConfig = {}
): Promise<{
  success: boolean;
  message?: string;
  task_info?: any;
  error?: string;
}> => {
  const { timeout = 10000 } = config;

  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/models/downloads/${taskId}`, {
      timeout
    });

    return response.data;
  } catch (error) {
    console.error('Error canceling download:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Fetch all download tasks
 */
export const fetchDownloads = async (
  serverUrl: string,
  options?: {
    status?: string;
    limit?: number;
  },
  config: ComfyAPIConfig = {}
): Promise<{
  success: boolean;
  downloads: Array<{
    id: string;
    filename: string;
    target_folder: string;
    status: string;
    progress: number;
    total_size: number;
    downloaded_size: number;
    speed: number;
    eta: number;
    created_at: number;
    started_at?: number;
    completed_at?: number;
    error?: string;
  }>;
  summary?: any;
  error?: string;
}> => {
  const { timeout = 10000 } = config;

  try {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());

    const url = `${serverUrl}/comfymobile/api/models/downloads${params.toString() ? '?' + params.toString() : ''}`;
    const response = await axios.get(url, {
      timeout
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching downloads:', error);
    return {
      success: false,
      downloads: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Move a model file between folders
 */
export const moveModelFile = async (
  serverUrl: string,
  params: {
    filename: string;
    source_folder: string;
    target_folder: string;
    overwrite?: boolean;
  },
  config: ComfyAPIConfig = {}
): Promise<{
  success: boolean;
  message?: string;
  file_info?: any;
  error?: string;
}> => {
  const { timeout = 30000 } = config;

  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/move`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout
    });

    return response.data;
  } catch (error) {
    console.error('Error moving model file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Export all functions as a namespace for easy importing
export const ComfyAPI = {
  getServerInfo,
  clearCache,
  clearVRAM,
  convertJsonToAPI,
  convertGraphToAPI,
  getPromptHistory,
  getQueueStatus,
  interruptExecution,
  rebootServer,
  // Model management functions
  fetchModelFolders,
  startModelDownload,
  cancelDownload,
  fetchDownloads,
  moveModelFile,
} as const;

export default ComfyAPI;