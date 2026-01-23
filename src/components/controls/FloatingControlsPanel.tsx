import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Clock, Search, Maximize2, Move, RefreshCw, Terminal, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { usePromptHistoryStore } from '@/ui/store/promptHistoryStore';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import TriggerWordSelector from './TriggerWordSelector';
import { SettingsDropdownContent } from './SettingsDropdown';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { PromptHistoryContent } from '@/components/history/PromptHistory';
import type { LogEntry, LogsWsMessage } from '@/core/domain';
import type { MissingModelInfo } from '@/services/MissingModelsService';
import { useNavigate, useParams } from 'react-router-dom';


interface SearchableNode {
  id: number;
  type: string;
  title?: string;
}

interface FloatingControlsPanelProps {
  onRandomizeSeeds?: (isForceRandomize: boolean) => void;
  onShowGroupModer?: () => void;
  onShowWorkflowSnapshots?: () => void;
  onSearchNode?: (nodeId: string) => void;
  onNavigateToNode?: (nodeId: number) => void;
  onSelectNode?: (node: any) => void;
  onOpenNodePanel?: () => void;
  onZoomFit?: () => void;
  onShowWorkflowJson?: () => void;
  onShowObjectInfo?: () => void;
  onRefreshWorkflow?: () => void;
  // Node search enhancement
  nodes?: SearchableNode[];
  nodeBounds?: Map<number, any>;
  missingNodesCount?: number;
  installablePackageCount?: number;
  onShowMissingNodeInstaller?: () => void;
  missingModels?: MissingModelInfo[];
  onOpenMissingModelDetector?: () => void;
  // Repositioning mode controls (for passing to SettingsDropdown)
  repositionMode?: {
    isActive: boolean;
  };
  onToggleRepositionMode?: () => void;
  // Connection mode controls (for passing to SettingsDropdown)
  connectionMode?: {
    isActive: boolean;
  };
  onToggleConnectionMode?: () => void;
}

