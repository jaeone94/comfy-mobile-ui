/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Plus, Edit, Trash2, Download, Upload, Copy, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { WidgetTypeDefinitionModal } from '@/components/modals/WidgetTypeDefinitionModal';
import { WidgetTypeDefinition } from '@/shared/types/app/WidgetFieldTypes';
import { useWidgetTypes, WidgetTypeManager } from '@/core/services/WidgetTypeManager';
import { useTranslation } from 'react-i18next';

export const WidgetTypeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { widgetTypes, loading, error, saveWidgetType, deleteWidgetType, loadWidgetTypes } = useWidgetTypes();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWidgetType, setEditingWidgetType] = useState<WidgetTypeDefinition | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWidgetTypes = widgetTypes.filter(type =>
    type.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateNew = () => {
    setEditingWidgetType(null);
    setIsModalOpen(true);
  };

  const handleEdit = (widgetType: WidgetTypeDefinition) => {
    setEditingWidgetType(widgetType);
    setIsModalOpen(true);
  };

  const handleDelete = async (widgetType: WidgetTypeDefinition) => {
    if (!confirm(t('widgetTypeSettings.deleteConfirm', { id: widgetType.id }))) {
      return;
    }

    try {
      await deleteWidgetType(widgetType.id);
      toast.success(t('widgetTypeSettings.toast.deleteSuccess', { id: widgetType.id }));
    } catch (error) {
      toast.error(t('widgetTypeSettings.toast.deleteFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  };

  const handleSaveWidgetType = async (widgetType: WidgetTypeDefinition) => {
    try {
      await saveWidgetType(widgetType);
    } catch (error) {
      throw error; // Let the modal handle the error display
    }
  };

  const handleExport = (widgetType: WidgetTypeDefinition) => {
    const jsonString = WidgetTypeManager.exportWidgetType(widgetType);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${widgetType.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('widgetTypeSettings.toast.exportSuccess'));
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const jsonString = await file.text();
        const widgetType = WidgetTypeManager.importWidgetType(jsonString);

        const validation = WidgetTypeManager.validateWidgetType(widgetType);
        if (!validation.valid) {
          toast.error(t('widgetTypeSettings.toast.invalidType', { errors: validation.errors.join(', ') }));
          return;
        }

        await saveWidgetType(widgetType);
        toast.success(t('widgetTypeSettings.toast.importSuccess', { id: widgetType.id }));
      } catch (error) {
        toast.error(t('widgetTypeSettings.toast.importFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
      }
    };
    input.click();
  };

  const handleCopyToClipboard = async (widgetType: WidgetTypeDefinition) => {
    try {
      const jsonString = WidgetTypeManager.exportWidgetType(widgetType);
      await navigator.clipboard.writeText(jsonString);
      toast.success(t('widgetTypeSettings.toast.copySuccess'));
    } catch (error) {
      toast.error(t('widgetTypeSettings.toast.copyFailed'));
    }
  };

  const handleCreateLoraExample = async () => {
    try {
      const loraExample = WidgetTypeManager.createLoraConfigExample();
      await saveWidgetType(loraExample);
      toast.success(t('widgetTypeSettings.toast.exampleSuccess'));
    } catch (error) {
      toast.error(t('widgetTypeSettings.toast.exampleFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  };

  if (loading && widgetTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-slate-600 dark:text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('widgetTypeSettings.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <Button onClick={loadWidgetTypes} variant="outline">
          {t('widgetTypeSettings.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {t('widgetTypeSettings.title')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t('widgetTypeSettings.subtitle')}
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleImport} variant="outline" size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            {t('widgetTypeSettings.import')}
          </Button>
          <Button onClick={handleCreateNew} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            {t('widgetTypeSettings.createType')}
          </Button>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <Input
            placeholder={t('widgetTypeSettings.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        {widgetTypes.length === 0 && (
          <Button onClick={handleCreateLoraExample} variant="outline" size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            {t('widgetTypeSettings.createLoraExample')}
          </Button>
        )}
      </div>

      {/* Widget Types Grid */}
      {filteredWidgetTypes.length === 0 ? (
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/20 dark:border-slate-700/30 rounded-xl shadow-lg">
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="text-center space-y-4">
              <div className="text-slate-500 dark:text-slate-400">
                {searchTerm ? (
                  <>
                    <p className="text-lg font-medium">{t('widgetTypeSettings.noMatchingTypes')}</p>
                    <p className="text-sm">{t('widgetTypeSettings.noMatchingTypesDesc')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium">{t('widgetTypeSettings.noTypesDefined')}</p>
                    <p className="text-sm">{t('widgetTypeSettings.noTypesDefinedDesc')}</p>
                  </>
                )}
              </div>

              {!searchTerm && (
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={handleCreateNew}
                    className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white backdrop-blur-sm"
                  >
                    <Plus className="h-4 w-4" />
                    {t('widgetTypeSettings.createWidgetType')}
                  </Button>
                  <Button
                    onClick={handleCreateLoraExample}
                    className="gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <FileText className="h-4 w-4" />
                    {t('widgetTypeSettings.createLoraExample')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWidgetTypes.map((widgetType) => (
            <div
              key={widgetType.id}
              className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/20 dark:border-slate-700/30 rounded-xl shadow-lg hover:shadow-xl hover:bg-white/80 dark:hover:bg-slate-900/80 transition-all duration-300 group"
            >
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-mono font-semibold bg-slate-100/80 dark:bg-slate-800/80 px-3 py-2 rounded backdrop-blur-sm text-slate-900 dark:text-slate-100 inline-block">
                    {widgetType.id}
                  </h3>
                </div>

                {widgetType.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-4">
                    {widgetType.description}
                  </p>
                )}

                {/* Field Summary */}
                <div className="space-y-2 mb-4">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('widgetTypeSettings.fields', { count: Object.keys(widgetType.fields).length })}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(widgetType.fields).slice(0, 4).map(([name, config]) => (
                      <span
                        key={name}
                        className="text-xs bg-slate-100/60 dark:bg-slate-800/60 backdrop-blur-sm text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-700/50"
                      >
                        {name}: {config.type}
                      </span>
                    ))}
                    {Object.keys(widgetType.fields).length > 4 && (
                      <span className="text-xs bg-slate-100/60 dark:bg-slate-800/60 backdrop-blur-sm text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-700/50">
                        +{Object.keys(widgetType.fields).length - 4} more
                      </span>
                    )}
                  </div>
                </div>


                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleEdit(widgetType)}
                    size="sm"
                    className="flex-1 gap-1 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200"
                  >
                    <Edit className="h-3 w-3" />
                    {t('widgetTypeSettings.edit')}
                  </Button>

                  <Button
                    onClick={() => handleCopyToClipboard(widgetType)}
                    size="sm"
                    className="gap-1 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>

                  <Button
                    onClick={() => handleExport(widgetType)}
                    size="sm"
                    className="gap-1 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200"
                  >
                    <Download className="h-3 w-3" />
                  </Button>

                  <Button
                    onClick={() => handleDelete(widgetType)}
                    size="sm"
                    className="gap-1 bg-red-50/60 dark:bg-red-900/30 backdrop-blur-sm hover:bg-red-100/80 dark:hover:bg-red-900/50 border border-red-200/50 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Widget Type Definition Modal */}
      <WidgetTypeDefinitionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingWidgetType={editingWidgetType}
        onSave={handleSaveWidgetType}
      />
    </div>
  );
};