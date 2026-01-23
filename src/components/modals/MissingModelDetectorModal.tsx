import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, Info, Package, ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ComboWidget } from '@/components/controls/widgets/ComboWidget';
import { useWidgetValueEditor } from '@/hooks/useWidgetValueEditor';
import type { MissingModelInfo } from '@/services/MissingModelsService';
import type { IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';

interface MissingModelDetectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingModels: MissingModelInfo[];
  widgetEditor?: ReturnType<typeof useWidgetValueEditor>;
}

const MissingModelDetectorModal: React.FC<MissingModelDetectorModalProps> = ({
  isOpen,
  onClose,
  missingModels,
  widgetEditor: externalWidgetEditor,
}) => {
  const { t } = useTranslation();
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const localWidgetEditor = useWidgetValueEditor();
  const widgetEditor = externalWidgetEditor || localWidgetEditor;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);

  const baseTitleSize = '1.5rem';

  useEffect(() => {
    if (isOpen) {
      setIsHeaderCompact(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen, missingModels.length]);

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

  // Group missing models by model name
  const groupedModels = useMemo(() => {
    const groups = new Map<string, MissingModelInfo[]>();
    for (const modelInfo of missingModels) {
      const existing = groups.get(modelInfo.missingModel) || [];
      existing.push(modelInfo);
      groups.set(modelInfo.missingModel, existing);
    }
    return Array.from(groups.entries());
  }, [missingModels]);

  const toggleExpanded = (modelName: string) => {
    setExpandedModel(prev => prev === modelName ? null : modelName);
  };

  const handleModelReplacement = (nodeId: number, widgetName: string, newValue: string) => {
    widgetEditor.setModifiedWidgetValue(nodeId, widgetName, newValue);
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 overflow-hidden text-xs">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="relative w-[90vw] h-[85vh] pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Card */}
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-[40px] shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Dynamic Sticky Header */}
            <div
              className={`absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] transition-all duration-300 ease-in-out
                ${isHeaderCompact
                  ? 'pt-2 pb-[11px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10'
                  : 'pt-5 pb-5 pl-6 pr-16 border-transparent bg-black/20 backdrop-blur-0'
                }`}
            >
              {/* Floating Close Button */}
              <div
                className={`absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}
              >
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all pointer-events-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0 pointer-events-none">
                <div className={`flex items-center space-x-2 transition-all duration-300 origin-left ${isHeaderCompact ? 'mb-0.5 scale-90' : 'mb-2 scale-100'}`}>
                  <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-black/20 text-white/80 border-transparent">
                    SYSTEM
                  </Badge>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                    {t('missingModels.title')}
                  </span>
                </div>

                <div className="flex items-center min-w-0 transition-all duration-300" style={{ height: isHeaderCompact ? '11px' : '1.75rem' }}>
                  <h2
                    style={{
                      fontSize: baseTitleSize,
                      lineHeight: '1',
                      transform: isHeaderCompact ? `scale(${0.75 / parseFloat(baseTitleSize)})` : 'scale(1)',
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {t('missingModels.title')}
                  </h2>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Static Top Bumper */}
              <div className="h-[120px] relative pointer-events-none">
                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
              </div>

              <div className="px-5 pb-6 sm:px-6">
                {missingModels.length === 0 ? (
                  <div className="text-center py-16 rounded-[32px] bg-black/10 border border-dashed border-white/10">
                    <div className="relative mb-4">
                      <Package className="h-12 w-12 text-white/10 mx-auto" />
                      <Sparkles className="absolute top-0 right-1/2 translate-x-10 h-5 w-5 text-violet-400/30 animate-pulse" />
                    </div>
                    <p className="text-base font-medium text-white/60">
                      {t('missingModels.noMissingModels')}
                    </p>
                    <p className="text-xs text-white/30 mt-1">
                      {t('missingModels.allAvailable')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Warning Banner */}
                    <div className="p-4 rounded-[20px] bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-yellow-500/20">
                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-yellow-200">
                            {t('missingModels.warningTitle')}
                          </p>
                          <p className="text-[10px] text-yellow-100/60 mt-0.5 leading-relaxed">
                            {t('missingModels.warningDesc')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Model Grid */}
                    <div className="grid grid-cols-1 gap-3">
                      {groupedModels.map(([modelName, infos]) => {
                        const isExpanded = expandedModel === modelName;
                        return (
                          <div
                            key={modelName}
                            className={`group relative rounded-[24px] bg-black/10 border transition-all duration-300 ${isExpanded ? 'border-white/20 bg-black/20 shadow-lg' : 'border-white/5 hover:border-white/10 hover:bg-black/15'}`}
                          >
                            {/* Clickable Header */}
                            <button
                              className="w-full p-5 text-left"
                              onClick={() => toggleExpanded(modelName)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <div className={`p-2.5 rounded-xl bg-black/20 border border-white/5 transition-colors ${isExpanded ? 'text-violet-400 border-violet-500/20' : 'text-white/40'}`}>
                                      <Package className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="text-sm font-bold text-white/95 break-all leading-tight mb-0.5">
                                        {modelName}
                                      </h3>
                                      <Badge variant="outline" className="bg-white/5 text-white/40 border-white/10 text-[8px] font-bold tracking-widest uppercase px-1 py-0 h-4">
                                        {t('missingModels.missing')}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Layers className="w-3 h-3 text-white/20" />
                                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                                      {infos.length > 1
                                        ? t('missingModels.usedIn_plural', { count: infos.length })
                                        : t('missingModels.usedIn', { count: infos.length })
                                      }
                                    </span>
                                  </div>
                                </div>

                                <div className={`ml-4 p-1.5 rounded-full bg-white/5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                  <ChevronDown className="h-4 w-4 text-white/40" />
                                </div>
                              </div>
                            </button>

                            {/* Expandable Content */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-5 pb-5 pt-1 border-t border-white/5 space-y-5">
                                    {/* Usage Locations */}
                                    <div className="p-3.5 rounded-xl bg-black/20 border border-white/5">
                                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2.5">
                                        {t('missingModels.usageLocations')}
                                      </p>
                                      <div className="space-y-1.5">
                                        {infos.map((info, idx) => (
                                          <div key={idx} className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-violet-400/50 mt-1.5 flex-shrink-0" />
                                            <div className="text-xs text-white/70 leading-relaxed">
                                              <span className="font-bold text-white/90">{t('missingModels.node', { id: info.nodeId })}</span>
                                              {info.nodeTitle && (
                                                <span className="text-white/40 font-medium"> • {info.nodeTitle}</span>
                                              )}
                                              <div className="text-[9px] text-white/30 mt-0.5">
                                                {t('missingModels.widget')}: <span className="text-white/50">{info.widgetName}</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Replacement Section */}
                                    <div className="space-y-3">
                                      {infos.map((info, idx) => (
                                        <div key={idx} className="space-y-2.5 p-4 rounded-[18px] bg-white/5 border border-white/10">
                                          <div className="flex items-center justify-between">
                                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                              {t('missingModels.replaceFor', { id: info.nodeId })}
                                            </p>
                                            {widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) &&
                                              widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) !== info.missingModel && (
                                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[8px] h-3.5">
                                                  SAVED
                                                </Badge>
                                              )}
                                          </div>

                                          <div className="relative">
                                            <ComboWidget
                                              param={{
                                                name: info.widgetName,
                                                type: 'COMBO',
                                                config: {},
                                                possibleValues: info.availableModels,
                                                value: widgetEditor.getWidgetValue(info.nodeId, info.widgetName, info.missingModel),
                                                required: false,
                                                description: t('missingModels.selectAlternative')
                                              } as IProcessedParameter}
                                              editingValue={widgetEditor.getWidgetValue(info.nodeId, info.widgetName, info.missingModel)}
                                              onValueChange={(value) => handleModelReplacement(info.nodeId, info.widgetName, value)}
                                              options={info.availableModels}
                                            />
                                          </div>

                                          {widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) &&
                                            widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) !== info.missingModel && (
                                              <p className="text-[9px] font-medium text-emerald-400 animate-in fade-in slide-in-from-left-1">
                                                ✓ {t('missingModels.replacementSelected', { value: widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) })}
                                              </p>
                                            )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>

                    {/* Instructions */}
                    <div className="p-5 rounded-[24px] bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-start gap-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/20">
                          <Info className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-blue-200 mb-2">
                            {t('missingModels.howToResolve')}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            {[1, 2, 3, 4].map((step) => (
                              <div key={step} className="flex gap-2">
                                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-300 border border-blue-500/30">
                                  {step}
                                </span>
                                <p className="text-[10px] text-blue-100/60 leading-tight">
                                  {t(`missingModels.step${step}`)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
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

export default MissingModelDetectorModal;
