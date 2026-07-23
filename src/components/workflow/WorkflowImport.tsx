import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Server, AlertCircle, CheckCircle, Loader2, ExternalLink, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter workflows based on search query
  const filteredWorkflows = serverWorkflows.filter(workflow => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (workflow.filename || workflow.name || '').toLowerCase();
    return name.includes(query);
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
        const errorMessage = result.error || t('workflow.import.loadFailed');
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
          t('workflow.import.storageFull', {
            usage: Math.round(storageInfo.usage),
            used: formatStorageSize(storageInfo.used)
          })
        );
      }
      // Download workflow content using the actual API
      const fileService = new ComfyFileService(serverUrl);
      const downloadResult = await fileService.downloadWorkflow(serverWorkflow.filename || serverWorkflow.id);


      if (!downloadResult.success || !downloadResult.content) {
        throw new Error(downloadResult.error || t('workflow.import.downloadFailed'));
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
        throw new Error(processResult.error || t('workflow.import.processFailed'));
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
        description: t('workflow.import.description'),
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
      toast.success(t('workflow.import.success', { name: uniqueName }), {
        description: t('workflow.import.savedLocally'),
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
        toast.error(t('workflow.import.failedTitle'), {
          description: t('workflow.import.failedDesc'),
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
        {/* Main Background with Dark Theme */}
        <div className="absolute inset-0 bg-[#0b0c0f]" />

        {/* Main Scrollable Content Area */}
        <div
          className="absolute top-0 left-0 right-0 bottom-0"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="container mx-auto px-4 py-4 max-w-4xl">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <Loader2 className="h-10 w-12 animate-spin mx-auto mb-4 text-indigo-400" />
                <p className="text-white/70">{t('common.checkingServer')}</p>
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
                  {t('workflow.import.title')}
                </h1>
                <p className="font-mono text-[9px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-1">
                  {t('workflow.import.subtitle')}
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
                      <span className="text-[12.5px] text-[#9aa3b2]">{t('common.serverConnection')}</span>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <Badge className="bg-[#34c77b]/10 text-[#4ade80] border-[#34c77b]/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('common.connected')}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-[#f25555]/20 text-[#f87c7c] border-[#f25555]/30">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {t('common.disconnected')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Extension Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] text-[#9aa3b2]">{t('common.extension')}</span>
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
                              {t('common.noServerUrl')}
                            </span>
                          </div>
                        )}
                        {!isConnected && serverUrl && (
                          <div className="p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
                            <span className="text-[#f87c7c] text-[12px]">
                              {connectionError ? `${t('workflow.import.failedTitle')}: ${connectionError}` : t('common.notConnected')}
                            </span>
                          </div>
                        )}
                        {isConnected && !hasExtension && (
                          <div className="p-3 bg-[#f25555]/10 border border-[#f25555]/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-[#f87c7c] flex-shrink-0 mt-0.5" />
                            <span className="text-[#f87c7c] text-[12px]">
                              {t('common.extensionNotFound')}
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
                        {t('common.recheck')}
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
                          {t('menu.settings')}
                        </Button>
                      )}
                      {!hasExtension && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open('https://github.com/jaeone94/comfy-mobile-ui', '_blank')}
                          className="text-white border-white/10 hover:bg-white/10 active:bg-white/20 bg-white/5"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {t('common.getExtension')}
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

          {/* Server Workflows List */}
          {isConnected && hasExtension && (
            <div className="space-y-2.5">
              {/* Search Bar and Count */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    placeholder={t('workflow.searchPlaceholder')}
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
                    {searchQuery ? t('workflow.import.foundCount', { count: filteredWorkflows.length }) : t('workflow.import.serverWorkflows', { count: serverWorkflows.length })}
                  </h2>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadServerWorkflows}
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
                    <Server className="h-10 w-12 mx-auto mb-4 text-white/20" />
                    <p className="text-white/60">
                      {searchQuery ? t('workflow.import.noResultsQuery') : t('workflow.import.noWorkflowsOnServer')}
                    </p>
                    <p className="text-white/30 text-[12px] mt-2">
                      {searchQuery ? t('workflow.import.tryDifferent') : t('workflow.import.saveFirst')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                  {filteredWorkflows.map((workflow, index) => (
                    <div
                      key={workflow.filename}
                      className="min-w-0 transition-all duration-300 ease-in-out"
                    >
                      <Card className={`border border-white/5 bg-white/[0.025] hover:bg-white/5 transition-all group ${isImporting === workflow.filename ? 'opacity-70 pointer-events-none' : ''
                        }`}>
                        <CardContent className="px-3 py-3">
                          <div className="flex gap-3 items-center w-full">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[13px] font-semibold text-[#e9ebef] leading-[1.35] line-clamp-1 break-all">
                                {workflow.filename?.replace(/\.json$/i, '') || t('workflow.newWorkflowName')}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-[#565d6b] whitespace-nowrap">
                                <span>{formatDate(workflow.modified?.getTime() || Date.now())}</span>
                                <span className="text-[#31363f]">·</span>
                                <span>{formatFileSize(workflow.size || 0)}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => importWorkflow(workflow)}
                              disabled={isImporting === workflow.filename}
                              className="h-8 px-[13px] flex items-center gap-1.5 rounded-lg border text-[11.5px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors disabled:opacity-60"
                              style={{ background: 'rgba(61,123,253,0.12)', borderColor: 'rgba(61,123,253,0.3)', color: '#7ba3f5', touchAction: 'manipulation' }}
                            >
                              {isImporting === workflow.filename ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" strokeWidth={1.9} />
                              )}
                              {t('workflow.import.importButton', 'Import')}
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
            <div className="relative flex items-center justify-between px-4 h-11 border-b border-white/[0.08] flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center border" style={{ background: 'rgba(255,163,72,0.12)', borderColor: 'rgba(255,163,72,0.3)' }}>
                  <AlertCircle className="w-3.5 h-3.5 text-[#ffa348]" strokeWidth={1.8} />
                </div>
                <h3 className="text-[14px] font-semibold text-white">
                  {t('workflow.import.existsTitle')}
                </h3>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="relative p-4">
              <p className="text-[11.5px] leading-relaxed text-[#8a919e] mb-4">
                {t('workflow.import.existsDesc', { name: overrideDialog.filename })}
              </p>
              <p className="text-white/70 text-[12px] mb-4">
                {t('workflow.import.existsPrompt')}
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
                className="bg-[#3069f0] hover:bg-[#3f78f5] text-white shadow-sm hover:shadow-md transition-all duration-300"
              >
                {t('workflow.import.importAnyway')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowImport;