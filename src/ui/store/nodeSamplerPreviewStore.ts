import { create } from 'zustand';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

const DEFAULT_MAX_PREVIEWS_PER_NODE = 1;

const KNOWN_SAMPLER_TYPE_TOKENS = [
  'ksampler',
  'samplercustomadvanced',
  'samplercustom',
  'ksampleradvanced'
] as const;

export interface SamplerPreviewFrame {
  imageUrl: string;
  nodeId: string;
  timestamp: number;
}

export interface WorkflowNodeDescriptor {
  id: string | number;
  type?: string | null;
  title?: string | null;
}

interface NodeSamplerPreviewState {
  previewsByNode: Map<string, SamplerPreviewFrame[]>;
  workflowNodeIds: Set<string>;
  samplerNodeIds: Set<string>;
  maxPreviewsPerNode: number;
  registerWorkflowNodes: (nodes: WorkflowNodeDescriptor[]) => void;
  setNodePreview: (params: {
    blob: Blob;
    nodeId: string | number;
    timestamp: number;
  }) => void;
  clearNodePreviews: (nodeId: string | number) => void;
  clearPreviews: () => void;
}

const normalizeNodeId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  return trimmed;
};

const normalizeToken = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const isKnownSamplerNodeDescriptor = (node: WorkflowNodeDescriptor): boolean => {
  const typeToken = normalizeToken(node.type || null);
  const titleToken = normalizeToken(node.title || null);

  return KNOWN_SAMPLER_TYPE_TOKENS.some((token) => {
    return typeToken === token || typeToken.includes(token) || titleToken.includes(token);
  });
};

const revokeIfBlobUrl = (url: string | null | undefined) => {
  if (!url || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('[NodeSamplerPreviewStore] Failed to revoke blob URL:', error);
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

export const useNodeSamplerPreviewStore = create<NodeSamplerPreviewState>((set) => ({
  previewsByNode: new Map(),
  workflowNodeIds: new Set(),
  samplerNodeIds: new Set(),
  maxPreviewsPerNode: DEFAULT_MAX_PREVIEWS_PER_NODE,

  registerWorkflowNodes: (nodes) => {
    set((state) => {
      const workflowNodeIds = new Set<string>();
      const samplerNodeIds = new Set<string>();

      for (const node of nodes) {
        const normalizedNodeId = normalizeNodeId(node.id);
        if (!normalizedNodeId) continue;

        workflowNodeIds.add(normalizedNodeId);
        if (isKnownSamplerNodeDescriptor(node)) {
          samplerNodeIds.add(normalizedNodeId);
        }
      }

      const nextPreviews = new Map(state.previewsByNode);
      for (const [nodeId, frames] of nextPreviews.entries()) {
        if (workflowNodeIds.has(nodeId)) continue;
        frames.forEach((frame) => {
          revokeIfBlobUrl(frame.imageUrl);
        });
        nextPreviews.delete(nodeId);
      }

      return {
        workflowNodeIds,
        samplerNodeIds,
        previewsByNode: nextPreviews
      };
    });
  },

  setNodePreview: ({ blob, nodeId, timestamp }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    if (!normalizedNodeId) return;

    set((state) => {
      if (!state.samplerNodeIds.has(normalizedNodeId)) return state;
      if (state.workflowNodeIds.size > 0 && !state.workflowNodeIds.has(normalizedNodeId)) return state;

      const imageUrl = URL.createObjectURL(blob);
      const existingFrames = state.previewsByNode.get(normalizedNodeId) || [];
      const nextFrames = [
        {
          imageUrl,
          nodeId: normalizedNodeId,
          timestamp
        } satisfies SamplerPreviewFrame,
        ...existingFrames
      ];

      while (nextFrames.length > state.maxPreviewsPerNode) {
        const removed = nextFrames.pop();
        if (removed) revokeIfBlobUrl(removed.imageUrl);
      }

      const nextMap = new Map(state.previewsByNode);
      nextMap.set(normalizedNodeId, nextFrames);
      return { previewsByNode: nextMap };
    });
  },

  clearNodePreviews: (nodeId) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    if (!normalizedNodeId) return;

    set((state) => {
      const frames = state.previewsByNode.get(normalizedNodeId);
      if (!frames || frames.length === 0) return state;

      frames.forEach((frame) => {
        revokeIfBlobUrl(frame.imageUrl);
      });

      const next = new Map(state.previewsByNode);
      next.delete(normalizedNodeId);
      return { previewsByNode: next };
    });
  },

  clearPreviews: () => {
    set((state) => {
      state.previewsByNode.forEach((frames) => {
        frames.forEach((frame) => {
          revokeIfBlobUrl(frame.imageUrl);
        });
      });
      return { previewsByNode: new Map() };
    });
  }
}));

let listenersRegistered = false;
let binaryImageListenerId: string | null = null;
let executionStartedListenerId: string | null = null;

export const initNodeSamplerPreviewListeners = () => {
  if (listenersRegistered) return;
  listenersRegistered = true;

  // Known-sampler-only mode:
  // associate latent preview frames only with the currently executing known sampler node.
  binaryImageListenerId = globalWebSocketService.on('binary_image_received', (rawEvent: unknown) => {
    const event = asRecord(rawEvent);
    if (!event) return;

    const blob = event.blob instanceof Blob ? event.blob : null;
    if (!blob || blob.size === 0) return;

    const executionState = globalWebSocketService.getCurrentExecutionState();
    const executingNodeId = normalizeNodeId(executionState.executingNodeId);
    if (!executingNodeId) return;

    useNodeSamplerPreviewStore.getState().setNodePreview({
      blob,
      nodeId: executingNodeId,
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now()
    });
  });

  executionStartedListenerId = globalWebSocketService.on('execution_started', () => {
    useNodeSamplerPreviewStore.getState().clearPreviews();
  });
};

export const disposeNodeSamplerPreviewListeners = () => {
  if (!listenersRegistered) return;

  if (binaryImageListenerId) {
    globalWebSocketService.offById('binary_image_received', binaryImageListenerId);
  }
  if (executionStartedListenerId) {
    globalWebSocketService.offById('execution_started', executionStartedListenerId);
  }

  binaryImageListenerId = null;
  executionStartedListenerId = null;
  listenersRegistered = false;
};
