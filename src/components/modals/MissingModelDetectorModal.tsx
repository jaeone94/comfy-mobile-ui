import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, Info, Package, ChevronDown, ChevronUp } from 'lucide-react';
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

const glassPanelClass = 'bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/20 dark:border-slate-600/20 rounded-3xl shadow-2xl shadow-slate-900/20 dark:shadow-slate-900/40';
const flatPanelClass = 'bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-slate-900/20 dark:shadow-slate-900/40';

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

  // Reset expanded state when modal opens/closes or missingModels changes
  React.useEffect(() => {
    if (!isOpen) {
      setExpandedModel(null);
    }
  }, [isOpen, missingModels.length]);

  // Group missing models by model name
  const groupedModels = React.useMemo(() => {
    const groups = new Map<string, MissingModelInfo[]>();
    for (const modelInfo of missingModels) {
      const existing = groups.get(modelInfo.missingModel) || [];
      existing.push(modelInfo);
      groups.set(modelInfo.missingModel, existing);
    }
    return Array.from(groups.entries());
  }, [missingModels]);

  // Toggle expanded state - only one at a time
  const toggleExpanded = (modelName: string) => {
    setExpandedModel(prev => prev === modelName ? null : modelName);
  };

  // Handle model replacement selection
  const handleModelReplacement = (nodeId: number, widgetName: string, newValue: string) => {
    // Save to widgetEditor's modifiedWidgetValues
    widgetEditor.setModifiedWidgetValue(nodeId, widgetName, newValue);
    console.log(`Model replacement: Node ${nodeId}, Widget ${widgetName} = ${newValue}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md pwa-modal"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pwa-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`relative w-full max-w-3xl ${flatPanelClass}`} style={{ overflow: 'visible' }}>

              <div className="relative flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {t('missingModels.title')}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {groupedModels.length !== 1
                      ? t('missingModels.subtitle_plural', { count: groupedModels.length })
                      : t('missingModels.subtitle', { count: groupedModels.length })
                    }
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="relative p-6" style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'visible' }}>
                {missingModels.length === 0 ? (
                  <div className="text-center py-12">
                    <Info className="h-16 w-16 mx-auto mb-4 text-slate-400 dark:text-slate-600" />
                    <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      {t('missingModels.noMissingModels')}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      {t('missingModels.allAvailable')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Warning Banner */}
                    <div className={`${glassPanelClass} p-4 bg-yellow-500/10 dark:bg-yellow-900/10`}>
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            {t('missingModels.warningTitle')}
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            {t('missingModels.warningDesc')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Model Cards */}
                    <div className="space-y-3">
                      <AnimatePresence mode="wait">
                        {groupedModels.map(([modelName, infos]) => {
                          const isExpanded = expandedModel === modelName;
                          const isHidden = expandedModel !== null && expandedModel !== modelName;
                          const firstInfo = infos[0];

                          return (
                            <motion.div
                              key={modelName}
                              initial={{ opacity: 1, scale: 1, y: 0 }}
                              animate={{
                                opacity: isHidden ? 0 : 1,
                                scale: isHidden ? 0.95 : 1,
                                y: isHidden ? -20 : 0,
                                display: isHidden ? 'none' : 'block'
                              }}
                              exit={{ opacity: 0, scale: 0.95, y: -20 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              <div
                                className={`${glassPanelClass}`}
                                style={{ overflow: 'visible' }}
                              >
                                {/* Clickable Header */}
                                <div
                                  className="p-5 cursor-pointer hover:bg-white/10 dark:hover:bg-slate-700/10 transition-colors"
                                  onClick={() => toggleExpanded(modelName)}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <Package className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 break-all">
                                          {modelName}
                                        </h3>
                                        <Badge variant="outline" className="uppercase tracking-wide text-xs">
                                          {t('missingModels.missing')}
                                        </Badge>
                                      </div>

                                      <div className="space-y-2 mt-3">
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                          {infos.length > 1
                                            ? t('missingModels.usedIn_plural', { count: infos.length })
                                            : t('missingModels.usedIn', { count: infos.length })
                                          }
                                        </p>
                                      </div>
                                    </div>

                                    {/* Expand/Collapse Icon */}
                                    <div className="flex items-center">
                                      {isExpanded ? (
                                        <ChevronUp className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                                      ) : (
                                        <ChevronDown className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Expandable Content */}
                                {isExpanded && (
                                  <div className="px-5 pb-5 border-t border-white/10 dark:border-slate-600/10">
                                    <div className="space-y-4 pt-4" style={{ position: 'relative' }}>
                                      {/* Usage Locations */}
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                          {t('missingModels.usageLocations')}
                                        </p>
                                        <div className="space-y-1 pl-2">
                                          {infos.map((info, idx) => (
                                            <div key={idx} className="flex items-start gap-2 text-sm">
                                              <span className="text-slate-400 dark:text-slate-600 mt-0.5">•</span>
                                              <div className="text-slate-600 dark:text-slate-400 break-all">
                                                <span className="font-medium">{t('missingModels.node', { id: info.nodeId })}</span>
                                                {info.nodeTitle && (
                                                  <span className="text-slate-500 dark:text-slate-500"> ({info.nodeTitle})</span>
                                                )}
                                                <span className="text-slate-500 dark:text-slate-500"> - {t('missingModels.widget')} {info.widgetName}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Model Replacement Section for each node */}
                                      {infos.map((info, idx) => (
                                        <div key={idx} className="space-y-2 pt-3 border-t border-white/10 dark:border-slate-600/10">
                                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            {t('missingModels.replaceFor', { id: info.nodeId })} {info.nodeTitle ? `(${info.nodeTitle})` : ''}:
                                          </p>

                                          {/* ComboWidget for model selection */}
                                          <div className="pl-2" style={{ position: 'relative', minHeight: '50px', paddingBottom: '200px' }}>
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

                                          {/* Show if value was modified */}
                                          {widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) &&
                                            widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) !== info.missingModel && (
                                              <div className="pl-2 text-xs text-green-600 dark:text-green-400 break-all">
                                                {t('missingModels.replacementSelected', { value: widgetEditor.getWidgetValue(info.nodeId, info.widgetName, null) })}
                                              </div>
                                            )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* Instructions */}
                    <div className={`${glassPanelClass} p-4 bg-blue-500/10 dark:bg-blue-900/10`}>
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                            {t('missingModels.howToResolve')}
                          </p>
                          <ol className="list-decimal list-inside space-y-1 text-xs text-blue-700 dark:text-blue-300">
                            <li>{t('missingModels.step1')}</li>
                            <li>{t('missingModels.step2')}</li>
                            <li>{t('missingModels.step3')}</li>
                            <li>{t('missingModels.step4')}</li>
                          </ol>
                        </div>
                      </div>
                    </div>
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

export default MissingModelDetectorModal;