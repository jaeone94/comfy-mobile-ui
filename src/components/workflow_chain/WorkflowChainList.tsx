import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Link as LinkIcon, ArrowLeft, RefreshCw, Plus, Play, Edit2, Trash2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IWorkflowChain } from '@/core/chain/types';
import { listChains, checkChainApiAvailability, executeChain, deleteChain, saveChain, interruptChain, getChainThumbnailUrl } from '@/infrastructure/api/ChainApiService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { chainProgressWebSocketService, ChainProgressData } from '@/infrastructure/websocket/ChainProgressWebSocketService';
import { loadAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';

const WorkflowChainList: React.FC = () => {
  const navigate = useNavigate();
  const { url: serverUrl, isConnected } = useConnectionStore();

  const [chains, setChains] = useState<IWorkflowChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);

  // Edit state
  const [editingChainId, setEditingChainId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');

  // Chain progress state
  const [chainProgress, setChainProgress] = useState<ChainProgressData | null>(null);

  // WebSocket connection for chain progress
  useEffect(() => {
    if (!serverUrl || !isConnected) {
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
  }, [serverUrl, isConnected]);

  // Check extension availability
  useEffect(() => {
    const checkExtension = async () => {
      if (!serverUrl || !isConnected) {
        setCheckingExtension(false);
        return;
      }

      setCheckingExtension(true);
      const available = await checkChainApiAvailability(serverUrl);
      setExtensionAvailable(available);
      setCheckingExtension(false);
    };

    checkExtension();
  }, [serverUrl, isConnected]);

  // Load workflows from IndexedDB
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const workflows = await loadAllWorkflows();
        setAvailableWorkflows(workflows);
      } catch (error) {
        console.error('Failed to load workflows:', error);
      }
    };

    loadWorkflows();
  }, []);

  // Load chains
  useEffect(() => {
    const loadChains = async () => {
      if (!serverUrl || !isConnected || !extensionAvailable) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await listChains(serverUrl);

        if (response.success) {
          // Enrich chains with thumbnails from IndexedDB
          const enrichedChains = response.chains.map(chain => ({
            ...chain,
            nodes: chain.nodes?.map(node => {
              let thumbnailToUse = node.thumbnail;

              // Try to find matching workflow in IndexedDB
              if (node.workflowId) {
                const matchingWorkflow = availableWorkflows.find(w => w.id === node.workflowId);
                if (matchingWorkflow?.thumbnail) {
                  thumbnailToUse = matchingWorkflow.thumbnail;
                }
              }

              // If no thumbnail from IndexedDB and no stored thumbnail, try server thumbnail
              if (!thumbnailToUse) {
                thumbnailToUse = getChainThumbnailUrl(serverUrl, chain.id, node.id);
              }

              return {
                ...node,
                thumbnail: thumbnailToUse
              };
            }) || []
          }));

          setChains(enrichedChains);
        } else {
          setError(response.error || 'Failed to load chains');
        }
      } catch (err) {
        setError('Failed to load chains');
      } finally {
        setLoading(false);
      }
    };

    if (extensionAvailable && !checkingExtension) {
      loadChains();
    }
  }, [serverUrl, isConnected, extensionAvailable, checkingExtension, availableWorkflows]);

  const handleRefresh = async () => {
    if (!serverUrl) return;

    setLoading(true);
    setError(null);

    try {
      // Reload workflows from IndexedDB
      const workflows = await loadAllWorkflows();
      setAvailableWorkflows(workflows);

      const response = await listChains(serverUrl);

      if (response.success) {
        // Enrich chains with thumbnails from IndexedDB
        const enrichedChains = response.chains.map(chain => ({
          ...chain,
          nodes: chain.nodes?.map(node => {
            let thumbnailToUse = node.thumbnail;

            if (node.workflowId) {
              const matchingWorkflow = workflows.find(w => w.id === node.workflowId);
              if (matchingWorkflow?.thumbnail) {
                thumbnailToUse = matchingWorkflow.thumbnail;
              }
            }

            if (!thumbnailToUse) {
              thumbnailToUse = getChainThumbnailUrl(serverUrl, chain.id, node.id);
            }

            return {
              ...node,
              thumbnail: thumbnailToUse
            };
          }) || []
        }));

        setChains(enrichedChains);
      } else {
        setError(response.error || 'Failed to load chains');
      }
    } catch (err) {
      setError('Failed to load chains');
    } finally {
      setLoading(false);
    }
  };

  const handleInterruptChain = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking stop button

    if (!serverUrl) {
      toast.error('Server URL not configured');
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

  const handleExecuteChain = async (chainId: string, chainName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking execute button

    if (!serverUrl) {
      toast.error('Server URL not configured');
      return;
    }

    toast.info(`Starting execution of "${chainName}"...`);

    try {
      const response = await executeChain(serverUrl, chainId);

      if (response.success) {
        toast.success(`Chain "${chainName}" executed successfully!`);

        // Show details of node results
        if (response.nodeResults && response.nodeResults.length > 0) {
          const successCount = response.nodeResults.filter(r => r.success).length;
          const totalCount = response.nodeResults.length;
          toast.info(`Completed ${successCount}/${totalCount} workflow nodes`);
        }
      } else {
        toast.error(`Chain execution failed: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Chain execution error:', error);
      toast.error(`Failed to execute chain "${chainName}"`);
    }
  };

  const handleStartEdit = (chain: IWorkflowChain, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChainId(chain.id);
    setEditingName(chain.name);
    setEditingDescription(chain.description || '');
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChainId(null);
    setEditingName('');
    setEditingDescription('');
  };

  const handleSaveEdit = async (chain: IWorkflowChain, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!serverUrl) {
      toast.error('Server URL not configured');
      return;
    }

    if (!editingName.trim()) {
      toast.error('Chain name cannot be empty');
      return;
    }

    try {
      const updatedChain: IWorkflowChain = {
        ...chain,
        name: editingName.trim(),
        description: editingDescription.trim(),
        modifiedAt: new Date().toISOString() as any
      };

      const response = await saveChain(serverUrl, updatedChain);

      if (response.success) {
        toast.success('Chain updated successfully');
        setEditingChainId(null);
        setEditingName('');
        setEditingDescription('');
        // Refresh list
        handleRefresh();
      } else {
        toast.error(`Failed to update chain: ${response.error}`);
      }
    } catch (error) {
      console.error('Update chain error:', error);
      toast.error('Failed to update chain');
    }
  };

  const handleDeleteChain = async (chainId: string, chainName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!serverUrl) {
      toast.error('Server URL not configured');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${chainName}"?`)) {
      return;
    }

    try {
      const response = await deleteChain(serverUrl, chainId);

      if (response.success) {
        toast.success(`Chain "${chainName}" deleted successfully`);
        // Refresh list
        handleRefresh();
      } else {
        toast.error(`Failed to delete chain: ${response.error}`);
      }
    } catch (error) {
      console.error('Delete chain error:', error);
      toast.error('Failed to delete chain');
    }
  };

  // Show connection error if not connected
  if (!isConnected) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Workflow Chains</h1>
            <p className="text-muted-foreground">Connect multiple workflows</p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Server Not Connected</AlertTitle>
          <AlertDescription>
            Please connect to ComfyUI server first. Go to Settings and configure your server connection.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show extension check loading
  if (checkingExtension) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Workflow Chains</h1>
            <p className="text-muted-foreground">Connect multiple workflows</p>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show extension not available error
  if (!extensionAvailable) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Workflow Chains</h1>
            <p className="text-muted-foreground">Connect multiple workflows</p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Extension Not Available</AlertTitle>
          <AlertDescription>
            The workflow chain feature requires the comfy-mobile-ui-api-extension to be installed and running.
            Please make sure the extension is properly installed in your ComfyUI custom_nodes folder.
          </AlertDescription>
        </Alert>
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
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative flex items-center justify-between p-4 z-10">
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => navigate('/')}
                variant="ghost"
                size="sm"
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Workflow Chains
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Connect multiple workflows in sequence
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/chains/create')}
              variant="ghost"
              size="sm"
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-6 py-8 max-w-4xl relative z-10">

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && chains.length === 0 && !error && (
        <Card>
          <CardHeader>
            <CardTitle>No Chains Yet</CardTitle>
            <CardDescription>
              Create your first workflow chain to connect multiple workflows in sequence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/chains/create')}>
              Create New Chain
            </Button>
          </CardContent>
        </Card>
      )}

          {/* Chains List */}
          {!loading && chains.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                {chains.length} {chains.length === 1 ? 'Chain' : 'Chains'}
              </h2>

              <div className="grid gap-4">
                {chains.map((chain) => {
                  const isEditing = editingChainId === chain.id;
                  const isExecuting = chainProgress?.isExecuting && chainProgress?.chainId === chain.id;

                  return (
                    <div
                      key={chain.id}
                      className={`backdrop-blur-md border rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group ${
                        isExecuting
                          ? 'bg-green-50/80 dark:bg-green-950/30 border-green-400/50 dark:border-green-500/50 ring-2 ring-green-400/30 dark:ring-green-500/30'
                          : 'bg-white/70 dark:bg-slate-900/70 border-white/20 dark:border-slate-700/30 hover:bg-white/80 dark:hover:bg-slate-900/80'
                      }`}
                      onClick={() => !isEditing && navigate(`/chains/edit/${chain.id}`)}
                    >
                      <div className="p-6">
                        {isEditing ? (
                          // Edit mode
                          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                            <div>
                              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                                Chain Name
                              </label>
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                placeholder="Enter chain name"
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                                Description (Optional)
                              </label>
                              <Input
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                placeholder="Enter description"
                                className="w-full"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                onClick={(e) => handleCancelEdit(e)}
                                variant="outline"
                                size="sm"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={(e) => handleSaveEdit(chain, e)}
                                size="sm"
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <>
                            {/* First row: Thumbnails and Title */}
                            <div className="flex items-start gap-4 mb-3">
                              {/* Stacked Thumbnails */}
                              {chain.nodes && chain.nodes.length > 0 && chain.nodes.some(n => n.thumbnail) && (
                                <div className="flex items-center flex-shrink-0">
                                  <div className="flex -space-x-9">
                                    {chain.nodes.filter(n => n.thumbnail).slice(0, 3).map((node, idx) => (
                                      <div
                                        key={node.id}
                                        className="relative w-12 h-12 rounded-lg border-2 border-white dark:border-slate-800 shadow-lg overflow-hidden"
                                        style={{
                                          zIndex: chain.nodes.length - idx,
                                          transform: `rotate(${(idx - 1) * 2}deg)`
                                        }}
                                      >
                                        <img
                                          src={node.thumbnail}
                                          alt={node.name || `Workflow ${idx + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  {chain.nodes.filter(n => n.thumbnail).length > 3 && (
                                    <div
                                      className="relative w-12 h-12 rounded-lg border-2 border-white dark:border-slate-800 shadow-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center -ml-3"
                                      style={{ zIndex: 0 }}
                                    >
                                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                        +{chain.nodes.filter(n => n.thumbnail).length - 3}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                    {chain.name}
                                  </h3>
                                  {isExecuting && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 dark:bg-green-600/20 border border-green-400/30 dark:border-green-500/30 rounded-full">
                                      <Loader2 className="h-3 w-3 text-green-700 dark:text-green-300 animate-spin" />
                                      <span className="text-xs font-medium text-green-700 dark:text-green-300">
                                        Executing
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  {chain.nodes?.length || 0} nodes
                                </div>
                                {chain.description && (
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                    {chain.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Second row: Buttons */}
                            <div className="flex items-center justify-end">
                              <div className="flex items-center gap-2">
                                {isExecuting ? (
                                  <Button
                                    onClick={handleInterruptChain}
                                    variant="ghost"
                                    size="sm"
                                    className="bg-red-500/20 dark:bg-red-600/20 backdrop-blur-sm border border-red-400/30 dark:border-red-500/30 shadow-lg hover:shadow-xl hover:bg-red-500/30 dark:hover:bg-red-600/30 transition-all duration-300 h-9 w-9 p-0 rounded-lg"
                                    title="Stop execution"
                                  >
                                    <XCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={(e) => handleExecuteChain(chain.id, chain.name, e)}
                                    variant="ghost"
                                    size="sm"
                                    className="bg-green-500/20 dark:bg-green-600/20 backdrop-blur-sm border border-green-400/30 dark:border-green-500/30 shadow-lg hover:shadow-xl hover:bg-green-500/30 dark:hover:bg-green-600/30 transition-all duration-300 h-9 w-9 p-0 rounded-lg"
                                    title="Execute chain"
                                  >
                                    <Play className="h-4 w-4 text-green-700 dark:text-green-300" />
                                  </Button>
                                )}
                                <Button
                                  onClick={(e) => handleStartEdit(chain, e)}
                                  variant="ghost"
                                  size="sm"
                                  className="bg-blue-500/20 dark:bg-blue-600/20 backdrop-blur-sm border border-blue-400/30 dark:border-blue-500/30 shadow-lg hover:shadow-xl hover:bg-blue-500/30 dark:hover:bg-blue-600/30 transition-all duration-300 h-9 w-9 p-0 rounded-lg"
                                  title="Edit chain name"
                                >
                                  <Edit2 className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                                </Button>
                                <Button
                                  onClick={(e) => handleDeleteChain(chain.id, chain.name, e)}
                                  variant="ghost"
                                  size="sm"
                                  className="bg-red-500/20 dark:bg-red-600/20 backdrop-blur-sm border border-red-400/30 dark:border-red-500/30 shadow-lg hover:shadow-xl hover:bg-red-500/30 dark:hover:bg-red-600/30 transition-all duration-300 h-9 w-9 p-0 rounded-lg"
                                  title="Delete chain"
                                >
                                  <Trash2 className="h-4 w-4 text-red-700 dark:text-red-300" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 mt-3">
                              <span>
                                Created: {new Date(chain.createdAt).toLocaleDateString()}
                              </span>
                              <span>
                                Modified: {new Date(chain.modifiedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowChainList;