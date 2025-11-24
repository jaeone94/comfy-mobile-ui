import React from 'react';
import { CornerLeftUp, ArrowUp } from 'lucide-react';

interface ParentFolderGridItemProps {
  onClick: () => void;
  isTarget?: boolean;
}

const ParentFolderGridItem: React.FC<ParentFolderGridItemProps> = ({
  onClick,
  isTarget = false,
}) => {
  return (
    <div
      className={`relative backdrop-blur-2xl rounded-2xl shadow-lg border transition-all duration-300 cursor-pointer overflow-hidden group ${
        isTarget
          ? 'bg-blue-500/20 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500 shadow-xl ring-2 ring-blue-400/50'
          : 'bg-white/5 dark:bg-slate-800/5 border-white/10 dark:border-slate-600/10 hover:shadow-xl hover:border-white/20 dark:hover:border-slate-500/20'
      }`}
      onClick={onClick}
    >
      {/* Gradient Overlay */}
      <div className={`absolute inset-0 pointer-events-none rounded-2xl ${
        isTarget
          ? 'bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-blue-600/20'
          : 'bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-slate-500/10'
      }`} />

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 via-slate-500/5 to-slate-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl" />

      {/* Content */}
      <div className="relative z-10 p-3 space-y-2">
        {/* Folder Icon */}
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-slate-500/20 via-slate-500/15 to-slate-500/20 border border-slate-400/30 dark:border-slate-500/30 flex flex-col items-center justify-center">
          <CornerLeftUp className="w-12 h-12 text-slate-600 dark:text-slate-400 mb-1" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Up
          </span>
        </div>

        {/* Folder Name */}
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            ..
          </p>
        </div>
      </div>
    </div>
  );
};

export default ParentFolderGridItem;
