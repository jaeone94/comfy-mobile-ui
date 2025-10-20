import axios from 'axios';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { globalWebSocketService } from '../websocket/GlobalWebSocketService';
import { PromptTracker } from '@/utils/promptTracker';
import type {
  IComfyPromptResponse,
  ExecutionOptions,
  ServerInfo,
} from '@/shared/types/comfy/IComfyAPI';
import type {
  LogsRawResponse,
  LogSubscribeRequest
} from '@/core/domain';

export interface CustomNodePackInfo {
  id: string;
  author?: string;
  title?: string;
  description?: string;
  repository?: string;
  channel?: string;
  ['update-state']?: boolean | string;
  install_type?: string;
  files?: string[];
  version?: string;
  active_version?: string;
  cnr_latest?: string;
  mode?: string;
  state?: string;
  [key: string]: unknown;
}

export interface CustomNodeListResponse {
  channel?: string;
  node_packs: Record<string, CustomNodePackInfo>;
  [key: string]: unknown;
}

export type CustomNodeMappingsResponse = Record<string, [string[], Record<string, unknown>]>;

/**
 * ComfyUI API Client - Pure HTTP API Service
 * 
 * Handles only HTTP REST API communications with ComfyUI server.
 * Real-time WebSocket events are managed by GlobalWebSocketService.
 * 
 * Core responsibilities:
 * - Workflow execution via /prompt endpoint
 * - Queue management via /queue endpoint
 * - History retrieval via /history endpoint
 * - Server info and cache management
 * - Model management APIs
 */

// Service state - HTTP API only
let serverUrl: string;
let connectionStoreUnsubscribe: (() => void) | null = null;

// Initialize service state
let isInitialized = false;
const initializeService = () => {
  if (isInitialized) {
    return;
  }
  
  // Initialize with current URL from ConnectionStore
  const currentUrl = useConnectionStore.getState().url;
  serverUrl = currentUrl ? currentUrl.replace(/\/$/, '') : 'http://localhost:8188';
  isInitialized = true;
  
  // Subscribe to ConnectionStore changes
  subscribeToConnectionStore();
};

/**
 * Generate unique prompt ID
 */
const generatePromptId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Subscribe to ConnectionStore changes to automatically update serverUrl
 */
const subscribeToConnectionStore = (): void => {
  if (connectionStoreUnsubscribe) {
    connectionStoreUnsubscribe();
  }

  connectionStoreUnsubscribe = useConnectionStore.subscribe(
    (state) => updateServerUrl(state.url || 'http://localhost:8188')
  );
};

const updateServerUrl = (newUrl: string): void => {
  const oldUrl = serverUrl;
  serverUrl = newUrl.replace(/\/$/, ''); // Remove trailing slash
  console.log(`[ComfyApiClient] Server URL updated: ${oldUrl} ??${serverUrl}`);
};

/**
 * Test server connection and get server info
 */
const getServerInfo = async (): Promise<ServerInfo> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/object_info`, { timeout: 5000 });
    return {
      url: serverUrl,
      connected: true,
      nodeCount: Object.keys(response.data).length
    };
  } catch (error) {
    return {
      url: serverUrl,
      connected: false
    };
  }
};

/**
 * Clear server cache
 */
const clearCache = async (): Promise<boolean> => {
  initializeService();
  try {
    await axios.post(`${serverUrl}/free`, { unload_models: false, free_memory: true }, { timeout: 10000 });
    return true;
  } catch (error) {
    console.error(`Failed to clear cache:`, error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};

/**
 * Clear VRAM
 */
const clearVRAM = async (): Promise<boolean> => {
  initializeService();
  try {
    await axios.post(`${serverUrl}/free`, { 
      unload_models: true,  // Unload models from VRAM
      free_memory: true     // Free up caches and temporary data
    }, { timeout: 10000 });
    return true;
  } catch (error) {
    console.error('Failed to clear VRAM:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};

/**
 * Execute workflow via HTTP API only
 * WebSocket events are handled by GlobalWebSocketService
 */

/**
 * Fetch installed custom-node packages from ComfyUI Manager
 */
const getInstalledCustomNodePackages = async (): Promise<Record<string, {
  ver: string;
  cnr_id: string | null;
  aux_id: string | null;
  enabled: boolean;
}>> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/api/customnode/installed`, { timeout: 10000 });
    return response.data ?? {};
  } catch (error) {
    console.error('Failed to retrieve installed custom nodes:', error instanceof Error ? error.message : error);
    throw error;
  }
};

