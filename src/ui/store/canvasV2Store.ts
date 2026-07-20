import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Feature flag for the official-canvas (v2) editor surface.
 * When enabled, WorkflowEditor renders the official ComfyUI frontend in an
 * iframe (CanvasHost) instead of the legacy custom canvas renderer.
 */
interface CanvasV2Store {
  officialCanvasEnabled: boolean;
  setOfficialCanvasEnabled: (enabled: boolean) => void;
  /** Lite nodes: zoom-LOD DOM simplification inside the official canvas. */
  liteNodesEnabled: boolean;
  setLiteNodesEnabled: (enabled: boolean) => void;
}

export const useCanvasV2Store = create<CanvasV2Store>()(
  persist(
    (set) => ({
      officialCanvasEnabled: false,
      setOfficialCanvasEnabled: (enabled: boolean) => set({ officialCanvasEnabled: enabled }),
      liteNodesEnabled: true,
      setLiteNodesEnabled: (enabled: boolean) => set({ liteNodesEnabled: enabled }),
    }),
    { name: 'comfy-mobile-canvas-v2' }
  )
);
