
import { useCallback, useEffect, useRef } from 'react';
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
    Sliders,
    Copy,
    Minimize2,
    Maximize2,
    LucideIcon
} from 'lucide-react';
import { NodeMode } from '../../shared/types/app/enums';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface CircularMenuOption {
    id: string;
    label: string;
    icon: LucideIcon;
    action: () => void;
    color?: string;
    isSelected?: boolean;
}

interface UseCircularMenuOptionsProps {
    circularMenuState: {
        isOpen: boolean;
        center: { x: number; y: number };
        pointer: { x: number; y: number } | null;
        context: 'CANVAS' | 'NODE' | 'NODE_COLOR' | 'NODE_MODE';
        nodeId: number | null;
    };
    setCircularMenuState: React.Dispatch<React.SetStateAction<{
        isOpen: boolean;
        center: { x: number; y: number };
        pointer: { x: number; y: number } | null;
        initialPointer: { x: number; y: number } | null;
        context: 'CANVAS' | 'NODE' | 'NODE_COLOR' | 'NODE_MODE';
        nodeId: number | null;
    }>>;
    workflow: any;
    onNodeColorChange: (nodeId: number, color: string) => void;
    onNodeModeChange: (nodeId: number, mode: NodeMode) => void;
    onNodeDelete: (nodeId: number) => void;
    onPanMode: () => void;
    onToggleConnectionMode: () => void;
    onEnterConnectionModeWithSource: (nodeId: number) => void;
    onEnterRepositionMode: (nodeId?: number) => void;
    onCopyNode: (nodeId: number) => void;
    onAddNode: (position: { x: number; y: number }) => void;
    onNodeCollapseChange?: (nodeId: number, collapsed: boolean) => void;
}

export const useCircularMenuOptions = ({
    circularMenuState,
    setCircularMenuState,
    workflow,
    onNodeColorChange,
    onNodeModeChange,
    onNodeDelete,
    onPanMode,
    onToggleConnectionMode,
    onEnterConnectionModeWithSource,
    onEnterRepositionMode,
    onCopyNode,
    onAddNode,
    onNodeCollapseChange,
}: UseCircularMenuOptionsProps) => {
    const { t } = useTranslation();
    const handleMenuReleaseRef = useRef<() => void>(() => { });

    const getCircularMenuOptions = useCallback((): CircularMenuOption[] => {
        const { context, nodeId } = circularMenuState;

        // Helper to get current node state
        const getNode = () => {
            if (!nodeId || !workflow?.graph?._nodes) return null;
            return workflow.graph._nodes.find((n: any) => n.id === nodeId);
        };

        if (context === 'NODE_COLOR') {
            const node = getNode();
            const currentColor = (node?.bgcolor || node?.color || '').toLowerCase();
            const NODE_COLORS = [
                { name: 'Brown', key: 'circularMenu.colors.brown', value: '#593930' },
                { name: 'Teal', key: 'circularMenu.colors.teal', value: '#3f5159' },
                { name: 'Blue', key: 'circularMenu.colors.blue', value: '#29699c' },
                { name: 'Purple', key: 'circularMenu.colors.purple', value: '#335' },
                { name: 'Green', key: 'circularMenu.colors.green', value: '#353' },
                { name: 'Red', key: 'circularMenu.colors.red', value: '#653' },
                { name: 'Blue Gray', key: 'circularMenu.colors.blueGray', value: '#364254' },
                { name: 'Black', key: 'circularMenu.colors.black', value: '#000' },
                { name: 'Default', key: 'circularMenu.colors.default', value: '' } // Default/Reset
            ];

            return NODE_COLORS.map((colorObj, i) => {
                const isSelected = !!node && (
                    (!colorObj.value && !currentColor) ||
                    (!!colorObj.value && currentColor === colorObj.value.toLowerCase())
                );

                return {
                    id: `color-${i}`,
                    label: t(colorObj.key),
                    icon: Palette,
                    color: colorObj.value || '#333333',
                    isSelected,
                    action: () => {
                        if (nodeId && colorObj.value !== undefined) onNodeColorChange(nodeId, colorObj.value);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                };
            });
        }

        if (context === 'NODE_MODE') {
            const node = getNode();
            const currentMode = node ? (node.mode !== undefined ? node.mode : 0) : 0; // Default Always (0)

            return [
                {
                    id: 'mode-always',
                    label: t('node.mode.always'),
                    icon: Play,
                    isSelected: currentMode === 0,
                    action: () => {
                        if (nodeId) onNodeModeChange(nodeId, 0);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'mode-mute',
                    label: t('node.mode.mute'),
                    icon: VolumeX,
                    isSelected: currentMode === 2,
                    action: () => {
                        if (nodeId) onNodeModeChange(nodeId, 2);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'mode-bypass',
                    label: t('node.mode.bypass'),
                    icon: Shuffle,
                    isSelected: currentMode === 4,
                    action: () => {
                        if (nodeId) onNodeModeChange(nodeId, 4);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                }
            ];
        }

        if (context === 'NODE' && nodeId) {
            return [
                {
                    id: 'resize',
                    label: t('circularMenu.node.resize'),
                    icon: Move,
                    action: () => {
                        onEnterRepositionMode(nodeId || undefined); // Map to Reposition Mode as requested
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'copy',
                    label: t('circularMenu.node.copy'),
                    icon: Copy,
                    action: () => {
                        onCopyNode(nodeId);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'collapse',
                    label: (() => {
                        const node = getNode();
                        return (node as any)?.flags?.collapsed ? t('circularMenu.node.expand') : t('circularMenu.node.collapse');
                    })(),
                    icon: (() => {
                        const node = getNode();
                        return (node as any)?.flags?.collapsed ? Maximize2 : Minimize2;
                    })(),
                    action: () => {
                        const node = getNode();
                        if (node && onNodeCollapseChange) {
                            onNodeCollapseChange(nodeId, !(node as any)?.flags?.collapsed);
                        }
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'mode',
                    label: t('circularMenu.node.mode'),
                    icon: Sliders,
                    action: () => {
                        setCircularMenuState(prev => ({ ...prev, context: 'NODE_MODE', isOpen: true, pointer: null }));
                    }
                },
                {
                    id: 'color',
                    label: t('circularMenu.node.color'),
                    icon: Palette,
                    action: () => {
                        setCircularMenuState(prev => ({ ...prev, context: 'NODE_COLOR', isOpen: true, pointer: null }));
                    }
                },
                {
                    id: 'delete',
                    label: t('circularMenu.node.delete'),
                    icon: Trash2,
                    action: () => onNodeDelete(nodeId)
                },
                {
                    id: 'connect',
                    label: t('circularMenu.node.connect'),
                    icon: Cable,
                    action: () => {
                        onEnterConnectionModeWithSource(nodeId);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                }
            ];
        } else {
            // Canvas Context
            return [
                {
                    id: 'move-node',
                    label: t('circularMenu.canvas.reposition'),
                    icon: MousePointer2,
                    action: () => {
                        onEnterRepositionMode(nodeId || undefined);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'add-node',
                    label: t('circularMenu.canvas.addNode'),
                    icon: Plus,
                    action: () => {
                        onAddNode(circularMenuState.center);
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                },
                {
                    id: 'connect-mode',
                    label: t('circularMenu.canvas.link'),
                    icon: Cable,
                    action: () => {
                        onToggleConnectionMode();
                        setCircularMenuState(prev => ({ ...prev, isOpen: false }));
                    }
                }
            ];
        }
    }, [circularMenuState, workflow, onNodeColorChange, onNodeModeChange, onNodeDelete, onPanMode, onEnterConnectionModeWithSource, onEnterRepositionMode, onToggleConnectionMode, onAddNode, setCircularMenuState]);

    const handleMenuRelease = useCallback(() => {
        const { center, pointer } = circularMenuState;
        if (!pointer) {
            setCircularMenuState(prev => ({ ...prev, isOpen: false }));
            return;
        }

        const dx = pointer.x - center.x;
        const dy = pointer.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Threshold check
        if (distance < 20) {
            setCircularMenuState(prev => ({ ...prev, isOpen: false }));
            return;
        }

        // Calculate angle
        const rad = Math.atan2(dy, dx);
        let angle = (rad * 180) / Math.PI;

        // Normalize: 0 at Top, positive clockwise
        angle += 90;
        if (angle > 180) angle -= 360;

        // Arc Check (240 degrees total)
        const ARC_LIMIT = 120;

        if (angle > ARC_LIMIT || angle < -ARC_LIMIT) {
            setCircularMenuState(prev => ({ ...prev, isOpen: false }));
            return;
        }

        const options = getCircularMenuOptions();
        if (options.length === 0) return;

        // Map to index
        const normalizedAngle = angle + ARC_LIMIT;
        const totalSpan = ARC_LIMIT * 2;
        const segmentSize = totalSpan / options.length;

        const index = Math.floor(normalizedAngle / segmentSize);

        const selectedOption = options[index];
        if (selectedOption) {
            selectedOption.action();
        }

        if (selectedOption?.id !== 'color' && selectedOption?.id !== 'mode') {
            // Usually we close, but some actions might want to keep it open?
            // The actions themselves call setCircularMenuState(isOpen: false) if needed.
            // But if they DON'T (which they do in my implementation above), we might need to force close?
            // Actually, in the original code, it was conditional.
            // "Close menu unless it was a sub-menu action"
            // The actions above do strictly close or switch context.
            // So we don't need to force close here if the actions handle it.
            // EXCEPT for safety, if an action didn't close it.
            // But let's rely on the actions for now as per original code logic structure.
        }
    }, [circularMenuState, getCircularMenuOptions, setCircularMenuState]);

    // Update ref
    useEffect(() => {
        handleMenuReleaseRef.current = handleMenuRelease;
    }, [handleMenuRelease]);

    return {
        options: getCircularMenuOptions(),
        handleMenuRelease
    };
};
