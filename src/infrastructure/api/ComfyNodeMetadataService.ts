import axios from 'axios';
import {
  IObjectInfo,
  INodeMetadata,
  INodeWithMetadata,
  IProcessedParameter,
  IParameterDefinition,
  ParameterType,
  ParameterConfig,
  IMetadataResponse,
  ILinkInfo
} from '@/shared/types/comfy/IComfyObjectInfo';
import { IComfyWorkflow, IComfyGraphNode, IComfyNodeInputSlot, IComfyNodeOutputSlot } from '@/shared/types/app/base';
import { useConnectionStore } from '@/ui/store/connectionStore';

// Module-level cache
let objectInfoCache: IObjectInfo | null = null;
let cacheTimestamp: number = 0;
const cacheExpiry = 5 * 60 * 1000; // 5 minutes
const synthesizedMetadataCache: IObjectInfo = {};

/**
 * Fetch object_info from ComfyUI server
 */
export async function fetchObjectInfo(customUrl?: string): Promise<IObjectInfo> {
  let baseUrl = customUrl;

  if (!baseUrl) {
    const connectionStore = useConnectionStore.getState();
    baseUrl = connectionStore.url;
  }

  if (!baseUrl) {
    throw new Error('No server connection established');
  }

  // Check cache
  if (objectInfoCache && Date.now() - cacheTimestamp < cacheExpiry) {
    return objectInfoCache;
  }

  try {
    const response = await axios.get<IObjectInfo>(`${baseUrl}/object_info`);
    objectInfoCache = { ...response.data, ...synthesizedMetadataCache };
    cacheTimestamp = Date.now();
    return objectInfoCache;
  } catch (error) {
    throw new Error(`Failed to fetch object info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Register synthesized metadata globally
 */
export function registerSynthesizedMetadata(type: string, metadata: INodeMetadata): void {
  synthesizedMetadataCache[type] = metadata;
  if (objectInfoCache) {
    objectInfoCache[type] = metadata;
  }
}

/**
 * Clear all synthesized metadata
 */
export function clearSynthesizedMetadata(): void {
  Object.keys(synthesizedMetadataCache).forEach(key => delete synthesizedMetadataCache[key]);
  if (objectInfoCache) {
    // We can't easily roll back objectInfoCache without re-fetching, 
    // but clearing cache is usually enough
    objectInfoCache = null;
  }
}

/**
 * Process a single node's metadata
 */
export function processNodeMetadata(
  node: IComfyGraphNode,
  metadata: INodeMetadata,
  workflow?: IComfyWorkflow
): INodeWithMetadata {
  const inputParameters: IProcessedParameter[] = [];
  const widgetParameters: IProcessedParameter[] = [];
  const allParameters: IProcessedParameter[] = [];

  // Create a map of link info for each input
  const linkInfoMap = new Map<string, ILinkInfo>();

  // Get linked input names to separate input params from widget params
  const linkedInputs = new Set<string>();
  if (node.inputs && workflow) {
    node.inputs.forEach((input: IComfyNodeInputSlot) => {
      if (input.link !== null) {
        linkedInputs.add(input.name);

        // Find the link information
        const graphData = workflow.graph;
        const link = graphData?._links ? Object.values(graphData._links).find((l: any) => l.id === input.link) : null;
        if (link) {
          const sourceNodeId = link.origin_id;
          const sourceSlot = link.origin_slot;
          const sourceNode = graphData?._nodes?.find((n: IComfyGraphNode) => n.id === sourceNodeId);

          if (sourceNode && sourceNode.outputs && sourceNode.outputs[sourceSlot]) {
            const sourceOutput = sourceNode.outputs[sourceSlot];
            linkInfoMap.set(input.name, {
              sourceNodeId: sourceNodeId,
              sourceNodeType: sourceNode.type,
              sourceNodeTitle: sourceNode.title,
              sourceOutputName: sourceOutput.name || `Output ${sourceSlot}`,
              sourceOutputIndex: sourceSlot,
              linkId: link.id
            });
          }
        }
      }
    });
  } else if (node.inputs) {
    // Fallback when workflow is not provided
    node.inputs.forEach((input: IComfyNodeInputSlot) => {
      if (input.link !== null) {
        linkedInputs.add(input.name);
      }
    });
  }

  // Process required parameters
  if (metadata.input.required) {
    Object.entries(metadata.input.required).forEach(([name, definition]) => {
      const param = processParameter(name, definition, true);
      // Map widget values if available
      param.value = extractWidgetValue(node, name, metadata);

      // Add link info if available
      if (linkInfoMap.has(name)) {
        param.linkInfo = linkInfoMap.get(name);
      }

      // Categorize parameter
      if (linkedInputs.has(name)) {
        inputParameters.push(param);
      } else {
        widgetParameters.push(param);
      }
      allParameters.push(param);

      // Special handling for nodes with seed: add control_after_generate if it doesn't exist in metadata
      if ((name === 'seed' || name === 'noise_seed') && !linkedInputs.has(name)) {
        const hasControlAfterGenerate = (metadata.input.required && Object.keys(metadata.input.required).includes('control_after_generate')) ||
          (metadata.input.optional && Object.keys(metadata.input.optional).includes('control_after_generate'));

        if (!hasControlAfterGenerate) {
          const controlParam: IProcessedParameter = {
            name: 'control_after_generate',
            type: 'COMBO',
            config: { default: 'fixed' },
            required: true,
            description: 'Control behavior after generation (Fixed/Increment/Decrement/Randomize)',
            possibleValues: ['fixed', 'increment', 'decrement', 'randomize'],
            value: extractWidgetValue(node, 'control_after_generate', metadata)
          };
          widgetParameters.push(controlParam);
          allParameters.push(controlParam);
        }
      }
    });
  }

  // Process optional parameters
  if (metadata.input.optional) {
    Object.entries(metadata.input.optional).forEach(([name, definition]) => {
      const param = processParameter(name, definition, false);
      // Map widget values if available
      param.value = extractWidgetValue(node, name, metadata);

      // Add link info if available
      if (linkInfoMap.has(name)) {
        param.linkInfo = linkInfoMap.get(name);
      }

      // Categorize parameter
      if (linkedInputs.has(name)) {
        inputParameters.push(param);
      } else {
        widgetParameters.push(param);
      }
      allParameters.push(param);
    });
  }

  // Process outputs
  const outputs = processOutputs(metadata);

  return {
    nodeId: node.id,
    nodeType: node.type,
    displayName: metadata.display_name || node.type,
    category: metadata.category || 'uncategorized',
    inputParameters,
    widgetParameters,
    parameters: allParameters, // For backward compatibility
    outputs
  };
}

/**
 * Extract widget value from node data
 */
export function extractWidgetValue(node: IComfyGraphNode, paramName: string, metadata: INodeMetadata): any {
  if (!node.widgets_values) return undefined;

  // Handle object format widget_values
  if (typeof node.widgets_values === 'object' && !Array.isArray(node.widgets_values)) {
    return node.widgets_values[paramName];
  }

  // Handle array format widget_values
  if (Array.isArray(node.widgets_values)) {
    // We need to map parameter names to widget_values array indices
    // This requires understanding the order of parameters based on linked/unlinked inputs
    const parameterOrder = getParameterOrder(metadata, node);
    const paramIndex = parameterOrder.indexOf(paramName);

    if (paramIndex !== -1 && paramIndex < node.widgets_values.length) {
      return node.widgets_values[paramIndex];
    }
  }

  return undefined;
}

/**
 * Get the order of parameters as they appear in widget_values array
 * Only parameters without input links are stored in widget_values
 */
export function getParameterOrder(metadata: INodeMetadata, node?: IComfyGraphNode): string[] {
  const order: string[] = [];

  // Get all linked input names from the node (these won't be in widget_values)
  const linkedInputs = new Set<string>();
  if (node?.inputs) {
    node.inputs.forEach(input => {
      if (input.link !== null) {
        linkedInputs.add(input.name);
      }
    });
  }

  // Special handling for nodes with seed parameter
  // If seed exists as unlinked widget and control_after_generate is not in metadata, add it
  const hasSeedWidget = metadata.input.required &&
    (Object.keys(metadata.input.required).includes('seed') || Object.keys(metadata.input.required).includes('noise_seed')) &&
    !linkedInputs.has('seed') && !linkedInputs.has('noise_seed');

  const hasControlAfterGenerate = (metadata.input.required && Object.keys(metadata.input.required).includes('control_after_generate')) ||
    (metadata.input.optional && Object.keys(metadata.input.optional).includes('control_after_generate'));

  if (hasSeedWidget && !hasControlAfterGenerate) {
    // For nodes with seed widget, widget_values order typically includes control_after_generate after seed
    const seedBasedOrder: string[] = [];

    // Add required parameters that don't have links, but insert control_after_generate after seed
    if (metadata.input.required) {
      Object.keys(metadata.input.required).forEach(paramName => {
        if (!linkedInputs.has(paramName)) {
          seedBasedOrder.push(paramName);
          // Insert control_after_generate right after seed
          if (paramName === 'seed' || paramName === 'noise_seed') {
            seedBasedOrder.push('control_after_generate');
          }
        }
      });
    }

    // Add optional parameters that don't have links
    if (metadata.input.optional) {
      Object.keys(metadata.input.optional).forEach(paramName => {
        if (!linkedInputs.has(paramName)) {
          seedBasedOrder.push(paramName);
        }
      });
    }

    return seedBasedOrder;
  }

  // Standard parameter ordering for other node types
  // Add required parameters that don't have links (in declaration order)
  if (metadata.input.required) {
    Object.keys(metadata.input.required).forEach(paramName => {
      if (!linkedInputs.has(paramName)) {
        order.push(paramName);
      }
    });
  }

  // Add optional parameters that don't have links (in declaration order)
  if (metadata.input.optional) {
    Object.keys(metadata.input.optional).forEach(paramName => {
      if (!linkedInputs.has(paramName)) {
        order.push(paramName);
      }
    });
  }

  return order;
}

/**
 * Process a parameter definition
 */
export function processParameter(
  name: string,
  definition: IParameterDefinition,
  required: boolean
): IProcessedParameter {
  const typeOrValues = definition[0];
  const config = definition[1] || {};
  const description = definition[2];

  // Determine type and possible values
  let type: ParameterType;
  let possibleValues: string[] | undefined;

  if (Array.isArray(typeOrValues)) {
    // COMBO type with predefined values
    type = 'COMBO';
    possibleValues = typeOrValues;
  } else {
    type = typeOrValues as ParameterType;
  }

  // Process validation rules based on type
  const validation = extractValidation(type, config);

  return {
    name,
    type,
    config,
    description,
    required,
    possibleValues,
    validation
  };
}

/**
 * Extract validation rules from parameter config
 */
export function extractValidation(type: ParameterType, config: ParameterConfig): any {
  const validation: any = {};

  switch (type) {
    case 'INT':
    case 'FLOAT':
      if ('min' in config) validation.min = config.min;
      if ('max' in config) validation.max = config.max;
      if ('step' in config) validation.step = config.step;
      break;
    case 'STRING':
      if ('maxLength' in config) validation.maxLength = config.maxLength;
      if ('pattern' in config) validation.pattern = config.pattern;
      break;
  }

  return Object.keys(validation).length > 0 ? validation : undefined;
}

/**
 * Process node outputs
 */
export function processOutputs(metadata: INodeMetadata): INodeWithMetadata['outputs'] {
  const outputs: INodeWithMetadata['outputs'] = [];

  if (Array.isArray(metadata.output)) {
    metadata.output.forEach((output, index) => {
      if (typeof output === 'string') {
        // Simple output type
        outputs.push({
          type: output as ParameterType,
          name: metadata.output_name?.[index] || `Output ${index}`,
          description: undefined
        });
      } else if (Array.isArray(output) && output.length >= 2) {
        // Detailed output format
        outputs.push({
          type: output[0] as ParameterType,
          name: output[1],
          description: output[2]
        });
      }
    });
  }

  return outputs;
}

/**
 * Get metadata for all nodes in a workflow
 */
export async function getWorkflowMetadata(
  workflow: IComfyWorkflow,
  customUrl?: string
): Promise<IMetadataResponse> {
  const objectInfo = await fetchObjectInfo(customUrl);
  const nodes: INodeWithMetadata[] = [];
  const missingTypes: string[] = [];
  const errors: string[] = [];

  // Process each node in the workflow
  const workflowNodes = workflow.graph?._nodes || [];
  for (const node of workflowNodes) {
    try {
      const metadata = objectInfo[node.type];

      if (!metadata) {
        missingTypes.push(node.type);
        continue;
      }

      const processedNode = processNodeMetadata(node, metadata, workflow);
      nodes.push(processedNode);
    } catch (error) {
      errors.push(`Failed to process node ${node.id} (${node.type}): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    nodes,
    missingTypes: [...new Set(missingTypes)], // Remove duplicates
    errors
  };
}

/**
 * Get metadata for a specific node type
 */
export async function getNodeTypeMetadata(
  nodeType: string,
  customUrl?: string
): Promise<INodeMetadata | null> {
  const objectInfo = await fetchObjectInfo(customUrl);
  return objectInfo[nodeType] || null;
}

/**
 * Clear metadata cache
 */
export function clearCache(): void {
  objectInfoCache = null;
  cacheTimestamp = 0;
}

/**
 * Get default values for a node's parameters
 */
export function getDefaultValues(metadata: INodeMetadata): Record<string, any> {
  const defaults: Record<string, any> = {};

  // Process required parameters
  if (metadata.input.required) {
    Object.entries(metadata.input.required).forEach(([name, definition]) => {
      const defaultValue = extractDefaultValue(definition);
      if (defaultValue !== undefined) {
        defaults[name] = defaultValue;
      }
    });
  }

  // Process optional parameters
  if (metadata.input.optional) {
    Object.entries(metadata.input.optional).forEach(([name, definition]) => {
      const defaultValue = extractDefaultValue(definition);
      if (defaultValue !== undefined) {
        defaults[name] = defaultValue;
      }
    });
  }

  return defaults;
}

/**
 * Extract default value from parameter definition
 */
export function extractDefaultValue(definition: IParameterDefinition): any {
  const typeOrValues = definition[0];
  const config = definition[1] || {};

  // For COMBO type with values
  if (Array.isArray(typeOrValues)) {
    return config.default !== undefined ? config.default : typeOrValues[0];
  }

  // For other types
  const type = typeOrValues as ParameterType;

  switch (type) {
    case 'INT':
    case 'FLOAT':
      return config.default !== undefined ? config.default : 0;
    case 'STRING':
      return config.default !== undefined ? config.default : '';
    case 'BOOLEAN':
      return config.default !== undefined ? config.default : false;
    default:
      return config.default;
  }
}

// Main export object containing all ComfyUI node metadata service functions
export const ComfyNodeMetadataService = {
  fetchObjectInfo,
  getNodeTypeMetadata,
  clearCache,
  getDefaultValues,
  extractDefaultValue,
  registerSynthesizedMetadata,
  clearSynthesizedMetadata
} as const;

// Backward compatibility
export const NodeMetadataService = ComfyNodeMetadataService;