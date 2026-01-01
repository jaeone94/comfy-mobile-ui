import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { X, Plus, Save, Trash2, RefreshCw, Copy, ArrowLeft } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { updateWorkflow, removeWorkflow, addWorkflow, loadAllWorkflows } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { generateUUID } from '@/utils/uuid';

interface WorkflowEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: Workflow | null;
  onWorkflowUpdated: (updatedWorkflow: Workflow) => void;
  onWorkflowDeleted?: (workflowId: string) => void;
  onWorkflowCopied?: (newWorkflow: Workflow) => void;
}

const WorkflowEditModal: React.FC<WorkflowEditModalProps> = ({
  isOpen,
  onClose,
  workflow,
  onWorkflowUpdated,
  onWorkflowDeleted,
  onWorkflowCopied
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRegeneratingThumbnail, setIsRegeneratingThumbnail] = useState(false);

  // Prevent body scroll and pull-to-refresh when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isOpen]);

  // Initialize form with workflow data
  useEffect(() => {
    if (workflow && isOpen) {
      setName(workflow.name);
      setDescription(workflow.description || '');
      setTags(workflow.tags || []);
      setNewTag('');
      setShowDeleteConfirm(false);
    }
  }, [workflow, isOpen]);

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!workflow || !name.trim()) return;

    setIsLoading(true);
    try {
      const updatedWorkflow: Workflow = {
        ...workflow,
        name: name.trim(),
        description: description.trim(),
        tags: tags.filter(tag => tag.trim()),
        modifiedAt: new Date()
      };

      // Update in storage
      await updateWorkflow(updatedWorkflow);

      // Notify parent component
      onWorkflowUpdated(updatedWorkflow);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to update workflow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;

    setIsLoading(true);
    try {
      // Remove from storage
      await removeWorkflow(workflow.id);

      // Notify parent component
      if (onWorkflowDeleted) {
        onWorkflowDeleted(workflow.id);
      }

      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateThumbnail = async () => {
    if (!workflow) return;

    setIsRegeneratingThumbnail(true);
    try {
      // Generate new thumbnail
      const newThumbnail = generateWorkflowThumbnail({
        nodes: (workflow.workflow_json.nodes || []) as any,
        links: (workflow.workflow_json.links || []) as any,
        groups: (workflow.workflow_json.groups || []) as any
      });

      // Update workflow with new thumbnail
      const updatedWorkflow: Workflow = {
        ...workflow,
        thumbnail: newThumbnail,
        modifiedAt: new Date()
      };

      // Update in storage
      await updateWorkflow(updatedWorkflow);

      // Notify parent component
      onWorkflowUpdated(updatedWorkflow);

      toast.success(t('workflow.thumbnailSuccess'));
    } catch (error) {
      console.error('Failed to regenerate thumbnail:', error);
      toast.error(t('workflow.thumbnailError'));
    } finally {
      setIsRegeneratingThumbnail(false);
    }
  };

  const handleClose = () => {
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleCopyWorkflow = async () => {
    if (!workflow) return;

    setIsLoading(true);
    try {
      // Load all existing workflows to find duplicate names
      const allWorkflows = await loadAllWorkflows();

      // Find the highest number suffix for workflows with similar names
      const baseName = workflow.name.replace(/_\d+$/, ''); // Remove existing number suffix
      const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:_(\\d+))?$`);

      let maxNumber = 0;
      allWorkflows.forEach(w => {
        const match = w.name.match(regex);
        if (match) {
          const num = match[1] ? parseInt(match[1]) : 0;
          maxNumber = Math.max(maxNumber, num);
        }
      });

      // Create new workflow with incremented suffix
      const newNumber = maxNumber + 1;
      const newName = `${baseName}_${newNumber.toString().padStart(2, '0')}`;

      // Generate new ID using crypto.randomUUID() or fallback
      const newId = generateUUID();

      const copiedWorkflow: Workflow = {
        ...workflow,
        id: newId,
        name: newName,
        createdAt: new Date(),
        modifiedAt: new Date()
      };

      // Add to storage
      await addWorkflow(copiedWorkflow);

      toast.success(t('workflow.copySuccess', { name: newName }));

      // Close modal first
      onClose();

      // Notify parent component after modal is closed to ensure state update happens
      // Use setTimeout to ensure the callback runs after modal close animation
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

  if (!workflow) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex flex-col"
          style={{ overscrollBehavior: 'contain' }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 shadow-lg">
            <div className="max-w-4xl mx-auto px-6 py-4">
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleClose}
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0"
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {t('workflow.editTitle')}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t('workflow.editSubtitle')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
            <div className="max-w-4xl mx-auto px-6 py-8">
              {!showDeleteConfirm ? (
                <div className="space-y-6">
                  {/* Workflow Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('workflow.name')}
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('workflow.namePlaceholder')}
                      className="w-full"
                      autoFocus={false}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('workflow.description')}
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                      placeholder={t('workflow.descriptionPlaceholder')}
                      rows={3}
                      className="w-full resize-none"
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('workflow.tags')}
                    </Label>

                    {/* Existing Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                          >
                            {tag}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveTag(tag);
                              }}
                              className="ml-1 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Add New Tag */}
                    <div className="flex gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('workflow.tagPlaceholder')}
                        className="flex-1"
                      />
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddTag();
                        }}
                        disabled={!newTag.trim()}
                        size="sm"
                        variant="outline"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Thumbnail Section */}
                  <div className="pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 block">
                      {t('workflow.thumbnail')}
                    </Label>
                    <div className="flex items-center gap-4">
                      {workflow.thumbnail ? (
                        <div className="flex-shrink-0">
                          <img
                            src={workflow.thumbnail}
                            alt={t('workflow.thumbnail')}
                            className="w-20 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-20 h-16 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <span className="text-xs text-slate-400">{t('workflow.noThumbnail')}</span>
                        </div>
                      )}
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRegenerateThumbnail();
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isRegeneratingThumbnail && !isLoading) {
                            handleRegenerateThumbnail();
                          }
                        }}
                        disabled={isRegeneratingThumbnail || isLoading}
                        variant="outline"
                        size="sm"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isRegeneratingThumbnail ? 'animate-spin' : ''}`} />
                        {isRegeneratingThumbnail ? t('workflow.regeneratingThumbnail') : t('workflow.regenerateThumbnail')}
                      </Button>
                    </div>
                  </div>

                  {/* Workflow Info */}
                  <div className="pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-400 mb-4">
                      <div>
                        <span className="font-medium">{t('workflow.nodesLabel')}:</span> {workflow.nodeCount}
                      </div>
                      <div>
                        <span className="font-medium">{t('workflow.author')}:</span> {workflow.author || t('common.unknown')}
                      </div>
                      <div>
                        <span className="font-medium">{t('workflow.created')}:</span> {workflow.createdAt ? workflow.createdAt.toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : t('common.unknown')}
                      </div>
                      <div>
                        <span className="font-medium">{t('workflow.modified')}:</span> {workflow.modifiedAt?.toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) || t('common.never')}
                      </div>
                    </div>

                    {/* Action Buttons - Copy and Delete */}
                    <div className="pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                      <div className="flex gap-3">
                        <Button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyWorkflow();
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isLoading) {
                              handleCopyWorkflow();
                            }
                          }}
                          disabled={isLoading}
                          variant="outline"
                          className="flex-1 h-12 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t('workflow.copyWorkflow')}
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDeleteConfirm(true);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDeleteConfirm(true);
                          }}
                          variant="outline"
                          className="flex-1 h-12 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Delete Confirmation */
                <div className="py-12 text-center">
                  <div className="mb-8">
                    <Trash2 className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                      {t('workflow.deleteWorkflow')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-lg">
                      {t('workflow.deleteSpecificConfirm')}
                    </p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium text-xl mt-3 mb-3 break-words">
                      "{workflow.name}"
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 text-lg">
                      {t('workflow.deleteConfirmMessage')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer - Fixed at bottom */}
          <div className="flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 shadow-lg">
            <div className="max-w-4xl mx-auto px-6 py-4">
              {!showDeleteConfirm ? (
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSave();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isLoading && name.trim()) {
                      handleSave();
                    }
                  }}
                  disabled={isLoading || !name.trim()}
                  className="w-full h-12"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isLoading ? t('common.saving') : t('workflow.saveChanges')}
                </Button>
              ) : (
                <div className="flex gap-4 w-full">
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(false);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isLoading) {
                        setShowDeleteConfirm(false);
                      }
                    }}
                    variant="outline"
                    disabled={isLoading}
                    className="flex-1 h-12 min-w-[120px]"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isLoading) {
                        handleDelete();
                      }
                    }}
                    disabled={isLoading}
                    variant="destructive"
                    className="flex-1 h-12 min-w-[120px]"
                  >
                    {isLoading ? t('common.deleting') : t('workflow.deleteWorkflow')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkflowEditModal;