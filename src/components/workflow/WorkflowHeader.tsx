import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, ChevronRight, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IComfyWorkflow, WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { WorkflowHeaderProgressBar } from '@/components/execution/ExecutionProgressBar';
import { WorkflowSession } from '@/ui/store/globalStore';

// Custom morphing icon component
const SaveToCheckIcon: React.FC<{
  isSaving: boolean;
  isSuccess: boolean;
  size?: number
}> = ({ isSaving, isSuccess, size = 16 }) => {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <AnimatePresence mode="wait">
        {isSaving ? (
          <motion.div
            key="saving"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.13 }}
            className="absolute flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <Loader2 style={{ width: size, height: size }} className="animate-spin" />
          </motion.div>
        ) : isSuccess ? (
          <motion.svg
            key="success"
            className="absolute"
            style={{ width: size * 1.5, height: size * 1.5 }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "backOut" }}
          >
            <motion.path
              d="M9 12l2 2 4-4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.25, delay: 0.05 }}
            />
          </motion.svg>
        ) : (
          <motion.svg
            key="save"
            className="absolute"
            style={{ width: size, height: size }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.13 }}
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
};

interface WorkflowHeaderProps {
  workflow: IComfyWorkflow;
  selectedNode: WorkflowNode | null;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  onNavigateBack: () => void;
  onSaveChanges?: () => void;
  saveSucceeded?: boolean; // New prop to trigger checkmark animation
  sessionStack?: WorkflowSession[];
  onNavigateBreadcrumb?: (index: number) => void;
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workflow,
  selectedNode,
  hasUnsavedChanges = false,
  isSaving = false,
  onNavigateBack,
  onSaveChanges,
  saveSucceeded = false,
  sessionStack,
  onNavigateBreadcrumb,
}) => {
  const { t } = useTranslation();
  const [showCheckmark, setShowCheckmark] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  // Auto-scroll breadcrumbs to the right when session stack changes
  useEffect(() => {
    if (breadcrumbRef.current) {
      const container = breadcrumbRef.current;
      container.scrollLeft = container.scrollWidth;
    }
  }, [sessionStack]);

  // Handle save success animation
  useEffect(() => {
    if (saveSucceeded) {
      setShowCheckmark(true);
      const timer = setTimeout(() => {
        setShowCheckmark(false);
      }, 1000); // Show checkmark for 1 second before fade out
      return () => clearTimeout(timer);
    }
  }, [saveSucceeded]);

  return (
    <header className="absolute top-0 left-0 right-0 z-10 pwa-header">
      <div className="bg-slate-600/20 backdrop-blur-3xl shadow-xl border-b border-white/30 px-4 py-5 space-y-2 relative overflow-hidden">
        <div className="flex items-center space-x-4 relative z-10">
          <Button
            onClick={onNavigateBack}
            variant="ghost"
            size="sm"
            className="bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-xl"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Button>

          <div className="min-w-0 flex-1">
            {sessionStack && sessionStack.length > 1 ? (
              <div
                ref={breadcrumbRef}
                className="flex items-center space-x-1 overflow-x-auto no-scrollbar mask-gradient-left"
              >
                {sessionStack.map((session, index) => {
                  const isLast = index === sessionStack.length - 1;
                  const isRoot = index === 0;
                  return (
                    <div key={index} className="flex items-center flex-shrink-0">
                      {index > 0 && <ChevronRight className="w-4 h-4 text-slate-400 mx-1 flex-shrink-0" />}
                      <button
                        onClick={() => !isLast && onNavigateBreadcrumb?.(index)}
                        disabled={isLast}
                        className={`flex items-center space-x-1 font-bold truncate transition-colors ${isLast
                          ? 'text-lg text-slate-900 dark:text-slate-100 cursor-default'
                          : 'text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                      >
                        <span className="truncate max-w-[150px]">{session.title || (isRoot ? workflow?.name : 'Subgraph')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <h1 className="text-lg font-bold text-white tracking-tight truncate">
                {workflow?.name || t('workflow.newWorkflowName')}
              </h1>
            )}
            <div className="flex items-center space-x-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[10px] bg-white/10 text-white border-white/20 flex-shrink-0">
                {workflow?.nodeCount || 0} {t('workflow.nodes')}
              </Badge>
              {selectedNode && (
                <Badge className="text-[10px] bg-blue-500/30 text-blue-300 border-blue-500/40 flex-shrink-0">
                  {selectedNode.type}
                </Badge>
              )}
            </div>
          </div>

          {/* Save Button Slot - Reserved space to prevent breadcrumb invasion */}
          <div className="w-10 h-10 flex items-center justify-end flex-shrink-0">
            <AnimatePresence>
              {(hasUnsavedChanges || showCheckmark) && (
                <motion.div
                  initial={{ opacity: 0, x: 20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
                  transition={{ duration: 0.3, ease: "backOut" }}
                >
                  <Button
                    onClick={onSaveChanges}
                    disabled={isSaving || showCheckmark}
                    size="sm"
                    className={`text-white border border-white/20 backdrop-blur-sm shadow-lg transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg ${showCheckmark
                      ? 'bg-emerald-500/80'
                      : isSaving
                        ? 'bg-gray-500/80 cursor-not-allowed'
                        : 'bg-green-500/80 hover:bg-green-600/90 hover:shadow-xl'
                      }`}
                    title={showCheckmark ? t('common.saved') : isSaving ? t('common.saving') : t('workflow.saveChanges')}
                  >
                    <SaveToCheckIcon
                      isSaving={isSaving}
                      isSuccess={showCheckmark}
                      size={24}
                    />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Execution Progress Bar */}
        <WorkflowHeaderProgressBar />
      </div>
    </header>
  );
};