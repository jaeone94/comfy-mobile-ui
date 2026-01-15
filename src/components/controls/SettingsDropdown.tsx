import { Badge } from '@/components/ui/badge';
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Dices, Users, FileJson, Database, Hash, Camera, Brush, Move, Link, AlertTriangle, Package } from 'lucide-react';
import type { MissingModelInfo } from '@/services/MissingModelsService';

interface SettingsDropdownProps {
  isClearingVRAM: boolean;
  onShowGroupModer?: () => void;
  onRandomizeSeeds?: (isForceRandomize: boolean) => void;
  onShowTriggerWordSelector: () => void;
  onShowWorkflowJson?: () => void;
  onShowObjectInfo?: () => void;
  onShowWorkflowSnapshots?: () => void;
  onClearVRAM: () => void;
  // Repositioning mode controls
  repositionMode?: {
    isActive: boolean;
  };
  onToggleRepositionMode?: () => void;
  // Connection mode controls
  connectionMode?: {
    isActive: boolean;
  };
  onToggleConnectionMode?: () => void;
  missingNodesCount?: number;
  installablePackageCount?: number;
  onShowMissingNodeInstaller?: () => void;
  missingModels?: MissingModelInfo[];
  onOpenMissingModelDetector?: () => void;
}

export const SettingsDropdownContent: React.FC<SettingsDropdownProps> = ({
  isClearingVRAM,
  onShowGroupModer,
  onRandomizeSeeds,
  onShowTriggerWordSelector,
  onShowWorkflowJson,
  onShowObjectInfo,
  onShowWorkflowSnapshots,
  onClearVRAM,
  repositionMode,
  onToggleRepositionMode,
  connectionMode,
  onToggleConnectionMode,
  missingNodesCount = 0,
  installablePackageCount = 0,
  onShowMissingNodeInstaller,
  missingModels = [],
  onOpenMissingModelDetector,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative z-10 py-1">
      {/* Group 1: Workflow Tools */}
      {(onShowGroupModer || onRandomizeSeeds || onToggleRepositionMode || onToggleConnectionMode || (missingNodesCount ?? 0) > 0 || missingModels.length > 0) && (
        <>
          {missingNodesCount > 0 && onShowMissingNodeInstaller && (
            <button
              onClick={onShowMissingNodeInstaller}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-500/10 transition-colors border-b border-white/5 active:bg-red-500/20"
            >
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-100 text-left flex-1">
                {t('menu.installMissingNodes')}
              </span>
              {installablePackageCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs h-5 px-1.5 min-w-[20px] justify-center">{installablePackageCount}</Badge>
              )}
            </button>
          )}
          {missingModels.length > 0 && onOpenMissingModelDetector && (
            <button
              onClick={onOpenMissingModelDetector}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-yellow-500/10 transition-colors border-b border-white/5 active:bg-yellow-500/20"
            >
              <Package className="h-4 w-4 text-yellow-500 flex-shrink-0" />
              <span className="text-sm font-medium text-yellow-100 text-left flex-1">
                {t('menu.missingModelDetector')}
              </span>
              <Badge variant="outline" className="ml-auto text-xs border-yellow-500/50 text-yellow-400">
                {missingModels.length}
              </Badge>
            </button>
          )}
          {/* Group Title */}
          <div className="px-4 py-2 bg-white/5 border-b border-white/5">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              {t('menu.workflowTools')}
            </h3>
          </div>

          {/* Fast Group Moder Button */}
          {onShowGroupModer && (
            <button
              onClick={onShowGroupModer}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
            >
              <Users className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.fastGroupModer')}
              </span>
            </button>
          )}

          {/* Trigger Word Selector */}
          <button
            onClick={onShowTriggerWordSelector}
            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
          >
            <Hash className="h-4 w-4 text-white/60 flex-shrink-0" />
            <span className="text-sm font-medium text-white/90 text-left flex-1">
              {t('menu.triggerWords')}
            </span>
          </button>

          {/* Randomize Seeds Button */}
          {onRandomizeSeeds && (
            <button
              onClick={() => onRandomizeSeeds(true)}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
            >
              <Dices className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.randomizeSeeds')}
              </span>
            </button>
          )}

          {/* Node Repositioning Button */}
          {onToggleRepositionMode && (
            <button
              onClick={onToggleRepositionMode}
              className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10 ${repositionMode?.isActive
                ? 'bg-blue-500/20 text-blue-400'
                : ''
                }`}
            >
              <Move className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.nodeRepositioning')}
              </span>
            </button>
          )}

          {/* Node Connection Button */}
          {onToggleConnectionMode && (
            <button
              onClick={onToggleConnectionMode}
              className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10 ${connectionMode?.isActive
                ? 'bg-green-500/20 text-green-400'
                : ''
                }`}
            >
              <Link className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.nodeConnection')}
              </span>
            </button>
          )}
        </>
      )}

      {/* Group 2: Workflow Information */}
      {(onShowWorkflowJson || onShowObjectInfo) && (
        <>
          {/* Group Title */}
          <div className="px-4 py-2 bg-white/5 border-b border-white/5">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              {t('menu.workflowInfo')}
            </h3>
          </div>

          {/* Workflow JSON Viewer */}
          {onShowWorkflowJson && (
            <button
              onClick={onShowWorkflowJson}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
            >
              <FileJson className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.viewWorkflowJson')}
              </span>
            </button>
          )}

          {/* Object Info Viewer */}
          {onShowObjectInfo && (
            <button
              onClick={onShowObjectInfo}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
            >
              <Database className="h-4 w-4 text-white/60 flex-shrink-0" />
              <span className="text-sm font-medium text-white/90 text-left flex-1">
                {t('menu.viewObjectInfo')}
              </span>
            </button>
          )}
        </>
      )}

      {/* Group 3: System Controls */}
      <>
        {/* Group Title */}
        <div className="px-4 py-2 bg-white/5 border-b border-white/5">
          <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
            {t('menu.system')}
          </h3>
        </div>

        {/* Workflow Snapshots Option */}
        {onShowWorkflowSnapshots && (
          <button
            onClick={onShowWorkflowSnapshots}
            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors border-b border-white/5 active:bg-white/10"
          >
            <Camera className="h-4 w-4 text-white/60 flex-shrink-0" />
            <span className="text-sm font-medium text-white/90 text-left flex-1">
              {t('menu.workflowSnapshots')}
            </span>
          </button>
        )}

        <button
          onClick={onClearVRAM}
          disabled={isClearingVRAM}
          className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-500/10 transition-colors disabled:opacity-50 active:bg-red-500/20"
        >
          {isClearingVRAM ? (
            <Loader2 className="h-4 w-4 animate-spin text-red-500 flex-shrink-0" />
          ) : (
            <Brush className="h-4 w-4 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-red-400 text-left flex-1">
            {isClearingVRAM ? t('menu.clearing') : t('menu.clearVram')}
          </span>
        </button>
      </>
    </div>
  );
};
