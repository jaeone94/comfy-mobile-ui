import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Server, AlertCircle, CheckCircle, Loader2, ExternalLink, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      const errorMessage = error instanceof Error ? error.message : t('workflow.upload.loadLocalFailed');
      console.error('❌ Failed to load local workflows:', error);
      setError(errorMessage);
      setLocalWorkflows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadWorkflow = async (workflow: IComfyWorkflow, overwrite: boolean = false) => {
    if (!workflow.workflow_json) {
      toast.error(t('workflow.upload.failedTitle'), {
        description: t('workflow.upload.invalidData'),
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
        toast.success(t('workflow.upload.success', { name: workflow.name }), {
          description: t('workflow.upload.savedOnServer', { filename: uploadResult.filename }),
          duration: 4000,
        });

        console.log('✅ Workflow uploaded successfully:', {
          originalName: workflow.name,
          serverFilename: uploadResult.filename,
          message: uploadResult.message
        });
      } else {
        throw new Error(uploadResult.error || t('workflow.upload.failedDesc'));
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
        toast.error(t('workflow.upload.failedTitle'), {
          description: t('workflow.upload.failedDesc'),
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
        bottom: 0,
        touchAction: 'none'
      }}
    >
      {/* Main Background with Dark Theme */}
      <div className="absolute inset-0 bg-[#0b0c0f]" />

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
        {/* Header */}
        <header className="sticky top-0 z-50 pwa-header bg-[#0b0c0f]/95 backdrop-blur-xl border-b border-white/[0.08] relative overflow-hidden">
          <div className="relative z-10 p-4">
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => {
                  sessionStorage.setItem('app-navigation', 'true');
                  navigate('/', { replace: true });
                }}
                variant="ghost"
                size="sm"
                className="bg-white/[0.045] border border-white/[0.08] hover:bg-white/[0.08] transition-all h-9 w-9 p-0 flex-shrink-0 rounded-[10px] text-[#c8ccd4]"
                style={{ touchAction: 'manipulation' }}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-[15px] font-bold text-[#e9ebef] leading-none">
                  {t('workflow.upload.title')}
                </h1>
                <p className="font-mono text-[9px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-1">
                  {t('workflow.upload.subtitle')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="container mx-auto px-4 py-5 max-w-4xl">

          {/* Server Requirements Check */}
          {(isCheckingExtension || !isConnected || !hasExtension) && (
            <Card className="mb-3 border border-white/[0.08] bg-white/[0.025] shadow-none">
              <CardHeader>
                <CardTitle className="text-white/90 flex items-center gap-2">
                  <Server className="h-4 w-4 text-[#5b8af5]" />
                  {t('common.serverRequirements')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {isCheckingExtension ? (
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-4 w-4 animate-spin text-[#5b8af5]" />
                    <span className="text-white/70">
                      {t('common.checkingServer')}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Server Connection Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 font-medium">{t('common.serverConnection')}</span>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('common.connected')}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {t('common.notConnected')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Extension Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 font-medium">{t('common.extension')}</span>
                      <div className="flex items-center gap-2">
                        {hasExtension ? (
                          <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('common.available')}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {t('common.notFound')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Errors */}
                    {(!isConnected || !hasExtension) && (
                      <div className="space-y-2">
                        {!serverUrl && (
                          <div className="p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
                            <span className="text-[#f87c7c] text-[12px]">
                              {t('workflow.import.noServerUrl')}
                            </span>
                          </div>
                        )}
                        {!isConnected && serverUrl && (
                          <div className="p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
                            <span className="text-[#f87c7c] text-[12px]">
                              {t('workflow.import.notConnected')}
                            </span>
                          </div>
                        )}
                        {isConnected && !hasExtension && (
                          <div className="p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
                            <span className="text-[#f87c7c] text-[12px]">
                              {t('workflow.import.extensionNotFound')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2 border-t border-white/5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={checkExtension}
                        disabled={isLoading}
                        className="text-white border-white/10 hover:bg-white/10 active:bg-white/20 bg-white/5"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        {t('workflow.import.recheck')}
                      </Button>

                      {!isConnected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            sessionStorage.setItem('app-navigation', 'true');
                            navigate('/settings/server');
                          }}
                          className="text-white border-white/10 hover:bg-white/10 active:bg-white/20 bg-white/5"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {t('common.serverSettings')}
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
            <div className="mb-3 p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
              <span className="text-[#f87c7c] text-[12px]">
                {error}
              </span>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="text-center">
                <Loader2 className="h-10 w-12 animate-spin mx-auto mb-4 text-[#5b8af5]" />
                <p className="text-white/70">{t('workflow.upload.loadingLocal')}</p>
              </div>
            </div>
          )}

          {/* Local Workflows List */}
          {!isLoading && (
            <div className="space-y-2.5">
              {/* Search Bar and Count */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    placeholder={t('common.searchWorkflows')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-9 bg-white/[0.045] border border-white/[0.08] rounded-[10px] text-[#e9ebef] placeholder:text-[#71798a] focus:outline-none focus:border-[#3069f0]/50 transition-all text-[12.5px] h-[42px]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 px-0.5">
                  <h2 className="font-mono text-[10px] font-semibold text-[#565d6b] tracking-[0.14em] uppercase whitespace-nowrap">
                    {searchQuery ? t('workflow.upload.foundCount', { count: filteredWorkflows.length }) : t('workflow.upload.localWorkflows', { count: localWorkflows.length })}
                  </h2>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadLocalWorkflows}
                    className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('common.refresh')}
                  </Button>
                </div>
              </div>

              {filteredWorkflows.length === 0 ? (
                <Card className="bg-black/20 border-white/5">
                  <CardContent className="py-12 text-center">
                    <Upload className="h-10 w-12 mx-auto mb-4 text-white/20" />
                    <p className="text-white/60">
                      {searchQuery ? t('workflow.upload.noResultsQuery') : t('workflow.upload.noWorkflowsAvailable')}
                    </p>
                    <p className="text-white/30 text-[12px] mt-2">
                      {searchQuery ? t('workflow.upload.tryDifferent') : t('workflow.upload.createFirst')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                  {filteredWorkflows.map((workflow, index) => (
                    <div
                      key={workflow.id}
                      className="min-w-0 transition-all duration-300 ease-in-out"
                    >
                      <Card className={`border border-white/5 bg-white/[0.025] hover:bg-white/5 transition-all group ${isUploading === workflow.id ? 'opacity-70 pointer-events-none' : ''
                        }`}>
                        <CardContent className="px-3 py-3">
                          <div className="flex gap-3 items-center w-full">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[13px] font-semibold text-[#e9ebef] leading-[1.35] line-clamp-1 break-all">
                                {workflow.name || t('workflow.newWorkflowName')}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-[#565d6b] whitespace-nowrap">
                                <span>{formatDate(workflow.modifiedAt || new Date())}</span>
                                <span className="text-[#31363f]">·</span>
                                <span>{formatFileSize(workflow.workflow_json)}</span>
                                <span className="text-[#31363f]">·</span>
                                <span className="text-[#5b8af5]">{(workflow.workflow_json && typeof workflow.workflow_json === 'object' && 'nodes' in workflow.workflow_json && Array.isArray(workflow.workflow_json.nodes) ? workflow.workflow_json.nodes.length : 0)}N</span>
                              </div>
                            </div>

                            <button
                              onClick={() => uploadWorkflow(workflow)}
                              disabled={isUploading === workflow.id || !isConnected || !hasExtension}
                              className="h-8 px-[13px] flex items-center gap-1.5 rounded-lg border text-[11.5px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors disabled:opacity-60"
                              style={{ background: 'rgba(61,123,253,0.12)', borderColor: 'rgba(61,123,253,0.3)', color: '#7ba3f5', touchAction: 'manipulation' }}
                            >
                              {isUploading === workflow.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="h-3 w-3" strokeWidth={1.9} />
                              )}
                              {t('menu.upload')}
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
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
          <div className="relative max-w-[320px] w-full bg-[#101217] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-transparent pointer-events-none" />

            {/* Dialog Header */}
            <div className="relative flex items-center justify-between p-4 border-b border-white/10 dark:border-white/[0.1]/10 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-yellow-500/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-yellow-400/30">
                  <AlertCircle className="w-4 h-4 text-yellow-300" />
                </div>
                <h3 className="text-[14px] font-semibold text-white">
                  {t('workflow.upload.existsTitle')}
                </h3>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="relative p-4">
              <p className="text-white/90 mb-4">
                {t('workflow.upload.existsDesc', { name: overrideDialog.filename })}
              </p>
              <p className="text-white/70 text-[12px] mb-4">
                {t('workflow.upload.existsPrompt')}
              </p>
            </div>

            {/* Dialog Footer */}
            <div className="relative flex justify-end gap-2 p-4 border-t border-white/10 dark:border-white/[0.1]/10 flex-shrink-0">
              <Button
                onClick={handleOverrideCancel}
                variant="outline"
                className="bg-white/10 backdrop-blur-sm text-white/90 border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleOverrideConfirm}
                className="bg-[#f25555] hover:bg-[#f36d6d] text-white shadow-sm hover:shadow-md transition-all duration-300"
              >
                {t('workflow.upload.overwrite')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowUpload;