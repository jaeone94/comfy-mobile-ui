/**
 * Prompt WebSocket Service
 * 
 * Handles WebSocket communications for each prompt execution
 * - WebSocket connection after workflow submission
 * - Receive detailed messages for the specified prompt_id
 * - All execution stage messages: executing, executed, progress, execution_success
 * - Auto-close connection after completion
 */

import { withComfyAuth } from '@/infrastructure/auth/ComfyAuthService';

// Simple EventEmitter implementation for browser compatibility
class EventEmitter {
  private events: Record<string, Function[]> = {};

  on(event: string, listener: Function) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
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

  removeAllListeners() {
    this.events = {};
  }
}

export interface PromptWebSocketOptions {
  serverUrl: string;
  clientId: string;
  promptId: string;
  timeoutMs?: number;
  keepConnectionOpen?: boolean;
  additionalMonitoringTime?: number;
}

export interface PromptWebSocketMessage {
  type: string;
  data: any;
}

export interface ExecutionMonitorResult {
  success: boolean;
  completionReason?: 'executing_null' | 'queue_empty' | 'timeout' | 'error' | 'interrupted' | 'success';
  finalOutputs?: any;
  receivedMessages: PromptWebSocketMessage[];
  executionTime: number;
  error?: Error;
}

/**
 * Prompt execution-specific WebSocket service
 * Creates a new instance for each workflow execution
 */
