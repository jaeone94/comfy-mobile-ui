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
}

export const useCanvasV2Store = create<CanvasV2Store>()(
  persist(
    (set) => ({
      officialCanvasEnabled: false,
      setOfficialCanvasEnabled: (enabled: boolean) => set({ officialCanvasEnabled: enabled }),
    }),
    { name: 'comfy-mobile-canvas-v2' }
  )
);
