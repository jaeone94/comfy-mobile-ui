import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, AlertCircle, Clock, MoreVertical } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { useLongPress } from '@/hooks/useLongPress';

interface WorkflowGridItemProps {
  workflow: Workflow;
  onClick: () => void;
  onLongPress: () => void;
  isSelected?: boolean;
}

const WorkflowGridItem: React.FC<WorkflowGridItemProps> = ({
  workflow,
  onClick,
  onLongPress,
  isSelected = false,
}) => {
  const { t } = useTranslation();
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

  const longPressProps = useLongPress(onLongPress, onClick, { threshold: 500 });

  // Format date relative or short
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`relative group rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border ${isSelected
        ? 'ring-2 ring-blue-500 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
        : 'border-white/10 hover:border-white/20 hover:shadow-xl'
        }`}
      {...longPressProps}
    >
      {/* Thumbnail Container - Full Bleed */}
      <div className="aspect-[4/3] w-full bg-slate-900 relative overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={workflow.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800/50 p-4">
            {workflow.isValid ? (
              <FileText className="w-12 h-12 text-slate-600 mb-2" />
            ) : (
              <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
            )}
            <span className="text-xs text-slate-500 text-center">{t('workflow.noThumbnail')}</span>
          </div>
        )}

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent opacity-80" />

        {/* Selected Overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-[1px]" />
        )}
      </div>

      {/* Content Overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col justify-end">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2 drop-shadow-md">
            {workflow.name}
          </h3>
        </div>

        <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatDate(workflow.modifiedAt || workflow.createdAt)}</span>
          </div>
          <div className="px-1.5 py-0.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/5">
            {workflow.nodeCount} {t('workflow.nodes')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowGridItem;
