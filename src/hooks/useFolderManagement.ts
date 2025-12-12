import { useState, useEffect, useCallback } from 'react';
import {
  FolderStructure,
  FolderItem,
  MoveOperation,
  SortOrder,
  FOLDER_STORAGE_KEY,
  FOLDER_VERSION,
} from '../types/folder';

// deduplicate helper
const deduplicate = <T>(array: T[]): T[] => Array.from(new Set(array));

const sanitizeFolderStructure = (structure: FolderStructure): FolderStructure => {
  const sanitized = { ...structure };

  // Sanitize root
  sanitized.rootFolders = deduplicate(sanitized.rootFolders);
  sanitized.rootWorkflows = deduplicate(sanitized.rootWorkflows);

  // Sanitize all folders
  const newFolders: Record<string, FolderItem> = {};
  Object.entries(sanitized.folders).forEach(([id, folder]) => {
    newFolders[id] = {
      ...folder,
      children: deduplicate(folder.children),
      workflows: deduplicate(folder.workflows),
    };
  });
  sanitized.folders = newFolders;

  return sanitized;
};

const getDefaultFolderStructure = (): FolderStructure => ({
  folders: {},
  rootFolders: [],
  rootWorkflows: [],
  sortOrder: 'date-desc',
  version: FOLDER_VERSION,
});

const loadFolderStructure = (): FolderStructure => {
  try {
    const stored = localStorage.getItem(FOLDER_STORAGE_KEY);
    if (!stored) return getDefaultFolderStructure();

    const parsed = JSON.parse(stored) as FolderStructure;

    // Version migration logic can be added here
    if (parsed.version !== FOLDER_VERSION) {
      console.warn('Folder structure version mismatch, using default');
      return getDefaultFolderStructure();
    }

    // Sanitize structure on load to fix any corruption
    return sanitizeFolderStructure(parsed);
  } catch (error) {
    console.error('Failed to load folder structure:', error);
    return getDefaultFolderStructure();
  }
};

const saveFolderStructure = (structure: FolderStructure): void => {
  try {
    localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(structure));
  } catch (error) {
    console.error('Failed to save folder structure:', error);
  }
};

export const useFolderManagement = () => {
  const [folderStructure, setFolderStructure] = useState<FolderStructure>(loadFolderStructure);
  const [pendingStructure, setPendingStructure] = useState<FolderStructure | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Get current structure (pending if in edit mode, otherwise saved)
  const currentStructure = isEditMode && pendingStructure ? pendingStructure : folderStructure;

  // Initialize root workflows from all workflow IDs
  const initializeRootWorkflows = useCallback((workflowIds: string[]) => {
    setFolderStructure(prev => {
      // Get all workflows that are already in folders
      const workflowsInFolders = new Set<string>();
      Object.values(prev.folders).forEach(folder => {
        folder.workflows.forEach(wfId => workflowsInFolders.add(wfId));
      });

      // All workflows not in folders go to root
      const rootWorkflows = workflowIds.filter(id => !workflowsInFolders.has(id));

      const updated = {
        ...prev,
        // Ensure rootWorkflows are unique
        rootWorkflows: deduplicate(rootWorkflows),
      };

      saveFolderStructure(updated);
      return updated;
    });
  }, []);

  // Create a new folder
  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const updateStructure = (prev: FolderStructure): FolderStructure => {
      const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newFolder: FolderItem = {
        id: newFolderId,
        name,
        type: 'folder',
        parentId,
        createdAt: Date.now(),
        children: [],
        workflows: [],
      };

      const updated = {
        ...prev,
        folders: {
          ...prev.folders,
          [newFolderId]: newFolder,
        },
      };

      // Add to parent's children or root
      if (parentId) {
        const parent = updated.folders[parentId];
        if (parent) {
          updated.folders[parentId] = {
            ...parent,
            children: deduplicate([...parent.children, newFolderId]),
          };
        }
      } else {
        updated.rootFolders = deduplicate([...updated.rootFolders, newFolderId]);
      }

      return updated;
    };

    if (isEditMode && pendingStructure) {
      setPendingStructure(updateStructure(pendingStructure));
    } else {
      setFolderStructure(prev => {
        const updated = updateStructure(prev);
        saveFolderStructure(updated);
        return updated;
      });
    }
  }, [isEditMode, pendingStructure]);

  // Rename a folder
  const renameFolder = useCallback((folderId: string, newName: string) => {
    const updateStructure = (prev: FolderStructure): FolderStructure => {
      const folder = prev.folders[folderId];
      if (!folder) return prev;

      return {
        ...prev,
        folders: {
          ...prev.folders,
          [folderId]: {
            ...folder,
            name: newName,
          },
        },
      };
    };

    if (isEditMode && pendingStructure) {
      setPendingStructure(updateStructure(pendingStructure));
    } else {
      setFolderStructure(prev => {
        const updated = updateStructure(prev);
        saveFolderStructure(updated);
        return updated;
      });
    }
  }, [isEditMode, pendingStructure]);

  // Delete a folder (moves contents to parent or root)
  const deleteFolder = useCallback((folderId: string) => {
    const updateStructure = (prev: FolderStructure): FolderStructure => {
      const folder = prev.folders[folderId];
      if (!folder) return prev;

      const updated = { ...prev };
      const { parentId, children, workflows } = folder;

      // Remove folder from folders
      const { [folderId]: _, ...remainingFolders } = updated.folders;
      updated.folders = remainingFolders;

      // Move children and workflows to parent or root
      if (parentId) {
        const parent = updated.folders[parentId];
        if (parent) {
          updated.folders[parentId] = {
            ...parent,
            children: deduplicate(parent.children.filter(id => id !== folderId).concat(children)),
            workflows: deduplicate([...parent.workflows, ...workflows]),
          };
        }
      } else {
        // Move to root
        updated.rootFolders = deduplicate(updated.rootFolders.filter(id => id !== folderId).concat(children));
        updated.rootWorkflows = deduplicate([...updated.rootWorkflows, ...workflows]);
      }

      return updated;
    };

    if (isEditMode && pendingStructure) {
      setPendingStructure(updateStructure(pendingStructure));
    } else {
      setFolderStructure(prev => {
        const updated = updateStructure(prev);
        saveFolderStructure(updated);
        return updated;
      });
    }
  }, [isEditMode, pendingStructure]);

  // Move workflow or folder
  const moveItem = useCallback((operation: MoveOperation) => {
    const updateStructure = (prev: FolderStructure): FolderStructure => {
      const { itemId, itemType, targetFolderId, sourceFolderId } = operation;
      const updated = { ...prev };

      // Remove from source
      if (itemType === 'workflow') {
        if (sourceFolderId) {
          const sourceFolder = updated.folders[sourceFolderId];
          if (sourceFolder) {
            updated.folders[sourceFolderId] = {
              ...sourceFolder,
              workflows: sourceFolder.workflows.filter(id => id !== itemId),
            };
          }
        } else {
          updated.rootWorkflows = updated.rootWorkflows.filter(id => id !== itemId);
        }

        // Add to target
        if (targetFolderId) {
          const targetFolder = updated.folders[targetFolderId];
          if (targetFolder) {
            updated.folders[targetFolderId] = {
              ...targetFolder,
              workflows: deduplicate([...targetFolder.workflows, itemId]),
            };
          }
        } else {
          updated.rootWorkflows = deduplicate([...updated.rootWorkflows, itemId]);
        }
      } else {
        // Moving folder
        // Prevent moving folder into itself or its descendants
        const isDescendant = (folderId: string, ancestorId: string): boolean => {
          if (folderId === ancestorId) return true;
          const folder = updated.folders[folderId];
          if (!folder || !folder.parentId) return false;
          return isDescendant(folder.parentId, ancestorId);
        };

        if (targetFolderId && isDescendant(targetFolderId, itemId)) {
          console.warn('Cannot move folder into itself or its descendant');
          return prev;
        }

        // Remove from source parent
        if (sourceFolderId) {
          const sourceFolder = updated.folders[sourceFolderId];
          if (sourceFolder) {
            updated.folders[sourceFolderId] = {
              ...sourceFolder,
              children: sourceFolder.children.filter(id => id !== itemId),
            };
          }
        } else {
          updated.rootFolders = updated.rootFolders.filter(id => id !== itemId);
        }

        // Update folder's parent
        const folder = updated.folders[itemId];
        if (folder) {
          updated.folders[itemId] = {
            ...folder,
            parentId: targetFolderId,
          };
        }

        // Add to target parent
        if (targetFolderId) {
          const targetFolder = updated.folders[targetFolderId];
          if (targetFolder) {
            updated.folders[targetFolderId] = {
              ...targetFolder,
              children: deduplicate([...targetFolder.children, itemId]),
            };
          }
        } else {
          updated.rootFolders = deduplicate([...updated.rootFolders, itemId]);
        }
      }

      return updated;
    };

    // Always update persistent structure and save immediately
    setFolderStructure(prev => {
      const updated = updateStructure(prev);
      saveFolderStructure(updated);
      return updated;
    });

    // If in edit mode, also update pending structure to keep UI in sync
    if (isEditMode && pendingStructure) {
      setPendingStructure(updateStructure(pendingStructure));
    }
  }, [isEditMode, pendingStructure]);

  // Set sort order
  const setSortOrder = useCallback((sortOrder: SortOrder) => {
    setFolderStructure(prev => {
      const updated = {
        ...prev,
        sortOrder,
      };
      saveFolderStructure(updated);
      return updated;
    });
  }, []);

  // Enter edit mode
  const enterEditMode = useCallback(() => {
    setPendingStructure({ ...folderStructure });
    setIsEditMode(true);
  }, [folderStructure]);

  // Exit edit mode and save changes
  const saveEditMode = useCallback(() => {
    if (pendingStructure) {
      saveFolderStructure(pendingStructure);
      setFolderStructure(pendingStructure);
    }
    setPendingStructure(null);
    setIsEditMode(false);
  }, [pendingStructure]);

  // Exit edit mode and discard changes
  const cancelEditMode = useCallback(() => {
    setPendingStructure(null);
    setIsEditMode(false);
  }, []);

  // Remove workflow from folder structure (when workflow is deleted)
  const removeWorkflow = useCallback((workflowId: string) => {
    setFolderStructure(prev => {
      const updated = { ...prev };

      // Remove from root
      updated.rootWorkflows = updated.rootWorkflows.filter(id => id !== workflowId);

      // Remove from all folders
      Object.keys(updated.folders).forEach(folderId => {
        const folder = updated.folders[folderId];
        if (folder.workflows.includes(workflowId)) {
          updated.folders[folderId] = {
            ...folder,
            workflows: folder.workflows.filter(id => id !== workflowId),
          };
        }
      });

      saveFolderStructure(updated);
      return updated;
    });
  }, []);

  return {
    folderStructure: currentStructure,
    isEditMode,
    createFolder,
    renameFolder,
    deleteFolder,
    moveItem,
    setSortOrder,
    initializeRootWorkflows,
    removeWorkflow,
    enterEditMode,
    saveEditMode,
    cancelEditMode,
  };
};
