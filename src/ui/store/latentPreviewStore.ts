import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type PreviewMethod = 'none' | 'auto' | 'latent2rgb' | 'taesd';

interface LatentPreviewState {
    // State
    imageUrl: string | null;
    nodeId: string | null;
    promptId: string | null;
    isExecuting: boolean;
    isVisible: boolean;
    isLatentPreviewFullscreen: boolean;
    lastUpdated: number;
    lastMessageTimestamp: number;
    previewMethod: PreviewMethod;

    // Actions
    updatePreview: (params: { imageUrl?: string; blob: Blob; nodeId: string; promptId: string; timestamp: number }) => void;
    setExecuting: (executing: boolean) => void;
    setVisible: (visible: boolean) => void;
    setLatentPreviewFullscreen: (isLatentPreviewFullscreen: boolean) => void;
    clearPreview: () => void;
    setPreviewMethod: (method: PreviewMethod) => void;
}

export const useLatentPreviewStore = create<LatentPreviewState>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial state
                imageUrl: null,
                nodeId: null,
                promptId: null,
                isExecuting: false,
                isVisible: true,
                isLatentPreviewFullscreen: false,
                lastUpdated: 0,
                lastMessageTimestamp: 0,
                previewMethod: 'none',

                // Actions
                updatePreview: ({ blob, nodeId, promptId, timestamp }) => {
                    const state = get();

                    // 🛑 Prevent out-of-order updates (race conditions)
                    if (timestamp < state.lastMessageTimestamp) {
                        console.warn('[LatentPreviewStore] Discarding out-of-order preview:', {
                            current: state.lastMessageTimestamp,
                            received: timestamp
                        });
                        return;
                    }

                    // 🗑️ Create NEW URL and revoke OLD one
                    let newUrl = '';
                    try {
                        newUrl = URL.createObjectURL(blob);
                    } catch (e) {
                        console.error('[LatentPreviewStore] Failed to create object URL:', e);
                        return;
                    }

                    if (state.imageUrl) {
                        try {
                            URL.revokeObjectURL(state.imageUrl);
                        } catch (e) {
                            console.warn('[LatentPreviewStore] Failed to revoke object URL:', e);
                        }
                    }

                    set({
                        imageUrl: newUrl,
                        nodeId,
                        promptId,
                        lastMessageTimestamp: timestamp,
                        lastUpdated: Date.now()
                    });
                },

                setExecuting: (isExecuting) => {
                    set({ isExecuting });
                },

                setVisible: (isVisible) => set({ isVisible }),

                setLatentPreviewFullscreen: (isLatentPreviewFullscreen) => set({ isLatentPreviewFullscreen }),

                clearPreview: () => {
                    const state = get();
                    if (state.imageUrl) {
                        URL.revokeObjectURL(state.imageUrl);
                    }
                    set({
                        imageUrl: null,
                        nodeId: null,
                        promptId: null,
                        lastUpdated: 0
                    });
                },

                setPreviewMethod: (method) => set({ previewMethod: method }),
            }),
            {
                name: 'latent-preview-settings',
                partialize: (state) => ({
                    previewMethod: state.previewMethod,
                    isVisible: state.isVisible
                    // isLatentPreviewFullscreen should NOT be persisted to prevent refresh logic bugs
                }),
            }
        ),
        {
            name: 'LatentPreview',
        }
    )
);

// --- 🌐 Global Subscription Logic ---
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

globalWebSocketService.on('binary_image_received', (event: any) => {
    useLatentPreviewStore.getState().updatePreview({
        blob: event.blob,
        nodeId: event.nodeId,
        promptId: event.promptId,
        timestamp: event.timestamp
    });
});

globalWebSocketService.on('executing', () => {
    useLatentPreviewStore.getState().setExecuting(true);
});

const handleExecutionEnd = () => {
    useLatentPreviewStore.getState().setExecuting(false);
};

globalWebSocketService.on('execution_success', handleExecutionEnd);
globalWebSocketService.on('execution_error', handleExecutionEnd);
globalWebSocketService.on('execution_interrupted', handleExecutionEnd);
