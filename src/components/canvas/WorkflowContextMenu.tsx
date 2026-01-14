import React, { useMemo } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Palette,
    Play,
    VolumeX,
    Shuffle,
    Move,
    Trash2,
    Cable,
    MousePointer2,
    Plus,
    Copy,
    Edit3,
    Minimize2,
    Maximize2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NODE_COLORS } from './useCircularMenuOptions';
import { motion, AnimatePresence } from 'framer-motion';

interface ContextMenuState {
    isOpen: boolean;
    x: number;
    y: number;
    context: 'CANVAS' | 'NODE';
    nodeId: number | null;
}

interface WorkflowContextMenuProps {
    state: ContextMenuState;
    onClose: () => void;
    // Actions
    onNodeColorChange: (nodeId: number, color: string) => void;
    onNodeModeChange: (nodeId: number, mode: number) => void;
    onNodeDelete: (nodeId: number) => void;
    onEnterConnectionModeWithSource: (nodeId: number) => void;
    onEnterRepositionMode: (nodeId?: number) => void;
    onCopyNode: (nodeId: number) => void;
    onAddNode: (position: { x: number; y: number }) => void;
    onToggleConnectionMode: () => void;
    onNodeCollapseChange?: (nodeId: number, collapsed: boolean) => void;
    onEnterSubgraph?: (nodeType: string, title: string) => void;
    // Helper to get node flags
    getNodeFlags?: (nodeId: number) => any;
    graph?: any;
}

export const WorkflowContextMenu: React.FC<WorkflowContextMenuProps> = ({
    state,
    onClose,
    onNodeColorChange,
    onNodeModeChange,
    onNodeDelete,
    onEnterConnectionModeWithSource,
    onEnterRepositionMode,
    onCopyNode,
    onAddNode,
    onToggleConnectionMode,
    onNodeCollapseChange,
    onEnterSubgraph,
    getNodeFlags,
    graph
}) => {
    const { t } = useTranslation();

    const isCollapsed = useMemo(() => {
        if (state.nodeId && getNodeFlags) {
            return !!getNodeFlags(state.nodeId)?.collapsed;
        }
        return false;
    }, [state.nodeId, getNodeFlags]);

    const subgraphInfo = useMemo(() => {
        if (state.nodeId && graph) {
            const node = graph.getNodeById(state.nodeId);
            if (node && graph.subgraphs?.has(node.type)) {
                return { isSubgraph: true, type: node.type, title: node.title || node.type };
            }
        }
        return { isSubgraph: false };
    }, [state.nodeId, graph]);

    return (
        <AnimatePresence>
            {state.isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        left: state.x,
                        top: state.y,
                        zIndex: 10000
                    }}
                >
                    <DropdownMenu open={state.isOpen} onOpenChange={onClose}>
                        <DropdownMenuTrigger asChild>
                            <div style={{ width: 1, height: 1 }} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="start" side="right">
                            {state.context === 'NODE' && state.nodeId && (
                                <>
                                    <DropdownMenuItem onClick={() => onEnterRepositionMode(state.nodeId!)}>
                                        <Move className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.node.resize')}</span>
                                    </DropdownMenuItem>
                                    {subgraphInfo.isSubgraph ? (
                                        <DropdownMenuItem onClick={() => {
                                            if (onEnterSubgraph) onEnterSubgraph(subgraphInfo.type!, subgraphInfo.title!);
                                            onClose();
                                        }}>
                                            <Edit3 className="mr-2 h-4 w-4" />
                                            <span>{t('circularMenu.subgraph.edit') || 'Edit'}</span>
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem onClick={() => onCopyNode(state.nodeId!)}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            <span>{t('circularMenu.node.copy')}</span>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => onNodeCollapseChange?.(state.nodeId!, !isCollapsed)}>
                                        {isCollapsed ? <Maximize2 className="mr-2 h-4 w-4" /> : <Minimize2 className="mr-2 h-4 w-4" />}
                                        <span>{isCollapsed ? t('circularMenu.node.expand') : t('circularMenu.node.collapse')}</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Play className="mr-2 h-4 w-4" />
                                            <span>{t('circularMenu.node.mode')}</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuItem onClick={() => onNodeModeChange(state.nodeId!, 0)}>
                                                <span>{t('node.mode.always')}</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onNodeModeChange(state.nodeId!, 2)}>
                                                <span>{t('node.mode.mute')}</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onNodeModeChange(state.nodeId!, 4)}>
                                                <span>{t('node.mode.bypass')}</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Palette className="mr-2 h-4 w-4" />
                                            <span>{t('circularMenu.node.color')}</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="grid grid-cols-3 gap-1 p-2">
                                            {NODE_COLORS.map((color) => (
                                                <button
                                                    key={color.name}
                                                    className="w-8 h-8 rounded-full border border-gray-300 transition-transform active:scale-90"
                                                    style={{ backgroundColor: color.value || '#333333' }}
                                                    onClick={() => {
                                                        onNodeColorChange(state.nodeId!, color.value);
                                                        onClose();
                                                    }}
                                                    title={t(color.key)}
                                                />
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => onEnterConnectionModeWithSource(state.nodeId!)}>
                                        <Cable className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.node.connect')}</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem
                                        onClick={() => onNodeDelete(state.nodeId!)}
                                        className="text-red-500 focus:text-red-500"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.node.delete')}</span>
                                    </DropdownMenuItem>
                                </>
                            )}

                            {state.context === 'CANVAS' && (
                                <>
                                    <DropdownMenuItem onClick={() => onEnterRepositionMode()}>
                                        <MousePointer2 className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.canvas.reposition')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddNode({ x: state.x, y: state.y })}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.canvas.addNode')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onToggleConnectionMode()}>
                                        <Cable className="mr-2 h-4 w-4" />
                                        <span>{t('circularMenu.canvas.link')}</span>
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </AnimatePresence>
    );
};
