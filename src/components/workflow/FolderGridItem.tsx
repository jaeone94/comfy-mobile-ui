import React from 'react';
import { Folder, ChevronRight } from 'lucide-react';
import { FolderItem } from '@/types/folder';
import { useLongPress } from '@/hooks/useLongPress';

interface FolderGridItemProps {
  folder: FolderItem;
  onClick: () => void;
  onLongPress: () => void;
  isSelected?: boolean;
  workflowCount?: number;
}

const FolderGridItem: React.FC<FolderGridItemProps> = ({
  folder,
  onClick,
  onLongPress,
  isSelected = false,
  workflowCount = 0,
}) => {
  const longPressProps = useLongPress(onLongPress, onClick, { threshold: 500 });

  return (
    <div
      className={`relative group overflow-hidden rounded-xl transition-all duration-300 cursor-pointer border h-[72px] ${isSelected
        ? 'bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
        : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
        }`}
      {...longPressProps}
    >
      {/* Glass Effect Background */}
      <div className="absolute inset-0 backdrop-blur-md" />

      {/* Content Container */}
      <div className="relative z-10 p-3 h-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Icon Container */}
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isSelected
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 group-hover:text-amber-400'
              }`}
          >
            <Folder className="w-5 h-5 fill-current opacity-80" />
          </div>

          {/* Text Info */}
          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <h3 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors w-full">
              {folder.name}
            </h3>
            <span className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors truncate">
              {workflowCount} {workflowCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        {/* Arrow Icon */}
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
      </div>

      {/* Hover Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
    </div>
  );
};

export default FolderGridItem;
