import React from 'react';
import { CornerLeftUp } from 'lucide-react';

interface ParentFolderGridItemProps {
  onClick: () => void;
  isTarget?: boolean;
  isMoveMode?: boolean;
}

const ParentFolderGridItem: React.FC<ParentFolderGridItemProps> = ({
  onClick,
  isTarget = false,
  isMoveMode = false,
}) => {
  return (
    <div
      className={`relative group overflow-hidden rounded-xl transition-all duration-300 cursor-pointer border h-[72px] ${isTarget
        ? 'bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
        : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
        }`}
      onClick={onClick}
    >
      {/* Glass Effect Background */}
      <div className="absolute inset-0 backdrop-blur-md" />

      {/* Content Container */}
      <div className="relative z-10 px-4 h-full flex items-center gap-3">
        {/* Icon Container */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isTarget
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-slate-500/10 text-slate-400 group-hover:bg-slate-500/20 group-hover:text-slate-300'
            }`}
        >
          <CornerLeftUp className="w-5 h-5" />
        </div>

        {/* Text Info */}
        <div className="flex flex-col pr-2">
          <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors whitespace-nowrap">
            {isMoveMode ? 'Move to Parent' : 'Back to Parent'}
          </h3>
          <span className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors whitespace-nowrap">
            {isMoveMode ? 'Move selected items here' : 'Go up one level'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ParentFolderGridItem;
