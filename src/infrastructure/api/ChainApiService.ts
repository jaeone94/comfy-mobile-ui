/**
 * Chain API Service
 *
 * Provides API functions for workflow chain management
 */

import axios from 'axios';
import { withComfyAuth } from '@/infrastructure/auth/ComfyAuthService';
import { IWorkflowChain } from '@/core/chain/types';

export interface ChainListResponse {
  success: boolean;
  chains: IWorkflowChain[];
  count: number;
  error?: string;
}

export interface ChainResponse {
  success: boolean;
  chain?: IWorkflowChain;
  error?: string;
}

export interface ChainSaveResponse {
  success: boolean;
  chain?: IWorkflowChain;
  message?: string;
  error?: string;
}

export interface ChainDeleteResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ChainExecutionResponse {
  success: boolean;
  executionId?: string;
  status?: 'completed' | 'failed' | 'running';
  nodeResults?: Array<{
    success: boolean;
    nodeId: string;
    nodeName?: string;
    promptId?: string;
    outputs?: Array<{
      nodeId: string;
      filename: string;
      subfolder: string;
      originalPath: string;
      cachedPath: string;
    }>;
    error?: string;
  }>;
  error?: string;
}

/**
 * List all workflow chains
 */
export async function listChains(serverUrl: string): Promise<ChainListResponse> {
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/chains/list`, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        chains: [],
        count: 0,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      chains: [],
      count: 0,
      error: 'Failed to list chains'
    };
  }
}

/**
 * Get chain content by ID
 */
export async function getChainContent(serverUrl: string, chainId: string): Promise<ChainResponse> {
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/chains/content/${chainId}`, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to get chain content'
    };
  }
}

/**
 * Save or update a workflow chain
 */
export async function saveChain(serverUrl: string, chain: IWorkflowChain): Promise<ChainSaveResponse> {
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/chains/save`, chain, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to save chain'
    };
  }
}

/**
 * Delete a workflow chain
 */
export async function deleteChain(serverUrl: string, chainId: string): Promise<ChainDeleteResponse> {
  try {
    const response = await axios.delete(`${serverUrl}/comfymobile/api/chains/delete`, {
      data: { chain_id: chainId },
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to delete chain'
    };
  }
}

/**
 * Execute a workflow chain
 */
export async function executeChain(serverUrl: string, chainId: string): Promise<ChainExecutionResponse> {
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/chains/execute`,
      { chain_id: chainId },
      {
        timeout: 600000, // 10 minutes timeout for long executions
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to execute chain'
    };
  }
}

/**
 * Interrupt currently executing chain
 */
export async function interruptChain(serverUrl: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/chains/interrupt`, {}, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to interrupt chain'
    };
  }
}

/**
 * Check if chain API is available (extension detection)
 */
export async function checkChainApiAvailability(serverUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${serverUrl}/comfymobile/api/chains/list`, {
      timeout: 5000
    });
    return response.data.success === true;
  } catch (error) {
    return false;
  }
}

export interface ChainThumbnailResponse {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Save thumbnail for a workflow node in the chain
 */
export async function saveChainThumbnail(
  serverUrl: string,
  chainId: string,
  nodeId: string,
  thumbnail: string
): Promise<ChainThumbnailResponse> {
  try {
    const response = await axios.post(`${serverUrl}/comfymobile/api/chains/thumbnails`,
      {
        chain_id: chainId,
        node_id: nodeId,
        thumbnail: thumbnail
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
    return {
      success: false,
      error: 'Failed to save thumbnail'
    };
  }
}

/**
 * Get thumbnail URL for a workflow node in the chain
 */
export function getChainThumbnailUrl(serverUrl: string, chainId: string, nodeId: string): string {
  return withComfyAuth(`${serverUrl}/comfymobile/api/chains/thumbnails/${chainId}/${nodeId}.png`);
}
