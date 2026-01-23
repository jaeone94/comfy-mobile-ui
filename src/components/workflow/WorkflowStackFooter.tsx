import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Play,
    Square,
    X,
    Clock,
    Terminal,
    Search,
    Loader2,
    Brush,
    Dices
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { PromptHistoryContent } from '@/components/history/PromptHistory';
import type { LogEntry, LogsWsMessage } from '@/core/domain';
import { toast } from 'sonner';

interface WorkflowStackFooterProps {
    workflow: { id?: string; name?: string } | null;
    nodes: any[];
    onExecute: () => void;
    onInterrupt: () => void;
    onClearQueue: () => void;
    onRandomizeSeeds?: () => void;
    refreshQueueTrigger?: number;
}

export const WorkflowStackFooter: React.FC<WorkflowStackFooterProps> = ({
    workflow,
    nodes,
    onExecute,
    onInterrupt,
    onClearQueue,
    onRandomizeSeeds,
    refreshQueueTrigger
}) => {
    const { t } = useTranslation();
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [isClearingVRAM, setIsClearingVRAM] = useState(false);
    const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
    const [queueCount, setQueueCount] = useState<number>(0);
    const [isLoadingQueue, setIsLoadingQueue] = useState(false);

    const consoleContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { url: serverUrl } = useConnectionStore();

    // Search results filtering
    const searchResults = useMemo(() => {
        if (!searchValue.trim()) return [];
        const query = searchValue.toLowerCase();
        return nodes.filter(node =>
            (node.title?.toLowerCase() || '').includes(query) ||
            (node.type?.toLowerCase() || '').includes(query) ||
            node.id.toString().includes(query)
        ).slice(0, 5);
    }, [searchValue, nodes]);

    const handleNodeSelect = (nodeId: number) => {
        const element = document.getElementById(`node-${nodeId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-4', 'ring-blue-500/50');
            setTimeout(() => {
                element.classList.remove('ring-4', 'ring-blue-500/50');
            }, 2000);
        }
        setIsSearchOpen(false);
        setSearchValue('');
    };

    // Load initial queue status
    const loadQueueStatus = useCallback(async () => {
        setIsLoadingQueue(true);
        try {
            const queueInfo = await ComfyUIService.getQueueStatus();
            if (queueInfo && queueInfo.queue_pending) {
                setQueueCount(queueInfo.queue_pending.length);
            } else {
                setQueueCount(0);
            }
        } catch (error) {
            console.warn('⚠️ [WorkflowStackFooter] Failed to load queue status:', error);
            setQueueCount(0);
        } finally {
            setIsLoadingQueue(false);
        }
    }, []);

    useEffect(() => {
        loadQueueStatus();
    }, [loadQueueStatus, refreshQueueTrigger]);

    // WebSocket subscription for queue updates
    useEffect(() => {
        const handleStatusUpdate = (event: any) => {
            const { data } = event;
            if (data?.status?.exec_info?.queue_remaining !== undefined) {
                const totalCount = data.status.exec_info.queue_remaining;
                const pendingOnlyCount = totalCount >= 1 ? totalCount - 1 : 0;
                setQueueCount(pendingOnlyCount);
            }
        };

        const statusListenerId = globalWebSocketService.on('status', handleStatusUpdate);
        return () => {
            globalWebSocketService.offById('status', statusListenerId);
        };
    }, []);

    // Console logic
    const handleConsoleToggle = async () => {
        const newIsOpen = !isConsoleOpen;
        setIsConsoleOpen(newIsOpen);
        if (newIsOpen) {
            setIsHistoryOpen(false);
            setIsSearchOpen(false);
            try {
                await ComfyUIService.subscribeToLogsManually();
                const rawLogs = await ComfyUIService.getRawLogs();
                if (rawLogs.entries) setConsoleLogs(rawLogs.entries);
                setTimeout(() => {
                    if (consoleContainerRef.current) {
                        consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
                    }
                }, 100);
            } catch (error) {
                console.error('[WorkflowStackFooter] Console error:', error);
            }
        }
    };

    useEffect(() => {
        if (!isConsoleOpen) return;
        const handleLogs = (event: any) => {
            const logsData: LogsWsMessage = event.data || event;
            if (logsData.entries) {
                setConsoleLogs(prev => [...prev, ...logsData.entries]);
                setTimeout(() => {
                    if (consoleContainerRef.current) {
                        consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
                    }
                }, 10);
            }
        };
        ComfyUIService.on('logs', handleLogs);
        return () => ComfyUIService.off('logs', handleLogs);
    }, [isConsoleOpen]);

    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    const handleClearVRAM = async () => {
        setIsClearingVRAM(true);
        try {
            const success = await ComfyUIService.clearVRAM();
            if (success) {
                toast.success(t('common.vramCleared'));
            } else {
                toast.error(t('common.vramClearFailed'));
            }
        } catch (error) {
            toast.error(t('common.error'));
        } finally {
            setIsClearingVRAM(false);
        }
    };

    const handleClearQueueClick = () => {
        onClearQueue();
        setTimeout(loadQueueStatus, 500);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
            {/* Overlays */}
            <AnimatePresence>
                {isSearchOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="fixed bottom-[96px] left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 p-4"
                    >
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
                                <Search className="w-4 h-4 text-white/40" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    placeholder={t('workflow.searchNodesPlaceholder')}
                                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20"
                                />
                                {searchValue && (
                                    <button onClick={() => setSearchValue('')}>
                                        <X className="w-4 h-4 text-white/40" />
                                    </button>
                                )}
                            </div>

                            {searchResults.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    {searchResults.map((node: any) => (
                                        <button
                                            key={node.id}
                                            onClick={() => handleNodeSelect(node.id)}
                                            className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-blue-500/20 border border-white/5 transition-all text-left"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white/90">{node.title || node.type}</span>
                                                <span className="text-[10px] text-white/40 uppercase tracking-tight">{node.type}</span>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">#{node.id}</Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {isConsoleOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-[96px] left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        style={{ height: '40vh' }}
                    >
                        <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/5">
                            <div className="flex items-center gap-2 text-xs font-bold text-white/70">
                                <Terminal className="w-3.5 h-3.5" />
                                <span>{t('workflow.serverConsole')}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setIsConsoleOpen(false)} className="h-7 w-7 p-0 hover:bg-white/10">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div
                            ref={consoleContainerRef}
                            className="p-3 overflow-y-auto h-[calc(40vh-45px)] font-mono text-[10px] space-y-1 custom-scrollbar text-slate-100"
                        >
                            {consoleLogs.map((log, i) => (
                                <div key={i} className="py-0.5 leading-relaxed break-all whitespace-pre-wrap opacity-90">
                                    {log.m}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {isHistoryOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-[96px] left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        style={{ height: '60vh' }}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                            <div className="flex items-center gap-2 text-xs font-bold text-white/70">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{t('workflow.queue')}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setIsHistoryOpen(false)} className="h-7 w-7 p-0 hover:bg-white/10">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="h-[calc(60vh-60px)] overflow-y-auto p-4 custom-scrollbar">
                            <PromptHistoryContent isEmbedded={true} onClose={() => setIsHistoryOpen(false)} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer Bar */}
            <div className="p-3 bg-slate-900/40 backdrop-blur-3xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.4)] relative">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
                    {/* Left/Center: Centered in the area excluding Main Buttons */}
                    <div className="flex-1 flex justify-center">
                        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-[18px] border border-white/10">
                            {/* Search Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsSearchOpen(!isSearchOpen);
                                    setIsConsoleOpen(false);
                                    setIsHistoryOpen(false);
                                }}
                                className={`h-9 w-9 p-0 rounded-[14px] transition-all ${isSearchOpen ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                                title={t('workflow.searchNode')}
                            >
                                <Search className="h-4 w-4" />
                            </Button>

                            {/* Console Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleConsoleToggle}
                                className={`h-9 w-9 p-0 rounded-[14px] transition-all ${isConsoleOpen ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                                title={t('workflow.console')}
                            >
                                <Terminal className="h-4 w-4" />
                            </Button>

                            {/* Queue Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsHistoryOpen(!isHistoryOpen);
                                    setIsConsoleOpen(false);
                                    setIsSearchOpen(false);
                                }}
                                className={`h-9 w-9 p-0 rounded-[14px] transition-all ${isHistoryOpen ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                                title={t('workflow.queue')}
                            >
                                <Clock className="h-4 w-4" />
                            </Button>

                            {/* Random Seed Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onRandomizeSeeds}
                                className="h-9 w-9 p-0 rounded-[14px] text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                title={t('menu.randomizeSeeds')}
                            >
                                <Dices className="h-4 w-4" />
                            </Button>

                            {/* Clear VRAM Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearVRAM}
                                disabled={isClearingVRAM}
                                className="h-9 w-9 p-0 rounded-[14px] text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                title={t('common.clearVRAM')}
                            >
                                {isClearingVRAM ? <Loader2 className="h-4 w-4 animate-spin text-red-500" /> : <Brush className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    {/* Right: Primary Actions (Shrink to content) */}
                    <div className="flex items-center gap-2 shrink-0 pr-5">
                        <Button
                            onClick={onExecute}
                            size="icon"
                            className="h-10 w-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center"
                            title={t('workflow.execute')}
                        >
                            <Play className="w-5 h-5 fill-current" />
                        </Button>

                        <Button
                            onClick={onInterrupt}
                            variant="outline"
                            className="h-10 w-10 rounded-xl bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-white transition-all active:scale-95 p-0 flex items-center justify-center"
                        >
                            <Square className="w-4 h-4 fill-current" />
                        </Button>

                        <div className="relative">
                            <Button
                                onClick={handleClearQueueClick}
                                variant="outline"
                                className="h-10 w-10 rounded-xl bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 p-0 flex items-center justify-center"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                            {queueCount > 0 && (
                                <Badge className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 bg-red-500 text-white border-2 border-slate-900 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg">
                                    {queueCount > 99 ? '99+' : queueCount}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
