import { Badge } from '@/components/ui/badge';
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Dices, Users, FileJson, Database, Hash, Camera, Brush, Move, Link, AlertTriangle, Package, Ungroup } from 'lucide-react';
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
  onExtractSubgraphs?: () => void;
  hasSubgraphs?: boolean;
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
  onExtractSubgraphs,
  hasSubgraphs,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative z-10 pb-2">
      {/* Group 1: Workflow Tools */}
      {(onShowGroupModer || onRandomizeSeeds || onToggleRepositionMode || onToggleConnectionMode || (missingNodesCount ?? 0) > 0 || missingModels.length > 0) && (
        <>
          {missingNodesCount > 0 && onShowMissingNodeInstaller && (
            <button
              onClick={onShowMissingNodeInstaller}
              className="w-full px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-white/[0.06] active:bg-[#f25555]/[0.12]"
              style={{ background: 'rgba(242,85,85,0.07)' }}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-[#f25555] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#f8b3b3] text-left flex-1">
                {t('menu.installMissingNodes')}
              </span>
              {installablePackageCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-[#f25555] flex items-center justify-center font-mono text-[9.5px] font-bold text-white">{installablePackageCount}</span>
              )}
            </button>
          )}
          {missingModels.length > 0 && onOpenMissingModelDetector && (
            <button
              onClick={onOpenMissingModelDetector}
              className="w-full px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-white/[0.06] active:bg-[#ffa348]/[0.12]"
              style={{ background: 'rgba(255,163,72,0.07)' }}
            >
              <Package className="h-3.5 w-3.5 text-[#ffa348] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#ffd9ae] text-left flex-1">
                {t('menu.missingModelDetector')}
              </span>
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-mono text-[9.5px] font-bold text-[#ffa348] border border-[#ffa348]/40">
                {missingModels.length}
              </span>
            </button>
          )}
          {/* Group Title */}
          <div className="px-3 pt-2 pb-1">
            <h3 className="font-mono text-[9px] font-semibold text-[#565d6b] uppercase tracking-[0.14em]">
              {t('menu.workflowTools')}
            </h3>
          </div>

          {/* Fast Group Moder Button */}
          {onShowGroupModer && (
            <button
              onClick={onShowGroupModer}
              className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
            >
              <Users className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.fastGroupModer')}
              </span>
            </button>
          )}

          {/* Trigger Word Selector */}
          <button
            onClick={onShowTriggerWordSelector}
            className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
          >
            <Hash className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
            <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
              {t('menu.triggerWords')}
            </span>
          </button>

          {/* Randomize Seeds Button */}
          {onRandomizeSeeds && (
            <button
              onClick={() => onRandomizeSeeds(true)}
              className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
            >
              <Dices className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.randomizeSeeds')}
              </span>
            </button>
          )}

          {/* Node Repositioning Button */}
          {onToggleRepositionMode && (
            <button
              onClick={onToggleRepositionMode}
              className={`w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07] ${repositionMode?.isActive
                ? 'bg-[#3069f0]/[0.18]'
                : ''
                }`}
            >
              <Move className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.nodeRepositioning')}
              </span>
            </button>
          )}

          {/* Node Connection Button */}
          {onToggleConnectionMode && (
            <button
              onClick={onToggleConnectionMode}
              className={`w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07] ${connectionMode?.isActive
                ? 'bg-[#34c77b]/[0.13]'
                : ''
                }`}
            >
              <Link className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.nodeConnection')}
              </span>
            </button>
          )}

          {/* Extract Subgraphs Button */}
          {hasSubgraphs && onExtractSubgraphs && (
            <button
              onClick={onExtractSubgraphs}
              className="w-full h-8 px-3 flex items-center gap-2 hover:bg-[#ffa348]/[0.07] transition-colors active:bg-[#ffa348]/[0.12]"
            >
              <Ungroup className="h-3.5 w-3.5 text-[#ffa348] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#ffd9ae] text-left flex-1">
                {t('menu.extractSubgraphs')}
              </span>
            </button>
          )}
        </>
      )}

      {/* Group 2: Workflow Information */}
      {(onShowWorkflowJson || onShowObjectInfo) && (
        <>
          {/* Group Title */}
          <div className="h-px bg-white/[0.06] my-1" />
          <div className="px-3 pt-1 pb-1">
            <h3 className="font-mono text-[9px] font-semibold text-[#565d6b] uppercase tracking-[0.14em]">
              {t('menu.workflowInfo')}
            </h3>
          </div>

          {/* Workflow JSON Viewer */}
          {onShowWorkflowJson && (
            <button
              onClick={onShowWorkflowJson}
              className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
            >
              <FileJson className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.viewWorkflowJson')}
              </span>
            </button>
          )}

          {/* Object Info Viewer */}
          {onShowObjectInfo && (
            <button
              onClick={onShowObjectInfo}
              className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
            >
              <Database className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
              <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
                {t('menu.viewObjectInfo')}
              </span>
            </button>
          )}
        </>
      )}

      {/* Group 3: System Controls */}
      <>
        {/* Group Title */}
        <div className="h-px bg-white/[0.06] my-1" />
        <div className="px-3 pt-1 pb-1">
          <h3 className="font-mono text-[9px] font-semibold text-[#565d6b] uppercase tracking-[0.14em]">
            {t('menu.system')}
          </h3>
        </div>

        {/* Workflow Snapshots Option */}
        {onShowWorkflowSnapshots && (
          <button
            onClick={onShowWorkflowSnapshots}
            className="w-full h-8 px-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors active:bg-white/[0.07]"
          >
            <Camera className="h-3.5 w-3.5 text-[#8a919e] flex-shrink-0" strokeWidth={1.8} />
            <span className="text-[11.5px] font-medium text-[#d5d9e0] text-left flex-1">
              {t('menu.workflowSnapshots')}
            </span>
          </button>
        )}

        <button
          onClick={onClearVRAM}
          disabled={isClearingVRAM}
          className="w-full h-8 px-3 flex items-center gap-2 hover:bg-[#f25555]/[0.07] transition-colors disabled:opacity-50 active:bg-[#f25555]/[0.12]"
        >
          {isClearingVRAM ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f25555] flex-shrink-0" />
          ) : (
            <Brush className="h-3.5 w-3.5 text-[#f25555] flex-shrink-0" strokeWidth={1.8} />
          )}
          <span className="text-[11.5px] font-medium text-[#f87c7c] text-left flex-1">
            {isClearingVRAM ? t('menu.clearing') : t('menu.clearVram')}
          </span>
        </button>
      </>
    </div>
  );
};