const getCustomNodeList = async (options: { mode?: string; skipUpdate?: boolean } = {}): Promise<CustomNodeListResponse> => {
  initializeService();
  const { mode = 'cache', skipUpdate = true } = options;

  try {
    const response = await axios.get(`${serverUrl}/api/customnode/getlist`, {
      params: {
        ...(mode ? { mode } : {}),
        ...(skipUpdate !== undefined ? { skip_update: skipUpdate } : {}),
      },
      timeout: 15000,
    });
    const data = response.data ?? {};
    return {
      channel: data.channel,
      node_packs: data.node_packs ?? {},
      ...data,
    };
  } catch (error) {
    console.warn('Failed to fetch custom node list:', error instanceof Error ? error.message : error);
    return { channel: undefined, node_packs: {} };
  }
};

const getManagerNodeMappings = async (options: { mode?: string } = {}): Promise<CustomNodeMappingsResponse> => {
  initializeService();
  const { mode = 'cache' } = options;

  try {
    const response = await axios.get(`${serverUrl}/api/customnode/getmappings`, {
      params: {
        ...(mode ? { mode } : {}),
      },
      timeout: 15000,
    });
    return (response.data ?? {}) as CustomNodeMappingsResponse;
  } catch (error) {
    console.warn('Failed to fetch custom node mappings:', error instanceof Error ? error.message : error);
    return {} as CustomNodeMappingsResponse;
  }
};

/**
 * Start the ComfyUI Manager installation queue
 */
