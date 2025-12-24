import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, User, Settings, Tag, AlertCircle, Server, GripVertical } from 'lucide-react';
import { DragControls } from 'framer-motion';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { updateWorkflow } from '@/infrastructure/storage/IndexedDBWorkflowService';

interface WorkflowCardProps {
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
  onEdit?: (workflow: Workflow) => void;
  onDelete?: (workflowId: string) => void;
  isDraggable?: boolean;
  isCompactMode?: boolean;
  dragControls?: DragControls;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  onSelect,
  onEdit,
  isDraggable = false,
  isCompactMode = false,
  dragControls
}) => {
  const { t } = useTranslation();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(workflow.thumbnail);

  // Auto-generate thumbnail if missing but nodes exist
  useEffect(() => {
    const generateMissingThumbnail = async () => {
      // Only generate if: has nodes but no thumbnail
      if (workflow.nodeCount > 0 && !workflow.thumbnail && workflow.workflow_json) {
        try {
          const thumbnail = generateWorkflowThumbnail({
            nodes: (workflow.workflow_json.nodes || []) as any,
            links: (workflow.workflow_json.links || []) as any,
            groups: (workflow.workflow_json.groups || []) as any
          });

          if (thumbnail) {
            // Update local state for immediate display
            setThumbnailUrl(thumbnail);

            // Update workflow in IndexedDB
            const updatedWorkflow: Workflow = {
              ...workflow,
              thumbnail: thumbnail
            };
            await updateWorkflow(updatedWorkflow);
          }
        } catch (error) {
          console.error('Failed to auto-generate thumbnail:', error);
        }
      }
    };

    generateMissingThumbnail();
  }, [workflow.nodeCount, workflow.thumbnail, workflow.workflow_json, workflow]);

  const handleCardClick = (e: React.MouseEvent) => {
    // Block card click when in compact (reorder) mode
    if (isCompactMode) {
      return;
    }

    // Prevent card click when clicking on action buttons or drag handle
    if ((e.target as HTMLElement).closest('[data-action-button]') ||
      (e.target as HTMLElement).closest('[data-drag-handle]')) {
      return;
    }
    onSelect(workflow);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(workflow);
    }
  };

  return (
    <div
      className={`w-full bg-white/5 dark:bg-slate-800/5 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/10 dark:border-slate-600/10 hover:shadow-2xl hover:border-white/20 dark:hover:border-slate-500/20 transition-all duration-300 cursor-pointer relative overflow-hidden group ${!workflow.isValid ? 'border-red-300/30 dark:border-red-500/30' : ''
        }`}
      onClick={handleCardClick}
    >
      {/* iOS-style Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-3xl" />

      <div className="relative z-10 p-6">
        {/* Header Section */}
        <div className="space-y-4">
          {/* CSS Grid based layout */}
          <div className={`grid gap-4 items-start ${isDraggable
            ? (onEdit ? 'grid-cols-[auto_auto_1fr_auto]' : 'grid-cols-[auto_auto_1fr]')
            : (onEdit ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[auto_1fr]')
            }`}>
            {/* 1. Drag Handle (optional) */}
            {isDraggable && (
              <div
                data-drag-handle
                className="mt-1 p-3 bg-slate-100/5 dark:bg-slate-700/10 backdrop-blur-md border border-slate-200/15 dark:border-slate-600/20 rounded-2xl hover:bg-slate-100/10 dark:hover:bg-slate-700/15 hover:border-slate-200/25 dark:hover:border-slate-600/30 transition-all duration-200 cursor-grab active:cursor-grabbing touch-none select-none"
                title={t('workflow.dragToReorder')}
                onPointerDown={(e) => {
                  if (dragControls) {
                    e.preventDefault();
                    e.stopPropagation();
                    dragControls.start(e);
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                }}
                style={{
                  touchAction: 'none',
                  minWidth: '44px',
                  minHeight: '44px'
                }}
              >
                <GripVertical className="w-5 h-5 text-slate-400" />
              </div>
            )}

            {/* 2. thumbnail icon */}
            <div className={`${isCompactMode ? 'w-10 h-10' : 'w-14 h-14'} rounded-2xl flex items-center justify-center shadow-lg overflow-hidden backdrop-blur-md border ${workflow.isValid
              ? 'bg-slate-100/10 dark:bg-slate-700/15 border-slate-200/20 dark:border-slate-600/25'
              : 'bg-red-500/15 dark:bg-red-500/20 border-red-300/25 dark:border-red-500/30'
              }`}>
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={`${workflow.name} ${t('workflow.thumbnail')}`}
                  className="w-full h-full object-cover"
                />
              ) : workflow.isValid ? (
                <FileText className={`${isCompactMode ? 'w-4 h-4' : 'w-6 h-6'} text-slate-600 dark:text-slate-300`} />
              ) : (
                <AlertCircle className={`${isCompactMode ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
              )}
            </div>

            {/* 3. main content area */}
            <div className="min-w-0 overflow-hidden space-y-3">
              {/* title row */}
              <div className="flex items-start gap-3">
                <h3 className={`${isCompactMode ? 'text-base' : 'text-lg'} font-bold text-slate-900 dark:text-slate-100 leading-tight truncate flex-1 min-w-0`}>
                  {workflow.name}
                </h3>
                {!workflow.isValid && (
                  <Badge variant="destructive" className="text-xs px-2 py-1 flex-shrink-0 bg-red-500/15 border-red-400/30 text-red-700 dark:text-red-400">
                    {t('workflow.invalid')}
                  </Badge>
                )}
              </div>

              {/* node count */}
              <div>
                <Badge
                  variant="outline"
                  className="text-xs px-3 py-1 font-medium backdrop-blur-md bg-slate-100/10 dark:bg-slate-700/15 border-slate-200/25 dark:border-slate-600/25 text-slate-700 dark:text-slate-300"
                >
                  {workflow.nodeCount} {workflow.nodeCount === 1 ? t('workflow.node') : t('workflow.nodes')}
                </Badge>
              </div>

              {/* description - hidden in compact mode */}
              {workflow.description && !isCompactMode && (
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {workflow.description}
                </p>
              )}

              {/* tags - hidden in compact mode */}
              {workflow.tags && workflow.tags.length > 0 && !isCompactMode && (
                <div className="flex items-center space-x-2">
                  <Tag className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <div className="flex flex-wrap gap-2 min-w-0">
                    {workflow.tags.slice(0, 3).map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="text-xs px-2 py-1 bg-slate-100/8 dark:bg-slate-700/12 backdrop-blur-md border border-slate-200/20 dark:border-slate-600/20 text-slate-700 dark:text-slate-300"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {workflow.tags.length > 3 && (
                      <Badge
                        variant="secondary"
                        className="text-xs px-2 py-1 bg-slate-100/8 dark:bg-slate-700/12 backdrop-blur-md border border-slate-200/20 dark:border-slate-600/20 text-slate-700 dark:text-slate-300"
                      >
                        +{workflow.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Settings button */}
            {onEdit && !isCompactMode && (
              <button
                data-action-button
                onClick={handleEditClick}
                className="p-3 bg-slate-100/5 dark:bg-slate-700/10 backdrop-blur-md border border-slate-200/15 dark:border-slate-600/20 rounded-2xl hover:bg-slate-100/10 dark:hover:bg-slate-700/15 hover:border-slate-200/25 dark:hover:border-slate-600/30 transition-all duration-200 w-12 h-12 flex items-center justify-center mt-1"
                title={t('workflow.editWorkflow')}
                style={{ minWidth: '48px', minHeight: '48px' }}
              >
                <Settings className="w-5 h-5 text-slate-500 hover:text-blue-500 transition-colors" />
              </button>
            )}
          </div>
        </div>

        {/* Content Section - only display when not in compact mode */}
        {!isCompactMode && (
          <div className="space-y-4 border-t border-white/10 dark:border-slate-600/10 pt-4">
            {/* Workflow Thumbnail Preview */}
            {workflow.thumbnail && (
              <div className="w-full">
                <div className="relative w-full h-36 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/15 dark:border-slate-600/15">
                  <img
                    src={workflow.thumbnail}
                    alt={`${workflow.name} ${t('workflow.thumbnail')}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
                </div>
              </div>
            )}

            {/* Workflow Metadata */}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-slate-100/5 dark:bg-slate-700/10 backdrop-blur-md border border-slate-200/15 dark:border-slate-600/20 px-2 py-1 rounded-xl">
                  <Calendar className="w-3 h-3" />
                  <span className="font-medium">{workflow.createdAt ? workflow.createdAt.toLocaleDateString() : t('common.unknown')}</span>
                </div>
                {workflow.author && (
                  <div className={`flex items-center space-x-2 px-2 py-1 rounded-xl backdrop-blur-md border ${workflow.author === 'server'
                    ? 'bg-purple-500/15 border-purple-400/25 dark:border-purple-500/30'
                    : 'bg-slate-100/5 dark:bg-slate-700/10 border-slate-200/15 dark:border-slate-600/20'
                    }`}>
                    {workflow.author === 'server' ? (
                      <>
                        <Server className="w-3 h-3 text-purple-500" />
                        <span className="text-purple-600 dark:text-purple-400 font-medium">{t('workflow.server')}</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3 h-3" />
                        <span className="font-medium">{workflow.author}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              {workflow.modifiedAt && workflow.createdAt && workflow.modifiedAt.getTime() !== workflow.createdAt.getTime() && (
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100/5 dark:bg-slate-700/10 backdrop-blur-md border border-slate-200/15 dark:border-slate-600/20 px-2 py-1 rounded-xl">
                  {t('common.updated')} {workflow.modifiedAt.toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowCard;