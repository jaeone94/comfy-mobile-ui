import { create } from 'zustand';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import type { NodeExecutionPreviewFile } from '@/shared/types/app/NodeExecutionPreviewFile';

export type { NodeExecutionPreviewFile } from '@/shared/types/app/NodeExecutionPreviewFile';

interface NodeExecutionPreviewState {
  previewsByNode: Map<number, NodeExecutionPreviewFile[]>;
  setNodePreviews: (nodeId: number, files: NodeExecutionPreviewFile[]) => void;
  clearPreviews: () => void;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);

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
          subfolder: item.subfolder || '',
          type: item.type || 'output'
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
    const key = `${file.type || 'output'}/${file.subfolder || ''}/${file.filename}`;
    if (!uniqueByPath.has(key)) uniqueByPath.set(key, file);
  }

  return Array.from(uniqueByPath.values());
};

export const useNodeExecutionPreviewStore = create<NodeExecutionPreviewState>((set) => ({
  previewsByNode: new Map(),

  setNodePreviews: (nodeId, files) => {
    set((state) => {
      const next = new Map(state.previewsByNode);
      next.set(nodeId, files);
      return { previewsByNode: next };
    });
  },

  clearPreviews: () => set({ previewsByNode: new Map() })
}));

globalWebSocketService.on('execution_started', () => {
  useNodeExecutionPreviewStore.getState().clearPreviews();
});

globalWebSocketService.on('executed', (event: any) => {
  try {
    const data = event?.data || event;
    const nodeId = Number(data?.node);
    if (!Number.isFinite(nodeId)) return;

    const files = extractExecutionPreviewFiles(data?.output);
    if (files.length === 0) return;

    useNodeExecutionPreviewStore.getState().setNodePreviews(nodeId, files);
  } catch (error) {
    console.warn('[NodeExecutionPreviewStore] Failed to process executed previews:', error);
  }
});