export const FloatingControlsPanel: React.FC<FloatingControlsPanelProps> = ({
  onRandomizeSeeds,
  onShowGroupModer,
  onShowWorkflowSnapshots,
  onSearchNode,
  onNavigateToNode,
  onSelectNode,
  onOpenNodePanel,
  onZoomFit,
  onShowWorkflowJson,
  onShowObjectInfo,
  onRefreshWorkflow,
  nodes = [],
  nodeBounds,
  missingNodesCount = 0,
  installablePackageCount = 0,
  onShowMissingNodeInstaller,
  missingModels = [],
  onOpenMissingModelDetector,
  repositionMode,
  onToggleRepositionMode,
  connectionMode,
  onToggleConnectionMode,
}) => {
  const [isClearingVRAM, setIsClearingVRAM] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<SearchableNode[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const [isTriggerWordSelectorOpen, setIsTriggerWordSelectorOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const consolePanelRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const consoleContainerRef = useRef<HTMLDivElement>(null);

  const [panelYOffsets, setPanelYOffsets] = useState({
    settings: 0,
    search: 0,
    console: 0,
    history: 0
  });
  const [windowHeight, setWindowHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 0);

  // Update window height on resize
  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Smart positioning for side panels
  useLayoutEffect(() => {
    const adjustPanel = (isOpen: boolean, ref: React.RefObject<HTMLDivElement | null>, key: keyof typeof panelYOffsets) => {
      if (isOpen && ref.current) {
        // Measure the panel's current position
        const rect = ref.current.getBoundingClientRect();
        const padding = 16;
        let offset = 0;

        // If bottom overflows viewport
        if (rect.bottom > windowHeight - padding) {
          offset = -(rect.bottom - (windowHeight - padding));
        }

        // Ensure we don't push it above the top of the screen
        if (rect.top + offset < padding) {
          offset = padding - rect.top;
        }

        if (offset !== 0) {
          setPanelYOffsets(prev => ({ ...prev, [key]: offset }));
        }
      } else {
        setPanelYOffsets(prev => ({ ...prev, [key]: 0 }));
      }
    };

    adjustPanel(isSettingsOpen, settingsDropdownRef, 'settings');
    adjustPanel(isSearchOpen, searchPanelRef, 'search');
    adjustPanel(isConsoleOpen, consolePanelRef, 'console');
    adjustPanel(isHistoryOpen, historyPanelRef, 'history');
  }, [isSettingsOpen, isSearchOpen, isConsoleOpen, isHistoryOpen, windowHeight]);
  const navigate = useNavigate();
  const { openPromptHistory } = usePromptHistoryStore();
  const { id } = useParams<{ id: string }>();
  const { url: serverUrl } = useConnectionStore();
  const { t } = useTranslation();

  const handleStackViewClick = () => {
    if (id) {
      navigate(`/workflow-stack/${id}`);
    }
  };

  // Advanced search function with scoring
  const searchNodes = (query: string): SearchableNode[] => {
    if (!query.trim()) return [];

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    const scoredNodes = nodes.map((node) => {
      let totalScore = 0;

      const nodeId = String(node.id).toLowerCase();
      const nodeType = node.type.toLowerCase();
      const nodeTitle = (node.title || '').toLowerCase();

      searchTerms.forEach(term => {
        // ID exact match (highest priority)
        if (nodeId === term) {
          totalScore += 1000;
        } else if (nodeId.includes(term)) {
          totalScore += 500;
        }

        // Type matching
        if (nodeType === term) {
          totalScore += 800;
        } else if (nodeType.includes(term)) {
          totalScore += 400;
        }

        // Title matching
        if (nodeTitle === term) {
          totalScore += 600;
        } else if (nodeTitle.includes(term)) {
          totalScore += 300;
        }

        // Word boundary matches (more natural)
        const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (wordBoundaryRegex.test(nodeType)) {
          totalScore += 200;
        }
        if (wordBoundaryRegex.test(nodeTitle)) {
          totalScore += 150;
        }
      });

      return { ...node, score: totalScore };
    });

    return scoredNodes
      .filter(node => node.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Limit to top 10 results
  };

  // Update search results when search value changes
  useEffect(() => {
    const results = searchNodes(searchValue);
    setSearchResults(results);
    setSelectedResultIndex(-1);
  }, [searchValue, nodes]);

  // Close dropdowns when clicking/touching outside
  useEffect(() => {
    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Check if click is inside both settings button AND settings dropdown
      const isOutsideSettings = settingsRef.current && !settingsRef.current.contains(target);
      const isOutsideDropdown = settingsDropdownRef.current && !settingsDropdownRef.current.contains(target);

      // Check for PWA modals or overlays to prevent closing panels when interacting with child modals
      const modalElement = (target as HTMLElement).closest('.pwa-modal, [data-radix-portal], .radix-portal');
      if (modalElement) return;

      if (isOutsideSettings && isOutsideDropdown) {
        setIsSettingsOpen(false);
      }

      // For search, check both the search button and the search panel
      const isOutsideSearchButton = searchRef.current && !searchRef.current.contains(target);
      const searchPanel = document.querySelector('[data-search-panel]');
      const isOutsideSearchPanel = searchPanel && !searchPanel.contains(target);

      if (isOutsideSearchButton && isOutsideSearchPanel) {
        setIsSearchOpen(false);
        setSearchValue('');
        setSearchResults([]);
        setSelectedResultIndex(-1);
      }

      // For console, check both the console button and the console panel
      const isOutsideConsoleButton = consoleRef.current && !consoleRef.current.contains(target);
      const consolePanel = document.querySelector('[data-console-panel]');
      const isOutsideConsolePanel = consolePanel && !consolePanel.contains(target);

      if (isOutsideConsoleButton && isOutsideConsolePanel) {
        setIsConsoleOpen(false);
      }

      // For history, check both the history button and the history panel
      const isOutsideHistoryButton = historyRef.current && !historyRef.current.contains(target);
      const historyPanel = document.querySelector('[data-history-panel]');
      const isOutsideHistoryPanel = historyPanel && !historyPanel.contains(target);

      if (isOutsideHistoryButton && isOutsideHistoryPanel) {
        setIsHistoryOpen(false);
      }
    };

    if (isSettingsOpen || isSearchOpen || isConsoleOpen || isHistoryOpen) {
      // Add both mouse and touch event listeners for better mobile support
      document.addEventListener('mousedown', handleOutsideInteraction);
      document.addEventListener('touchstart', handleOutsideInteraction);

      return () => {
        document.removeEventListener('mousedown', handleOutsideInteraction);
        document.removeEventListener('touchstart', handleOutsideInteraction);
      };
    }
  }, [isSettingsOpen, isSearchOpen, isConsoleOpen, isHistoryOpen]);

  // Focus search input when search opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Handle console toggle and log subscription
  const handleConsoleToggle = async () => {
    const newIsOpen = !isConsoleOpen;
    setIsConsoleOpen(newIsOpen);

    if (newIsOpen) {
      // Close search when opening console
      setIsSearchOpen(false);
      setSearchValue('');
      setSearchResults([]);
      setSelectedResultIndex(-1);

      // Subscribe to logs and fetch initial logs
      try {
        // Subscribe to logs
        await ComfyUIService.subscribeToLogsManually();

        // Fetch initial logs
        const rawLogs = await ComfyUIService.getRawLogs();
        if (rawLogs.entries && rawLogs.entries.length > 0) {
          setConsoleLogs(rawLogs.entries);
        }

        // Auto-scroll to bottom after loading
        setTimeout(() => {
          if (consoleContainerRef.current) {
            consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
          }
        }, 100);
      } catch (error) {
        console.error('[FloatingControlsPanel] Failed to load console logs:', error);
      }
    }
  };

  // Listen to real-time log events
  useEffect(() => {
    if (!isConsoleOpen) return;

    const handleLogsMessage = (event: any) => {
      const logsData: LogsWsMessage = event.data || event;

      if (logsData.entries && logsData.entries.length > 0) {
        setConsoleLogs(prev => [...prev, ...logsData.entries]);

        // Auto-scroll to bottom
        setTimeout(() => {
          if (consoleContainerRef.current) {
            consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
          }
        }, 10);
      }
    };

    ComfyUIService.on('logs', handleLogsMessage);

    return () => {
      ComfyUIService.off('logs', handleLogsMessage);
    };
  }, [isConsoleOpen]);

  const handleClearVRAM = async () => {
    setIsClearingVRAM(true);
    try {
      const ComfyUIService = (await import('@/infrastructure/api/ComfyApiClient')).default;
      const success = await ComfyUIService.clearVRAM();

      if (success) {
        const { toast } = await import('sonner');
        toast.success(t('common.vramCleared'), {
          description: t('common.vramClearedDesc'),
          duration: 3000,
        });
      } else {
        const { toast } = await import('sonner');
        toast.error(t('common.vramClearFailed'), {
          description: t('common.vramClearFailedDesc'),
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error clearing VRAM:', error);
      const { toast } = await import('sonner');
      toast.error(t('common.error'), {
        description: t('common.vramErrorDesc'),
        duration: 5000,
      });
    } finally {
      setIsClearingVRAM(false);
      setIsSettingsOpen(false);
    }
  };



  const handleShowWorkflowSnapshots = () => {
    if (onShowWorkflowSnapshots) {
      onShowWorkflowSnapshots();
      setIsSettingsOpen(false);
    }
  };

  const handleShowGroupModer = () => {
    if (onShowGroupModer) {
      onShowGroupModer();
      setIsSettingsOpen(false);
    }
  };

  const handleShowPromptHistory = () => {
    setIsHistoryOpen(!isHistoryOpen);
    if (!isHistoryOpen) {
      setIsSearchOpen(false);
      setIsConsoleOpen(false);
      setIsSettingsOpen(false);
    }
  };

  const handleShowWorkflowJson = () => {
    if (onShowWorkflowJson) {
      onShowWorkflowJson();
      setIsSettingsOpen(false);
    }
  };

  const handleShowObjectInfo = () => {
    if (onShowObjectInfo) {
      onShowObjectInfo();
      setIsSettingsOpen(false);
    }
  };

  const handleShowTriggerWordSelector = () => {
    setIsTriggerWordSelectorOpen(true);
    setIsSettingsOpen(false);
  };

  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchValue('');
      setSearchResults([]);
      setSelectedResultIndex(-1);
    }
    // Close console and history when opening search
    if (!isSearchOpen) {
      setIsConsoleOpen(false);
      setIsHistoryOpen(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // If there are search results and one is selected, navigate to it
    if (searchResults.length > 0) {
      const targetIndex = selectedResultIndex >= 0 ? selectedResultIndex : 0;
      const targetNode = searchResults[targetIndex];
      if (onNavigateToNode) {
        onNavigateToNode(targetNode.id);
        setIsSearchOpen(false);
        setSearchValue('');
        setSearchResults([]);
        setSelectedResultIndex(-1);
        return;
      }
    }

    // Fallback to original behavior for backward compatibility
    if (searchValue.trim() && onSearchNode) {
      onSearchNode(searchValue.trim());
      setIsSearchOpen(false);
      setSearchValue('');
      setSearchResults([]);
      setSelectedResultIndex(-1);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchValue('');
      setSearchResults([]);
      setSelectedResultIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex(prev =>
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex(prev => prev > 0 ? prev - 1 : -1);
    }
  };

  const handleResultSelect = (node: SearchableNode) => {
    if (onNavigateToNode) {
      onNavigateToNode(node.id);

      // Find and select the node (same pattern as NodeParameterEditor)
      if (onSelectNode && nodeBounds) {
        console.log('🔍 [FloatingControlsPanel] Searching for node:', node.id);
        console.log('🔍 [FloatingControlsPanel] Available nodeBounds:', Array.from(nodeBounds.keys()));

        const nodeBound = nodeBounds.get(node.id);
        console.log('🔍 [FloatingControlsPanel] Found nodeBound:', nodeBound);

        const targetNode = nodeBound?.node;
        console.log('🔍 [FloatingControlsPanel] Target node:', targetNode);

        if (targetNode) {
          console.log('🔍 [FloatingControlsPanel] Will select node after 300ms delay');
          setTimeout(() => {
            console.log('🔍 [FloatingControlsPanel] Selecting node now:', targetNode);
            onSelectNode(targetNode);

            // Open NodeInspector panel
            if (onOpenNodePanel) {
              console.log('🔍 [FloatingControlsPanel] Opening NodeInspector panel');
              onOpenNodePanel();
            }
          }, 300); // Wait for animation to center the node first
        } else {
          console.warn('🚨 [FloatingControlsPanel] Node not found in nodeBounds');
        }
      } else {
        console.warn('🚨 [FloatingControlsPanel] Missing onSelectNode or nodeBounds');
      }

      setIsSearchOpen(false);
      setSearchValue('');
      setSearchResults([]);
      setSelectedResultIndex(-1);
    }
  };

  return (
    <div
      className="fixed right-3 z-40 pwa-header"
      style={{
        top: '50%',
        transform: 'translateY(-50%)'
      }}
    >
      <div className="bg-slate-600/40 backdrop-blur-3xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/30 p-1 relative overflow-hidden">
        {/* Workflow Controls Container */}
        <div className="flex flex-col items-center space-y-1 relative z-10">

          {/* Search Node Button */}
          <div className="relative" ref={searchRef}>
            <Button
              onClick={handleSearchToggle}
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 rounded-lg hover:bg-white/20 transition-all ${isSearchOpen ? 'bg-white/20 text-white' : 'text-slate-100 hover:text-white'
                }`}
              title={t('workflow.searchNode')}
            >
              <Search className="h-4 w-4" />
            </Button>

          </div>

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Refresh Workflow Button */}
          {onRefreshWorkflow && (
            <Button
              onClick={onRefreshWorkflow}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-100 hover:text-white hover:bg-white/20 rounded-lg transition-all"
              title={t('workflow.refreshSlots')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Fit to Screen Button */}
          {onZoomFit && (
            <>
              <Button
                onClick={onZoomFit}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-100 hover:text-white hover:bg-white/20 rounded-lg transition-all"
                title={t('workflow.fitToScreen')}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Queue Button */}
          <div className="relative" ref={historyRef}>
            <Button
              onClick={handleShowPromptHistory}
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 transition-all rounded-lg ${isHistoryOpen ? 'bg-white/20 text-white' : 'text-slate-100 hover:text-white hover:bg-white/20'
                }`}
              title={t('workflow.queue')}
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Console Button */}
          <div className="relative" ref={consoleRef}>
            <Button
              onClick={handleConsoleToggle}
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 transition-all rounded-lg ${isConsoleOpen ? 'bg-white/20 text-white' : 'text-slate-100 hover:text-white hover:bg-white/20'
                }`}
              title={t('workflow.console')}
            >
              <Terminal className="h-4 w-4" />
            </Button>
          </div>

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Stack View Button */}
          <div className="relative">
            <Button
              onClick={handleStackViewClick}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 transition-all rounded-lg text-slate-100 hover:text-white hover:bg-white/20"
              title={t('menu.stackView')}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </div>

          {/* Divider */}
          <div className="h-px w-6 bg-white/10 mx-1" />

          {/* Settings Button with Dropdown */}
          <div className="relative" ref={settingsRef}>
            <Button
              onClick={() => {
                setIsSettingsOpen(!isSettingsOpen);
                // Close console when opening settings
                if (!isSettingsOpen) {
                  setIsConsoleOpen(false);
                }
              }}
              variant="ghost"
              size="sm"
              className="relative h-8 w-8 p-0 text-slate-100 hover:text-white hover:bg-white/20 rounded-lg transition-all"
              title={t('common.settings')}
            >
              <Settings
                className={`h-4 w-4 transition-transform duration-200 ${isSettingsOpen ? 'rotate-90' : ''
                  }`}
              />
              {/* Priority: Red for missing nodes, Yellow for missing models only */}
              {missingNodesCount > 0 ? (
                <span className="pointer-events-none absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_1.5px_rgba(15,23,42,0.8)] animate-pulse" />
              ) : missingModels.length > 0 ? (
                <span className="pointer-events-none absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-yellow-500 shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_1.5px_rgba(15,23,42,0.8)] animate-pulse" />
              ) : null}
            </Button>
          </div>
        </div>
      </div>


      {/* Settings Side Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            ref={settingsDropdownRef}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: panelYOffsets.settings }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-full top-0 mr-3 w-64 max-w-[calc(100vw-100px)] bg-slate-800/60 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden z-50"
          >
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 bg-white/5 pointer-events-none" />

            <div className="relative z-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <SettingsDropdownContent
                isClearingVRAM={isClearingVRAM}
                onShowGroupModer={handleShowGroupModer}
                onRandomizeSeeds={onRandomizeSeeds}
                onShowTriggerWordSelector={handleShowTriggerWordSelector}
                onShowWorkflowJson={handleShowWorkflowJson}
                onShowObjectInfo={handleShowObjectInfo}
                onShowWorkflowSnapshots={handleShowWorkflowSnapshots}
                onClearVRAM={handleClearVRAM}
                repositionMode={repositionMode}
                onToggleRepositionMode={onToggleRepositionMode}
                connectionMode={connectionMode}
                onToggleConnectionMode={onToggleConnectionMode}
                missingNodesCount={missingNodesCount}
                installablePackageCount={installablePackageCount}
                onShowMissingNodeInstaller={onShowMissingNodeInstaller}
                missingModels={missingModels}
                onOpenMissingModelDetector={onOpenMissingModelDetector}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Panel - Independent container below main controls */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            ref={searchPanelRef}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: panelYOffsets.search }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-full top-0 mr-3 w-80 max-w-[calc(100vw-100px)] bg-slate-800/60 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 p-4 z-50 overflow-hidden"
            data-search-panel
            style={{
              touchAction: 'pan-y pinch-zoom',
              overscrollBehaviorY: 'contain'
            } as React.CSSProperties}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 bg-white/5 pointer-events-none rounded-xl" />

            <div className="relative z-10">
              {/* Search Input */}
              <form onSubmit={handleSearchSubmit} className="mb-3">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t('workflow.searchNodesPlaceholder')}
                  className="w-full px-3 py-2 text-sm bg-white/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-600/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </form>

              {/* Search Results */}
              {searchValue.trim() && searchResults.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
                    {searchResults.length === 1
                      ? t('workflow.resultFound')
                      : t('workflow.resultsFound', { count: searchResults.length })}
                  </div>
                  <div
                    className="max-h-48 overflow-y-auto space-y-1 pr-1"
                    style={{
                      touchAction: 'pan-y pinch-zoom',
                      overscrollBehaviorY: 'contain'
                    } as React.CSSProperties}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchMove={(e) => {
                      e.stopPropagation();
                    }}
                    onWheel={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {searchResults.map((node, index) => (
                      <button
                        key={node.id}
                        onClick={() => handleResultSelect(node)}
                        className={`w-full text-left p-2 rounded-md transition-colors ${index === selectedResultIndex
                          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                          : 'hover:bg-white/40 dark:hover:bg-slate-700/50 bg-white/20 dark:bg-slate-800/20'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {node.title || node.type}
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 truncate">
                              ID: {node.id} • Type: {node.type}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                            #{node.id}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results Message */}
              {searchValue.trim() && searchResults.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-3">
                  {t('workflow.noNodesFound', { query: searchValue })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger Word Selector Modal */}
      <TriggerWordSelector
        isOpen={isTriggerWordSelectorOpen}
        onClose={() => setIsTriggerWordSelectorOpen(false)}
        serverUrl={serverUrl || 'http://localhost:8188'}
      />

      {/* Console Panel - Independent container below main controls */}
      <AnimatePresence>
        {isConsoleOpen && (
          <motion.div
            ref={consolePanelRef}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: panelYOffsets.console }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-full top-0 mr-3 w-96 max-w-[calc(100vw-100px)] bg-slate-800/60 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 p-4 z-50 overflow-hidden"
            data-console-panel
            style={{
              touchAction: 'pan-y pinch-zoom',
              overscrollBehaviorY: 'contain'
            } as React.CSSProperties}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 bg-white/5 pointer-events-none rounded-xl" />

            <div className="relative z-10">
              {/* Console Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('workflow.serverConsole')}
                </div>
                <Button
                  onClick={() => setConsoleLogs([])}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs hover:bg-white/60 dark:hover:bg-slate-700/60"
                >
                  {t('common.clear')}
                </Button>
              </div>

              {/* Console Logs */}
              <div
                ref={consoleContainerRef}
                className="h-96 overflow-y-auto space-y-1 px-3 py-2 bg-slate-900/90 dark:bg-slate-950/90 rounded-lg font-mono text-xs"
                style={{
                  touchAction: 'pan-y pinch-zoom',
                  overscrollBehaviorY: 'contain'
                } as React.CSSProperties}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchMove={(e) => {
                  e.stopPropagation();
                }}
                onWheel={(e) => {
                  e.stopPropagation();
                }}
              >
                {consoleLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                    {t('workflow.noLogs')}
                  </div>
                ) : (
                  consoleLogs.map((log, index) => (
                    <div
                      key={index}
                      className="py-0.5 text-slate-100 dark:text-slate-200 leading-relaxed break-all whitespace-pre-wrap"
                    >
                      {log.m}
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Side Panel */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            ref={historyPanelRef}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: panelYOffsets.history }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-full top-0 mr-3 w-96 max-w-[calc(100vw-100px)] h-[480px] bg-slate-800/60 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 p-4 z-50 overflow-hidden flex flex-col"
            data-history-panel
            style={{
              touchAction: 'pan-y pinch-zoom',
              overscrollBehaviorY: 'contain'
            } as React.CSSProperties}
          >
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 bg-white/5 pointer-events-none rounded-2xl" />

            <div className="relative z-10 flex flex-col h-full">
              <PromptHistoryContent
                isEmbedded={true}
                onClose={() => setIsHistoryOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

