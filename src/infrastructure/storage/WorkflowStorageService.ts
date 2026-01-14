/**
 * WorkflowStorage - Collection Management for Workflows
 * 
 * Handles storage operations for multiple workflows:
 * - localStorage persistence
 * - CRUD operations for workflow collections
 * - Serialization/deserialization
 */

import type { Workflow } from '@/shared/types/app/IComfyWorkflow'

const STORAGE_KEY = 'comfyui_workflows'

// ============================================================================
// Workflow Collection Storage Functions
// ============================================================================

/**
 * Load all workflows from storage
 */
export function loadAllWorkflows(): Workflow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    return parsed.map((item: any) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
    }))
  } catch (error) {
    console.error('Failed to load workflows from storage:', error)
    return []
  }
}

/**
 * Save workflows collection to storage
 */
export function saveAllWorkflows(workflows: Workflow[]): void {
  try {
    const serialized = workflows.map(workflow => ({
      ...workflow,
      _graph: undefined, // Don't persist runtime graph
      createdAt: workflow.createdAt?.toISOString() || new Date().toISOString(),
      modifiedAt: workflow.modifiedAt?.toISOString(),
    }))

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch (error) {
    console.error('Failed to save workflows to storage:', error)
    throw error // Re-throw error so calling code can handle it
  }
}

/**
 * Add new workflow to collection
 */
export function addWorkflow(workflow: Workflow): void {
  const workflows = loadAllWorkflows()
  workflows.unshift(workflow) // Add to beginning
  try {
    saveAllWorkflows(workflows)
  } catch (error) {
    // If save fails, throw a more specific error
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Please delete some workflows to free up space.')
    }
    throw error
  }
}

/**
 * Update existing workflow in collection
 */
export function updateWorkflow(updatedWorkflow: Workflow): void {
  const workflows = loadAllWorkflows()
  const index = workflows.findIndex(w => w.id === updatedWorkflow.id)

  if (index !== -1) {
    workflows[index] = {
      ...updatedWorkflow,
      modifiedAt: new Date(),
    }
    saveAllWorkflows(workflows)
  }
}

/**
 * Remove workflow from collection
 */
export function removeWorkflow(workflowId: string): void {
  const workflows = loadAllWorkflows()
  const filtered = workflows.filter(w => w.id !== workflowId)
  saveAllWorkflows(filtered)
}

/**
 * Find workflow by ID
 */
export function findWorkflowById(workflowId: string): Workflow | null {
  const workflows = loadAllWorkflows()
  return workflows.find(w => w.id === workflowId) || null
}

/**
 * Check if workflow exists
 */
export function workflowExists(workflowId: string): boolean {
  return findWorkflowById(workflowId) !== null
}

/**
 * Get collection statistics
 */
export function getWorkflowStats(): {
  totalCount: number
  totalSize: number
  averageNodes: number
  oldestWorkflow?: Date
  newestWorkflow?: Date
} {
  const workflows = loadAllWorkflows()

  if (workflows.length === 0) {
    return {
      totalCount: 0,
      totalSize: 0,
      averageNodes: 0
    }
  }

  const totalNodes = workflows.reduce((sum, w) => sum + (w.nodeCount || 0), 0)
  const dates = workflows.map(w => w.createdAt).sort()

  return {
    totalCount: workflows.length,
    totalSize: getWorkflowStorageSize(),
    averageNodes: Math.round(totalNodes / workflows.length),
    oldestWorkflow: dates[0],
    newestWorkflow: dates[dates.length - 1]
  }
}

/**
 * Get storage size in bytes
 */
export function getWorkflowStorageSize(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? new Blob([stored]).size : 0
  } catch {
    return 0
  }
}

/**
 * Get storage quota information
 */
export async function getStorageQuotaInfo(): Promise<{
  used: number;
  available: number;
  quota: number;
  usage: number; // percentage
  canAddWorkflow: boolean;
}> {
  try {
    // Get current storage size
    const currentSize = getWorkflowStorageSize();

    // Try to get storage quota (only available in some browsers)
    let quota = 5 * 1024 * 1024; // Default 5MB fallback
    let available = quota;

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      quota = estimate.quota || quota;
      const used = estimate.usage || currentSize;
      available = quota - used;
    }

    const usage = quota > 0 ? (currentSize / quota) * 100 : 0;
    const canAddWorkflow = available > (currentSize * 0.1); // Need at least 10% more space

    return {
      used: currentSize,
      available,
      quota,
      usage,
      canAddWorkflow
    };
  } catch (error) {
    console.warn('Could not get storage quota info:', error);
    return {
      used: getWorkflowStorageSize(),
      available: 0,
      quota: 0,
      usage: 0,
      canAddWorkflow: false
    };
  }
}

/**
 * Format bytes to human readable string
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Clear all workflows from storage
 */
export function clearAllWorkflows(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Export workflows as JSON
 */
export function exportWorkflows(): string {
  const workflows = loadAllWorkflows()
  return JSON.stringify(workflows, null, 2)
}

/**
 * Import workflows from JSON
 */
export function importWorkflows(jsonData: string): { success: boolean; imported: number; errors: string[] } {
  try {
    const importedWorkflows = JSON.parse(jsonData)

    if (!Array.isArray(importedWorkflows)) {
      return { success: false, imported: 0, errors: ['Invalid format: expected array'] }
    }

    const errors: string[] = []
    let imported = 0

    for (const workflow of importedWorkflows) {
      try {
        // Basic validation
        if (!workflow.id || !workflow.name || !workflow.workflow_json) {
          errors.push(`Invalid workflow: missing required fields`)
          continue
        }

        // Convert dates
        workflow.createdAt = new Date(workflow.createdAt)
        if (workflow.modifiedAt) {
          workflow.modifiedAt = new Date(workflow.modifiedAt)
        }

        addWorkflow(workflow)
        imported++
      } catch (error) {
        errors.push(`Failed to import workflow ${workflow.name}: ${error}`)
      }
    }

    return { success: errors.length === 0, imported, errors }
  } catch (error) {
    return {
      success: false,
      imported: 0,
      errors: [`JSON parse error: ${error}`]
    }
  }
}

/**
 * Get single workflow by ID
 */
export function getWorkflow(id: string): Workflow | null {
  const workflows = loadAllWorkflows()
  return workflows.find(w => w.id === id) || null
}

// Legacy class wrapper for backward compatibility
export class WorkflowStorageService {
  static loadAll = loadAllWorkflows
  static saveAll = saveAllWorkflows
  static add = addWorkflow
  static update = updateWorkflow
  static remove = removeWorkflow
  static findById = findWorkflowById
  static exists = workflowExists
  static getStats = getWorkflowStats
  static getStorageSize = getWorkflowStorageSize
  static clear = clearAllWorkflows
  static export = exportWorkflows
  static import = importWorkflows
  static getWorkflow = getWorkflow
  static updateWorkflow = updateWorkflow
}

export default WorkflowStorageService