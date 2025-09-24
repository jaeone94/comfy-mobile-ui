import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Server, AlertCircle, CheckCircle, Loader2, ExternalLink, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';
import { loadAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { toast } from 'sonner';

const WorkflowUpload: React.FC = () => {
  const navigate = useNavigate();
  
  // Use connection store to get actual connection status
  const { url: serverUrl, isConnected, isConnecting, error: connectionError, hasExtension, isCheckingExtension, checkExtension } = useConnectionStore();
  const [localWorkflows, setLocalWorkflows] = useState<IComfyWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideDialog, setOverrideDialog] = useState<{
    isOpen: boolean;
    workflow: IComfyWorkflow | null;
    filename: string;
    errorMessage: string;
  }>({
    isOpen: false,
    workflow: null,
    filename: '',
    errorMessage: ''
  });
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter workflows based on search query
  const filteredWorkflows = localWorkflows.filter(workflow => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (workflow.name || '').toLowerCase();
    return name.includes(query);
  });

  // Load local workflows from IndexedDB
  useEffect(() => {
    loadLocalWorkflows();
  }, []);

  const loadLocalWorkflows = async () => {
    try {
      setIsLoading(true);
      const workflows = await loadAllWorkflows();
      
      console.log('📂 Loaded local workflows for upload:', {
        count: workflows.length,
        workflows: workflows.map(w => ({ id: w.id, name: w.name, hasWorkflowJson: !!w.workflow_json }))
      });
      
      // Filter workflows that have workflow_json (actual ComfyUI workflow data)
      const validWorkflows = workflows.filter(workflow => workflow.workflow_json);
      
      setLocalWorkflows(validWorkflows);
      setError(null);
    } catch (error) {
      const errorMessage = `Failed to load local workflows: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌ Failed to load local workflows:', error);
      setError(errorMessage);
      setLocalWorkflows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadWorkflow = async (workflow: IComfyWorkflow, overwrite: boolean = false) => {
    if (!workflow.workflow_json) {
      toast.error('Upload Failed', {
        description: 'This workflow does not have valid ComfyUI data.',
        duration: 5000,
      });
      return;
    }

    setIsUploading(workflow.id);
    setError(null);

    try {

      // Create filename from workflow name
      const sanitizedName = workflow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedName}.json`;

      // Convert workflow_json to JSON string and create File object
      const workflowJsonString = JSON.stringify(workflow.workflow_json, null, 2);
      const file = new File([workflowJsonString], filename, { type: 'application/json' });

      console.log('📤 Uploading workflow to server:', {
        workflowId: workflow.id,
        name: workflow.name,
        filename,
        workflowJsonSize: workflowJsonString.length,
        hasNodes: !!workflow.workflow_json.nodes,
        nodeCount: workflow.workflow_json.nodes?.length || 0,
        overwrite
      });

      // Upload using ComfyFileService
      const fileService = new ComfyFileService(serverUrl);
      const uploadResult = await fileService.uploadWorkflow(file, filename, overwrite);

      if (uploadResult.success) {
        toast.success(`Successfully uploaded "${workflow.name}"`, {
          description: `Workflow saved to ComfyUI server as ${uploadResult.filename}`,
          duration: 4000,
        });

        console.log('✅ Workflow uploaded successfully:', {
          originalName: workflow.name,
          serverFilename: uploadResult.filename,
          message: uploadResult.message
        });
      } else {
        throw new Error(uploadResult.error || 'Upload failed');
      }

    } catch (error) {
      const errorMessage = `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

      // Check if this is an override error and we haven't asked for confirmation yet
      if (!overwrite && errorMessage.toLowerCase().includes('file already exists') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('overwrite') ||
          errorMessage.toLowerCase().includes('file exists')) {

        // Show override confirmation dialog
        setOverrideDialog({
          isOpen: true,
          workflow,
          filename: `${workflow.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
          errorMessage
        });

        console.log('📋 Showing override confirmation dialog:', {
          workflowId: workflow.id,
          filename: `${workflow.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
          errorMessage
        });
      } else {
        // Show regular error
        setError(errorMessage);
        toast.error('Upload Failed', {
          description: 'Could not upload workflow to server.',
          duration: 5000,
        });

        console.error('❌ Workflow upload error:', {
          workflowId: workflow.id,
          error: errorMessage
        });
      }
    } finally {
      setIsUploading(null);
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

    // Re-upload with overwrite enabled
    await uploadWorkflow(workflow, true);
  };

  const handleOverrideCancel = () => {
    setOverrideDialog({
      isOpen: false,
      workflow: null,
      filename: '',
      errorMessage: ''
    });
  };

  const formatFileSize = (jsonObject: any): string => {
    const jsonString = JSON.stringify(jsonObject);
    const bytes = new Blob([jsonString]).size;
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
              Upload to ComfyUI Server
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Upload your workflows to ComfyUI server
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

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-400" />
              <p className="text-white/70">Loading local workflows...</p>
            </div>
          </div>
        )}

        {/* Local Workflows List */}
        {!isLoading && (
          <div className="space-y-4">
            {/* Search Bar and Count */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search workflows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {searchQuery ? `Found ${filteredWorkflows.length} workflows` : `Local Workflows (${localWorkflows.length})`}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLocalWorkflows}
                  className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </Button>
              </div>
            </div>

            {filteredWorkflows.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-12 text-center">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-white/40" />
                  <p className="text-white/60">
                    {searchQuery ? 'No workflows match your search' : 'No workflows available for upload'}
                  </p>
                  <p className="text-white/40 text-sm mt-2">
                    {searchQuery ? 'Try a different search term' : 'Create some workflows to upload them to ComfyUI server'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredWorkflows.map((workflow, index) => (
                  <motion.div
                    key={workflow.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className={`bg-white/5 border-white/10 hover:bg-white/10 transition-colors ${
                      isUploading === workflow.id ? 'opacity-70 pointer-events-none' : ''
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4 items-center w-full">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-white mb-2 break-all leading-tight">
                              {workflow.name || 'Untitled Workflow'}
                            </h3>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm text-white/60">
                              <span className="whitespace-nowrap">{formatFileSize(workflow.workflow_json)}</span>
                              <span className="truncate">
                                Modified: {formatDate(workflow.modifiedAt || new Date())}
                              </span>
                              <span className="text-xs text-blue-400 whitespace-nowrap">
                                {(workflow.workflow_json && typeof workflow.workflow_json === 'object' && 'nodes' in workflow.workflow_json && Array.isArray(workflow.workflow_json.nodes) ? workflow.workflow_json.nodes.length : 0)} nodes
                              </span>
                            </div>
                          </div>

                          <Button
                            onClick={() => uploadWorkflow(workflow)}
                            disabled={isUploading === workflow.id || !isConnected || !hasExtension}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-70 whitespace-nowrap flex-shrink-0 touch-manipulation min-h-[38px] select-none shadow-sm hover:shadow-md transition-all"
                            style={{ touchAction: 'manipulation' }}
                          >
                            {isUploading === workflow.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload
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
                  File Already Exists
                </h3>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="relative p-4">
              <p className="text-white/90 mb-4">
                A workflow file named <strong className="text-white">{overrideDialog.filename}</strong> already exists on the server.
              </p>
              <p className="text-white/70 text-sm mb-4">
                Do you want to overwrite the existing file?
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
                className="bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md transition-all duration-300"
              >
                Overwrite
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowUpload;