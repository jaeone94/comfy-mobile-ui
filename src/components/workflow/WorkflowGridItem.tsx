import React, { useState, useEffect, useRef } from 'react';
import { FileText, AlertCircle, Check } from 'lucide-react';
import { Workflow } from '@/shared/types/app/IComfyWorkflow';
import { generateWorkflowThumbnail } from '@/shared/utils/rendering/CanvasRendererService';
import { useLongPress } from '@/hooks/useLongPress';

// Keep only small rendered images across route changes, never full graphs.
const thumbnailCache = new Map<string, string>();
const thumbnailKey = (workflow: Workflow) => `${workflow.id}:${new Date(workflow.modifiedAt || workflow.createdAt).getTime()}:${workflow.nodeCount}`;

interface WorkflowGridItemProps {
  workflow: Workflow;
  onClick: () => void;
  onLongPress: () => void;
  isSelected?: boolean;
  selectionMode?: boolean;
}

const WorkflowGridItem: React.FC<WorkflowGridItemProps> = ({
  workflow,
  onClick,
  onLongPress,
  isSelected = false,
  selectionMode = false,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(() => workflow.thumbnail || thumbnailCache.get(thumbnailKey(workflow)));

  useEffect(() => {
    const key = thumbnailKey(workflow);
    const cached = workflow.thumbnail || thumbnailCache.get(key);
    setThumbnailUrl(cached);
    if (cached || !workflow.nodeCount || !workflow.workflow_json) return;
    let cancelled = false;
    let scheduled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const generateMissingThumbnail = () => {
      if (!cancelled) {
        try {
          const thumbnail = generateWorkflowThumbnail({
            nodes: workflow.workflow_json.nodes || [],
            links: workflow.workflow_json.links || [],
            groups: workflow.workflow_json.groups || []
          } as unknown as Parameters<typeof generateWorkflowThumbnail>[0]);

          if (thumbnail) {
            thumbnailCache.delete(key);
            thumbnailCache.set(key, thumbnail);
            if (thumbnailCache.size > 64) thumbnailCache.delete(thumbnailCache.keys().next().value!);
            setThumbnailUrl(thumbnail);
          }
        } catch (error) {
          console.error('Failed to auto-generate thumbnail:', error);
        }
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(generateMissingThumbnail, { timeout: 1500 });
      else timer = setTimeout(generateMissingThumbnail, 80);
    };
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); schedule(); }
    }, { rootMargin: '200px' }) : null;
    if (observer && itemRef.current) observer.observe(itemRef.current);
    else schedule();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [workflow]);

  const longPressProps = useLongPress(onLongPress, onClick, { threshold: 500 });

  // Monospace MM.DD meta, matching the design spec.
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}.${day}`;
  };

  return (
    <div
      ref={itemRef}
      className={`relative rounded-[10px] overflow-hidden cursor-pointer border transition-colors ${isSelected
        ? 'border-[#3069f0]/70 ring-1 ring-[#3069f0]/40'
        : 'border-white/[0.07] hover:border-white/[0.14]'
        }`}
      {...longPressProps}
      style={{ ...longPressProps.style, background: '#101217' }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] border-b border-white/[0.06]" style={{ background: '#0c0e12' }}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={workflow.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {workflow.isValid ? (
              <FileText className="w-8 h-8 text-white/15" strokeWidth={1.6} />
            ) : (
              <AlertCircle className="w-8 h-8 text-[#f25555]/60" strokeWidth={1.6} />
            )}
          </div>
        )}

        {/* Selection checkbox */}
        {selectionMode && (
          <div
            className={`absolute top-2 left-2 z-10 w-[22px] h-[22px] rounded-md flex items-center justify-center border transition-colors ${isSelected
              ? 'bg-[#3069f0] border-[#3069f0] text-white'
              : 'bg-black/45 border-white/45 text-transparent'
              }`}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="px-[11px] pt-[9px] pb-[10px]">
        <div className="text-[12.5px] font-semibold leading-[1.35] text-[#e9ebef] line-clamp-1">
          {workflow.name}
        </div>
        <div className="flex items-center gap-1.5 mt-[5px] font-mono text-[10px] text-[#565d6b]">
          <span>{formatDate(workflow.modifiedAt || workflow.createdAt)}</span>
          <span className="text-[#31363f]">·</span>
          <span className="text-[#5b8af5]">{workflow.nodeCount}N</span>
        </div>
      </div>
    </div>
  );
};

export default WorkflowGridItem;
