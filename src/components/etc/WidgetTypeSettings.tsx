/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Plus, Edit, Trash2, Download, Upload, Copy, FileText, Loader2, Search } from 'lucide-react';
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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{error}</p>
        <Button onClick={loadWidgetTypes} variant="outline" className="border-white/10 text-white hover:bg-white/10">
          {t('widgetTypeSettings.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title section handled by parent in new design, but keeping for standalone usage correctness */}
        <div className="hidden sm:block">
          <h2 className="text-2xl font-bold tracking-tight text-white/90">{t('widgetTypeSettings.title')}</h2>
          <p className="text-muted-foreground">{t('widgetTypeSettings.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCreateNew} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="mr-2 h-4 w-4" />
            {t('widgetTypeSettings.createType')}
          </Button>
          <Button variant="outline" onClick={handleImport} className="border-white/10 bg-white/5 hover:bg-white/10 text-white/80">
            <Upload className="mr-2 h-4 w-4" />
            {t('widgetTypeSettings.import')}
          </Button>
          <Button variant="outline" onClick={handleCreateLoraExample} className="border-white/10 bg-white/5 hover:bg-white/10 text-white/80">
            <FileText className="mr-2 h-4 w-4" />
            {t('widgetTypeSettings.createLoraExample')}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          placeholder={t('widgetTypeSettings.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-white/20 h-10 rounded-xl"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredWidgetTypes.map((widgetType) => (
          <Card key={widgetType.id} className="group relative overflow-hidden bg-black/20 border-white/10 transition-all hover:bg-black/30 hover:border-indigo-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base font-medium text-white/90">
                <span className="truncate" title={widgetType.id}>{widgetType.id}</span>
                <div className="flex transition-all">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 transition-colors" onClick={() => handleCopyToClipboard(widgetType)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 transition-colors" onClick={() => handleExport(widgetType)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 transition-colors" onClick={() => handleEdit(widgetType)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500/50 hover:text-red-400 hover:bg-red-500/10 transition-colors" onClick={() => handleDelete(widgetType)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              <CardDescription className="text-white/40 text-xs truncate">
                {widgetType.description || t('widgetTypeSettings.noDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-300 border-0">
                  {t('widgetTypeSettings.fields', { count: Object.keys(widgetType.fields).length })}
                </Badge>
                {Object.keys(widgetType.fields).length > 0 && (
                  <span className="text-xs text-white/30">
                    {Object.keys(widgetType.fields)[0]}
                    {Object.keys(widgetType.fields).length > 1 && ` +${Object.keys(widgetType.fields).length - 1}`}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredWidgetTypes.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-white/5 p-4">
                <Search className="h-8 w-8 opacity-50" />
              </div>
            </div>
            <p className="text-lg font-medium text-white/60">{t('widgetTypeSettings.noMatchingTypes')}</p>
            <p className="text-sm text-white/30">{t('widgetTypeSettings.noMatchingTypesDesc')}</p>
          </div>
        )}
      </div>

      <WidgetTypeDefinitionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingWidgetType={editingWidgetType}
        onSave={handleSaveWidgetType}
      />
    </div>
  );
};