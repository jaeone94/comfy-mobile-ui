/**
 * Global WebSocket Service
 * 
 * Provides app-wide persistent WebSocket connection to ComfyUI server
 * Integrates with connectionStore for automatic connection management
 * Handles reconnection, event broadcasting, and client ID management
 */

// EventEmitter implementation with ID support (compatible with original ComfyApiClient)
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
        // Remove the listener by finding its index
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

export interface WebSocketMessage {
  type: string;
  data: any;
}

export interface GlobalWebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessageTime: number | null;
  clientId: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

// Buffered event interface for initial connection race condition handling
export interface BufferedEvent {
  type: string;
  data: any;
  timestamp: number;
}

class GlobalWebSocketService extends EventEmitter {
  private serverUrl: string = '';
  private webSocket: WebSocket | null = null;
  private clientId: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // State management
  private state: GlobalWebSocketState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessageTime: null,
    clientId: '',
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  };

  // 🎯 Execution state tracking
  private executionState = new Map<string, {
    promptId: string;
    isRunning: boolean;
    hasEmittedRunning: boolean;
    startTime: number;
  }>();

  // 🎯 Current processing state (compatible with original ComfyApiClient)
  private currentProcessingState = {
    isProcessing: false,
    currentPromptId: null as string | null,
    currentWorkflowId: null as string | null,
    currentWorkflowName: null as string | null
  };

  // 🎯 Persistent execution state buffer (rolling buffer for navigation between pages)
  private executionStateBuffer: BufferedEvent[] = [];
  private maxBufferSize: number = 10; // Keep last 10 execution events
  private bufferEventTypes: Set<string> = new Set([
    'executing',
    'progress',
    'executed',
    'execution_started',
    'execution_success',
    'execution_error',
    'execution_interrupted',
    'progress_state'
  ]);

  constructor() {
    super();
    this.clientId = this.generateClientId();
    this.state.clientId = this.clientId;
  }

  private generateClientId(): string {
    // 🎯 Use hardcoded static clientId to ensure consistent connection across all browsers and sessions
    // This MUST match ComfyApiClient's clientId for proper message routing
    const staticClientId = 'comfy-mobile-ui-client-2025';

    console.log(`🎯 [GlobalWebSocketService] Using static clientId:`, staticClientId);

    return staticClientId;
  }

  /**
   * Get current WebSocket state
   */
  getState(): GlobalWebSocketState {
    return { ...this.state };
  }

  /**
   * Get current execution state from rolling buffer
   * Used by components to determine current execution status at any time
   */
  getExecutionStateBuffer(): BufferedEvent[] {
    return [...this.executionStateBuffer];
  }

  /**
   * Clear execution state buffer
   * Used when server is disconnected or rebooted to prevent stale execution state
   */
  clearExecutionStateBuffer(): void {
    this.executionStateBuffer = [];
    console.log(`🧹 [GlobalWebSocketService] Execution state buffer cleared`);
  }

  /**
   * Get current execution state info from buffer
   * Returns the most recent execution state information
   */
  getCurrentExecutionState(): {
    isExecuting: boolean;
    currentPromptId: string | null;
    executingNodeId: string | null;
    nodeExecutionProgress: { nodeId: string; progress: number } | null;
  } {
    // Analyze buffer to determine current state
    let isExecuting = false;
    let currentPromptId: string | null = null;
    let executingNodeId: string | null = null;
    let nodeExecutionProgress: { nodeId: string; progress: number } | null = null;

    // Process events in chronological order to get current state
    const sortedEvents = this.executionStateBuffer
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const event of sortedEvents) {
      switch (event.type) {
        case 'executing':
          if (event.data.node === null) {
            // Execution completed
            isExecuting = false;
            currentPromptId = null;
            executingNodeId = null;
            nodeExecutionProgress = null;
          } else if (event.data.node) {
            // Node execution started
            isExecuting = true;
            currentPromptId = event.data.prompt_id || currentPromptId;
            executingNodeId = event.data.node.toString();
            nodeExecutionProgress = null; // Reset progress when new node starts
          }
          break;

        case 'execution_started':
          isExecuting = true;
          currentPromptId = event.data.promptId || currentPromptId;
          break;

        case 'progress':
          if (event.data.node && event.data.value !== undefined && event.data.max !== undefined) {
            const percentage = Math.round((event.data.value / event.data.max) * 100);
            executingNodeId = event.data.node.toString();
            nodeExecutionProgress = {
              nodeId: event.data.node.toString(),
              progress: percentage
            };
            isExecuting = true; // Progress means something is executing
          }
          break;

        case 'progress_state':
          if (event.data.nodes) {
            const nodes = event.data.nodes;
            let hasRunningNodes = false;
            let currentRunningNodeId: string | null = null;
            let currentNodeProgress: { nodeId: string; progress: number } | null = null;

            // Find running nodes
            Object.keys(nodes).forEach(nodeId => {
              const nodeData = nodes[nodeId];
              if (nodeData.state === 'running') {
                hasRunningNodes = true;
                if (!currentRunningNodeId) {
                  currentRunningNodeId = nodeId;
                  const progress = nodeData.max > 0 ? Math.round((nodeData.value / nodeData.max) * 100) : 0;
                  currentNodeProgress = { nodeId, progress };
                }
              }
            });

            isExecuting = hasRunningNodes;
            currentPromptId = event.data.prompt_id || currentPromptId;
            executingNodeId = currentRunningNodeId;
            nodeExecutionProgress = currentNodeProgress;
          }
          break;

        case 'execution_success':
        case 'execution_error':
        case 'execution_interrupted':
          // Execution ended
          isExecuting = false;
          currentPromptId = null;
          executingNodeId = null;
          nodeExecutionProgress = null;
          break;
      }
    }

    return {
      isExecuting,
      currentPromptId,
      executingNodeId,
      nodeExecutionProgress
    };
  }

  /**
   * Add event to rolling buffer (persistent, not time-limited)
   */
  private addToExecutionStateBuffer(type: string, data: any): void {
    if (this.bufferEventTypes.has(type)) {
      const bufferedEvent: BufferedEvent = {
        type,
        data,
        timestamp: Date.now()
      };

      this.executionStateBuffer.push(bufferedEvent);

      // Keep only the most recent maxBufferSize events (rolling buffer)
      if (this.executionStateBuffer.length > this.maxBufferSize) {
        this.executionStateBuffer = this.executionStateBuffer.slice(-this.maxBufferSize);
      }

      console.log(`📋 [GlobalWebSocketService] Added to execution state buffer:`, {
        type,
        bufferSize: this.executionStateBuffer.length,
        timestamp: bufferedEvent.timestamp
      });
    }
  }

  /**
   * Set server URL and connect if different from current
   */
  setServerUrl(url: string): void {
    const cleanUrl = url.replace(/\/$/, ''); // Remove trailing slash

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

    console.log(`🔄 [GlobalWebSocketService] Attempting connection:`, {
      url: this.serverUrl,
      clientId: this.clientId,
      timestamp: new Date().toISOString(),
      attemptNumber: this.state.reconnectAttempts + 1,
      connectionState: 'connecting'
    });

    this.updateState({
      isConnecting: true,
      error: null
    });

    const wsUrl = this.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/comfymobile/ws?clientId=' + this.clientId;

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

      // 🎯 Rolling buffer is always active, no need to start/stop

      // No heartbeat needed - this is a broadcast-only socket

      // 🎯 Connection established logging
      console.log(`✅ [GlobalWebSocketService] Connected to WebSocket:`, {
        url: this.serverUrl,
        clientId: this.clientId,
        timestamp: new Date().toISOString(),
        connectionState: 'connected'
      });

      // Emit connection event
      this.emit('connected', { clientId: this.clientId });
    };

    this.webSocket.onmessage = (event) => {
      try {
        // Handle both text and binary messages (Python example pattern)
        if (typeof event.data === 'string') {
          // Text message - parse as JSON
          const message: WebSocketMessage = JSON.parse(event.data);

          // Update last message time for all messages to keep connection alive
          this.updateState({ lastMessageTime: Date.now() });

          // 🎯 WebSocket message reception logging
          if (message.type !== 'crystools.monitor') {
            console.log(`[GlobalWebSocketService] Message received:`, {
              type: message.type,
              timestamp: new Date().toISOString(),
              hasData: !!message.data,
              dataKeys: message.data ? Object.keys(message.data) : [],
              isConnected: this.state.isConnected
            });
          }

          // Emit the raw message for any components to handle
          this.emit('message', message);

          // Also emit specific message types for easier filtering
          this.emit(`message:${message.type}`, message.data);

          // 🎯 ComfyUI-specific event processing
          this.handleComfyUIMessage(message);

        } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          // 🖼️ Binary message (likely image data)
          const handleBinary = async (buffer: ArrayBuffer) => {
            if (buffer.byteLength < 4) return;

            const view = new DataView(buffer);
            const type = view.getUint32(0, false); // Big Endian Uint32

            this.updateState({ lastMessageTime: Date.now() });

            let imageData: ArrayBuffer;
            let metadata: any = null;
            let nodeId: string | null = 'unknown';

            // 🔍 Smart Detection Logic for different ComfyUI versions
            if (type === 1) {
              // Type 1 (Legacy): [Type 4B] + [ImageType 4B] + [Data]
              const imageType = view.getUint32(4, false); // 1: JPEG, 2: PNG
              const mimeType = imageType === 2 ? 'image/png' : 'image/jpeg';

              // Node ID is NOT in the packet for Type 1.
              // User requested to NOT show Node ID for Type 1 instead of guessing.
              nodeId = null;

              // Skip the first 8 bytes (Type + ImageType)
              imageData = buffer.slice(8);

              // Double check for JPEG magic bytes at offset 0 of imageData just in case
              const checkView = new DataView(imageData);
              const magic16 = checkView.getUint16(0, false);
              if (magic16 !== 0xFFD8 && magic16 !== 0x8950 && buffer.byteLength > 4) {
                // If not found at 8, maybe it starts at 4? (Some versions)
                const magic16_alt = view.getUint16(4, false);
                if (magic16_alt === 0xFFD8 || magic16_alt === 0x8950) {
                  imageData = buffer.slice(4);
                }
              }
            } else if (type === 4) {
              // Type 4: Modern Preview with metadata
              if (buffer.byteLength < 8) return;
              const jsonLen = view.getUint32(4, false);

              if (buffer.byteLength < 8 + jsonLen) return;
              const jsonBytes = new Uint8Array(buffer, 8, jsonLen);
              const jsonStr = new TextDecoder().decode(jsonBytes);
              try {
                metadata = JSON.parse(jsonStr);
                nodeId = (metadata.node_id || metadata.node || 'unknown').toString();
              } catch (e) {
                console.error('[GlobalWS] Failed to parse binary metadata:', e);
              }

              imageData = buffer.slice(8 + jsonLen);
            } else {
              // 🛑 Skip unknown or non-image binary types (e.g. Type 3: Progress Text)
              // This prevented broken image icons from appearing prematurely.
              return;
            }

            if (!imageData || imageData.byteLength === 0) return;

            const blob = new Blob([imageData], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);

            // Emit in ComfyApiClient format
            this.emit('binary_image_received', {
              type: 'binary_image',
              promptId: metadata?.prompt_id || 'unknown',
              size: imageData.byteLength,
              blob,
              nodeId,
              metadata,
              timestamp: Date.now()
            });

            /*
            console.log(`🖼️ [GlobalWebSocketService] Binary preview processed:`, {
              type,
              nodeId,
              size: imageData.byteLength,
              timestamp: new Date().toISOString()
            });
            */
          };

          if (event.data instanceof Blob) {
            event.data.arrayBuffer().then(handleBinary);
          } else {
            handleBinary(event.data);
          }
        }

      } catch (error) {
        console.error('Error parsing global WebSocket message:', error);
        this.emit('error', { type: 'parse_error', error });
      }
    };

    this.webSocket.onerror = (error) => {
      console.error('❌ [GlobalWebSocketService] WebSocket error:', {
        error: error,
        url: this.serverUrl,
        timestamp: new Date().toISOString(),
        connectionState: 'error',
        clientId: this.clientId
      });

      this.updateState({
        error: 'WebSocket connection error',
        isConnecting: false
      });

      this.emit('error', { type: 'connection_error', error });
      this.attemptReconnect();
    };

    this.webSocket.onclose = (event) => {
      console.warn(`🔌 [GlobalWebSocketService] WebSocket closed:`, {
        code: event.code,
        reason: event.reason || 'No reason provided',
        wasClean: event.wasClean,
        url: this.serverUrl,
        timestamp: new Date().toISOString(),
        connectionState: 'disconnected',
        clientId: this.clientId
      });

      this.updateState({
        isConnected: false,
        isConnecting: false
      });

      // No heartbeat to stop

      this.emit('disconnected', { code: event.code, reason: event.reason });

      // Attempt reconnection for unexpected disconnections
      // Even "clean" closes (1000) might be server timeouts that we want to recover from
      if (this.state.reconnectAttempts < this.state.maxReconnectAttempts) {
        console.log(`🔄 [GlobalWebSocketService] Connection closed (code: ${event.code}), attempting reconnect...`);
        this.attemptReconnect();
      }
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Keep rolling buffer on disconnect for navigation scenarios

    // No heartbeat to stop

    // Close connection
    if (this.webSocket) {
      this.webSocket.close(1000, 'Manual disconnect');
      this.webSocket = null;
    }

    this.updateState({
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      error: null
    });
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached for global WebSocket');
      this.updateState({
        error: `Max reconnection attempts (${this.state.maxReconnectAttempts}) exceeded`
      });
      return;
    }

    const attempt = this.state.reconnectAttempts + 1;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s

    console.log(`🔄 [GlobalWebSocketService] Scheduling reconnection:`, {
      attempt: attempt,
      maxAttempts: this.state.maxReconnectAttempts,
      delay: delay,
      delayMs: `${delay}ms`,
      timestamp: new Date().toISOString(),
      url: this.serverUrl
    });

    this.updateState({
      reconnectAttempts: attempt
    });

    this.reconnectTimer = setTimeout(() => {
      console.log(`🔄 [GlobalWebSocketService] Executing reconnection attempt ${attempt}`);
      this.connect();
    }, delay);
  }

  // Heartbeat methods removed - broadcast socket doesn't need monitoring

  /**
   * Update internal state and emit state change
   */
  private updateState(updates: Partial<GlobalWebSocketState>): void {
    this.state = { ...this.state, ...updates };
    this.emit('stateChange', this.state);
  }

  /**
   * Notify execution started (called by ComfyApiClient when workflow is submitted)
   */
  notifyExecutionStarted(promptId: string, workflowId?: string, workflowName?: string): void {
    console.log(`🎯 [GlobalWebSocketService] Execution started notification:`, {
      promptId: promptId.substring(0, 8) + '...',
      workflowId,
      workflowName
    });

    // Update processing state
    this.setProcessingState(true, promptId, workflowId, workflowName);

    const eventData = {
      type: 'execution_started',
      promptId,
      workflowId,
      workflowName,
      timestamp: Date.now()
    };

    // 🎯 Add to persistent execution state buffer
    this.addToExecutionStateBuffer('execution_started', eventData);

    this.emit('execution_started', eventData);
  }

  /**
   * Set processing state (compatible with original ComfyApiClient)
   */
  private setProcessingState(
    processing: boolean,
    promptId: string | null = null,
    workflowId: string | null = null,
    workflowName: string | null = null
  ): void {
    this.currentProcessingState.isProcessing = processing;
    this.currentProcessingState.currentPromptId = promptId;
    this.currentProcessingState.currentWorkflowId = workflowId;
    this.currentProcessingState.currentWorkflowName = workflowName;

    console.log('🎯 [GlobalWebSocketService] Processing state updated:', {
      isProcessing: processing,
      promptId: promptId?.substring(0, 8),
      workflowId,
      workflowName
    });
  }

  /**
   * Get current processing state (compatible with original ComfyApiClient)
   */
  getProcessingInfo(): {
    isProcessing: boolean;
    promptId: string | null;
    workflowId: string | null;
    workflowName: string | null;
  } {
    return {
      isProcessing: this.currentProcessingState.isProcessing,
      promptId: this.currentProcessingState.currentPromptId,
      workflowId: this.currentProcessingState.currentWorkflowId,
      workflowName: this.currentProcessingState.currentWorkflowName
    };
  }

  /**
   * Check if currently processing (compatible with original ComfyApiClient)
   */
  getIsProcessing(): boolean {
    return this.currentProcessingState.isProcessing;
  }

  /**
   * Get current prompt ID (compatible with original ComfyApiClient)
   */
  getCurrentPromptId(): string | null {
    return this.currentProcessingState.currentPromptId;
  }

  /**
   * Get current workflow ID (compatible with original ComfyApiClient)
   */
  getCurrentWorkflowId(): string | null {
    return this.currentProcessingState.currentWorkflowId;
  }

  /**
   * Get current workflow name (compatible with original ComfyApiClient)
   */
  getCurrentWorkflowName(): string | null {
    return this.currentProcessingState.currentWorkflowName;
  }

  /**
   * Send message through WebSocket if connected
   */
  send(message: any): boolean {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      try {
        this.webSocket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    }

    console.warn('Cannot send message: WebSocket not connected');
    return false;
  }

  /**
   * Handle ComfyUI-specific messages - pass raw messages unchanged
   */
  private handleComfyUIMessage(message: WebSocketMessage): void {
    const { type, data } = message;

    if (type !== 'crystools.monitor') {
      console.log(`📨 [GlobalWebSocketService] Emitting raw ComfyUI message:`, { type, data });
    }

    // 🎯 Add to persistent execution state buffer
    this.addToExecutionStateBuffer(type, data);

    // ✅ Emit raw ComfyUI message unchanged
    this.emit(type, {
      type: type,
      data: data,
      timestamp: Date.now()
    });

    // Keep minimal state tracking for compatibility only
    switch (type) {
      case 'executing':
        if (data.node === null) {
          // Execution completed - reset processing state
          this.setProcessingState(false);
          this.executionState.delete(data.prompt_id);
        } else if (data.node && data.prompt_id) {
          // Track basic execution state for getIsProcessing/getCurrentPromptId compatibility
          if (!this.executionState.has(data.prompt_id)) {
            this.executionState.set(data.prompt_id, {
              promptId: data.prompt_id,
              isRunning: true,
              hasEmittedRunning: false,
              startTime: Date.now()
            });
          }
        }
        break;

      case 'execution_error':
      case 'execution_interrupted':
      case 'execution_success':
        // Reset processing state on any completion/error
        this.setProcessingState(false);
        break;

      // No other transformations - just emit raw messages
    }
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy(): void {

    this.disconnect();
    this.removeAllListeners();

    // Reset state
    this.state = {
      isConnected: false,
      isConnecting: false,
      error: null,
      lastMessageTime: null,
      clientId: this.clientId,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5
    };
  }
}

// Create singleton instance
export const globalWebSocketService = new GlobalWebSocketService();

export default globalWebSocketService;