const startManagerQueue = async (): Promise<boolean> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/manager/queue/start`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    return response.status === 200 || response.status === 201;
  } catch (error) {
    console.error('Failed to start manager queue:', error instanceof Error ? error.message : error);
    return false;
  }
};

/**
 * Queue a package installation/update request via ComfyUI Manager
 */
const queuePackageInstall = async (payload: {
  id: string;
  selected_version: string;
  version?: string;
  repository?: string;
  channel?: string;
  mode?: string;
  skip_post_install?: boolean;
  pip?: string[];
}): Promise<boolean> => {
  initializeService();
  try {
    const body = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
    );
    await axios.post(`${serverUrl}/comfymobile/api/manager/queue/install`, body, { timeout: 15000 });
    return true;
  } catch (error) {
    console.error('Failed to queue package install:', error instanceof Error ? error.message : error);
    return false;
  }
};
const executeWorkflow = async (
  apiWorkflow: any, 
  options: ExecutionOptions & { workflowId?: string; workflowName?: string } = {}
): Promise<string> => {
  const {
    clearCache: shouldClearCache = false,
    workflowId,
    workflowName
  } = options;

  // Clear cache if requested
  if (shouldClearCache) {
    await clearCache();
  }

  console.log('[ComfyApiClient] Executing workflow via HTTP API:', {
    nodeCount: Object.keys(apiWorkflow).length,
    workflowId,
    workflowName
  });

  // Generate unique prompt ID and submit to server
  const promptId = generatePromptId();
  const serverPromptId = await submitPrompt(apiWorkflow, promptId, workflowId, workflowName);

  console.log('[ComfyApiClient] Workflow submitted successfully:', {
    promptId: serverPromptId.substring(0, 8) + '...',
    workflowId,
    workflowName
  });

  return serverPromptId;
};

/**
 * Submit prompt to ComfyUI server via HTTP
 */
const submitPrompt = async (
  apiWorkflow: any, 
  promptId: string, 
  workflowId?: string, 
  workflowName?: string
): Promise<string> => {
  try {
    const payload = {
      prompt: apiWorkflow,
      client_id: globalWebSocketService.getState().clientId, // Use GlobalWebSocketService's clientId
      prompt_id: promptId
    };

    const response = await axios.post<IComfyPromptResponse>(
      `${serverUrl}/prompt`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data.node_errors && Object.keys(response.data.node_errors).length > 0) {
      throw new Error(`Node errors: ${JSON.stringify(response.data.node_errors)}`);
    }

    // Get server-returned prompt_id and track it
    const serverPromptId = response.data.prompt_id;
    
    if (serverPromptId && workflowId) {
      console.log('[ComfyApiClient] Adding prompt to tracking system');
      PromptTracker.addRunningPrompt(serverPromptId, workflowId, workflowName || undefined);
    }
    
    // Notify GlobalWebSocketService that execution started
    globalWebSocketService.notifyExecutionStarted(serverPromptId, workflowId, workflowName);

    return serverPromptId;

  } catch (error) {
    console.error(`Failed to submit prompt ${promptId.substring(0, 8)}:`, error);
    
    // For API response errors, emit execution_error event with raw response
    if (axios.isAxiosError(error) && error.response) {
      const rawServerResponse = error.response.data;
      
      console.log('API Response Error - Emitting execution_error with raw response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: rawServerResponse
      });
      
      // Create error object with raw server response (NO PARSING)
      const apiErrorObject = {
        type: 'API Response Error',
        message: `Server returned ${error.response.status}: ${error.response.statusText}`,
        details: `Raw server response:\n${JSON.stringify(rawServerResponse, null, 2)}`,
        extra_info: {
          httpStatus: error.response.status,
          httpStatusText: error.response.statusText,
          rawServerResponse: rawServerResponse,
          noParsingApplied: true
        }
      };

      // Emit execution_error event so ErrorViewer displays it
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: apiErrorObject,
        timestamp: Date.now()
      });
    } else if (error && typeof error === 'object' && 'request' in error) {
      // Network error (no response from server)
      const networkErrorObject = {
        type: 'Network Error',
        message: 'No response from server - check if ComfyUI is running',
        details: `Network request failed\nURL: ${serverUrl}/prompt`,
        extra_info: {
          networkError: true,
          serverUrl: serverUrl
        }
      };
      
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: networkErrorObject,
        timestamp: Date.now()
      });
    } else {
      // Generic error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during prompt submission';
      const genericErrorObject = {
        type: 'Prompt Submission Error',
        message: errorMessage,
        details: `Error details:\n${JSON.stringify(error, null, 2)}`,
        extra_info: {
          originalError: error
        }
      };
      
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: genericErrorObject,
        timestamp: Date.now()
      });
    }
    
    // Still throw the error for any calling code that might need to handle it
    throw error;
  }
};

/**
 * Submit prompt with specific prompt ID (legacy compatibility)
 * This is the original submitPromptWithId function from ComfyApiClient_Old.ts
 */
const submitPromptWithId = async (apiWorkflow: any, promptId: string): Promise<void> => {
  try {
    const payload = {
      prompt: apiWorkflow,
      client_id: globalWebSocketService.getState().clientId,
      prompt_id: promptId
    };  

    const response = await axios.post<IComfyPromptResponse>(
      `${serverUrl}/prompt`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data.node_errors && Object.keys(response.data.node_errors).length > 0) {
      throw new Error(`Node errors: ${JSON.stringify(response.data.node_errors)}`);
    }

    // Track this prompt in localStorage for reconnection after browser restart
    const serverPromptId = response.data.prompt_id;
    console.log(`[ComfyApiClient] Server returned prompt_id:`, serverPromptId);
    
    // Use current processing state from GlobalWebSocketService for tracking
    const processingInfo = globalWebSocketService.getProcessingInfo();
    const currentWorkflowId = processingInfo.workflowId;
    const currentWorkflowName = processingInfo.workflowName;
    
    if (serverPromptId && currentWorkflowId) {
      console.log(`[ComfyApiClient] Adding prompt to tracking system`);
      try {
        PromptTracker.addRunningPrompt(serverPromptId, currentWorkflowId, currentWorkflowName || undefined);
      } catch (error) {
        console.error(`[ComfyApiClient] Failed to add to tracking system:`, error);
      }
    }
    
  } catch (error) {
    console.error(`Failed to submit prompt ${promptId.substring(0, 8)}:`, error);
    
    // For API response errors, emit execution_error event with raw response
    if (axios.isAxiosError(error) && error.response) {
      const rawServerResponse = error.response.data;
      
      console.log('API Response Error - Emitting execution_error with raw response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: rawServerResponse
      });
      
      // Create error object with raw server response (NO PARSING)
      const apiErrorObject = {
        type: 'API Response Error',
        message: `Server returned ${error.response.status}: ${error.response.statusText}`,
        details: `Raw server response:\n${JSON.stringify(rawServerResponse, null, 2)}`,
        extra_info: {
          httpStatus: error.response.status,
          httpStatusText: error.response.statusText,
          rawServerResponse: rawServerResponse,
          noParsingApplied: true
        }
      };

      // Emit execution_error event so ErrorViewer displays it
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: apiErrorObject,
        timestamp: Date.now()
      });
    } else if (error && typeof error === 'object' && 'request' in error) {
      // Network error (no response from server)
      const networkErrorObject = {
        type: 'Network Error',
        message: 'No response from server - check if ComfyUI is running',
        details: `Network request failed\nURL: ${serverUrl}/prompt`,
        extra_info: {
          networkError: true,
          serverUrl: serverUrl
        }
      };
      
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: networkErrorObject,
        timestamp: Date.now()
      });
    } else {
      // Generic error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during prompt submission';
      const genericErrorObject = {
        type: 'Prompt Submission Error',
        message: errorMessage,
        details: `Error details:\n${JSON.stringify(error, null, 2)}`,
        extra_info: {
          originalError: error
        }
      };
      
      globalWebSocketService.emit('execution_error', {
        type: 'execution_error',
        promptId,
        error: genericErrorObject,
        timestamp: Date.now()
      });
    }
    
    // Still throw the error for any calling code that might need to handle it
    throw error;
  }
};

/**
 * Get all execution history
 */
const getAllHistory = async (maxItems?: number): Promise<Record<string, any>> => {
  initializeService();
  try {
    const params = new URLSearchParams();
    if (maxItems) {
      params.append('max_items', maxItems.toString());
    }
    
    const url = `${serverUrl}/history${params.toString() ? '?' + params.toString() : ''}`;
    const response = await axios.get<Record<string, any>>(url, {
      timeout: 15000
    });
    
    return response.data || {};
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return {};
  }
};

/**
 * Get specific prompt history
 */
const getPromptHistory = async (promptId: string): Promise<any | null> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/history/${promptId}`, {
      timeout: 15000
    });
    return response.data?.[promptId] || null;
  } catch (error) {
    console.error(`Failed to fetch history for prompt ${promptId}:`, error);
    return null;
  }
};

