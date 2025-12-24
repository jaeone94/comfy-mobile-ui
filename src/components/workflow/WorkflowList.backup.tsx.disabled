import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, Menu, Loader2, Folder, ArrowUpDown, Search, X, Plus, Link as LinkIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import WorkflowCard from './WorkflowCard';
import SideMenu from '@/components/controls/SideMenu';
import WorkflowEditModal from './WorkflowEditModal';
import { loadAllWorkflows, addWorkflow, saveAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { WorkflowFileService } from '@/core/services/WorkflowFileService';
import { toast } from 'sonner';
import { Reorder, useDragControls } from 'framer-motion';
import { extractWorkflowFromPng, convertPngDataToWorkflow, getPngWorkflowPreview } from '@/utils/pngMetadataExtractor';

// Dark mode toggle removed - app is now dark mode by default

// Separate component to avoid Hook order violation
const ReorderableWorkflowItem: React.FC<{
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
}> = ({ workflow, onSelect, onEdit }) => {
  const dragControls = useDragControls();
  
  return (
    <Reorder.Item
      key={workflow.id}
      value={workflow}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ 
        scale: 1.02,
        boxShadow: "0 15px 30px -5px rgba(0, 0, 0, 0.25)",
        zIndex: 999
      }}
      transition={{ duration: 0.2 }}
      className="list-none"
    >
      <WorkflowCard
        workflow={workflow}
        onSelect={onSelect}
        onEdit={onEdit}
        isDraggable={true}
        isCompactMode={true}
        dragControls={dragControls}
      />
    </Reorder.Item>
  );
};

