/**
 * WorkflowFileProcessor - File Processing for Workflows
 * 
 * Handles file operations for workflows:
 * - JSON file upload and parsing
 * - Workflow creation from files
 * - Metadata extraction
 * - Thumbnail generation
 */

import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService'
import { ComfyNodeMetadataService } from '@/infrastructure/api/ComfyNodeMetadataService'
import type { Workflow } from '@/shared/types/app/IComfyWorkflow'
import type { IComfyJson } from '@/shared/types/app/base'
import type { IObjectInfo } from '@/shared/types/comfy/IComfyObjectInfo'

/**
 * Process uploaded workflow file
 */
export async function processWorkflowFile(file: File): Promise<{
  success: boolean
  workflow?: Workflow
  error?: string
}> {
  try {
    // Read file content
    const content = await readFileContent(file)

    // Parse JSON
    let jsonData: any
    try {
      jsonData = JSON.parse(content)
    } catch (error) {
      return { success: false, error: 'Invalid JSON format' }
    }

    // Validate workflow structure
    if (!validateWorkflowJson(jsonData)) {
      return { success: false, error: 'Invalid workflow JSON structure' }
    }

    // Create workflow
    const workflow = await createWorkflowFromJson(
      extractWorkflowName(file.name, jsonData),
      jsonData as IComfyJson,
      {
        description: extractDescription(jsonData),
        author: extractAuthor(jsonData),
        tags: extractTags(jsonData)
      }
    )

    return { success: true, workflow }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed'
    }
  }
}

/**
 * Create workflow from JSON data
 */
export async function createWorkflowFromJson(
  name: string,
  workflowJson: IComfyJson,
  metadata: Partial<Workflow> = {}
): Promise<Workflow> {
  // Detailed parsing diagnostics
  const nodeCount = (workflowJson.nodes as any)?.length || 0
  const linkCount = (workflowJson.links as any)?.length || 0
  const groupCount = (workflowJson.groups as any)?.length || 0

  console.log('🔍 Workflow parsing diagnostics:', {
    name,
    nodeCount,
    linkCount,
    groupCount,
    hasNodes: !!workflowJson.nodes,
    hasLinks: !!workflowJson.links,
    hasGroups: !!workflowJson.groups,
    lastNodeId: workflowJson.last_node_id,
    lastLinkId: workflowJson.last_link_id,
    extraData: workflowJson.extra ? Object.keys(workflowJson.extra) : null,
    nodeTypes: (workflowJson.nodes as any)?.map?.((n: any) => n.type)?.slice(0, 10) // First 10 types
  })

  // Check for zero node count and provide detailed error
  if (nodeCount === 0) {
    const errorDetails = {
      hasNodesProperty: 'nodes' in workflowJson,
      nodesValue: workflowJson.nodes,
      nodesType: typeof workflowJson.nodes,
      isArray: Array.isArray(workflowJson.nodes),
      jsonKeys: Object.keys(workflowJson),
      dataStructure: analyzeDataStructure(workflowJson)
    }

    console.error('❌ Zero node count detected:', errorDetails)

    // Throw detailed error for zero nodes
    throw new Error(`Workflow has 0 nodes. Parsing details: ${JSON.stringify(errorDetails, null, 2)}`)
  }

  // Generate thumbnail
  let thumbnail: string | undefined
  try {
    thumbnail = generateWorkflowThumbnail({
      nodes: (workflowJson.nodes || []) as any,
      links: (workflowJson.links || []) as any,
      groups: (workflowJson.groups || []) as any
    })
  } catch (error) {
    console.warn('Failed to generate thumbnail:', error)
  }

  const workflow: Workflow = {
    id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: metadata.description,
    createdAt: new Date(),
    author: metadata.author,
    nodeCount,
    tags: metadata.tags || [],
    workflow_json: workflowJson,
    isValid: true,
    thumbnail,
    ...metadata
  }

  // Validate by attempting basic structure check
  try {
    validateWorkflowStructure(workflow)
    workflow.isValid = true
  } catch (error) {
    console.warn('Invalid workflow structure:', error)
    workflow.isValid = false
  }

  return workflow
}

/**
 * Create workflow from URL
 */
export async function createWorkflowFromUrl(url: string): Promise<{
  success: boolean
  workflow?: Workflow
  error?: string
}> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const jsonData = await response.json()

    if (!validateWorkflowJson(jsonData)) {
      return { success: false, error: 'Invalid workflow JSON structure' }
    }

    const urlName = extractNameFromUrl(url)
    const workflow = await createWorkflowFromJson(urlName, jsonData)

    return { success: true, workflow }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch from URL'
    }
  }
}

// ============================================================================
// Analysis Methods
// ============================================================================

/**
 * Analyze data structure to help diagnose parsing issues
 */
