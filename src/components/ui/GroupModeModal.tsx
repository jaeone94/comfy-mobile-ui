import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeMode } from '@/shared/types/app/base';

interface Group {
  id: number;
  title: string;
  bounding: [number, number, number, number]; // [x, y, width, height]
  color?: string;
  nodeIds: number[];
}

interface GroupModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onGroupModeChange: (groupId: number, mode: NodeMode) => void;
  title: string;
  getCurrentNodeMode?: (nodeId: number) => NodeMode | null;
}

export const GroupModeModal: React.FC<GroupModeModalProps> = ({
  isOpen,
  onClose,
  groups,
  onGroupModeChange,
  title,
  getCurrentNodeMode
}) => {
  const { t } = useTranslation();
  // Analyze group's current state
  const getGroupCurrentMode = (group: Group): NodeMode | null => {
    if (!getCurrentNodeMode || group.nodeIds.length === 0) {
      return null;
    }

    const modes = group.nodeIds
      .map(nodeId => getCurrentNodeMode(nodeId))
      .filter(mode => mode !== null) as NodeMode[];

    if (modes.length === 0) {
      return null;
    }

    // Check if all nodes have the same mode
    const firstMode = modes[0];
    const allSameMode = modes.every(mode => mode === firstMode);

    return allSameMode ? firstMode : null;
  };

  const modeButtons = [
    {
      mode: NodeMode.ALWAYS,
      label: t('node.mode.always'),
      className: 'bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-300 border-green-400/30 dark:border-green-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium'
    },
    {
      mode: NodeMode.NEVER,
      label: t('node.mode.mute'),
      className: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 border-blue-400/30 dark:border-blue-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium'
    },
    {
      mode: NodeMode.BYPASS,
      label: t('node.mode.bypass'),
      className: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 border-purple-400/30 dark:border-purple-500/30 backdrop-blur-sm shadow-lg hover:shadow-xl font-medium'
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Enhanced Glassmorphism Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md z-[100] pwa-modal"
            onClick={onClose}
          />

          {/* Full Screen Enhanced Glassmorphism Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pwa-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">
              {/* Gradient Overlay for Enhanced Glass Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
              {/* Glassmorphism Header */}
              <div className="relative flex items-center justify-between p-6 pb-4 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <div className="flex items-center space-x-3">
                  <Layers className="w-6 h-6 text-violet-400 drop-shadow-sm" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                    {title}
                  </h2>
                </div>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Glassmorphism Content */}
              <div className="relative flex-1 overflow-y-auto px-6 pb-6">
                {groups.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 dark:text-slate-300 drop-shadow-sm">
                    {t('node.group.noGroups')}
                  </div>
                ) : (
                  <div className="space-y-4 mt-4">
                    {groups.map((group) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: group.id * 0.05 }}
                        className="bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 dark:border-slate-600/20 shadow-lg hover:bg-white/15 dark:hover:bg-slate-700/15 transition-all duration-300"
                      >
                        {/* Group Info */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            {/* Group Color Indicator */}
                            {group.color && (
                              <div
                                className="w-3 h-3 rounded-full border border-white/50"
                                style={{ backgroundColor: group.color }}
                              />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="font-semibold text-slate-900 dark:text-white drop-shadow-sm">
                                  {group.title}
                                </h3>
                                {(() => {
                                  const currentMode = getGroupCurrentMode(group);
                                  if (currentMode) {
                                    const activeButton = modeButtons.find(b => b.mode === currentMode);
                                    return (
                                      <span className="text-xs px-2 py-1 rounded-full bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30">
                                        {activeButton?.label}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300 drop-shadow-sm">
                                {group.nodeIds.length} {t('workflow.nodes')}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Mode Buttons */}
                        <div className="flex space-x-2">
                          {modeButtons.map((button) => {
                            const currentMode = getGroupCurrentMode(group);
                            const isActive = currentMode === button.mode;

                            return (
                              <Button
                                key={button.mode}
                                onClick={() => onGroupModeChange(group.id, button.mode)}
                                variant="outline"
                                size="sm"
                                className={`flex-1 h-9 text-xs font-medium transition-all duration-200 relative ${isActive
                                  ? `${button.className} ring-2 ring-white/50 dark:ring-slate-300/50 shadow-xl scale-105`
                                  : `${button.className} opacity-70 hover:opacity-100`
                                  }`}
                              >
                                {button.label}
                                {isActive && (
                                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-current shadow-lg" />
                                )}
                              </Button>
                            );
                          })}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};