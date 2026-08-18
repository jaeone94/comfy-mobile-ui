/**
 * Chain Progress WebSocket Service
 *
 * Provides WebSocket connection to api-extension for chain execution progress
 * Similar pattern to GlobalWebSocketService but dedicated to chain progress tracking
 */

import { withComfyAuth } from '@/infrastructure/auth/ComfyAuthService';

// EventEmitter implementation with ID support
class EventEmitter {
  private events: Record<string, Function[]> = {};
  private listenerIds: Map<string, string> = new Map();
  private idCounter = 0;

  on(event: string, listener: Function): string {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    const id = `${event}_${++this.idCounter}`;
    this.events[event].push(listener);
    this.listenerIds.set(id, event);
    return id;
  }

  emit(event: string, ...args: any[]) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }

  off(event: string, listener: Function) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
  }

  offById(event: string, id: string) {
    if (this.events[event] && this.listenerIds.has(id)) {
      const targetEvent = this.listenerIds.get(id);
      if (targetEvent === event) {
        this.listenerIds.delete(id);
      }
    }
  }

  removeAllListeners() {
    this.events = {};
    this.listenerIds.clear();
  }

  getListenerCount(event: string): number {
    return this.events[event] ? this.events[event].length : 0;
  }
}

export interface ChainProgressMessage {
  type: 'chain_progress';
  data: ChainProgressData;
}

export interface ChainProgressData {
  isExecuting: boolean;
  chainId: string | null;
  chainName: string | null;
  executionId: string | null;
  currentWorkflowIndex: number | null;
  workflows: ChainWorkflowStatus[];
  completed?: boolean;
  success?: boolean;
  error?: string | null;
  timestamp: string;
}

export interface ChainWorkflowStatus {
  index: number;
  id: string;
  name: string;
  status: 'pending' | 'waiting' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface ChainProgressState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessageTime: number | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  currentProgress: ChainProgressData | null;
}

class ChainProgressWebSocketService extends EventEmitter {
  private serverUrl: string = '';
  private webSocket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  // State management
  private state: ChainProgressState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessageTime: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    currentProgress: null
  };

  constructor() {
    super();
  }

  /**
   * Get current state
   */
  getState(): ChainProgressState {
    return { ...this.state };
  }

  /**
   * Get current progress data
   */
  getCurrentProgress(): ChainProgressData | null {
    return this.state.currentProgress;
  }

  /**
   * Update internal state
   */
  private updateState(updates: Partial<ChainProgressState>): void {
    this.state = { ...this.state, ...updates };
    this.emit('state_change', this.state);
  }

  /**
   * Set server URL and reconnect if needed
   */
  setServerUrl(url: string): void {
    const cleanUrl = url.replace(/\/$/, '');

    if (this.serverUrl !== cleanUrl) {
      this.serverUrl = cleanUrl;

      // Reconnect if URL changed and was previously connected
      if (this.state.isConnected || this.state.isConnecting) {
        this.disconnect();
        this.connect();
      }
    }
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (!this.serverUrl) {
      this.updateState({ error: 'No server URL configured' });
      return;
    }

    if (this.state.isConnecting || this.state.isConnected) {
      return;
    }

    console.log(`🔄 [ChainProgressWS] Attempting connection to chain progress WebSocket`);

    this.updateState({
      isConnecting: true,
      error: null
    });

    const wsUrl = withComfyAuth(
      this.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/comfymobile/api/chains/progress'
    );

    this.webSocket = new WebSocket(wsUrl);

    this.webSocket.onopen = () => {
      this.updateState({
        isConnected: true,
        isConnecting: false,
        reconnectAttempts: 0,
        error: null
      });

      // Clear any existing reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Start ping interval to keep connection alive
      this.startPingInterval();

      console.log(`✅ [ChainProgressWS] Connected to chain progress WebSocket`);

      // Request current state from server
      this.requestCurrentState();

      // Emit connection event
      this.emit('connected');
    };

    this.webSocket.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          if (event.data === 'pong') {
            // Pong response from server
            return;
          }

          const message: ChainProgressMessage = JSON.parse(event.data);

          // Update last message time
          this.updateState({ lastMessageTime: Date.now() });

          console.log(`[ChainProgressWS] Message received:`, message);

          // Update current progress state
          if (message.type === 'chain_progress') {
            this.updateState({ currentProgress: message.data });

            // Emit typed event
            this.emit('progress_update', message.data);
          }

          // Emit raw message
          this.emit('message', message);
        }
      } catch (error) {
        console.error(`[ChainProgressWS] Error parsing message:`, error);
      }
    };

    this.webSocket.onerror = (error) => {
      console.error(`❌ [ChainProgressWS] WebSocket error:`, error);
      this.updateState({ error: 'WebSocket connection error' });
      this.emit('error', error);
    };

    this.webSocket.onclose = (event) => {
      console.log(`🔌 [ChainProgressWS] WebSocket closed:`, {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });

      const wasConnected = this.state.isConnected;

      this.updateState({
        isConnected: false,
        isConnecting: false
      });

      // Stop ping interval
      this.stopPingInterval();

      // Emit disconnection event
      this.emit('disconnected', { code: event.code, reason: event.reason });

      // Attempt reconnection if it wasn't a clean close
      if (!event.wasClean && wasConnected) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.webSocket) {
      console.log(`🔌 [ChainProgressWS] Disconnecting...`);
      this.webSocket.close(1000, 'Client disconnect');
      this.webSocket = null;
    }

    this.stopPingInterval();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.updateState({
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
      console.error(`❌ [ChainProgressWS] Max reconnection attempts reached`);
      this.updateState({
        error: `Failed to reconnect after ${this.state.maxReconnectAttempts} attempts`
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts), 30000);

    console.log(`⏰ [ChainProgressWS] Scheduling reconnect in ${delay}ms (attempt ${this.state.reconnectAttempts + 1}/${this.state.maxReconnectAttempts})`);

    this.updateState({
      reconnectAttempts: this.state.reconnectAttempts + 1
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
        this.webSocket.send('ping');
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Request current state from server
   */
  requestCurrentState(): void {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      console.log(`[ChainProgressWS] Requesting current state from server`);
      this.webSocket.send('request_state');
    } else {
      console.warn(`[ChainProgressWS] Cannot request state - WebSocket not connected`);
    }
  }

  /**
   * Send message to server (if needed)
   */
  send(message: any): void {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    } else {
      console.warn(`[ChainProgressWS] Cannot send message - WebSocket not connected`);
    }
  }
}

// Global singleton instance
export const chainProgressWebSocketService = new ChainProgressWebSocketService();
