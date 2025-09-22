import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IComfyWorkflow, WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { WorkflowHeaderProgressBar } from '@/components/execution/ExecutionProgressBar';

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
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workflow,
  selectedNode,
  hasUnsavedChanges = false,
  isSaving = false,
  onNavigateBack,
  onSaveChanges,
  saveSucceeded = false,
}) => {
  const [showCheckmark, setShowCheckmark] = useState(false);

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
    <header className="absolute top-0 left-0 right-0 z-10 p-4 pwa-header">
      <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 border-b border-white/20 dark:border-slate-600/20 px-4 py-5 space-y-2 relative overflow-hidden">
        <div className="flex items-center space-x-4">
          <Button
            onClick={onNavigateBack}
            variant="outline"
            size="sm"
            className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {workflow?.name || 'Untitled Workflow'}
            </h1>
            <div className="flex items-center space-x-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 flex-shrink-0">
                {workflow?.nodeCount || 0} nodes
              </Badge>
              {selectedNode && (
                <Badge className="text-xs bg-gradient-to-r from-blue-500/80 to-cyan-500/80 backdrop-blur-sm flex-shrink-0 border border-white/20">
                  {selectedNode.type}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Save Button - Fixed right position */}
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
                  className={`text-white border border-white/20 backdrop-blur-sm shadow-lg transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg ${
                    showCheckmark
                      ? 'bg-emerald-500/80'
                      : isSaving 
                        ? 'bg-gray-500/80 cursor-not-allowed'
                        : 'bg-green-500/80 hover:bg-green-600/90 hover:shadow-xl'
                  }`}
                  title={showCheckmark ? "Saved!" : isSaving ? "Saving..." : "Save changes"}
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

        {/* Execution Progress Bar */}
        <WorkflowHeaderProgressBar />
      </div>
    </header>
  );
};