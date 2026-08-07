/**
 * ComfyUI Service Types
 * 
 * All types and interfaces for ComfyUI API integration service
 */

export interface IComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, any>;
}

export interface IComfyQueueResponse {
  queue_running: Array<any>;
  queue_pending: Array<any>;
}

export interface IComfyHistoryResponse {
  [promptId: string]: {
    prompt: any;
    outputs: Record<string, any>;
    status: {
      status_str: string;
      completed: boolean;
      messages: Array<[string, any]>;
    };
  };
}

export interface IComfyProgressResponse {
  node: number;
  prompt_id: string;
  max: number;
  value: number;
}

export interface IComfyExecutingResponse {
  prompt_id: string;
  node: string;
}

export interface IComfyErrorInfo {
  type: string;
  message: string;
  details: string;
  extra_info: {
    exception_type?: string;
    traceback?: string[];
  };
}

export interface IComfyOutputFile {
  filename: string;
  type: string;
  subfolder?: string;
}

export interface IComfyNodeOutput {
  images?: IComfyOutputFile[];
  videos?: IComfyOutputFile[];
  [key: string]: any;
}

// Service Event Types
export interface NodeExecutionStartEvent {
  type: 'node_execution_start';
  promptId: string;
  nodeId: string;
  timestamp: number;
}

export interface NodeExecutionProgressEvent {
  type: 'node_execution_progress';
  promptId: string;
  nodeId: string;
  progress: {
    value: number;
    max: number;
    percentage: number;
  };
  timestamp: number;
}

export interface NodeExecutionCompleteEvent {
  type: 'node_execution_complete';
  promptId: string;
  nodeId: string;
  outputs?: IComfyNodeOutput;
  timestamp: number;
}

export interface ExecutionCompleteEvent {
  type: 'execution_complete';
  promptId: string;
  success: boolean;
  completionReason?: 'executing_null' | 'interrupted' | 'success' | 'error';
  outputs?: Record<string, IComfyNodeOutput>;
  timestamp: number;
}

export interface BinaryImageEvent {
  type: 'binary_image';
  promptId?: string;
  imageUrl: string;
  size: number;
  blob: Blob;
  timestamp: number;
}

export interface ExecutionErrorEvent {
  type: 'execution_error';
  promptId: string;
  error: IComfyErrorInfo;
  timestamp: number;
}

export interface QueueStatusEvent {
  type: 'queue_status';
  promptId: string;
  position: number;
  total: number;
  timestamp: number;
}

export type ComfyUIServiceEvent = 
  | NodeExecutionStartEvent
  | NodeExecutionProgressEvent
  | NodeExecutionCompleteEvent
  | ExecutionCompleteEvent
  | ExecutionErrorEvent
  | QueueStatusEvent;

export interface ExecutionOptions {
  clearCache?: boolean;
  randomizeSeed?: boolean;
  useWebSocket?: boolean;
  timeoutMs?: number;
}

/**
 * The two representations ComfyUI needs for an editor-originated execution.
 * `prompt` is executed by the server, while `workflow` is embedded in output
 * metadata so the exact editor graph can be reopened later.
 */
export interface PreparedWorkflowExecution {
  prompt: Record<string, unknown>;
  workflow?: unknown;
}

export interface ExecutionStatus {
  promptId: string;
  isRunning: boolean;
  currentNode?: string;
  queuePosition?: number;
  progress?: IComfyProgressResponse;
  error?: IComfyErrorInfo;
}

export interface ServerInfo {
  url: string;
  connected: boolean;
  nodeCount?: number;
  version?: string;
}
