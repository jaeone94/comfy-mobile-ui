import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, X } from 'lucide-react';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';

interface QuickActionPanelProps {
  workflow: IComfyWorkflow | null;
  onExecute: () => void;
  onInterrupt: () => void;
  onClearQueue: () => void;
  refreshQueueTrigger?: number; // Optional trigger to force queue reload
}

export function QuickActionPanel({
  workflow,
  onExecute,
  onInterrupt,
  onClearQueue,
  refreshQueueTrigger
}: QuickActionPanelProps) {
  const { t } = useTranslation();
  // Local execution state - ALWAYS FALSE to keep buttons always enabled
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);

  // Queue state management
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  // Load initial queue status on mount and when refresh trigger changes
  useEffect(() => {
    console.log('🔄 [QuickActionPanel] Loading queue status, trigger:', refreshQueueTrigger);
    loadInitialQueueStatus();
  }, [refreshQueueTrigger]);

  // Subscribe to WebSocket status updates for real-time queue tracking
  useEffect(() => {
    const handleStatusUpdate = (event: any) => {
      console.log('📊 [QuickActionPanel] Status update:', event);
      const { data } = event;

      // Parse queue information from status message
      if (data && data.status && typeof data.status.exec_info === 'object' && data.status.exec_info.queue_remaining !== undefined) {
        const totalCount = data.status.exec_info.queue_remaining;
        // WebSocket queue_remaining includes running task, subtract 1 to match API behavior (pending only)
        const pendingOnlyCount = totalCount >= 1 ? totalCount - 1 : 0;
        setQueueCount(pendingOnlyCount);
        console.log('🔢 [QuickActionPanel] Queue count updated via WebSocket:', totalCount, '→ pending only:', pendingOnlyCount);
      }
    };

    const statusListenerId = globalWebSocketService.on('status', handleStatusUpdate);

    return () => {
      globalWebSocketService.offById('status', statusListenerId);
    };
  }, []);

  // Load initial queue status from API
  const loadInitialQueueStatus = async () => {
    setIsLoadingQueue(true);
    try {
      const queueInfo = await ComfyUIService.getQueueStatus();
      console.log('📋 [QuickActionPanel] Queue API response:', queueInfo);
      if (queueInfo && queueInfo.queue_pending) {
        setQueueCount(queueInfo.queue_pending.length);
        console.log('📋 [QuickActionPanel] Initial queue loaded:', queueInfo.queue_pending.length);
      } else {
        console.log('📋 [QuickActionPanel] No queue_pending in response, setting count to 0');
        setQueueCount(0);
      }
    } catch (error) {
      console.warn('⚠️ [QuickActionPanel] Failed to load initial queue status:', error);
      // Don't show error to user, just use 0 as default
      setQueueCount(0);
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleExecuteClick = useCallback(() => {
    onExecute();
  }, [workflow, onExecute]);

  const handleInterruptClick = useCallback(() => {
    onInterrupt();
  }, [onInterrupt]);

  const handleClearQueueClick = useCallback(async () => {
    onClearQueue();

    // Reload queue status after clearing to ensure accuracy
    // Small delay to allow server to process the clear operation
    setTimeout(() => {
      loadInitialQueueStatus();
    }, 500);
  }, [onClearQueue]);

  return (
    <div className="fixed right-6 bottom-3 z-40">
      <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 border border-white/20 dark:border-slate-600/20 p-2 relative">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none rounded-3xl" />
        {/* Button Group - Separated with gaps */}
        <div className="flex items-center gap-2 relative z-10 overflow-visible">
          {/* Execute Workflow Button - ALWAYS ENABLED */}
          <Button
            size="lg"
            variant="outline"
            disabled={false}
            className="h-11 px-5 rounded-xl bg-transparent border transition-all duration-150 font-medium active:translate-y-px border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-300 dark:hover:border-green-700 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 active:text-green-800 dark:active:text-green-200 active:border-green-400 dark:active:border-green-600 shadow-none hover:shadow-sm active:shadow-none active:scale-95"
            onClick={handleExecuteClick}
            title={t('workflow.executeWorkflow')}
          >
            <Play className="w-4 h-4 mr-2" />
            {t('workflow.execute')}
          </Button>

          {/* Interrupt Execution Button */}
          <Button
            size="lg"
            variant="outline"
            disabled={false}
            className="h-11 w-11 rounded-xl bg-transparent border transition-all duration-150 p-0 active:scale-95 active:translate-y-px border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 active:text-orange-800 dark:active:text-orange-200 active:border-orange-400 dark:active:border-orange-600 shadow-none hover:shadow-sm active:shadow-none"
            onClick={handleInterruptClick}
            title={t('workflow.interruptExecution')}
          >
            <Square className="w-4 h-4" />
            {/* {t('workflow.interrupt')} */}
          </Button>

          {/* Clear Queue Button with Badge */}
          <div className="relative">
            <Button
              size="lg"
              variant="outline"
              disabled={false}
              className="h-11 w-11 rounded-xl bg-transparent border transition-all duration-150 p-0 active:scale-95 active:translate-y-px border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 active:text-red-800 dark:active:text-red-200 active:border-red-400 dark:active:border-red-600 shadow-none hover:shadow-sm active:shadow-none"
              onClick={handleClearQueueClick}
              title={t('workflow.clearQueuePending', { count: queueCount })}
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Queue Counter Badge */}
            {queueCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full flex items-center justify-center font-bold bg-red-200 dark:bg-red-600 text-white shadow-sm border-0"
                style={{ fontSize: '13px' }}
              >
                {queueCount > 99 ? '99+' : queueCount}
              </Badge>
            )}

            {/* Loading indicator (small dot) */}
            {isLoadingQueue && (
              <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}