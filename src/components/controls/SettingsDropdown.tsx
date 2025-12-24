import { Badge } from '@/components/ui/badge';
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Dices, Users, FileJson, Database, Hash, Camera, Brush, Move, Link, AlertTriangle, Package } from 'lucide-react';
import type { MissingModelInfo } from '@/services/MissingModelsService';

interface SettingsDropdownProps {
  isOpen: boolean;
  isClearingVRAM: boolean;
  isExecuting: boolean; // Add execution state for dynamic positioning
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

export const SettingsDropdown = forwardRef<HTMLDivElement, SettingsDropdownProps>(({
  isOpen,
  isClearingVRAM,
  isExecuting,
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
}, ref) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="fixed right-4 w-60 z-50 pwa-header"
      style={{
        top: isExecuting ? '254px' : '168px'
      }}
    >
      {/* Glassmorphism container - EXACTLY like QuickActionPanel */}
      <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 border border-white/20 dark:border-slate-600/20 p-2 relative overflow-hidden">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

        {/* Content container - EXACTLY like QuickActionPanel */}
        <div className="relative z-10">
          {/* Group 1: Workflow Tools */}
          {(onShowGroupModer || onRandomizeSeeds || onToggleRepositionMode || onToggleConnectionMode || (missingNodesCount ?? 0) > 0 || missingModels.length > 0) && (
            <>
              {missingNodesCount > 0 && onShowMissingNodeInstaller && (
                <button
                  onClick={onShowMissingNodeInstaller}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-500/10 dark:hover:bg-red-900/20 transition-colors"
                >
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300 text-left flex-1">
                    {t('menu.installMissingNodes')}
                  </span>
                  {installablePackageCount > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs">{installablePackageCount}</Badge>
                  )}
                </button>
              )}
              {missingModels.length > 0 && onOpenMissingModelDetector && (
                <button
                  onClick={onOpenMissingModelDetector}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-yellow-500/10 dark:hover:bg-yellow-900/20 transition-colors"
                >
                  <Package className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300 text-left flex-1">
                    {t('menu.missingModelDetector')}
                  </span>
                  <Badge variant="outline" className="ml-auto text-xs border-yellow-600 text-yellow-700 dark:border-yellow-400 dark:text-yellow-300">
                    {missingModels.length}
                  </Badge>
                </button>
              )}
              {/* Group Title */}
              <div className="px-4 py-2 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10 rounded-t-xl">
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  {t('menu.workflowTools')}
                </h3>
              </div>

              {/* Fast Group Moder Button */}
              {onShowGroupModer && (
                <button
                  onClick={onShowGroupModer}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <Users className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                    {t('menu.fastGroupModer')}
                  </span>
                </button>
              )}

              {/* Trigger Word Selector */}
              <button
                onClick={onShowTriggerWordSelector}
                className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
              >
                <Hash className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                  {t('menu.triggerWords')}
                </span>
              </button>

              {/* Randomize Seeds Button */}
              {onRandomizeSeeds && (
                <button
                  onClick={() => onRandomizeSeeds(true)}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <Dices className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                    {t('menu.randomizeSeeds')}
                  </span>
                </button>
              )}

              {/* Node Repositioning Button */}
              {onToggleRepositionMode && (
                <button
                  onClick={onToggleRepositionMode}
                  className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors ${repositionMode?.isActive
                    ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : ''
                    }`}
                >
                  <Move className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                    {t('menu.nodeRepositioning')}
                  </span>
                </button>
              )}

              {/* Node Connection Button */}
              {onToggleConnectionMode && (
                <button
                  onClick={onToggleConnectionMode}
                  className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors ${connectionMode?.isActive
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                    : ''
                    }`}
                >
                  <Link className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
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
              <div className="px-4 py-2 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  {t('menu.workflowInfo')}
                </h3>
              </div>

              {/* Workflow JSON Viewer */}
              {onShowWorkflowJson && (
                <button
                  onClick={onShowWorkflowJson}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <FileJson className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                    {t('menu.viewWorkflowJson')}
                  </span>
                </button>
              )}

              {/* Object Info Viewer */}
              {onShowObjectInfo && (
                <button
                  onClick={onShowObjectInfo}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <Database className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                    {t('menu.viewObjectInfo')}
                  </span>
                </button>
              )}
            </>
          )}

          {/* Group 3: System Controls */}
          <>
            {/* Group Title */}
            <div className="px-4 py-2 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                {t('menu.system')}
              </h3>
            </div>

            {/* Workflow Snapshots Option */}
            {onShowWorkflowSnapshots && (
              <button
                onClick={onShowWorkflowSnapshots}
                className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/20 dark:hover:bg-slate-700/30 transition-colors"
              >
                <Camera className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left flex-1">
                  {t('menu.workflowSnapshots')}
                </span>
              </button>
            )}

            <button
              onClick={onClearVRAM}
              disabled={isClearingVRAM}
              className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-500/20 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClearingVRAM ? (
                <Loader2 className="h-4 w-4 animate-spin text-red-600 dark:text-red-400 flex-shrink-0" />
              ) : (
                <Brush className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-red-700 dark:text-red-300 text-left flex-1">
                {isClearingVRAM ? t('menu.clearing') : t('menu.clearVram')}
              </span>
            </button>
          </>
        </div>
      </div>
    </div>
  );
});
