import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, X, Image, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';
import { useLatentPreviewStore } from '@/ui/store/latentPreviewStore';
import { LatentPreviewFullScreen } from '../execution/LatentPreviewFullScreen';

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
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);

  const { isVisible, setVisible, imageUrl, nodeId, isLatentPreviewFullscreen, setLatentPreviewFullscreen } = useLatentPreviewStore();

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
    <div className="fixed right-3.5 bottom-4 z-40">
      <div
        className="rounded-[14px] border border-white/[0.09] p-1.5 relative"
        style={{ background: 'rgba(15,17,22,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
      >
        {/* Button Group */}
        <div className="flex items-center gap-1.5 relative z-10">
          <AnimatePresence>
            {imageUrl && (
              <motion.div
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.8 }}
                className="flex items-center gap-1.5"
              >
                <div className="relative">
                  {/* Floating Preview (Bubble) */}
                  <AnimatePresence>
                    {isVisible && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
                        exit={{ opacity: 0, y: 10, scale: 0.9, x: '-50%' }}
                        className="absolute bottom-full left-1/2 mb-4"
                        onClick={() => setLatentPreviewFullscreen(true)}
                      >
                        <div
                          className="rounded-[14px] border border-white/[0.12] overflow-hidden cursor-pointer group relative"
                          style={{ width: '104px', height: '104px', background: '#14171e', boxShadow: '0 16px 40px rgba(0,0,0,0.55)' }}
                        >
                          <img
                            src={imageUrl}
                            alt={t('latentPreview.title')}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="text-white w-5 h-5" />
                          </div>
                          {nodeId && nodeId !== 'unknown' && (
                            <div className="absolute top-1.5 left-1.5 z-20">
                              <div
                                className="px-1.5 py-[3px] rounded-full border border-white/[0.12]"
                                style={{ background: 'rgba(10,14,22,0.7)' }}
                              >
                                <span className="font-mono text-[8.5px] font-bold text-[#cfe0ff]">
                                  {t('latentPreview.fullScreen.node', { id: nodeId })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    className={`w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all duration-150 active:scale-95 ${isVisible ? '' : 'border-white/[0.08] text-[#9aa3b2] hover:text-[#c8ccd4]'}`}
                    style={isVisible
                      ? { background: 'rgba(139,92,246,0.14)', borderColor: 'rgba(139,92,246,0.35)', color: '#a78bfa' }
                      : { background: 'rgba(255,255,255,0.05)' }}
                    onClick={() => setVisible(!isVisible)}
                    title="Toggle Latent Preview"
                  >
                    <div className="relative">
                      <Image className="w-[15px] h-[15px]" strokeWidth={1.8} />
                      {!isVisible && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a78bfa] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#8b5cf6]"></span>
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                <div className="w-px h-[22px] bg-white/[0.08]" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Execute Workflow Button - ALWAYS ENABLED */}
          <button
            className="h-10 px-4 rounded-[10px] border flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-all duration-150 active:scale-95"
            style={{ background: 'rgba(52,199,123,0.13)', borderColor: 'rgba(52,199,123,0.3)', color: '#4ade80' }}
            onClick={handleExecuteClick}
            title={t('workflow.executeWorkflow')}
          >
            <Play className="w-[13px] h-[13px] fill-current" strokeWidth={0} />
            {t('workflow.execute')}
          </button>

          {/* Interrupt Execution Button */}
          <button
            className="w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all duration-150 active:scale-95"
            style={{ background: 'rgba(255,163,72,0.09)', borderColor: 'rgba(255,163,72,0.28)' }}
            onClick={handleInterruptClick}
            title={t('workflow.interruptExecution')}
          >
            <Square className="w-3 h-3 fill-[#ffa348] text-[#ffa348]" strokeWidth={0} />
          </button>

          {/* Clear Queue Button with Badge */}
          <div className="relative">
            <button
              className="w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all duration-150 active:scale-95"
              style={{ background: 'rgba(242,85,85,0.09)', borderColor: 'rgba(242,85,85,0.28)' }}
              onClick={handleClearQueueClick}
              title={t('workflow.clearQueuePending', { count: queueCount })}
            >
              <X className="w-3.5 h-3.5 text-[#f25555]" strokeWidth={2} />
            </button>

            {/* Queue Counter Badge */}
            {queueCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f25555] flex items-center justify-center font-mono text-[10px] font-bold text-white">
                {queueCount > 99 ? '99+' : queueCount}
              </span>
            )}

            {/* Loading indicator (small dot) */}
            {isLoadingQueue && (
              <div className="absolute -top-1 -right-1 h-2 w-2 bg-[#3069f0] rounded-full animate-pulse"></div>
            )}
          </div>
        </div>
      </div>

      <LatentPreviewFullScreen
        isOpen={isLatentPreviewFullscreen}
        onClose={() => setLatentPreviewFullscreen(false)}
      />
    </div>
  );
}