function analyzeDataStructure(data: any): any {
  if (!data || typeof data !== 'object') {
    return { type: typeof data, value: data }
  }

  const analysis: any = {
    type: 'object',
    keys: Object.keys(data),
    hasNodes: 'nodes' in data,
    hasLinks: 'links' in data,
    hasGroups: 'groups' in data
  }

  if (analysis.hasNodes) {
    analysis.nodesAnalysis = {
      type: typeof data.nodes,
      isArray: Array.isArray(data.nodes),
      length: data.nodes?.length,
      firstNode: data.nodes?.[0] ? {
        id: data.nodes[0].id,
        type: data.nodes[0].type,
        keys: Object.keys(data.nodes[0])
      } : null
    }
  }

  if (analysis.hasLinks) {
    analysis.linksAnalysis = {
      type: typeof data.links,
      isArray: Array.isArray(data.links),
      length: data.links?.length
    }
  }

  return analysis
}

// ============================================================================
// Validation Methods
// ============================================================================

/**
 * Validate workflow JSON structure
 */
export function validateWorkflowJson(data: any): data is IComfyJson {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.links) &&
    typeof data.last_node_id === 'number' &&
    typeof data.last_link_id === 'number'
  )
}

/**
 * Validate workflow structure
 */
function validateWorkflowStructure(workflow: Workflow): void {
  if (!workflow.id) throw new Error('Missing workflow ID')
  if (!workflow.name) throw new Error('Missing workflow name')
  if (!workflow.workflow_json) throw new Error('Missing workflow JSON data')
  if (!workflow.createdAt) throw new Error('Missing creation date')

  const json = workflow.workflow_json
  if (!Array.isArray(json.nodes)) throw new Error('Invalid nodes array')
  if (!Array.isArray(json.links)) throw new Error('Invalid links array')
}

// ============================================================================
// Metadata Extraction Methods
// ============================================================================

/**
 * Extract workflow name from file or metadata
 */
export function extractWorkflowName(fileName: string, workflowData?: any): string {
  // Try workflow metadata first
  if (workflowData?.extra?.name && workflowData.extra.name !== 'Untitled Workflow') {
    return workflowData.extra.name
  }

  // Clean up filename
  const nameFromFile = fileName
    .replace(/\.json$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())

  return nameFromFile || 'Untitled Workflow'
}

/**
 * Extract workflow description
 */
export function extractDescription(workflowData?: any): string | undefined {
  return workflowData?.extra?.description
}

/**
 * Extract workflow author
 */
export function extractAuthor(workflowData?: any): string | undefined {
  return workflowData?.extra?.author
}

/**
 * Extract workflow tags
 */
export function extractTags(workflowData?: any): string[] | undefined {
  return workflowData?.extra?.tags
}

/**
 * Extract name from URL
 */
function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const fileName = pathParts[pathParts.length - 1]

    if (fileName && fileName !== '/') {
      return extractWorkflowName(fileName)
    }

    return `Workflow from ${urlObj.hostname}`
  } catch {
    return 'Downloaded Workflow'
  }
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Read file content as text
 */
export async function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

/**
 * Check if file is valid workflow JSON
 */
export async function validateFile(file: File): Promise<{
  valid: boolean
  error?: string
  preview?: {
    nodeCount: number
    linkCount: number
    hasGroups: boolean
    version?: string
  }
}> {
  try {
    if (!file.name.toLowerCase().endsWith('.json')) {
      return { valid: false, error: 'File must be a JSON file' }
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return { valid: false, error: 'File too large (max 10MB)' }
    }

    const content = await readFileContent(file)
    const jsonData = JSON.parse(content)

    if (!validateWorkflowJson(jsonData)) {
      return { valid: false, error: 'Invalid workflow JSON structure' }
    }

    return {
      valid: true,
      preview: {
        nodeCount: (jsonData.nodes as any)?.length || 0,
        linkCount: (jsonData.links as any)?.length || 0,
        hasGroups: Array.isArray(jsonData.groups) && jsonData.groups.length > 0,
        version: jsonData.version || jsonData.extra?.version
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid file format'
    }
  }
}

/**
 * Get supported file types
 */
export function getSupportedFileTypes(): string[] {
  return ['.json']
}

/**
 * Get file size limit in bytes
 */
export function getFileSizeLimit(): number {
  return 10 * 1024 * 1024 // 10MB
}

// Main export object containing all workflow file service functions
export const WorkflowFileService = {
  processWorkflowFile,
  createWorkflowFromJson,
  createWorkflowFromUrl,
  validateWorkflowJson,
  extractWorkflowName,
  extractDescription,
  extractAuthor,
  extractTags,
  readFileContent,
  validateFile,
  getSupportedFileTypes,
  getFileSizeLimit
} as const;

// Backward compatibility
export const WorkflowFileProcessor = WorkflowFileService;