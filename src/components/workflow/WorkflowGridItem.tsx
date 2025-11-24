import React, { useState, useEffect } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';

interface WorkflowGridItemProps {
  workflow: Workflow;
  onClick: () => void;
  isSelected?: boolean;
}

const WorkflowGridItem: React.FC<WorkflowGridItemProps> = ({
  workflow,
  onClick,
  isSelected = false,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(workflow.thumbnail);

  useEffect(() => {
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
  }, [workflow]);

  return (
    <div
      className={`relative backdrop-blur-2xl rounded-2xl shadow-lg border transition-all duration-300 cursor-pointer overflow-hidden group ${
        isSelected
          ? 'bg-blue-500/20 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500 shadow-xl ring-2 ring-blue-400/50'
          : 'bg-white/5 dark:bg-slate-800/5 border-white/10 dark:border-slate-600/10 hover:shadow-xl hover:border-white/20 dark:hover:border-slate-500/20'
      }`}
      onClick={onClick}
    >
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-slate-900/5 pointer-events-none rounded-2xl" />

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl" />

      {/* Selected Overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none rounded-2xl" />
      )}

      {/* Content */}
      <div className="relative z-10 p-3 space-y-2">
        {/* Thumbnail */}
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-100/10 dark:bg-slate-700/15 border border-slate-200/20 dark:border-slate-600/25 flex items-center justify-center">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : workflow.isValid ? (
            <FileText className="w-8 h-8 text-slate-600 dark:text-slate-300" />
          ) : (
            <AlertCircle className="w-8 h-8 text-red-500" />
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {workflow.name}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorkflowGridItem;
