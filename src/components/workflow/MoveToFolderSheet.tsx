import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Folder,
  FolderPlus,
  ChevronRight,
  CornerLeftUp,
  Check,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderStructure } from '@/types/folder';

export interface MoveItem {
  id: string;
  type: 'workflow' | 'folder';
  /** Folder the item currently lives in (null = root). */
  sourceFolderId: string | null;
}

interface MoveToFolderSheetProps {
  isOpen: boolean;
  items: MoveItem[];
  /** Name to show in the header chip when moving a single item. */
  itemLabel?: string;
  folderStructure: FolderStructure;
  onClose: () => void;
  onConfirm: (targetFolderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => string;
}

/**
 * Destination picker for moving workflows / folders. Instead of "carrying" an
 * item and tapping a target (which can't reach nested or cross-branch folders),
 * the user browses the folder tree here and taps "move here" at any level.
 * Folders being moved (and their descendants) are disabled as targets.
 */
const MoveToFolderSheet: React.FC<MoveToFolderSheetProps> = ({
  isOpen,
  items,
  itemLabel,
  folderStructure,
  onClose,
  onConfirm,
  onCreateFolder,
}) => {
  const { t } = useTranslation();
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Start each open at Home so the destination choice is predictable.
  useEffect(() => {
    if (isOpen) {
      setPickerFolderId(null);
      setIsCreating(false);
      setNewName('');
    }
  }, [isOpen]);

  // A folder can't be moved into itself or any of its descendants.
  const blockedIds = useMemo(() => {
    const blocked = new Set<string>();
    const addSubtree = (id: string) => {
      if (blocked.has(id)) return;
      blocked.add(id);
      folderStructure.folders[id]?.children.forEach(addSubtree);
    };
    items.filter((i) => i.type === 'folder').forEach((i) => addSubtree(i.id));
    return blocked;
  }, [items, folderStructure]);

  const sourceIds = useMemo(
    () => new Set(items.map((i) => i.sourceFolderId)),
    [items]
  );

  const childFolders = useMemo(() => {
    const ids = pickerFolderId
      ? folderStructure.folders[pickerFolderId]?.children || []
      : folderStructure.rootFolders;
    return ids
      .map((id) => folderStructure.folders[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pickerFolderId, folderStructure]);

  const crumbs = useMemo(() => {
    const path: { id: string | null; name: string }[] = [];
    let curr = pickerFolderId;
    while (curr) {
      const f = folderStructure.folders[curr];
      if (!f) break;
      path.unshift({ id: curr, name: f.name });
      curr = f.parentId;
    }
    return [{ id: null, name: t('folder.home') }, ...path];
  }, [pickerFolderId, folderStructure, t]);

  // Moving to the folder the items already live in is a no-op.
  const allAlreadyHere = items.length > 0 && items.every((it) => it.sourceFolderId === pickerFolderId);
  const currentFolderName = pickerFolderId ? folderStructure.folders[pickerFolderId]?.name : null;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const newId = onCreateFolder(name, pickerFolderId);
    setNewName('');
    setIsCreating(false);
    setPickerFolderId(newId);
  };

  const chipText =
    items.length === 1 && itemLabel ? itemLabel : t('folder.movingItems', { count: items.length });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full sm:max-w-md max-h-[82vh] flex flex-col bg-[#101217] rounded-t-xl sm:rounded-xl shadow-2xl border border-white/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber */}
            <div className="sm:hidden pt-2 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-white/[0.15]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-[13px] font-bold text-[#e9ebef] shrink-0">
                  {t('folder.moveTitle')}
                </h2>
                <span className="inline-flex items-center gap-1.5 min-w-0 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 text-xs font-medium">
                  {items.length === 1 && itemLabel ? (
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{chipText}</span>
                </span>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.08] transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4 text-[#9aa3b2]" />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 px-5 py-2.5 overflow-x-auto scrollbar-hide text-[12px] whitespace-nowrap border-b border-white/[0.07]">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.id || 'root'}>
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#565d6b] shrink-0" />}
                  <button
                    onClick={() => setPickerFolderId(c.id)}
                    className={`inline-flex items-center gap-1 transition-colors ${
                      i === crumbs.length - 1
                        ? 'text-[#e9ebef] font-semibold'
                        : 'text-[#71798a] hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {c.id === null && <Home className="w-3.5 h-3.5" />}
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Folder list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 min-h-[120px]">
              {/* Up one level */}
              {pickerFolderId && (
                <button
                  onClick={() =>
                    setPickerFolderId(folderStructure.folders[pickerFolderId]?.parentId ?? null)
                  }
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06]/60 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.05] text-[#565d6b] flex items-center justify-center shrink-0">
                    <CornerLeftUp className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-[12px] text-[#71798a]">{t('folder.goUp')}</span>
                </button>
              )}

              {childFolders.length === 0 && !pickerFolderId && (
                <div className="py-8 text-center text-[12px] text-[#565d6b]">
                  {t('folder.noFolders')}
                </div>
              )}
              {childFolders.length === 0 && pickerFolderId && (
                <div className="py-8 text-center text-[12px] text-[#565d6b]">
                  {t('folder.noSubfolders')}
                </div>
              )}

              {childFolders.map((folder) => {
                const blocked = blockedIds.has(folder.id);
                const isSource = sourceIds.has(folder.id);
                const count = folder.workflows.length + folder.children.length;
                return (
                  <button
                    key={folder.id}
                    disabled={blocked}
                    onClick={() => !blocked && setPickerFolderId(folder.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      blocked
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-white/[0.06]/60'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                      <Folder className="w-4.5 h-4.5 fill-current opacity-80" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[12px] font-medium text-[#d5d9e0] truncate">
                        {folder.name}
                      </div>
                      <div className="text-xs text-[#565d6b] truncate">
                        {blocked
                          ? t('folder.movingItems', { count: 1 })
                          : isSource
                          ? t('folder.currentLocation')
                          : `${count} ${count === 1 ? t('common.item') : t('common.items')}`}
                      </div>
                    </div>
                    {!blocked && <ChevronRight className="w-4 h-4 text-[#565d6b] shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* New folder inline input */}
            {isCreating && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.08]">
                <Folder className="w-5 h-5 text-amber-500 shrink-0" />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewName('');
                    }
                  }}
                  placeholder={t('folder.namePlaceholder')}
                  className="h-9 flex-1 min-w-0"
                  autoFocus
                />
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="h-9 shrink-0">
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.08] bg-[#0f1116]/90">
              <Button
                variant="outline"
                onClick={() => setIsCreating((v) => !v)}
                className="h-11 gap-2 shrink-0 rounded-xl"
              >
                <FolderPlus className="w-4.5 h-4.5" />
                <span className="hidden xs:inline">{t('folder.newFolder')}</span>
              </Button>
              <Button
                onClick={() => onConfirm(pickerFolderId)}
                disabled={allAlreadyHere}
                className="h-11 flex-1 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border-none disabled:opacity-40"
              >
                <Check className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">
                  {currentFolderName
                    ? t('folder.moveIntoNamed', { name: currentFolderName })
                    : t('folder.moveIntoHome')}
                </span>
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MoveToFolderSheet;