/**
 * Get queue status
 */
const getQueueStatus = async (): Promise<{ 
  running: number; 
  pending: number; 
  queue_running: any[]; 
  queue_pending: any[] 
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/queue`);
    return {
      running: response.data?.exec_info?.queue_running || 0,
      pending: response.data?.exec_info?.queue_remaining || 0,
      queue_running: response.data?.queue_running || [],
      queue_pending: response.data?.queue_pending || []
    };
  } catch (error) {
    console.error('Failed to fetch queue status:', error);
    return { running: 0, pending: 0, queue_running: [], queue_pending: [] };
  }
};

/**
 * Interrupt current execution
 */
const interruptExecution = async (): Promise<boolean> => {
  initializeService();
  try {
    await axios.post(`${serverUrl}/interrupt`);
    return true;
  } catch (error) {
    console.error('Failed to interrupt execution:', error);
    return false;
  }
};

/**
 * Get list of available models
 */
const getAvailableModels = async (): Promise<Record<string, string[]>> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/object_info`);
    
    // Extract model lists from node definitions
    const modelLists: Record<string, string[]> = {};
    const nodeInfo = response.data;
    
    for (const [nodeType, nodeData] of Object.entries(nodeInfo as Record<string, any>)) {
      if (nodeData.input && nodeData.input.required) {
        for (const [inputName, inputData] of Object.entries(nodeData.input.required)) {
          if (Array.isArray(inputData) && Array.isArray(inputData[0])) {
            const modelType = `${nodeType}_${inputName}`;
            modelLists[modelType] = inputData[0];
          }
        }
      }
    }
    
    return modelLists;
  } catch (error) {
    console.error('Failed to fetch available models:', error);
    return {};
  }
};

/**
 * Upload image to ComfyUI
 */
