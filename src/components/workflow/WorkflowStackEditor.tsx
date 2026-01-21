import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { IComfyGraph } from '@/shared/types/app/IComfyGraph';
import { WorkflowAnalysisService, WorkflowGroupReport } from '@/core/services/WorkflowAnalysisService';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Layers, ExternalLink, Loader2, Play, VolumeX, Shuffle, ListOrdered, LayoutGrid, ChevronDown, ChevronUp, ChevronRight, Square, X } from 'lucide-react';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { WidgetValueEditor } from '@/components/controls/WidgetValueEditor';
import { useWidgetValueEditor } from '@/hooks/useWidgetValueEditor';
import { IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';
import { detectParameterTypeForGallery } from '@/shared/utils/GalleryPermissionUtils';
import { toast } from 'sonner';
import { useFileOperations } from '@/hooks/useFileOperations';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import { createPortal } from 'react-dom';
import { updateWorkflow, getWorkflow } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { motion, AnimatePresence } from 'framer-motion';
import { ComfyGraph } from '@/core/domain/ComfyGraph';
import { QuickActionPanel } from '@/components/controls/QuickActionPanel';
import { WorkflowStackFooter } from './WorkflowStackFooter';
import { WorkflowHeaderProgressBar as ExecutionProgressBar } from '@/components/execution/ExecutionProgressBar';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { convertGraphToAPI } from '@/infrastructure/api/ComfyApiFunctions';
import { autoChangeSeed } from '@/shared/utils/seedProcessing';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

// Custom morphing icon component (copied from WorkflowHeader)
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

interface WorkflowStackEditorProps {
    graph: ComfyGraph;
    workflowName?: string;
    id?: string;
    onClose: () => void;
}

interface StackNodeProps {
    node: ComfyGraphNode;
    widgetEditor: any; // Return type of useWidgetValueEditor
    onModeChange?: (nodeId: number, mode: number) => void;
    globalExpandAction?: 'expand' | 'collapse' | null;
    executingNodeId?: string | null;
}

const StackNode: React.FC<StackNodeProps> = ({ node, widgetEditor, onModeChange, globalExpandAction, executingNodeId }) => {
    const { t } = useTranslation();

    const widgets = useMemo(() => {
        if (node.getWidgets) {
            const nodeWidgets = node.getWidgets();
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
                    const processed: IProcessedParameter = {
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
        return [];
    }, [node]);

    const currentMode = (node as any)?.mode || 0;
    const isMuted = currentMode === 2;
    const isBypassed = currentMode === 4;

    // Initial state: collapsed by default
    const [isExpanded, setIsExpanded] = useState(false);

    // Handle global expand/collapse
    useEffect(() => {
        if (widgets.length === 0) {
            setIsExpanded(false);
            return;
        }
        if (globalExpandAction === 'expand') setIsExpanded(true);
        else if (globalExpandAction === 'collapse') setIsExpanded(false);
    }, [globalExpandAction, widgets.length]);

    const {
        editingParam,
        editingValue,
        getWidgetValue,
        startEditingParam,
        cancelEditingParam,
        saveEditingParam,
        updateEditingValue,
        setWidgetValue,
        modifiedWidgetValues
    } = widgetEditor;

    const fileOperations = useFileOperations({
        onSetWidgetValue: (nodeId, paramName, value) => setWidgetValue(nodeId, paramName, value)
    });

    const [fileSelectionState, setFileSelectionState] = useState<{
        isOpen: boolean;
        paramName: string | null;
        paramType: string | null;
    }>({ isOpen: false, paramName: null, paramType: null });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (file: any) => {
        if (fileSelectionState.paramName) {
            setWidgetValue(node.id, fileSelectionState.paramName, file);
        }
        setFileSelectionState({ isOpen: false, paramName: null, paramType: null });
    };

    const isInputConnected = (inputName: string): boolean => {
        if (!node.inputs) return false;
        const input = node.inputs.find((i: any) => i.name === inputName);
        return input?.link !== null && input?.link !== undefined;
    };

    const isWidgetModified = (paramName: string): boolean => {
        const nodeValues = modifiedWidgetValues.get(node.id);
        return !!(nodeValues && paramName in nodeValues);
    };

    const getModifiedClasses = (paramName: string): string => {
        return isWidgetModified(paramName)
            ? 'bg-[#10b981] dark:bg-[#10b981] border-[#10b981] dark:border-[#10b981] ring-1 ring-[#10b981]/50 dark:ring-[#10b981]/50 text-white dark:text-white'
            : '';
    };

    const detectParameterType = (param: IProcessedParameter): 'IMAGE' | 'VIDEO' | null => {
        const currentValue = getWidgetValue(node.id, param.name, param.value);
        const possibleValues = param.possibleValues || [];
        return detectParameterTypeForGallery(param.name, currentValue, possibleValues);
    };

    const onControlAfterGenerateChange = (nodeId: number, value: string) => {
        setWidgetValue(nodeId, 'control_after_generate', value);
    };

    const isExecuting = executingNodeId === node.id.toString();
    const hasModifications = widgetEditor.modifiedWidgetValues.has(node.id);

    const baseColor = (node.bgcolor || node.color || (node.properties?.['Node Color'])) || '#1e293b';
    const effectiveBgColor = isMuted ? '#3b82f6' : (isBypassed ? '#9333ea' : baseColor);
    const effectiveOpacity = (isMuted || isBypassed) ? 0.6 : 1;

    const containerStyle = {
        backgroundColor: isExecuting ? undefined : (effectiveBgColor === '#1e293b' ? undefined : effectiveBgColor),
        opacity: effectiveOpacity,
    };

    const themeOverride = {
        container: 'bg-black/10 border border-white/5 shadow-none',
        label: 'text-white/95',
        secondaryText: 'text-white/60',
        text: 'text-white/90',
        border: 'border-white/10',
    };


    return (
        <div
            id={`node-${node.id}`}
            style={containerStyle}
            className={`relative w-full p-3 rounded-2xl transition-all duration-300 flex flex-col gap-3 group/node shadow-sm overflow-hidden border
                ${isExecuting ? 'bg-emerald-400/50 border-emerald-300 shadow-[0_0_35px_rgba(52,211,153,0.5)]' : (effectiveBgColor === '#1e293b' ? 'bg-[#1e293b] hover:bg-[#253045]' : 'hover:brightness-110')}
                ${hasModifications ? 'ring-[3px] ring-emerald-400 border-emerald-400' : 'border-white/10 hover:border-blue-400/30'}
            `}
        >
            {isExecuting ? (
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-emerald-400/20 pointer-events-none" />
            ) : effectiveBgColor !== '#1e293b' ? (
                <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/40 pointer-events-none" />
            ) : null}

            <div className="relative z-[1] flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-start justify-between w-full overflow-hidden">
                        <div
                            className={`flex-1 min-w-0 flex items-center gap-2 ${widgets.length > 0 ? 'cursor-pointer' : ''}`}
                            onClick={(e) => {
                                if (widgets.length > 0) {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }
                            }}
                        >
                            {widgets.length > 0 && (
                                <div className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                                    <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0 pr-2 pt-1">
                                <div className="flex items-center gap-2">
                                    <div className="font-bold text-sm text-white/95 truncate leading-snug group-hover/node:text-blue-300 transition-colors">
                                        {node.title || node.type}
                                    </div>
                                    {isExecuting && <Loader2 className="w-3.5 h-3.5 text-emerald-300 animate-spin shrink-0" />}
                                </div>
                                <div className="text-[10px] text-white/40 truncate font-mono">
                                    #{node.id} • {node.type}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onModeChange?.(node.id, 0);
                                    }}
                                    className={`p-1 rounded-md transition-all ${currentMode === 0 ? 'bg-green-500/20 text-green-400' : 'text-white/30 hover:text-white/60'}`}
                                    title={t('node.mode.always')}
                                >
                                    <Play className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onModeChange?.(node.id, 2);
                                    }}
                                    className={`p-1 rounded-md transition-all ${currentMode === 2 ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 hover:text-white/60'}`}
                                    title={t('node.mode.mute')}
                                >
                                    <VolumeX className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onModeChange?.(node.id, 4);
                                    }}
                                    className={`p-1 rounded-md transition-all ${currentMode === 4 ? 'bg-purple-500/20 text-purple-400' : 'text-white/30 hover:text-white/60'}`}
                                    title={t('node.mode.bypass')}
                                >
                                    <Shuffle className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Collapsible Content */}
                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            {widgets.length > 0 && (
                                <div className="flex flex-col gap-2 mt-1 border-t border-white/5 pt-3">
                                    {widgets.map((param, index) => {
                                        if (isInputConnected(param.name)) {
                                            return (
                                                <div key={`${param.name}-${index}`} className="flex items-center justify-between p-2 rounded-lg bg-black/10 border border-white/10 text-white">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-xs font-medium text-white/80">{param.label || param.name}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-1.5 text-[10px] text-white/60">
                                                        <ExternalLink className="w-3 h-3" />
                                                        <span>Connected</span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const parameterType = detectParameterType(param);
                                        const isFileType = parameterType === 'IMAGE' || parameterType === 'VIDEO';

                                        return (
                                            <div key={`${param.name}-${index}`} className="w-full">
                                                <WidgetValueEditor
                                                    param={param}
                                                    nodeId={node.id}
                                                    currentValue={getWidgetValue(node.id, param.name, param.value)}
                                                    isEditing={editingParam?.nodeId === node.id && editingParam?.paramName === param.name}
                                                    editingValue={editingValue}
                                                    uploadState={fileOperations.uploadState}
                                                    isModified={isWidgetModified(param.name)}
                                                    modifiedHighlightClasses={getModifiedClasses(param.name)}
                                                    onStartEditing={(nid, pname, val) => {
                                                        if (isFileType) {
                                                            setFileSelectionState({ isOpen: true, paramName: pname, paramType: parameterType });
                                                        } else {
                                                            startEditingParam(nid, pname, val);
                                                        }
                                                    }}
                                                    onCancelEditing={cancelEditingParam}
                                                    onSaveEditing={saveEditingParam}
                                                    onEditingValueChange={updateEditingValue}
                                                    onControlAfterGenerateChange={onControlAfterGenerateChange}
                                                    onFilePreview={(filename) => fileOperations.handleFilePreview(filename)}
                                                    onFileUpload={(nid, pname) => fileOperations.handleFileUpload(nid, pname, fileInputRef)}
                                                    onFileUploadDirect={fileOperations.handleFileUploadDirect}
                                                    node={node}
                                                    widget={node.getWidgets ? node.getWidgets()[((param as any).widgetIndex || 0)] : undefined}
                                                    themeOverride={themeOverride}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Hidden File Input for Upload */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={fileOperations.handleFileSelect}
                            />

                            {/* Modals Portals */}
                            {fileSelectionState.isOpen && fileSelectionState.paramType && createPortal(
                                <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-900 overflow-auto">
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
                            )}

                            <FilePreviewModal
                                isOpen={fileOperations.previewModal.isOpen}
                                filename={fileOperations.previewModal.filename}
                                isImage={fileOperations.previewModal.isImage}
                                loading={fileOperations.previewModal.loading}
                                error={fileOperations.previewModal.error}
                                url={fileOperations.previewModal.url}
                                onClose={fileOperations.closePreview}
                                onRetry={fileOperations.handleFilePreview}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export const WorkflowStackEditor: React.FC<WorkflowStackEditorProps> = ({ graph, workflowName, id, onClose }) => {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);
    const [saveSucceeded, setSaveSucceeded] = useState(false);
    const [showCheckmark, setShowCheckmark] = useState(false);
    const [groupingMode, setGroupingMode] = useState<'execution' | 'type'>('type');
    const [globalExpandAction, setGlobalExpandAction] = useState<'expand' | 'collapse' | null>(null);
    const [, setUpdateCounter] = useState(0);
    const [isExecuting, setIsExecuting] = useState(false);
    const [queueRefreshTrigger, setQueueRefreshTrigger] = useState(0);
    const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
    const currentPromptIdRef = useRef<string | null>(null);
    const { isConnected } = useConnectionStore();

    // Trigger queue refresh when ID changes
    useEffect(() => {
        if (id) {
            setQueueRefreshTrigger(prev => prev + 1);
        }
    }, [id]);

    // Subscribe to execution events to highlight the currently running node
    useEffect(() => {
        const handleExecuting = (event: any) => {
            const { data } = event;
            if (data.node === null) {
                setExecutingNodeId(null);
            } else if (data.node) {
                setExecutingNodeId(data.node.toString());
            }
        };

        const handleProgressState = (event: any) => {
            const { data } = event;
            if (data.nodes) {
                const nodes = data.nodes;
                let currentRunningNodeId: string | null = null;

                // Find the first running node for display
                Object.keys(nodes).forEach(nodeId => {
                    const nodeData = nodes[nodeId];
                    if (nodeData.state === 'running' && !currentRunningNodeId) {
                        currentRunningNodeId = nodeId;
                    }
                });

                setExecutingNodeId(currentRunningNodeId);
            }
        };

        const handleExecutionSuccess = () => setExecutingNodeId(null);
        const handleExecutionError = () => setExecutingNodeId(null);
        const handleInterrupted = () => setExecutingNodeId(null);

        const listenerIds = [
            globalWebSocketService.on('executing', handleExecuting),
            globalWebSocketService.on('progress_state', handleProgressState),
            globalWebSocketService.on('execution_success', handleExecutionSuccess),
            globalWebSocketService.on('execution_error', handleExecutionError),
            globalWebSocketService.on('execution_interrupted', handleInterrupted)
        ];

        // Initial check for current execution state
        const currentState = globalWebSocketService.getCurrentExecutionState();
        if (currentState.isExecuting && currentState.executingNodeId) {
            setExecutingNodeId(currentState.executingNodeId);
        }

        return () => {
            globalWebSocketService.offById('executing', listenerIds[0]);
            globalWebSocketService.offById('progress_state', listenerIds[1]);
            globalWebSocketService.offById('execution_success', listenerIds[2]);
            globalWebSocketService.offById('execution_error', listenerIds[3]);
            globalWebSocketService.offById('execution_interrupted', listenerIds[4]);
        };
    }, []);

    // Global processor for all nodes in the graph
    const processor = useMemo(() => ({
        setWidgetValue: (nodeId: number, paramName: string, value: any) => {
            const node = graph.getNodeById(nodeId);
            if (node) {
                node.setWidgetValue(paramName, value);
            }
        },
        getWidgetValue: (nodeId: number, paramName: string) => {
            const node = graph.getNodeById(nodeId);
            if (node) {
                const w = node.getWidget(paramName);
                return w ? w.value : undefined;
            }
            return undefined;
        }
    }), [graph]);

    const widgetEditor = useWidgetValueEditor({
        processor
    });

    const createModifiedGraph = useCallback((originalGraph: any, modifications: Map<number, Record<string, any>>) => {
        const modifiedGraph = {
            _nodes: originalGraph._nodes.map((node: any) => ({
                ...node,
                widgets: node.widgets ? [...node.widgets] : undefined,
                _widgets: node._widgets ? [...node._widgets] : undefined,
                widgets_values: Array.isArray(node.widgets_values)
                    ? [...node.widgets_values]
                    : node.widgets_values ? { ...node.widgets_values } : undefined
            })),
            _links: { ...originalGraph._links },
            _groups: originalGraph._groups ? [...originalGraph._groups] : [],
            last_node_id: originalGraph.last_node_id || 0,
            last_link_id: originalGraph.last_link_id || 0
        };

        if (modifications.size > 0) {
            modifications.forEach((nodeModifications, nodeId) => {
                const graphNode = modifiedGraph._nodes?.find((n: any) => Number(n.id) === nodeId);
                if (graphNode) {
                    Object.entries(nodeModifications).forEach(([paramName, newValue]) => {
                        let modified = false;
                        if (graphNode.widgets) {
                            const widget = graphNode.widgets.find((w: any) => w.name === paramName);
                            if (widget) { widget.value = newValue; modified = true; }
                        }
                        if (graphNode._widgets) {
                            const _widget = graphNode._widgets.find((w: any) => w.name === paramName);
                            if (_widget) { _widget.value = newValue; modified = true; }
                        }
                        if (graphNode.widgets_values && typeof graphNode.widgets_values === 'object' && !Array.isArray(graphNode.widgets_values)) {
                            if (paramName in graphNode.widgets_values) { graphNode.widgets_values[paramName] = newValue; modified = true; }
                        }
                        if (graphNode.widgets_values && Array.isArray(graphNode.widgets_values)) {
                            const widgetIndex = (graphNode.widgets || []).findIndex((w: any) => w.name === paramName);
                            if (widgetIndex !== -1 && widgetIndex < graphNode.widgets_values.length) {
                                graphNode.widgets_values[widgetIndex] = newValue;
                                modified = true;
                            }
                        }
                    });
                }
            });
        }
        return modifiedGraph;
    }, []);

    const handleExecute = async () => {
        if (!graph || !isConnected) {
            toast.error(t('workflow.submitFailed'));
            return;
        }

        try {
            setIsExecuting(true);

            // Use a local modifications map to capture changes immediately (including seeds)
            // This is necessary because widgetEditor.modifiedWidgetValues (state) won't update until next render
            const currentModifications = new Map(widgetEditor.modifiedWidgetValues);

            try {
                // Get node metadata (injected in WorkflowStackPage)
                // Note: ComfyGraph stores this in _metadata
                const objectInfo = (graph as any)._metadata;

                // Create a virtual workflow object for autoChangeSeed
                const virtualWorkflow = {
                    id: id || '',
                    name: workflowName || '',
                    workflow_json: graph.serialize ? graph.serialize() : {},
                    graph: graph
                };

                // Execute auto seed processing
                await autoChangeSeed(virtualWorkflow as any, null, {
                    getWidgetValue: (nodeId: number, paramName: string, defaultValue: any) => {
                        // Check local modifications first for the most current value
                        const nodeMods = currentModifications.get(nodeId);
                        if (nodeMods && paramName in nodeMods) {
                            return nodeMods[paramName];
                        }
                        return widgetEditor.getWidgetValue(nodeId, paramName, defaultValue);
                    },
                    setWidgetValue: (nodeId: number, paramName: string, value: any) => {
                        // 1. Update our local map for immediate use in this execution
                        const nodeMods = currentModifications.get(nodeId) || {};
                        nodeMods[paramName] = value;
                        currentModifications.set(nodeId, nodeMods);

                        // 2. Also update the UI state so the change is visible to the user
                        widgetEditor.setWidgetValue(nodeId, paramName, value);
                    }
                });
            } catch (error) {
                console.error('Error during seed processing:', error);
            }

            // Create modified graph using the combined modifications (manual changes + seed changes)
            const tempGraph = createModifiedGraph(graph, currentModifications);
            const { apiWorkflow } = convertGraphToAPI(tempGraph);

            const promptId = await ComfyUIService.executeWorkflow(apiWorkflow, {
                workflowId: id || 'stack-editor',
                workflowName: workflowName || t('workflow.newWorkflowName')
            });

            currentPromptIdRef.current = promptId;
        } catch (error) {
            console.error('Workflow execution failed:', error);
            toast.error(t('workflow.submitFailed'));
        } finally {
            setIsExecuting(false);
        }
    };

    const handleRandomizeSeeds = useCallback(() => {
        if (!graph) return;

        let changedCount = 0;
        const nodes = graph._nodes || [];
        nodes.forEach((node: any) => {
            const widgets = node.widgets || [];
            const seedWidgets = widgets.filter((w: any) =>
                (w.name === 'seed' || w.name === 'noise_seed')
            );

            seedWidgets.forEach((w: any) => {
                const newValue = Math.floor(Math.random() * 1125899906842624);
                widgetEditor.setWidgetValue(node.id, w.name, newValue);
                changedCount++;
            });
        });

        if (changedCount > 0) {
            toast.success(t('workflow.randomizedSeeds', { count: changedCount }));
        } else {
            toast.info(t('workflow.noSeedsFound'));
        }
    }, [graph, widgetEditor, t]);

    const handleInterrupt = useCallback(async () => {
        try {
            await ComfyUIService.interruptExecution();
        } catch (error) {
            console.error('Failed to interrupt:', error);
            toast.error(t('workflow.interruptFailed'));
        }
    }, []);

    const handleClearQueue = useCallback(async () => {
        try {
            await ComfyUIService.clearQueue();
            toast.success(t('workflow.queueCleared'));
        } catch (error) {
            console.error('Failed to clear queue:', error);
            toast.error(t('workflow.clearQueueFailed'));
        }
    }, []);

    const handleSaveChanges = async () => {
        if (!graph) return;
        setIsSaving(true);
        setSaveSucceeded(false);

        try {
            const serializedData = graph.serialize();
            const workflowId = graph.id;
            if (!workflowId) throw new Error('Graph ID is missing');

            let currentWorkflow = await getWorkflow(workflowId);
            if (!currentWorkflow && !isNaN(Number(workflowId))) {
                currentWorkflow = await getWorkflow(Number(workflowId) as any);
            }

            if (!currentWorkflow) {
                throw new Error(`Workflow not found in storage (ID: ${workflowId})`);
            }

            const updatedWorkflow = {
                ...currentWorkflow,
                workflow_json: serializedData,
                modifiedAt: new Date()
            };

            await updateWorkflow(updatedWorkflow);
            widgetEditor.clearModifications();
            setIsSaving(false);
            setSaveSucceeded(true);
        } catch (error) {
            console.error('Failed to save workflow from stack view:', error);
            setIsSaving(false);
            toast.error(t('workflow.saveFailed'));
        }
    };

    useEffect(() => {
        if (saveSucceeded) {
            setShowCheckmark(true);
            const timer = setTimeout(() => {
                setShowCheckmark(false);
                setSaveSucceeded(false);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [saveSucceeded]);

    const activeNodesIds = useMemo(() => {
        const allNodes = (graph as any)._nodes || [];
        return allNodes.filter((node: any) => {
            const hasInput = node.inputs?.some((i: any) => i.link !== null);
            const hasOutput = node.outputs?.some((o: any) => o.links && o.links.length > 0);
            return hasInput || hasOutput;
        }).map((n: any) => n.id);
    }, [graph]);

    const allChains = useMemo(() => {
        if (!graph) return [];
        const service = new WorkflowAnalysisService(graph);
        const report = service.getReport();
        return report.map(group => ({
            ...group,
            nodes: group.nodes.filter(n => activeNodesIds.includes(n.id)),
            nodeCount: group.nodes.filter(n => activeNodesIds.includes(n.id)).length
        })).filter(g => g.nodeCount > 0);
    }, [graph, activeNodesIds]);

    const executionGroups = useMemo(() => {
        return allChains.filter(g => g.nodeCount > 1);
    }, [allChains]);

    const globalNodeOrder = useMemo(() => {
        const orderMap = new Map<number, number>();
        let globalIndex = 0;
        allChains.forEach(chain => {
            chain.nodes.forEach(node => {
                orderMap.set(node.id, globalIndex++);
            });
        });
        return orderMap;
    }, [allChains]);

    const typeGroups = useMemo(() => {
        if (!graph) return [];

        const allNodes = (graph as any)._nodes || [];
        const activeNodes = allNodes.filter((node: any) => activeNodesIds.includes(node.id));

        const categories = [
            { id: 'inputs', label: t('node.category.inputs') },
            { id: 'prompts', label: t('node.category.prompts') },
            { id: 'models_loras', label: t('node.category.models_loras') },
            { id: 'loaders', label: t('node.category.loaders') },
            { id: 'uncategorized', label: t('node.category.uncategorized') },
            { id: 'samplers', label: t('node.category.samplers') },
            { id: 'outputs', label: t('node.category.outputs') }
        ];

        const groupsMap = new Map<string, any[]>();
        categories.forEach(c => groupsMap.set(c.id, []));

        activeNodes.forEach((node: any) => {
            const widgets = node.getWidgets ? node.getWidgets() : [];

            const isInputConnected = (n: any, name: string): boolean => {
                if (!n.inputs) return false;
                const input = n.inputs.find((i: any) => i.name === name);
                return input?.link !== null && input?.link !== undefined;
            };

            // Global Filter: Skip nodes with no widgets or only connected widgets
            const hasEditableWidget = widgets.length > 0 && widgets.some((w: any) => !isInputConnected(node, w.name));
            if (!hasEditableWidget) return;

            const type = (node.type || '').toLowerCase();
            const hasAnyWidget = (names: string[]) => widgets.some((w: any) => names.some(n => (w.name || '').toLowerCase().includes(n.toLowerCase())));

            // (P1) Models and LoRAs
            const hasModelOutput = node.outputs?.some((o: any) => (o.type || '').toUpperCase() === 'MODEL');
            if (type.includes('unet') || type.includes('lora') ||
                (type.includes('sampling') && widgets.some((w: any) => (w.name || '').toLowerCase().includes('shift'))) ||
                (type.includes('loader') && hasModelOutput)) {
                groupsMap.get('models_loras')?.push(node);
                return;
            }

            // (P2) Loaders
            if (type.includes('load') && !hasAnyWidget(['image', 'video'])) {
                groupsMap.get('loaders')?.push(node);
                return;
            }

            // (P3) Input Group (Image & Video)
            if (hasAnyWidget(['image', 'video', 'width', 'height', 'length'])) {
                groupsMap.get('inputs')?.push(node);
                return;
            }

            // (P4) Prompts
            const isPromptType = type.includes('multiline') || type.includes('prompt') || type.includes('string');
            const hasTextValueWidget = hasAnyWidget(['text', 'value']);
            const firstWidget = widgets[0];
            const singleWidgetIsPrompt = widgets.length === 1 &&
                ['text', 'value'].includes((firstWidget.name || '').toLowerCase()) &&
                (firstWidget.type || '').toUpperCase() === 'STRING';

            if ((isPromptType && hasTextValueWidget) || singleWidgetIsPrompt) {
                groupsMap.get('prompts')?.push(node);
                return;
            }

            // (P5) Samplers
            if (type.includes('sampler') || widgets.some((w: any) => (w.name || '').toLowerCase().includes('seed'))) {
                groupsMap.get('samplers')?.push(node);
                return;
            }

            // (P6) Outputs
            if (type.includes('save') || type.includes('vfi') || widgets.some((w: any) => (w.name || '').toLowerCase().includes('filename') || (w.name || '').toLowerCase() === 'save_output')) {
                groupsMap.get('outputs')?.push(node);
                return;
            }

            // (P7) Uncategorized Fallback
            groupsMap.get('uncategorized')?.push(node);
        });

        return categories
            .map(c => {
                const nodes = groupsMap.get(c.id) || [];
                const sortedNodes = nodes.sort((a, b) => {
                    const idxA = globalNodeOrder.get(a.id) ?? 999999;
                    const idxB = globalNodeOrder.get(b.id) ?? 999999;
                    return idxA - idxB;
                });
                return {
                    id: c.id,
                    title: c.label,
                    nodes: sortedNodes,
                    nodeCount: sortedNodes.length
                };
            })
            .filter(g => g.nodeCount > 0);
    }, [graph, globalNodeOrder, activeNodesIds, t]);

    const activeGroups = groupingMode === 'execution' ? executionGroups : typeGroups;

    // Helper to generate a descriptive title like "Load Image -> KSampler"
    const getGroupTitle = (group: WorkflowGroupReport) => {
        if (group.nodes.length === 0) return "Empty";
        const firstNode = group.nodes[0];
        const lastNode = group.nodes[group.nodes.length - 1];

        if (group.nodes.length === 1) {
            return (
                <div className="flex flex-col items-start gap-1">
                    <span className="font-medium text-white/90 truncate max-w-[300px]">{firstNode.title || firstNode.type}</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-white/5 border-white/10 text-white/50">
                        1 node
                    </Badge>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-start gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-white/90 truncate max-w-[150px]">{firstNode.title || firstNode.type}</span>
                    <ArrowRight className="h-3 w-3 text-white/40" />
                    <span className="font-medium text-white/90 truncate max-w-[150px]">{lastNode.title || lastNode.type}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-5 bg-white/5 border-white/10 text-white/50">
                    {group.nodeCount} {group.nodeCount === 1 ? 'node' : 'nodes'}
                </Badge>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 flex flex-col bg-[#111827] text-white overflow-hidden z-[100]">
            {/* Header */}
            <header className="z-10 pwa-header shrink-0 bg-slate-600/20 backdrop-blur-3xl border-b border-white/30 shadow-xl">
                <div className="px-4 py-5 space-y-4 relative overflow-hidden">
                    <div className="flex items-center space-x-4 relative z-10">
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            size="sm"
                            className="bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-xl"
                        >
                            <ArrowLeft className="w-5 h-5 text-white" />
                        </Button>
                        <div className="flex flex-col min-w-0 flex-grow">
                            <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-blue-400 shrink-0" />
                                <h1 className="text-base font-bold text-white tracking-tight truncate">
                                    {workflowName || t('menu.stackView')}
                                </h1>
                            </div>
                            <div className="text-[10px] text-white/40 font-medium uppercase tracking-widest mt-0.5">
                                {t('menu.stackView')}
                            </div>
                        </div>

                        {/* Save Button Slot - Shrink to content to allow title to expand */}
                        <div className="flex shrink-0 items-center justify-end h-10 min-w-[40px]">
                            <AnimatePresence>
                                {(widgetEditor.hasModifications() || showCheckmark) && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 20, scale: 0.8 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
                                        transition={{ duration: 0.3, ease: "backOut" }}
                                    >
                                        <Button
                                            onClick={handleSaveChanges}
                                            disabled={isSaving || showCheckmark}
                                            size="sm"
                                            className={`text-white border border-white/20 backdrop-blur-sm shadow-lg transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-xl ${showCheckmark
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

                    <ExecutionProgressBar />
                </div>
            </header>

            {/* Content area */}
            <div className="flex flex-col flex-1 h-full overflow-hidden relative">
                <div className="flex-1 h-full w-full overflow-y-auto custom-scrollbar">
                    <div className="p-4 space-y-8 pb-24">
                        {/* Unified Control Section */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <div className="h-1 w-1 rounded-full bg-blue-500" />
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">{t('workflow.stackViewLabels.viewSettings')}</span>
                            </div>
                            <div className="bg-white/5 rounded-2xl border border-white/10 p-2 shadow-xl backdrop-blur-md space-y-2">
                                {/* Grouping Toggle Row */}
                                <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/5">
                                    <button
                                        onClick={() => setGroupingMode('type')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-bold transition-all ${groupingMode === 'type' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                        <span>{t('workflow.stackViewLabels.nodesByCategory')}</span>
                                    </button>
                                    <button
                                        onClick={() => setGroupingMode('execution')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-bold transition-all ${groupingMode === 'execution' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                    >
                                        <ListOrdered className="w-3.5 h-3.5" />
                                        <span>{t('workflow.stackViewLabels.executionOrder')}</span>
                                    </button>
                                </div>

                                {/* Global Expand/Collapse Row */}
                                <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/5">
                                    <button
                                        onClick={() => {
                                            setGlobalExpandAction('expand');
                                            setTimeout(() => setGlobalExpandAction(null), 100);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                        <span>{t('common.expandAll')}</span>
                                    </button>
                                    <div className="w-[1px] h-3 bg-white/10 mx-1" />
                                    <button
                                        onClick={() => {
                                            setGlobalExpandAction('collapse');
                                            setTimeout(() => setGlobalExpandAction(null), 100);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95"
                                    >
                                        <ChevronUp className="w-3.5 h-3.5" />
                                        <span>{t('common.collapseAll')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* List Section */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <div className="h-1 w-1 rounded-full bg-blue-500" />
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">
                                    {groupingMode === 'type' ? t('workflow.stackViewLabels.nodesByCategory') : t('workflow.stackViewLabels.executionOrder')}
                                </span>
                            </div>

                            <Accordion type="multiple" defaultValue={activeGroups.map(g => g.id)} key={groupingMode} className="space-y-4">
                                {activeGroups.map((group) => (
                                    <AccordionItem
                                        key={group.id}
                                        value={group.id}
                                        className="group relative rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all overflow-hidden shadow-lg"
                                    >
                                        <AccordionTrigger className="px-5 py-4 hover:no-underline transition-colors">
                                            <div className="flex-1 text-left min-w-0 pr-4">
                                                {'title' in group ? (group as any).title : getGroupTitle(group as any)}
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="bg-transparent px-3 pb-3 pt-1">
                                            <div className="space-y-2 w-full">
                                                {group.nodes.map((node) => {
                                                    const nodeInstance = graph.getNodeById(node.id);
                                                    return nodeInstance ? (
                                                        <StackNode
                                                            key={node.id}
                                                            node={nodeInstance as ComfyGraphNode}
                                                            widgetEditor={widgetEditor}
                                                            globalExpandAction={globalExpandAction}
                                                            executingNodeId={executingNodeId}
                                                            onModeChange={(nodeId, mode) => {
                                                                const n = graph.getNodeById(nodeId);
                                                                if (n) {
                                                                    n.mode = mode;
                                                                    setUpdateCounter(prev => prev + 1);
                                                                }
                                                            }}
                                                        />
                                                    ) : null;
                                                })}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    </div>
                </div>

                <WorkflowStackFooter
                    workflow={{ id, name: workflowName } as any}
                    nodes={graph._nodes || []}
                    onExecute={handleExecute}
                    onInterrupt={handleInterrupt}
                    onClearQueue={handleClearQueue}
                    onRandomizeSeeds={handleRandomizeSeeds}
                    refreshQueueTrigger={queueRefreshTrigger}
                />
            </div>
        </div>
    );
};