export class PromptWebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: PromptWebSocketOptions;
  private startTime: number = 0;
  private receivedMessages: PromptWebSocketMessage[] = [];
  private isCompleted: boolean = false;
  private completionTimer: NodeJS.Timeout | null = null;
  private completionReason: ExecutionMonitorResult['completionReason'] = undefined;

  constructor(options: PromptWebSocketOptions) {
    super();
    this.options = {
      timeoutMs: 0, // No timeout by default - let long workflows run indefinitely
      ...options
    };
  }

  /**
   * WebSocket connection and execution monitoring start
   */
  async startMonitoring(): Promise<ExecutionMonitorResult> {
    return new Promise((resolve) => {
      this.startTime = Date.now();

      
      // If WebSocket is not connected yet, connect it
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        const wsUrl = withComfyAuth(this.options.serverUrl
          .replace('http://', 'ws://')
          .replace('https://', 'wss://') + 
          `/ws?clientId=${this.options.clientId}`);

        this.ws = new WebSocket(wsUrl);
      } else {
      }

      // timeout setting (0 for no timeout)
      let timeout: NodeJS.Timeout | null = null;
      if (this.options.timeoutMs && this.options.timeoutMs > 0) {
        timeout = setTimeout(() => {
          if (!this.isCompleted) {
            this.cleanup();
            resolve(this.createResult(false, 'timeout'));
          }
        }, this.options.timeoutMs);
      }

      this.ws.onopen = () => {
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const message: PromptWebSocketMessage = JSON.parse(event.data);
            this.receivedMessages.push(message);
            
            // crystools.monitor messages are excluded from logs
            if (message.type !== 'crystools.monitor') {
              // 🔴 DEBUG: Highlight interrupt-related messages
              if (message.type.includes('interrupt') || message.type.includes('execution') || 
                  (message.type === 'executing' && message.data?.node === null)) {
              } else {
                // Raw JSON message output (without parsing)
              }
              
              // Message type and basic data logging
              if (message.data?.prompt_id) {
              } else if (message.data?.node) {
              } else {
              }
            }
            
            // Emit all messages for external listeners (used in additional monitoring)
            this.emit('message', message);
            
            // process only relevant messages for the current prompt_id
            if (this.isMessageRelevant(message)) {
              this.handleRelevantMessage(message);
            }

            // check completion condition
            if (this.checkCompletion(message)) {
              if (timeout) clearTimeout(timeout);
              // mark completion processing start to prevent duplicates
              this.isCompleted = true;
              this.scheduleCompletion(resolve);
              return;
            }

          } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            // binary data processing
            this.handleBinaryData(event.data);
          }

        } catch (error) {
          console.error('❌ Prompt: Error parsing message:', error);
          this.emit('error', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Prompt: WebSocket error:', error);
        if (timeout) clearTimeout(timeout);
        this.cleanup();
        resolve(this.createResult(false, 'error', new Error('WebSocket error')));
      };

      this.ws.onclose = (event) => {
        if (timeout) clearTimeout(timeout);
        
        if (!this.isCompleted) {
          // early termination
          resolve(this.createResult(false, 'error', new Error('WebSocket closed prematurely')));
        }
      };
    });
  }

  /**
   * Check if message is relevant to the current prompt_id
   */
  private isMessageRelevant(message: PromptWebSocketMessage): boolean {
    // when prompt_id is directly included
    if (message.data?.prompt_id === this.options.promptId) {
      return true;
    }

    // executing messages may not have prompt_id (general execution state)
    if (message.type === 'executing') {
      return true;
    }

    // status messages are always relevant as they represent the entire queue state
    if (message.type === 'status') {
      return true;
    }

    return false;
  }

  /**
   * Handle relevant messages and emit events
   */
  private handleRelevantMessage(message: PromptWebSocketMessage): void {
    switch (message.type) {
      case 'executing':
        if (message.data.node === null && message.data.prompt_id === this.options.promptId) {
          // completion processing is handled in checkCompletion to prevent duplicates
        } else if (message.data.node) {
          this.emit('node_executing', message.data);
        }
        break;

      case 'executed':
        this.emit('node_executed', message.data);
        break;

      case 'progress':
        this.emit('node_progress', message.data);
        break;

      case 'execution_success':
        this.emit('execution_success', message.data);
        break;

      case 'execution_error':
        console.error('❌ Execution error details:', JSON.stringify(message.data, null, 2));
        this.emit('execution_error', message.data);
        break;

      case 'progress_state':
        // update the entire workflow state
        this.emit('progress_state', message.data);
        break;

      case 'status':
        // update the queue state
        this.emit('status', message.data);
        break;

      default:
        // emit other message types unchanged
        this.emit('message', message);
        break;
    }
  }

  /**
   * Handle binary data (images, etc.)
   */
  private handleBinaryData(data: ArrayBuffer | Blob): void {
    if (data instanceof ArrayBuffer) {
      // Python example skips first 8 bytes
      const imageData = data.slice(8);
      const blob = new Blob([imageData], { type: 'image/png' });
      const imageUrl = URL.createObjectURL(blob);
      
      this.emit('binary_image', {
        promptId: this.options.promptId,
        imageUrl,
        blob,
        size: imageData.byteLength
      });
    } else if (data instanceof Blob) {
      data.arrayBuffer().then(buffer => {
        this.handleBinaryData(buffer);
      });
    }
  }

  /**
   * Check completion condition - only the first completion signal is processed (to prevent duplicates)
   */
  private checkCompletion(message: PromptWebSocketMessage): boolean {
    // if completion processing has already started, ignore additional completion signals
    if (this.isCompleted) {
      return false;
    }

    // 1. Interrupt message (first signal)
    if (message.type === 'execution_interrupted' && 
        message.data.prompt_id === this.options.promptId) {
      this.completionReason = 'interrupted';
      return true;
    }

    // 2. Explicit success message
    if (message.type === 'execution_success' && 
        message.data.prompt_id === this.options.promptId) {
      this.completionReason = 'success';
      return true;
    }

    // 3. Explicit error message
    if (message.type === 'execution_error' && 
        message.data.prompt_id === this.options.promptId) {
      console.error('🔍 Error details for completion:', JSON.stringify(message.data, null, 2));
      this.completionReason = 'error';
      (this as any).error = {
        message: message.data.exception_message || 'Execution error',
        details: message.data
      };
      return true;
    }

    // 4. ComfyUI standard completion signal: executing with node=null
    // This could be either normal completion OR interrupt completion
    if (message.type === 'executing' && 
        message.data.node === null && 
        message.data.prompt_id === this.options.promptId) {
      
      // DEBUG: Since ComfyUI doesn't send explicit interrupt messages,
      // executing with node=null after interrupt is the completion signal
      
      // We can't tell if this is interrupt or normal completion from the message alone
      // So we'll use 'executing_null' and let the UI handle it appropriately
      this.completionReason = 'executing_null';
      return true;
    }

    return false;
  }

  /**
   * Check if prompt has fully terminated (for additional monitoring)
   */
  checkPromptTermination(message: PromptWebSocketMessage): boolean {
    // Check for prompt removal from queue status
    if (message.type === 'status' && message.data?.exec_info) {
      const queueRemaining = message.data.exec_info.queue_remaining;
      
      // If queue is empty, prompt has fully terminated
      if (queueRemaining === 0) {
        return true;
      }
    }

    // Also check for explicit completion messages that indicate full termination
    if (message.type === 'execution_interrupted' && 
        message.data.prompt_id === this.options.promptId) {
      return true;
    }

    if (message.type === 'execution_error' && 
        message.data.prompt_id === this.options.promptId) {
      return true;
    }

    return false;
  }

  /**
   * Completion processing scheduling (with a small delay to wait for additional messages)
   */
  private scheduleCompletion(resolve: (result: ExecutionMonitorResult) => void): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }

    // 100ms delay to wait for additional messages
    this.completionTimer = setTimeout(() => {
      this.cleanup();
      resolve(this.createResult(true, this.completionReason));
    }, 100);
  }

  /**
   * Create result object
   */
  private createResult(
    success: boolean, 
    reason?: ExecutionMonitorResult['completionReason'],
    error?: Error
  ): ExecutionMonitorResult {
    const executionTime = Date.now() - this.startTime;
    
    // Find final output
    const executedMessages = this.receivedMessages.filter(
      m => m.type === 'executed' && m.data.prompt_id === this.options.promptId
    );
    
    const finalOutputs = executedMessages.length > 0 
      ? executedMessages[executedMessages.length - 1].data.output 
      : undefined;

    return {
      success,
      completionReason: reason,
      finalOutputs,
      receivedMessages: [...this.receivedMessages],
      executionTime,
      error
    };
  }

  /**
   * Resource cleanup
   */
  private cleanup(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    // Only close if not configured to keep open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (!this.options.keepConnectionOpen) {
        this.ws.close(1000, 'Monitoring completed');
        this.ws = null;
      } else {
      }
    }
    
    if (!this.options.keepConnectionOpen) {
      this.removeAllListeners();
    }
  }

  /**
   * Manual close method for external use
   */
  close(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Manual close');
    }
    
    this.ws = null;
    this.removeAllListeners();
  }

  /**
   * Pre-connect WebSocket for early error detection
   */
  async preConnect(): Promise<void> {
    const wsUrl = withComfyAuth(
      `${this.options.serverUrl.startsWith('https://') ? 'wss' : 'ws'}://${this.options.serverUrl.replace(/^https?:\/\//, '')}/ws?clientId=${this.options.clientId}`
    );
    
    this.ws = new WebSocket(wsUrl);
    
    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        reject(new Error('WebSocket pre-connection timeout'));
      }, 5000);

      this.ws!.onopen = () => {
        clearTimeout(connectTimeout);
        resolve();
      };

      this.ws!.onerror = (error) => {
        console.error('❌ Prompt: WebSocket pre-connection error:', error);
        clearTimeout(connectTimeout);
        reject(error);
      };
    });
  }

  /**
   * Update prompt ID after prompt submission
   */
  updatePromptId(newPromptId: string): void {
    this.options.promptId = newPromptId;
  }

  /**
   * Manual disconnect
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * Get current status
   */
  getStatus(): {
    isConnected: boolean;
    isCompleted: boolean;
    messageCount: number;
    executionTime: number;
  } {
    return {
      isConnected: this.ws?.readyState === WebSocket.OPEN,
      isCompleted: this.isCompleted,
      messageCount: this.receivedMessages.length,
      executionTime: Date.now() - this.startTime
    };
  }
}

export default PromptWebSocketService;
