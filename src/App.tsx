import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { toast } from 'sonner';
import WorkflowList from '@/components/workflow/WorkflowList';
import WorkflowEditor from '@/components/workflow/WorkflowEditor';
import ServerSettings from '@/components/server/ServerSettings';
import ServerReboot from '@/components/server/ServerReboot';
import WorkflowImport from '@/components/workflow/WorkflowImport';
import WorkflowUpload from '@/components/workflow/WorkflowUpload';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import ModelDownload from '@/components/models/ModelDownload';
import ModelBrowserPage from '@/components/models/ModelBrowserPage';
import BrowserDataBackup from '@/components/etc/BrowserDataBackup';
import ApiKeyManagement from '@/components/settings/ApiKeyManagement';
import { CustomTypeManager } from '@/components/etc/CustomTypeManager';
import VideoDownloader from '@/components/videos/VideoDownloader';
import WorkflowChainList from '@/components/workflow_chain/WorkflowChainList';
import WorkflowChainEditor from '@/components/workflow_chain/WorkflowChainEditor';
import { Toaster } from '@/components/ui/sonner';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { ExecutionCompleteEvent, ExecutionErrorEvent } from '@/shared/types/comfy/IComfyAPI';
import { ExecutionErrorDisplay } from '@/components/execution/ErrorViewer';
import { autoRecoverIfNeeded } from '@/utils/storageRecovery';
import StorageErrorBoundary from '@/components/error/StorageErrorBoundary';
import { PromptHistory } from '@/components/history/PromptHistory';
import { WorkflowStackPage } from '@/components/workflow/WorkflowStackPage';

const AppRouter: React.FC = () => {
  const tryAutoConnect = useConnectionStore((state) => state.tryAutoConnect);

  // Global execution error state
  const [globalExecutionError, setGlobalExecutionError] = useState<any>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  // Force theme-color to dark on app load
  useEffect(() => {
    const setThemeColor = (color: string) => {
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.getElementsByTagName('head')[0].appendChild(metaThemeColor);
      }
      metaThemeColor.setAttribute('content', color);
    };

    // Set dark theme color immediately
    setThemeColor('#0f172a');

    // Also set for all theme-color variants
    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    themeColorMetas.forEach(meta => {
      meta.setAttribute('content', '#0f172a');
    });
  }, []);

  useEffect(() => {
    // Attempt auto-connection when app loads (without forced redirects)
    const initializeConnection = async () => {
      try {
        // First, check if we need to recover from storage corruption
        setIsRecovering(true);
        const recoveryPerformed = await autoRecoverIfNeeded();
        setIsRecovering(false);

        if (recoveryPerformed) {
          // If recovery was performed, show additional info toast
          toast.info('✨ App will refresh automatically', {
            description: 'The app will reload once recovery is complete.',
            duration: 2000
          });

          // Give user time to see the message, then refresh
          setTimeout(() => {
            window.location.reload();
          }, 2500);
          return;
        }

        // Proceed with normal initialization if no recovery was needed
        await tryAutoConnect();
      } catch (error) {
        console.error('Failed to initialize connection:', error);
        setIsRecovering(false);

        // If initialization fails completely, show helpful message
        toast.error('Error occurred during app initialization', {
          description: 'Please refresh the page or clear your browser data.',
          duration: 8000,
          action: {
            label: 'Refresh',
            onClick: () => window.location.reload()
          }
        });
      }
    };

    // Small delay to ensure store is hydrated from localStorage
    const timer = setTimeout(initializeConnection, 100);

    return () => clearTimeout(timer);
  }, [tryAutoConnect]); // Remove navigation dependencies to prevent redirects

  useEffect(() => {
    // Global execution completion toast notifications
    const handleExecutionComplete = (event: ExecutionCompleteEvent) => {
      const { success, completionReason, promptId } = event;
      const shortPromptId = promptId.substring(0, 8);

      if (success && (completionReason === 'success' || completionReason === 'executing_null')) {
        // Normal successful completion
        toast.success(`Prompt ${shortPromptId} completed successfully!`, {
          duration: 4000,
        });
      } else if (completionReason === 'interrupted') {
        // Execution was interrupted by user
        toast.info(`Prompt ${shortPromptId} was interrupted.`, {
          duration: 4000,
        });
      } else if (!success || completionReason === 'error') {
        // Execution failed or encountered an error
        toast.error(`Prompt ${shortPromptId} execution failed.`, {
          duration: 5000,
        });
      }
    };

    // Handle execution errors globally - ALWAYS show raw server response
    const handleExecutionError = (event: ExecutionErrorEvent) => {
      console.error('🚨 GLOBAL EXECUTION ERROR:', event);

      // Create a comprehensive error object with ALL available information
      const errorData = {
        timestamp: new Date().toISOString(),
        promptId: event.promptId,
        rawServerResponse: event.error,
        // Include the complete server response without any parsing
        completeErrorData: event,
        nodeId: (event.error as any)?.node_id || 'unknown',
        error: {
          type: 'Execution Error',
          message: `Server returned an error during workflow execution`,
          details: JSON.stringify(event, null, 2), // Show EVERYTHING from server
          extra_info: {
            serverResponse: event.error,
            fullEvent: event,
            noParsingApplied: true
          }
        }
      };

      setGlobalExecutionError(errorData);
      console.log('🚨 Raw error set for display:', errorData);
    };

    // Subscribe to execution completion and error events using GlobalWebSocketService
    const listenerIds = [
      globalWebSocketService.on('execution_complete', handleExecutionComplete),
      globalWebSocketService.on('execution_error', handleExecutionError)
    ];

    return () => {
      // Clean up the event listeners using IDs
      globalWebSocketService.offById('execution_complete', listenerIds[0]);
      globalWebSocketService.offById('execution_error', listenerIds[1]);
    };
  }, []);

  // Show recovery screen if app is recovering
  if (isRecovering) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">🔧 Recovering Storage...</h2>
            <p className="text-gray-300">Safely preserving your workflow data while recovering the app.</p>
            <p className="text-sm text-gray-400">Please wait a moment.</p>
          </div>
        </div>
        <Toaster
          position="bottom-center"
          duration={3000}
          richColors
          closeButton={false}
        />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<WorkflowList />} />
        <Route path="/workflow/:id" element={<WorkflowEditor />} />
        <Route path="/workflow-stack/:id" element={<WorkflowStackPage />} />
        <Route path="/chains" element={<WorkflowChainList />} />
        <Route path="/chains/create" element={<WorkflowChainEditor />} />
        <Route path="/chains/edit/:id" element={<WorkflowChainEditor />} />
        <Route path="/settings/server" element={<ServerSettings />} />
        <Route path="/reboot" element={<ServerReboot />} />
        <Route path="/import/server" element={<WorkflowImport />} />
        <Route path="/upload/server" element={<WorkflowUpload />} />
        <Route path="/outputs" element={<OutputsGallery />} />
        <Route path="/models/download" element={<ModelDownload />} />
        <Route path="/models/browser" element={<ModelBrowserPage />} />
        <Route path="/browser-data-backup" element={<BrowserDataBackup />} />
        <Route path="/settings/api-keys" element={<ApiKeyManagement />} />
        <Route path="/settings/widget-types" element={<CustomTypeManager />} />
        <Route path="/videos/download" element={<VideoDownloader />} />
      </Routes>
      <Toaster
        position="bottom-center"
        duration={3000}
        richColors
        closeButton={false}
      />

      {/* Global Execution Error Display - Shows on ANY screen */}
      {globalExecutionError && (
        <ExecutionErrorDisplay
          errors={[globalExecutionError]}
          promptId={globalExecutionError.promptId}
          onClearErrors={() => {
            console.log('🧹 Clearing global execution error');
            setGlobalExecutionError(null);
          }}
          onRetry={() => {
            console.log('🔄 Global error retry requested');
            setGlobalExecutionError(null);
            toast.info('Please retry your workflow execution');
          }}
        />
      )}

      {/* Global Prompt History Modal - Top-level component */}
      <PromptHistory />
    </>
  );
};

export default function App() {
  // Apply dark mode class to document element
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <StorageErrorBoundary>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </StorageErrorBoundary>
  );
}