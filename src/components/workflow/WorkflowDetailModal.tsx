import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, User, Tag, FileText, AlertCircle, Server, Play, Copy, Trash2, Plus, Check, FolderInput } from 'lucide-react';
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
  onMove?: (workflow: Workflow) => void;
}

const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  isOpen,
  workflow,
  onClose,
  onSelect,
  onWorkflowUpdated,
  onWorkflowDeleted,
  onWorkflowCopied,
  onMove,
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
            className="relative w-full max-w-md bg-[#101217] rounded-xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none rounded-xl" />

            {/* Header with Close Button */}
            <div className="relative z-50 flex items-center justify-between px-4 py-4 border-b border-white/[0.08] flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${workflow.isValid
                  ? 'bg-blue-500/15 dark:bg-blue-500/20 border border-blue-400/30'
                  : 'bg-red-500/15 dark:bg-red-500/20 border border-red-400/30'
                  }`}>
                  {workflow.isValid ? (
                    <FileText className="w-5 h-5 text-[#5b8af5]" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-[#f87c7c]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleNameBlur}
                    className="text-[14px] font-bold text-[#e9ebef] bg-transparent border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#565d6b]"
                    placeholder={t('workflow.namePlaceholder')}
                  />
                  <p className="text-xs text-[#8a919e] mt-0.5">
                    {t('workflow.details')}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 ml-3 p-1.5 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-all duration-200 rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-[#c8ccd4]" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="relative z-10 overflow-y-auto flex-1">
              <div className="p-4 space-y-6">
                {/* Thumbnail */}
                <div
                  className="w-full aspect-video rounded-[10px] overflow-hidden bg-white/[0.04] border border-white/[0.07] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={handleOpenClick}
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={workflow.name}
                      className="w-full h-full object-cover"
                    />
                  ) : workflow.isValid ? (
                    <FileText className="w-10 h-10 text-[#565d6b]" />
                  ) : (
                    <AlertCircle className="w-10 h-10 text-red-500" />
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
                  <div className="flex items-center gap-2 text-[12px] font-medium text-[#c8ccd4]">
                    <FileText className="w-4 h-4 text-[#565d6b]" />
                    <span>{t('workflow.description')}</span>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    placeholder={t('workflow.descriptionPlaceholder')}
                    className="bg-white/[0.03] rounded-[10px] border-white/[0.08] resize-none min-h-[80px]"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[12px] font-medium text-[#c8ccd4]">
                    <Tag className="w-4 h-4 text-[#565d6b]" />
                    <span>{t('workflow.tags')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="px-2 py-1 text-xs bg-white/[0.05] backdrop-blur-md border border-white/[0.07] text-[#c8ccd4] pr-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 p-0.5 hover:bg-white/[0.08] rounded-full transition-colors"
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
                      className="bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] h-9"
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
                <div className="bg-white/[0.03] rounded-[10px] p-3 border border-white/[0.08] space-y-2">
                  {/* Created At */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-[#8a919e]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#71798a]">{t('workflow.created')}</p>
                      <p className="text-[12px] font-medium text-[#e9ebef]">
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
                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
                      <User className="w-4 h-4 text-[#8a919e]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#71798a]">{t('workflow.author')}</p>
                      <p className="text-[12px] font-medium text-[#e9ebef] truncate">
                        {workflow.author || t('common.unknown')}
                      </p>
                    </div>
                  </div>

                  {/* Modified At */}
                  {workflow.modifiedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-[#8a919e]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#71798a]">{t('workflow.modified')}</p>
                        <p className="text-[12px] font-medium text-[#e9ebef]">
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
            <div className="relative z-50 px-4 py-4 border-t border-white/[0.08] bg-[#0f1116]/90 backdrop-blur-xl flex-shrink-0">
              <div className="flex gap-3">
                <Button
                  onClick={handleOpenClick}
                  className="flex-[2] bg-[#3069f0] hover:bg-[#3f78f5] text-white font-medium h-10 py-0 rounded-[10px] shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  {t('common.open')}
                </Button>
                <Button
                  onClick={handleCopyWorkflow}
                  variant="outline"
                  className="flex-1 h-10 py-0 rounded-[10px] bg-white/[0.05] border border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.08] hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
                  title={t('workflow.copyWorkflow')}
                  disabled={isLoading}
                >
                  <Copy className="w-5 h-5" />
                </Button>
                {onMove && workflow && (
                  <Button
                    onClick={() => onMove(workflow)}
                    variant="outline"
                    className="flex-1 h-10 py-0 rounded-[10px] bg-white/[0.05] border border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.08] hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
                    title={t('workflow.move')}
                    disabled={isLoading}
                  >
                    <FolderInput className="w-5 h-5" />
                  </Button>
                )}
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="flex-1 h-10 py-0 rounded-[10px] border border-[#f25555]/30 bg-[#f25555]/[0.1] text-[#f87c7c] hover:bg-[#f25555]/[0.18] transition-all duration-200 flex items-center justify-center gap-2"
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
                  className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="w-full max-w-[300px] bg-[#101217] rounded-xl shadow-2xl border border-white/10 p-4 space-y-4"
                  >
                    <div className="flex flex-col items-center text-center space-y-2">
                      <div className="w-9 h-9 rounded-[10px] border flex items-center justify-center mb-1" style={{ background: 'rgba(242,85,85,0.1)', borderColor: 'rgba(242,85,85,0.3)' }}>
                        <AlertCircle className="w-4 h-4 text-[#f25555]" strokeWidth={1.8} />
                      </div>
                      <h3 className="text-[14px] font-bold text-[#e9ebef]">{t('workflow.deleteConfirmTitle')}</h3>
                      <p className="text-[11.5px] leading-relaxed text-[#8a919e]">
                        {t('workflow.deleteConfirmMessage')}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowDeleteConfirm(false)}
                        variant="outline"
                        className="flex-1 h-9 rounded-[10px] text-[12px] bg-white/[0.05] border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.07]"
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        onClick={handleDelete}
                        variant="destructive"
                        className="flex-1 h-9 rounded-[10px] text-[12px] bg-[#f25555] hover:bg-[#f36d6d] text-white"
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
