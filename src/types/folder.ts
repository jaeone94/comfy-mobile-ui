/**
 * Folder system types for workflow organization
 * Stored in localStorage, references workflows by ID from IndexedDB
 */

export type SortOrder = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

export interface FolderItem {
  id: string;
  name: string;
  type: 'folder';
  parentId: string | null; // null for root level
  createdAt: number;
  children: string[]; // IDs of child folders
  workflows: string[]; // IDs of workflows in this folder
}

export interface FolderStructure {
  folders: Record<string, FolderItem>; // key: folder ID
  rootFolders: string[]; // IDs of root level folders
  rootWorkflows: string[]; // IDs of workflows at root level
  sortOrder: SortOrder;
  version: number; // For future migrations
}

export interface MoveOperation {
  itemId: string;
  itemType: 'workflow' | 'folder';
  targetFolderId: string | null; // null for root
  sourceFolderId: string | null; // null for root
}

export const FOLDER_STORAGE_KEY = 'comfy-workflow-folders';
export const FOLDER_VERSION = 1;
