import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  WidgetTypeDefinition,
  WidgetTypeFormData,
  FieldConfig,
  FIELD_TYPE_OPTIONS,
  FieldType
} from '@/shared/types/app/WidgetFieldTypes';

interface WidgetTypeDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingWidgetType?: WidgetTypeDefinition | null;
  onSave: (widgetType: WidgetTypeDefinition) => Promise<void>;
}

export const WidgetTypeDefinitionModal: React.FC<WidgetTypeDefinitionModalProps> = ({
  isOpen,
  onClose,
  editingWidgetType,
  onSave
}) => {
  const [formData, setFormData] = useState<WidgetTypeFormData & { id: string }>({
    id: '',
    description: '',
    tooltip: '',
    fields: []
  });
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form data when modal opens or editing widget changes
  useEffect(() => {
    if (isOpen) {
      if (editingWidgetType) {
        // Populate form with existing widget type data
        setFormData({
          id: editingWidgetType.id,
          description: editingWidgetType.description || '',
          tooltip: editingWidgetType.tooltip || '',
          fields: Object.entries(editingWidgetType.fields).map(([name, config], index) => ({
            id: `field_${index}`,
            name,
            config
          }))
        });
      } else {
        // Reset form for new widget type
        setFormData({
          id: '',
          description: '',
          tooltip: '',
          fields: []
        });
      }
    }
  }, [isOpen, editingWidgetType]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const addField = () => {
    const newField = {
      id: `field_${Date.now()}`,
      name: '',
      config: {
        type: 'string' as FieldType,
        label: '',
        description: '',
        default: ''
      }
    };
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
  };

  const removeField = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId)
    }));
  };

  const updateField = (fieldId: string, updates: Partial<{ name: string; config: FieldConfig }>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId
          ? { ...field, ...updates }
          : field
      )
    }));
  };

  const updateFieldConfig = (fieldId: string, configUpdates: Partial<FieldConfig>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId
          ? { ...field, config: { ...field.config, ...configUpdates } }
          : field
      )
    }));
  };

  const generateDefaultValue = () => {
    // For single field widgets, return the value directly (not as an object)
    if (formData.fields.length === 1 && formData.fields[0].name) {
      const field = formData.fields[0];
      return field.config.default !== undefined
        ? field.config.default
        : getDefaultValueForType(field.config.type);
    }

    // For multi-field widgets, use object structure
    const defaultValue: Record<string, any> = {};
    formData.fields.forEach(field => {
      if (field.name) {
        defaultValue[field.name] = field.config.default !== undefined
          ? field.config.default
          : getDefaultValueForType(field.config.type);
      }
    });
    return defaultValue;
  };

  const getDefaultValueForType = (type: FieldType): any => {
    switch (type) {
      case 'boolean': return false;
      case 'string': return '';
      case 'float': case 'int': return 0;
      case 'combo': case 'lora': case 'model': case 'embedding': return '';
      default: return null;
    }
  };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      toast.error(t('widgetType.validation.idRequired'));
      return false;
    }

    if (formData.fields.length === 0) {
      toast.error(t('widgetType.validation.fieldsRequired'));
      return false;
    }

    for (const field of formData.fields) {
      if (!field.name.trim()) {
        toast.error(t('widgetType.validation.nameRequired'));
        return false;
      }
      if (!field.config.label.trim()) {
        toast.error(t('widgetType.validation.labelRequired'));
        return false;
      }
    }

    // Check for duplicate field names
    const fieldNames = formData.fields.map(f => f.name);
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      toast.error(t('widgetType.validation.duplicateNames', { names: duplicates.join(', ') }));
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      // Build field definitions
      const fields: Record<string, FieldConfig> = {};
      formData.fields.forEach(field => {
        fields[field.name] = field.config;
      });

      const widgetType: WidgetTypeDefinition = {
        id: formData.id,
        description: formData.description,
        tooltip: formData.tooltip,
        fields,
        defaultValue: generateDefaultValue(),
        version: editingWidgetType ? (editingWidgetType.version || 1) + 1 : 1,
        updatedAt: new Date().toISOString()
      };

      if (!editingWidgetType) {
        widgetType.createdAt = new Date().toISOString();
      }

      await onSave(widgetType);
      toast.success(t('widgetType.success', {
        id: formData.id,
        action: editingWidgetType ? t('common.updated') : t('widgetType.create')
      }));
      onClose();
    } catch (error) {
      toast.error(t('widgetType.error', { error: error instanceof Error ? error.message : t('common.unknown') }));
    } finally {
      setIsSaving(false);
    }
  };

  const getFieldTypeOption = (type: FieldType) => {
    return FIELD_TYPE_OPTIONS.find(opt => opt.value === type);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 pwa-modal"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-4xl max-h-[90vh] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-xl shadow-2xl border border-white/30 dark:border-slate-700/40 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between backdrop-blur-sm">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {editingWidgetType ? t('widgetType.editTitle') : t('widgetType.createTitle')}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {t('widgetType.subtitle')}
                </p>
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-white/30 dark:border-slate-700/40 rounded-xl shadow-lg">
                <div className="p-6 border-b border-slate-200/30 dark:border-slate-700/30">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('widgetType.basicInfo')}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t('widgetType.basicInfoDesc')}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="widget-id">{t('widgetType.id')} *</Label>
                      <Input
                        id="widget-id"
                        value={formData.id}
                        onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                        placeholder={t('widgetType.idPlaceholder')}
                        className="font-mono bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-white/30 dark:border-slate-700/30"
                        readOnly={!!editingWidgetType}
                        disabled={!!editingWidgetType}
                      />
                      {editingWidgetType && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('widgetType.idImmutable')}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="widget-tooltip">{t('widgetType.tooltip')}</Label>
                      <Input
                        id="widget-tooltip"
                        value={formData.tooltip}
                        onChange={(e) => setFormData(prev => ({ ...prev, tooltip: e.target.value }))}
                        placeholder={t('widgetType.tooltipPlaceholder')}
                        className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-white/30 dark:border-slate-700/30"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="widget-description">{t('widgetType.description')}</Label>
                    <Textarea
                      id="widget-description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t('widgetType.descriptionPlaceholder')}
                      rows={3}
                      className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-white/30 dark:border-slate-700/30"
                    />
                  </div>
                </div>
              </div>

              {/* Field Definitions */}
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-white/30 dark:border-slate-700/40 rounded-xl shadow-lg">
                <div className="p-6 border-b border-slate-200/30 dark:border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('widgetType.fieldDefinitions')}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {t('widgetType.fieldDefinitionsDesc')}
                      </p>
                    </div>
                    <Button
                      onClick={addField}
                      size="sm"
                      className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white backdrop-blur-sm"
                    >
                      <Plus className="h-4 w-4" />
                      {t('widgetType.addField')}
                    </Button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {formData.fields.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      {t('widgetType.noFields')}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.fields.map((field, index) => (
                        <div key={field.id} className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-dashed border-slate-300/60 dark:border-slate-600/60 rounded-lg shadow-sm">
                          <div className="p-4 pb-3 border-b border-slate-200/30 dark:border-slate-700/30">
                            <div className="flex items-center justify-between">
                              <h4 className="text-base font-medium text-slate-900 dark:text-slate-100">{t('widgetType.field', { index: index + 1 })}</h4>
                              <Button
                                onClick={() => removeField(field.id)}
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50/50 dark:hover:bg-red-900/30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            {/* Field Name and Label */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>{t('widgetType.fieldName')} *</Label>
                                <Input
                                  value={field.name}
                                  onChange={(e) => updateField(field.id, { name: e.target.value })}
                                  placeholder={t('widgetType.fieldNamePlaceholder')}
                                  className="font-mono bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>{t('widgetType.displayLabel')} *</Label>
                                <Input
                                  value={field.config.label}
                                  onChange={(e) => updateFieldConfig(field.id, { label: e.target.value })}
                                  placeholder={t('widgetType.displayLabelPlaceholder')}
                                  className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                />
                              </div>
                            </div>

                            {/* Field Type */}
                            <div className="space-y-2">
                              <Label>{t('widgetType.fieldType')}</Label>
                              <Select
                                value={field.config.type}
                                onValueChange={(value: FieldType) => updateFieldConfig(field.id, { type: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FIELD_TYPE_OPTIONS.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                      <div>
                                        <div className="font-medium">{option.label}</div>
                                        <div className="text-sm text-slate-500">{option.description}</div>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {(field.config.type === 'int' || field.config.type === 'float') && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                  {t('widgetType.numericTip')}
                                </p>
                              )}
                            </div>

                            {/* Field Description */}
                            <div className="space-y-2">
                              <Label>{t('widgetType.fieldDesc')}</Label>
                              <Textarea
                                value={field.config.description || ''}
                                onChange={(e) => updateFieldConfig(field.id, { description: e.target.value })}
                                placeholder={t('widgetType.fieldDescPlaceholder')}
                                rows={2}
                                className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                              />
                            </div>

                            {/* Type-specific configuration */}
                            {(() => {
                              const typeOption = getFieldTypeOption(field.config.type);

                              return (
                                <div className="space-y-4">
                                  {/* Validation constraints for numeric types */}
                                  {typeOption?.supportsValidation && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <div className="space-y-2">
                                        <Label>{t('widgetType.minValue')}</Label>
                                        <Input
                                          type="number"
                                          step={field.config.type === 'int' ? "1" : "any"}
                                          value={field.config.min ?? ''}
                                          onChange={(e) => updateFieldConfig(field.id, {
                                            min: e.target.value ? (
                                              field.config.type === 'int'
                                                ? parseInt(e.target.value)
                                                : parseFloat(e.target.value)
                                            ) : undefined
                                          })}
                                          placeholder={t('node.min')}
                                          className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>{t('widgetType.maxValue')}</Label>
                                        <Input
                                          type="number"
                                          step={field.config.type === 'int' ? "1" : "any"}
                                          value={field.config.max ?? ''}
                                          onChange={(e) => updateFieldConfig(field.id, {
                                            max: e.target.value ? (
                                              field.config.type === 'int'
                                                ? parseInt(e.target.value)
                                                : parseFloat(e.target.value)
                                            ) : undefined
                                          })}
                                          placeholder="No limit"
                                          className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>{t('widgetType.step')}</Label>
                                        <Input
                                          type="number"
                                          step={field.config.type === 'int' ? "1" : "any"}
                                          value={field.config.step ?? ''}
                                          onChange={(e) => updateFieldConfig(field.id, {
                                            step: e.target.value ? (
                                              field.config.type === 'int'
                                                ? parseInt(e.target.value)
                                                : parseFloat(e.target.value)
                                            ) : undefined
                                          })}
                                          placeholder={field.config.type === 'int' ? "1" : "0.1"}
                                          className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Options for combo type */}
                                  {typeOption?.supportsOptions && (
                                    <div className="space-y-2">
                                      <Label>{t('widgetType.options')}</Label>
                                      <div className="space-y-3">
                                        {/* Options List */}
                                        <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/40 dark:border-slate-700/40 rounded-md">
                                          {(field.config.options || []).map((option: string, index: number) => (
                                            <div
                                              key={index}
                                              className="flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 px-2 py-1 rounded text-sm border border-violet-200/50 dark:border-violet-700/50"
                                            >
                                              <span>{option}</span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newOptions = (field.config.options || []).filter((_: string, i: number) => i !== index);
                                                  updateFieldConfig(field.id, { options: newOptions });
                                                }}
                                                className="ml-1 text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Add New Option Input */}
                                        <div className="flex gap-2">
                                          <Input
                                            placeholder={t('widgetType.addOption')}
                                            className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const input = e.currentTarget;
                                                const newOption = input.value.trim();
                                                if (newOption && !(field.config.options || []).includes(newOption)) {
                                                  const newOptions = [...(field.config.options || []), newOption];
                                                  updateFieldConfig(field.id, { options: newOptions });
                                                  input.value = '';
                                                }
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={(e) => {
                                              const input = (e.currentTarget.parentElement as HTMLDivElement)?.querySelector('input');
                                              if (input) {
                                                const newOption = input.value.trim();
                                                if (newOption && !(field.config.options || []).includes(newOption)) {
                                                  const newOptions = [...(field.config.options || []), newOption];
                                                  updateFieldConfig(field.id, { options: newOptions });
                                                  input.value = '';
                                                }
                                              }
                                            }}
                                            className="bg-violet-600 hover:bg-violet-700 text-white backdrop-blur-sm"
                                          >
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        {/* Fallback Textarea for Advanced Users */}
                                        <details className="text-sm">
                                          <summary className="cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
                                            {t('widgetType.advancedBulk')}
                                          </summary>
                                          <div className="mt-2">
                                            <Textarea
                                              value={(field.config.options || []).join('\n')}
                                              onChange={(e) => updateFieldConfig(field.id, {
                                                options: e.target.value.split('\n').filter(opt => opt.trim())
                                              })}
                                              placeholder="option1&#10;option2&#10;option3"
                                              rows={4}
                                              className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                              style={{
                                                resize: 'vertical',
                                                minHeight: '80px'
                                              }}
                                              inputMode="text"
                                              enterKeyHint="enter"
                                            />
                                          </div>
                                        </details>
                                      </div>
                                    </div>
                                  )}


                                  {/* Default value - only for basic types */}
                                  {typeOption?.supportsDefault && (
                                    <div className="space-y-2">
                                      <Label>{t('widgetType.defaultValue')}</Label>
                                      {field.config.type === 'boolean' ? (
                                        <Select
                                          value={field.config.default !== undefined ? String(field.config.default) : 'false'}
                                          onValueChange={(value) => {
                                            updateFieldConfig(field.id, { default: value === 'true' });
                                          }}
                                        >
                                          <SelectTrigger className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40">
                                            <SelectValue placeholder="Select default value" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="false">
                                              <div className="flex items-center gap-2">
                                                <span className="text-red-600 dark:text-red-400">✗</span>
                                                <span>{t('common.false')}</span>
                                              </div>
                                            </SelectItem>
                                            <SelectItem value="true">
                                              <div className="flex items-center gap-2">
                                                <span className="text-green-600 dark:text-green-400">✓</span>
                                                <span>{t('common.true')}</span>
                                              </div>
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input
                                          value={field.config.default ?? ''}
                                          onChange={(e) => {
                                            let defaultValue: any = e.target.value;

                                            // Type conversion based on field type
                                            if (field.config.type === 'int') {
                                              defaultValue = e.target.value ? parseInt(e.target.value) : undefined;
                                            } else if (field.config.type === 'float') {
                                              defaultValue = e.target.value ? parseFloat(e.target.value) : undefined;
                                            }

                                            updateFieldConfig(field.id, { default: defaultValue });
                                          }}
                                          placeholder={`Default ${field.config.type} value`}
                                          className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-white/40 dark:border-slate-700/40"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-end gap-3 backdrop-blur-sm">
              <Button
                onClick={onClose}
                disabled={isSaving}
                className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              >
                {t('widgetType.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white backdrop-blur-sm">
                {isSaving ? (
                  <>
                    <Upload className="h-4 w-4 animate-spin" />
                    {t('widgetType.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {editingWidgetType ? t('widgetType.update') : t('widgetType.create')}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};