import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { X, Check, Edit, Image as ImageIcon, Video, Upload, Images, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { IComfyWidget } from '@/shared/types/app/IComfyGraphNode';
import { isImageFile, isVideoFile } from '@/shared/utils/ComfyFileUtils';
import { getGalleryPermissions } from '@/shared/utils/GalleryPermissionUtils';
import { InlineImagePreview } from '@/components/media/InlineImagePreview';
import { InlineVideoPreview } from '@/components/media/InlineVideoPreview';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import {
  NumberWidget,
  BooleanWidget,
  StringWidget,
  ComboWidget,
  SeedWithControlWidget,
  CustomDynamicWidget,
  getEditableTypes,
  isParameterTypeEditable
} from '@/components/controls/widgets';

interface UploadState {
  isUploading: boolean;
  nodeId?: number;
  paramName?: string;
  message?: string;
}

interface WidgetValueEditorProps {
  param: IProcessedParameter;
  nodeId: number;
  currentValue: any;
  isEditing: boolean;
  editingValue: any;
  uploadState: UploadState;
  isModified?: boolean;
  modifiedHighlightClasses?: string;
  onStartEditing: (nodeId: number, paramName: string, value: any) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onEditingValueChange: (value: any) => void;
  onFilePreview: (filename: string) => void;
  onFileUpload: (nodeId: number, paramName: string) => void;
  onFileUploadDirect?: (nodeId: number, paramName: string, file: File) => void;
  // Optional ComfyGraphNode context
  node?: ComfyGraphNode;
  widget?: IComfyWidget;
  // Callback to save control_after_generate to workflow metadata
  // Callback to save control_after_generate to workflow metadata
  onControlAfterGenerateChange?: (nodeId: number, value: string) => void;
  // Theme override for custom node colors
  themeOverride?: {
    container?: string;
    text?: string;
    label?: string;
    secondaryText?: string;
    border?: string;
  };
}

// Clipboard helper function with fallback
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // HTTPS
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // HTTP fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const result = document.execCommand('copy');
      document.body.removeChild(textArea);
      return result;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

export const WidgetValueEditor: React.FC<WidgetValueEditorProps> = ({
  param,
  nodeId,
  currentValue,
  isEditing,
  editingValue,
  uploadState,
  isModified = false,
  modifiedHighlightClasses = '',
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onEditingValueChange,
  onFilePreview,
  onFileUpload,
  onFileUploadDirect,
  // ComfyGraphNode context
  node,
  widget,
  onControlAfterGenerateChange,
  themeOverride
}) => {
  const { t } = useTranslation();
  const [showAlbumModal, setShowAlbumModal] = useState(false);

  // Debug logging for modal state changes
  React.useEffect(() => {
    console.log('🔍 showAlbumModal state changed:', showAlbumModal);
  }, [showAlbumModal]);
  const [forceRender, setForceRender] = useState(0);

  // Handle control_after_generate special case
  const isControlAfterGenerate = param.name === 'control_after_generate';
  const isSeedWithControl = (param.name === 'seed' || param.name === 'noise_seed') && widget && node?.getWidgets &&
    node.getWidgets()[((param as any).widgetIndex || 0) + 1]?.name === 'control_after_generate';

  // Get control widget if this is a seed with control_after_generate
  const controlWidget = isSeedWithControl ?
    node?.getWidgets?.()?.[((param as any).widgetIndex || 0) + 1] : null;

  // Handle widget callback execution
  const executeWidgetCallback = (value: any) => {
    if (widget?.callback && node) {
      try {
        widget.callback(value, node as any);
      } catch (error) {
        console.error('Widget callback error:', error);
      }
    }
  };

  // Handle value change with widget callback
  const handleValueChange = (newValue: any) => {
    onEditingValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  // Infer actual type for IMAGE/VIDEO parameters that come as COMBO from server
  const isImageParam = param.name.toLowerCase().includes('image') ||
    (param.possibleValues && param.possibleValues.some(v =>
      typeof v === 'string' && (v.includes('.png') || v.includes('.jpg') || v.includes('.jpeg') || v.includes('.gif') || v.includes('.webp'))
    ));
  const isVideoParam = param.name.toLowerCase().includes('video') ||
    (param.possibleValues && param.possibleValues.some(v =>
      typeof v === 'string' && (v.includes('.mp4') || v.includes('.avi') || v.includes('.mov') || v.includes('.mkv') || v.includes('.webm'))
    ));

  // Check if this widget has custom field definitions
  const hasCustomWidgetDefinition = widget?.customWidgetDefinition?.fields &&
    Object.keys(widget.customWidgetDefinition.fields).length > 0;

  // Check if parameter type is editable using widget registry
  const isEditable = isParameterTypeEditable(param.type) ||
    // Special case: custom widgets with field definitions are always editable
    hasCustomWidgetDefinition ||
    // Special case: seed with control_after_generate is always editable
    isSeedWithControl ||
    // Special case: IMAGE and VIDEO types (explicit or inferred) are editable with custom UI
    param.type === 'IMAGE' || param.type === 'VIDEO' || isImageParam || isVideoParam;

  if (isEditing) {
    return (
      <div className={`p-4 rounded-lg border transition-all duration-200 ${themeOverride?.container || 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'}`}>
        {/* Value Input Area */}
        <div className="space-y-4">
          {/* Widget Control Components */}
          {(() => {
            // Special handling for seed with control_after_generate
            if (isSeedWithControl) {
              return (
                <SeedWithControlWidget
                  param={param}
                  editingValue={editingValue}
                  onValueChange={handleValueChange}
                  controlWidget={controlWidget || undefined}
                  onControlAfterGenerateChange={onControlAfterGenerateChange}
                  forceRender={forceRender}
                  setForceRender={setForceRender}
                  widget={widget}
                  node={node}
                />
              );
            }

            // Check for custom widget fields first (overrides standard types)
            const customWidgetFields = widget?.customWidgetDefinition?.fields;
            if (customWidgetFields && Object.keys(customWidgetFields).length > 0) {
              return (
                <CustomDynamicWidget
                  param={param}
                  editingValue={editingValue}
                  onValueChange={handleValueChange}
                  widget={widget}
                  node={node}
                  customType={param.type}
                  fields={customWidgetFields}
                />
              );
            }

            // Handle different parameter types with dedicated widgets
            switch (param.type.toUpperCase()) {
              case 'INT':
              case 'FLOAT':
              case 'SEED':
                return (
                  <NumberWidget
                    param={param}
                    editingValue={editingValue}
                    onValueChange={handleValueChange}
                    type={param.type.toUpperCase() as 'INT' | 'FLOAT' | 'SEED'}
                    widget={widget}
                    node={node}
                  />
                );

              case 'BOOLEAN':
                return (
                  <BooleanWidget
                    param={param}
                    editingValue={editingValue}
                    onValueChange={handleValueChange}
                    widget={widget}
                    node={node}
                  />
                );

              case 'STRING':
                return (
                  <StringWidget
                    param={param}
                    editingValue={editingValue}
                    onValueChange={handleValueChange}
                    widget={widget}
                    node={node}
                  />
                );

              case 'COMBO':
              default:
                // Check for IMAGE/VIDEO types (either explicit type or inferred from name/values)
                if (param.type === 'IMAGE' || param.type === 'VIDEO' || isImageParam || isVideoParam) {
                  // Use ComboWidget design but with file selection functionality
                  const options = param.possibleValues || [];
                  return (
                    <div className="relative">
                      <select
                        value={String(editingValue || '')}
                        onClick={() => {
                          setShowAlbumModal(true);
                        }}
                        // Prevent actual selection since we're using the modal
                        onChange={() => { }}
                        className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-lg cursor-pointer"
                      >
                        <option value="">
                          {currentValue && currentValue !== '' ? currentValue : t('node.selectFileTyped', { type: (param.type === 'IMAGE' || isImageParam) ? t('node.image') : t('node.video') })}
                        </option>
                        {options.slice(0, 5).map((option) => (
                          <option key={String(option)} value={String(option)} disabled>
                            {String(option)}
                          </option>
                        ))}
                        {options.length > 5 && (
                          <option disabled>{t('node.moreFiles', { count: options.length - 5 })}</option>
                        )}
                      </select>
                      {/* Visual indicator for IMAGE/VIDEO type */}
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none flex items-center space-x-1">
                        {(param.type === 'IMAGE' || isImageParam) ? (
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Video className="h-4 w-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                  );
                } else if (isControlAfterGenerate) {
                  return (
                    <ComboWidget
                      param={param}
                      editingValue={editingValue}
                      onValueChange={handleValueChange}
                      options={['fixed', 'increment', 'decrement', 'randomize']}
                      widget={widget}
                      node={node}
                    />
                  );
                } else if (param.possibleValues && param.possibleValues.length > 0 && param.type !== 'IMAGE' && param.type !== 'VIDEO') {
                  return (
                    <ComboWidget
                      param={param}
                      editingValue={editingValue}
                      onValueChange={handleValueChange}
                      options={param.possibleValues}
                      widget={widget}
                      node={node}
                    />
                  );
                } else {
                  // Fallback to string widget for unknown types
                  return (
                    <StringWidget
                      param={param}
                      editingValue={editingValue}
                      onValueChange={handleValueChange}
                      widget={widget}
                      node={node}
                    />
                  );
                }
            }
          })()}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onCancelEditing();
            }}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/20"
          >
            <X className="w-4 h-4 mr-1" />
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSaveEditing();
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="w-4 h-4 mr-1" />
            {t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  // Normal display mode
  return (
    <div className={`px-2.5 py-3 rounded-lg ${themeOverride?.container || 'bg-slate-50 dark:bg-slate-800/50'}`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={`font-medium break-words leading-tight ${themeOverride?.label || 'text-slate-900 dark:text-slate-100'}`}>
            {param.label || param.name}
          </span>
          {param.required && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 flex-shrink-0">
              {t('node.required')}
            </Badge>
          )}
        </div>
        <Badge
          variant={hasCustomWidgetDefinition ? "secondary" : "outline"}
          className={`text-[10px] flex-shrink-0 ${hasCustomWidgetDefinition ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700' : ''}`}
        >
          {param.type}
          {hasCustomWidgetDefinition && (
            <span className="ml-1 text-purple-600 dark:text-purple-400">●</span>
          )}
        </Badge>
      </div>

      <div className="mb-2">
        <span className={`text-sm ${themeOverride?.secondaryText || 'text-slate-600 dark:text-slate-400'}`}>{t('node.value')}: </span>
        <div className="inline-flex items-center space-x-2">
          {isEditable ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStartEditing(nodeId, param.name, currentValue);
              }}
              className={`text-sm px-2 py-1 rounded inline-flex items-center max-w-[250px] md:max-w-[350px] align-bottom transition-all duration-200 hover:shadow-sm active:scale-95 cursor-pointer border ${isModified
                ? 'bg-[#10b981] dark:bg-[#10b981] text-white dark:text-white border-[#10b981] dark:border-[#10b981] hover:bg-[#059669] dark:hover:bg-[#059669]'
                : (themeOverride
                  ? 'bg-transparent border-white/20 text-white/90 hover:bg-white/10'
                  : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600')
                } ${modifiedHighlightClasses}`}
            >
              {param.type === 'BOOLEAN' ? (
                <div className="flex items-center mr-2">
                  <div className={`w-3 h-3 rounded-full mr-2 ${Boolean(currentValue) ? 'bg-green-500' : 'bg-slate-400'
                    }`} />
                  <span className="font-mono">{Boolean(currentValue) ? t('node.true') : t('node.false')}</span>
                </div>
              ) : (
                <span className="font-mono mr-2 truncate flex-1 min-w-0">
                  {(() => {
                    const displayValue = currentValue !== undefined
                      ? (typeof currentValue === 'object'
                        ? JSON.stringify(currentValue)
                        : String(currentValue))
                      : t('node.undefined');

                    // Truncate very long values to ensure edit icon is always visible
                    const maxLength = 40;
                    return displayValue.length > maxLength
                      ? displayValue.substring(0, maxLength) + '...'
                      : displayValue;
                  })()}
                </span>
              )}
              <Edit className="w-3 h-3 opacity-60 flex-shrink-0" />
            </button>
          ) : (
            <div className={`text-sm px-2 py-1 rounded inline-block max-w-[250px] md:max-w-[350px] truncate align-bottom border ${themeOverride ? 'bg-transparent border-white/20 text-white/80' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {param.type === 'BOOLEAN' ? (
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${Boolean(currentValue) ? 'bg-green-500' : 'bg-slate-400'
                    }`} />
                  <span className="font-mono">{Boolean(currentValue) ? t('node.true') : t('node.false')}</span>
                </div>
              ) : (
                <span className="font-mono">
                  {(() => {
                    const displayValue = currentValue !== undefined
                      ? (typeof currentValue === 'object'
                        ? JSON.stringify(currentValue)
                        : String(currentValue))
                      : t('node.undefined');

                    // Truncate very long values
                    const maxLength = 40;
                    return displayValue.length > maxLength
                      ? displayValue.substring(0, maxLength) + '...'
                      : displayValue;
                  })()}
                </span>
              )}
            </div>
          )}

          {/* Upload Icons for Image/Video Files */}
          {currentValue != null && typeof currentValue === 'string' && (isImageFile(currentValue) || isVideoFile(currentValue)) && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onFileUpload(nodeId, param.name);
                }}
                disabled={uploadState.isUploading && uploadState.nodeId === nodeId && uploadState.paramName === param.name}
                className={`p-1.5 rounded-md transition-all duration-200 hover:shadow-sm active:scale-95 border ${uploadState.isUploading && uploadState.nodeId === nodeId && uploadState.paramName === param.name
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                  : 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-800/50 text-green-600 dark:text-green-400 border-green-200 dark:border-green-700'
                  }`}
                title={t('node.uploadNewFile', { type: isImageFile(currentValue) ? t('node.image') : t('node.video') })}
              >
                {uploadState.isUploading && uploadState.nodeId === nodeId && uploadState.paramName === param.name ? (
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Upload Status Message */}
        {uploadState.message && uploadState.nodeId === nodeId && uploadState.paramName === param.name && (
          <div className="mt-2 text-xs text-center">
            <span className={`px-2 py-1 rounded-md ${uploadState.message.includes('✅')
              ? 'bg-[#10b981] dark:bg-[#10b981] text-white dark:text-white'
              : uploadState.message.includes('❌')
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              }`}>
              {uploadState.message}
            </span>
          </div>
        )}

        {/* Inline Image Preview */}
        {currentValue != null && typeof currentValue === 'string' && isImageFile(currentValue) && (
          <div className="mt-3">
            <InlineImagePreview
              imagePreview={currentValue}
              onClick={() => onFilePreview(currentValue)}
              themeOverride={themeOverride ? {
                ...themeOverride,
                container: 'bg-black/20 border border-white/5'
              } : undefined}
            />
          </div>
        )}

        {/* Inline Video Preview */}
        {currentValue != null && typeof currentValue === 'string' && isVideoFile(currentValue) && (
          <div className="mt-3">
            <InlineVideoPreview
              videoPreview={currentValue}
              onClick={() => onFilePreview(currentValue)}
              themeOverride={themeOverride ? {
                ...themeOverride,
                container: 'bg-black/20 border border-white/5'
              } : undefined}
            />
          </div>
        )}
      </div>

      {/* Parameter Description */}
      {param.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          {param.description}
        </p>
      )}

      {/* Possible Values for COMBO type */}
      {param.possibleValues && param.possibleValues.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium">{t('node.options')}: </span>
          <span>
            {(() => {
              // Truncate long option values
              const truncateOption = (option: string, maxLength: number = 20) => {
                return option.length > maxLength ? option.substring(0, maxLength) + '...' : option;
              };

              const displayOptions = param.possibleValues!.slice(0, 3).map(option =>
                truncateOption(String(option))
              );

              const optionsText = displayOptions.join(', ');

              // If the combined text is still too long, further truncate
              const maxTotalLength = 60;
              if (optionsText.length > maxTotalLength) {
                return optionsText.substring(0, maxTotalLength) + '...';
              }

              const remainingCount = param.possibleValues!.length - displayOptions.length;
              return optionsText + (remainingCount > 0 ? ` + ${t('node.more', { count: remainingCount })}` : '');
            })()}
          </span>
        </div>
      )}

      {/* Validation Info for INT/FLOAT types */}
      {param.validation && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {param.validation.min !== undefined && (
            <span>{t('node.min')}: {param.validation.min} </span>
          )}
          {param.validation.max !== undefined && (
            <span>{t('node.max')}: {param.validation.max} </span>
          )}
          {param.validation.step !== undefined && (
            <span>{t('node.step')}: {param.validation.step}</span>
          )}
        </div>
      )}

      {/* File Selection Gallery - Rendered via Portal */}
      {showAlbumModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto overscroll-contain"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain'
          }}
        >
          <OutputsGallery
            isFileSelectionMode={true}
            {...getGalleryPermissions(param.name, currentValue, param.possibleValues)}
            initialFolder="input"
            onFileSelect={(filename) => {
              // For IMAGE/VIDEO types, directly update widget value without editing mode
              // Start editing mode, set value, and save immediately
              onStartEditing(nodeId, param.name, filename);
              // Set the editing value
              setTimeout(() => {
                onEditingValueChange(filename);
                // Save immediately
                setTimeout(() => {
                  onSaveEditing();
                }, 50);
              }, 50);
              setShowAlbumModal(false);
            }}
            onBackClick={() => setShowAlbumModal(false)}
            selectionTitle={t('node.selectionTitle', { type: (param.type === 'IMAGE' || isImageParam) ? t('node.image') : (param.type === 'VIDEO' || isVideoParam) ? t('node.video') : t('node.file'), name: param.name })}
          />
        </div>,
        document.body
      )}
    </div>
  );
};