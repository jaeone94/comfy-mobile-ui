import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Server, Settings } from 'lucide-react';

interface ServerConnectionRequiredProps {
  workflow: {
    name: string;
    nodeCount?: number;
    createdAt?: Date;
  };
  onNavigateToSettings: () => void;
  onClose: () => void;
}

export const ServerConnectionRequired: React.FC<ServerConnectionRequiredProps> = ({
  workflow,
  onNavigateToSettings,
  onClose
}) => {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-orange-200/60 shadow-2xl dark:bg-slate-900/95 dark:border-orange-700/60 max-h-[60vh] flex flex-col">
      {/* Fixed Header */}
      <div className="p-4 border-b border-orange-200/50 dark:border-orange-700/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('connectionGuard.title')}
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {t('connectionGuard.subtitle')}
              </p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 flex-shrink-0 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded-lg"
            >
              <span className="text-2xl leading-none">×</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Workflow Info */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mb-4">
            <h4 className="text-base font-medium text-slate-900 dark:text-slate-100 mb-2">
              {t('connectionGuard.workflowInfo')}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">{t('connectionGuard.name')}</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {workflow.name}
                </span>
              </div>
              {workflow.nodeCount && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{t('connectionGuard.nodes')}</span>
                  <Badge variant="outline" className="text-xs">
                    {workflow.nodeCount} {t('workflow.nodes')}
                  </Badge>
                </div>
              )}
              {workflow.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{t('connectionGuard.created')}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {workflow.createdAt.toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* What's Missing */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 mb-4">
            <h4 className="text-base font-medium text-orange-900 dark:text-orange-100 mb-2">
              {t('connectionGuard.withoutConnection')}
            </h4>
            <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
              <li>• {t('connectionGuard.features.nodeParams')}</li>
              <li>• {t('connectionGuard.features.metadata')}</li>
              <li>• {t('connectionGuard.features.execution')}</li>
              <li>• {t('connectionGuard.features.uploads')}</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={onNavigateToSettings}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              {t('connectionGuard.configure')}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/20"
            >
              <Server className="w-4 h-4 mr-2" />
              {t('connectionGuard.continueViewing')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};