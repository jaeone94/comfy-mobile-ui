import React from 'react';
import { Folder, Check } from 'lucide-react';
import { FolderItem } from '@/types/folder';
import { useLongPress } from '@/hooks/useLongPress';

interface FolderGridItemProps {
  folder: FolderItem;
  onClick: () => void;
  onLongPress: () => void;
  isSelected?: boolean;
  selectionMode?: boolean;
  workflowCount?: number;
}

const FolderGridItem: React.FC<FolderGridItemProps> = ({
  folder,
  onClick,
  onLongPress,
  isSelected = false,
  selectionMode = false,
  workflowCount = 0,
}) => {
  const longPressProps = useLongPress(onLongPress, onClick, { threshold: 500 });

  return (
    <div
      className={`h-10 flex items-center gap-[9px] px-3 rounded-[9px] border cursor-pointer transition-colors min-w-[150px] ${isSelected
        ? 'border-[#3069f0]/60'
        : 'border-white/[0.08] hover:border-white/[0.16]'
        }`}
      style={{ background: isSelected ? 'rgba(48,105,240,0.1)' : 'rgba(255,255,255,0.035)' }}
      {...longPressProps}
    >
      <Folder className="w-[15px] h-[15px] shrink-0 text-[#5b8af5]" strokeWidth={1.8} />
      <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium text-[#e9ebef]">
        {folder.name}
      </span>
      {selectionMode ? (
        <span
          className={`w-[18px] h-[18px] shrink-0 rounded flex items-center justify-center border transition-colors ${isSelected
            ? 'bg-[#3069f0] border-[#3069f0] text-white'
            : 'border-white/40 text-transparent'
            }`}
        >
          <Check className="w-3 h-3" strokeWidth={2.5} />
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[10px] text-[#565d6b]">{workflowCount}</span>
      )}
    </div>
  );
};

export default FolderGridItem;
