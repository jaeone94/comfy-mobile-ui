import type { PreviewMethod } from '@/ui/store/latentPreviewStore';

export interface PromptExtraData {
  preview_method: PreviewMethod;
  extra_pnginfo?: {
    workflow: Record<string, unknown>;
  };
}

export const isWorkflowMetadata = (workflow: unknown): workflow is Record<string, unknown> =>
  typeof workflow === 'object' && workflow !== null && !Array.isArray(workflow);

/** Build the optional metadata consumed by ComfyUI output nodes. */
export const buildPromptExtraData = (
  previewMethod: PreviewMethod,
  workflow?: unknown,
): PromptExtraData => ({
  preview_method: previewMethod,
  ...(isWorkflowMetadata(workflow) && {
    extra_pnginfo: {
      workflow,
    },
  }),
});
