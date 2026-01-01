/**
 * WorkflowService - Pure functional workflow operations
 * 
 * Handles operations for workflow instances:
 * - Workflow cloning and metadata updates
 * - Workflow statistics and analysis
 * - Export operations
 * 
 * All functions take workflow parameters directly
 */

import type { Workflow } from '@/shared/types/app/IComfyWorkflow'

/**
 * Clone workflow with new identity
 */
export async function cloneWorkflow(
  workflow: Workflow,
  newName?: string
): Promise<Workflow> {
  const cloned: Workflow = {
    ...workflow,
    id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: newName || `${workflow.name} (Copy)`,
    createdAt: new Date(),
    modifiedAt: undefined,
    workflow_json: JSON.parse(JSON.stringify(workflow.workflow_json)),
    graph: undefined // Don't copy runtime graph
  }

  return cloned
}

/**
 * Update workflow metadata
 */
export function updateWorkflowMetadata(
  workflow: Workflow,
  metadata: Partial<Pick<Workflow, 'name' | 'description' | 'author' | 'tags'>>
): Workflow {
  return {
    ...workflow,
    ...metadata,
    modifiedAt: new Date()
  }
}

/**
 * Get workflow statistics
 */
export function getWorkflowStatistics(workflow: Workflow): {
  nodeCount: number
  linkCount: number
  groupCount: number
  fileSize: number
  isValid: boolean
} {
  const json = workflow.workflow_json
  const jsonString = JSON.stringify(json)

  return {
    nodeCount: (json.nodes as any)?.length || 0,
    linkCount: (json.links as any)?.length || 0,
    groupCount: (json.groups as any)?.length || 0,
    fileSize: new Blob([jsonString]).size,
    isValid: workflow.isValid !== false
  }
}

/**
 * Export workflow as JSON string
 */
export function exportWorkflowAsJson(workflow: Workflow, prettify: boolean = true): string {
  if (prettify) {
    return JSON.stringify(workflow, (key, value) => {
      // Exclude runtime fields from export
      if (key === '_graph') return undefined
      return value
    }, 2)
  }

  return JSON.stringify({
    ...workflow,
    _graph: undefined
  })
}

/**
 * Export only workflow_json (ComfyUI format)
 */
export function exportWorkflowJson(workflow: Workflow, prettify: boolean = true): string {
  return JSON.stringify(workflow.workflow_json, null, prettify ? 2 : 0)
}

/**
 * Get download filename for workflow
 */
export function getDownloadFilename(workflow: Workflow): string {
  const safeName = workflow.name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()

  return `${safeName}.json`
}

/**
 * Validate workflow structure
 */
export function validateWorkflowStructure(workflow: Workflow): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!workflow.id) {
    errors.push('Missing workflow ID')
  }

  if (!workflow.name) {
    errors.push('Missing workflow name')
  }

  if (!workflow.workflow_json) {
    errors.push('Missing workflow JSON data')
  } else {
    const json = workflow.workflow_json

    if (!Array.isArray(json.nodes)) {
      errors.push('Invalid nodes structure')
    }

    if (!Array.isArray(json.links)) {
      errors.push('Invalid links structure')
    }

    if (typeof json.last_node_id !== 'number') {
      errors.push('Invalid last_node_id')
    }

    if (typeof json.last_link_id !== 'number') {
      errors.push('Invalid last_link_id')
    }
  }

  if (!workflow.createdAt) {
    errors.push('Missing creation date')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Repair workflow structure
 */
export function repairWorkflow(workflow: Workflow): { workflow: Workflow; repaired: boolean; changes: string[] } {
  const changes: string[] = []
  let repairedWorkflow = { ...workflow }

  if (!repairedWorkflow.id) {
    repairedWorkflow.id = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    changes.push('Generated missing workflow ID')
  }

  if (!repairedWorkflow.name) {
    repairedWorkflow.name = 'Untitled Workflow'
    changes.push('Set default workflow name')
  }

  if (!repairedWorkflow.createdAt) {
    repairedWorkflow.createdAt = new Date()
    changes.push('Set creation date to now')
  }

  if (repairedWorkflow.workflow_json) {
    const json = { ...repairedWorkflow.workflow_json }

    if (!Array.isArray(json.nodes)) {
      json.nodes = [] as any
      changes.push('Initialized empty nodes array')
    }

    if (!Array.isArray(json.links)) {
      json.links = [] as any
      changes.push('Initialized empty links array')
    }

    if (typeof json.last_node_id !== 'number') {
      json.last_node_id = Math.max(...(json.nodes as any).map((n: any) => n.id || 0), 0)
      changes.push('Calculated last_node_id from nodes')
    }

    if (typeof json.last_link_id !== 'number') {
      json.last_link_id = Math.max(...(json.links as any).map((l: any) => l[0] || 0), 0)
      changes.push('Calculated last_link_id from links')
    }

    // Update node count and workflow_json
    repairedWorkflow.nodeCount = (json.nodes as any).length
    repairedWorkflow.workflow_json = json
  }

  if (changes.length > 0) {
    repairedWorkflow = { ...repairedWorkflow, modifiedAt: new Date() }
  }

  return {
    workflow: repairedWorkflow,
    repaired: changes.length > 0,
    changes
  }
}

// Main export object containing all workflow management service functions
export const WorkflowManagementService = {
  cloneWorkflow,
  updateWorkflowMetadata,
  getWorkflowStatistics
} as const;

// Backward compatibility
export const WorkflowService = WorkflowManagementService;