const uploadImage = async (file: File, subfolder?: string, type?: string): Promise<{ name: string; subfolder: string }> => {
  initializeService();
  try {
    const formData = new FormData();
    formData.append('image', file);
    if (subfolder) formData.append('subfolder', subfolder);
    if (type) formData.append('type', type);

    const response = await axios.post(`${serverUrl}/upload/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000
    });

    return {
      name: response.data.name,
      subfolder: response.data.subfolder || ''
    };
  } catch (error) {
    console.error('Failed to upload image:', error);
    throw error;
  }
};

/**
 * Fetch model folders from the ComfyUI models directory
 */
const fetchModelFolders = async (): Promise<{
  success: boolean;
  folders: Array<{
    name: string;
    path: string;
    full_path: string;
    file_count: number;
  }>;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/folders`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching model folders:', error);
    return {
      success: false,
      folders: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Start downloading a model file
 */
const startModelDownload = async (params: {
  url: string;
  target_folder: string;
  filename?: string;
  overwrite?: boolean;
}): Promise<{
  success: boolean;
  task_id?: string;
  download_info?: any;
  message?: string;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/download`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error starting model download:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Cancel a download task
 */
const cancelDownload = async (taskId: string): Promise<{
  success: boolean;
  message?: string;
  task_info?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/models/downloads/${taskId}`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error canceling download:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Clear all download history
 */
const clearDownloadHistory = async (): Promise<{
  success: boolean;
  message?: string;
  cleared_count?: number;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/models/downloads`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error clearing download history:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Resume a failed or cancelled download
 */
const resumeDownload = async (taskId: string): Promise<{
  success: boolean;
  task_id?: string;
  resume_info?: {
    filename: string;
    target_folder: string;
    partial_size: number;
    partial_size_mb: number;
  };
  message?: string;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/downloads/${taskId}/resume`, {}, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error resuming download:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Retry all failed downloads
 */
const retryAllFailedDownloads = async (): Promise<{
  success: boolean;
  message?: string;
  retried_count?: number;
  total_failed?: number;
  results?: Array<{
    task_id: string;
    filename: string;
    status: string;
    partial_size?: number;
    error?: string;
  }>;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/downloads/retry-all`, {}, {
      timeout: 15000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error retrying failed downloads:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Fetch all download tasks
 */
const fetchDownloads = async (options?: {
  status?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  downloads: Array<{
    id: string;
    filename: string;
    target_folder: string;
    status: string;
    progress: number;
    total_size: number;
    downloaded_size: number;
    speed: number;
    eta: number;
    created_at: number;
    started_at?: number;
    completed_at?: number;
    error?: string;
  }>;
  summary?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    
    const url = `${serverUrl}/comfymobile/api/models/downloads${params.toString() ? '?' + params.toString() : ''}`;
    const response = await axios.get(url, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching downloads:', error);
    return {
      success: false,
      downloads: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Get all custom node mappings
 */
const getCustomNodeMappings = async (): Promise<any[]> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/custom/node-mappings`, {
      timeout: 10000
    });
    
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to get custom node mappings:', error);
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      // Endpoint doesn't exist yet, return empty array
      return [];
    }
    throw error;
  }
};

/**
 * Save custom node mapping
 */
const saveCustomNodeMapping = async (mappingData: {
  nodeType: string;
  inputMappings: Record<string, string>;
  customFields: Array<{
    fieldName: string;
    fieldType: string;
    defaultValue: any;
    assignedWidgetType?: string;
  }>;
  createdAt: string;
}): Promise<any> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/custom/node-mappings`, mappingData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Failed to save custom node mapping:', error);
    throw error;
  }
};

/**
 * Delete a custom node mapping
 */
const deleteCustomNodeMapping = async (nodeType: string, scope?: {
  type: 'global' | 'workflow' | 'specific';
  workflowId?: string;
  workflowName?: string;
  nodeId?: string;
}): Promise<void> => {
  initializeService();
  try {
    if (scope) {
      // Use POST request with scope data for precise deletion
      const response = await axios.post(`${serverUrl}/comfymobile/api/custom/node-mappings/delete`, {
        nodeType,
        scope
      }, {
        timeout: 10000
      });
    } else {
      // Fallback to DELETE request for backward compatibility (deletes all scopes)
      const response = await axios.delete(`${serverUrl}/comfymobile/api/custom/node-mappings/${encodeURIComponent(nodeType)}`, {
        timeout: 10000
      });
    }
    
    // No need to return anything for successful delete
  } catch (error) {
    console.error(`Failed to delete custom node mapping ${nodeType}:`, error);
    throw error;
  }
};

/**
 * Get all custom widget types
 */
const getAllCustomWidgetTypes = async (): Promise<any[]> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/custom/widgets`, {
      timeout: 10000
    });
    
    const data = response.data;
    console.log('CLIENT DEBUG: Received custom widget types from server:', data.widgetTypes);
    return data.widgetTypes || [];
  } catch (error) {
    console.error('Failed to get custom widget types:', error);
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      // Endpoint doesn't exist yet, return empty array
      return [];
    }
    throw error;
  }
};

/**
 * Get a specific custom widget type by ID
 */
const getCustomWidgetType = async (typeId: string): Promise<any | null> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/custom/widgets/${encodeURIComponent(typeId)}`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    console.error(`Failed to get custom widget type ${typeId}:`, error);
    throw error;
  }
};

/**
 * Create a new custom widget type
 */
const createCustomWidgetType = async (customWidgetType: any): Promise<any> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/custom/widgets`, customWidgetType, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Failed to create custom widget type:', error);
    throw error;
  }
};

/**
 * Update an existing custom widget type
 */
const updateCustomWidgetType = async (typeId: string, customWidgetType: any): Promise<any> => {
  initializeService();
  try {
    const response = await axios.put(`${serverUrl}/comfymobile/api/custom/widgets/${encodeURIComponent(typeId)}`, customWidgetType, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Failed to update custom widget type ${typeId}:`, error);
    throw error;
  }
};

/**
 * Delete a custom widget type
 */
const deleteCustomWidgetType = async (typeId: string): Promise<void> => {
  initializeService();
  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/custom/widgets/${encodeURIComponent(typeId)}`, {
      timeout: 10000
    });
    
    // No need to return anything for successful delete
  } catch (error) {
    console.error(`Failed to delete custom widget type ${typeId}:`, error);
    throw error;
  }
};

/**
 * Move a model file between folders
 */
const moveModelFile = async (params: {
  filename: string;
  source_folder: string;
  target_folder: string;
  overwrite?: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  file_info?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/move`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error moving model file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Get list of available LoRA models
 */
const getLoraList = async (): Promise<{
  success: boolean;
  loras?: Array<{
    name: string;
    path: string;
    size: number;
    size_mb: number;
    subfolder?: string;
  }>;
  models?: Array<{
    name: string;
    path: string;
    size: number;
    size_mb: number;
    subfolder?: string;
  }>;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/loras`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching LoRA list:', error);
    return {
      success: false,
      loras: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Clear execution queue
 */
const clearQueue = async (): Promise<boolean> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/queue`, {
      clear: true
    });
    return response.status === 200;
  } catch (error) {
    console.error('Failed to clear queue:', error);
    return false;
  }
};

/**
 * Get all models from all folders
 */
const getAllModels = async (): Promise<{
  success: boolean;
  models: ModelFile[];
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/all`, {
      timeout: 15000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching all models:', error);
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Get models from specific folder
 */
const getModelsFromFolder = async (folderName: string): Promise<{
  success: boolean;
  models: ModelFile[];
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/${encodeURIComponent(folderName)}`, {
      timeout: 15000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching models from folder ${folderName}:`, error);
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Search models with query and optional folder filter
 */
const searchModels = async (query: string, folderType?: string): Promise<{
  success: boolean;
  results: ModelFile[];
  total_found: number;
  limited: boolean;
  error?: string;
}> => {
  initializeService();
  try {
    const params = new URLSearchParams({ q: query });
    if (folderType && folderType !== 'all') {
      params.append('folder_type', folderType);
    }
    
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/search?${params.toString()}`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error searching models:', error);
    return {
      success: false,
      results: [],
      total_found: 0,
      limited: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Copy a model file
 */
const copyModelFile = async (params: {
  filename: string;
  source_folder: string;
  target_folder: string;
  source_subfolder?: string;
  target_subfolder?: string;
  new_filename?: string;
  overwrite?: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  file_info?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/copy`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error copying model file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Delete a model file
 */
const deleteModelFile = async (params: {
  filename: string;
  folder: string;
  subfolder?: string;
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/delete`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error deleting model file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Upload a model file
 */
const uploadModelFile = async (params: {
  file: File | Blob;
  folder: string;
  subfolder?: string;
  filename?: string;
  overwrite?: boolean;
  onProgress?: (progress: number) => void;
}): Promise<{
  success: boolean;
  message?: string;
  file_info?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('folder', params.folder);

    if (params.subfolder) {
      formData.append('subfolder', params.subfolder);
    }

    if (params.filename) {
      formData.append('filename', params.filename);
    }

    if (params.overwrite) {
      formData.append('overwrite', 'true');
    }

    const response = await axios.post(`${serverUrl}/comfymobile/api/models/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 3600000, // 1 hour for large files
      onUploadProgress: (progressEvent) => {
        if (params.onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          params.onProgress(percentCompleted);
        }
      }
    });

    return response.data;
  } catch (error: any) {
    console.error('Error uploading model file:', error);
    return {
      success: false,
      error: error.response?.data?.error || (error instanceof Error ? error.message : 'Unknown error')
    };
  }
};

/**
 * List partial/incomplete uploads
 */
const listPartialUploads = async (): Promise<{
  success: boolean;
  partial_uploads?: Array<{
    filename: string;
    partial_filename: string;
    bytes_uploaded: number;
    size_mb: number;
    modified_iso: string;
  }>;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/models/uploads/partial`);
    return response.data;
  } catch (error: any) {
    console.error('Error listing partial uploads:', error);
    return {
      success: false,
      error: error.response?.data?.error || (error instanceof Error ? error.message : 'Unknown error')
    };
  }
};

/**
 * Delete a partial upload file
 */
const deletePartialUpload = async (partialFilename: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/models/uploads/partial`, {
      data: { partial_filename: partialFilename }
    });
    return response.data;
  } catch (error: any) {
    console.error('Error deleting partial upload:', error);
    return {
      success: false,
      error: error.response?.data?.error || (error instanceof Error ? error.message : 'Unknown error')
    };
  }
};

/**
 * Rename a model file
 */
const renameModelFile = async (params: {
  old_filename: string;
  new_filename: string;
  folder: string;
  subfolder?: string;
  overwrite?: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  file_info?: any;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/models/rename`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return response.data;
  } catch (error) {
    console.error('Error renaming model file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Get trigger words for LoRA models
 */
const getTriggerWords = async (): Promise<{
  success: boolean;
  trigger_words: Record<string, string[]>;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/loras/trigger-words`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching trigger words:', error);
    return {
      success: false,
      trigger_words: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Save trigger words for a specific LoRA
 */
const saveTriggerWords = async (params: {
  lora_name: string;
  trigger_words: string[];
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/loras/trigger-words`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error saving trigger words:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

interface ModelFile {
  name: string;
  filename: string;
  folder_type: string;
  subfolder: string;
  path: string;
  relative_path: string;
  size: number;
  size_mb: number;
  extension: string;
  modified: number;
  modified_iso: string;
}

/**
 * Reboot the ComfyUI server (with watchdog support)
 */
const rebootServer = async (): Promise<boolean> => {
  initializeService();
  // check server status first
  let serverIsResponsive = false;
  try {
    const healthResponse = await axios.get(`${serverUrl}/system_stats`, { timeout: 3000 });
    serverIsResponsive = healthResponse.status === 200;
  } catch (error) {
    serverIsResponsive = false;
  }

  if (serverIsResponsive) {
    // when server is responsive: use Extension API
    console.log('Server responsive - using Extension API');
    try {
      const response = await axios.post(`${serverUrl}/comfymobile/api/reboot`, {
        confirm: true
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.status === 200) {
        console.log('Restart requested via extension API');
        return true;
      }
    } catch (error) {
      console.error('Extension API reboot failed:', error);
      return false;
    }
  } else {
    // when server is unresponsive: use Watchdog API
    console.log('Server unresponsive - using Watchdog API');
    try {
      const serverUrlObj = new URL(serverUrl);
      const watchdogUrl = `${serverUrlObj.protocol}//${serverUrlObj.hostname}:9188/restart`;
      
      const watchdogResponse = await fetch(watchdogUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(60000)
      });
      
      if (watchdogResponse.ok) {
        const data = await watchdogResponse.json();
        if (data.success) {
          console.log('Restart requested via watchdog API');
          return true;
        }
      }
    } catch (error) {
      console.error('Watchdog API reboot failed:', error);
      return false;
    }
  }

  return false;
};

// Video download management APIs
const getVideoDownloadStatus = async (): Promise<any> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/videos/download/status`, {
      timeout: 10000
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to get video download status:', error);
    throw error;
  }
};

const downloadVideo = async (params: {
  url: string;
  filename?: string;
  subfolder?: string;
}): Promise<any> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/videos/download`, params, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 3600000 // 1 hour for video downloads
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to download video:', error);
    throw error;
  }
};

const upgradeYtDlp = async (): Promise<any> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/videos/upgrade-yt-dlp`, {}, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minutes for upgrade
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to upgrade yt-dlp:', error);
    throw error;
  }
};

const subscribeToLogsManually = async (clientId: string = 'comfy-mobile-ui-client-2025'): Promise<any> => {
  initializeService();
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/logs/subscribe`, {
      clientId
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data;
  } catch (error: any) {
    console.error('[ComfyApiClient] Failed to subscribe to logs manually:', error);
    throw error;
  }
};

