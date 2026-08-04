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
  ArrowRightLeft,
  FolderInput,
  Trash2,
  AlertTriangle,
  CornerLeftUp,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { useConnectionStore } from '@/ui/store/connectionStore';
import WorkflowGridItem from './WorkflowGridItem';
import FolderGridItem from './FolderGridItem';
import FolderDetailModal from './FolderDetailModal';
import WorkflowDetailModal from './WorkflowDetailModal';
import WorkflowEditModal from './WorkflowEditModal';
import WorkflowUploadModal from './WorkflowUploadModal';
import MoveToFolderSheet, { MoveItem } from './MoveToFolderSheet';
import SideMenu from '@/components/controls/SideMenu';
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

  // Multi-select: pick any workflows/folders, then move or delete them in bulk.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // "Move to folder" destination sheet (drives both single-item moves from the
  // detail modals and bulk moves from the selection bar).
  const [moveSheetItems, setMoveSheetItems] = useState<MoveItem[] | null>(null);
  const [moveSheetLabel, setMoveSheetLabel] = useState<string | undefined>(undefined);

  const { t } = useTranslation();

  const navigate = useNavigate();

  const {
    folderStructure,
    createFolder,
    deleteFolder,
    moveItem,
    setSortOrder,
    initializeRootWorkflows,
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

  // --- Selection & move helpers ---
  const getItemType = (id: string): 'workflow' | 'folder' =>
    folderStructure.folders[id] ? 'folder' : 'workflow';

  // Resolve an item's real parent folder from the structure (not the current
  // view), so moves stay correct even from search results or another branch.
  const findSourceFolderId = (id: string, type: 'workflow' | 'folder'): string | null => {
    if (type === 'folder') return folderStructure.folders[id]?.parentId ?? null;
    const parent = Object.entries(folderStructure.folders).find(([, f]) =>
      f.workflows.includes(id)
    );
    return parent ? parent[0] : null;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const enterSelection = () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const openMoveSheet = (items: MoveItem[], label?: string) => {
    if (!items.length) return;
    setMoveSheetItems(items);
    setMoveSheetLabel(label);
  };

  const openMoveForSelection = () => {
    const items: MoveItem[] = Array.from(selectedIds).map((id) => {
      const type = getItemType(id);
      return { id, type, sourceFolderId: findSourceFolderId(id, type) };
    });
    openMoveSheet(items);
  };

  const handleConfirmMove = (targetFolderId: string | null) => {
    const items = moveSheetItems || [];
    items.forEach((it) =>
      moveItem({
        itemId: it.id,
        itemType: it.type,
        targetFolderId,
        sourceFolderId: it.sourceFolderId,
      })
    );
    setMoveSheetItems(null);
    setMoveSheetLabel(undefined);
    exitSelection();
    toast.success(t('folder.moveSuccess'));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const deletedWorkflowIds: string[] = [];
    for (const id of ids) {
      if (getItemType(id) === 'folder') {
        deleteFolder(id);
      } else {
        try {
          await removeWorkflow(id);
        } catch (e) {
          console.error('Failed to delete workflow:', e);
        }
        removeWorkflowFromStructure(id);
        deletedWorkflowIds.push(id);
      }
    }
    if (deletedWorkflowIds.length) {
      setWorkflows((prev) => prev.filter((w) => !deletedWorkflowIds.includes(w.id)));
    }
    setShowBulkDeleteConfirm(false);
    exitSelection();
    toast.success(t('folder.deleteSuccess'));
  };

  // Handlers for Items
  const handleWorkflowClick = (workflow: Workflow) => {
    if (selectionMode) toggleSelect(workflow.id);
    else handleWorkflowSelect(workflow);
  };

  const handleFolderClick = (folderId: string) => {
    if (selectionMode) {
      toggleSelect(folderId);
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

  const serverUrl = useConnectionStore((s) => s.url);
  const serverHost = useMemo(
    () => (serverUrl || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    [serverUrl]
  );

  return (
    <div className="h-full flex flex-col text-[#e9ebef] overflow-hidden" style={{ background: '#0b0c0f' }}>
      {/* Header (52px, tool aesthetic) */}
      <header className="flex-none z-40 border-b border-white/[0.08]" style={{ background: '#0b0c0f' }}>
        <div className="max-w-[1600px] mx-auto h-[52px] px-4 flex items-center gap-2.5">
          <button
            onClick={() => setIsSideMenuOpen(true)}
            className="shrink-0 -ml-1 p-1.5 text-[#c8ccd4] hover:text-white transition-colors"
            aria-label={t('common.menu', 'Menu')}
          >
            <Menu className="w-5 h-5" strokeWidth={1.7} />
          </button>

          {/* App icon tile */}
          <div className="w-[26px] h-[26px] shrink-0 rounded-[7px] bg-[#3069f0] flex items-center justify-center">
            <img
              src="/icons/icon-monochrome.svg"
              alt="ComfyUI"
              className="w-4 h-4"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide whitespace-nowrap text-[13.5px] font-semibold">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.id || 'root'}>
                {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#4a5261] shrink-0" strokeWidth={2} />}
                <button
                  onClick={() => setCurrentFolderId(item.id)}
                  className={`transition-colors ${index === breadcrumbs.length - 1
                    ? 'text-[#e9ebef]'
                    : 'text-[#71798a] hover:text-[#c8ccd4]'
                    }`}
                >
                  {item.name}
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* Server chip */}
          {serverHost && (
            <span className="shrink-0 font-mono text-[11px] text-[#565d6b] px-1.5 py-[3px] border border-white/10 rounded-[5px] max-w-[164px] truncate">
              {serverHost}
            </span>
          )}

          <div className="flex-1" />

          {/* Gallery */}
          <button
            onClick={() => {
              sessionStorage.setItem('app-navigation', 'true');
              navigate('/outputs');
            }}
            className="shrink-0 p-1.5 text-[#8a919e] hover:text-[#c8ccd4] transition-colors"
            aria-label={t('common.gallery')}
          >
            <Image className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {/* Search + New workflow */}
      <div className="flex-none z-30 border-b border-white/[0.08] px-4 py-2.5 flex gap-2">
        <div
          className="flex-1 min-w-0 relative flex items-center h-9 pl-3 pr-2 rounded-[9px] border border-white/[0.08] focus-within:border-[#3069f0]/50 transition-colors"
          style={{ background: 'rgba(255,255,255,0.045)' }}
        >
          <Search className="w-3.5 h-3.5 text-[#71798a] shrink-0" strokeWidth={1.8} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workflow.searchPlaceholder')}
            className="flex-1 h-9 min-w-0 border-none bg-transparent dark:bg-transparent shadow-none focus-visible:ring-0 px-2 text-[12.5px] text-[#e9ebef] placeholder:text-[#71798a]"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="shrink-0 text-[#565d6b] hover:text-[#9aa3b2]">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="shrink-0 font-mono text-[10px] text-[#565d6b] border border-white/10 rounded-[4px] px-1.5 py-0.5">
              {workflows.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="shrink-0 h-9 px-3.5 flex items-center gap-1.5 rounded-[9px] bg-[#3069f0] hover:bg-[#3f78f5] text-white text-[12.5px] font-semibold transition-colors"
        >
          <Plus className="w-[13px] h-[13px]" strokeWidth={2.4} />
          {t('workflow.uploadButton')}
        </button>
      </div>

      {/* Folders */}
      <div className="flex-none z-30 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="font-mono text-[10px] font-semibold text-[#565d6b] tracking-[0.14em] shrink-0 uppercase">{t('folder.title')}</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        <div className="flex gap-[7px] overflow-x-auto scrollbar-hide">
          {/* Parent */}
          {currentFolderId && !selectionMode && (
            <button
              onClick={() => setCurrentFolderId(folderStructure.folders[currentFolderId]?.parentId ?? null)}
              className="h-10 shrink-0 flex items-center gap-[9px] px-3 rounded-[9px] border border-white/[0.08] hover:border-white/[0.16] transition-colors"
              style={{ background: 'rgba(255,255,255,0.035)' }}
            >
              <CornerLeftUp className="w-[15px] h-[15px] text-[#71798a]" strokeWidth={1.8} />
              <span className="text-[12.5px] font-medium text-[#9aa3b2] whitespace-nowrap">{t('folder.backToParent')}</span>
            </button>
          )}

          {/* Inline create */}
          {isCreatingFolder && (
            <div
              className="h-10 shrink-0 flex items-center gap-2 px-3 rounded-[9px] border border-[#3069f0]/60"
              style={{ background: 'rgba(48,105,240,0.08)' }}
            >
              <FolderIcon className="w-[15px] h-[15px] text-[#5b8af5] shrink-0" strokeWidth={1.8} />
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
                className="h-8 w-28 min-w-0 border-none bg-transparent dark:bg-transparent shadow-none focus-visible:ring-0 px-0 text-[12.5px] text-[#e9ebef]"
                autoFocus
              />
              <button onClick={handleCreateFolder} className="shrink-0 text-[#5b8af5]">
                <Check className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>
          )}

          {/* Folder tiles */}
          {filteredContents.folders.map((folder) => (
            <div key={folder.id} className="shrink-0">
              <FolderGridItem
                folder={folder}
                onClick={() => handleFolderClick(folder.id)}
                onLongPress={() => {
                  setDetailFolder(folder);
                  setIsFolderDetailModalOpen(true);
                }}
                workflowCount={folder.workflows.length + folder.children.length}
                isSelected={selectedIds.has(folder.id)}
                selectionMode={selectionMode}
              />
            </div>
          ))}

          {/* Add folder (dashed) */}
          {!isCreatingFolder && !selectionMode && (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-[9px] border border-dashed border-white/[0.13] hover:border-white/25 text-[#565d6b] hover:text-[#9aa3b2] transition-colors"
              aria-label={t('folder.newFolder')}
            >
              <Plus className="w-[14px] h-[14px]" strokeWidth={1.8} />
            </button>
          )}

          {/* Empty */}
          {filteredContents.folders.length === 0 && !isCreatingFolder && !currentFolderId && (
            <span className="self-center font-mono text-[10px] text-[#4a5261] px-1 whitespace-nowrap">EMPTY</span>
          )}
        </div>
      </div>

      {/* Workflows label (fixed header) */}
      <div className="flex-none z-30 px-4 pt-1.5 pb-2.5">
        <div className="max-w-[1600px] mx-auto flex items-center gap-2.5">
          <span className="font-mono text-[10px] font-semibold text-[#565d6b] tracking-[0.14em] shrink-0 whitespace-nowrap">
            {t('workflow.listTitle').toUpperCase()} · {filteredContents.workflows.length}
          </span>
          <div className="flex-1 h-px bg-white/[0.06]" />
          {/* Select */}
          <button
            onClick={() => (selectionMode ? exitSelection() : enterSelection())}
            className={`shrink-0 flex items-center gap-1 text-[11px] font-medium transition-colors ${selectionMode ? 'text-[#5b8af5]' : 'text-[#8a919e] hover:text-[#c8ccd4]'
              }`}
          >
            {selectionMode ? <X className="w-3 h-3" strokeWidth={2.2} /> : <ArrowRightLeft className="w-3 h-3" strokeWidth={2} />}
            {selectionMode ? t('workflow.cancelSelection') : t('workflow.selectItems')}
          </button>
          {/* Sort */}
          <button
            onClick={() => {
              const nextSort: SortOrder = selectedSortOrder === 'date-desc' ? 'name-asc' : 'date-desc';
              setSortOrder(nextSort);
            }}
            className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#8a919e] hover:text-[#c8ccd4] transition-colors"
          >
            <ArrowUpDown className="w-3 h-3" strokeWidth={2} />
            {selectedSortOrder.includes('date') ? t('workflow.sorting.newest') : t('workflow.sorting.name')}
          </button>
        </div>
      </div>

      {/* Main scroll (workflow grid only) */}
      <main className="flex-1 overflow-y-auto w-full" style={{ background: '#0b0c0f' }}>
        <div className="max-w-[1600px] mx-auto px-4">
          {error && (
            <div className="mb-3 rounded-[10px] border border-[#f25555]/30 bg-[#f25555]/10 px-3 py-2.5 text-[#f87c7c] text-[12px]">
              {error}
            </div>
          )}

          {/* Workflow grid */}
          {filteredContents.workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="w-9 h-9 text-white/[0.12] mb-3" strokeWidth={1.4} />
              <h3 className="text-[14px] font-semibold text-[#c8ccd4]">{t('workflow.noWorkflows')}</h3>
              <p className="text-[12px] text-[#66758a] mt-1 max-w-xs">{t('workflow.noWorkflowsSub')}</p>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="mt-5 h-9 px-4 flex items-center gap-1.5 rounded-[9px] bg-[#3069f0] hover:bg-[#3f78f5] text-white text-[12.5px] font-semibold transition-colors"
              >
                <Plus className="w-[13px] h-[13px]" strokeWidth={2.4} />
                {t('workflow.uploadButton')}
              </button>
            </div>
          ) : (
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 ${selectionMode ? 'pb-32' : 'pb-20'}`}>
              {filteredContents.workflows.map((workflow) => (
                <WorkflowGridItem
                  key={workflow.id}
                  workflow={workflow}
                  onClick={() => handleWorkflowClick(workflow)}
                  onLongPress={() => {
                    setDetailWorkflow(workflow);
                    setIsDetailModalOpen(true);
                  }}
                  isSelected={selectedIds.has(workflow.id)}
                  selectionMode={selectionMode}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Selection action bar (floating) */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-x-0 z-40 flex justify-center px-4"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div
              className="flex items-center gap-2 p-1.5 rounded-[14px] border border-white/[0.09]"
              style={{ background: 'rgba(15,17,22,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
            >
              <span className="pl-2 pr-1 font-mono text-[11px] text-[#8a919e] whitespace-nowrap">
                {t('workflow.selectedCount', { count: selectedIds.size })}
              </span>
              <span className="w-px h-5 bg-white/[0.08]" />
              <button
                onClick={openMoveForSelection}
                disabled={selectedIds.size === 0}
                className="h-9 px-3.5 flex items-center gap-1.5 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] text-white text-[12px] font-semibold disabled:opacity-40 transition-colors"
              >
                <FolderInput className="w-3.5 h-3.5" strokeWidth={1.9} />
                {t('workflow.move')}
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
                className="h-9 px-3.5 flex items-center gap-1.5 rounded-[10px] border border-[#f25555]/30 bg-[#f25555]/[0.12] text-[#f87c7c] text-[12px] font-semibold disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.9} />
                {t('common.delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={handleSideMenuClose}
        onServerSettingsClick={() => handleNavigation('/settings/server')}
        onApiKeysClick={() => handleNavigation('/settings/api-keys')}
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
        onMove={(wf) => {
          setIsDetailModalOpen(false);
          setDetailWorkflow(null);
          openMoveSheet(
            [{ id: wf.id, type: 'workflow', sourceFolderId: findSourceFolderId(wf.id, 'workflow') }],
            wf.name
          );
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
          onMove={(folder) => {
            setIsFolderDetailModalOpen(false);
            setDetailFolder(null);
            openMoveSheet(
              [{ id: folder.id, type: 'folder', sourceFolderId: findSourceFolderId(folder.id, 'folder') }],
              folder.name
            );
          }}
        />
      )}

      {/* Move to folder sheet */}
      <MoveToFolderSheet
        isOpen={moveSheetItems !== null}
        items={moveSheetItems || []}
        itemLabel={moveSheetLabel}
        folderStructure={folderStructure}
        onClose={() => {
          setMoveSheetItems(null);
          setMoveSheetLabel(undefined);
        }}
        onConfirm={handleConfirmMove}
        onCreateFolder={createFolder}
      />

      {/* Bulk delete confirmation */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowBulkDeleteConfirm(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-[300px] bg-[#101217] rounded-xl shadow-2xl border border-white/10 p-4 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] border flex items-center justify-center" style={{ background: 'rgba(242,85,85,0.1)', borderColor: 'rgba(242,85,85,0.3)' }}>
                  <AlertTriangle className="w-4 h-4 text-[#f25555]" strokeWidth={1.8} />
                </div>
                <h3 className="text-[14px] font-bold text-[#e9ebef] leading-tight">
                  {t('workflow.deleteSelectedConfirm')}
                </h3>
                <p className="text-[11.5px] text-[#8a919e] leading-relaxed">
                  {t('workflow.deleteSelectedMessage')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  variant="outline"
                  className="flex-1 h-9 rounded-[10px] text-[12px] bg-white/[0.05] border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.07]"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  className="flex-1 h-9 rounded-[10px] text-[12px] font-semibold bg-[#f25555] hover:bg-[#f36d6d] text-white border-none"
                >
                  {t('common.delete')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkflowList;
