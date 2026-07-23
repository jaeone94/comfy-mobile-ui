import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { useTranslation } from 'react-i18next';
import { useGlobalStore } from '@/ui/store/globalStore';

interface ExecutionProgressState {
  isExecuting: boolean;
  executionPhase: 'idle' | 'preparing' | 'submitted' | 'running' | 'completed';
  currentPromptId: string | null;
  executingNodeId: string | null;
  nodeExecutionProgress: { nodeId: string; progress: number } | null;
  runningNodes: { [nodeId: string]: { value: number; max: number; state: string } };
}

export const WorkflowHeaderProgressBar: React.FC = () => {
  const { t } = useTranslation();
  // Local execution progress state
  const [state, setState] = useState<ExecutionProgressState>({
    isExecuting: false,
    executionPhase: 'idle',
    currentPromptId: null,
    executingNodeId: null,
    nodeExecutionProgress: null,
    runningNodes: {}
  });

  const sessionStack = useGlobalStore(state => state.sessionStack);
  const rootWorkflowGraph = useGlobalStore(state => state.workflow?.graph);

  // Memoize the executing node lookup from the current workflow/graph
  const executingNode = React.useMemo(() => {
    if (!state.executingNodeId) return null;

    // 1. Check current session hierarchy
    for (let i = sessionStack.length - 1; i >= 0; i--) {
      const node = sessionStack[i].graph?._nodes?.find((n: any) => n.id?.toString() === state.executingNodeId);
      if (node) return node;
    }

    // 2. Finally check root graph
    if (rootWorkflowGraph?._nodes) {
      return rootWorkflowGraph._nodes.find((n: any) => n.id?.toString() === state.executingNodeId) || null;
    }

    return null;
  }, [state.executingNodeId, sessionStack, rootWorkflowGraph]);

  // Subscribe to execution events from the GlobalWebSocketService
  useEffect(() => {
    const service = globalWebSocketService;

    // 🎯 Check current execution state from persistent buffer (works for navigation & refresh)
    setTimeout(() => {
      const currentState = service.getCurrentExecutionState();

      console.log(`🎯 [ExecutionProgressBar] Current execution state from buffer:`, currentState);

      if (currentState.isExecuting) {
        setState(prev => ({
          ...prev,
          isExecuting: currentState.isExecuting,
          executionPhase: 'running',
          currentPromptId: currentState.currentPromptId,
          executingNodeId: currentState.executingNodeId,
          nodeExecutionProgress: currentState.nodeExecutionProgress,
          runningNodes: {} // Will be updated by subsequent events
        }));

        console.log(`🎯 [ExecutionProgressBar] Applied execution state from persistent buffer:`, {
          isExecuting: currentState.isExecuting,
          promptId: currentState.currentPromptId?.substring(0, 8),
          nodeId: currentState.executingNodeId,
          progress: currentState.nodeExecutionProgress?.progress
        });
      } else {
        console.log(`🎯 [ExecutionProgressBar] No active execution found in buffer`);
      }
    }, 50); // Small delay to ensure component is fully mounted

    // Event handlers for raw ComfyUI messages
    const handleExecuting = (event: any) => {
      console.log('🚀 [ExecutionProgressBar] Raw executing event:', event);
      const { data } = event;

      if (data.node === null) {
        // Execution completed (ComfyUI sends executing with node=null on completion)
        console.log('🏁 [ExecutionProgressBar] Execution completed');
        setState(prev => ({
          ...prev,
          isExecuting: false,
          executionPhase: 'completed',
          executingNodeId: null,
          nodeExecutionProgress: null,
          currentPromptId: null,
          runningNodes: {}
        }));

        // Reset to idle after delay
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            executionPhase: 'idle'
          }));
        }, 2000);
      } else if (data.node) {
        // Node execution started or continuing
        console.log('🚀 [ExecutionProgressBar] Node execution:', data.node, 'prompt_id:', data.prompt_id || 'not provided');
        setState(prev => ({
          ...prev,
          isExecuting: true,
          executionPhase: 'running',
          currentPromptId: data.prompt_id || prev.currentPromptId, // Use existing prompt_id if not provided
          executingNodeId: data.node.toString(),
          nodeExecutionProgress: null
        }));
      }
    };

    const handleProgress = (event: any) => {
      const { data } = event;
      console.log('📈 [ExecutionProgressBar] Raw progress event:', {
        fullData: data,
        nodeId: data.node,
        value: data.value,
        max: data.max
      });

      if (data.node && data.value !== undefined && data.max !== undefined) {
        const percentage = Math.round((data.value / data.max) * 100);

        setState(prev => ({
          ...prev,
          executingNodeId: data.node.toString(),
          nodeExecutionProgress: {
            nodeId: data.node.toString(),
            progress: percentage
          }
        }));
      }
    };

    const handleExecuted = (event: any) => {
      const { data } = event;
      console.log('✅ [ExecutionProgressBar] Node executed:', data);

      setState(prev => ({
        ...prev,
        executingNodeId: prev.executingNodeId === data.node?.toString() ? null : prev.executingNodeId,
        nodeExecutionProgress: prev.nodeExecutionProgress?.nodeId === data.node?.toString() ? null : prev.nodeExecutionProgress
      }));
    };

    const handleExecutionSuccess = (event: any) => {
      console.log('🏁 [ExecutionProgressBar] Execution success');

      setState(prev => ({
        ...prev,
        isExecuting: false,
        executionPhase: 'completed',
        executingNodeId: null,
        nodeExecutionProgress: null,
        currentPromptId: null,
        runningNodes: {}
      }));

      // Reset to idle after delay
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          executionPhase: 'idle'
        }));
      }, 2000);
    };

    const handleExecutionError = (event: any) => {
      console.log('❌ [ExecutionProgressBar] Execution error');

      setState(prev => ({
        ...prev,
        isExecuting: false,
        executionPhase: 'idle',
        executingNodeId: null,
        nodeExecutionProgress: null,
        currentPromptId: null,
        runningNodes: {}
      }));
    };

    const handleExecutionInterrupted = (event: any) => {
      console.log('⚠️ [ExecutionProgressBar] Execution interrupted');

      setState(prev => ({
        ...prev,
        isExecuting: false,
        executionPhase: 'idle',
        executingNodeId: null,
        nodeExecutionProgress: null,
        currentPromptId: null,
        runningNodes: {}
      }));
    };

    // New handler for progress_state messages
    const handleProgressState = (event: any) => {
      console.log('📊 [ExecutionProgressBar] Progress state event:', event);
      const { data } = event;

      if (data.nodes && data.prompt_id) {
        const nodes = data.nodes;
        const runningNodes: { [nodeId: string]: { value: number; max: number; state: string } } = {};
        let hasRunningNodes = false;
        let currentRunningNodeId: string | null = null;
        let currentNodeProgress: { nodeId: string; progress: number } | null = null;

        // Process all nodes to find running ones
        Object.keys(nodes).forEach(nodeId => {
          const nodeData = nodes[nodeId];
          if (nodeData.state === 'running') {
            hasRunningNodes = true;
            runningNodes[nodeId] = {
              value: nodeData.value || 0,
              max: nodeData.max || 1,
              state: nodeData.state
            };

            // Set the first running node as the current one for display
            if (!currentRunningNodeId) {
              currentRunningNodeId = nodeId;
              const progress = nodeData.max > 0 ? Math.round((nodeData.value / nodeData.max) * 100) : 0;
              currentNodeProgress = {
                nodeId,
                progress
              };
            }
          }
        });

        // Update state based on running nodes
        setState(prev => ({
          ...prev,
          isExecuting: hasRunningNodes,
          executionPhase: hasRunningNodes ? 'running' : prev.executionPhase,
          currentPromptId: data.prompt_id,
          executingNodeId: currentRunningNodeId,
          nodeExecutionProgress: currentNodeProgress,
          runningNodes
        }));

        console.log('📊 [ExecutionProgressBar] Updated state:', {
          hasRunningNodes,
          runningNodeCount: Object.keys(runningNodes).length,
          currentRunningNodeId,
          currentNodeProgress
        });
      }
    };

    // Subscribe to raw ComfyUI events
    const listenerIds = [
      service.on('executing', handleExecuting),
      service.on('progress', handleProgress),
      service.on('executed', handleExecuted),
      service.on('execution_success', handleExecutionSuccess),
      service.on('execution_error', handleExecutionError),
      service.on('execution_interrupted', handleExecutionInterrupted),
      service.on('progress_state', handleProgressState)
    ];

    return () => {
      // Cleanup event listeners using IDs
      service.offById('executing', listenerIds[0]);
      service.offById('progress', listenerIds[1]);
      service.offById('executed', listenerIds[2]);
      service.offById('execution_success', listenerIds[3]);
      service.offById('execution_error', listenerIds[4]);
      service.offById('execution_interrupted', listenerIds[5]);
      service.offById('progress_state', listenerIds[6]);
    };
  }, []); // No dependencies needed

  // Don't render anything if not executing
  if (!state.isExecuting) {
    return null;
  }

  return (
    <div className="relative">
      {/* Compact mono status line */}
      <div className="flex items-center justify-between gap-2 px-3 pb-[5px] font-mono text-[9px] font-medium tracking-[0.12em] uppercase">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse shrink-0" />
          <span className="text-[#7ba3f5] truncate">
            {executingNode?.type || t('execution.starting')}
          </span>
          {state.executingNodeId && (
            <span className="text-[#565d6b] shrink-0">#{state.executingNodeId}</span>
          )}
        </span>
        <span className="text-[#8a919e] shrink-0">
          {state.nodeExecutionProgress ? `${Math.round(state.nodeExecutionProgress.progress)}%` : '0%'}
        </span>
      </div>

      {/* 3px progress bar attached to the header bottom */}
      <div className="h-[3px] w-full bg-white/[0.05] relative overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${state.nodeExecutionProgress?.progress || 0}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full"
          style={{ background: 'linear-gradient(90deg, #3069f0, #5b8af5)', boxShadow: '0 0 8px rgba(48,105,240,0.6)' }}
        />
      </div>
    </div>
  );
};