// Logging APIs
/**
 * Get initial raw logs from ComfyUI backend
 */
const getRawLogs = async (): Promise<LogsRawResponse> => {
  initializeService();
  try {
    const response = await axios.get(`${serverUrl}/internal/logs/raw`, {
      timeout: 10000
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to get raw logs:', error);
    throw error;
  }
};

/**
 * Subscribe or unsubscribe to real-time logs via WebSocket
 */
const subscribeLogs = async (enabled: boolean, clientId: string): Promise<void> => {
  initializeService();
  const url = `${serverUrl}/internal/logs/subscribe`;

  try {
    await axios.patch(url, {
      enabled,
      clientId
    } as LogSubscribeRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  } catch (error: any) {
    console.error('[ComfyApiClient] Failed to subscribe logs:', {
      url,
      error: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data
    });
    throw error;
  }
};

/**
 * ComfyUI Service - Pure HTTP API Client
 * 
 * Note: This is now a pure HTTP API client. WebSocket events are handled by GlobalWebSocketService.
 * Event handling methods (on, off, emit, etc.) delegate to GlobalWebSocketService.
 */
const ComfyUIService = {
  // Event handling - delegate to GlobalWebSocketService
  on: (event: string, listener: Function) => globalWebSocketService.on(event, listener),
  off: (event: string, listener: Function) => globalWebSocketService.off(event, listener),
  offById: (event: string, listenerId: string) => globalWebSocketService.offById(event, listenerId),
  emit: (event: string, ...args: any[]) => globalWebSocketService.emit(event, ...args),
  removeAllListeners: () => globalWebSocketService.removeAllListeners(),
  getListenerCount: (event: string) => globalWebSocketService.getListenerCount?.(event) || 0,
  debug: () => console.log('Debug mode - events handled by GlobalWebSocketService'),
  
  // Core HTTP API methods
  executeWorkflow,
  submitPromptWithId,
  getAllHistory,
  getPromptHistory,
  getQueueStatus,
  interruptExecution,
  clearQueue,
  
  // Custom node manager
  getInstalledCustomNodePackages,
  getCustomNodeList,
  getManagerNodeMappings,
  startManagerQueue,
  queuePackageInstall,
  
  // Server management
  getServerInfo,
  clearCache,
  clearVRAM,
  rebootServer,
  
  // Model management
  getAvailableModels,
  getLoraList,
  
  // File operations
  uploadImage,
  
  // Processing state (delegated to GlobalWebSocketService)
  getIsProcessing: () => globalWebSocketService.getIsProcessing(),
  getCurrentPromptId: () => globalWebSocketService.getCurrentPromptId(),
  getCurrentWorkflowId: () => globalWebSocketService.getCurrentWorkflowId(),
  getCurrentWorkflowName: () => globalWebSocketService.getCurrentWorkflowName(),
  getProcessingInfo: () => globalWebSocketService.getProcessingInfo(),
  
  // Legacy methods (compatibility)
  cleanupExecution: (promptId: string) => {
    console.log('[ComfyApiClient] cleanupExecution delegated to GlobalWebSocketService');
    // In the new architecture, cleanup is handled by GlobalWebSocketService
    // We can still notify it about cleanup if needed
    globalWebSocketService.emit('cleanup_execution', { promptId });
  },
  
  // Reconnection (handled by GlobalWebSocketService)
  reconnectToPrompt: (promptId: string, workflowId: string, workflowName?: string) => {
    console.log('[ComfyApiClient] Reconnection delegated to GlobalWebSocketService');
    // This functionality is now handled by GlobalWebSocketService + WorkflowEditor
    // No longer needed as a direct API call
  },
  
  // Model management APIs
  fetchModelFolders,
  startModelDownload,
  cancelDownload,
  clearDownloadHistory,
  fetchDownloads,
  resumeDownload,
  retryAllFailedDownloads,
  moveModelFile,
  
  // Custom node mappings APIs
  getCustomNodeMappings,
  saveCustomNodeMapping,
  deleteCustomNodeMapping,
  
  // Custom widget types APIs
  getAllCustomWidgetTypes,
  getCustomWidgetType,
  createCustomWidgetType,
  updateCustomWidgetType,
  deleteCustomWidgetType,
  
  // Model Browser specific APIs
  getAllModels,
  getModelsFromFolder,
  searchModels,
  uploadModelFile,
  listPartialUploads,
  deletePartialUpload,
  copyModelFile,
  deleteModelFile,
  renameModelFile,
  getTriggerWords,
  saveTriggerWords,

  // Video download APIs
  getVideoDownloadStatus,
  downloadVideo,
  upgradeYtDlp,

  // Logging APIs
  getRawLogs,
  subscribeLogs,
  subscribeToLogsManually,

  // Utility methods
  isInitialized: () => isInitialized,
  getServerUrl: () => serverUrl,
  
  // Cleanup
  cleanup: () => {
    if (connectionStoreUnsubscribe) {
      connectionStoreUnsubscribe();
      connectionStoreUnsubscribe = null;
    }
  },
  
  // Service management
  destroy: () => {
    ComfyUIService.cleanup();
    console.log('ComfyUIService destroyed (HTTP client only)');
  }
};

// Auto-initialize on first import
initializeService();

export default ComfyUIService;
