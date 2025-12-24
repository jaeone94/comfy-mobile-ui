import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { ExternalLink, Play, Target, Edit, ArrowDownToLine, ArrowUpFromLine, X, Image as ImageIcon, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { INodeWithMetadata, IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { WidgetValueEditor } from '@/components/controls/WidgetValueEditor';
import { VideoPreviewSection } from '@/components/media/VideoPreviewSection';
import { InlineImagePreview } from '@/components/media/InlineImagePreview';
import { PointEditor } from '@/components/controls/widgets/custom_node_widget/PointEditor';
import { detectParameterTypeForGallery, getGalleryPermissions } from '@/shared/utils/GalleryPermissionUtils';

interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  node: ComfyGraphNode;
}

interface EditingParam {
  nodeId: number;
  paramName: string;
}

interface UploadState {
  isUploading: boolean;
  nodeId?: number;
  paramName?: string;
  message?: string;
}

interface NodeParameterEditorProps {
  selectedNode: ComfyGraphNode;
  metadata: INodeWithMetadata | null;
  metadataLoading: boolean;
  metadataError: string | null;
  editingParam: EditingParam | null;
  editingValue: any;
  uploadState: UploadState;
  nodeBounds: Map<number, NodeBounds>;
  getWidgetValue: (nodeId: number, paramName: string, originalValue: any) => any;
  getNodeMode: (nodeId: number, originalMode: number) => number;
  modifiedWidgetValues: Map<number, Record<string, any>>;
  onStartEditing: (nodeId: number, paramName: string, value: any, widgetIndex?: number) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onEditingValueChange: (value: any) => void;
  onControlAfterGenerateChange?: (nodeId: number, value: string) => void;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  onFilePreview: (filename: string) => void;
  onFileUpload: (nodeId: number, paramName: string) => void;
  onFileUploadDirect?: (nodeId: number, paramName: string, file: File) => void;
  onNavigateToNode: (nodeId: number) => void;
  onSelectNode: (node: ComfyGraphNode) => void;
  // Direct widget value setting (for bypassing edit mode)
  setWidgetValue?: (nodeId: number, paramName: string, value: any) => void;
  // Single execute functionality
  isOutputNode?: boolean;
  canSingleExecute?: boolean;
  isSingleExecuting?: boolean;
  onSingleExecute?: (nodeId: number) => void;
  // Carousel state managed externally
  currentSlide?: number;
  // Link disconnection functionality
  onDisconnectInput?: (nodeId: number, inputSlot: number) => void;
  onDisconnectOutput?: (nodeId: number, outputSlot: number, linkId: number) => void;
}

export const NodeParameterEditor: React.FC<NodeParameterEditorProps> = ({
  selectedNode,
  metadata,
  metadataLoading,
  metadataError,
  editingParam,
  editingValue,
  uploadState,
  nodeBounds,
  getWidgetValue,
  getNodeMode,
  modifiedWidgetValues,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onEditingValueChange,
  onControlAfterGenerateChange,
  onNodeModeChange,
  onFilePreview,
  onFileUpload,
  onFileUploadDirect,
  onNavigateToNode,
  onSelectNode,
  setWidgetValue,
  // Single execute props
  isOutputNode = false,
  canSingleExecute = false,
  isSingleExecuting = false,
  onSingleExecute,
  // Carousel props
  currentSlide = 1,
  // Link disconnection props
  onDisconnectInput,
  onDisconnectOutput,
}) => {
  const { t } = useTranslation();

  // State for IMAGE/VIDEO file selection modal
  const [fileSelectionState, setFileSelectionState] = useState<{
    isOpen: boolean;
    paramName: string | null;
    paramType: 'IMAGE' | 'VIDEO' | null;
  }>({ isOpen: false, paramName: null, paramType: null });
  const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;

  // Helper function to detect IMAGE/VIDEO parameters (for Value area clicks)
  const detectParameterType = (param: IProcessedParameter): 'IMAGE' | 'VIDEO' | null => {
    const currentValue = getWidgetValue(nodeId, param.name, param.value);
    const possibleValues = param.possibleValues || [];

    return detectParameterTypeForGallery(param.name, currentValue, possibleValues);
  };


  // Handle file selection from OutputsGallery
  const handleFileSelect = (filename: string) => {
    if (fileSelectionState.paramName && setWidgetValue) {
      // Directly save the value without any editing mode
      setWidgetValue(nodeId, fileSelectionState.paramName, filename);
    } else if (fileSelectionState.paramName) {
      // Fallback: use the old editing mode method if setWidgetValue is not available
      const widgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
      const widgetIndex = widgets.findIndex(w => w.name === fileSelectionState.paramName);

      onStartEditing(nodeId, fileSelectionState.paramName, filename, widgetIndex >= 0 ? widgetIndex : undefined);
      setTimeout(() => {
        onEditingValueChange(filename);
        setTimeout(() => {
          onSaveEditing();
        }, 50);
      }, 50);
    }

    // Close file selection modal
    setFileSelectionState({ isOpen: false, paramName: null, paramType: null });
  };

  // Helper function to check if a widget has been modified
  const isWidgetModified = (paramName: string): boolean => {
    const nodeValues = modifiedWidgetValues.get(nodeId);
    return !!(nodeValues && paramName in nodeValues);
  };

  // Helper function to get modified highlight classes
  const getModifiedClasses = (paramName: string): string => {
    return isWidgetModified(paramName)
      ? 'bg-[#10b981] dark:bg-[#10b981] border-[#10b981] dark:border-[#10b981] ring-1 ring-[#10b981]/50 dark:ring-[#10b981]/50 text-white dark:text-white'
      : '';
  };

  // Helper function to extract videopreview information from ComfyGraphNode
  const extractVideoPreview = () => {
    const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
    // @deprecated 
    // // Check if there's a modified videopreview value using getWidgetValue
    // const videoPreviewValue = getWidgetValue(nodeId, 'videopreview', undefined);
    // if (videoPreviewValue?.params) {
    //   return videoPreviewValue.params;
    // }

    // // Check ComfyGraphNode widgets for videopreview
    // if (selectedNode.getWidgets) {
    //   const widgets = selectedNode.getWidgets();
    //   const videoWidget = widgets.find((w: any) => w.name === 'videopreview' || w.type === 'videopreview');
    //   if (videoWidget?.value?.params) {
    //     return videoWidget.value.params;
    //   }
    // }

    // // Fallback to original node widgets_values
    // if (!selectedNode?.widgets_values || typeof selectedNode.widgets_values !== 'object') {
    //   return null;
    // }

    // // Look for videopreview in widgets_values
    // let videoPreview = null;

    // // Handle object format widgets_values
    // if (!Array.isArray(selectedNode.widgets_values)) {
    //   const widgetsValues = selectedNode.widgets_values as Record<string, any>;

    //   // Check for videopreview.params structure
    //   if (widgetsValues.videopreview && widgetsValues.videopreview.params) {
    //     videoPreview = widgetsValues.videopreview.params;
    //   }
    // }

    return null;
  };

  // Helper function to extract image preview information from ComfyGraphNode
  const extractImagePreview = () => {
    const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;

    // Check if there's a modified imagepreview value using getWidgetValue
    const imagePreviewValue = getWidgetValue(nodeId, 'imagepreview', undefined);
    if (imagePreviewValue?.params) {
      return imagePreviewValue.params;
    }

    // Check ComfyGraphNode widgets for imagepreview
    if (selectedNode.getWidgets) {
      const widgets = selectedNode.getWidgets();
      const imageWidget = widgets.find((w: any) => w.name === 'imagepreview' || w.type === 'imagepreview');
      if (imageWidget?.value?.params) {
        return imageWidget.value.params;
      }

      // Also check for previewImage widget
      const previewWidget = widgets.find((w: any) => w.name === 'previewImage');
      if (previewWidget?.value) {
        return previewWidget.value;
      }
    }

    if (!selectedNode?.widgets_values || typeof selectedNode.widgets_values !== 'object') {
      return null;
    }

    // Handle object format widgets_values
    if (!Array.isArray(selectedNode.widgets_values)) {
      const widgetsValues = selectedNode.widgets_values as Record<string, any>;

      // Check for imagepreview.params structure first (from execution outputs)
      if (widgetsValues.imagepreview && widgetsValues.imagepreview.params) {
        return widgetsValues.imagepreview.params;
      }

      // Fallback to previewImage property for backwards compatibility
      if (widgetsValues.previewImage) {
        return widgetsValues.previewImage;
      }

    }

    return null;
  };

  // Helper function to extract widgets from ComfyGraphNode
  const extractComfyGraphWidgets = (): IProcessedParameter[] => {
    // First try to get widgets from the node
    if (selectedNode.getWidgets) {
      const widgets = selectedNode.getWidgets();
      if (widgets && widgets.length > 0) {
        return widgets.map((widget: any, index: number) => {
          // Handle special control_after_generate widgets
          if (widget.name === 'control_after_generate') {
            // This widget is usually paired with a seed widget, skip standalone rendering
            return null;
          }

          // Check if this is a seed widget with control_after_generate
          let hasDualWidget = false;
          let controlValue = null;
          if ((widget.name === 'seed' || widget.name === 'noise_seed') && widget.options?.control_after_generate) {
            hasDualWidget = true;
            // Find the control_after_generate widget value
            const controlWidget = widgets.find((w: any) => w.name === 'control_after_generate');
            controlValue = controlWidget?.value || 'fixed';
          }

          const param: IProcessedParameter = {
            name: widget.name,
            type: widget.type, // Use ComfyUI native types directly
            value: widget.value,
            description: widget.options?.tooltip,
            possibleValues: widget.options?.values,
            validation: {
              min: widget.options?.min,
              max: widget.options?.max,
              step: widget.options?.step
            },
            required: !widget.options?.optional,
            // Add widget index for proper widget management
            widgetIndex: index,
            config: {}, // Add missing config property
            // Add control_after_generate info if this is a seed widget
            controlAfterGenerate: hasDualWidget ? {
              enabled: true,
              value: controlValue,
              options: ['fixed', 'increment', 'decrement', 'randomize']
            } : undefined
          };

          return param;
        }).filter(Boolean) as IProcessedParameter[];
      }
    }

    // Get current widgets
    let widgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];

    // If no widgets, ensure they are initialized from widgets_values
    if ((!widgets || widgets.length === 0) && selectedNode.widgets_values) {

      // Initialize widgets on the node - try to get metadata first
      if (selectedNode.initializeWidgets) {
        // Try to get metadata from processor or graph
        let nodeMetadata = (selectedNode as any).nodeMetadata;

        // If no metadata on node, try to get it from processor's objectInfo
        if (!nodeMetadata) {

          // Try to get objectInfo from the graph
          const graph = (selectedNode as any).graph;
          if (graph && graph.processor && graph.processor.objectInfo) {
            const objectInfo = graph.processor.objectInfo;
            nodeMetadata = objectInfo[selectedNode.type];

          } else if (metadata) {
            nodeMetadata = metadata;
          }
        }

        selectedNode.initializeWidgets(selectedNode.widgets_values, nodeMetadata);

        // Try again to get widgets
        const newWidgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
        if (newWidgets && newWidgets.length > 0) {
          return newWidgets.map((widget: any, index: number) => {
            if (widget.name === 'control_after_generate') {
              return null;
            }

            return {
              name: widget.name,
              type: widget.type, // Use ComfyUI native types directly
              value: widget.value,
              description: widget.options?.tooltip,
              possibleValues: widget.options?.values,
              validation: {
                min: widget.options?.min,
                max: widget.options?.max,
                step: widget.options?.step
              },
              required: !widget.options?.optional,
              widgetIndex: index,
              config: {}
            };
          }).filter(Boolean) as IProcessedParameter[];
        }
      }
    }

    return [];
  };


  // Helper function to check if input is connected
  const isInputConnected = (inputName: string): boolean => {
    if (!selectedNode.inputs) return false;
    const input = selectedNode.inputs.find((i: any) => i.name === inputName);
    return input?.link !== null && input?.link !== undefined;
  };

  const renderParameterSection = (title: string, params: IProcessedParameter[], icon: React.ReactNode, isWidgetValues: boolean = false) => {
    if (!params || params.length === 0) return null;

    // Check if this is a PointsEditor node
    const isPointsEditor = selectedNode.type === 'PointsEditor';

    // Filter out readonly parameters for PointsEditor nodes
    const readonlyParams = isPointsEditor ? ['points_store', 'coordinates', 'neg_coordinates'] : [];
    const filteredParams = isPointsEditor
      ? params.filter(param => !readonlyParams.includes(param.name))
      : params;

    return (
      <div className="space-y-3">
        <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-2">
          <span>{icon}</span>
          <span>{title} ({filteredParams.length})</span>
        </h4>

        {/* Add PointEditor for PointsEditor nodes at the top */}
        {isPointsEditor && isWidgetValues && setWidgetValue && (
          <PointEditor
            node={selectedNode}
            onWidgetChange={(widgetName: string, value: any) => {
              setWidgetValue(nodeId, widgetName, value);
            }}
            isModified={isWidgetModified('points_store')}
            modifiedHighlightClasses={getModifiedClasses('points_store')}
          />
        )}

        <div className="space-y-3">
          {filteredParams.map((param: IProcessedParameter, index: number) => (
            <div key={`${param.name}-${index}`} className={isWidgetValues ? "group" : ""}>
              {isWidgetValues && selectedNode ? (
                // Check if this widget input is connected
                isInputConnected(param.name) ? (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <div className="font-medium mb-1">{param.name}</div>
                      <div className="flex items-center space-x-1">
                        <span>{t('node.connectedToInput')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                ) : (() => {
                  // Check if this is an IMAGE/VIDEO parameter (for Value area clicks)
                  const parameterType = detectParameterType(param);

                  if (parameterType) {
                    // For IMAGE/VIDEO parameters, use WidgetValueEditor but intercept edit for Value clicks
                    return (
                      <WidgetValueEditor
                        param={param}
                        nodeId={typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id}
                        currentValue={getWidgetValue(
                          typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id,
                          param.name,
                          param.value
                        )}
                        isEditing={editingParam?.nodeId === (typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id) && editingParam?.paramName === param.name}
                        editingValue={editingValue}
                        uploadState={uploadState}
                        isModified={isWidgetModified(param.name)}
                        modifiedHighlightClasses={getModifiedClasses(param.name)}
                        onStartEditing={(nodeId, paramName, value) => {
                          // For IMAGE/VIDEO parameters, open OutputsGallery immediately instead of edit mode
                          setFileSelectionState({
                            isOpen: true,
                            paramName: paramName,
                            paramType: parameterType
                          });
                        }}
                        onCancelEditing={onCancelEditing}
                        onSaveEditing={onSaveEditing}
                        onEditingValueChange={onEditingValueChange}
                        onControlAfterGenerateChange={onControlAfterGenerateChange}
                        onFilePreview={onFilePreview}
                        onFileUpload={onFileUpload}
                        onFileUploadDirect={onFileUploadDirect}
                        // Pass additional ComfyGraphNode context
                        node={selectedNode}
                        widget={selectedNode.getWidgets ? selectedNode.getWidgets()[((param as any).widgetIndex || 0)] : undefined}
                      />
                    );
                  }

                  // Default to WidgetValueEditor for non-IMAGE/VIDEO parameters
                  return (
                    <WidgetValueEditor
                      param={param}
                      nodeId={typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id}
                      currentValue={getWidgetValue(
                        typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id,
                        param.name,
                        param.value
                      )}
                      isEditing={editingParam?.nodeId === (typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id) && editingParam?.paramName === param.name}
                      editingValue={editingValue}
                      uploadState={uploadState}
                      isModified={isWidgetModified(param.name)}
                      modifiedHighlightClasses={getModifiedClasses(param.name)}
                      onStartEditing={(nodeId, paramName, value) => onStartEditing(nodeId, paramName, value, (param as any).widgetIndex)}
                      onCancelEditing={onCancelEditing}
                      onSaveEditing={onSaveEditing}
                      onEditingValueChange={onEditingValueChange}
                      onControlAfterGenerateChange={onControlAfterGenerateChange}
                      onFilePreview={onFilePreview}
                      onFileUpload={onFileUpload}
                      onFileUploadDirect={onFileUploadDirect}
                      // Pass additional ComfyGraphNode context
                      node={selectedNode}
                      widget={selectedNode.getWidgets ? selectedNode.getWidgets()[((param as any).widgetIndex || 0)] : undefined}
                    />
                  );
                })()
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {param.name}
                      </span>
                      {param.required && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                          {t('node.required')}
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {param.type}
                    </Badge>
                  </div>

                  {/* Parameter Value or Link Info */}
                  {param.linkInfo ? (
                    <div className="mb-3">
                      <button
                        onClick={() => {
                          onNavigateToNode(param.linkInfo!.sourceNodeId);
                          // Find and select the source node
                          const sourceNode = nodeBounds.get(param.linkInfo!.sourceNodeId)?.node;
                          if (sourceNode) {
                            setTimeout(() => {
                              onSelectNode(sourceNode);
                            }, 300); // Wait for animation to center the node first
                          }
                        }}
                        className="w-full p-3 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="font-medium text-blue-800 dark:text-blue-200 truncate">
                              {param.linkInfo.sourceNodeTitle || param.linkInfo.sourceNodeType}
                            </span>
                            <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600">
                              #{param.linkInfo.sourceNodeId}
                            </Badge>
                          </div>
                          <ExternalLink className="w-3 h-3 text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <div className="mt-1 text-xs text-blue-600 dark:text-blue-400 text-left">
                          {t('node.output')}: <span className="font-mono bg-blue-200 dark:bg-blue-800/50 px-1.5 py-0.5 rounded">{param.linkInfo.sourceOutputName}</span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="mb-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{t('node.value')}: </span>
                      <code className="text-sm bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded inline-block max-w-[300px] md:max-w-[400px] truncate align-bottom">
                        {param.value !== undefined
                          ? (typeof param.value === 'object'
                            ? JSON.stringify(param.value)
                            : String(param.value))
                          : 'undefined'
                        }
                      </code>
                    </div>
                  )}

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
                          const finalText = optionsText.length > maxTotalLength
                            ? optionsText.substring(0, maxTotalLength) + '...'
                            : optionsText;

                          return finalText;
                        })()}
                      </span>
                      {param.possibleValues.length > 3 && (
                        <span> {t('node.more', { count: param.possibleValues.length - 3 })}</span>
                      )}
                    </div>
                  )}

                  {/* Validation Info */}
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
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Always use ComfyGraphNode data directly
  const videoPreview = extractVideoPreview();
  const imagePreview = extractImagePreview();

  // Extract widgets from ComfyGraphNode
  const widgets = extractComfyGraphWidgets();

  // Helper function to find source node info for a link
  const getSourceNodeInfo = (linkId: number) => {
    // Find the source node and output slot for this link
    // We need to search through all nodes to find which output has this link
    for (const [nodeId, bounds] of nodeBounds) {
      const node = bounds.node;
      if (node.outputs) {
        for (let outputIndex = 0; outputIndex < node.outputs.length; outputIndex++) {
          const output = node.outputs[outputIndex];
          if (output.links && output.links.includes(linkId)) {
            return {
              sourceNodeId: nodeId,
              sourceNodeTitle: node.title || node.type,
              sourceNodeType: node.type,
              sourceOutputName: output.name || `Output ${outputIndex}`,
              sourceOutputIndex: outputIndex
            };
          }
        }
      }
    }
    return null;
  };

  // Render input slots section
  const renderInputSlots = () => {
    if (!selectedNode.inputs || selectedNode.inputs.length === 0) return null;

    // Show inputs based on connection status:
    // - Connected inputs: show all (including widgets)
    // - Disconnected inputs: show only non-widget slots
    const inputSlots = selectedNode.inputs.filter((input: any) => {
      // If connected, always show
      if (input.link) return true;

      // If not connected, only show if it's not a widget parameter
      const widgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
      const hasWidget = widgets.some((widget: any) => widget.name === input.name);

      return !hasWidget;
    });

    if (inputSlots.length === 0) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-2">
          <ArrowDownToLine className="w-4 h-4" />
          <span>{t('node.inputSlots')} ({inputSlots.length})</span>
        </h4>
        <div className="space-y-2">
          {inputSlots.map((input: any, index: number) => {
            const sourceInfo = input.link ? getSourceNodeInfo(input.link) : null;

            return (
              <div key={`input-${index}`}>
                {input.link && sourceInfo ? (
                  // Connected input - use same design as connected widget
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1 font-medium">
                          <span>{input.name || `Input ${index}`}</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                        {onDisconnectInput && (
                          <button
                            onClick={() => {
                              // Find the correct index in selectedNode.inputs by matching the input object or its name
                              const actualInputIndex = selectedNode.inputs?.findIndex(inp =>
                                inp.name === input.name && inp.type === input.type
                              ) ?? -1;
                              if (actualInputIndex >= 0) {
                                onDisconnectInput(nodeId, actualInputIndex);
                              }
                            }}
                            className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors shadow-sm hover:shadow-md"
                            title={t('node.disconnectInput')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            onNavigateToNode(sourceInfo.sourceNodeId);
                            // Find and select the source node
                            const sourceNode = nodeBounds.get(sourceInfo.sourceNodeId)?.node;
                            if (sourceNode) {
                              setTimeout(() => {
                                onSelectNode(sourceNode);
                              }, 300); // Wait for animation to center the node first
                            }
                          }}
                          className="w-full p-3 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:shadow-md transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span className="font-medium text-blue-800 dark:text-blue-200 truncate">
                                {sourceInfo.sourceNodeTitle}
                              </span>
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600">
                                #{sourceInfo.sourceNodeId}
                              </Badge>
                            </div>
                            <ExternalLink className="w-3 h-3 text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                          <div className="mt-1 text-xs text-blue-600 dark:text-blue-400 text-left">
                            {t('node.output')}: <span className="font-mono bg-blue-200 dark:bg-blue-800/50 px-1.5 py-0.5 rounded">{sourceInfo.sourceOutputName}</span>
                          </div>
                        </button>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                          <span>{t('node.type')}:</span>
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                            {input.type || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Disconnected input - simple gray design
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {input.name || `Input ${index}`}
                        </span>
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          Disconnected
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {input.type || t('common.unknown')}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Helper function to find target node info for output links
  const getTargetNodeInfo = (linkId: number) => {
    // Find the target node and input slot for this link
    for (const [nodeId, bounds] of nodeBounds) {
      const node = bounds.node;
      if (node.inputs) {
        for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
          const input = node.inputs[inputIndex];
          if (input.link === linkId) {
            return {
              targetNodeId: nodeId,
              targetNodeTitle: node.title || node.type,
              targetNodeType: node.type,
              targetInputName: input.name || `Input ${inputIndex}`,
              targetInputIndex: inputIndex
            };
          }
        }
      }
    }
    return null;
  };

  // Render output slots section
  const renderOutputSlots = () => {
    if (!selectedNode.outputs || selectedNode.outputs.length === 0) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-2">
          <ArrowUpFromLine className="w-4 h-4" />
          <span>{t('node.outputSlots')} ({selectedNode.outputs.length})</span>
        </h4>
        <div className="space-y-2">
          {selectedNode.outputs.map((output: any, index: number) => {
            const hasConnections = output.links && output.links.length > 0;

            return (
              <div key={`output-${index}`}>
                {hasConnections ? (
                  // Connected output - use green theme
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="text-sm text-green-700 dark:text-green-300">
                      <div className="flex items-center space-x-1 font-medium mb-1">
                        <span>{output.name || `Output ${index}`}</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                      <div className="space-y-2">
                        {output.links.map((linkId: number) => {
                          const targetInfo = getTargetNodeInfo(linkId);
                          return targetInfo ? (
                            <div key={linkId} className="p-3 bg-gradient-to-r from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-800/20 border border-green-200 dark:border-green-700 rounded-lg hover:shadow-md transition-all group">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => {
                                    onNavigateToNode(targetInfo.targetNodeId);
                                    // Find and select the target node
                                    const targetNode = nodeBounds.get(targetInfo.targetNodeId)?.node;
                                    if (targetNode) {
                                      setTimeout(() => {
                                        onSelectNode(targetNode);
                                      }, 300); // Wait for animation to center the node first
                                    }
                                  }}
                                  className="flex-1 text-left cursor-pointer"
                                >
                                  <div className="flex items-center space-x-2 mb-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="font-medium text-green-800 dark:text-green-200 truncate">
                                      {targetInfo.targetNodeTitle}
                                    </span>
                                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-600">
                                      #{targetInfo.targetNodeId}
                                    </Badge>
                                    <ExternalLink className="w-3 h-3 text-green-600 dark:text-green-400 group-hover:translate-x-0.5 transition-transform" />
                                  </div>
                                  <div className="text-xs text-green-600 dark:text-green-400">
                                    Input: <span className="font-mono bg-green-200 dark:bg-green-800/50 px-1.5 py-0.5 rounded">{targetInfo.targetInputName}</span>
                                  </div>
                                </button>
                                {onDisconnectOutput && (
                                  <button
                                    onClick={() => onDisconnectOutput(nodeId, index, linkId)}
                                    className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors ml-2 flex-shrink-0 shadow-sm hover:shadow-md"
                                    title="Disconnect this connection"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div key={linkId} className="p-3 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/40 dark:to-gray-700/20 border border-gray-200 dark:border-gray-700 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                  <span className="text-gray-600 dark:text-gray-400">Unknown target (Link ID: {linkId})</span>
                                </div>
                                {onDisconnectOutput && (
                                  <button
                                    onClick={() => onDisconnectOutput(nodeId, index, linkId)}
                                    className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors ml-2 flex-shrink-0 shadow-sm hover:shadow-md"
                                    title="Disconnect this connection"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1 mt-2">
                          <span>Type:</span>
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                            {output.type || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Disconnected output - simple gray design
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {output.name || `Output ${index}`}
                        </span>
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          Disconnected
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {output.type || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render main content (preview + widgets)
  const renderMainContent = () => (
    <div className="space-y-6">

      {/* Image Preview Section */}
      {imagePreview && (
        <div className="space-y-3">
          <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-2">
            <ImageIcon className="w-4 h-4" />
            <span>Image Preview</span>
          </h4>
          <InlineImagePreview
            imagePreview={imagePreview}
            onClick={() => onFilePreview(imagePreview.filename || imagePreview)}
            isFromExecution={true}
          />
        </div>
      )}

      {/* Video Preview Section */}
      {videoPreview && (
        <VideoPreviewSection
          key={`video-preview-${selectedNode.id}-${(videoPreview as any).filename || 'unknown'}-${(videoPreview as any)._lastUpdated || 0}`}
          videoPreview={videoPreview}
          nodeId={typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id}
          nodeTitle={selectedNode.title || selectedNode.type}
        />
      )}

      {/* ComfyGraphNode Widgets */}
      {widgets.length > 0 && renderParameterSection("Node Widgets", widgets, <SlidersHorizontal className="w-4 h-4" />, true)}

      {/* Fallback to raw widget values if no structured widgets */}
      {widgets.length === 0 && selectedNode.widgets_values && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Raw Widget Values: {Array.isArray(selectedNode.widgets_values) ? selectedNode.widgets_values.length : Object.keys(selectedNode.widgets_values).length}
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <code className="text-xs">
              {JSON.stringify(selectedNode.widgets_values, null, 2)}
            </code>
          </div>
        </div>
      )}

      {/* Single Execute Section */}
      {canSingleExecute && onSingleExecute && (
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-2">
                <Target className="w-4 h-4" />
                <span>Single Node Execution</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isOutputNode
                  ? "Execute only the nodes required to generate this output"
                  : "Execute only the dependencies needed for this node"
                }
              </p>
            </div>

            <Button
              size="sm"
              disabled={isSingleExecuting}
              onClick={() => onSingleExecute(typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-all duration-150 ${isSingleExecuting
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : isOutputNode
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-sm hover:shadow-md active:shadow-sm active:scale-95'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-sm hover:shadow-md active:shadow-sm active:scale-95'
                }`}
            >
              <Play className="w-3 h-3 mr-1.5" />
              {isSingleExecuting ? 'Executing...' : 'Execute This'}
            </Button>
          </div>

          {isOutputNode && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="flex items-start space-x-2">
                <div className="text-emerald-600 dark:text-emerald-400 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  <div className="font-medium mb-1">Output Node Detected</div>
                  <div>This node appears to be an output node. Single execution will automatically trace and execute all upstream dependencies required to generate the final output.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const slides = [
    { id: 0, content: renderInputSlots(), title: "Input Slots", icon: <ArrowDownToLine className="w-4 h-4" /> },
    { id: 1, content: renderMainContent(), title: "Node Controls", icon: <Edit className="w-4 h-4" /> },
    { id: 2, content: renderOutputSlots(), title: "Output Slots", icon: <ArrowUpFromLine className="w-4 h-4" /> }
  ];

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden">
      <div
        className="flex h-full min-h-0 transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="w-full h-full min-h-0 flex-shrink-0 overflow-y-auto p-4 pb-32">
            {slide.content || (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600">
                <div className="text-center space-y-2">
                  {slide.icon}
                  <div className="text-sm">No {slide.title.toLowerCase()}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* IMAGE/VIDEO File Selection Modal Portal */}
      {fileSelectionState.isOpen && fileSelectionState.paramType && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto overscroll-contain">
          <OutputsGallery
            isFileSelectionMode={true}
            allowImages={true} // Always allow images
            allowVideos={fileSelectionState.paramType === 'VIDEO'} // Allow videos if param type is VIDEO
            onFileSelect={handleFileSelect}
            onBackClick={() => setFileSelectionState({ isOpen: false, paramName: null, paramType: null })}
            selectionTitle={`Select ${fileSelectionState.paramType === 'IMAGE' ? 'Image' : 'Image/Video'} for ${fileSelectionState.paramName}`}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
