import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { X, Layers, Play, VolumeX, Shuffle, MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Constants for title scaling
  const baseTitleSize = '1.875rem'; // text-3xl roughly
  const compactTitleSize = '0.8125rem';

  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderCompact(!entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0,
        rootMargin: '0px'
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsHeaderCompact(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen]);

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

    const firstMode = modes[0];
    const allSameMode = modes.every(mode => mode === firstMode);

    return allSameMode ? firstMode : null;
  };

  const modeButtons = [
    {
      mode: NodeMode.ALWAYS,
      label: t('node.mode.always'),
      icon: Play,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      activeColor: 'text-emerald-400',
      activeBorder: 'border-emerald-400/30'
    },
    {
      mode: NodeMode.NEVER,
      label: t('node.mode.mute'),
      icon: VolumeX,
      color: 'text-[#3b82f6]',
      bg: 'bg-[#3b82f6]/10',
      activeColor: 'text-[#3b82f6]',
      activeBorder: 'border-blue-400/30'
    },
    {
      mode: NodeMode.BYPASS,
      label: t('node.mode.bypass'),
      icon: Shuffle,
      color: 'text-[#9333ea]',
      bg: 'bg-[#9333ea]/10',
      activeColor: 'text-[#9333ea]',
      activeBorder: 'border-purple-400/30'
    }
  ];

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'none' }}>
        {/* Premium Glassmorphism Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md pointer-events-auto"
          onClick={onClose}
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="relative w-[90vw] h-[85vh] pointer-events-auto flex flex-col"
        >
          {/* Main Card */}
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-3xl shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Dynamic Sticky Header */}
            <div
              className={`absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] transition-all duration-300 ease-in-out
                ${isHeaderCompact
                  ? 'pt-2 pb-[13px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10'
                  : 'pt-6 pb-6 pl-6 pr-16 border-transparent bg-black/20 backdrop-blur-0'
                }`}
            >
              {/* Floating Close Button */}
              <div
                className={`absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}
              >
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0">
                <div
                  className={`flex items-center space-x-2 transition-all duration-300 origin-left ${isHeaderCompact ? 'mb-1 scale-90' : 'mb-3 scale-100'}`}
                >
                  <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-white/80 border-transparent">
                    {t('node.group.batch', 'BATCH')}
                  </Badge>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                    {title}
                  </span>
                </div>

                <div
                  className="flex items-center min-w-0 transition-all duration-300"
                  style={{ height: isHeaderCompact ? '13px' : '2rem' }}
                >
                  <h2
                    style={{
                      fontSize: baseTitleSize,
                      lineHeight: '1',
                      transform: isHeaderCompact ? `scale(${0.8125 / 1.875})` : 'scale(1)',
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {t('node.group.title', 'Group Control')}
                  </h2>
                </div>

                <div
                  className={`inline-flex self-start items-center text-xs font-medium px-2 rounded-md border m-0 transition-all duration-300 overflow-hidden text-white/80 bg-black/20 border-white/10
                    ${isHeaderCompact
                      ? 'opacity-0 scale-75 h-0 mt-0 py-0 border-transparent'
                      : 'opacity-100 scale-100 h-6 mt-3 py-1'
                    }`}
                >
                  {t('node.group.totalGroups', { count: groups.length, defaultValue: `${groups.length} Groups Active` })}
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Static Top Bumper */}
              <div className="h-[150px] relative pointer-events-none">
                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
              </div>

              <div className="px-5 py-6 sm:px-6">
                {groups.length === 0 ? (
                  <div className="text-center py-12 rounded-3xl bg-black/10 border border-dashed border-white/10">
                    <p className="text-white/40 text-sm">{t('node.group.noGroups')}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2 p-1">
                      <Layers className="w-4 h-4 text-white/50" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                        {t('node.group.availableGroups', 'Groups Available')}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {groups.map((group) => {
                        const currentMode = getGroupCurrentMode(group);

                        return (
                          <div
                            key={group.id}
                            className="group relative p-4 rounded-2xl bg-black/10 border border-white/5 hover:bg-black/20 hover:border-white/10 transition-all duration-300"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  {group.color && (
                                    <div
                                      className="w-3 h-3 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                                      style={{ backgroundColor: group.color }}
                                    />
                                  )}
                                  <h4 className="font-bold text-sm text-white/90 truncate">
                                    {group.title}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-medium text-white/40">
                                  <Badge variant="outline" className="text-[8px] px-1 py-0 bg-white/5 border-white/5 text-white/40 uppercase">
                                    ID: {group.id}
                                  </Badge>
                                  <span>{t('node.nodesCount', { count: group.nodeIds.length })}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl ring-1 ring-white/5 flex-shrink-0">
                                {modeButtons.map((config) => {
                                  const isActive = currentMode === config.mode;
                                  return (
                                    <button
                                      key={config.mode}
                                      onClick={() => onGroupModeChange(group.id, config.mode)}
                                      className={`px-2.5 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 group/btn ${isActive
                                        ? `${config.color} ${config.bg} ring-1 ${config.activeBorder} shadow-lg shadow-black/20`
                                        : 'text-white/20 hover:text-white/60 hover:bg-white/5'
                                        }`}
                                      title={config.label}
                                    >
                                      <config.icon className={`w-4 h-4 ${isActive ? 'scale-110' : 'scale-100'} transition-transform`} />
                                      {isActive && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider">
                                          {config.label}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
