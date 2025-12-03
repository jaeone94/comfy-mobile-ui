import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Upload,
  FileText,
  Menu,
  Loader2,
  Folder as FolderIcon,
  Search,
  X,
  Plus,
  Link as LinkIcon,
  ChevronRight,
  Home,
  ArrowUpDown,
  FolderPlus,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import WorkflowGridItem from './WorkflowGridItem';
import FolderGridItem from './FolderGridItem';
import ParentFolderGridItem from './ParentFolderGridItem';
import FolderDetailModal from './FolderDetailModal';
import WorkflowDetailModal from './WorkflowDetailModal';
import SideMenu from '@/components/controls/SideMenu';
import WorkflowEditModal from './WorkflowEditModal';
import {
  loadAllWorkflows,
  addWorkflow,
  removeWorkflow,
} from '@/infrastructure/storage/IndexedDBWorkflowService';
import { WorkflowFileService } from '@/core/services/WorkflowFileService';
import { toast } from 'sonner';
import { useFolderManagement } from '@/hooks/useFolderManagement';
import { SortOrder, FolderItem } from '@/types/folder';
import {
  extractWorkflowFromPng,
  convertPngDataToWorkflow,
  getPngWorkflowPreview,
} from '@/utils/pngMetadataExtractor';

// Upload component (reused from original)
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
    let targetFile = files.find((file) => file.name.toLowerCase().endsWith('.json'));

    if (!targetFile) {
      targetFile = files.find((file) => file.type.includes('image/png'));
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
      className={`w-full p-6 border-2 border-dashed rounded-lg transition-all duration-200 ${isDragging
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
          <Upload
            className={`mx-auto h-8 w-8 mb-3 transition-colors ${isDragging ? 'text-blue-500' : 'text-slate-400'
              }`}
          />
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isLoading ? 'Processing workflow...' : 'Drop your workflow file here'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isLoading
              ? 'Parsing nodes and generating thumbnail'
              : 'Supports JSON workflows or PNG images with ComfyUI metadata'}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [detailWorkflow, setDetailWorkflow] = useState<Workflow | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isFolderDetailModalOpen, setIsFolderDetailModalOpen] = useState(false);
  const [detailFolder, setDetailFolder] = useState<FolderItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedSortOrder, setSelectedSortOrder] = useState<SortOrder>('date-desc');
  const [selectedItemForMove, setSelectedItemForMove] = useState<{
    id: string;
    type: 'workflow' | 'folder';
    sourceFolderId: string | null;
  } | null>(null);
  const navigate = useNavigate();

  const {
    folderStructure,
    isEditMode,
    createFolder,
    deleteFolder,
    moveItem,
    setSortOrder,
    initializeRootWorkflows,
    removeWorkflow: removeFolderWorkflow,
    enterEditMode,
    saveEditMode,
    cancelEditMode,
  } = useFolderManagement();

  // Load workflows from IndexedDB
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const stored = await loadAllWorkflows();
        setWorkflows(stored);
        console.log('📦 Loaded workflows from IndexedDB:', stored.length);

        // Initialize folder structure with workflow IDs
        initializeRootWorkflows(stored.map((w) => w.id));
      } catch (error) {
        console.error('Failed to load workflows from IndexedDB:', error);
        setError('Failed to load saved workflows');
      }
    };

    loadWorkflows();
  }, [initializeRootWorkflows]);

  // Load sort order from folder structure
  useEffect(() => {
    setSelectedSortOrder(folderStructure.sortOrder);
  }, [folderStructure.sortOrder]);

  // Handle PNG workflow upload (reused from original)
  const handlePngWorkflowUpload = async (file: File) => {
    let loadingToastId: string | number | undefined;

    try {
      loadingToastId = toast.loading('Analyzing PNG file...', {
        description: 'Checking for ComfyUI workflow metadata',
      });

      const preview = await getPngWorkflowPreview(file);

      if (preview.error || (!preview.hasWorkflow && !preview.hasPrompt)) {
        if (loadingToastId) toast.dismiss(loadingToastId);
        return {
          success: false,
          error: preview.error || 'No ComfyUI workflow metadata found in PNG image',
        };
      }

      if (loadingToastId) toast.dismiss(loadingToastId);
      toast.success('PNG workflow metadata found!', {
        description: `${preview.nodeCount || 'Unknown'} nodes detected. Processing...`,
        duration: 2000,
      });

      const extraction = await extractWorkflowFromPng(file);

      if (!extraction.success || !extraction.data) {
        if (loadingToastId) toast.dismiss(loadingToastId);
        return {
          success: false,
          error: extraction.error || 'Failed to extract workflow from PNG',
        };
      }

      const workflowData = convertPngDataToWorkflow(extraction.data);
      const workflowJson = JSON.stringify(workflowData, null, 2);
      const tempFileName = file.name.replace(/\.png$/i, '_extracted.json');
      const jsonFile = new File([workflowJson], tempFileName, { type: 'application/json' });

      const result = await WorkflowFileService.processWorkflowFile(jsonFile);

      if (result.success && result.workflow) {
        result.workflow.description = result.workflow.description
          ? `${result.workflow.description}\n\nExtracted from PNG: ${file.name}`
          : `Extracted from PNG: ${file.name}`;

        (result.workflow as any).sourceType = 'png';
        (result.workflow as any).originalFileName = file.name;
      }

      return result;
    } catch (error) {
      console.error('PNG workflow extraction failed:', error);
      if (loadingToastId) toast.dismiss(loadingToastId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error processing PNG workflow',
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
        result = await handlePngWorkflowUpload(file);
      } else {
        result = await WorkflowFileService.processWorkflowFile(file);
      }

      if (result.success && result.workflow) {
        if (result.workflow.nodeCount === 0) {
          setError(
            `❌ Workflow "${result.workflow.name}" has 0 nodes. This may indicate a parsing error or invalid workflow format.`
          );
          toast.error('Zero Nodes Detected', {
            description: `Workflow "${result.workflow.name}" contains no nodes. Check console for detailed error information.`,
            duration: 8000,
          });

          setWorkflows((prev) => [{ ...result.workflow!, isValid: false }, ...prev]);
          await addWorkflow({ ...result.workflow!, isValid: false });
        } else {
          setWorkflows((prev) => [result.workflow!, ...prev]);
          await addWorkflow(result.workflow);

          // Add to current folder
          initializeRootWorkflows(workflows.map((w) => w.id).concat(result.workflow!.id));

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
    navigate(`/workflow/${workflow.id}`);
  };

  const handleWorkflowEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setIsEditModalOpen(true);
  };

  const handleWorkflowClick = (workflow: Workflow) => {
    if (isEditMode) {
      handleItemTouchInMoveMode(workflow.id, 'workflow', currentFolderId);
    } else {
      handleWorkflowSelect(workflow);
    }
  };

  const handleWorkflowLongPress = (workflow: Workflow) => {
    if (!isEditMode) {
      setDetailWorkflow(workflow);
      setIsDetailModalOpen(true);
    }
  };

  const handleFolderClick = (folderId: string) => {
    if (isEditMode) {
      handleItemTouchInMoveMode(folderId, 'folder', currentFolderId);
    } else {
      setCurrentFolderId(folderId);
      setSearchQuery(''); // Clear search when navigating folders
    }
  };

  const handleFolderLongPress = (folder: FolderItem) => {
    if (!isEditMode) {
      setDetailFolder(folder);
      setIsFolderDetailModalOpen(true);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    deleteFolder(folderId);
    toast.success('Folder deleted');
  };

  const handleWorkflowUpdated = (updatedWorkflow: Workflow) => {
    setWorkflows((prev) => prev.map((w) => (w.id === updatedWorkflow.id ? updatedWorkflow : w)));
  };

  const handleWorkflowDeleted = async (workflowId: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
    removeFolderWorkflow(workflowId);
    await removeWorkflow(workflowId);
  };

  const handleWorkflowCopied = async (newWorkflow: Workflow) => {
    try {
      const stored = await loadAllWorkflows();
      setWorkflows(stored);
      initializeRootWorkflows(stored.map((w) => w.id));
      console.log('📦 Reloaded workflows after copy:', stored.length);
    } catch (error) {
      console.error('Failed to reload workflows after copy:', error);
      setWorkflows((prev) => [...prev, newWorkflow]);
    }
  };

  const handleCreateEmptyWorkflow = async () => {
    try {
      setIsLoading(true);

      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const baseName = 'New Workflow';
      const regex = new RegExp(`^${baseName}(?:_(\\d+))?$`);

      let maxNumber = 0;
      workflows.forEach((w) => {
        const match = w.name.match(regex);
        if (match) {
          const num = match[1] ? parseInt(match[1]) : 0;
          maxNumber = Math.max(maxNumber, num);
        }
      });

      const newNumber = maxNumber + 1;
      const newName = maxNumber === 0 ? baseName : `${baseName}_${newNumber.toString().padStart(2, '0')}`;

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
              offset: [0, 0],
            },
          },
          version: 0.4,
        },
        nodeCount: 0,
        createdAt: new Date(),
        modifiedAt: new Date(),
        author: 'User',
        tags: [],
        isValid: true,
      };

      await addWorkflow(emptyWorkflow);

      const stored = await loadAllWorkflows();
      setWorkflows(stored);
      initializeRootWorkflows(stored.map((w) => w.id));

      toast.success(`Empty workflow "${newName}" created`);
      navigate(`/workflow/${newId}`);
    } catch (error) {
      console.error('Failed to create empty workflow:', error);
      toast.error('Failed to create empty workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    createFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName('');
    setIsCreatingFolder(false);
    toast.success(`Folder "${newFolderName}" created`);
  };

  // A-to-B touch system for moving items
  const handleItemTouchInMoveMode = (
    itemId: string,
    itemType: 'workflow' | 'folder',
    sourceFolderId: string | null
  ) => {
    // If no item is selected, select this item
    if (!selectedItemForMove) {
      setSelectedItemForMove({ id: itemId, type: itemType, sourceFolderId });
      toast.info(`Selected ${itemType}. Now tap destination folder.`);
      return;
    }

    // If tapping the same item, deselect it
    if (selectedItemForMove.id === itemId) {
      setSelectedItemForMove(null);
      toast.info('Selection cleared');
      return;
    }

    // If an item is already selected and user taps a folder, move the item
    if (itemType === 'folder') {
      const targetFolderId = itemId;

      // Prevent moving folder into itself
      if (selectedItemForMove.type === 'folder' && selectedItemForMove.id === targetFolderId) {
        toast.error('Cannot move folder into itself');
        return;
      }

      // Move the item
      moveItem({
        itemId: selectedItemForMove.id,
        itemType: selectedItemForMove.type,
        targetFolderId: targetFolderId,
        sourceFolderId: selectedItemForMove.sourceFolderId,
      });

      toast.success(`Moved ${selectedItemForMove.type} successfully`);
      setSelectedItemForMove(null);
    } else {
      // If tapping another workflow (not a folder), replace selection
      setSelectedItemForMove({ id: itemId, type: itemType, sourceFolderId });
      toast.info(`Selected ${itemType}. Now tap destination folder.`);
    }
  };

  const handleMoveToRoot = () => {
    if (!selectedItemForMove) {
      toast.error('Please select an item first');
      return;
    }

    moveItem({
      itemId: selectedItemForMove.id,
      itemType: selectedItemForMove.type,
      targetFolderId: null,
      sourceFolderId: selectedItemForMove.sourceFolderId,
    });

    toast.success(`Moved ${selectedItemForMove.type} to root`);
    setSelectedItemForMove(null);
  };

  const handleParentFolderClick = () => {
    // If we are at root, do nothing (though this component shouldn't be rendered at root)
    if (!currentFolderId) return;

    const parentId = folderStructure.folders[currentFolderId].parentId;

    if (isEditMode) {
      if (selectedItemForMove) {
        // Move to parent folder
        moveItem({
          itemId: selectedItemForMove.id,
          itemType: selectedItemForMove.type,
          targetFolderId: parentId, // null (root) or string
          sourceFolderId: selectedItemForMove.sourceFolderId,
        });

        toast.success(`Moved ${selectedItemForMove.type} to parent folder`);
        setSelectedItemForMove(null);
      } else {
        toast.info('Select an item to move first');
      }
    } else {
      // Navigate to parent folder
      setCurrentFolderId(parentId);
    }
  };



  const handleBreadcrumbClick = (folderId: string | null) => {
    if (isEditMode) return; // Don't navigate in edit mode
    setCurrentFolderId(folderId);
  };

  const handleToggleEditMode = () => {
    if (isEditMode) {
      saveEditMode();
      setSelectedItemForMove(null); // Clear selection when exiting
      toast.success('Changes saved');
    } else {
      enterEditMode();
      setSelectedItemForMove(null); // Clear selection when entering
    }
  };

  const handleCancelEditMode = () => {
    cancelEditMode();
    setSelectedItemForMove(null); // Clear selection when canceling
    toast.info('Changes discarded');
  };

  const handleSortChange = (sortOrder: SortOrder) => {
    setSelectedSortOrder(sortOrder);
    setSortOrder(sortOrder);
  };

  // Get current folder contents
  const currentFolderContents = useMemo(() => {
    const folder = currentFolderId ? folderStructure.folders[currentFolderId] : null;

    const workflowIds = currentFolderId
      ? folder?.workflows || []
      : folderStructure.rootWorkflows;

    const folderIds = currentFolderId
      ? folder?.children || []
      : folderStructure.rootFolders;

    const currentWorkflows = workflows.filter((w) => workflowIds.includes(w.id));
    const currentFolders = folderIds
      .map((id) => folderStructure.folders[id])
      .filter((f) => f !== undefined);

    return { workflows: currentWorkflows, folders: currentFolders };
  }, [currentFolderId, folderStructure, workflows]);

  // Sort workflows and folders
  const sortedContents = useMemo(() => {
    const { workflows: currentWorkflows, folders: currentFolders } = currentFolderContents;

    const sortWorkflows = (wfs: Workflow[]) => {
      const sorted = [...wfs];
      switch (selectedSortOrder) {
        case 'name-asc':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name-desc':
          sorted.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case 'date-asc':
          sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          break;
        case 'date-desc':
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
      }
      return sorted;
    };

    const sortFolders = (flds: typeof currentFolders) => {
      const sorted = [...flds];
      switch (selectedSortOrder) {
        case 'name-asc':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name-desc':
          sorted.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case 'date-asc':
          sorted.sort((a, b) => a.createdAt - b.createdAt);
          break;
        case 'date-desc':
          sorted.sort((a, b) => b.createdAt - a.createdAt);
          break;
      }
      return sorted;
    };

    return {
      workflows: sortWorkflows(currentWorkflows),
      folders: sortFolders(currentFolders),
    };
  }, [currentFolderContents, selectedSortOrder]);

  // Filter by search query
  const filteredContents = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedContents;
    }

    const query = searchQuery.toLowerCase().trim();

    const filteredWorkflows = sortedContents.workflows.filter((workflow) => {
      if (workflow.name.toLowerCase().includes(query)) return true;
      if (workflow.description && workflow.description.toLowerCase().includes(query)) return true;
      if (workflow.tags && workflow.tags.some((tag) => tag.toLowerCase().includes(query))) return true;
      if (workflow.author && workflow.author.toLowerCase().includes(query)) return true;
      return false;
    });

    const filteredFolders = sortedContents.folders.filter((folder) =>
      folder.name.toLowerCase().includes(query)
    );

    return { workflows: filteredWorkflows, folders: filteredFolders };
  }, [sortedContents, searchQuery]);

  // Build breadcrumb path
  const breadcrumbPath = useMemo(() => {
    const path: Array<{ id: string | null; name: string }> = [];

    let currentId = currentFolderId;
    const visited = new Set<string>();

    // Build path from current folder to root
    while (currentId) {
      if (visited.has(currentId)) break; // Prevent infinite loop
      visited.add(currentId);

      const folder = folderStructure.folders[currentId];
      if (!folder) break;

      path.unshift({ id: currentId, name: folder.name }); // Add to beginning
      currentId = folder.parentId;
    }

    // Add Home at the beginning
    path.unshift({ id: null, name: 'Home' });

    return path;
  }, [currentFolderId, folderStructure]);

  // Side menu handlers (reused from original)
  const handleSideMenuClose = () => setIsSideMenuOpen(false);
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
          position: 'absolute',
        }}
      >
        {/* Fixed Header */}
        <div className="sticky top-0 left-0 right-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden pwa-header">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

          <div className="relative flex items-center justify-between p-4 z-10">
            <button
              onClick={() => setIsSideMenuOpen(true)}
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                Comfy Mobile UI
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Choose a workflow to get started
              </p>
            </div>

            <button
              onClick={handleOutputsClick}
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg flex items-center justify-center"
              title="View Outputs Gallery"
              aria-label="View outputs"
            >
              <FolderIcon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>

        <div className="container mx-auto px-6 py-8 max-w-6xl relative z-10">
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

          {/* Main Content */}
          <div className="space-y-8">
            {/* Breadcrumb Navigation */}
            <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 p-4">
              <div className="flex items-center space-x-2 overflow-x-auto">
                {breadcrumbPath.map((crumb, index) => (
                  <React.Fragment key={crumb.id || 'root'}>
                    {index > 0 && <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    <button
                      onClick={() => handleBreadcrumbClick(crumb.id)}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all ${index === breadcrumbPath.length - 1
                        ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-white/10 dark:hover:bg-slate-700/10'
                        }`}
                      disabled={isEditMode}
                    >
                      {index === 0 && <Home className="w-4 h-4" />}
                      <span className="text-sm whitespace-nowrap">{crumb.name}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Search and Controls */}
            <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 p-6">
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search workflows and folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-12 py-3 bg-white/30 dark:bg-slate-800/30 backdrop-blur-md border-white/20 dark:border-slate-600/20 focus:border-blue-400/40 dark:focus:border-blue-400/40 transition-all duration-200 rounded-2xl text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/20 dark:hover:bg-slate-700/20 rounded-full"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Left: Sort and Info */}
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedSortOrder}
                      onChange={(e) => handleSortChange(e.target.value as SortOrder)}
                      className="px-4 py-2 bg-white/10 dark:bg-slate-700/10 backdrop-blur-md border border-white/20 dark:border-slate-600/20 rounded-2xl text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-white/20 dark:hover:bg-slate-700/20 transition-all"
                      disabled={isEditMode}
                    >
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="date-desc">Newest First</option>
                      <option value="date-asc">Oldest First</option>
                    </select>

                    <Badge
                      variant="outline"
                      className="px-3 py-1.5 text-sm bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl border border-white/10 dark:border-slate-600/10 text-slate-700 dark:text-slate-300"
                    >
                      {filteredContents.folders.length + filteredContents.workflows.length} items
                    </Badge>
                  </div>

                  {/* Right: Action Buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setIsCreatingFolder(true)}
                      variant="ghost"
                      size="sm"
                      className="px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                      disabled={isEditMode}
                    >
                      <FolderPlus className="w-4 h-4 mr-1" />
                      Folder
                    </Button>

                    <Button
                      onClick={handleCreateEmptyWorkflow}
                      variant="ghost"
                      size="sm"
                      className="px-3 py-2 rounded-2xl bg-green-500/10 border border-green-400/30 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                      disabled={isLoading || isEditMode}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Workflow
                    </Button>

                    <Button
                      onClick={() => navigate('/chains')}
                      variant="ghost"
                      size="sm"
                      className="px-3 py-2 rounded-2xl bg-purple-500/10 border border-purple-400/30 text-purple-700 dark:text-purple-400 hover:bg-purple-500/20"
                      disabled={isLoading || isEditMode}
                    >
                      <LinkIcon className="w-4 h-4" />
                    </Button>

                    <Button
                      onClick={handleToggleEditMode}
                      variant="ghost"
                      size="sm"
                      className={`px-3 py-2 rounded-2xl border ${isEditMode
                        ? 'bg-blue-500/20 border-blue-400/40 text-blue-700 dark:text-blue-300'
                        : 'bg-white/5 border-white/10 text-slate-700 dark:text-slate-300 hover:bg-white/10'
                        }`}
                    >
                      {isEditMode ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Done
                        </>
                      ) : (
                        <>
                          <ArrowUpDown className="w-4 h-4 mr-1" />
                          Move
                        </>
                      )}
                    </Button>

                    {isEditMode && (
                      <Button
                        onClick={handleCancelEditMode}
                        variant="ghost"
                        size="sm"
                        className="px-3 py-2 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Mode Banner */}
            {isEditMode && (
              <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-4 space-y-3">
                {selectedItemForMove ? (
                  <>
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium text-center">
                      Selected: <span className="font-bold">{selectedItemForMove.type}</span>
                      {' → '}Tap a folder to move, or tap item again to cancel
                    </p>
                    <div className="flex justify-center">
                      <Button
                        onClick={handleMoveToRoot}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                      >
                        <Home className="w-4 h-4 mr-2" />
                        Move to Root
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium text-center">
                    Move mode active - Tap an item to select, then tap a folder to move it
                  </p>
                )}
              </div>
            )}

            {/* New Folder Creation */}
            {isCreatingFolder && (
              <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-2xl shadow-xl border border-white/10 dark:border-slate-600/10 p-4">
                <div className="flex items-center gap-3">
                  <Input
                    type="text"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                    className="flex-1 bg-white/30 dark:bg-slate-800/30 backdrop-blur-md border-white/20 dark:border-slate-600/20"
                    autoFocus
                  />
                  <Button onClick={handleCreateFolder} size="sm" className="bg-blue-600 hover:bg-blue-700">
                    Create
                  </Button>
                  <Button
                    onClick={() => {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Grid Layout */}
            {filteredContents.folders.length > 0 || filteredContents.workflows.length > 0 || currentFolderId ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-24">
                {/* Parent Folder Item (only show if not at root) */}
                {currentFolderId && (
                  <ParentFolderGridItem
                    onClick={handleParentFolderClick}
                    isTarget={
                      isEditMode &&
                      selectedItemForMove !== null &&
                      selectedItemForMove.sourceFolderId === currentFolderId
                    }
                  />
                )}

                {/* Folders */}
                {filteredContents.folders.map((folder) => (
                  <FolderGridItem
                    key={folder.id}
                    folder={folder}
                    onClick={() => handleFolderClick(folder.id)}
                    onLongPress={() => handleFolderLongPress(folder)}
                    workflowCount={folder.workflows.length + folder.children.length}
                    isSelected={selectedItemForMove?.id === folder.id && selectedItemForMove?.type === 'folder'}
                  />
                ))}

                {/* Workflows */}
                {filteredContents.workflows.map((workflow) => (
                  <WorkflowGridItem
                    key={workflow.id}
                    workflow={workflow}
                    onClick={() => handleWorkflowClick(workflow)}
                    onLongPress={() => handleWorkflowLongPress(workflow)}
                    isSelected={selectedItemForMove?.id === workflow.id && selectedItemForMove?.type === 'workflow'}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 min-h-[300px] flex flex-col items-center justify-center text-center p-12">
                <FileText className="w-16 h-16 text-slate-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  {searchQuery ? 'No matching items' : 'No items yet'}
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  {searchQuery
                    ? 'Try adjusting your search terms'
                    : 'Upload a workflow or create a folder to get started'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals and Menus */}
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

      <WorkflowEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        workflow={editingWorkflow}
        onWorkflowUpdated={handleWorkflowUpdated}
        onWorkflowDeleted={handleWorkflowDeleted}
        onWorkflowCopied={handleWorkflowCopied}
      />

      <WorkflowDetailModal
        isOpen={isDetailModalOpen}
        workflow={detailWorkflow}
        onClose={() => setIsDetailModalOpen(false)}
        onEdit={handleWorkflowEdit}
        onSelect={handleWorkflowSelect}
      />

      <FolderDetailModal
        isOpen={isFolderDetailModalOpen}
        folder={detailFolder}
        folderStructure={folderStructure}
        allWorkflows={workflows}
        onClose={() => setIsFolderDetailModalOpen(false)}
        onDelete={handleDeleteFolder}
      />
    </div >
  );
};

export default WorkflowList;
