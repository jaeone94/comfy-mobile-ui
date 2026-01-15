import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Cable, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import { checkNodeCompatibility } from '@/shared/utils/nodeCompatibility';
import { getSlotColor } from '@/shared/utils/rendering/CanvasRendererService';

interface SlotInfo {
    name: string;
    type: string;
    index: number;
}

interface DirectConnectionPanelProps {
    isVisible: boolean;
    sourceNode: WorkflowNode | null;
    targetNode: WorkflowNode | null;
    workflow: any; // Used to find existing links
    onClose: () => void;
    onApply: (updates: {
        toAdd: { sourceNodeId: number, targetNodeId: number, sourceSlot: number, targetSlot: number }[],
        toRemove: number[]
    }) => void;
}

interface LinkDraft {
    id: string | number; // String for new draft links, Number for existing linkIds
    sourceSlot: number;
    targetSlot: number;
    type: string;
    isNew?: boolean;
}

export const DirectConnectionPanel: React.FC<DirectConnectionPanelProps> = ({
    isVisible,
    sourceNode,
    targetNode,
    workflow,
    onClose,
    onApply,
}) => {
    const { t } = useTranslation();
    const [draftLinks, setDraftLinks] = useState<LinkDraft[]>([]);
    const [activeDrag, setActiveDrag] = useState<{
        startSlot: number;
        startType: string;
        fromSource: boolean;
        currentX: number;
        currentY: number;
    } | null>(null);

    // Track scroll to update SVG positions
    const [scrollTick, setScrollTick] = useState(0);
    const onScroll = () => setScrollTick(prev => prev + 1);

    const containerRef = useRef<HTMLDivElement>(null);
    const leftSlotsRef = useRef<(HTMLDivElement | null)[]>([]);
    const rightSlotsRef = useRef<(HTMLDivElement | null)[]>([]);

    // Initialize links on open
    useEffect(() => {
        if (isVisible && sourceNode && targetNode && workflow?.workflow_json?.links) {
            const existing = (workflow.workflow_json.links as any[]).filter(
                link => link[1] === sourceNode.id && link[3] === targetNode.id
            ).map(link => ({
                id: link[0],
                sourceSlot: link[2],
                targetSlot: link[4],
                type: link[5],
                isNew: false
            }));
            setDraftLinks(existing);

            // Force a re-calculation after DOM is ready
            setTimeout(() => {
                onScroll();
            }, 100);
        } else {
            setDraftLinks([]);
        }
        setActiveDrag(null);
    }, [isVisible, sourceNode, targetNode, workflow]);

    // Compatibility helper
    const compatibility = useMemo(() => {
        if (!sourceNode || !targetNode) return null;
        return checkNodeCompatibility(sourceNode, targetNode);
    }, [sourceNode, targetNode]);

    if (!sourceNode || !targetNode || !isVisible) return null;

    const sourceOutputs = sourceNode.outputs || [];
    const targetInputs = targetNode.inputs || [];

    // Helper to get node background color (logic from NodeDetailModal)
    const getEffectiveBgColor = (node: WorkflowNode) => {
        const nodeAny = node as any;
        const currentMode = nodeAny.mode || 0;
        const isMuted = currentMode === 2;
        const isBypassed = currentMode === 4;
        const baseColor = (nodeAny.bgcolor || nodeAny.color || (nodeAny.properties?.['Node Color'])) || '#374151';

        if (isMuted) return '#3b82f6';
        if (isBypassed) return '#9333ea';
        return baseColor;
    };

    const sourceBgColor = getEffectiveBgColor(sourceNode);
    const targetBgColor = getEffectiveBgColor(targetNode);

    // Bezier curve calculation
    const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
        const cp1x = x1 + (x2 - x1) * 0.4;
        const cp2x = x1 + (x2 - x1) * 0.6;
        return `M ${x1} ${y1} C ${cp1x} ${y1} ${cp2x} ${y2} ${x2} ${y2}`;
    };

    const handleApply = () => {
        const originalLinks = (workflow.workflow_json.links as any[]).filter(
            link => link[1] === sourceNode.id && link[3] === targetNode.id
        );
        const originalIds = originalLinks.map(l => l[0]);

        const toRemove = originalIds.filter(id => !draftLinks.find(d => d.id === id));
        const toAdd = draftLinks
            .filter(d => d.isNew)
            .map(d => ({
                sourceNodeId: sourceNode.id,
                targetNodeId: targetNode.id,
                sourceSlot: d.sourceSlot,
                targetSlot: d.targetSlot
            }));

        onApply({ toAdd, toRemove });
    };

    const getSlotPosition = (slotIndex: number, isSource: boolean) => {
        const refArray = isSource ? leftSlotsRef.current : rightSlotsRef.current;
        const el = refArray[slotIndex];
        if (!el || !containerRef.current) return { x: 0, y: 0 };

        const containerRect = containerRef.current.getBoundingClientRect();
        const rect = el.getBoundingClientRect();

        // Find the scrollable container to clamp Y position
        const scrollableContainer = el.closest('.custom-scrollbar');
        let centerY = rect.top + rect.height / 2 - containerRect.top;

        if (scrollableContainer) {
            const scrollRect = scrollableContainer.getBoundingClientRect();
            const minY = scrollRect.top - containerRect.top;
            const maxY = scrollRect.bottom - containerRect.top;
            // Clamp within the scrollable viewport bounds
            centerY = Math.max(minY, Math.min(maxY, centerY));
        }

        return {
            x: rect.left + rect.width / 2 - containerRect.left,
            y: centerY
        };
    };

    // Drag Handlers
    const onDragStart = (e: React.TouchEvent | React.MouseEvent, index: number, type: string, fromSource: boolean) => {
        // Prevent default browser behavior like text selection during drag
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };

        setActiveDrag({
            startSlot: index,
            startType: type,
            fromSource,
            currentX: clientX - containerRect.left,
            currentY: clientY - containerRect.top
        });
    };

    const onDragMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!activeDrag) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };

        setActiveDrag(prev => prev ? ({
            ...prev,
            currentX: clientX - containerRect.left,
            currentY: clientY - containerRect.top
        }) : null);
    };

    const onDragEnd = (e: React.TouchEvent | React.MouseEvent) => {
        if (!activeDrag) return;

        const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY;

        // Hit test
        const targetEl = document.elementFromPoint(clientX, clientY);
        const slotEl = targetEl?.closest('[data-slot-index]');

        if (slotEl) {
            const targetIndex = parseInt(slotEl.getAttribute('data-slot-index') || '0');
            const isTargetNode = slotEl.getAttribute('data-is-source') === (activeDrag.fromSource ? 'false' : 'true');

            if (isTargetNode) {
                const sourceSlot = activeDrag.fromSource ? activeDrag.startSlot : targetIndex;
                const targetSlot = activeDrag.fromSource ? targetIndex : activeDrag.startSlot;
                const sourceType = activeDrag.fromSource ? activeDrag.startType : sourceOutputs[targetIndex].type;
                const targetType = activeDrag.fromSource ? targetInputs[targetIndex].type : activeDrag.startType;

                // Check compatibility
                if (sourceType === targetType || sourceType === '*' || targetType === '*') {
                    // Remove existing link on the target slot if any (batch-like behavior)
                    setDraftLinks(prev => {
                        const base = prev.filter(l => l.targetSlot !== targetSlot);
                        return [...base, {
                            id: `draft-${Date.now()}`,
                            sourceSlot,
                            targetSlot,
                            type: sourceType,
                            isNew: true
                        }];
                    });
                }
            }
        } else {
            // Disconnect if dragged to empty space from an existing line
            // Actually handle disconnect by finding if we were dragging "from" an existing link end
        }

        setActiveDrag(null);
    };

    const removeDraftLink = (linkId: string | number) => {
        setDraftLinks(prev => prev.filter(l => l.id !== linkId));
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center pwa-modal overflow-hidden">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={onClose}
                />

                {/* Interaction Panel */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full h-full flex flex-col pointer-events-auto select-none touch-none overflow-hidden"
                    onTouchMove={onDragMove}
                    onMouseMove={onDragMove}
                    onTouchEnd={onDragEnd}
                    onMouseUp={onDragEnd}
                >
                    {/* Header - Fixed Height */}
                    <div className="px-8 py-6 flex-shrink-0 flex items-center justify-between">
                        <div className="flex items-center space-x-4 min-w-0 flex-1">
                            <div className="p-3 bg-blue-500 rounded-2xl shadow-lg ring-4 ring-blue-500/20 flex-shrink-0">
                                <Cable className="w-6 h-6 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-2xl font-black text-white tracking-tight truncate">{t('node.connectNodes')}</h2>
                                <div className="flex items-center space-x-2 text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">
                                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{sourceNode.type}</span>
                                    <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{targetNode.type}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        ref={containerRef}
                        className="flex-1 min-h-0 relative flex justify-between items-center px-4 overflow-hidden"
                    >
                        <div
                            className="w-[42%] max-w-[320px] h-[90%] rounded-r-[40px] border-y border-r border-white/10 shadow-2xl flex flex-col py-8 pl-6 pr-2 relative overflow-hidden -ml-4"
                            style={{ backgroundColor: sourceBgColor }}
                        >
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-black/20" />
                            <div className="mb-6">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">{t('node.sourceOutputs')}</span>
                                <h3 className="text-lg font-bold text-white/90 line-clamp-2 break-all">{sourceNode.title || sourceNode.type}</h3>
                            </div>
                            <div
                                className={`flex-1 ${activeDrag ? 'overflow-hidden' : 'overflow-y-auto'} custom-scrollbar flex flex-col justify-center`}
                                style={{ gap: sourceOutputs.length > 8 ? '8px' : '16px' }}
                                onScroll={onScroll}
                            >
                                {sourceOutputs.map((output, idx) => {
                                    const isCompatible = activeDrag
                                        ? (!activeDrag.fromSource && (activeDrag.startType === output.type || activeDrag.startType === '*' || output.type === '*'))
                                        : true;
                                    const isDisabled = activeDrag && activeDrag.fromSource === false && !isCompatible;

                                    return (
                                        <div
                                            key={idx}
                                            data-slot-index={idx}
                                            data-is-source="true"
                                            className={`flex items-center justify-between group transition-all shrink-0 ${isDisabled ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
                                        >
                                            <span className={`text-[11px] font-bold text-white/70 group-hover:text-white transition-colors line-clamp-2 break-all flex-1 min-w-0 mr-2 text-right ${activeDrag ? 'pointer-events-none' : ''}`}>{output.name}</span>
                                            <div
                                                ref={el => { leftSlotsRef.current[idx] = el; }}
                                                onMouseDown={(e) => onDragStart(e, idx, output.type, true)}
                                                onTouchStart={(e) => onDragStart(e, idx, output.type, true)}
                                                className={`w-10 h-10 rounded-full bg-white/10 border-4 border-[#374151] flex flex-shrink-0 items-center justify-center cursor-crosshair active:scale-90 transition-all hover:bg-white/20 ${activeDrag ? 'pointer-events-none' : ''}`}
                                            >
                                                <div
                                                    className="w-3 h-3 rounded-full pointer-events-none"
                                                    style={{
                                                        backgroundColor: getSlotColor(output.type),
                                                        boxShadow: `0 0 10px ${getSlotColor(output.type)}80`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div
                            className="w-[42%] max-w-[320px] h-[90%] rounded-l-[40px] border-y border-l border-white/10 shadow-2xl flex flex-col py-8 pr-6 pl-2 relative overflow-hidden -mr-4"
                            style={{ backgroundColor: targetBgColor }}
                        >
                            <div className="absolute top-0 right-0 w-1.5 h-full bg-black/20" />
                            <div className="mb-6 text-right">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">{t('node.targetInputs')}</span>
                                <h3 className="text-lg font-bold text-white/90 line-clamp-2 break-all">{targetNode.title || targetNode.type}</h3>
                            </div>
                            <div
                                className={`flex-1 ${activeDrag ? 'overflow-hidden' : 'overflow-y-auto'} custom-scrollbar flex flex-col justify-center`}
                                style={{ gap: targetInputs.length > 8 ? '8px' : '16px' }}
                                onScroll={onScroll}
                            >
                                {targetInputs.map((input, idx) => {
                                    const isCompatible = activeDrag
                                        ? (activeDrag.fromSource && (activeDrag.startType === input.type || activeDrag.startType === '*' || input.type === '*'))
                                        : true;
                                    const isDisabled = activeDrag && activeDrag.fromSource === true && !isCompatible;

                                    return (
                                        <div
                                            key={idx}
                                            data-slot-index={idx}
                                            data-is-source="false"
                                            className={`flex items-center justify-between group transition-all shrink-0 ${isDisabled ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
                                        >
                                            <div
                                                ref={el => { rightSlotsRef.current[idx] = el; }}
                                                onMouseDown={(e) => onDragStart(e, idx, input.type, false)}
                                                onTouchStart={(e) => onDragStart(e, idx, input.type, false)}
                                                className={`w-10 h-10 rounded-full bg-white/10 border-4 border-[#374151] flex flex-shrink-0 items-center justify-center cursor-crosshair active:scale-90 transition-all hover:bg-white/20 ${activeDrag ? 'pointer-events-none' : ''}`}
                                            >
                                                <div
                                                    className="w-3 h-3 rounded-full pointer-events-none"
                                                    style={{
                                                        backgroundColor: getSlotColor(input.type),
                                                        boxShadow: `0 0 10px ${getSlotColor(input.type)}80`
                                                    }}
                                                />
                                            </div>
                                            <span className={`text-[11px] font-bold text-white/70 group-hover:text-white transition-colors line-clamp-2 break-all flex-1 min-w-0 ml-2 text-left ${activeDrag ? 'pointer-events-none' : ''}`}>{input.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* SVG Layer for Cables - MOVED TO TOP */}
                        <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-hidden z-[10]">
                            <defs>
                                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>

                            {/* Existing & Draft Links */}
                            {draftLinks.map((link) => {
                                const start = getSlotPosition(link.sourceSlot, true);
                                const end = getSlotPosition(link.targetSlot, false);
                                return (
                                    <g key={link.id} className="cursor-pointer pointer-events-auto" onClick={() => removeDraftLink(link.id)}>
                                        <path
                                            d={getBezierPath(start.x, start.y, end.x, end.y)}
                                            stroke="white"
                                            strokeWidth="6"
                                            strokeOpacity="0.05"
                                            fill="none"
                                        />
                                        <motion.path
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: 1 }}
                                            d={getBezierPath(start.x, start.y, end.x, end.y)}
                                            stroke={getSlotColor(link.type)}
                                            strokeWidth="3.5"
                                            fill="none"
                                            className="drop-shadow-lg"
                                            style={{ filter: 'url(#glow)' }}
                                        />
                                        {/* Interaction helper (invisible thick line) */}
                                        <path
                                            d={getBezierPath(start.x, start.y, end.x, end.y)}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            fill="none"
                                        />
                                    </g>
                                );
                            })}

                            {/* Active Drag Line */}
                            {activeDrag && (
                                <path
                                    d={getBezierPath(
                                        activeDrag.fromSource ? getSlotPosition(activeDrag.startSlot, true).x : activeDrag.currentX,
                                        activeDrag.fromSource ? getSlotPosition(activeDrag.startSlot, true).y : activeDrag.currentY,
                                        activeDrag.fromSource ? activeDrag.currentX : getSlotPosition(activeDrag.startSlot, false).x,
                                        activeDrag.fromSource ? activeDrag.currentY : getSlotPosition(activeDrag.startSlot, false).y
                                    )}
                                    stroke={getSlotColor(activeDrag.startType)}
                                    strokeWidth="3"
                                    strokeDasharray="8 6"
                                    fill="none"
                                />
                            )}
                        </svg>
                    </div>

                    {/* Footer Actions - Fixed Bottom */}
                    <div
                        className="px-8 pt-4 pb-12 flex-shrink-0 flex flex-col items-center space-y-4"
                        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="flex items-center justify-center space-x-6">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                className="h-14 px-10 rounded-[28px] bg-white/5 border-white/10 text-white font-bold hover:bg-white/10 active:scale-95 transition-all"
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                onClick={handleApply}
                                className="h-14 px-10 rounded-[28px] bg-blue-500 hover:bg-blue-600 text-white font-black shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center space-x-2"
                            >
                                <Check className="w-5 h-5" />
                                <span>{t('node.applyChanges')}</span>
                            </Button>
                        </div>

                        {/* Helpful Tip - Now integrated into the footer flow */}
                        <div className="flex items-center space-x-2 text-white/20 text-[10px] font-bold uppercase tracking-widest">
                            <HelpCircle className="w-3 h-3" />
                            <span>{t('node.tapCableToDisconnect')}</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
