
import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCircularMenuOptions, CircularMenuOption } from './useCircularMenuOptions';
import { NodeMode } from '../../shared/types/app/enums';

interface CircularMenuProps {
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
    onClose: () => void;
}

export interface CircularMenuRef {
    handleRelease: () => void;
}

export const CircularMenu = forwardRef<CircularMenuRef, CircularMenuProps>((props, ref) => {
    const {
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
        onClose
    } = props; // destructure needed? circularMenuState has nodeId. 
    // Wait, circularMenuState has nodeId, but component also accepted nodeId as top level prop in previous version.
    // In my usage in WorkflowEditor, I passed nodeId={circularMenuState.nodeId}.
    // But I can get it from circularMenuState prop now.
    // However, I also passed other props.
    // Let's stick to the interface defined above.

    const { options, handleMenuRelease } = useCircularMenuOptions({
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
        onNodeCollapseChange
    });
    const { isOpen, center, pointer, nodeId: stateNodeId } = circularMenuState;

    useImperativeHandle(ref, () => ({
        handleRelease: handleMenuRelease
    }));

    // Constants for Arc Layout
    const RADIUS = 120; // Distance from center to icon center
    const INNER_RADIUS = 40; // Center deadzone
    const BUTTON_SIZE = 56;
    const POINTER_SIZE = 20;

    // Arc Configuration (Top-heavy Fan)
    // 0 degrees is UP (12 o'clock)
    // Range: -120 to +120 degrees (Total 240 degrees)
    const ARC_LIMIT = 120;

    const activeIndex = useMemo(() => {
        if (!pointer) return -1;

        const dx = pointer.x - center.x;
        const dy = pointer.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Deadzone
        if (distance < INNER_RADIUS) return -1;

        // Calculate angle from Top (Up)
        // Math.atan2(y, x) -> 0 is Right, -PI/2 is Top.
        // We want 0 at Top.
        // dy, dx relative to center.
        const rad = Math.atan2(dy, dx);
        let deg = (rad * 180) / Math.PI;

        // Convert standard angle (0=Right, -90=Top) to our system (0=Top)
        // Standard: Right=0, Down=90, Left=180/-180, Top=-90
        // Target: Top=0, Right=90, Left=-90, Bottom=180
        deg += 90;

        // Normalize to -180 to 180
        if (deg > 180) deg -= 360;

        // Check if within Arc Limit
        if (deg < -ARC_LIMIT || deg > ARC_LIMIT) return -1;

        // Map to option index
        // Range [-120, 120] -> [0, 240]
        const normalizedAngle = deg + ARC_LIMIT;
        const totalSpan = ARC_LIMIT * 2;
        const segmentSize = totalSpan / options.length;

        const index = Math.floor(normalizedAngle / segmentSize);
        return Math.max(0, Math.min(index, options.length - 1));

    }, [pointer, center, options.length]);

    return (
        <AnimatePresence>
            {isOpen && (
                <React.Fragment>
                    {/* Backdrop for closing on outside touch */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, pointerEvents: 'none' }}
                        onClick={onClose}
                        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 9998,
                            backgroundColor: 'rgba(0,0,0,0.2)', // Subtle dimming
                            pointerEvents: 'auto'
                        }}
                    />

                    {/* Menu Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        style={{
                            position: 'fixed',
                            left: center.x,
                            top: center.y,
                            width: 0,
                            height: 0,
                            zIndex: 9999, // High z-index
                            pointerEvents: 'none', // Allow touch through mostly, visuals only
                            touchAction: 'none',
                            userSelect: 'none',
                            WebkitUserSelect: 'none'
                        }}
                    >
                        {/* Center Indicator / Node ID Debug */}
                        <div
                            className="absolute flex items-center justify-center bg-slate-900/90 text-white rounded-full border border-slate-700 backdrop-blur-md shadow-xl select-none"
                            style={{
                                width: INNER_RADIUS * 1.5,
                                height: INNER_RADIUS * 1.5,
                                left: -INNER_RADIUS * 0.75,
                                top: -INNER_RADIUS * 0.75,
                                userSelect: 'none',
                                WebkitUserSelect: 'none'
                            }}
                        >
                            <span className="text-xs font-mono font-bold select-none">
                                {stateNodeId ? `#${stateNodeId}` : '+'}
                            </span>
                        </div>

                        {/* Pointer Indicator */}
                        {pointer && (
                            <motion.div
                                className="absolute bg-white/50 rounded-full blur-sm"
                                style={{
                                    width: POINTER_SIZE,
                                    height: POINTER_SIZE,
                                    left: pointer.x - center.x - POINTER_SIZE / 2,
                                    top: pointer.y - center.y - POINTER_SIZE / 2,
                                }}
                            />
                        )}

                        {/* Menu Options */}
                        {options.map((option, index) => {
                            // Calculate position for each item
                            const totalSpan = ARC_LIMIT * 2;
                            const segmentSize = totalSpan / options.length;
                            // Center of the segment
                            const angleDeg = -ARC_LIMIT + (index * segmentSize) + (segmentSize / 2);
                            // Convert to radians (0 is Top)
                            // Standard: 0=Right. Top is -90.
                            // So our 0 is -90.
                            // rad = (angleDeg - 90) * PI / 180
                            const angleRad = (angleDeg - 90) * (Math.PI / 180);

                            const x = Math.cos(angleRad) * RADIUS;
                            const y = Math.sin(angleRad) * RADIUS;

                            const isActive = index === activeIndex;

                            // Calculate rotation for teardrop to point to center
                            // Teardrop point is at bottom-left (borderRadius: '50% 50% 50% 0') which is approx 225 deg.
                            // We want point to face center (angleDeg + 180).
                            // Rotate = (angleDeg + 180) - 225 = angleDeg - 45.
                            const rotation = angleDeg - 45;

                            return (
                                <motion.div
                                    key={option.id}
                                    className={`absolute flex flex-col items-center justify-center
                    ${isActive || option.isSelected ? 'z-10' : 'z-0'}
                  `}
                                    initial={{ x: 0, y: 0, opacity: 0 }}
                                    animate={{
                                        x: x - BUTTON_SIZE / 2,
                                        y: y - BUTTON_SIZE / 2,
                                        opacity: 1,
                                        scale: isActive || option.isSelected ? 1.2 : 1
                                    }}
                                    style={{
                                        width: BUTTON_SIZE,
                                        height: BUTTON_SIZE,
                                        pointerEvents: 'auto', // Allow clicks
                                        cursor: 'pointer'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent propagation to canvas
                                        option.action();
                                    }}
                                >
                                    <div className={`
                    absolute  whitespace-nowrap text-xs font-bold px-2 py-0.5 rounded
                    transition-all duration-200 pointer-events-none select-none
                    ${isActive ? 'opacity-100 bg-black/70 text-white' : 'opacity-0'}
                  `}
                                        style={{
                                            top: -24,
                                            userSelect: 'none',
                                            WebkitUserSelect: 'none'
                                        }}
                                    >
                                        {option.label}
                                    </div>

                                    {/* Icon Circle / Teardrop */}
                                    <div
                                        className={`
                      w-full h-full flex items-center justify-center shadow-lg border-2
                      transition-all duration-200
                      ${isActive
                                                ? 'bg-white border-blue-500 text-blue-600'
                                                : option.isSelected
                                                    ? 'bg-slate-800 border-white text-white ring-2 ring-white ring-offset-2 ring-offset-slate-900/50 shadow-2xl scale-110' // Distinct selection style
                                                    : 'bg-slate-900/95 border-slate-700 text-slate-300'
                                            }
                    `}
                                        style={{
                                            borderRadius: '50% 50% 50% 0', // Teardrop pointing bottom-left
                                            transform: `rotate(${rotation}deg)`,
                                            // For non-color picker, we might still want colors. 
                                            // But for color-picker, user wants consistent dark background on teardrop.
                                            backgroundColor: (option.id.startsWith('color-') || option.id.startsWith('mode-')) && !isActive
                                                ? undefined // Use CSS classes for dark background
                                                : (option.color && !isActive ? option.color : undefined),
                                            borderColor: isActive ? (option.color || '#3b82f6') : (option.isSelected ? '#ffffff' : undefined),
                                            color: option.color && !isActive ? '#fff' : undefined,
                                            backdropFilter: 'blur(8px)'
                                        }}
                                    >
                                        <div style={{ transform: `rotate(${-rotation}deg)` }} className="flex items-center justify-center">
                                            {option.color && option.id.startsWith('color-') ? (
                                                <div
                                                    className={`w-7 h-7 rounded-full shadow-inner border transition-transform duration-200
                                                        ${option.isSelected ? 'border-white scale-110' : 'border-white/20'}`}
                                                    style={{
                                                        backgroundColor: option.color,
                                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(255,255,255,0.1)'
                                                    }}
                                                />
                                            ) : (
                                                <option.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
});

CircularMenu.displayName = 'CircularMenu';
