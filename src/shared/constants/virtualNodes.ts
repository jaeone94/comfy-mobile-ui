/**
 * Workflow-only nodes that should be excluded from API conversion
 * 
 * These nodes are used for workflow organization, documentation, and UI purposes
 * but are not actual processing nodes that should be sent to the ComfyUI API.
 */

/**
 * List of node types that should be excluded from API conversion
 * These nodes exist only in the workflow UI and don't perform actual processing
 */
export const VIRTUAL_NODES: ReadonlyArray<string> = [
  // Basic workflow organization nodes
  'Note',           // Text notes/comments in the workflow
  'Reroute',        // Connection routing helper nodes
  'GetNode',        // Variable getter nodes (workflow-only)
  'SetNode',        // Variable setter nodes (workflow-only)
  'easy setNode',   // Variable setter nodes (workflow-only)
  'easy getNode',   // Variable getter nodes (workflow-only)
  'PrimitiveNode',  // Primitive value nodes (often workflow-only)

  // rgthree extension nodes (workflow management)
  'Fast Groups Bypasser (rgthree)',  // Group bypass control    
  'Fast Groups Muter (rgthree)',     // Group mute control
  'Display Any (rgthree)',           // Display/debug nodes
  'Bookmark (rgthree)',              // Workflow bookmarks
  'Context (rgthree)',               // Context management
  'Context Switch (rgthree)',        // Context switching
  'Context Merge (rgthree)',         // Context merging
  'Image Comparer (rgthree)',        // Image comparison tool
  'Pipe To/From (rgthree)',          // Pipe connectors
  'Constant (rgthree)',              // Constant values
  'Label (rgthree)',                 // Text labels and annotations
  'MarkdownNote',
  'Fast Muter (rgthree)',     // Mute control
  'Mute / Bypass Repeater (rgthree)',     // Mute / Bypass control
  'GraphInput',
  'GraphOutput',

  // Common utility/debug nodes that are typically virtual
  // Note: Be careful with primitive types - some may be needed in API
  // 'String',      // String value nodes (commented - may be needed)
  // 'Int',         // Integer value nodes (commented - may be needed)  
  // 'Float',       // Float value nodes (commented - may be needed)
  // 'Boolean',     // Boolean value nodes (commented - may be needed)

  // Add more workflow-only nodes here as needed
  // 'Junction',       // Uncomment if junction nodes should be excluded
];


export const API_VIRTUAL_NODES = new Set([
  'Note',
  'MarkdownNote',
  'Reroute',
  'PrimitiveNode',
  'SetNode',
  'GetNode',
  'easy setNode',
  'easy getNode',
  'Fast Muter (rgthree)',     // Mute control
  'Mute / Bypass Repeater (rgthree)',     // Mute / Bypass control
  'GraphInput',
  'GraphOutput',
]);

/**
 * Check if a node type should be excluded from API conversion
 * @param nodeType - The type of the node to check
 * @returns true if the node should be excluded from API
 */
export function isWorkflowOnlyNode(nodeType: string): boolean {
  // Check explicit workflow-only nodes
  if (VIRTUAL_NODES.includes(nodeType)) {
    return true;
  }

  // Check for user-defined workflow group nodes (start with "workflow>")
  if (nodeType.startsWith('workflow>')) {
    return true;
  }

  return false;
}

/**
 * Check if a node should be excluded from API conversion
 * @param node - The node object to check
 * @returns true if the node should be excluded from API
 */
export function shouldExcludeFromAPI(node: {
  type?: string;
  class_type?: string;
  mode?: number;
}): boolean {
  const nodeType = node.type || node.class_type || '';

  // Check if it's a workflow-only node type
  if (isWorkflowOnlyNode(nodeType)) {
    return true;
  }

  // Check if node is in bypass mode (mode: 2 means bypassed/disabled)
  if (node.mode === 2) {
    return true;
  }

  return false;
}

/**
 * Filter out workflow-only nodes from a nodes array
 * @param nodes - Array of nodes to filter
 * @returns Array of nodes with workflow-only nodes removed
 */
export function filterAPINodes<T extends { type?: string; class_type?: string }>(nodes: T[]): T[] {
  return nodes.filter(node => !shouldExcludeFromAPI(node));
}

/**
 * Get a copy of the workflow-only nodes list
 * @returns Array copy of workflow-only node types
 */
export function getWorkflowOnlyNodes(): string[] {
  return [...VIRTUAL_NODES];
}