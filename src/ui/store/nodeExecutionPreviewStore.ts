import { create } from 'zustand';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { useGlobalStore } from '@/ui/store/globalStore';
import type { NodeExecutionPreviewFile } from '@/shared/types/app/NodeExecutionPreviewFile';

export type { NodeExecutionPreviewFile } from '@/shared/types/app/NodeExecutionPreviewFile';

interface NodeExecutionPreviewState {
  previewsByNode: Map<number, NodeExecutionPreviewFile[]>;
  setNodePreviews: (nodeId: number, files: NodeExecutionPreviewFile[]) => void;
  clearPreviews: () => void;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);
const PREVIEW_SOURCE_TYPES: Array<NonNullable<NodeExecutionPreviewFile['type']>> = ['input', 'output', 'temp'];

const normalizePreviewSourceType = (value: unknown): NonNullable<NodeExecutionPreviewFile['type']> => {
  if (typeof value === 'string' && PREVIEW_SOURCE_TYPES.includes(value as NonNullable<NodeExecutionPreviewFile['type']>)) {
    return value as NonNullable<NodeExecutionPreviewFile['type']>;
  }
  return 'output';
};

const normalizePathSegment = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

const getActiveGraphNodeIds = (): Set<number> => {
  const nodes = useGlobalStore.getState().getNodes?.() || [];
  const nodeIds = new Set<number>();
  for (const node of nodes) {
    const parsedNodeId = Number((node as any)?.id);
    if (Number.isFinite(parsedNodeId)) {
      nodeIds.add(parsedNodeId);
    }
  }
  return nodeIds;
};

const isNodeInActiveGraph = (nodeId: number): boolean => {
  const activeNodeIds = getActiveGraphNodeIds();
  if (activeNodeIds.size === 0) {
    return true;
  }
  return activeNodeIds.has(nodeId);
};

const isPreviewImageFile = (value: unknown): value is NodeExecutionPreviewFile => {
  if (!value || typeof value !== 'object') return false;

  const file = value as Record<string, unknown>;
  if (typeof file.filename !== 'string' || file.filename.length === 0) return false;

  const ext = file.filename.split('.').pop()?.toLowerCase();
  if (!ext || !IMAGE_EXTENSIONS.has(ext)) return false;

  return true;
};

const extractExecutionPreviewFiles = (container: unknown, depth = 0): NodeExecutionPreviewFile[] => {
  if (!container || typeof container !== 'object' || depth > 3) return [];

  const record = container as Record<string, unknown>;
  const files: NodeExecutionPreviewFile[] = [];

  for (const key of ['images', 'gifs']) {
    const arr = record[key];
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      if (isPreviewImageFile(item)) {
        files.push({
          filename: item.filename,
          subfolder: normalizePathSegment((item as any).subfolder),
          type: normalizePreviewSourceType((item as any).type)
        });
      }
    }
  }

  // Some nodes wrap previews under `ui`, and payload shapes can vary by node pack.
  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') continue;
    files.push(...extractExecutionPreviewFiles(value, depth + 1));
  }

  const uniqueByPath = new Map<string, NodeExecutionPreviewFile>();
  for (const file of files) {
    if (typeof (file as any).filename !== 'string') {
      continue;
    }

    const subfolder = normalizePathSegment((file as any).subfolder);
    const key = `${(file as any).type || 'output'}/${subfolder}/${file.filename}`;
    if (!uniqueByPath.has(key)) {
      uniqueByPath.set(key, { ...file, subfolder });
    }
  }

  return Array.from(uniqueByPath.values());
};

export const useNodeExecutionPreviewStore = create<NodeExecutionPreviewState>((set) => ({
  previewsByNode: new Map(),

  setNodePreviews: (nodeId, files) => {
    if (!isNodeInActiveGraph(nodeId)) {
      return;
    }

    set((state) => {
      const next = new Map(state.previewsByNode);
      if (!files || files.length === 0) {
        next.delete(nodeId);
        return { previewsByNode: next };
      }

      next.set(nodeId, files);
      return { previewsByNode: next };
    });
  },

  // Cleared explicitly when workflow context changes, not on every execution start.
  clearPreviews: () => set({ previewsByNode: new Map() })
}));

globalWebSocketService.on('executed', (event: any) => {
  try {
    const data = event?.data || event;
    const nodeId = Number(data?.node);
    if (!Number.isFinite(nodeId)) return;
    if (!isNodeInActiveGraph(nodeId)) return;

    const files = extractExecutionPreviewFiles(data?.output);
    useNodeExecutionPreviewStore.getState().setNodePreviews(nodeId, files);
  } catch (error) {
    console.warn('[NodeExecutionPreviewStore] Failed to process executed previews:', error);
  }
});

