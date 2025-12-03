import React from 'react';
import { Folder } from 'lucide-react';
import { FolderItem } from '@/types/folder';
import { useLongPress } from '@/hooks/useLongPress';
import { toast } from 'sonner';

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

  const longPressProps = useLongPress(
    onLongPress,
    onClick,
    { threshold: 500 }
  );

  return (
    <div
      className={`relative backdrop-blur-2xl rounded-2xl shadow-lg border transition-all duration-300 cursor-pointer overflow-hidden group ${isSelected
        ? 'bg-blue-500/20 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500 shadow-xl ring-2 ring-blue-400/50'
        : 'bg-white/5 dark:bg-slate-800/5 border-white/10 dark:border-slate-600/10 hover:shadow-xl hover:border-white/20 dark:hover:border-slate-500/20'
        }`}
      {...longPressProps}
    >
      {/* Gradient Overlay */}
      <div className={`absolute inset-0 pointer-events-none rounded-2xl ${isSelected
        ? 'bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-blue-600/20'
        : 'bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-orange-500/10'
        }`} />

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-yellow-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl" />

      {/* Selected Overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none rounded-2xl" />
      )}

      {/* Content */}
      <div className="relative z-10 p-3 space-y-2">
        {/* Folder Icon */}
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-amber-500/20 via-yellow-500/15 to-orange-500/20 border border-amber-400/30 dark:border-yellow-500/30 flex flex-col items-center justify-center">
          <Folder className="w-12 h-12 text-amber-600 dark:text-yellow-400 mb-1" />
          {workflowCount > 0 && (
            <span className="text-xs font-medium text-amber-700 dark:text-yellow-300">
              {workflowCount} {workflowCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {/* Folder Name */}
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {folder.name}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FolderGridItem;
