import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { RefreshCw, X, ExternalLink, Play, Image as ImageIcon, SlidersHorizontal, Edit3, Check } from 'lucide-react';
import { INodeWithMetadata, IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { GroupInspector } from '@/components/canvas/GroupInspector';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

import { toast } from 'sonner';

import { DEFAULT_CANVAS_CONFIG } from '@/config/canvasConfig';

// Components from NodeParameterEditor
import { OutputsGallery } from '@/components/media/OutputsGallery';
import { WidgetValueEditor } from '@/components/controls/WidgetValueEditor';
import { VideoPreviewSection } from '@/components/media/VideoPreviewSection';
import { InlineImagePreview } from '@/components/media/InlineImagePreview';
import { PointEditor } from '@/components/controls/widgets/custom_node_widget/PointEditor';
import { detectParameterTypeForGallery } from '@/shared/utils/GalleryPermissionUtils';

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

interface NodeDetailModalProps {
    selectedNode: ComfyGraphNode;
    nodeMetadata: Map<number, INodeWithMetadata>;
    metadataLoading: boolean;
    metadataError: string | null;
    // Previously isNodePanelVisible, but now this component is conditionally rendered or handles its own open state via mounting
    editingParam: EditingParam | null;
    editingValue: any;
    uploadState: UploadState;
    nodeBounds: Map<number, NodeBounds>;
    getWidgetValue: (nodeId: number, paramName: string, originalValue: any) => any;
    getNodeMode: (nodeId: number, originalMode: number) => number;
    onClose: () => void;
    onStartEditing: (nodeId: number, paramName: string, value: any, widgetIndex?: number) => void;
    onCancelEditing: () => void;
    onSaveEditing: () => void;
    onEditingValueChange: (value: any) => void;
    onControlAfterGenerateChange?: (nodeId: number, value: string) => void;
    onFilePreview: (filename: string) => void;
    onFileUpload: (nodeId: number, paramName: string) => void;
    onFileUploadDirect?: (nodeId: number, paramName: string, file: File) => void;
    onNavigateToNode: (nodeId: number) => void;
    onSelectNode: (node: ComfyGraphNode) => void;
    onNodeModeChange: (nodeId: number, mode: number) => void;
    modifiedWidgetValues: Map<number, Record<string, any>>;
    // Direct widget value setting (for bypassing edit mode)
    setWidgetValue?: (nodeId: number, paramName: string, value: any) => void;
    // Single execute functionality
    isOutputNode?: boolean;
    canSingleExecute?: boolean;
    isSingleExecuting?: boolean;
    onSingleExecute?: (nodeId: number) => void;
    // Node color change functionality
    onNodeColorChange?: (nodeId: number, bgcolor: string) => void;
    // Node deletion functionality
    onNodeDelete?: (nodeId: number) => void;
    // Group deletion functionality
    onGroupDelete?: (groupId: number) => void;
    // Node refresh functionality
    onNodeRefresh?: (nodeId: number) => void;
    // Node title change functionality
    onNodeTitleChange?: (nodeId: number, title: string) => void;
    // Node size change functionality
    onNodeSizeChange?: (nodeId: number, width: number, height: number) => void;
    // Node collapse functionality
    onNodeCollapseChange?: (nodeId: number, collapsed: boolean) => void;
    // Group size change functionality
    onGroupSizeChange?: (groupId: number, width: number, height: number) => void;
    // Link disconnection functionality
    onDisconnectInput?: (nodeId: number, inputSlot: number) => void;
    onDisconnectOutput?: (nodeId: number, outputSlot: number, linkId: number) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
    selectedNode,
    nodeMetadata,
    metadataLoading,
    metadataError,
    editingParam,
    editingValue,
    uploadState,
    nodeBounds,
    getWidgetValue,
    getNodeMode,
    modifiedWidgetValues,
    onClose,
    onStartEditing,
    onCancelEditing,
    onSaveEditing,
    onEditingValueChange,
    onControlAfterGenerateChange,
    onFilePreview,
    onFileUpload,
    onFileUploadDirect,
    onNavigateToNode,
    onSelectNode,
    onNodeModeChange,
    setWidgetValue,
    isOutputNode = false,
    canSingleExecute = false,
    isSingleExecuting = false,
    onSingleExecute,
    onNodeColorChange,
    onNodeDelete,
    onGroupDelete,
    onNodeRefresh,
    onNodeTitleChange,
    onNodeSizeChange,
    onNodeCollapseChange,
    onGroupSizeChange,
    onDisconnectInput,
    onDisconnectOutput,
}) => {
    const { t } = useTranslation();
    const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
    const metadata = nodeMetadata.get(nodeId);

    // Node Color Extraction
    // Node Color Extraction
    // Use the explicit node color if available, otherwise fallback to the canvas config default
    const rawNodeColor = selectedNode.bgcolor || selectedNode.color || (selectedNode.properties?.['Node Color']);
    const nodeColor = rawNodeColor || DEFAULT_CANVAS_CONFIG.defaultNodeColor;
    // We treat it as a custom color if it's explicitly set OR if we are using the default dark mode color 
    // (creating a consistent dark themed modal)
    const hasCustomColor = true; // Always true now as we default to dark grey

    // File selection state (for Image/Video widgets)
    const [fileSelectionState, setFileSelectionState] = useState<{
        isOpen: boolean;
        paramName: string | null;
        paramType: 'IMAGE' | 'VIDEO' | null;
    }>({ isOpen: false, paramName: null, paramType: null });

    // Title editing handlers
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editingTitleValue, setEditingTitleValue] = useState('');

    const handleStartEditingTitle = () => {
        setEditingTitleValue(selectedNode.title || '');
        setIsEditingTitle(true);
    };

    const handleSaveTitleChange = () => {
        if (onNodeTitleChange) {
            onNodeTitleChange(nodeId, editingTitleValue.trim());
        }
        setIsEditingTitle(false);
        setEditingTitleValue('');
    };

    const handleCancelTitleEdit = () => {
        setIsEditingTitle(false);
        setEditingTitleValue('');
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveTitleChange();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelTitleEdit();
        }
    };


    // Group handling
    const isGroupNode = selectedNode.type === 'GROUP_NODE' && 'groupInfo' in selectedNode && selectedNode.groupInfo;

    // NOTE: If GroupInspector needs to be modal-ized, we can wrap it or just use it. 
    // For now, assuming GroupInspector works as a panel/modal itself or we render it same as Inspector did.
    // Since Inspector returned it directly, we will do the same but wrapped in portal if needed.
    // Actually, GroupInspector in original code was just a component. 
    // Let's defer group node handling to stay targeted or just render it. 
    // Given user request "Popup", if GroupInspector is not a popup, it might look weird. 
    // But let's stick to the logic for now.
    if (isGroupNode) {
        // Create a portal for group inspector to ensure it's on top
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden">
                    <GroupInspector
                        selectedNode={selectedNode}
                        isVisible={true}
                        onClose={onClose}
                        onNavigateToNode={onNavigateToNode}
                        onSelectNode={onSelectNode}
                        onNodeModeChange={onNodeModeChange}
                        getNodeMode={getNodeMode}
                        onGroupDelete={onGroupDelete}
                        onGroupSizeChange={onGroupSizeChange}
                    />
                </div>
            </div>,
            document.body
        );
    }

    // --- Logic from NodeParameterEditor ---

    // Helper function for file selection (OutputsGallery)
    const handleFileSelect = (filename: string) => {
        if (fileSelectionState.paramName && setWidgetValue) {
            setWidgetValue(nodeId, fileSelectionState.paramName, filename);
        } else if (fileSelectionState.paramName) {
            const widgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
            const widgetIndex = widgets.findIndex(w => w.name === fileSelectionState.paramName);
            onStartEditing(nodeId, fileSelectionState.paramName, filename, widgetIndex >= 0 ? widgetIndex : undefined);
            setTimeout(() => {
                onEditingValueChange(filename);
                setTimeout(() => { onSaveEditing(); }, 50);
            }, 50);
        }
        setFileSelectionState({ isOpen: false, paramName: null, paramType: null });
    };

    const isWidgetModified = (paramName: string): boolean => {
        const nodeValues = modifiedWidgetValues.get(nodeId);
        return !!(nodeValues && paramName in nodeValues);
    };

    const getModifiedClasses = (paramName: string): string => {
        return isWidgetModified(paramName)
            ? 'bg-[#10b981] dark:bg-[#10b981] border-[#10b981] dark:border-[#10b981] ring-1 ring-[#10b981]/50 dark:ring-[#10b981]/50 text-white dark:text-white'
            : '';
    };

    // Preview extraction
    const extractVideoPreview = () => {
        // Check for VHS/AnimateDiff video previews
        if (selectedNode.getWidgets) {
            const widgets = selectedNode.getWidgets();
            const videoWidget = widgets.find((w: any) => w.type === 'VHS_VideoCombine');
            if (videoWidget && videoWidget.value) return videoWidget.value;
        }

        const videoPreviewVal = getWidgetValue(nodeId, 'videopreview', undefined);
        if (videoPreviewVal) return videoPreviewVal;

        // Check widgets for common video output formats
        if (selectedNode.widgets_values) {
            // Handle raw widget values if needed
            // ...
        }

        return null;
    };

    // We need to re-implement these helpers properly to match the file we read
    const extractImagePreviewFromNode = () => { // Renamed to avoid collision
        const imagePreviewValue = getWidgetValue(nodeId, 'imagepreview', undefined);
        if (imagePreviewValue?.params) return imagePreviewValue.params;

        if (selectedNode.getWidgets) {
            const widgets = selectedNode.getWidgets();
            const imageWidget = widgets.find((w: any) => w.name === 'imagepreview' || w.type === 'imagepreview');
            if (imageWidget?.value?.params) return imageWidget.value.params;
            const previewWidget = widgets.find((w: any) => w.name === 'previewImage');
            if (previewWidget?.value) return previewWidget.value;
        }

        if (!selectedNode?.widgets_values || typeof selectedNode.widgets_values !== 'object') return null;

        if (!Array.isArray(selectedNode.widgets_values)) {
            const widgetsValues = selectedNode.widgets_values as Record<string, any>;
            if (widgetsValues.imagepreview && widgetsValues.imagepreview.params) return widgetsValues.imagepreview.params;
            if (widgetsValues.previewImage) return widgetsValues.previewImage;
        }

        return null;
    };

    const extractComfyGraphWidgets = (): IProcessedParameter[] => {
        // Logic from NodeParameterEditor lines 252-358
        if (selectedNode.getWidgets) {
            const widgets = selectedNode.getWidgets();
            if (widgets && widgets.length > 0) {
                return widgets.map((widget: any, index: number) => {
                    if (widget.name === 'control_after_generate') return null;

                    let hasDualWidget = false;
                    let controlValue = null;
                    if ((widget.name === 'seed' || widget.name === 'noise_seed') && widget.options?.control_after_generate) {
                        hasDualWidget = true;
                        const controlWidget = widgets.find((w: any) => w.name === 'control_after_generate');
                        controlValue = controlWidget?.value || 'fixed';
                    }

                    return {
                        name: widget.name,
                        type: widget.type,
                        value: widget.value,
                        description: widget.options?.tooltip,
                        possibleValues: widget.options?.values,
                        validation: { min: widget.options?.min, max: widget.options?.max, step: widget.options?.step },
                        required: !widget.options?.optional,
                        widgetIndex: index,
                        config: {},
                        controlAfterGenerate: hasDualWidget ? { enabled: true, value: controlValue, options: ['fixed', 'increment', 'decrement', 'randomize'] } : undefined
                    };
                }).filter(Boolean) as IProcessedParameter[];
            }
        }

        // Fallback logic
        let widgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
        if ((!widgets || widgets.length === 0) && selectedNode.widgets_values) {
            if (selectedNode.initializeWidgets) {
                let nMetadata = (selectedNode as any).nodeMetadata;
                if (!nMetadata) {
                    if (metadata) nMetadata = metadata;
                }
                selectedNode.initializeWidgets(selectedNode.widgets_values, nMetadata);
                const newWidgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
                if (newWidgets && newWidgets.length > 0) {
                    return newWidgets.map((widget: any, index: number) => {
                        if (widget.name === 'control_after_generate') return null;
                        return {
                            name: widget.name,
                            type: widget.type,
                            value: widget.value,
                            description: widget.options?.tooltip,
                            possibleValues: widget.options?.values,
                            validation: { min: widget.options?.min, max: widget.options?.max, step: widget.options?.step },
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

    const isInputConnected = (inputName: string): boolean => {
        if (!selectedNode.inputs) return false;
        const input = selectedNode.inputs.find((i: any) => i.name === inputName);
        return input?.link !== null && input?.link !== undefined;
    };

    const widgets = extractComfyGraphWidgets();
    const imagePreview = extractImagePreviewFromNode();
    // Video preview was mostly stubbed in original code, skipping for brevity unless needed.
    const videoPreview = extractVideoPreview();

    const detectParameterType = (param: IProcessedParameter): 'IMAGE' | 'VIDEO' | null => {
        const currentValue = getWidgetValue(nodeId, param.name, param.value);
        const possibleValues = param.possibleValues || [];
        return detectParameterTypeForGallery(param.name, currentValue, possibleValues);
    };

    const renderSectionHeader = (title: string, count?: number, icon?: React.ReactNode) => (
        <div className={`flex items-center space-x-2 mb-4 mt-8 pb-2 border-b ${hasCustomColor ? 'border-white/10' : 'border-slate-100 dark:border-slate-800'}`}>
            {icon && <span className={`${hasCustomColor ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{icon}</span>}
            <h3 className={`text-xs font-bold uppercase tracking-widest ${hasCustomColor ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                {title}
                {count !== undefined && <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${hasCustomColor ? 'bg-black/20 text-white/80' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{count}</span>}
            </h3>
        </div>
    );

    const renderParameterSection = (title: string, params: IProcessedParameter[], icon?: React.ReactNode, isWidgetValues: boolean = false) => {
        if (!params || params.length === 0) return null;
        const isPointsEditor = selectedNode.type === 'PointsEditor';
        const readonlyParams = isPointsEditor ? ['points_store', 'coordinates', 'neg_coordinates'] : [];
        const filteredParams = isPointsEditor ? params.filter(param => !readonlyParams.includes(param.name)) : params;

        return (
            <div className="space-y-4">
                {/* Title is optional for widgets if it's the main section */}
                {title !== "Node Widgets" && renderSectionHeader(title, filteredParams.length, icon)}

                {isPointsEditor && isWidgetValues && setWidgetValue && (
                    <div className="mb-4">
                        <PointEditor
                            node={selectedNode}
                            onWidgetChange={(widgetName, value) => setWidgetValue(nodeId, widgetName, value)}
                            isModified={isWidgetModified('points_store')}
                            modifiedHighlightClasses={getModifiedClasses('points_store')}
                        />
                    </div>
                )}

                <div className="grid grid-cols-1 gap-5">
                    {filteredParams.map((param, index) => (
                        <div key={`${param.name}-${index}`} className="group relative">
                            {isWidgetValues && selectedNode ? (
                                isInputConnected(param.name) ? (
                                    <div className={`flex items-center justify-between p-3 rounded-lg border ${hasCustomColor ? 'bg-black/10 border-white/10 text-white' : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900'}`}>
                                        <div className="flex items-center space-x-2">
                                            <span className={`text-sm font-medium ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{param.name}</span>
                                        </div>
                                        <div className={`flex items-center space-x-2 text-xs ${hasCustomColor ? 'text-white/70' : 'text-blue-600 dark:text-blue-400'}`}>
                                            <ExternalLink className="w-3 h-3" />
                                            <span>Connected</span>
                                        </div>
                                    </div>
                                ) : (
                                    (() => {
                                        const parameterType = detectParameterType(param);
                                        const Wrapper = ({ children }: { children: React.ReactNode }) => (
                                            <div className="space-y-1.5">
                                                {children}
                                            </div>
                                        );

                                        if (parameterType) {
                                            return (
                                                <Wrapper>
                                                    <WidgetValueEditor
                                                        param={param}
                                                        nodeId={nodeId}
                                                        currentValue={getWidgetValue(nodeId, param.name, param.value)}
                                                        isEditing={editingParam?.nodeId === nodeId && editingParam?.paramName === param.name}
                                                        editingValue={editingValue}
                                                        uploadState={uploadState}
                                                        isModified={isWidgetModified(param.name)}
                                                        modifiedHighlightClasses={getModifiedClasses(param.name)}
                                                        onStartEditing={(nid, pname, val) => {
                                                            setFileSelectionState({ isOpen: true, paramName: pname, paramType: parameterType });
                                                        }}
                                                        onCancelEditing={onCancelEditing}
                                                        onSaveEditing={onSaveEditing}
                                                        onEditingValueChange={onEditingValueChange}
                                                        onControlAfterGenerateChange={onControlAfterGenerateChange}
                                                        onFilePreview={onFilePreview}
                                                        onFileUpload={onFileUpload}
                                                        onFileUploadDirect={onFileUploadDirect}
                                                        node={selectedNode}
                                                        widget={selectedNode.getWidgets ? selectedNode.getWidgets()[((param as any).widgetIndex || 0)] : undefined}
                                                        themeOverride={hasCustomColor ? {
                                                            container: 'bg-black/10 border border-white/5 shadow-none',
                                                            label: 'text-white/95',
                                                            secondaryText: 'text-white/60',
                                                            text: 'text-white/90',
                                                            border: 'border-white/10',
                                                        } : undefined}
                                                    />
                                                </Wrapper>
                                            );
                                        }
                                        // Default WidgetValueEditor
                                        return (
                                            <Wrapper>
                                                <WidgetValueEditor
                                                    param={param}
                                                    nodeId={nodeId}
                                                    currentValue={getWidgetValue(nodeId, param.name, param.value)}
                                                    isEditing={editingParam?.nodeId === nodeId && editingParam?.paramName === param.name}
                                                    editingValue={editingValue}
                                                    uploadState={uploadState}
                                                    isModified={isWidgetModified(param.name)}
                                                    modifiedHighlightClasses={getModifiedClasses(param.name)}
                                                    onStartEditing={(nid, pname, val) => onStartEditing(nid, pname, val, (param as any).widgetIndex)}
                                                    onCancelEditing={onCancelEditing}
                                                    onSaveEditing={onSaveEditing}
                                                    onEditingValueChange={onEditingValueChange}
                                                    onControlAfterGenerateChange={onControlAfterGenerateChange}
                                                    onFilePreview={onFilePreview}
                                                    onFileUpload={onFileUpload}
                                                    onFileUploadDirect={onFileUploadDirect}
                                                    node={selectedNode}
                                                    widget={selectedNode.getWidgets ? selectedNode.getWidgets()[((param as any).widgetIndex || 0)] : undefined}
                                                    themeOverride={hasCustomColor ? {
                                                        container: 'bg-black/10 border border-white/5 shadow-none',
                                                        label: 'text-white/95',
                                                        secondaryText: 'text-white/60',
                                                        text: 'text-white/90',
                                                        border: 'border-white/10',
                                                    } : undefined}
                                                />
                                            </Wrapper>
                                        );
                                    })()
                                )
                            ) : (
                                // Read-only
                                <div className={`flex justify-between items-center p-3 rounded-lg ${hasCustomColor ? 'bg-black/10 text-white' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                                    <span className={`text-sm font-medium ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{param.name}</span>
                                    <span className={`text-sm ${hasCustomColor ? 'text-white/70' : 'text-slate-500'}`}>{String(param.value)}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const getSourceNodeInfo = (linkId: number) => {
        for (const [nid, bounds] of nodeBounds) {
            const node = bounds.node;
            if (node.outputs) {
                for (let i = 0; i < node.outputs.length; i++) {
                    if (node.outputs[i].links?.includes(linkId)) {
                        return {
                            sourceNodeId: nid,
                            sourceNodeTitle: node.title || node.type,
                            sourceNodeType: node.type,
                            sourceOutputName: node.outputs[i].name || `Output ${i}`,
                            sourceOutputIndex: i
                        };
                    }
                }
            }
        }
        return null;
    };

    const getTargetNodeInfo = (linkId: number) => {
        for (const [nid, bounds] of nodeBounds) {
            const node = bounds.node;
            if (node.inputs) {
                for (let i = 0; i < node.inputs.length; i++) {
                    if (node.inputs[i].link === linkId) {
                        return {
                            targetNodeId: nid,
                            targetNodeTitle: node.title || node.type,
                            targetNodeType: node.type,
                            targetInputName: node.inputs[i].name || `Input ${i}`,
                            targetInputIndex: i
                        };
                    }
                }
            }
        }
        return null;
    };

    /**
     * Get color for a specific slot type
     */
    const getSlotColor = (type: string | undefined): string => {
        if (!type) return '#10b981'; // Default Green for unknown/untyped

        // Normalize type
        const normalizedType = type.toUpperCase();

        // Color mapping for common ComfyUI types
        // Using vibrant, distinct colors that work well on dark backgrounds
        const colorMap: Record<string, string> = {
            'IMAGE': '#64B5F6',        // Blue
            'LATENT': '#E040FB',       // Purple
            'MODEL': '#7986CB',        // Indigo
            'CLIP': '#FFD54F',         // Amber/Yellow
            'VAE': '#FF5252',          // Red
            'CONDITIONING': '#FFB74D', // Orange
            'MASK': '#81C784',         // Green
            'FLOAT': '#4DB6AC',        // Teal
            'INT': '#4DB6AC',          // Teal
            'NUMBER': '#4DB6AC',       // Teal
            'STRING': '#A1887F',       // Brown
            'BOOLEAN': '#90A4AE',      // Blue Grey
            'CONTROL_NET': '#009688',  // Teal Dark
            'STYLE_MODEL': '#AFB42B',  // Lime
            'CLIP_VISION': '#795548',  // Brown Dark
            'CLIP_VISION_OUTPUT': '#795548',  // Brown Dark
        };

        return colorMap[normalizedType] || '#10b981'; // Default to green if not found
    };

    const renderInputSlots = () => {
        if (!selectedNode.inputs || selectedNode.inputs.length === 0) return null;
        const inputSlots = selectedNode.inputs.filter((input: any) => {
            if (input.link) return true;
            const nodeWidgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
            const hasWidget = nodeWidgets.some((w: any) => w.name === input.name);
            return !hasWidget;
        });
        if (inputSlots.length === 0) return null;

        return (
            <div>
                {renderSectionHeader(t('node.inputSlots'), inputSlots.length)}
                <div className="space-y-2">
                    {inputSlots.map((input: any, index: number) => {
                        const sourceInfo = input.link ? getSourceNodeInfo(input.link) : null;
                        return (
                            <div key={`input-${index}`} className="group">
                                {input.link && sourceInfo ? (
                                    <div className={`flex items-center justify-between p-3 rounded-lg border shadow-sm transition-all ${hasCustomColor ? 'bg-black/10 border-white/5 hover:border-white/30' : 'bg-white border-slate-200 hover:border-blue-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-blue-700'}`}>
                                        <div className="flex items-center min-w-0 mr-3">
                                            {/* Dot */}
                                            <div className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 shadow-sm" style={{ backgroundColor: getSlotColor(input.type) }} />
                                            <div className="flex flex-col min-w-0">
                                                <span className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${hasCustomColor ? 'text-white/50' : 'text-slate-500'}`}>{input.name}</span>
                                                <div className="flex items-center space-x-1.5 cursor-pointer"
                                                    onClick={() => {
                                                        onNavigateToNode(sourceInfo.sourceNodeId);
                                                        const sourceNode = nodeBounds.get(sourceInfo.sourceNodeId)?.node;
                                                        if (sourceNode) setTimeout(() => onSelectNode(sourceNode), 300);
                                                    }}>
                                                    <span className={`text-sm font-medium truncate hover:underline ${hasCustomColor ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        {sourceInfo.sourceNodeTitle}
                                                    </span>
                                                    <ExternalLink className={`w-3 h-3 ${hasCustomColor ? 'text-white/40' : 'text-slate-400'}`} />
                                                </div>
                                            </div>
                                        </div>

                                        {onDisconnectInput && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const actualIndex = selectedNode.inputs?.findIndex(i => i.name === input.name && i.type === input.type) ?? -1;
                                                    if (actualIndex >= 0) onDisconnectInput(nodeId, actualIndex);
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`flex items-center justify-between p-2.5 rounded-lg border ${hasCustomColor ? 'bg-black/5 border-white/5' : 'bg-slate-50/50 border-slate-100 dark:bg-slate-800/30 dark:border-slate-800'}`}>
                                        <div className="flex items-center space-x-3">
                                            <div className="w-2 h-2 rounded-full ring-2 ring-opacity-50" style={{ backgroundColor: 'transparent', borderColor: getSlotColor(input.type) }} />
                                            <span className={`text-sm font-medium ${hasCustomColor ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>{input.name}</span>
                                        </div>
                                        <Badge variant="secondary" className={`text-[10px] font-normal ${hasCustomColor ? 'bg-black/20 text-white/50' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
                                            {input.type}
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderOutputSlots = () => {
        if (!selectedNode.outputs || selectedNode.outputs.length === 0) return null;
        return (
            <div>
                {renderSectionHeader(t('node.outputSlots'), selectedNode.outputs.length)}
                <div className="space-y-3">
                    {selectedNode.outputs.map((output: any, index: number) => {
                        const hasConnections = output.links && output.links.length > 0;
                        return (
                            <div key={`output-${index}`} className="flex flex-col space-y-2">
                                {/* Output Header / Label */}
                                <div className="flex items-center px-1">
                                    <div className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 shadow-sm" style={{ backgroundColor: getSlotColor(output.type) }} />
                                    <span className={`text-sm font-semibold ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{output.name}</span>
                                    <span className={`ml-auto text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${hasCustomColor ? 'bg-black/20 text-white/50' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>{output.type}</span>
                                </div>

                                {/* Connections List */}
                                {hasConnections ? (
                                    <div className={`ml-3 pl-3 border-l-2 space-y-2 ${hasCustomColor ? 'border-white/10' : 'border-slate-100 dark:border-slate-800'}`}>
                                        {output.links.map((linkId: number) => {
                                            const targetInfo = getTargetNodeInfo(linkId);
                                            return targetInfo ? (
                                                <div key={linkId} className={`flex items-center justify-between p-2.5 rounded-lg border shadow-sm transition-all ${hasCustomColor ? 'bg-black/10 border-white/5 hover:border-white/30' : 'bg-white border-slate-200 hover:border-green-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-green-700'}`}>
                                                    <div className="flex items-center space-x-2 cursor-pointer overflow-hidden flex-1"
                                                        onClick={() => {
                                                            onNavigateToNode(targetInfo.targetNodeId);
                                                            const targetNode = nodeBounds.get(targetInfo.targetNodeId)?.node;
                                                            if (targetNode) setTimeout(() => onSelectNode(targetNode), 300);
                                                        }}
                                                    >
                                                        <ExternalLink className="w-3 h-3 text-green-500 flex-shrink-0" />
                                                        <span className={`text-sm font-medium truncate hover:underline ${hasCustomColor ? 'text-white' : 'text-slate-900 dark:text-slate-200'}`}>
                                                            {targetInfo.targetNodeTitle}
                                                        </span>
                                                        <span className={`hidden sm:inline-block text-xs truncate ${hasCustomColor ? 'text-white/50' : 'text-slate-400'}`}>({targetInfo.targetInputName})</span>
                                                    </div>

                                                    {onDisconnectOutput && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDisconnectOutput(nodeId, index, linkId);
                                                            }}
                                                            className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : null;
                                        })}
                                    </div>
                                ) : (
                                    <div className="ml-4 pl-3">
                                        <p className="text-xs text-slate-400 italic">No connections</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderSingleExecute = () => {
        if (!canSingleExecute || !onSingleExecute) return null;
        return (
            <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Single Execution</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Process only this node.</p>
                    </div>
                </div>
                <Button
                    size="lg"
                    disabled={isSingleExecuting}
                    onClick={() => onSingleExecute(nodeId)}
                    className={`
                        w-full
                        ${isSingleExecuting ? 'opacity-70 cursor-not-allowed' : ''}
                        ${isOutputNode
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50 dark:shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/50 dark:shadow-none'}
                        shadow-lg transition-all h-12 rounded-xl font-semibold text-sm
                    `}
                >
                    {isSingleExecuting ? (
                        <span className="flex items-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing...</span>
                    ) : (
                        <span className="flex items-center"><Play className="w-4 h-4 mr-2 fill-current" /> Execute Node</span>
                    )}
                </Button>
            </div>
        );
    };

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'none' }}>
                {/* Minimalist Backdrop - using pointer-events-auto to capture clicks */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md pointer-events-auto"
                    onClick={onClose}
                />

                {/* Enterprise Card Container - pointer-events-auto */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 15 }}
                    transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                    style={{ backgroundColor: nodeColor || undefined }}
                    className={`relative w-[80vw] bg-white dark:bg-slate-950 rounded-3xl shadow-2xl ring-1 ring-slate-900/5 dark:ring-slate-100/10 overflow-hidden flex flex-col h-[75vh] pointer-events-auto ${hasCustomColor ? 'text-white' : ''}`}
                >
                    {/* Minimalist Floating Close Button */}
                    <div className="absolute top-5 right-5 z-20">
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-full transition-all ${hasCustomColor ? 'bg-black/20 text-white hover:bg-black/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Single Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8 custom-scrollbar">
                        {/* Node Identity Header (Inside Body) */}
                        <div className={`mb-8 -mx-6 -mt-6 px-8 py-8 ${hasCustomColor ? 'bg-black/20' : 'bg-transparent'}`}>
                            <div className="mb-2 pt-2">
                                <div className="flex items-center space-x-2 mb-3">
                                    <Badge variant="secondary" className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${hasCustomColor ? 'bg-black/20 text-white/80' : 'text-slate-500 bg-slate-100 dark:bg-slate-900'}`}>
                                        ID: {nodeId}
                                    </Badge>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${hasCustomColor ? 'text-white/60' : 'text-slate-400'}`}>
                                        {selectedNode.type}
                                    </span>
                                </div>

                                {isEditingTitle ? (
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={editingTitleValue}
                                            onChange={(e) => setEditingTitleValue(e.target.value)}
                                            onKeyDown={handleTitleKeyDown}
                                            className={`flex-1 text-2xl sm:text-3xl font-extrabold bg-transparent border-b-2 focus:outline-none ${hasCustomColor ? 'text-white border-white/50' : 'text-slate-900 dark:text-white border-primary'}`}
                                            autoFocus
                                        />
                                        <Button variant="ghost" size="icon" onClick={handleSaveTitleChange} className={`h-8 w-8 ${hasCustomColor ? 'text-white/80 hover:bg-white/10' : 'text-green-500'}`}>
                                            <Check className="w-5 h-5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={handleCancelTitleEdit} className={`h-8 w-8 ${hasCustomColor ? 'text-white/80 hover:bg-white/10' : 'text-red-500'}`}>
                                            <X className="w-5 h-5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center group/title cursor-pointer" onClick={handleStartEditingTitle}>
                                        <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mr-2 ${hasCustomColor ? 'text-white/95' : 'text-slate-900 dark:text-white'}`}>
                                            {metadata?.displayName || selectedNode.title || selectedNode.type}
                                        </h2>
                                        <Edit3 className={`w-5 h-5 opacity-0 group-hover/title:opacity-100 transition-opacity ${hasCustomColor ? 'text-white/70' : 'text-slate-400'}`} />
                                    </div>
                                )}
                                {metadata?.category && (
                                    <p className={`mt-2 inline-flex items-center text-xs font-medium px-2 py-1 rounded-md border ${hasCustomColor ? 'text-white/80 bg-black/20 border-white/10' : 'text-slate-500 bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'}`}>
                                        {metadata.category}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Image Preview */}
                        {imagePreview && (
                            <div className={`mb-8 rounded-2xl overflow-hidden shadow-sm border ${hasCustomColor ? 'bg-black/10 border-white/10' : 'bg-white border-slate-200 dark:border-slate-800'}`}>
                                <InlineImagePreview
                                    imagePreview={imagePreview}
                                    onClick={() => onFilePreview(imagePreview.filename || imagePreview)}
                                    isFromExecution={true}
                                    themeOverride={hasCustomColor ? {
                                        container: 'bg-transparent shadow-none',
                                        text: 'text-white/80',
                                        secondaryText: 'text-white/60'
                                    } : undefined}
                                />
                            </div>
                        )}

                        {/* Video Preview */}
                        {videoPreview && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                {(Array.isArray(videoPreview) ? videoPreview : [videoPreview]).map((vp: any, idx: number) => (
                                    <div key={idx} className={`rounded-2xl overflow-hidden shadow-sm border ${hasCustomColor ? 'bg-black/10 border-white/10' : 'bg-white border-slate-200 dark:border-slate-800'}`}>
                                        <VideoPreviewSection
                                            videoPreview={vp}
                                            nodeId={nodeId}
                                            nodeTitle={metadata?.displayName || selectedNode.title}
                                            themeOverride={hasCustomColor ? {
                                                container: 'bg-black/10 border-white/10',
                                                text: 'text-white/80',
                                                secondaryText: 'text-white/60',
                                                border: 'border-white/10'
                                            } : undefined}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Main Stack */}
                        <div className="space-y-8">
                            {/* Widgets / Controls */}
                            {widgets.length > 0 ? (
                                renderParameterSection("Parameters", widgets, <SlidersHorizontal className="w-4 h-4" />, true)
                            ) : (
                                selectedNode.widgets_values && (
                                    <div className={`p-4 rounded-xl border ${hasCustomColor ? 'bg-black/10 border-white/10' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${hasCustomColor ? 'text-white/50' : 'text-slate-400'}`}>Raw Widget Values</p>
                                        <code className={`text-xs break-all font-mono leading-relaxed ${hasCustomColor ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>
                                            {JSON.stringify(selectedNode.widgets_values)}
                                        </code>

                                        {/* Refresh Button for Raw Values Mode */}
                                        {onNodeRefresh && (
                                            <div className={`mt-4 pt-4 border-t ${hasCustomColor ? 'border-white/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => onNodeRefresh(nodeId)}
                                                    className={`w-full text-xs h-9 ${hasCustomColor ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400'}`}
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                                    Refresh Node
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )
                            )}

                            {/* Inputs & Outputs (Now stacked below) */}
                            {(selectedNode.inputs?.length > 0 || selectedNode.outputs?.length > 0) && (
                                <div className="pt-2">
                                    {renderInputSlots()}
                                    <div className="h-8"></div> {/* Spacer */}
                                    {renderOutputSlots()}
                                </div>
                            )}

                            {/* Single Execute Footer */}
                            {renderSingleExecute()}
                        </div>
                    </div>
                </motion.div>

                {/* File Gallery Portal */}
                {fileSelectionState.isOpen && fileSelectionState.paramType && createPortal(
                    <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto">
                        <OutputsGallery
                            isFileSelectionMode={true}
                            allowImages={true}
                            allowVideos={fileSelectionState.paramType === 'VIDEO'}
                            onFileSelect={handleFileSelect}
                            onBackClick={() => setFileSelectionState({ isOpen: false, paramName: null, paramType: null })}
                            selectionTitle={`Select ${fileSelectionState.paramType === 'IMAGE' ? 'Image' : 'Image/Video'} for ${fileSelectionState.paramName}`}
                        />
                    </div>,
                    document.body
                )}
            </div>
        </AnimatePresence>,
        document.body
    );
};
