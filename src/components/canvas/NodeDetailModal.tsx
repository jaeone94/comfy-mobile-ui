import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
    RefreshCw, X, ExternalLink, Play, Image as ImageIcon, SlidersHorizontal, Edit3, Check,
    Copy, Minimize2, Maximize2, Palette, VolumeX, Shuffle, MousePointer2, Trash2
} from 'lucide-react';
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
    // Node copy functionality
    onCopyNode?: (nodeId: number) => void;
    // Node deletion functionality
    onNodeDelete?: (nodeId: number) => void;
    // Group deletion functionality
    onGroupDelete?: (groupId: number) => void;
    // Node refresh functionality
    onNodeRefresh?: (nodeId: number) => void;
    // Auto-refresh functionality for stale nodes
    onAutoRefreshNode?: (nodeId: number) => void;
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
    // Subgraph functionality
    onEnterSubgraph?: (nodeType: string, title: string) => void;
    subgraphDefinition?: any;
    onNodeModeChangeBatch?: (modifications: { nodeId: number, mode: number }[]) => void;
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
    onCopyNode,
    onNodeDelete,
    onGroupDelete,
    onNodeRefresh,
    onAutoRefreshNode,
    onNodeTitleChange,
    onNodeSizeChange,
    onNodeCollapseChange,
    onGroupSizeChange,
    onDisconnectInput,
    onDisconnectOutput,
    onEnterSubgraph,
    subgraphDefinition,
    onNodeModeChangeBatch
}) => {
    const { t } = useTranslation();
    const nodeId = typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id;
    const metadata = nodeMetadata.get(nodeId);

    const hasCustomColor = true; // Always true now as we default to dark grey

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showModePicker, setShowModePicker] = useState(false);

    const isCollapsed = (selectedNode as any)?.flags?.collapsed;
    const currentMode = (selectedNode as any)?.mode || 0;

    // Mode-based style overrides
    const isMuted = currentMode === 2;
    const isBypassed = currentMode === 4;
    const isAlways = currentMode === 0;

    const baseColor = (selectedNode.bgcolor || selectedNode.color || (selectedNode.properties?.['Node Color'])) || '#374151';
    const effectiveBgColor = isMuted ? '#3b82f6' : (isBypassed ? '#9333ea' : baseColor);
    const effectiveOpacity = (isMuted || isBypassed) ? 0.5 : 1;

    const NODE_COLORS = [
        { name: 'Brown', key: 'circularMenu.colors.brown', value: '#593930' },
        { name: 'Teal', key: 'circularMenu.colors.teal', value: '#3f5159' },
        { name: 'Blue', key: 'circularMenu.colors.blue', value: '#29699c' },
        { name: 'Purple', key: 'circularMenu.colors.purple', value: '#335' },
        { name: 'Green', key: 'circularMenu.colors.green', value: '#353' },
        { name: 'Red', key: 'circularMenu.colors.red', value: '#653' },
        { name: 'Blue Gray', key: 'circularMenu.colors.blueGray', value: '#364254' },
        { name: 'Black', key: 'circularMenu.colors.black', value: '#000' },
        { name: 'Slate', key: 'circularMenu.colors.slate', value: '#475569' },
        { name: 'Default', key: 'circularMenu.colors.default', value: '' }
    ];

    // File selection state (for Image/Video widgets)
    const [fileSelectionState, setFileSelectionState] = useState<{
        isOpen: boolean;
        paramName: string | null;
        paramType: 'IMAGE' | 'VIDEO' | null;
    }>({ isOpen: false, paramName: null, paramType: null });

    // Title editing handlers
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editingTitleValue, setEditingTitleValue] = useState('');

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isHeaderCompact, setIsHeaderCompact] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Initial title text
    const titleText = subgraphDefinition?.name || metadata?.displayName || selectedNode.title || selectedNode.type;

    // Fixed base font size based on title length
    const baseTitleSize = useMemo(() => {
        const len = titleText?.length || 0;
        if (len < 15) return '1.875rem'; // 30px
        if (len < 25) return '1.5rem';    // 24px
        return '1.25rem';                // 20px
    }, [titleText]);

    // Use IntersectionObserver to toggle compact mode
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                const isCompact = !entry.isIntersecting;
                setIsHeaderCompact(isCompact);

                // Auto-close edit mode if scrolling down
                if (isCompact && isEditingTitle) {
                    setIsEditingTitle(false);
                    setEditingTitleValue('');
                }
            },
            {
                root: scrollContainerRef.current,
                threshold: 0,
                // Removed negative rootMargin to fix the "requires overscroll to expand" issue.
                // Now the sentinel's physical position determines the trigger point.
                rootMargin: '0px'
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [isEditingTitle]);

    // Reset scroll state when node changes
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
            setIsHeaderCompact(false);
        }
    }, [nodeId, metadata]);

    // Auto-refresh logic for stale nodes (where widgets are missing but widget_values exist)
    const hasAutoRefreshedRef = React.useRef<string | null>(null);


    const handleStartEditingTitle = () => {
        // Use ref for check effectively
        if (subgraphDefinition || isHeaderCompact) return;
        setEditingTitleValue(titleText || '');
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

    // NOTE: GroupInspector handling
    if (isGroupNode) {
        return (
            <>
                {/* Hidden container to satisfy useScroll hook requirements when in group mode */}
                <div ref={scrollContainerRef} style={{ display: 'none' }} />
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
                    onNodeModeChangeBatch={onNodeModeChangeBatch}
                />
            </>
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


    // Optimize: Calculate widgets first so helpers can reuse it
    const widgets = useMemo(() => {
        // Logic from NodeParameterEditor lines 252-358
        if (selectedNode.getWidgets) {
            const nodeWidgets = selectedNode.getWidgets();

            if (nodeWidgets && nodeWidgets.length > 0) {
                return nodeWidgets.map((widget: any, index: number) => {
                    let hasDualWidget = false;
                    let controlValue = null;
                    if ((widget.name === 'seed' || widget.name === 'noise_seed') && widget.options?.control_after_generate) {
                        hasDualWidget = true;
                        const controlWidget = nodeWidgets.find((w: any) => w.name === 'control_after_generate');
                        controlValue = controlWidget?.value || 'fixed';
                    }

                    if (widget.name === 'control_after_generate') return null;

                    const processed = {
                        name: widget.name,
                        type: widget.type,
                        value: widget.value,
                        description: widget.options?.tooltip,
                        possibleValues: widget.options?.values,
                        validation: { min: widget.options?.min, max: widget.options?.max, step: widget.options?.step },
                        required: !widget.options?.optional,
                        widgetIndex: index,
                        config: {},
                        controlAfterGenerate: hasDualWidget ? { enabled: true, value: controlValue, options: ['fixed', 'increment', 'decrement', 'randomize'] } : undefined,
                        label: widget.options?.label
                    };
                    return processed;
                }).filter(Boolean) as IProcessedParameter[];
            }
        }

        // Fallback logic
        let nodeWidgets = selectedNode.getWidgets ? selectedNode.getWidgets() : [];
        if ((!nodeWidgets || nodeWidgets.length === 0) && (selectedNode as any).widgets_values) {
            if (selectedNode.initializeWidgets) {
                let nMetadata = (selectedNode as any).nodeMetadata;
                if (!nMetadata) {
                    if (metadata) nMetadata = metadata;
                }
                selectedNode.initializeWidgets((selectedNode as any).widgets_values, nMetadata);
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
                            config: {},
                            label: widget.options?.label
                        };
                    }).filter(Boolean) as IProcessedParameter[];
                }
            }
        }

        return [];
    }, [selectedNode, metadata]);

    // Preview extraction
    const extractVideoPreview = () => {
        // Check for VHS/AnimateDiff video previews
        const videoWidget = widgets.find((w: any) => w.type === 'VHS_VideoCombine');
        if (videoWidget && videoWidget.value) return videoWidget.value;

        const videoPreviewVal = getWidgetValue(nodeId, 'videopreview', undefined);
        if (videoPreviewVal) return videoPreviewVal;

        // Check widgets for common video output formats
        // (Previously empty block removed or simplified)

        return null;
    };

    // We need to re-implement these helpers properly to match the file we read
    const extractImagePreviewFromNode = () => { // Renamed to avoid collision
        const imagePreviewValue = getWidgetValue(nodeId, 'imagepreview', undefined);
        if (imagePreviewValue?.params) return imagePreviewValue.params;

        const imageWidget = widgets.find((w: any) => w.name === 'imagepreview' || w.type === 'imagepreview');
        if (imageWidget?.value?.params) return imageWidget.value.params;
        const previewWidget = widgets.find((w: any) => w.name === 'previewImage');
        if (previewWidget?.value) return previewWidget.value;

        if (!selectedNode?.widgets_values || typeof selectedNode.widgets_values !== 'object') return null;

        if (!Array.isArray(selectedNode.widgets_values)) {
            const widgetsValues = selectedNode.widgets_values as Record<string, any>;
            if (widgetsValues.imagepreview && widgetsValues.imagepreview.params) return widgetsValues.imagepreview.params;
            if (widgetsValues.previewImage) return widgetsValues.previewImage;
        }

        return null;
    };


    const isInputConnected = (inputName: string): boolean => {
        if (!selectedNode.inputs) return false;
        const input = selectedNode.inputs.find((i: any) => i.name === inputName);
        return input?.link !== null && input?.link !== undefined;
    };

    const getSlotLabel = (slot: any): string => {
        if (slot.localized_name) return slot.localized_name;
        if (slot.label) return slot.label;
        if (slot.name) return slot.name;
        return slot.type || 'Unknown';
    };

    // widgets calculation moved to useMemo above

    useEffect(() => {
        // Reset the auto-refresh tracking when selectedNode changes
        if (selectedNode?.id && hasAutoRefreshedRef.current !== String(selectedNode.id)) {
            hasAutoRefreshedRef.current = null;
        }

        // Trigger auto-refresh if condition is met and we haven't done it for this node yet
        if (selectedNode && widgets.length === 0 && (selectedNode.widgets_values || (selectedNode as any)._widgets_values) && onAutoRefreshNode) {
            const nodeIdStr = String(selectedNode.id);
            if (hasAutoRefreshedRef.current !== nodeIdStr) {
                console.log('[NodeDetailModal] Converting Raw Widget Values -> Auto-refreshing node:', selectedNode.id);
                onAutoRefreshNode(typeof selectedNode.id === 'string' ? parseInt(selectedNode.id) : selectedNode.id);
                hasAutoRefreshedRef.current = nodeIdStr;
            }
        }
    }, [selectedNode, widgets, onAutoRefreshNode]);
    const imagePreview = useMemo(() => extractImagePreviewFromNode(), [selectedNode, widgets, nodeId]); // Depend on widgets
    // Video preview was mostly stubbed in original code, skipping for brevity unless needed.
    const videoPreview = useMemo(() => extractVideoPreview(), [selectedNode, widgets, nodeId]);

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

                <div className="grid grid-cols-1 gap-4">
                    {filteredParams.map((param, index) => (
                        <div key={`${param.name}-${index}`} className="group relative">
                            {isWidgetValues && selectedNode ? (
                                isInputConnected(param.name) ? (
                                    <div className={`flex items-center justify-between p-3 rounded-lg border ${hasCustomColor ? 'bg-black/10 border-white/10 text-white' : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900'}`}>
                                        <div className="flex items-center space-x-2">
                                            <span className={`text-sm font-medium ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{getSlotLabel(param)}</span>
                                        </div>
                                        <div className={`flex items-center space-x-2 text-xs ${hasCustomColor ? 'text-white/70' : 'text-blue-600 dark:text-blue-400'}`}>
                                            <ExternalLink className="w-3 h-3" />
                                            <span>Connected</span>
                                        </div>
                                    </div>
                                ) : (
                                    (() => {
                                        const parameterType = detectParameterType(param);
                                        const wrapperClasses = "space-y-1.5";

                                        if (parameterType) {
                                            return (
                                                <div className={wrapperClasses}>
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
                                                </div>
                                            );
                                        }
                                        // Default WidgetValueEditor
                                        return (
                                            <div className={wrapperClasses}>
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
                                            </div>
                                        );
                                    })()
                                )
                            ) : (
                                // Read-only
                                <div className={`flex justify-between items-center p-3 rounded-lg ${hasCustomColor ? 'bg-black/10 text-white' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                                    <span className={`text-sm font-medium ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{getSlotLabel(param)}</span>
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
        if (!type || typeof type !== 'string') return '#10b981'; // Default Green for unknown/untyped

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
                                                <span className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${hasCustomColor ? 'text-white/50' : 'text-slate-500'}`}>{getSlotLabel(input)}</span>
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
                                            <span className={`text-sm font-medium ${hasCustomColor ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>{getSlotLabel(input)}</span>
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
                                    <span className={`text-sm font-semibold ${hasCustomColor ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{getSlotLabel(output)}</span>
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

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 15 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        y: showColorPicker ? 60 : 0
                    }}
                    exit={{ opacity: 0, scale: 0.96, y: 15 }}
                    transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                    className="relative w-[80vw] h-[75vh] pointer-events-auto flex flex-col"
                >
                    {/* Action Buttons Row - Positioned above the modal */}
                    <div className="absolute top-0 left-0 -translate-y-[calc(100%+16px)] flex items-center w-full min-h-[48px] pointer-events-none">
                        <div className="flex items-center pointer-events-auto">
                            <AnimatePresence mode="wait">
                                {!showColorPicker ? (
                                    <motion.div
                                        key="main-actions"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="flex items-center gap-2"
                                    >
                                        {/* Action Bar */}
                                        {/* Subgraph Edit Button (Replaces Copy for Subgraphs) */}
                                        {subgraphDefinition && onEnterSubgraph ? (
                                            <button
                                                onClick={() => {
                                                    onEnterSubgraph(selectedNode.type, selectedNode.title || subgraphDefinition.name || 'Subgraph');
                                                    onClose();
                                                }}
                                                className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/10 flex items-center justify-center text-blue-400 hover:text-blue-500 hover:bg-blue-500/10 transition-all active:scale-95"
                                                title="Edit Subgraph"
                                            >
                                                <Edit3 className="w-5 h-5" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onCopyNode?.(nodeId)}
                                                className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors active:scale-95"
                                                title={t('circularMenu.node.copy')}
                                            >
                                                <Copy className="w-5 h-5" />
                                            </button>
                                        )}

                                        <div className="w-[1px] h-6 bg-white/10 mx-1" />

                                        <div className="flex items-center gap-1 p-1 bg-[#374151] rounded-full shadow-xl border border-white/10">
                                            {[
                                                { id: 0, icon: Play, activeColor: 'text-emerald-400', label: t('node.mode.always') },
                                                { id: 2, icon: VolumeX, activeColor: 'text-[#3b82f6]', label: t('node.mode.mute') },
                                                { id: 4, icon: Shuffle, activeColor: 'text-[#9333ea]', label: t('node.mode.bypass') }
                                            ].map((mode) => (
                                                <button
                                                    key={mode.id}
                                                    onClick={() => onNodeModeChange?.(nodeId, mode.id)}
                                                    title={mode.label}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${currentMode === mode.id
                                                        ? `${mode.activeColor} bg-white/10 shadow-inner`
                                                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                                                        }`}
                                                >
                                                    <mode.icon className="w-5 h-5" />
                                                </button>
                                            ))}
                                        </div>

                                        <div className="w-[1px] h-6 bg-white/10 mx-1" />

                                        <button
                                            onClick={() => setShowColorPicker(true)}
                                            className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/10 flex items-center justify-center text-white/80 transition-all active:scale-95"
                                            title={t('circularMenu.node.color')}
                                        >
                                            <Palette className="w-5 h-5" />
                                        </button>

                                        <div className="w-[1px] h-6 bg-white/10 mx-1" />

                                        <button
                                            onClick={() => onNodeDelete?.(nodeId)}
                                            className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/10 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
                                            title={t('circularMenu.node.delete')}
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>


                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="color-picker"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="flex items-center gap-1.5 w-full pr-4"
                                    >
                                        <button
                                            onClick={() => setShowColorPicker(false)}
                                            className="w-12 h-12 rounded-full bg-[#374151] shadow-xl border border-white/30 flex items-center justify-center text-white transition-all active:scale-95 flex-shrink-0"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>

                                        <div className="grid grid-cols-5 items-center gap-1.5 p-1.5 bg-[#374151] rounded-2xl shadow-xl border border-white/10 max-w-full overflow-hidden">
                                            {NODE_COLORS.map((c) => (
                                                <button
                                                    key={c.name}
                                                    onClick={() => {
                                                        onNodeColorChange?.(nodeId, c.value);
                                                        setShowColorPicker(false);
                                                    }}
                                                    style={{ backgroundColor: c.value || '#374151' }}
                                                    className="w-10 h-10 rounded-full border border-white/20 shadow-sm active:scale-90 transition-transform flex-shrink-0"
                                                    title={t(c.key)}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Main Card */}
                    <div
                        style={{
                            backgroundColor: effectiveBgColor,
                            opacity: effectiveOpacity
                        }}
                        className={`relative w-full h-full bg-white dark:bg-slate-950 rounded-3xl shadow-2xl ring-1 ring-slate-900/5 dark:ring-slate-100/10 overflow-hidden flex flex-col ${hasCustomColor ? 'text-white' : ''}`}
                    >
                        {/* Dynamic Sticky Header - Overlay Architecture */}
                        <div
                            className={`absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] transition-all duration-300 ease-in-out
                                ${isHeaderCompact
                                    ? 'pt-2 pb-[13px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10'
                                    : `pt-6 pb-6 pl-6 pr-16 border-transparent ${hasCustomColor ? 'bg-black/20' : 'bg-transparent'} backdrop-blur-0`
                                }`}
                        >
                            {/* Minimalist Floating Close Button */}
                            <div
                                className={`absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}
                            >
                                <button
                                    onClick={onClose}
                                    className={`p-2 rounded-full transition-all ${hasCustomColor ? 'bg-black/20 text-white hover:bg-black/40' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex flex-col justify-center flex-1 min-w-0">
                                <div
                                    className={`flex items-center space-x-2 transition-all duration-300 origin-left min-w-0 ${isHeaderCompact ? 'mb-1 scale-90' : 'mb-3 scale-100'}`}
                                >
                                    <Badge variant="secondary" className={`text-[10px] font-mono px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${hasCustomColor ? 'bg-black/20 text-white/80' : 'text-slate-500 bg-slate-100 dark:bg-slate-900'}`}>
                                        ID: {nodeId}
                                    </Badge>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors truncate min-w-0 block ${hasCustomColor ? 'text-white/60' : 'text-slate-400'}`}>
                                        {selectedNode.type}
                                    </span>
                                </div>

                                {isEditingTitle ? (
                                    <div
                                        className="flex items-center min-w-0 transition-all duration-300"
                                        style={{ height: isHeaderCompact ? '13px' : baseTitleSize }}
                                    >
                                        <div className="flex items-center space-x-2 w-full">
                                            <input
                                                type="text"
                                                value={editingTitleValue}
                                                onChange={(e) => setEditingTitleValue(e.target.value)}
                                                onKeyDown={handleTitleKeyDown}
                                                style={{
                                                    fontSize: baseTitleSize,
                                                    lineHeight: '1',
                                                    transform: isHeaderCompact ? `scale(${0.8125 / parseFloat(baseTitleSize)})` : 'scale(1)',
                                                    transformOrigin: 'left center',
                                                    width: '100%',
                                                    maxWidth: '100%'
                                                }}
                                                className={`flex-1 font-extrabold bg-transparent border-b-2 focus:outline-none transition-all ${hasCustomColor ? 'text-white border-white/50' : 'text-slate-900 dark:text-white border-primary'}`}
                                                autoFocus
                                            />
                                            <Button variant="ghost" size="icon" onClick={handleSaveTitleChange} className={`h-8 w-8 ${hasCustomColor ? 'text-white/80 hover:bg-white/10' : 'text-green-500'}`}>
                                                <Check className="w-5 h-5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={handleCancelTitleEdit} className={`h-8 w-8 ${hasCustomColor ? 'text-white/80 hover:bg-white/10' : 'text-red-500'}`}>
                                                <X className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="flex items-center min-w-0 transition-all duration-300"
                                        style={{ height: isHeaderCompact ? '13px' : baseTitleSize }}
                                    >
                                        <div
                                            style={{
                                                fontSize: baseTitleSize,
                                                lineHeight: '1',
                                                transform: isHeaderCompact ? `scale(${0.8125 / parseFloat(baseTitleSize)})` : 'scale(1)',
                                                transformOrigin: 'left center',
                                                pointerEvents: isHeaderCompact ? 'none' : 'auto',
                                            }}
                                            className={`flex items-center group/title ${!subgraphDefinition ? 'cursor-pointer' : ''} font-extrabold tracking-tight leading-tight w-full overflow-visible transition-transform duration-300 will-change-transform`}
                                            onClick={!subgraphDefinition ? handleStartEditingTitle : undefined}
                                        >
                                            <span className={`truncate ${hasCustomColor ? 'text-white/95' : 'text-slate-900 dark:text-white'}`}>
                                                {titleText}
                                            </span>
                                            {!subgraphDefinition && (
                                                <div
                                                    className={`transition-all duration-300 ${isHeaderCompact ? 'opacity-0 scale-75' : 'opacity-0 group-hover/title:opacity-100 scale-100'}`}
                                                >
                                                    <Edit3 className={`w-5 h-5 ${hasCustomColor ? 'text-white/70' : 'text-slate-400'}`} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {
                                    <div
                                        className={`inline-flex self-start items-center text-xs font-medium px-2 rounded-md border m-0 transition-all duration-300 overflow-hidden
                                            ${isHeaderCompact
                                                ? 'opacity-0 scale-75 h-0 mt-0 py-0 border-transparent'
                                                : `opacity-100 scale-100 h-6 mt-3 py-1 ${hasCustomColor ? 'text-white/80 bg-black/20 border-white/10' : 'text-slate-500 bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'}`
                                            }`}
                                    >
                                        {metadata?.category || "No Category"}
                                    </div>
                                }
                            </div>
                        </div>

                        {/* Single Scrollable Content Area */}
                        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                            {/* Static Top Bumper - Prevents initial jitter */}
                            <div className="h-[110px] relative pointer-events-none">
                                {/* Sentinel for IntersectionObserver at exactly 80px scroll depth */}
                                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
                            </div>

                            <div className="px-5 py-6">
                                {/* Extra top padding when header is NOT compact to avoid overlapping or awkward spacing if needed, 
                                   actually since it's NOT absolute but flex-col, it pushes down naturally. 
                                   We just removed the old identity header from here. */}

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
                                        renderParameterSection(t('node.parameters'), widgets, <SlidersHorizontal className="w-4 h-4" />, true)
                                    ) : (
                                        selectedNode.widgets_values && (
                                            <div className={`p-4 rounded-xl border mt-8 ${hasCustomColor ? 'bg-black/10 border-white/10' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}>
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
                        </div>
                    </div>
                </motion.div>

                {/* File Gallery Portal */}
                {
                    fileSelectionState.isOpen && fileSelectionState.paramType && createPortal(
                        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto">
                            <OutputsGallery
                                isFileSelectionMode={true}
                                allowImages={true}
                                allowVideos={fileSelectionState.paramType === 'VIDEO'}
                                onFileSelect={handleFileSelect}
                                onBackClick={() => setFileSelectionState({ isOpen: false, paramName: null, paramType: null })}
                                selectionTitle={`Select ${fileSelectionState.paramType === 'IMAGE' ? 'Image' : 'Image/Video'}`}
                                initialFolder="input"
                            />
                        </div>,
                        document.body
                    )
                }
            </div >
        </AnimatePresence >,
        document.body
    );
};