const WorkflowUploader: React.FC<{ 
  onUpload: (file: File) => void;
  isLoading?: boolean;
}> = ({ onUpload, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    
    // Find JSON file first (preferred)
    let targetFile = files.find(file => file.name.toLowerCase().endsWith('.json'));
    
    // If no JSON, look for PNG files
    if (!targetFile) {
      targetFile = files.find(file => file.type.includes('image/png'));
    }
    
    if (targetFile) {
      onUpload(targetFile);
    } else {
      toast.error('Unsupported file type', {
        description: 'Please drop a JSON workflow or PNG image with workflow metadata.',
        duration: 4000,
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isJson = file.name.toLowerCase().endsWith('.json');
      const isPng = file.type.includes('image/png');
      
      if (isJson || isPng) {
        onUpload(file);
      } else {
        toast.error('Unsupported file type', {
          description: 'Please select a JSON workflow or PNG image with workflow metadata.',
          duration: 4000,
        });
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`w-full p-6 border-2 border-dashed rounded-lg transition-all duration-200 ${
        isDragging
          ? 'border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/20'
          : 'border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-center">
        {isLoading ? (
          <Loader2 className="mx-auto h-8 w-8 mb-3 text-blue-500 animate-spin" />
        ) : (
          <Upload className={`mx-auto h-8 w-8 mb-3 transition-colors ${
            isDragging ? 'text-blue-500' : 'text-slate-400'
          }`} />
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isLoading ? 'Processing workflow...' : 'Drop your workflow file here'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isLoading ? 'Parsing nodes and generating thumbnail' : 'Supports JSON workflows or PNG images with ComfyUI metadata'}
          </p>
        </div>
        <Button
          onClick={handleButtonClick}
          disabled={isLoading}
          className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Workflow
            </>
          )}
        </Button>
        <Input
          ref={fileInputRef}
          type="file"
          accept=".json,.png"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};

const WorkflowList: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Load workflows from IndexedDB on component mount
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const stored = await loadAllWorkflows();
        setWorkflows(stored);
        console.log('📦 Loaded workflows from IndexedDB:', stored.length);
      } catch (error) {
        console.error('Failed to load workflows from IndexedDB:', error);
        setError('Failed to load saved workflows');
      }
    };

    loadWorkflows();
  }, []);

  // Handle PNG workflow upload
  const handlePngWorkflowUpload = async (file: File) => {
    let loadingToastId: string | number | undefined;
    
    try {
      // First show user what we're attempting to extract
      loadingToastId = toast.loading('Analyzing PNG file...', {
        description: 'Checking for ComfyUI workflow metadata',
      });
      
      const preview = await getPngWorkflowPreview(file);
      
      if (preview.error || (!preview.hasWorkflow && !preview.hasPrompt)) {
        // Dismiss loading toast and show error
        if (loadingToastId) {
          toast.dismiss(loadingToastId);
        }
        return {
          success: false,
          error: preview.error || 'No ComfyUI workflow metadata found in PNG image'
        };
      }
      
      // Dismiss loading toast and show what we found
      if (loadingToastId) {
        toast.dismiss(loadingToastId);
      }
      toast.success('PNG workflow metadata found!', {
        description: `${preview.nodeCount || 'Unknown'} nodes detected. Processing...`,
        duration: 2000,
      });
      
      // Extract workflow data
      const extraction = await extractWorkflowFromPng(file);
      
      if (!extraction.success || !extraction.data) {
        // Ensure loading toast is dismissed on extraction failure
        if (loadingToastId) {
          toast.dismiss(loadingToastId);
        }
        return {
          success: false,
          error: extraction.error || 'Failed to extract workflow from PNG'
        };
      }
      
      // Log extracted metadata for debugging
      console.group(`🖼️ PNG Metadata Extracted from: ${file.name}`);
      console.log('📊 Extraction Result:', extraction);
      console.log('📋 Raw PNG Data:', extraction.data);
      
      if (extraction.data.workflow) {
        console.log('🔧 Workflow Data Found:');
        console.log('  - Type:', typeof extraction.data.workflow);
        console.log('  - Keys:', Object.keys(extraction.data.workflow));
        console.log('  - Content:', extraction.data.workflow);
      }
      
      if (extraction.data.prompt) {
        console.log('💬 Prompt Data Found:');
        console.log('  - Type:', typeof extraction.data.prompt);
        console.log('  - Keys:', Object.keys(extraction.data.prompt));
        console.log('  - Content:', extraction.data.prompt);
      }
      console.groupEnd();
      
      // Convert PNG data to workflow format
      const workflowData = convertPngDataToWorkflow(extraction.data);
      
      // Log converted workflow data
      console.group('🔄 Workflow Data Conversion');
      console.log('📝 Converted Workflow Structure:');
      console.log('  - Nodes:', Object.keys(workflowData.nodes || {}).length);
      console.log('  - Links:', workflowData.links?.length || 0);
      console.log('  - Groups:', workflowData.groups?.length || 0);
      console.log('  - Version:', workflowData.version);
      console.log('🗂️ Full Converted Data:', workflowData);
      console.groupEnd();
      
      // Create a temporary JSON file to process through WorkflowFileService
      const workflowJson = JSON.stringify(workflowData, null, 2);
      const tempFileName = file.name.replace(/\.png$/i, '_extracted.json');
      const jsonFile = new File([workflowJson], tempFileName, { type: 'application/json' });
      
      console.log('📄 Generated JSON for processing:', {
        fileName: tempFileName,
        jsonSize: workflowJson.length,
        jsonPreview: workflowJson.substring(0, 200) + '...'
      });
      
      // Process through existing WorkflowFileService
      const result = await WorkflowFileService.processWorkflowFile(jsonFile);
      
      // Log final processing result
      console.group('✅ Final Processing Result');
      console.log('🎯 Processing Success:', result.success);
      if (result.success && result.workflow) {
        console.log('📊 Final Workflow Info:');
        console.log('  - ID:', result.workflow.id);
        console.log('  - Name:', result.workflow.name);
        console.log('  - Node Count:', result.workflow.nodeCount);
        console.log('  - Is Valid:', result.workflow.isValid);
        console.log('  - Has Thumbnail:', !!result.workflow.thumbnail);
        console.log('🔍 Full Workflow Object:', result.workflow);
      } else {
        console.error('❌ Processing Error:', result.error);
      }
      console.groupEnd();
      
      if (result.success && result.workflow) {
        // Add PNG source info to the workflow
        result.workflow.description = result.workflow.description 
          ? `${result.workflow.description}\n\nExtracted from PNG: ${file.name}`
          : `Extracted from PNG: ${file.name}`;
        
        // Mark as PNG-sourced
        (result.workflow as any).sourceType = 'png';
        (result.workflow as any).originalFileName = file.name;
        
        console.log('🏷️ Added PNG source metadata to workflow:', {
          sourceType: 'png',
          originalFileName: file.name,
          descriptionUpdated: true
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('PNG workflow extraction failed:', error);
      // Ensure loading toast is dismissed on any error
      if (loadingToastId) {
        toast.dismiss(loadingToastId);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error processing PNG workflow'
      };
    }
  };

  const handleWorkflowUpload = async (file: File) => {
    const isJson = file.name.toLowerCase().endsWith('.json');
    const isPng = file.type.includes('image/png');
    
    if (!isJson && !isPng) {
      setError('Please select a valid JSON workflow file or PNG image with workflow metadata');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let result;
      
      if (isPng) {
        // Handle PNG file with workflow metadata
        result = await handlePngWorkflowUpload(file);
      } else {
        // Handle JSON file
        result = await WorkflowFileService.processWorkflowFile(file);
      }
      
      if (result.success && result.workflow) {
        // Check for zero node count and warn user
        if (result.workflow.nodeCount === 0) {
          setError(`❌ Workflow "${result.workflow.name}" has 0 nodes. This may indicate a parsing error or invalid workflow format.`);
          toast.error('Zero Nodes Detected', {
            description: `Workflow "${result.workflow.name}" contains no nodes. Check console for detailed error information.`,
            duration: 8000,
          });
          
          // Still add the workflow but mark it as potentially invalid
          setWorkflows(prev => [{ ...result.workflow!, isValid: false }, ...prev]);
          await addWorkflow({ ...result.workflow!, isValid: false });
        } else {
          // Add to state and save to IndexedDB
          setWorkflows(prev => [result.workflow!, ...prev]);
          await addWorkflow(result.workflow);
          
          // Show success toast with file type info
          const fileType = isPng ? 'PNG image' : 'JSON file';
          const sourceInfo = isPng ? ' (extracted from PNG metadata)' : '';
          
          toast.success(`Successfully uploaded "${result.workflow.name}"`, {
            description: `${result.workflow.nodeCount} nodes processed from ${fileType}${sourceInfo}`,
            duration: 4000,
          });
        }
        
      } else {
        const errorMessage = result.error || 'Failed to process workflow file';
        setError(errorMessage);
        
        // Check if error is related to zero nodes
        const isZeroNodeError = errorMessage.includes('0 nodes') || errorMessage.includes('Zero nodes');
        
        toast.error('Upload Failed', {
          description: isZeroNodeError 
            ? 'Workflow has 0 nodes. Check console for parsing details.'
            : 'Failed to process workflow file.',
          duration: isZeroNodeError ? 8000 : 5000,
        });
      }
    } catch (error) {
      console.error('Failed to upload workflow:', error);
      const errorString = error instanceof Error ? error.message : 'Unknown error';
      const errorMessage = errorString.includes('0 nodes') 
        ? `❌ Zero Nodes Error: ${errorString}`
        : 'Failed to upload workflow file';
      
      setError(errorMessage);
      
      const isZeroNodeError = errorString.includes('0 nodes') || errorString.includes('Zero nodes');
      
      toast.error('Upload Failed', {
        description: isZeroNodeError 
          ? 'Workflow parsing failed - 0 nodes detected. Check console for detailed analysis.'
          : 'Could not upload workflow file.',
        duration: isZeroNodeError ? 10000 : 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkflowSelect = (workflow: Workflow) => {
    sessionStorage.setItem('app-navigation', 'true');
    // Use new hybrid approach (LiteGraph data + existing canvas)
    navigate(`/workflow/${workflow.id}`);
  };


  const handleSideMenuClose = () => {
    setIsSideMenuOpen(false);
  };

  const handleServerSettingsClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/settings/server');
  };

  const handleImportWorkflowsClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/import/server');
  };

  const handleUploadWorkflowsClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/upload/server');
  };

  const handleServerRebootClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/reboot');
  };

  const handleModelDownloadClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/models/download');
  };

  const handleModelBrowserClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/models/browser');
  };

  const handleBrowserDataBackupClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/browser-data-backup');
  };

  const handleWidgetTypeSettingsClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/settings/widget-types');
  };

  const handleVideoDownloadClick = () => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/videos/download');
  };

  const handleOutputsClick = () => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/outputs');
  };

  const handleWorkflowEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setIsEditModalOpen(true);
  };

  const handleWorkflowUpdated = (updatedWorkflow: Workflow) => {
    setWorkflows(prev => prev.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
  };

  const handleWorkflowDeleted = (workflowId: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== workflowId));
  };

  const handleWorkflowCopied = async (newWorkflow: Workflow) => {
    // Reload all workflows from IndexedDB to ensure consistency
    try {
      const stored = await loadAllWorkflows();
      setWorkflows(stored);
      console.log('📦 Reloaded workflows after copy:', stored.length);
    } catch (error) {
      console.error('Failed to reload workflows after copy:', error);
      // Fallback to optimistic update
      setWorkflows(prev => [...prev, newWorkflow]);
    }
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setEditingWorkflow(null);
  };

  const handleCreateEmptyWorkflow = async () => {
    try {
      setIsLoading(true);

      // Generate new ID
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Find the highest number suffix for "New Workflow" names
      const baseName = 'New Workflow';
      const regex = new RegExp(`^${baseName}(?:_(\\d+))?$`);

      let maxNumber = 0;
      workflows.forEach(w => {
        const match = w.name.match(regex);
        if (match) {
          const num = match[1] ? parseInt(match[1]) : 0;
          maxNumber = Math.max(maxNumber, num);
        }
      });

      const newNumber = maxNumber + 1;
      const newName = maxNumber === 0 ? baseName : `${baseName}_${newNumber.toString().padStart(2, '0')}`;

      // Create empty workflow (matching ComfyUI structure)
      const emptyWorkflow: Workflow = {
        id: newId,
        name: newName,
        description: '',
        workflow_json: {
          id: newId,
          revision: 0,
          last_node_id: 0,
          last_link_id: 0,
          nodes: [],
          links: [],
          groups: [],
          config: {},
          extra: {
            ue_links: [],
            ds: {
              scale: 1.0,
              offset: [0, 0]
            }
          },
          version: 0.4
        },
        nodeCount: 0,
        createdAt: new Date(),
        modifiedAt: new Date(),
        author: 'User',
        tags: [],
        isValid: true
      };

      // Add to storage
      await addWorkflow(emptyWorkflow);

      // Reload workflows
      const stored = await loadAllWorkflows();
      setWorkflows(stored);

      toast.success(`Empty workflow "${newName}" created`);

      // Navigate to the new workflow
      navigate(`/workflow/${newId}`);
    } catch (error) {
      console.error('Failed to create empty workflow:', error);
      toast.error('Failed to create empty workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorder = async (newOrder: Workflow[]) => {
    // Assign sortOrder values based on the new array position
    const workflowsWithUpdatedOrder = newOrder.map((workflow, index) => ({
      ...workflow,
      sortOrder: index
    }));

    setWorkflows(workflowsWithUpdatedOrder);
    try {
      await saveAllWorkflows(workflowsWithUpdatedOrder);
      console.log('✅ Workflow order saved successfully');
    } catch (error) {
      console.error('Failed to save reordered workflows:', error);
      toast.error('Failed to save workflow order');
    }
  };

  const toggleReorderMode = () => {
    setIsReorderMode(!isReorderMode);
  };

  // Filter workflows based on search query
  const filteredWorkflows = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return workflows;
    }

    const query = searchQuery.toLowerCase().trim();
    return workflows.filter(workflow => {
      // Search in workflow name
      if (workflow.name.toLowerCase().includes(query)) {
        return true;
      }

      // Search in workflow description
      if (workflow.description && workflow.description.toLowerCase().includes(query)) {
        return true;
      }

      // Search in workflow tags
      if (workflow.tags && workflow.tags.some(tag => tag.toLowerCase().includes(query))) {
        return true;
      }

      // Search in author
      if (workflow.author && workflow.author.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  }, [workflows, searchQuery]);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className="pwa-container bg-black transition-colors duration-300">
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
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        {/* Fixed Header inside scroll area */}
        <div className="sticky top-0 left-0 right-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden pwa-header">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
        
          <div className="relative flex items-center justify-between p-4 z-10">
              {/* Left Navigation Button */}
              <button
                onClick={() => setIsSideMenuOpen(true)}
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg flex items-center justify-center"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>

              {/* Center Title */}
              <div className="min-w-0 flex-1 text-center">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  Comfy Mobile UI
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Choose a workflow to get started
                </p>
              </div>

              {/* Right Navigation Button */}
              <button
                onClick={handleOutputsClick}
                className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg flex items-center justify-center"
                title="View Outputs Gallery"
                aria-label="View outputs"
              >
                <Folder className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>
            </div>
        </div>

        <div className="container mx-auto px-6 py-8 max-w-4xl relative z-10">
          {/* Upload Section */}
          <div className="mb-8">
            <WorkflowUploader onUpload={handleWorkflowUpload} isLoading={isLoading} />
            {error && (
              <div className="mt-4 p-4 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-red-400/30 dark:border-red-500/30 rounded-xl shadow-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setError(null)}
                  className="mt-2 h-6 px-2 text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-white/20 dark:hover:bg-slate-700/20"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>

          {/* Modern iOS-style Glassmorphism Layout */}
          <div className="space-y-8">
            {/* Enhanced Search Section */}
            <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 p-8 relative overflow-hidden">
              {/* Subtle Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />
              
              <div className="relative z-10 space-y-6">
                {/* Large Search Section */}
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search workflows by name, description, tags, or author..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-16 pr-16 py-6 text-lg bg-white/30 dark:bg-slate-800/30 backdrop-blur-md border-white/20 dark:border-slate-600/20 focus:border-blue-400/40 dark:focus:border-blue-400/40 transition-all duration-200 rounded-3xl text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400"
                    />
                    {searchQuery && (
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleClearSearch();
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleClearSearch();
                        }}
                        variant="ghost"
                        size="sm"
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/20 backdrop-blur-sm rounded-full"
                        title="Clear search"
                      >
                        <X className="w-5 h-5 text-slate-400" />
                      </Button>
                    )}
                  </div>
                  {searchQuery && (
                    <div className="text-base text-slate-600 dark:text-slate-400 ml-2">
                      {filteredWorkflows.length === 0 
                        ? "No workflows match your search" 
                        : `Found ${filteredWorkflows.length} workflow${filteredWorkflows.length === 1 ? '' : 's'}`
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Controls Row - Above Workflow Cards */}
            <div className="flex items-center justify-end space-x-4">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleReorderMode();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleReorderMode();
                }}
                variant="ghost"
                size="default"
                className={`px-6 py-3 rounded-2xl transition-all duration-300 font-medium min-h-[48px] min-w-[48px] bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl border shadow-lg ${
                  isReorderMode 
                    ? 'border-blue-400/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10' 
                    : 'border-white/10 dark:border-slate-600/10 hover:bg-white/10 dark:hover:bg-slate-700/10 text-slate-700 dark:text-slate-300'
                }`}
                disabled={filteredWorkflows.length <= 1 || searchQuery.trim() !== ''}
                title={isReorderMode ? "Exit reorder mode" : "Enable reorder mode"}
              >
                <ArrowUpDown className="w-5 h-5 mr-2" />
                {isReorderMode ? "Done" : "Reorder"}
              </Button>
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="px-4 py-2 text-sm bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl border border-white/10 dark:border-slate-600/10 text-slate-700 dark:text-slate-300 font-medium rounded-2xl min-h-[48px] flex items-center shadow-lg"
                >
                  {searchQuery.trim() ? `${filteredWorkflows.length} / ${workflows.length}` : `${workflows.length}`} workflows
                </Badge>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateEmptyWorkflow();
                  }}
                  variant="ghost"
                  size="default"
                  className="px-4 py-3 rounded-2xl transition-all duration-300 font-medium min-h-[48px] min-w-[48px] bg-green-500/10 dark:bg-green-500/10 backdrop-blur-2xl border border-green-400/30 dark:border-green-500/30 hover:bg-green-500/20 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 shadow-lg"
                  title="Create empty workflow"
                  disabled={isLoading}
                >
                  <Plus className="w-5 h-5" />
                </Button>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate('/chains');
                  }}
                  variant="ghost"
                  size="default"
                  className="px-4 py-3 rounded-2xl transition-all duration-300 font-medium min-h-[48px] min-w-[48px] bg-purple-500/10 dark:bg-purple-500/10 backdrop-blur-2xl border border-purple-400/30 dark:border-purple-500/30 hover:bg-purple-500/20 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 shadow-lg"
                  title="Workflow Chains"
                  disabled={isLoading}
                >
                  <LinkIcon className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Reorder Mode Banner */}
            {isReorderMode && filteredWorkflows.length > 0 && (
              <div className="bg-blue-500/10 dark:bg-blue-500/10 backdrop-blur-xl border border-blue-400/20 dark:border-blue-500/20 rounded-2xl p-4 shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/5 via-blue-500/5 to-blue-600/5 pointer-events-none rounded-2xl" />
                <div className="relative z-10 flex items-center space-x-3 text-blue-700 dark:text-blue-300">
                  <ArrowUpDown className="w-5 h-5" />
                  <p className="font-medium">
                    Reorder mode active - Drag workflows to rearrange them
                  </p>
                </div>
              </div>
            )}

            {/* Workflows Content */}
            {filteredWorkflows.length > 0 ? (
              isReorderMode ? (
                <Reorder.Group 
                  axis="y" 
                  values={filteredWorkflows} 
                  onReorder={handleReorder}
                  className="space-y-6"
                >
                  {filteredWorkflows.map((workflow) => (
                    <ReorderableWorkflowItem
                      key={workflow.id}
                      workflow={workflow}
                      onSelect={handleWorkflowSelect}
                      onEdit={handleWorkflowEdit}
                    />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-6">
                  {filteredWorkflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      onSelect={handleWorkflowSelect}
                      onEdit={handleWorkflowEdit}
                      isDraggable={false}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center text-center p-12">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />
                <div className="relative z-10">
                  <div className="bg-white/10 dark:bg-slate-700/10 backdrop-blur-md rounded-full p-8 mb-6">
                    {searchQuery.trim() ? (
                      <Search className="w-16 h-16 text-slate-400" />
                    ) : (
                      <FileText className="w-16 h-16 text-slate-400" />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    {searchQuery.trim() ? "No matching workflows" : "No workflows yet"}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                    {searchQuery.trim() ? (
                      <>
                        Try adjusting your search terms or{' '}
                        <button
                          onClick={handleClearSearch}
                          className="text-blue-500 hover:text-blue-600 underline font-medium"
                        >
                          clear the search
                        </button>
                      </>
                    ) : (
                      "Upload your first ComfyUI workflow to get started with your AI image generation journey"
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side Menu */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={handleSideMenuClose}
        onServerSettingsClick={handleServerSettingsClick}
        onImportWorkflowsClick={handleImportWorkflowsClick}
        onUploadWorkflowsClick={handleUploadWorkflowsClick}
        onServerRebootClick={handleServerRebootClick}
        onModelDownloadClick={handleModelDownloadClick}
        onModelBrowserClick={handleModelBrowserClick}
        onBrowserDataBackupClick={handleBrowserDataBackupClick}
        onWidgetTypeSettingsClick={handleWidgetTypeSettingsClick}
        onVideoDownloadClick={handleVideoDownloadClick}
      />

      {/* Workflow Edit Modal */}
      <WorkflowEditModal
        isOpen={isEditModalOpen}
        onClose={handleEditModalClose}
        workflow={editingWorkflow}
        onWorkflowUpdated={handleWorkflowUpdated}
        onWorkflowDeleted={handleWorkflowDeleted}
        onWorkflowCopied={handleWorkflowCopied}
      />
    </div>
  );
};

export default WorkflowList;