import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Server, AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WorkflowService } from '@/core/services/WorkflowManagementService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';

interface ServerWorkflowInfo {
  id: string;
  name: string;
  description?: string;
  author?: string;
  createdAt?: Date;
  filename?: string;
  size?: number;
  modified?: Date;
}
import { addWorkflow, loadAllWorkflows, getStorageQuotaInfo } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { formatStorageSize } from '@/infrastructure/storage/WorkflowStorageService';
import { WorkflowFileService } from '@/core/services/WorkflowFileService';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { toast } from 'sonner';


const WorkflowImport: React.FC = () => {
  const navigate = useNavigate();
  
  // Use connection store to get actual connection status
  const { url: serverUrl, isConnected, isConnecting, error: connectionError, hasExtension, isCheckingExtension, checkExtension } = useConnectionStore();
  const [serverWorkflows, setServerWorkflows] = useState<ServerWorkflowInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideDialog, setOverrideDialog] = useState<{
    isOpen: boolean;
    workflow: ServerWorkflowInfo | null;
    filename: string;
    errorMessage: string;
  }>({
    isOpen: false,
    workflow: null,
    filename: '',
    errorMessage: ''
  });

  // Load workflows when server requirements are met
  useEffect(() => {
    if (isConnected && hasExtension) {
      loadServerWorkflows();
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [isConnected, hasExtension]);


  const loadServerWorkflows = async () => {
    try {
      
      if (!serverUrl || !isConnected) {
        console.warn('❌ Cannot load workflows: no server URL or not connected');
        return;
      }
      
      const fileService = new ComfyFileService(serverUrl);
      const result = await fileService.listWorkflows();
      
      
      if (result.success && result.workflows) {
        // Map API response to ServerWorkflowInfo interface
        const mappedWorkflows: ServerWorkflowInfo[] = result.workflows.map(workflow => ({
          id: workflow.filename.replace('.json', ''),
          name: workflow.filename.replace('.json', ''),
          filename: workflow.filename,
          size: workflow.size || 0,
          modified: workflow.modified ? new Date(workflow.modified * 1000) : new Date()
        }));
        
        setServerWorkflows(mappedWorkflows);
        setError(null);
      } else {
        const errorMessage = result.error || 'Failed to load workflows from server';
        console.error('❌ Failed to load workflows:', errorMessage);
        setError(errorMessage);
        setServerWorkflows([]);
      }
    } catch (error) {
      const errorMessage = `Failed to load workflows: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌ Exception loading workflows:', error);
      setError(errorMessage);
      setServerWorkflows([]);
    }
  };

  const generateUniqueFilename = (baseName: string, existingNames: string[]): string => {
    let counter = 1;
    let newName = baseName;
    
    // Remove .json extension if present
    const nameWithoutExt = baseName.replace(/\.json$/i, '');
    
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${nameWithoutExt}_${counter}`;
    }
    
    return newName;
  };

  const importWorkflow = async (serverWorkflow: ServerWorkflowInfo, overwrite: boolean = false) => {
    setIsImporting(serverWorkflow.filename || 'unknown');
    setError(null);

    try {
      // Check storage quota before importing
      const storageInfo = await getStorageQuotaInfo();
      if (!storageInfo.canAddWorkflow) {
        throw new Error(
          `Storage quota exceeded (${Math.round(storageInfo.usage)}% used). ` +
          `Please delete some workflows to free up space. ` +
          `Current usage: ${formatStorageSize(storageInfo.used)}`
        );
      }
      // Download workflow content using the actual API
      const fileService = new ComfyFileService(serverUrl);
      const downloadResult = await fileService.downloadWorkflow(serverWorkflow.filename || serverWorkflow.id);
      
      
      if (!downloadResult.success || !downloadResult.content) {
        throw new Error(downloadResult.error || 'Failed to download workflow content');
      }

      // Get existing workflow names to avoid duplicates
      const existingWorkflows = await loadAllWorkflows();
      const existingNames = existingWorkflows.map((w: any) => w.name);
      
      console.log('🔍 Import Debug - Existing workflows:', {
        count: existingWorkflows.length,
        existingNames: existingNames,
        serverFilename: serverWorkflow.filename
      });
      
      // Generate unique name
      const baseName = serverWorkflow.filename?.replace(/\.json$/i, '') || 'untitled';
      const uniqueName = generateUniqueFilename(baseName, existingNames);
      
      console.log('🔍 Import Debug - Name generation:', {
        baseName,
        uniqueName,
        wasRenamed: baseName !== uniqueName
      });
      
      // Debug server workflow content structure
      console.log('🔍 Server workflow content structure:', {
        hasLastNodeId: !!downloadResult.content?.last_node_id,
        hasLastLinkId: !!downloadResult.content?.last_link_id,
        hasNodes: !!downloadResult.content?.nodes,
        nodeCount: downloadResult.content?.nodes?.length || 0,
        keys: Object.keys(downloadResult.content || {}),
        content: downloadResult.content
      });
      
      // Process workflow with proper validation and normalization
      const jsonString = JSON.stringify(downloadResult.content);
      
      const processResult = await WorkflowFileService.processWorkflowFile(new File([jsonString], `${uniqueName}.json`, { type: 'application/json' }));
      
      if (!processResult.success || !processResult.workflow) {
        throw new Error(processResult.error || 'Failed to process downloaded workflow');
      }
      
      // Debug processed workflow structure  
      console.log('🔍 Processed workflow structure:', {
        hasLastNodeId: !!processResult.workflow.workflow_json?.last_node_id,
        hasLastLinkId: !!processResult.workflow.workflow_json?.last_link_id,
        hasNodes: !!processResult.workflow.workflow_json?.nodes,
        nodeCount: processResult.workflow.workflow_json?.nodes?.length || 0,
        workflowKeys: Object.keys(processResult.workflow.workflow_json || {})
      });
      
      // Update workflow item with server-specific metadata
      const comfyMobileWorkflow: IComfyWorkflow = {
        ...processResult.workflow,
        id: `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description: `Imported from ComfyUI server`,
        modifiedAt: serverWorkflow.modified ? new Date(serverWorkflow.modified.getTime()) : new Date(),
        author: 'server', // Mark as server import
        tags: ['server-import', ...(processResult.workflow.tags || [])]
      };

      console.log('🔍 Import Debug - Final workflow before saving:', {
        id: comfyMobileWorkflow.id,
        name: comfyMobileWorkflow.name,
        uniqueName: uniqueName,
        description: comfyMobileWorkflow.description
      });
      
      // Save to IndexedDB
      await addWorkflow(comfyMobileWorkflow);
      
      // Verify the save worked
      const savedWorkflows = await loadAllWorkflows();
      console.log('🔍 Import Debug - After save verification:', {
        totalWorkflows: savedWorkflows.length,
        justSavedFound: savedWorkflows.find(w => w.id === comfyMobileWorkflow.id) ? true : false,
        recentWorkflowNames: savedWorkflows.slice(0, 3).map(w => w.name)
      });
      
      // Show success toast
      toast.success(`Successfully imported "${uniqueName}"`, {
        description: `Workflow saved to your local collection`,
        duration: 4000,
      });
      
      // Reload the workflow list to show updated state
      await loadServerWorkflows();
      
    } catch (error) {
      const errorMessage = `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

      // Check if this is a duplicate name error and we haven't asked for confirmation yet
      if (!overwrite && (errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.toLowerCase().includes('name conflict'))) {

        // Show override confirmation dialog
        setOverrideDialog({
          isOpen: true,
          workflow: serverWorkflow,
          filename: serverWorkflow.filename || 'unknown',
          errorMessage
        });

        console.log('📋 Showing override confirmation dialog for import:', {
          workflowId: serverWorkflow.id,
          filename: serverWorkflow.filename,
          errorMessage
        });
      } else {
        // Show regular error
        setError(errorMessage);
        toast.error('Import Failed', {
          description: 'Could not import workflow from server.',
          duration: 5000,
        });
      }
    } finally {
      setIsImporting(null);
    }
  };

  const handleOverrideConfirm = async () => {
    const { workflow } = overrideDialog;
    if (!workflow) return;

    // Close dialog first
    setOverrideDialog({
      isOpen: false,
      workflow: null,
      filename: '',
      errorMessage: ''
    });

    // Re-import with overwrite enabled
    await importWorkflow(workflow, true);
  };

  const handleOverrideCancel = () => {
    setOverrideDialog({
      isOpen: false,
      workflow: null,
      filename: '',
      errorMessage: ''
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    // Check if timestamp is in seconds (less than year 2100) or milliseconds
    const date = new Date(timestamp < 4000000000 ? timestamp * 1000 : timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
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
          bottom: 0
        }}
      >
        {/* Main Background with Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
        
        {/* Main Scrollable Content Area */}
        <div 
          className="absolute top-0 left-0 right-0 bottom-0"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="container mx-auto px-4 py-6 max-w-4xl">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-400" />
                <p className="text-white/70">Checking server requirements...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        bottom: 0
      }}
    >
      {/* Main Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      
      {/* Glassmorphism Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
      
      {/* Main Scrollable Content Area */}
      <div 
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch'
        }}
      >
      {/* Header */}
      <header className="sticky top-0 z-50 pwa-header bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
        <div className="relative z-10 p-4">
          <div className="flex items-center space-x-4">
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Back button onClick triggered');
              sessionStorage.setItem('app-navigation', 'true');
              navigate('/', { replace: true });
            }}
            onTouchStart={(e) => {
              console.log('Back button onTouchStart');
            }}
            onTouchEnd={(e) => {
              console.log('Back button onTouchEnd');
              // Don't preventDefault here - it blocks click events!
              sessionStorage.setItem('app-navigation', 'true');
              navigate('/', { replace: true });
            }}
            variant="default"
            size="sm"
            className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
            style={{ touchAction: 'manipulation' }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Import from ComfyUI Server
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Download workflows from your ComfyUI server
            </p>
          </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-6 py-8 max-w-4xl">

        {/* Server Requirements Check */}
        {(isCheckingExtension || !isConnected || !hasExtension) && (
          <Card className="mb-6 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Server className="h-5 w-5" />
                Server Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCheckingExtension ? (
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  <span className="text-white/70">
                    Checking server connection and API extension...
                  </span>
                </div>
              ) : (
                <>
                  {/* Server Connection Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Server Connection</span>
                    <div className="flex items-center gap-2">
                      {isConnected ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-400" />
                          <Badge variant="outline" className="text-green-400 border-green-400/30">
                            Connected
                          </Badge>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-red-400" />
                          <Badge variant="outline" className="text-red-400 border-red-400/30">
                            Disconnected
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Extension Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Mobile API Extension</span>
                    <div className="flex items-center gap-2">
                      {hasExtension ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-400" />
                          <Badge variant="outline" className="text-green-400 border-green-400/30">
                            Available
                          </Badge>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-red-400" />
                          <Badge variant="outline" className="text-red-400 border-red-400/30">
                            Not Found
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Errors */}
                  {(!isConnected || !hasExtension) && (
                    <div className="space-y-2">
                      {!serverUrl && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <span className="text-red-200 text-sm">
                            No server URL configured. Please configure server URL in Settings.
                          </span>
                        </div>
                      )}
                      {!isConnected && serverUrl && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <span className="text-red-200 text-sm">
                            {connectionError ? `Server connection failed: ${connectionError}` : 'Server is not connected. Please check server connection in Settings.'}
                          </span>
                        </div>
                      )}
                      {isConnected && !hasExtension && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <span className="text-red-200 text-sm">
                            Mobile API Extension not found. Please install comfy-mobile-ui-api-extension.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t border-white/10">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkExtension}
                      disabled={isLoading}
                      className="text-white/70 border-white/20 hover:bg-white/10 active:bg-white/20 touch-manipulation min-h-[44px] select-none"
                      style={{ touchAction: 'manipulation' }}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      )}
                      Recheck
                    </Button>
                    
                    {!isConnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          sessionStorage.setItem('app-navigation', 'true');
                          navigate('/settings/server');
                        }}
                        className="text-white/70 border-white/20 hover:bg-white/10 active:bg-white/20 touch-manipulation min-h-[44px] select-none"
                        style={{ touchAction: 'manipulation' }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Server Settings
                      </Button>
                    )}
                    {!hasExtension && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://github.com/jaeone94/comfy-mobile-ui', '_blank')}
                        className="text-white/70 border-white/20 hover:bg-white/10 active:bg-white/20 touch-manipulation min-h-[44px] select-none"
                        style={{ touchAction: 'manipulation' }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Get Extension
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-200 text-sm">
              {error}
            </span>
          </div>
        )}

        {/* Server Workflows List */}
        {isConnected && hasExtension && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Server Workflows ({serverWorkflows.length})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={loadServerWorkflows}
                className="text-white/70 border-white/20 hover:bg-white/10 active:bg-white/20 touch-manipulation min-h-[44px] select-none"
                style={{ touchAction: 'manipulation' }}
              >
                Refresh
              </Button>
            </div>

            {serverWorkflows.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-12 text-center">
                  <Server className="h-12 w-12 mx-auto mb-4 text-white/40" />
                  <p className="text-white/60">No workflows found on server</p>
                  <p className="text-white/40 text-sm mt-2">
                    Save some workflows in ComfyUI to see them here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {serverWorkflows.map((workflow, index) => (
                  <motion.div
                    key={workflow.filename}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className={`bg-white/5 border-white/10 hover:bg-white/10 transition-colors ${
                      isImporting === workflow.filename ? 'opacity-70 pointer-events-none' : ''
                    }`}>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-start w-full">
                          <div className="min-w-0 overflow-hidden">
                            <h3 className="font-medium text-white mb-1 text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
                              {workflow.filename?.replace(/\.json$/i, '') || 'Untitled'}
                            </h3>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-white/60">
                              <span className="whitespace-nowrap">{formatFileSize(workflow.size || 0)}</span>
                              <span className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[180px] sm:max-w-[250px]">
                                Modified: {formatDate(workflow.modified?.getTime() || Date.now())}
                              </span>
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => importWorkflow(workflow)}
                            onTouchEnd={(e) => {
                              // Handle touch end for better mobile responsiveness
                              if (!isImporting) {
                                importWorkflow(workflow);
                              }
                            }}
                            disabled={isImporting === workflow.filename}
                            className="bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white disabled:opacity-70 whitespace-nowrap w-auto touch-manipulation min-h-[44px] select-none"
                            style={{ touchAction: 'manipulation' }}
                          >
                            {isImporting === workflow.filename ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-2" />
                                Import
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Override Confirmation Dialog */}
      {overrideDialog.isOpen && (
        <div className="fixed inset-0 pwa-modal z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative max-w-md w-full bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 flex flex-col overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

            {/* Dialog Header */}
            <div className="relative flex items-center justify-between p-4 border-b border-white/10 dark:border-slate-600/10 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-yellow-500/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-yellow-400/30">
                  <AlertCircle className="w-4 h-4 text-yellow-300" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Workflow Already Exists
                </h3>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="relative p-4">
              <p className="text-white/90 mb-4">
                A workflow named <strong className="text-white">{overrideDialog.filename}</strong> already exists in your local collection.
              </p>
              <p className="text-white/70 text-sm mb-4">
                Do you want to import anyway and create a renamed copy?
              </p>
            </div>

            {/* Dialog Footer */}
            <div className="relative flex justify-end gap-2 p-4 border-t border-white/10 dark:border-slate-600/10 flex-shrink-0">
              <Button
                onClick={handleOverrideCancel}
                variant="outline"
                className="bg-white/10 backdrop-blur-sm text-white/90 border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleOverrideConfirm}
                className="bg-purple-500/80 backdrop-blur-sm hover:bg-purple-500/90 text-white border border-purple-400/30 hover:border-purple-400/50 transition-all duration-300"
              >
                Import Anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowImport;