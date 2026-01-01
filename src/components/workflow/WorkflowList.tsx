import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Plus,
  ChevronRight,
  Folder as FolderIcon,
  FileText,
  ArrowUpDown,
  Menu,
  Image,
  Link as LinkIcon,
  X,
  ArrowRightLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import WorkflowGridItem from './WorkflowGridItem';
import FolderGridItem from './FolderGridItem';
import ParentFolderGridItem from './ParentFolderGridItem';
import FolderDetailModal from './FolderDetailModal';
import WorkflowDetailModal from './WorkflowDetailModal';
import WorkflowEditModal from './WorkflowEditModal';
import WorkflowUploadModal from './WorkflowUploadModal';
import SideMenu from '@/components/controls/SideMenu';
import {
  loadAllWorkflows,
  addWorkflow,
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
import { generateUUID } from '@/utils/uuid';

const STORAGE_KEY_FOLDER_PATH = 'comfy_mobile_folder_path';

const WorkflowList: React.FC = () => {
  // State
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize from localStorage
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FOLDER_PATH);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [detailWorkflow, setDetailWorkflow] = useState<Workflow | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isFolderDetailModalOpen, setIsFolderDetailModalOpen] = useState(false);
  const [detailFolder, setDetailFolder] = useState<FolderItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedSortOrder, setSelectedSortOrder] = useState<SortOrder>('date-desc');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedItemForMove, setSelectedItemForMove] = useState<{
    id: string;
    type: 'workflow' | 'folder';
    sourceFolderId: string | null;
  } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { t } = useTranslation();

  const navigate = useNavigate();

  const {
    folderStructure,
    isEditMode,
    createFolder,
    deleteFolder,
    moveItem,
    setSortOrder,
    initializeRootWorkflows,
    enterEditMode,
    cancelEditMode,
    removeWorkflow: removeWorkflowFromStructure,
  } = useFolderManagement();

  // Persist current folder path
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FOLDER_PATH, JSON.stringify(currentFolderId));
    } catch (e) {
      console.error('Failed to save folder path:', e);
    }
  }, [currentFolderId]);

  // Load workflows
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const stored = await loadAllWorkflows();
        setWorkflows(stored);
        initializeRootWorkflows(stored.map((w) => w.id));
      } catch (error) {
        console.error('Failed to load workflows:', error);
        setError(t('workflow.updateError'));
      }
    };
    loadWorkflows();
  }, [initializeRootWorkflows]);

  // Sync sort order
  useEffect(() => {
    setSelectedSortOrder(folderStructure.sortOrder);
  }, [folderStructure.sortOrder]);

  // Upload Handlers
  const handlePngWorkflowUpload = async (file: File) => {
    let loadingToastId: string | number | undefined;
    try {
      loadingToastId = toast.loading(t('workflow.analyzing'));
      const preview = await getPngWorkflowPreview(file);

      if (preview.error || (!preview.hasWorkflow && !preview.hasPrompt)) {
        if (loadingToastId) toast.dismiss(loadingToastId);
        return { success: false, error: preview.error || t('workflow.invalidFile') };
      }

      if (loadingToastId) toast.dismiss(loadingToastId);
      const extraction = await extractWorkflowFromPng(file);

      if (!extraction.success || !extraction.data) {
        return { success: false, error: extraction.error || t('workflow.extractionFailed') };
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
      console.error('PNG upload failed:', error);
      if (loadingToastId) toast.dismiss(loadingToastId);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const handleWorkflowUpload = async (file: File) => {
    setIsLoading(true);
    try {
      const isPng = file.type.includes('image/png');
      const result = isPng
        ? await handlePngWorkflowUpload(file)
        : await WorkflowFileService.processWorkflowFile(file);

      if (result.success && result.workflow) {
        setWorkflows((prev) => [result.workflow!, ...prev]);
        await addWorkflow(result.workflow);
        initializeRootWorkflows(workflows.map((w) => w.id).concat(result.workflow!.id));
        toast.success(t('workflow.uploadSuccess', { name: result.workflow.name }));
        setIsUploadModalOpen(false);
      } else {
        toast.error(result.error || t('workflow.uploadFailed'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('workflow.uploadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation & Actions
  const handleWorkflowSelect = (workflow: Workflow) => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate(`/workflow/${workflow.id}`);
  };

  const handleCreateEmptyWorkflow = async () => {
    try {
      setIsLoading(true);
      const newId = generateUUID();
      const baseName = t('workflow.newWorkflowName');
      const newName = `${baseName} ${new Date().toLocaleTimeString()}`;

      const emptyWorkflow: Workflow = {
        id: newId,
        name: newName,
        description: '',
        workflow_json: { id: newId, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 } as any,
        nodeCount: 0,
        createdAt: new Date(),
        modifiedAt: new Date(),
        author: 'User',
        tags: [],
        isValid: true,
      };

      await addWorkflow(emptyWorkflow);
      setWorkflows((prev) => [emptyWorkflow, ...prev]);
      initializeRootWorkflows(workflows.map((w) => w.id).concat(newId));
      toast.success(t('workflow.createSuccess'));
      navigate(`/workflow/${newId}`);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      toast.error(t('workflow.createError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName('');
    setIsCreatingFolder(false);
    toast.success(t('folder.createSuccess'));
  };

  // Content Filtering & Sorting
  const currentFolderContents = useMemo(() => {
    const folder = currentFolderId ? folderStructure.folders[currentFolderId] : null;
    const workflowIds = currentFolderId ? folder?.workflows || [] : folderStructure.rootWorkflows;
    const folderIds = currentFolderId ? folder?.children || [] : folderStructure.rootFolders;

    const currentWorkflows = workflows.filter((w) => workflowIds.includes(w.id));
    const currentFolders = folderIds.map((id) => folderStructure.folders[id]).filter(Boolean);

    return { workflows: currentWorkflows, folders: currentFolders };
  }, [currentFolderId, folderStructure, workflows]);

  const filteredContents = useMemo(() => {
    // Search - Global Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();

      // Search all workflows
      const wfs = workflows.filter(w => w.name.toLowerCase().includes(query));

      // Search all folders
      const flds = Object.values(folderStructure.folders).filter(f =>
        f.name.toLowerCase().includes(query)
      );

      // Sort
      const sortFn = (a: any, b: any) => {
        switch (selectedSortOrder) {
          case 'name-asc': return a.name.localeCompare(b.name);
          case 'name-desc': return b.name.localeCompare(a.name);
          case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          default: return 0;
        }
      };

      return { workflows: wfs.sort(sortFn), folders: flds.sort(sortFn) };
    }

    // No Search - Current Folder Contents
    let { workflows: wfs, folders: flds } = currentFolderContents;

    // Sort
    const sortFn = (a: any, b: any) => {
      switch (selectedSortOrder) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default: return 0;
      }
    };

    return { workflows: wfs.sort(sortFn), folders: flds.sort(sortFn) };
  }, [currentFolderContents, searchQuery, selectedSortOrder, workflows, folderStructure]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const path = [];
    let curr = currentFolderId;
    while (curr) {
      const f = folderStructure.folders[curr];
      if (!f) break;
      path.unshift({ id: curr, name: f.name });
      curr = f.parentId;
    }
    return [{ id: null, name: t('folder.home') }, ...path];
  }, [currentFolderId, folderStructure, t]);

  // Handlers for Items
  const handleWorkflowClick = (workflow: Workflow) => {
    if (isEditMode) {
      if (!selectedItemForMove) setSelectedItemForMove({ id: workflow.id, type: 'workflow', sourceFolderId: currentFolderId });
      else if (selectedItemForMove.id === workflow.id) setSelectedItemForMove(null);
      else setSelectedItemForMove({ id: workflow.id, type: 'workflow', sourceFolderId: currentFolderId });
    } else {
      handleWorkflowSelect(workflow);
    }
  };

  const handleFolderClick = (folderId: string) => {
    if (isEditMode) {
      if (selectedItemForMove) {
        moveItem({ itemId: selectedItemForMove.id, itemType: selectedItemForMove.type, targetFolderId: folderId, sourceFolderId: selectedItemForMove.sourceFolderId });
        setSelectedItemForMove(null);
        toast.success(t('folder.moveSuccess'));
      }
    } else {
      setCurrentFolderId(folderId);
      setSearchQuery('');
    }
  };

  // Side Menu Handlers
  const handleSideMenuClose = () => setIsSideMenuOpen(false);
  const handleNavigation = (path: string) => {
    setIsSideMenuOpen(false);
    sessionStorage.setItem('app-navigation', 'true');
    navigate(path);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900/30 overflow-hidden">
      {/* Fixed Header */}
      <header className="flex-none z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 shadow-sm transition-all duration-300">
        <div className="max-w-[1600px] mx-auto px-4 h-20 flex items-center justify-between gap-2">
          {/* Left: Menu & Breadcrumbs */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-12 w-12 rounded-xl"
              onClick={() => setIsSideMenuOpen(true)}
            >
              <Menu className="w-7 h-7" />
            </Button>

            {/* App Icon 흰색 처리 */}
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700" />
              <img
                src="/icons/icon-monochrome.svg"
                alt="ComfyUI"
                className="w-7 h-7 object-contain relative z-10 drop-shadow-md transform transition-transform group-hover:scale-110"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>

            {/* Breadcrumbs - Scrollable on mobile */}
            <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-lg font-medium whitespace-nowrap mask-linear-fade">
              {breadcrumbs.map((item, index) => (
                <React.Fragment key={item.id || 'root'}>
                  {index > 0 && <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />}
                  <button
                    onClick={() => setCurrentFolderId(item.id)}
                    className={`hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${index === breadcrumbs.length - 1
                      ? 'text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-500 dark:text-slate-500'
                      }`}
                  >
                    {item.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Search */}
            <div className="relative group">
              {/* Desktop Search */}
              <div className="hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('workflow.searchPlaceholder')}
                  className="w-40 lg:w-80 pl-10 h-12 bg-slate-100/50 dark:bg-slate-900/50 border-transparent focus:bg-white dark:focus:bg-slate-950 focus:border-blue-500/50 transition-all duration-200 rounded-xl text-base"
                />
              </div>

              {/* Mobile Search Button */}
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-12 w-12 rounded-xl"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
              >
                {isSearchOpen ? (
                  <X className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                ) : (
                  <Search className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                )}
              </Button>
            </div>

            {/* Sort Button */}
            <Button
              variant="ghost"
              onClick={() => {
                const nextSort: SortOrder = selectedSortOrder === 'date-desc' ? 'name-asc' : 'date-desc';
                setSortOrder(nextSort);
              }}
              className="h-12 px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 font-medium text-slate-600 dark:text-slate-400 gap-2 min-w-[100px]"
              title={t('workflow.sorting.title', 'Sort')}
            >
              <ArrowUpDown className="w-5 h-5" />
              <span>
                {selectedSortOrder.includes('date') ? t('workflow.sorting.newest') : t('workflow.sorting.name')}
              </span>
            </Button>

            {/* Chains View Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900"
              onClick={() => {
                sessionStorage.setItem('app-navigation', 'true');
                navigate('/chains');
              }}
              title={t('workflow.list.chainsTitle')}
            >
              <LinkIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </Button>

            {/* Gallery Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900"
              onClick={() => {
                sessionStorage.setItem('app-navigation', 'true');
                navigate('/outputs');
              }}
              title={t('common.gallery')}
            >
              <Image className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Search Section */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sm:hidden overflow-hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('workflow.searchPlaceholder')}
                  className="w-full pl-10 h-12 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 focus:border-blue-500/50 rounded-xl text-base"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Folder Section */}
      <div className="flex-none bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-200/60 dark:border-slate-800/60 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          {/* Folder Section Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FolderIcon className="w-6 h-6" />
              {t('folder.title')}
            </h2>
            {/* New Folder Button */}
            <Button
              onClick={() => setIsCreatingFolder(true)}
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800"
              title={t('folder.newFolder')}
            >
              <Plus className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </Button>
          </div>

          {/* Folders List */}
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {/* Parent Folder */}
            {currentFolderId && (
              <div className="min-w-[160px] shrink-0">
                <ParentFolderGridItem
                  onClick={() => {
                    if (isEditMode && selectedItemForMove) {
                      moveItem({
                        itemId: selectedItemForMove.id,
                        itemType: selectedItemForMove.type,
                        targetFolderId: folderStructure.folders[currentFolderId]?.parentId || null,
                        sourceFolderId: currentFolderId
                      });
                      setSelectedItemForMove(null);
                      toast.success(t('folder.moveToParentSuccess'));
                    } else {
                      const parentId = folderStructure.folders[currentFolderId]?.parentId;
                      setCurrentFolderId(parentId);
                    }
                  }}
                  isTarget={false}
                  isMoveMode={isEditMode}
                />
              </div>
            )}

            {/* New Folder Input */}
            {isCreatingFolder && (
              <div className="min-w-[160px] h-[72px] flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-blue-500 shadow-lg px-3">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  onBlur={() => {
                    if (!newFolderName.trim()) {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder={t('folder.namePlaceholder')}
                  className="h-10 text-base border-none shadow-none focus-visible:ring-0 px-0 min-w-0"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleCreateFolder}>
                  <Plus className="w-5 h-5 text-blue-500" />
                </Button>
              </div>
            )}

            {/* Folder Items */}
            {filteredContents.folders.length === 0 && !isCreatingFolder && !currentFolderId && (
              <div className="text-sm text-slate-400 italic py-3 px-2">{t('folder.noFolders')}</div>
            )}

            {filteredContents.folders.map((folder) => (
              <div key={folder.id} className="min-w-[160px]">
                <FolderGridItem
                  folder={folder}
                  onClick={() => handleFolderClick(folder.id)}
                  onLongPress={() => {
                    setDetailFolder(folder);
                    setIsFolderDetailModalOpen(true);
                  }}
                  workflowCount={folder.workflows.length + folder.children.length}
                  isSelected={selectedItemForMove?.id === folder.id}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable Workflow List */}
      <main className="flex-1 overflow-y-auto w-full bg-slate-50 dark:bg-slate-950">
        <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Workflows Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-6 h-6" />
              {t('workflow.listTitle')} ({filteredContents.workflows.length})
            </h2>

            {/* Workflow Actions - Moved here */}
            <div className="flex items-center gap-1">
              {/* New/Upload Workflow (Consolidated) */}
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800"
                title={t('workflow.uploadButton')}
              >
                <Plus className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              </Button>

              {/* Select/Move */}
              <Button
                variant={isEditMode ? "secondary" : "ghost"}
                size="icon"
                className={`h-10 w-10 rounded-xl ${isEditMode ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                onClick={() => {
                  if (isEditMode) {
                    cancelEditMode();
                    setSelectedItemForMove(null);
                  } else {
                    enterEditMode();
                  }
                }}
                title={isEditMode ? t('workflow.cancelSelection') : t('workflow.selectItems')}
              >
                {isEditMode ? <X className="w-6 h-6" /> : <ArrowRightLeft className="w-6 h-6 text-slate-600 dark:text-slate-400" />}
              </Button>
            </div>
          </div>

          {/* Workflow Grid */}
          {filteredContents.workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t('workflow.noWorkflows')}</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {t('workflow.noWorkflowsSub')}
              </p>
              <Button onClick={() => setIsUploadModalOpen(true)} variant="outline" className="mt-6">
                {t('workflow.uploadButton')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-6 pb-20">
              {filteredContents.workflows.map((workflow) => (
                <WorkflowGridItem
                  key={workflow.id}
                  workflow={workflow}
                  onClick={() => handleWorkflowClick(workflow)}
                  onLongPress={() => {
                    setDetailWorkflow(workflow);
                    setIsDetailModalOpen(true);
                  }}
                  isSelected={selectedItemForMove?.id === workflow.id}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={handleSideMenuClose}
        onServerSettingsClick={() => handleNavigation('/settings/server')}
        onImportWorkflowsClick={() => handleNavigation('/import/server')}
        onUploadWorkflowsClick={() => handleNavigation('/upload/server')}
        onServerRebootClick={() => handleNavigation('/reboot')}
        onModelDownloadClick={() => handleNavigation('/models/download')}
        onModelBrowserClick={() => handleNavigation('/models/browser')}
        onBrowserDataBackupClick={() => handleNavigation('/browser-data-backup')}
        onWidgetTypeSettingsClick={() => handleNavigation('/settings/widget-types')}
        onVideoDownloadClick={() => handleNavigation('/videos/download')}
        onChainsClick={() => handleNavigation('/chains')}
        onGalleryClick={() => handleNavigation('/outputs')}
      />

      <WorkflowUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleWorkflowUpload}
        onCreateEmpty={handleCreateEmptyWorkflow}
      />

      <WorkflowDetailModal
        workflow={detailWorkflow}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailWorkflow(null);
        }}
        onSelect={(workflow) => navigate(`/workflow/${workflow.id}`)}
        onWorkflowUpdated={(updatedWorkflow) => {
          setWorkflows((prev) =>
            prev.map((w) => (w.id === updatedWorkflow.id ? updatedWorkflow : w))
          );
          // Also update detail workflow if it's the same one
          if (detailWorkflow?.id === updatedWorkflow.id) {
            setDetailWorkflow(updatedWorkflow);
          }
        }}
        onWorkflowDeleted={(workflowId) => {
          setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
          removeWorkflowFromStructure(workflowId);
          initializeRootWorkflows(workflows.filter((w) => w.id !== workflowId).map((w) => w.id));
          toast.success(t('folder.deleteSuccess'));
          setIsDetailModalOpen(false);
        }}
        onWorkflowCopied={(newWorkflow) => {
          setWorkflows((prev) => [newWorkflow, ...prev]);
          initializeRootWorkflows([newWorkflow.id, ...workflows.map((w) => w.id)]);
          toast.success(t('workflow.copySuccess', { name: newWorkflow.name }));
        }}
      />

      <WorkflowEditModal
        workflow={editingWorkflow}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingWorkflow(null);
        }}
        onWorkflowUpdated={(updatedWorkflow) => {
          setWorkflows((prev) =>
            prev.map((w) => (w.id === updatedWorkflow.id ? updatedWorkflow : w))
          );
          toast.success(t('common.save'));
          setIsEditModalOpen(false);
          setEditingWorkflow(null);
        }}
      />

      {detailFolder && (
        <FolderDetailModal
          folder={detailFolder}
          folderStructure={folderStructure}
          allWorkflows={workflows}
          isOpen={isFolderDetailModalOpen}
          onClose={() => {
            setIsFolderDetailModalOpen(false);
            setDetailFolder(null);
          }}
          onDelete={async () => {
            try {
              await deleteFolder(detailFolder.id);
              setIsFolderDetailModalOpen(false);
              setDetailFolder(null);
              toast.success(t('folder.deleteSuccess'));
            } catch (error) {
              console.error('Failed to delete folder:', error);
              toast.error(t('folder.deleteError'));
            }
          }}
        />
      )}
    </div>
  );
};

export default WorkflowList;
