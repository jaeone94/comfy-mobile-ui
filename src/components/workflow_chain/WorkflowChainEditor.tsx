import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ArrowLeft, Plus, X, Save, Play, Edit, Loader2, CheckCircle2, XCircle, RefreshCw, Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { loadAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { convertJsonToAPI } from '@/infrastructure/api/ComfyApiFunctions';
import { analyzeWorkflow } from '@/services/chain/ChainAnalyzer';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { IChainWorkflowNode, IChainInputBinding, IChainOutputNode } from '@/core/chain/types';
import { saveChain, getChainContent, executeChain, interruptChain, saveChainThumbnail, getChainThumbnailUrl } from '@/infrastructure/api/ChainApiService';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import { chainProgressWebSocketService, ChainProgressData } from '@/infrastructure/websocket/ChainProgressWebSocketService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import type { LogEntry, LogsWsMessage } from '@/core/domain';

// Internal type for editor (extends with analysis results)
interface WorkflowNodeWithAnalysis {
  id: string; // Unique ID within chain
  workflowId?: string; // Original workflow ID for IndexedDB lookup
  name: string; // Display name (stored in chain)
  thumbnail?: string; // Thumbnail (stored in chain)
  apiFormat: any; // API workflow format
  inputBindings: Record<string, any>; // Input bindings map
  inputs: IChainInputBinding[]; // Analysis result (for UI)
  outputs: IChainOutputNode[]; // Analysis result (for UI)
}

export const WorkflowChainEditor: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { url: serverUrl } = useConnectionStore();

  const [chainName, setChainName] = useState('');
  const [chainDescription, setChainDescription] = useState('');
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeWithAnalysis[]>([]);

  // Workflow selection panel
  const [isWorkflowPanelOpen, setIsWorkflowPanelOpen] = useState(false);
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Edit mode and file selection
  const [isEditMode, setIsEditMode] = useState(!id); // Edit mode: true for new chains, false for existing
  const [fileSelectionState, setFileSelectionState] = useState<{
    isOpen: boolean;
    workflowIndex: number | null;
    inputNodeId: string | null;
    widgetName: string | null;
    widgetType: string | null;
  }>({ isOpen: false, workflowIndex: null, inputNodeId: null, widgetName: null, widgetType: null });

  // Chain progress state
  const [chainProgress, setChainProgress] = useState<ChainProgressData | null>(null);

  // Console logs state
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const consoleContainerRef = useRef<HTMLDivElement>(null);

  // WebSocket connection for chain progress
  useEffect(() => {
    if (!serverUrl) {
      chainProgressWebSocketService.disconnect();
      return;
    }

    // Connect to chain progress WebSocket
    chainProgressWebSocketService.setServerUrl(serverUrl);
    const state = chainProgressWebSocketService.getState();

    if (!state.isConnected && !state.isConnecting) {
      chainProgressWebSocketService.connect();
    } else if (state.isConnected) {
      // Already connected, request current state
      chainProgressWebSocketService.requestCurrentState();
    }

    // Subscribe to progress updates
    const progressListenerId = chainProgressWebSocketService.on('progress_update', (data: ChainProgressData) => {
      setChainProgress(data);
    });

    return () => {
      chainProgressWebSocketService.offById('progress_update', progressListenerId);
    };
  }, [serverUrl]);

  // Listen to real-time log events when chain is executing
  useEffect(() => {
    const isOwnChainExecuting = chainProgress?.isExecuting && chainProgress?.chainId === id;

    if (!isOwnChainExecuting) {
      return;
    }

    const handleLogsMessage = (event: any) => {
      const logsData: LogsWsMessage = event.data || event;

      if (logsData.entries && logsData.entries.length > 0) {
        setConsoleLogs(prev => [...prev, ...logsData.entries]);

        // Auto-scroll to bottom
        setTimeout(() => {
          if (consoleContainerRef.current) {
            consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
          }
        }, 10);
      }
    };

    // Subscribe to logs and fetch initial logs when chain starts executing
    const loadLogs = async () => {
      try {
        // Subscribe to logs
        await ComfyUIService.subscribeToLogsManually();

        // Fetch initial logs
        const rawLogs = await ComfyUIService.getRawLogs();
        if (rawLogs.entries && rawLogs.entries.length > 0) {
          setConsoleLogs(rawLogs.entries);

          // Auto-scroll to bottom after loading
          setTimeout(() => {
            if (consoleContainerRef.current) {
              consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
            }
          }, 100);
        }
      } catch (error) {
        console.error('[WorkflowChainEditor] Failed to load console logs:', error);
      }
    };

    loadLogs();

    ComfyUIService.on('logs', handleLogsMessage);

    return () => {
      ComfyUIService.off('logs', handleLogsMessage);
    };
  }, [chainProgress?.isExecuting, chainProgress?.chainId, id]);

  // Clear logs when chain execution starts
  useEffect(() => {
    const isOwnChainExecuting = chainProgress?.isExecuting && chainProgress?.chainId === id;

    if (isOwnChainExecuting && consoleLogs.length === 0) {
      // Chain just started, logs are already cleared
      return;
    }

    if (!isOwnChainExecuting && consoleLogs.length > 0) {
      // Chain finished or stopped, clear logs after a delay
      const timeout = setTimeout(() => {
        setConsoleLogs([]);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [chainProgress?.isExecuting, chainProgress?.chainId, id]);

  // Load available workflows
  useEffect(() => {
    const loadWorkflows = async () => {
      setLoadingWorkflows(true);
      try {
        const workflows = await loadAllWorkflows();
        setAvailableWorkflows(workflows);
      } catch (error) {
        console.error('Failed to load workflows:', error);
        toast.error(t('common.error'));
      } finally {
        setLoadingWorkflows(false);
      }
    };

    loadWorkflows();
  }, []);

  // Load existing chain if editing
  useEffect(() => {
    const loadChain = async () => {
      if (!id || !serverUrl) return;

      try {
        const response = await getChainContent(serverUrl, id);

        if (response.success && response.chain) {
          setChainName(response.chain.name);
          setChainDescription(response.chain.description || '');

          // Load all workflows from IndexedDB
          const allWorkflows = await loadAllWorkflows();

          // Convert chain nodes back to WorkflowNodeWithAnalysis format
          const loadedNodes: WorkflowNodeWithAnalysis[] = response.chain.nodes.map((node: any) => {
            const analysis = analyzeWorkflow(node.apiFormat);

            // Try to find matching workflow in IndexedDB
            let thumbnailToUse = node.thumbnail;
            if (node.workflowId) {
              const matchingWorkflow = allWorkflows.find(w => w.id === node.workflowId);
              if (matchingWorkflow?.thumbnail) {
                thumbnailToUse = matchingWorkflow.thumbnail;
              }
            }

            // If no thumbnail from IndexedDB and no stored thumbnail, try server thumbnail
            if (!thumbnailToUse) {
              thumbnailToUse = getChainThumbnailUrl(serverUrl, id, node.id);
            }

            return {
              id: node.id,
              workflowId: node.workflowId, // Preserve workflowId for IndexedDB lookup
              name: node.name,
              thumbnail: thumbnailToUse,
              apiFormat: node.apiFormat,
              inputBindings: node.inputBindings || {},
              inputs: analysis.inputs,
              outputs: analysis.outputs
            };
          });

          setWorkflowNodes(loadedNodes);
          toast.success('Chain loaded successfully');
        } else {
          toast.error(response.error || 'Failed to load chain');
        }
      } catch (error) {
        console.error('Failed to load chain:', error);
        toast.error(t('common.error'));
      }
    };

    loadChain();
  }, [id, serverUrl]);

  // Add workflow to chain
  const handleAddWorkflow = async (workflow: Workflow) => {
    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    if (isConverting) {
      return; // Prevent duplicate clicks
    }

    setIsConverting(true);
    try {
      // Convert workflow to API format
      const conversionResult = await convertJsonToAPI(
        workflow.workflow_json,
        serverUrl,
        { timeout: 10000 }
      );

      // Analyze inputs and outputs
      const analysis = analyzeWorkflow(conversionResult.apiWorkflow);

      // Create initial input bindings with current values as static bindings
      const initialBindings: Record<string, any> = {};
      analysis.inputs.forEach(input => {
        const bindingKey = `${input.nodeId}.${input.widgetName}`;
        initialBindings[bindingKey] = {
          type: 'static',
          value: input.currentValue || ''
        };
      });

      const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create workflow node with new chain-specific ID
      const newNode: WorkflowNodeWithAnalysis = {
        id: newNodeId,
        workflowId: workflow.id,
        name: workflow.name,
        thumbnail: workflow.thumbnail,
        apiFormat: conversionResult.apiWorkflow,
        inputBindings: initialBindings,
        inputs: analysis.inputs,
        outputs: analysis.outputs
      };

      // Insert at specific position or append to end
      if (insertAtIndex !== null) {
        setWorkflowNodes(prev => {
          const newNodes = [...prev];
          newNodes.splice(insertAtIndex, 0, newNode);
          return newNodes;
        });
      } else {
        setWorkflowNodes(prev => [...prev, newNode]);
      }

      setIsWorkflowPanelOpen(false);
      setInsertAtIndex(null);
      toast.success(`Added workflow: ${workflow.name}`);
    } catch (error) {
      console.error('Failed to add workflow:', error);
      toast.error(t('common.error'));
    } finally {
      setIsConverting(false);
    }
  };

  // Remove workflow from chain
  const handleRemoveWorkflow = (index: number) => {
    setWorkflowNodes(prev => prev.filter((_, i) => i !== index));
    toast.success(t('workflowChain.editor.toast.removed'));
  };

  // Refresh workflow from IndexedDB
  const handleRefreshWorkflow = async (index: number, workflowId: string) => {
    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    try {
      // Find workflow in IndexedDB
      const workflow = availableWorkflows.find(w => w.id === workflowId);
      if (!workflow) {
        toast.error('Workflow not found in app storage');
        return;
      }

      toast.info('Refreshing workflow...');

      // Convert workflow to API format
      const conversionResult = await convertJsonToAPI(
        workflow.workflow_json,
        serverUrl,
        { timeout: 10000 }
      );

      // Analyze inputs and outputs
      const analysis = analyzeWorkflow(conversionResult.apiWorkflow);

      // Update the node at index
      setWorkflowNodes(prev => {
        const updated = [...prev];
        const existingNode = updated[index];

        // Preserve existing input bindings where possible
        const updatedBindings: Record<string, any> = {};

        // For each new input, try to preserve existing binding or use static
        analysis.inputs.forEach(input => {
          const bindingKey = `${input.nodeId}.${input.widgetName}`;
          const existingBinding = existingNode.inputBindings?.[bindingKey];

          if (existingBinding) {
            // Preserve existing binding
            updatedBindings[bindingKey] = existingBinding;
          } else {
            // Create new static binding with current value
            updatedBindings[bindingKey] = {
              type: 'static',
              value: input.currentValue || ''
            };
          }
        });

        updated[index] = {
          ...existingNode,
          name: workflow.name,
          thumbnail: workflow.thumbnail,
          apiFormat: conversionResult.apiWorkflow,
          inputBindings: updatedBindings,
          inputs: analysis.inputs,
          outputs: analysis.outputs
        };

        return updated;
      });

      toast.success('Workflow refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh workflow:', error);
      toast.error('Failed to refresh workflow');
    }
  };

  // Randomize seed values for a single workflow
  const handleRandomizeSeed = (index: number) => {
    setWorkflowNodes(prev => {
      const updated = [...prev];
      const node = updated[index];

      // Find all seed or noise_seed widgets in apiFormat
      let seedCount = 0;
      const updatedApiFormat = { ...node.apiFormat };

      Object.keys(updatedApiFormat).forEach(nodeId => {
        const nodeData = updatedApiFormat[nodeId];
        const inputs = nodeData?.inputs || {};

        Object.keys(inputs).forEach(inputKey => {
          if (inputKey === 'seed' || inputKey === 'noise_seed') {
            // Generate random positive integer (0 to 2^32-1)
            const randomSeed = Math.floor(Math.random() * 4294967295);
            updatedApiFormat[nodeId] = {
              ...nodeData,
              inputs: {
                ...inputs,
                [inputKey]: randomSeed
              }
            };
            seedCount++;
          }
        });
      });

      if (seedCount === 0) {
        toast.info('No seed or noise_seed widgets found');
        return prev;
      }

      updated[index] = {
        ...node,
        apiFormat: updatedApiFormat
      };

      toast.success(`Randomized ${seedCount} seed value${seedCount > 1 ? 's' : ''}`);
      return updated;
    });
  };

  // Randomize all seed values in all workflows
  const handleRandomizeAllSeeds = () => {
    if (workflowNodes.length === 0) {
      toast.info('No workflows in chain');
      return;
    }

    setWorkflowNodes(prev => {
      const updated = [...prev];
      let totalSeedCount = 0;
      let workflowsWithSeeds = 0;

      updated.forEach((node, index) => {
        let seedCount = 0;
        const updatedApiFormat = { ...node.apiFormat };

        Object.keys(updatedApiFormat).forEach(nodeId => {
          const nodeData = updatedApiFormat[nodeId];
          const inputs = nodeData?.inputs || {};

          Object.keys(inputs).forEach(inputKey => {
            if (inputKey === 'seed' || inputKey === 'noise_seed') {
              const randomSeed = Math.floor(Math.random() * 4294967295);
              updatedApiFormat[nodeId] = {
                ...nodeData,
                inputs: {
                  ...inputs,
                  [inputKey]: randomSeed
                }
              };
              seedCount++;
              totalSeedCount++;
            }
          });
        });

        if (seedCount > 0) {
          updated[index] = {
            ...node,
            apiFormat: updatedApiFormat
          };
          workflowsWithSeeds++;
        }
      });

      if (totalSeedCount === 0) {
        toast.info('No seed or noise_seed widgets found in any workflow');
        return prev;
      }

      toast.success(`Randomized ${totalSeedCount} seed value${totalSeedCount > 1 ? 's' : ''} across ${workflowsWithSeeds} workflow${workflowsWithSeeds > 1 ? 's' : ''}`);
      return updated;
    });
  };

  // Refresh all workflows from IndexedDB
  const handleRefreshAllWorkflows = async () => {
    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    if (workflowNodes.length === 0) {
      toast.info('No workflows in chain');
      return;
    }

    const workflowsToRefresh = workflowNodes.filter(node => node.workflowId);
    if (workflowsToRefresh.length === 0) {
      toast.info('No workflows linked to app storage');
      return;
    }

    toast.info(`Refreshing ${workflowsToRefresh.length} workflow${workflowsToRefresh.length > 1 ? 's' : ''}...`);

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < workflowNodes.length; i++) {
        const node = workflowNodes[i];
        if (!node.workflowId) continue;

        try {
          const workflow = availableWorkflows.find(w => w.id === node.workflowId);
          if (!workflow) {
            failCount++;
            continue;
          }

          const conversionResult = await convertJsonToAPI(
            workflow.workflow_json,
            serverUrl,
            { timeout: 10000 }
          );

          const analysis = analyzeWorkflow(conversionResult.apiWorkflow);

          setWorkflowNodes(prev => {
            const updated = [...prev];
            const existingNode = updated[i];

            const updatedBindings: Record<string, any> = {};
            analysis.inputs.forEach(input => {
              const bindingKey = `${input.nodeId}.${input.widgetName}`;
              const existingBinding = existingNode.inputBindings?.[bindingKey];

              if (existingBinding) {
                updatedBindings[bindingKey] = existingBinding;
              } else {
                updatedBindings[bindingKey] = {
                  type: 'static',
                  value: input.currentValue || ''
                };
              }
            });

            updated[i] = {
              ...existingNode,
              name: workflow.name,
              thumbnail: workflow.thumbnail,
              apiFormat: conversionResult.apiWorkflow,
              inputBindings: updatedBindings,
              inputs: analysis.inputs,
              outputs: analysis.outputs
            };

            return updated;
          });

          successCount++;
        } catch (error) {
          console.error(`Failed to refresh workflow ${node.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Refreshed ${successCount} workflow${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`);
      } else {
        toast.error('Failed to refresh workflows');
      }
    } catch (error) {
      console.error('Failed to refresh workflows:', error);
      toast.error('Failed to refresh workflows');
    }
  };

  // Handle file selection from OutputsGallery (for static bindings)
  const handleFileSelect = (filename: string) => {
    if (fileSelectionState.workflowIndex !== null &&
      fileSelectionState.inputNodeId &&
      fileSelectionState.widgetName) {

      handleUpdateBinding(
        fileSelectionState.workflowIndex,
        fileSelectionState.inputNodeId,
        fileSelectionState.widgetName,
        'static',
        filename
      );

      toast.success('File selected');
    }

    // Close file selection modal
    setFileSelectionState({
      isOpen: false,
      workflowIndex: null,
      inputNodeId: null,
      widgetName: null,
      widgetType: null
    });
  };

  // Interrupt chain execution
  const handleInterruptChain = async () => {
    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    toast.info('Stopping chain execution...');

    try {
      const response = await interruptChain(serverUrl);

      if (response.success) {
        toast.success('Chain execution interrupted');
      } else {
        toast.error(response.error || 'Failed to interrupt chain');
      }
    } catch (error) {
      console.error('Failed to interrupt chain:', error);
      toast.error('Failed to interrupt chain');
    }
  };

  // Execute chain
  const handleExecuteChain = async () => {
    if (!id || !serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    if (workflowNodes.length === 0) {
      toast.error(t('workflowChain.editor.noWorkflowsAvailable'));
      return;
    }

    toast.info(t('workflowChain.toast.starting', { name: chainName || id }));

    try {
      const response = await executeChain(serverUrl, id);

      if (response.success) {
        toast.success(t('workflowChain.toast.executed', { name: chainName || id }));

        // Show details of node results
        if (response.nodeResults && response.nodeResults.length > 0) {
          const successCount = response.nodeResults.filter(r => r.success).length;
          const totalCount = response.nodeResults.length;
          toast.info(t('workflowChain.toast.completedNodes', { success: successCount, total: totalCount }));
        }
      } else {
        toast.error(t('workflowChain.toast.execFailed', { error: response.error || t('common.error') }));
      }
    } catch (error) {
      console.error('Chain execution error:', error);
      toast.error(t('workflowChain.toast.failedExec', { name: chainName || id }));
    }
  };

  // Update input binding
  const handleUpdateBinding = (
    workflowIndex: number,
    inputNodeId: string,
    widgetName: string,
    bindingType: 'static' | 'dynamic',
    value?: string | { sourceWorkflowIndex: number; outputNodeId: string }
  ) => {
    setWorkflowNodes(prev => {
      const updated = [...prev];
      const node = updated[workflowIndex];

      if (!node.inputBindings) {
        node.inputBindings = {};
      }

      const bindingKey = `${inputNodeId}.${widgetName}`;

      if (bindingType === 'static' && typeof value === 'string') {
        node.inputBindings[bindingKey] = {
          type: 'static',
          value
        };
      } else if (bindingType === 'dynamic' && value && typeof value === 'object') {
        node.inputBindings[bindingKey] = {
          type: 'dynamic',
          sourceWorkflowIndex: value.sourceWorkflowIndex,
          sourceOutputNodeId: value.outputNodeId
        };
      }

      return updated;
    });
  };

  // Handle save button click
  const handleSaveClick = () => {
    if (workflowNodes.length === 0) {
      toast.error('Add at least one workflow to the chain');
      return;
    }

    // For new chains, open modal to enter name
    if (!id) {
      setShowSaveModal(true);
      return;
    }

    // For existing chains, save directly without modal
    handleSaveExisting();
  };

  // Save existing chain (without modal)
  const handleSaveExisting = async () => {
    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    setIsSaving(true);
    try {
      const chainData: any = {
        id: id,
        name: chainName,
        description: chainDescription,
        nodes: workflowNodes.map(node => ({
          id: node.id,
          workflowId: node.workflowId,
          name: node.name,
          thumbnail: node.thumbnail,
          apiFormat: node.apiFormat,
          inputBindings: node.inputBindings || {}
        })),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };

      const response = await saveChain(serverUrl, chainData);

      if (response.success) {
        // Save thumbnails only for nodes without workflowId (orphaned workflows)
        await Promise.all(
          workflowNodes.map(async (node) => {
            if (node.thumbnail && !node.workflowId && id) {
              try {
                await saveChainThumbnail(serverUrl, id, node.id, node.thumbnail);
              } catch (error) {
                console.error(`Failed to save thumbnail for node ${node.id}:`, error);
              }
            }
          })
        );

        toast.success('Chain saved successfully!');
        setIsEditMode(false);
      } else {
        toast.error(response.error || 'Failed to save chain');
      }
    } catch (error) {
      console.error('Failed to save chain:', error);
      toast.error(t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Save new chain (with name from modal)
  const handleSaveNew = async () => {
    if (!chainName.trim()) {
      toast.error('Chain name is required');
      return;
    }

    if (!serverUrl) {
      toast.error(t('common.notConfigured'));
      return;
    }

    setIsSaving(true);
    try {
      const newChainId = `chain-${Date.now()}`;
      const chainData: any = {
        id: newChainId,
        name: chainName,
        description: chainDescription,
        nodes: workflowNodes.map(node => ({
          id: node.id,
          workflowId: node.workflowId,
          name: node.name,
          thumbnail: node.thumbnail,
          apiFormat: node.apiFormat,
          inputBindings: node.inputBindings || {}
        })),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };

      const response = await saveChain(serverUrl, chainData);

      if (response.success) {
        // Save thumbnails only for nodes without workflowId (orphaned workflows)
        await Promise.all(
          workflowNodes.map(async (node) => {
            if (node.thumbnail && !node.workflowId) {
              try {
                await saveChainThumbnail(serverUrl, newChainId, node.id, node.thumbnail);
              } catch (error) {
                console.error(`Failed to save thumbnail for node ${node.id}:`, error);
              }
            }
          })
        );

        toast.success(t('workflowChain.editor.toast.saved'));
        setShowSaveModal(false);
        setIsEditMode(false);
        navigate(`/chains/edit/${newChainId}`);
      } else {
        toast.error(response.error || t('common.error'));
      }
    } catch (error) {
      console.error('Failed to save chain:', error);
      toast.error(t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="bg-black transition-colors duration-300 pwa-container"
      style={{
        overflow: 'hidden',
        height: '100dvh',
        maxHeight: '100dvh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        touchAction: 'none'
      }}
    >
      {/* Main Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />

      {/* Glassmorphism Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

      {/* Main Scrollable Content Area */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        {/* Fixed Header inside scroll area */}
        <header className="sticky top-0 z-50 pwa-header bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative flex items-center justify-between p-4 z-10">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <Button
                onClick={() => navigate('/chains')}
                variant="ghost"
                size="sm"
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {id && chainName ? chainName : (id ? t('workflowChain.editor.editChain') : t('workflowChain.editor.newChain'))}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('workflowChain.editor.workflowsCount_plural', { count: workflowNodes.length })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Batch Actions - Always visible when there are workflows */}
              {workflowNodes.length > 0 && (
                <>
                  <Button
                    onClick={handleRandomizeAllSeeds}
                    variant="ghost"
                    size="sm"
                    className="bg-orange-500/20 dark:bg-orange-600/20 backdrop-blur-sm border border-orange-400/30 dark:border-orange-500/30 shadow-lg hover:shadow-xl hover:bg-orange-500/30 dark:hover:bg-orange-600/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg"
                    title="Randomize all seeds"
                  >
                    <Dices className="h-5 w-5 text-orange-700 dark:text-orange-300" />
                  </Button>
                  <Button
                    onClick={handleRefreshAllWorkflows}
                    variant="ghost"
                    size="sm"
                    className="bg-purple-500/20 dark:bg-purple-600/20 backdrop-blur-sm border border-purple-400/30 dark:border-purple-500/30 shadow-lg hover:shadow-xl hover:bg-purple-500/30 dark:hover:bg-purple-600/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg"
                    title={t('workflowChain.editor.toast.refreshed')}
                  >
                    <RefreshCw className="h-5 w-5 text-purple-700 dark:text-purple-300" />
                  </Button>
                </>
              )}

              {id && !isEditMode && (
                <>
                  {chainProgress?.isExecuting && chainProgress?.chainId === id ? (
                    <Button
                      onClick={handleInterruptChain}
                      variant="ghost"
                      size="sm"
                      className="bg-red-500/20 dark:bg-red-600/20 backdrop-blur-sm border border-red-400/30 dark:border-red-500/30 shadow-lg hover:shadow-xl hover:bg-red-500/30 dark:hover:bg-red-600/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg"
                      title={t('workflowChain.toast.stopping')}
                    >
                      <XCircle className="h-5 w-5 text-red-700 dark:text-red-300" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleExecuteChain}
                      disabled={workflowNodes.length === 0}
                      variant="ghost"
                      size="sm"
                      className="bg-green-500/20 dark:bg-green-600/20 backdrop-blur-sm border border-green-400/30 dark:border-green-500/30 shadow-lg hover:shadow-xl hover:bg-green-500/30 dark:hover:bg-green-600/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('workflow.execute')}
                    >
                      <Play className="h-5 w-5 text-green-700 dark:text-green-300" />
                    </Button>
                  )}
                  <Button
                    onClick={() => setIsEditMode(true)}
                    variant="ghost"
                    size="sm"
                    className="bg-blue-500/20 dark:bg-blue-600/20 backdrop-blur-sm border border-blue-400/30 dark:border-blue-500/30 shadow-lg hover:shadow-xl hover:bg-blue-500/30 dark:hover:bg-blue-600/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg"
                  >
                    <Edit className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                  </Button>
                </>
              )}
              {isEditMode && (
                <Button
                  onClick={handleSaveClick}
                  disabled={isSaving || workflowNodes.length === 0}
                  variant="ghost"
                  size="sm"
                  className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 rounded-lg"
                >
                  <Save className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="container mx-auto px-6 py-8 max-w-4xl relative z-10">
          {/* Chain Progress and Console - Only shown when this chain is executing */}
          {chainProgress?.isExecuting && chainProgress?.chainId === id && (
            <div className="mb-6 space-y-4">
              {/* Progress Bar */}
              <div className="backdrop-blur-md border rounded-xl shadow-lg p-4 bg-blue-50/80 dark:bg-blue-950/30 border-blue-400/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {t('workflowChain.editor.chainExecuting')}
                    </span>
                  </div>
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {(chainProgress.currentWorkflowIndex ?? 0) + 1} / {chainProgress.workflows.length}
                  </span>
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-900/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-500 h-full transition-all duration-300"
                    style={{
                      width: `${(((chainProgress.currentWorkflowIndex ?? 0) + 1) / chainProgress.workflows.length) * 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Server Console */}
              <div className="backdrop-blur-md border rounded-xl shadow-lg bg-white/70 dark:bg-slate-900/70 border-white/20 dark:border-slate-700/30 overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('workflowChain.editor.serverConsole')}
                    </span>
                  </div>
                  <Button
                    onClick={() => setConsoleLogs([])}
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Clear
                  </Button>
                </div>
                <div
                  ref={consoleContainerRef}
                  className="h-64 overflow-y-auto px-3 py-2 bg-slate-900/90 dark:bg-slate-950/90 font-mono text-xs"
                  style={{
                    touchAction: 'pan-y',
                    overscrollBehaviorY: 'contain'
                  } as React.CSSProperties}
                >
                  {consoleLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                      {t('workflowChain.editor.waitingLogs')}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {consoleLogs.map((log, index) => (
                        <div
                          key={index}
                          className="py-0.5 text-slate-100 dark:text-slate-200 leading-relaxed break-all whitespace-pre-wrap"
                        >
                          {log.m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Workflow List */}
          <div className="space-y-4">
            {workflowNodes.map((node, index) => {
              // Calculate workflow status from chainProgress
              const workflowStatus = chainProgress?.isExecuting && chainProgress?.chainId === id
                ? chainProgress.workflows.find(w => w.index === index)?.status
                : undefined;

              return (
                <React.Fragment key={`${node.id}-${index}`}>
                  {/* Compact Insert Button Between Cards - Only in edit mode */}
                  {isEditMode && index > 0 && (
                    <button
                      onClick={() => {
                        setInsertAtIndex(index);
                        setIsWorkflowPanelOpen(true);
                      }}
                      className="w-full py-2 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded-lg transition-all duration-200 group"
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-300 dark:via-blue-700 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Plus className="h-4 w-4" />
                        <span>{t('workflowChain.editor.insertWorkflow')}</span>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-300 dark:via-blue-700 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  <WorkflowNodeCard
                    node={node}
                    index={index}
                    isFirst={index === 0}
                    isEditMode={isEditMode}
                    previousWorkflows={workflowNodes.slice(0, index)}
                    workflowStatus={workflowStatus}
                    availableWorkflows={availableWorkflows}
                    onRemove={() => handleRemoveWorkflow(index)}
                    onRefresh={() => node.workflowId && handleRefreshWorkflow(index, node.workflowId)}
                    onRandomizeSeed={() => handleRandomizeSeed(index)}
                    onUpdateBinding={handleUpdateBinding}
                    onOpenFileSelection={(workflowIndex, inputNodeId, widgetName, widgetType) => {
                      setFileSelectionState({
                        isOpen: true,
                        workflowIndex,
                        inputNodeId,
                        widgetName,
                        widgetType
                      });
                    }}
                  />
                </React.Fragment>
              );
            })}

            {/* Add Workflow Button - Only in edit mode */}
            {isEditMode && (
              <button
                onClick={() => {
                  setInsertAtIndex(null);
                  setIsWorkflowPanelOpen(true);
                }}
                className="w-full p-8 border-2 border-dashed border-blue-400/50 dark:border-blue-500/50 rounded-xl bg-blue-50/30 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-950/30 transition-all duration-300 group"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 dark:bg-blue-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-blue-700 dark:text-blue-300">
                      {t('workflowChain.editor.addWorkflow')}
                    </p>
                    <p className="text-sm text-blue-600/70 dark:text-blue-400/70">
                      {t('workflowChain.editor.addWorkflowDesc')}
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Workflow Selection Side Panel */}
      <WorkflowSelectionPanel
        isOpen={isWorkflowPanelOpen}
        onClose={() => setIsWorkflowPanelOpen(false)}
        workflows={availableWorkflows}
        loading={loadingWorkflows}
        isConverting={isConverting}
        onSelect={handleAddWorkflow}
      />

      {/* Save Modal - Only for new chains */}
      <SaveChainModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        chainName={chainName}
        chainDescription={chainDescription}
        onChainNameChange={setChainName}
        onChainDescriptionChange={setChainDescription}
        onSave={handleSaveNew}
        isSaving={isSaving}
      />

      {/* OutputsGallery File Selection Modal */}
      {fileSelectionState.isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto overscroll-contain">
          <OutputsGallery
            isFileSelectionMode={true}
            allowImages={true}
            allowVideos={fileSelectionState.widgetType === 'video'}
            onFileSelect={handleFileSelect}
            onBackClick={() => setFileSelectionState({
              isOpen: false,
              workflowIndex: null,
              inputNodeId: null,
              widgetName: null,
              widgetType: null
            })}
            selectionTitle={`Select ${fileSelectionState.widgetType === 'video' ? 'Video' : 'Image/Video'} for ${fileSelectionState.widgetName}`}
            initialFolder="input"
          />
        </div>,
        document.body
      )}
    </div>
  );
};

// Workflow Node Card Component
interface WorkflowNodeCardProps {
  node: WorkflowNodeWithAnalysis;
  index: number;
  isFirst: boolean;
  isEditMode: boolean;
  previousWorkflows: WorkflowNodeWithAnalysis[];
  workflowStatus?: 'pending' | 'waiting' | 'running' | 'completed' | 'failed';
  availableWorkflows: Workflow[];
  onRemove: () => void;
  onRefresh: () => void;
  onRandomizeSeed: () => void;
  onUpdateBinding: (
    workflowIndex: number,
    inputNodeId: string,
    widgetName: string,
    bindingType: 'static' | 'dynamic',
    value?: string | { sourceWorkflowIndex: number; outputNodeId: string }
  ) => void;
  onOpenFileSelection: (
    workflowIndex: number,
    inputNodeId: string,
    widgetName: string,
    widgetType: string
  ) => void;
}

const WorkflowNodeCard: React.FC<WorkflowNodeCardProps> = ({
  node,
  index,
  isFirst,
  isEditMode,
  previousWorkflows,
  workflowStatus,
  availableWorkflows,
  onRemove,
  onRefresh,
  onRandomizeSeed,
  onUpdateBinding,
  onOpenFileSelection
}) => {
  const { t } = useTranslation();
  const { url: serverUrl } = useConnectionStore();

  // Check if workflow exists in IndexedDB
  const workflowExistsInDB = node.workflowId && availableWorkflows.some(w => w.id === node.workflowId);

  // Check if workflow has seed or noise_seed widgets
  const hasSeedWidget = Object.values(node.apiFormat).some((nodeData: any) => {
    const inputs = nodeData?.inputs || {};
    return Object.keys(inputs).some(key => key === 'seed' || key === 'noise_seed');
  });

  return (
    <div className={`backdrop-blur-md border rounded-xl shadow-lg p-6 space-y-4 transition-all duration-300 ${workflowStatus === 'running'
      ? 'bg-green-50/80 dark:bg-green-950/30 border-green-400/50 ring-2 ring-green-400/30'
      : 'bg-white/70 dark:bg-slate-900/70 border-white/20 dark:border-slate-700/30'
      }`}>
      {/* Header with Thumbnail */}
      <div className="flex items-start justify-between gap-4">
        {node.thumbnail && (
          <img
            src={node.thumbnail}
            alt={node.name}
            className="w-20 h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t('workflowChain.editor.step', { index: index + 1 })}
            </span>
            {workflowStatus === 'waiting' && (
              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('workflowChain.editor.waitingStart')}
              </span>
            )}
            {workflowStatus === 'running' && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-700 dark:text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('workflowChain.editor.processing')}
              </span>
            )}
            {workflowStatus === 'completed' && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {t('workflowChain.editor.done')}
              </span>
            )}
            {workflowStatus === 'failed' && (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-700 dark:text-red-300 rounded-full text-xs font-medium flex items-center gap-1">
                <X className="h-3 w-3" />
                {t('workflowChain.editor.failed')}
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {node.name}
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          {hasSeedWidget && (
            <Button
              onClick={onRandomizeSeed}
              variant="ghost"
              size="sm"
              className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
              title="Randomize seed values"
            >
              <Dices className="h-4 w-4" />
            </Button>
          )}
          {workflowExistsInDB && (
            <Button
              onClick={onRefresh}
              variant="ghost"
              size="sm"
              className="text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950"
              title="Refresh from app storage"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {isEditMode && (
            <Button
              onClick={onRemove}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
              title="Remove workflow"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Input Bindings Section */}
      {node.inputs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('workflowChain.editor.inputBindings', { count: node.inputs.length })}
          </h4>
          <div className="space-y-2">
            {node.inputs.map((input) => {
              const bindingKey = `${input.nodeId}.${input.widgetName}`;
              const currentBinding = node.inputBindings[bindingKey];

              return (
                <InputBindingRow
                  key={bindingKey}
                  input={input}
                  workflowIndex={index}
                  isFirst={isFirst}
                  isEditMode={isEditMode}
                  previousWorkflows={previousWorkflows}
                  currentBinding={currentBinding}
                  onUpdateBinding={onUpdateBinding}
                  onOpenFileSelection={onOpenFileSelection}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Output Nodes Section */}
      {node.outputs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('workflowChain.editor.outputNodes', { count: node.outputs.length })}
          </h4>
          <div className="space-y-1">
            {node.outputs.map((output) => (
              <div
                key={output.nodeId}
                className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 p-2 bg-slate-100/50 dark:bg-slate-800/50 rounded"
              >
                <span className="font-mono text-xs">{output.nodeId}</span>
                <span>•</span>
                <span>{output.nodeTitle}</span>
                <span className="text-xs text-slate-500">({output.outputType})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Input Binding Row Component
interface InputBindingRowProps {
  input: IChainInputBinding;
  workflowIndex: number;
  isFirst: boolean;
  isEditMode: boolean;
  previousWorkflows: WorkflowNodeWithAnalysis[];
  currentBinding?: any; // Current binding from inputBindings
  onUpdateBinding: (
    workflowIndex: number,
    inputNodeId: string,
    widgetName: string,
    bindingType: 'static' | 'dynamic',
    value?: string | { sourceWorkflowIndex: number; outputNodeId: string }
  ) => void;
  onOpenFileSelection: (
    workflowIndex: number,
    inputNodeId: string,
    widgetName: string,
    widgetType: string
  ) => void;
}

const InputBindingRow: React.FC<InputBindingRowProps> = ({
  input,
  workflowIndex,
  isFirst,
  isEditMode,
  previousWorkflows,
  currentBinding,
  onUpdateBinding,
  onOpenFileSelection
}) => {
  const { t } = useTranslation();
  // Get current binding values
  const bindingType = currentBinding?.type || 'static';
  const staticValue = currentBinding?.type === 'static'
    ? currentBinding.value
    : (input.currentValue || '');
  const selectedDynamicSource = currentBinding?.type === 'dynamic'
    ? `${currentBinding.sourceWorkflowIndex}|${currentBinding.sourceOutputNodeId}`
    : '';

  const handleBindingTypeChange = (newType: 'static' | 'dynamic') => {
    if (newType === 'static') {
      // Switch to static with current value
      onUpdateBinding(workflowIndex, input.nodeId, input.widgetName, 'static', staticValue || input.currentValue || '');
    } else if (newType === 'dynamic') {
      // Switch to dynamic - initialize empty binding so dropdown shows
      onUpdateBinding(workflowIndex, input.nodeId, input.widgetName, 'dynamic', { sourceWorkflowIndex: -1, outputNodeId: '' });
    }
  };

  return (
    <div className="p-3 bg-slate-50/50 dark:bg-slate-800/50 rounded space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {input.nodeTitle}
          </span>
          <span className="text-slate-500 dark:text-slate-400 ml-2">
            • {input.widgetName} ({input.widgetType})
          </span>
        </div>
      </div>

      {isFirst ? (
        <button
          onClick={() => isEditMode && onOpenFileSelection(workflowIndex, input.nodeId, input.widgetName, input.widgetType)}
          disabled={!isEditMode}
          className={`w-full text-left p-3 bg-white dark:bg-slate-800 border rounded-lg transition-colors ${isEditMode
            ? 'hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
            : 'opacity-50 cursor-not-allowed'
            }`}
        >
          <div className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">
            {staticValue || t('workflowChain.editor.selectFile')}
          </div>
        </button>
      ) : (
        <div className="space-y-2">
          {isEditMode && (
            <div className="flex gap-2">
              <Button
                variant={bindingType === 'static' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleBindingTypeChange('static')}
                disabled={!isEditMode}
              >
                {t('workflowChain.editor.static')}
              </Button>
              <Button
                variant={bindingType === 'dynamic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleBindingTypeChange('dynamic')}
                disabled={!isEditMode}
              >
                {t('workflowChain.editor.dynamic')}
              </Button>
            </div>
          )}

          {bindingType === 'static' ? (
            <button
              onClick={() => isEditMode && onOpenFileSelection(workflowIndex, input.nodeId, input.widgetName, input.widgetType)}
              disabled={!isEditMode}
              className={`w-full text-left p-3 bg-white dark:bg-slate-800 border rounded-lg transition-colors ${isEditMode
                ? 'hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
                }`}
            >
              <div className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">
                {staticValue || 'Click to select file...'}
              </div>
            </button>
          ) : (
            <select
              className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              value={selectedDynamicSource}
              disabled={!isEditMode}
              onChange={(e) => {
                const [sourceIdx, outputNodeId] = e.target.value.split('|');
                if (sourceIdx && outputNodeId) {
                  onUpdateBinding(
                    workflowIndex,
                    input.nodeId,
                    input.widgetName,
                    'dynamic',
                    { sourceWorkflowIndex: parseInt(sourceIdx), outputNodeId }
                  );
                }
              }}
            >
              <option value="">{t('workflowChain.editor.selectSource')}</option>
              {previousWorkflows.map((prevWorkflow, prevIdx) =>
                prevWorkflow.outputs
                  .filter(output => output.outputType === input.widgetType)
                  .map(output => (
                    <option key={`${prevIdx}|${output.nodeId}`} value={`${prevIdx}|${output.nodeId}`}>
                      {t('workflowChain.editor.step', { index: prevIdx + 1 })}: {prevWorkflow.name} - {output.nodeTitle}
                    </option>
                  ))
              )}
            </select>
          )}
        </div>
      )}
    </div>
  );
};

// Workflow Selection Panel Component
interface WorkflowSelectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workflows: Workflow[];
  loading: boolean;
  isConverting: boolean;
  onSelect: (workflow: Workflow) => void;
}

const WorkflowSelectionPanel: React.FC<WorkflowSelectionPanelProps> = ({
  isOpen,
  onClose,
  workflows,
  loading,
  isConverting,
  onSelect
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter workflows based on search query
  const filteredWorkflows = workflows.filter(workflow =>
    workflow.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Side Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex flex-col h-full">
              {/* Panel Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t('workflowChain.editor.selectWorkflow')}
                  </h2>
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={t('workflowChain.editor.searchWorkflows')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Workflow List */}
              <div className="flex-1 overflow-y-auto p-4 relative">
                {loading ? (
                  <div className="text-center py-8 text-slate-500">
                    {t('workflowChain.editor.loading')}
                  </div>
                ) : filteredWorkflows.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    {searchQuery ? t('workflowChain.editor.noWorkflowsFound', { query: searchQuery }) : t('workflowChain.editor.noWorkflowsAvailable')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredWorkflows.map((workflow) => (
                      <button
                        key={workflow.id}
                        onClick={() => onSelect(workflow)}
                        className="w-full p-4 text-left border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                          {workflow.name}
                        </div>
                        {workflow.thumbnail && (
                          <img
                            src={workflow.thumbnail}
                            alt={workflow.name}
                            className="w-full h-32 object-cover rounded mt-2"
                          />
                        )}
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          {workflow.nodeCount} nodes
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Converting Overlay */}
                {isConverting && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                      <div className="text-white font-medium">
                        {t('workflowChain.editor.converting')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Save Chain Modal Component
interface SaveChainModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainName: string;
  chainDescription: string;
  onChainNameChange: (value: string) => void;
  onChainDescriptionChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const SaveChainModal: React.FC<SaveChainModalProps> = ({
  isOpen,
  onClose,
  chainName,
  chainDescription,
  onChainNameChange,
  onChainDescriptionChange,
  onSave,
  isSaving
}) => {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">
                Save Chain
              </h2>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="chain-name">Chain Name *</Label>
                  <Input
                    id="chain-name"
                    value={chainName}
                    onChange={(e) => onChainNameChange(e.target.value)}
                    placeholder="Enter chain name..."
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="chain-description">Description</Label>
                  <Input
                    id="chain-description"
                    value={chainDescription}
                    onChange={(e) => onChainDescriptionChange(e.target.value)}
                    placeholder="Enter description (optional)..."
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1"
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  className="flex-1"
                  disabled={isSaving || !chainName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default WorkflowChainEditor;