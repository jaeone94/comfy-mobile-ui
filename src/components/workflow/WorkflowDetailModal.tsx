import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, User, Tag, FileText, AlertCircle, Server, Play, Copy, Trash2, Plus, Check } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { motion, AnimatePresence } from 'framer-motion';
import { updateWorkflow, removeWorkflow, addWorkflow, loadAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { toast } from 'sonner';
import { generateUUID } from '@/utils/uuid';

interface WorkflowDetailModalProps {
  isOpen: boolean;
  workflow: Workflow | null;
  onClose: () => void;
  onSelect: (workflow: Workflow) => void;
  onWorkflowUpdated?: (updatedWorkflow: Workflow) => void;
  onWorkflowDeleted?: (workflowId: string) => void;
  onWorkflowCopied?: (newWorkflow: Workflow) => void;
}

const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  isOpen,
  workflow,
  onClose,
  onSelect,
  onWorkflowUpdated,
  onWorkflowDeleted,
  onWorkflowCopied,
}) => {
  const { t } = useTranslation();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(workflow?.thumbnail);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workflow) {
      setThumbnailUrl(workflow.thumbnail);
      setName(workflow.name);
      setDescription(workflow.description || '');
      setTags(workflow.tags || []);
      setNewTag('');
      setShowDeleteConfirm(false);

      const generateMissingThumbnail = async () => {
        if (workflow.nodeCount > 0 && !workflow.thumbnail && workflow.workflow_json) {
          try {
            const thumbnail = generateWorkflowThumbnail({
              nodes: (workflow.workflow_json.nodes || []) as any,
              links: (workflow.workflow_json.links || []) as any,
              groups: (workflow.workflow_json.groups || []) as any
            });

            if (thumbnail) {
              setThumbnailUrl(thumbnail);
            }
          } catch (error) {
            console.error('Failed to auto-generate thumbnail:', error);
          }
        }
      };

      generateMissingThumbnail();
    }
  }, [workflow]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOpenClick = () => {
    if (workflow) {
      onSelect(workflow);
      onClose();
    }
  };

  const handleSave = useCallback(async (updates: Partial<Workflow>) => {
    if (!workflow) return;

    try {
      const updatedWorkflow: Workflow = {
        ...workflow,
        ...updates,
        modifiedAt: new Date()
      };

      await updateWorkflow(updatedWorkflow);

      if (onWorkflowUpdated) {
        onWorkflowUpdated(updatedWorkflow);
      }
    } catch (error) {
      console.error('Failed to update workflow:', error);
      toast.error(t('workflow.updateError'));
    }
  }, [workflow, onWorkflowUpdated]);

  const handleNameBlur = () => {
    if (workflow && name.trim() !== workflow.name) {
      handleSave({ name: name.trim() });
    }
  };

  const handleDescriptionBlur = () => {
    if (workflow && description.trim() !== (workflow.description || '')) {
      handleSave({ description: description.trim() });
    }
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      const newTags = [...tags, trimmedTag];
      setTags(newTags);
      setNewTag('');
      handleSave({ tags: newTags });
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = tags.filter(tag => tag !== tagToRemove);
    setTags(newTags);
    handleSave({ tags: newTags });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleCopyWorkflow = async () => {
    if (!workflow) return;

    setIsLoading(true);
    try {
      const allWorkflows = await loadAllWorkflows();
      const baseName = workflow.name.replace(/_\d+$/, '');
      const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:_(\\d+))?$`);

      let maxNumber = 0;
      allWorkflows.forEach(w => {
        const match = w.name.match(regex);
        if (match) {
          const num = match[1] ? parseInt(match[1]) : 0;
          maxNumber = Math.max(maxNumber, num);
        }
      });

      const newNumber = maxNumber + 1;
      const newName = `${baseName}_${newNumber.toString().padStart(2, '0')}`;

      const newId = generateUUID();

      const copiedWorkflow: Workflow = {
        ...workflow,
        id: newId,
        name: newName,
        createdAt: new Date(),
        modifiedAt: new Date()
      };

      await addWorkflow(copiedWorkflow);
      toast.success(t('workflow.copySuccess', { name: newName }));

      onClose();

      setTimeout(() => {
        if (onWorkflowCopied) {
          onWorkflowCopied(copiedWorkflow);
        }
      }, 0);
    } catch (error) {
      console.error('Failed to copy workflow:', error);
      toast.error(t('workflow.copyError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;

    setIsLoading(true);
    try {
      await removeWorkflow(workflow.id);

      if (onWorkflowDeleted) {
        onWorkflowDeleted(workflow.id);
      }

      onClose();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error(t('workflow.deleteError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && workflow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />

            {/* Header with Close Button */}
            <div className="relative z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 dark:border-slate-600/10 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${workflow.isValid
                  ? 'bg-blue-500/15 dark:bg-blue-500/20 border border-blue-400/30'
                  : 'bg-red-500/15 dark:bg-red-500/20 border border-red-400/30'
                  }`}>
                  {workflow.isValid ? (
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleNameBlur}
                    className="text-lg font-bold text-slate-900 dark:text-slate-100 bg-transparent border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-400"
                    placeholder={t('workflow.namePlaceholder')}
                  />
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {t('workflow.details')}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 ml-3 p-2 bg-white/30 dark:bg-slate-700/30 backdrop-blur-sm border border-white/20 dark:border-slate-600/20 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all duration-200 rounded-xl"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="relative z-10 overflow-y-auto flex-1">
              <div className="p-6 space-y-6">
                {/* Thumbnail */}
                <div
                  className="w-full aspect-video rounded-2xl overflow-hidden bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/30 dark:border-slate-600/30 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={handleOpenClick}
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={workflow.name}
                      className="w-full h-full object-cover"
                    />
                  ) : workflow.isValid ? (
                    <FileText className="w-16 h-16 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <AlertCircle className="w-16 h-16 text-red-500" />
                  )}
                </div>

                {/* Status and Node Count */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-xs font-medium backdrop-blur-md bg-blue-500/10 dark:bg-blue-500/15 border-blue-400/30 dark:border-blue-500/30 text-blue-700 dark:text-blue-300"
                  >
                    {workflow.nodeCount} {workflow.nodeCount === 1 ? t('workflow.node') : t('workflow.nodes')}
                  </Badge>
                  {!workflow.isValid && (
                    <Badge
                      variant="destructive"
                      className="px-3 py-1.5 text-xs bg-red-500/15 border-red-400/30 text-red-700 dark:text-red-400"
                    >
                      {t('workflow.invalid')}
                    </Badge>
                  )}
                  {(workflow as any).isServerWorkflow && (
                    <Badge
                      variant="outline"
                      className="px-3 py-1.5 text-xs bg-purple-500/10 border-purple-400/30 text-purple-700 dark:text-purple-300 flex items-center gap-1.5"
                    >
                      <Server className="w-3 h-3" />
                      {t('workflow.server')}
                    </Badge>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>{t('workflow.description')}</span>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    placeholder={t('workflow.descriptionPlaceholder')}
                    className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl border-white/20 dark:border-slate-600/20 resize-none min-h-[80px]"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <span>{t('workflow.tags')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="px-2 py-1 text-xs bg-slate-100/50 dark:bg-slate-700/50 backdrop-blur-md border border-slate-200/30 dark:border-slate-600/30 text-slate-700 dark:text-slate-300 pr-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('workflow.tagPlaceholder')}
                      className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border-white/20 dark:border-slate-600/20 h-9"
                    />
                    <Button
                      onClick={handleAddTag}
                      disabled={!newTag.trim()}
                      size="sm"
                      variant="outline"
                      className="h-9 w-9 p-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Metadata Section */}
                <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 space-y-3">
                  {/* Created At */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100/50 dark:bg-slate-700/50 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('workflow.created')}</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {new Date(workflow.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Author */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100/50 dark:bg-slate-700/50 flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('workflow.author')}</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {workflow.author || t('common.unknown')}
                      </p>
                    </div>
                  </div>

                  {/* Modified At */}
                  {workflow.modifiedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100/50 dark:bg-slate-700/50 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('workflow.modified')}</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {new Date(workflow.modifiedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>


              </div>
            </div>

            {/* Footer - Action Buttons */}
            <div className="relative z-50 px-6 py-4 border-t border-white/10 dark:border-slate-600/10 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl flex-shrink-0">
              <div className="flex gap-3">
                <Button
                  onClick={handleOpenClick}
                  className="flex-[2] bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  {t('common.open')}
                </Button>
                <Button
                  onClick={handleCopyWorkflow}
                  variant="outline"
                  className="flex-1 py-6 rounded-2xl bg-white/50 dark:bg-slate-700/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-600/50 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 flex items-center justify-center gap-2"
                  title={t('workflow.copyWorkflow')}
                  disabled={isLoading}
                >
                  <Copy className="w-5 h-5" />
                </Button>
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="flex-1 py-6 rounded-2xl bg-white/50 dark:bg-slate-700/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-600/50 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all duration-200 flex items-center justify-center gap-2"
                  title={t('workflow.deleteWorkflow')}
                  disabled={isLoading}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            </div>
            {/* Delete Confirmation Overlay */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[60] bg-white/60 dark:bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6"
                  >
                    <div className="flex flex-col items-center text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('workflow.deleteConfirmTitle')}</h3>
                      <p className="text-slate-500 dark:text-slate-400">
                        {t('workflow.deleteConfirmMessage')}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowDeleteConfirm(false)}
                        variant="outline"
                        className="flex-1 h-12 rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        onClick={handleDelete}
                        variant="destructive"
                        className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                        disabled={isLoading}
                      >
                        {isLoading ? t('common.loading') : t('common.delete')}
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkflowDetailModal;
