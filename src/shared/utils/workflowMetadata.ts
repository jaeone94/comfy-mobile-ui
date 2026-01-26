/**
 * ComfyMobileUI Workflow Metadata Utilities
 * 
 * Manages mobile UI-specific metadata that extends ComfyUI workflows
 * without breaking standard ComfyUI compatibility.
 */

import { IComfyJson, IMobileUIMetadata } from '@/shared/types/app/IComfyJson';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';

const METADATA_VERSION = '1.0.0';
const CREATED_BY = 'ComfyMobileUI';

/**
 * Initialize mobile UI metadata for a workflow
 * Called when loading workflows that don't have our metadata
 */
export function initializeMobileUIMetadata(workflow_json: IComfyJson): IComfyJson {
  if (workflow_json.mobile_ui_metadata) {
    return workflow_json;
  }


  const metadata: IMobileUIMetadata = {
    version: METADATA_VERSION,
    created_by: CREATED_BY,
    control_after_generate: initializeControlAfterGenerate(workflow_json)
  };

  return {
    ...workflow_json,
    mobile_ui_metadata: metadata
  };
}

/**
 * Initialize control_after_generate values for nodes with seed widgets
 * Detects nodes that should have control_after_generate and sets default values
 */
function initializeControlAfterGenerate(workflow_json: IComfyJson): Record<number, string> {
  const controlValues: Record<number, string> = {};

  Object.values(workflow_json.nodes).forEach((node) => {
    // Check if this node type is likely to have seed widgets
    const nodeTypeHasSeeds = node.type?.toLowerCase().includes('sampler') ||
      node.type?.toLowerCase().includes('random') ||
      node.type?.toLowerCase().includes('noise');

    if (!nodeTypeHasSeeds) {
      // Skip nodes that typically don't have seeds
      return;
    }

    // Check if node actually has seed-like values
    let hasActualSeed = false;

    // Method 1: Check widgets array for seed widget (cast to any for dynamic property access)
    const nodeAny = node as any;
    if (nodeAny.widgets && Array.isArray(nodeAny.widgets)) {
      const hasSeedWidget = nodeAny.widgets.some((widget: any) =>
        widget.name === 'seed' || widget.name === 'noise_seed' || widget.type === 'SEED'
      );
      if (hasSeedWidget) {
        hasActualSeed = true;
      }
    }

    // Method 2: Check widgets_values for seed patterns
    if (!hasActualSeed && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
      // For sampler nodes, the first value is typically the seed
      const firstValue = node.widgets_values[0];
      if (typeof firstValue === 'number' && firstValue >= 0 && firstValue <= 0xFFFFFFFF) {
        hasActualSeed = true;
      }
    }

    // Only initialize control_after_generate for nodes that actually have seeds
    if (hasActualSeed) {
      controlValues[Number(node.id)] = 'fixed'; // Default value
    }
  });

  return controlValues;
}

/**
 * Get control_after_generate value for a node
 */
export function getControlAfterGenerate(workflow_json: IComfyJson, nodeId: number): string {
  const metadata = workflow_json.mobile_ui_metadata;
  if (!metadata?.control_after_generate) {
    return 'fixed'; // Default value
  }

  return metadata.control_after_generate[nodeId] || 'fixed';
}

/**
 * Set control_after_generate value for a node
 */
export function setControlAfterGenerate(
  workflow_json: IComfyJson,
  nodeId: number,
  value: string
): IComfyJson {
  // Ensure metadata exists
  if (!workflow_json.mobile_ui_metadata) {
    workflow_json = initializeMobileUIMetadata(workflow_json);
  }

  // Ensure control_after_generate object exists
  if (!workflow_json.mobile_ui_metadata!.control_after_generate) {
    workflow_json.mobile_ui_metadata!.control_after_generate = {};
  }

  // Set the value
  workflow_json.mobile_ui_metadata!.control_after_generate![nodeId] = value;


  return workflow_json;
}

/**
 * Remove mobile UI metadata when exporting to standard ComfyUI format
 * This ensures compatibility with other ComfyUI applications
 */
export function removeMetadataForExport(workflow_json: IComfyJson): IComfyJson {
  const { mobile_ui_metadata, ...standardWorkflow } = workflow_json;


  return standardWorkflow;
}

/**
 * Check if workflow has mobile UI metadata
 */
export function hasMobileUIMetadata(workflow_json: IComfyJson): boolean {
  return !!workflow_json.mobile_ui_metadata;
}

/**
 * Migrate metadata to newer versions if needed
 */
export function migrateMetadata(workflow_json: IComfyJson): IComfyJson {
  if (!workflow_json.mobile_ui_metadata) {
    return workflow_json;
  }

  const currentVersion = workflow_json.mobile_ui_metadata.version;

  if (currentVersion === METADATA_VERSION) {
    return workflow_json; // Already current version
  }


  // Future migration logic would go here
  // For now, just update the version
  workflow_json.mobile_ui_metadata.version = METADATA_VERSION;

  return workflow_json;
}

/**
 * Sync control_after_generate values from widget editor to workflow metadata
 */
export function syncControlAfterGenerateToMetadata(
  workflow: IComfyWorkflow,
  nodeId: number,
  value: string
): IComfyWorkflow {
  if (!workflow.workflow_json) {
    return workflow;
  }

  const updatedWorkflowJson = setControlAfterGenerate(workflow.workflow_json, nodeId, value);

  return {
    ...workflow,
    workflow_json: updatedWorkflowJson
  };
}

/**
 * Load control_after_generate values from workflow metadata to widget editor
 */
export function loadControlAfterGenerateFromMetadata(
  workflow_json: IComfyJson
): Record<number, string> {
  if (!workflow_json.mobile_ui_metadata?.control_after_generate) {
    return {};
  }

  return { ...workflow_json.mobile_ui_metadata.control_after_generate };
}