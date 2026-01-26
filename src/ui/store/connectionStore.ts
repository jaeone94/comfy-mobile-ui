import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ConnectionState } from '@/shared/types/comfy/connection';
import { connectionService } from '@/infrastructure/api/ConnectionService';
import { globalWebSocketService, type GlobalWebSocketState } from '@/infrastructure/websocket/GlobalWebSocketService';

interface ConnectionStore extends ConnectionState {
  setUrl: (url: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  setError: (error: string | null) => void;
  retryConnection: () => Promise<void>;
  autoReconnectEnabled: boolean;
  setAutoReconnect: (enabled: boolean) => void;
  tryAutoConnect: () => Promise<void>;
  checkExtension: () => Promise<void>; // New simple method
  remoteVersion: string | null;

  // WebSocket-specific state and actions
  webSocket: GlobalWebSocketState;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  initializeWebSocketListeners: () => void;
}

const STORAGE_KEY = 'comfy-mobile-connection';

export const useConnectionStore = create<ConnectionStore>()(
  devtools(
    persist(
      (set, get) => ({
        url: '',
        isConnected: false,
        isConnecting: false,
        lastPingTime: null,
        error: null,
        hasExtension: false,
        remoteVersion: null,
        isCheckingExtension: false,
        autoReconnectEnabled: true,

        // Initialize WebSocket state
        webSocket: globalWebSocketService.getState(),

        setUrl: (url: string) => {
          set({ url, error: null });
        },

        connect: async () => {
          const { url, isConnecting } = get();

          if (!url || isConnecting) return;

          set({ isConnecting: true, error: null });

          try {
            connectionService.setBaseURL(url);
            const result = await connectionService.testConnection();

            if (result.success) {
              set({
                isConnected: true,
                isConnecting: false,
                lastPingTime: Date.now(),
                error: null
              });

              // Auto-connect WebSocket when HTTP connection succeeds
              get().connectWebSocket();

              // Check extension availability
              get().checkExtension();
            } else {
              set({
                isConnected: false,
                isConnecting: false,
                error: result.error || 'Connection failed'
              });
            }
          } catch (error) {
            set({
              isConnected: false,
              isConnecting: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        },

        disconnect: () => {
          // Disconnect both HTTP and WebSocket
          get().disconnectWebSocket();

          // Clear execution state buffer to prevent stale execution state
          globalWebSocketService.clearExecutionStateBuffer();

          set({
            isConnected: false,
            lastPingTime: null,
            error: null,
            hasExtension: false,
            remoteVersion: null,
            isCheckingExtension: false
          });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        retryConnection: async () => {
          const { autoReconnectEnabled } = get();
          if (!autoReconnectEnabled) return;

          const delays = [1000, 2000, 4000, 8000];

          for (let i = 0; i < delays.length; i++) {
            await new Promise(resolve => setTimeout(resolve, delays[i]));

            const { isConnected } = get();
            if (isConnected) return;

            await get().connect();

            const { isConnected: connected } = get();
            if (connected) return;
          }
        },

        setAutoReconnect: (enabled: boolean) => {
          set({ autoReconnectEnabled: enabled });
        },

        tryAutoConnect: async () => {
          const { url, isConnected, isConnecting } = get();

          // Skip if already connected, connecting, or no URL saved
          if (isConnected || isConnecting || !url.trim()) {
            return;
          }


          // Use a shorter timeout for auto-connect to avoid blocking UI
          set({ isConnecting: true, error: null });

          try {
            // Check app version independently of connection status
            get().checkExtension();

            connectionService.setBaseURL(url);
            // Use shorter timeout for auto-connection (3 seconds)
            const result = await connectionService.testConnection(3000);

            if (result.success) {
              set({
                isConnected: true,
                isConnecting: false,
                lastPingTime: Date.now(),
                error: null
              });

              // Auto-connect WebSocket when HTTP auto-connection succeeds
              get().connectWebSocket();
            } else {
              set({
                isConnected: false,
                isConnecting: false,
                error: null // Don't show error for auto-connect failures
              });
            }
          } catch (error) {
            set({
              isConnected: false,
              isConnecting: false,
              error: null // Don't show error for auto-connect failures
            });
          }
        },

        checkExtension: async () => {
          const { url } = get();

          // 1. Check static version file (App Version) - Always available if served
          try {
            const versionRes = await fetch('/version.json');
            if (versionRes.ok) {
              const data = await versionRes.json();
              set({ remoteVersion: data.version || '0.0.0' });
              console.log('✅ App version loaded:', data.version);
            }
          } catch (e) {
            console.warn('Failed to load local version.json (Dev environment?)', e);
            set({ remoteVersion: 'dev' });
          }

          // 2. Check Extension API presence (Server Capability) - Requires connection
          if (!url) {
            set({ hasExtension: false, isCheckingExtension: false });
            return;
          }

          try {
            const apiRes = await fetch(`${url}/comfymobile/api/status`, {
              method: 'GET',
              signal: AbortSignal.timeout(3000)
            });

            if (apiRes.ok) {
              const data = await apiRes.json();
              const isValid = data.status === 'ok' && data.extension === 'ComfyUI Mobile UI API';
              set({
                hasExtension: isValid,
                isCheckingExtension: false
              });
              console.log('✅ Extension API Status:', isValid ? 'Available' : 'Invalid Response');
            } else {
              set({ hasExtension: false, isCheckingExtension: false });
            }
          } catch (error) {
            // API check failed (server down or extension not installed)
            set({ hasExtension: false, isCheckingExtension: false });
          }
        },

        // WebSocket-specific actions
        connectWebSocket: () => {
          const { url } = get();
          if (!url) return;

          globalWebSocketService.setServerUrl(url);
          globalWebSocketService.connect();
        },

        disconnectWebSocket: () => {
          globalWebSocketService.disconnect();
        },

        initializeWebSocketListeners: () => {
          // Update store when WebSocket state changes
          const handleStateChange = (wsState: GlobalWebSocketState) => {
            set({ webSocket: wsState });
          };

          const handleConnected = (data: any) => {
          };

          const handleDisconnected = (data: any) => {
          };

          const handleError = (data: any) => {
            console.error('❌ Global WebSocket error:', data.type, data.error);
          };

          // Subscribe to WebSocket events
          globalWebSocketService.on('stateChange', handleStateChange);
          globalWebSocketService.on('connected', handleConnected);
          globalWebSocketService.on('disconnected', handleDisconnected);
          globalWebSocketService.on('error', handleError);

          // Return cleanup function
          return () => {
            globalWebSocketService.off('stateChange', handleStateChange);
            globalWebSocketService.off('connected', handleConnected);
            globalWebSocketService.off('disconnected', handleDisconnected);
            globalWebSocketService.off('error', handleError);
          };
        }
      }),
      {
        name: STORAGE_KEY,
        partialize: (state) => ({
          url: state.url,
          autoReconnectEnabled: state.autoReconnectEnabled
        }),
      }
    )
  )
);