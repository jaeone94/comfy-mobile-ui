import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Tag, FileText, AlertCircle, Settings, Server, Play } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { motion, AnimatePresence } from 'framer-motion';

interface WorkflowDetailModalProps {
  isOpen: boolean;
  workflow: Workflow | null;
  onClose: () => void;
  onEdit: (workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
}

const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  isOpen,
  workflow,
  onClose,
  onEdit,
  onSelect,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(workflow?.thumbnail);

  useEffect(() => {
    if (workflow) {
      setThumbnailUrl(workflow.thumbnail);

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

  const handleEditClick = () => {
    onEdit(workflow!);
    onClose();
  };

  const handleOpenClick = () => {
    onSelect(workflow!);
    onClose();
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
            className="relative w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/5 pointer-events-none rounded-3xl" />

            {/* Header with Close Button */}
            <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 dark:border-slate-600/10">
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
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                    {workflow.name}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Workflow Details
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
            <div className="relative z-10 max-h-[70vh] overflow-y-auto">
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
                    {workflow.nodeCount} {workflow.nodeCount === 1 ? 'node' : 'nodes'}
                  </Badge>
                  {!workflow.isValid && (
                    <Badge
                      variant="destructive"
                      className="px-3 py-1.5 text-xs bg-red-500/15 border-red-400/30 text-red-700 dark:text-red-400"
                    >
                      Invalid Workflow
                    </Badge>
                  )}
                  {(workflow as any).isServerWorkflow && (
                    <Badge
                      variant="outline"
                      className="px-3 py-1.5 text-xs bg-purple-500/10 border-purple-400/30 text-purple-700 dark:text-purple-300 flex items-center gap-1.5"
                    >
                      <Server className="w-3 h-3" />
                      Server
                    </Badge>
                  )}
                </div>

                {/* Description */}
                {workflow.description && (
                  <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {workflow.description}
                    </p>
                  </div>
                )}

                {/* Tags */}
                {workflow.tags && workflow.tags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Tag className="w-4 h-4 text-slate-400" />
                      <span>Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {workflow.tags.map((tag, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="px-3 py-1 text-xs bg-slate-100/50 dark:bg-slate-700/50 backdrop-blur-md border border-slate-200/30 dark:border-slate-600/30 text-slate-700 dark:text-slate-300"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata Section */}
                <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 space-y-3">
                  {/* Created At */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100/50 dark:bg-slate-700/50 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Created</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {new Date(workflow.createdAt).toLocaleDateString('en-US', {
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
                      <p className="text-xs text-slate-500 dark:text-slate-400">Author</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {workflow.author}
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
                        <p className="text-xs text-slate-500 dark:text-slate-400">Modified</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {new Date(workflow.modifiedAt).toLocaleDateString('en-US', {
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
            <div className="relative z-10 px-6 py-4 border-t border-white/10 dark:border-slate-600/10 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl">
              <div className="flex gap-3">
                <Button
                  onClick={handleOpenClick}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Open Workflow
                </Button>
                <Button
                  onClick={handleEditClick}
                  variant="outline"
                  className="px-5 py-3 rounded-2xl bg-white/50 dark:bg-slate-700/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-600/50 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Edit</span>
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkflowDetailModal;
