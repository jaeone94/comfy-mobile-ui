import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Plus, Hash, Copy, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { NodeClipboardService, CopiedNode } from '@/services/NodeClipboardService';
import { toast } from 'sonner';

interface NodeType {
  name: string;
  display_name: string;
  description: string;
}

interface NodeAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: any | null;
  position: { canvasX: number; canvasY: number; worldX: number; worldY: number } | null;
  onNodeAdd?: (nodeType: string, nodeMetadata: any, position: { worldX: number; worldY: number }, initialValues?: Record<string, any>, size?: number[], title?: string) => void;
}

export const NodeAddModal: React.FC<NodeAddModalProps> = ({
  isOpen,
  onClose,
  graph,
  position,
  onNodeAdd
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(20); // Start with 20 items
  const [recentNodes, setRecentNodes] = useState<CopiedNode[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load recent nodes on mount
  useEffect(() => {
    if (isOpen) {
      setRecentNodes(NodeClipboardService.getNodes());
    }
  }, [isOpen]);

  // Extract node types from metadata
  const nodeTypes = useMemo(() => {
    if (!graph || !graph._metadata) {
      return [];
    }

    return Object.keys(graph._metadata).map(key => {
      const metadata = graph._metadata[key];
      return {
        name: key,
        display_name: metadata.display_name || key,
        description: metadata.description || 'No description available'
      } as NodeType;
    });
  }, [graph]);

  // Filter nodes based on search term
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodeTypes;

    const search = searchTerm.toLowerCase();
    return nodeTypes.filter(node =>
      node.name.toLowerCase().includes(search) ||
      node.display_name.toLowerCase().includes(search)
    );
  }, [nodeTypes, searchTerm]);

  // Get visible nodes (limited for performance)
  const visibleNodes = useMemo(() => {
    return filteredNodes.slice(0, displayCount);
  }, [filteredNodes, displayCount]);

  // Load more handler
  const loadMore = useCallback(() => {
    if (displayCount < filteredNodes.length) {
      setDisplayCount(prev => Math.min(prev + 20, filteredNodes.length));
    }
  }, [displayCount, filteredNodes.length]);

  // Scroll handler for infinite loading
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target && filteredNodes.length > displayCount) {
      const { scrollTop, scrollHeight, clientHeight } = target;

      // Load more when near bottom (within 200px)
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    }
  }, [filteredNodes.length, displayCount, loadMore]);

  // Reset display count when search changes
  useEffect(() => {
    setDisplayCount(20);
  }, [searchTerm]);

  // Attach scroll listener with retry mechanism
  useEffect(() => {
    if (!isOpen) return;

    let scrollElement: Element | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const attachScrollListener = () => {
      if (!scrollAreaRef.current) return false;

      scrollElement =
        scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') ||
        scrollAreaRef.current.querySelector('.scroll-area-viewport') ||
        scrollAreaRef.current;

      if (scrollElement) {
        console.log('Scroll element found:', scrollElement);
        scrollElement.addEventListener('scroll', handleScroll, { passive: true });
        return true;
      } else {
        console.warn('Scroll element not found, will retry...');
        return false;
      }
    };

    // Try immediately
    if (!attachScrollListener()) {
      // If not found, retry multiple times with increasing delays
      let retryCount = 0;
      const maxRetries = 5;

      const retry = () => {
        if (retryCount < maxRetries && !attachScrollListener()) {
          retryCount++;
          timeoutId = setTimeout(retry, 100 * retryCount); // 100ms, 200ms, 300ms, etc.
          console.log(`Retrying scroll listener attachment (attempt ${retryCount}/${maxRetries})`);
        }
      };

      retry();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll, isOpen]);

  // Debug modal state when it opens
  useEffect(() => {
    if (isOpen) {
      console.log('NodeAddModal opened with:', {
        graphAvailable: !!graph,
        metadataAvailable: !!graph?._metadata,
        nodeTypesCount: nodeTypes.length,
        filteredNodesCount: filteredNodes.length,
        visibleNodesCount: visibleNodes.length,
        displayCount,
        searchTerm
      });
    }
  }, [isOpen, graph, nodeTypes.length, filteredNodes.length, visibleNodes.length, displayCount, searchTerm]);

  const handleNodeSelect = (node: NodeType) => {
    if (!position || !onNodeAdd) {
      console.log('Cannot add node: missing position or onNodeAdd callback');
      onClose();
      return;
    }

    // Get node metadata from graph
    const nodeMetadata = graph?._metadata?.[node.name];
    if (!nodeMetadata) {
      console.error('Node metadata not found for:', node.name);
      return;
    }

    console.log('Adding node:', node.name, 'at position:', position);

    // Call the onNodeAdd callback
    onNodeAdd(node.name, nodeMetadata, {
      worldX: position.worldX,
      worldY: position.worldY
    });

    onClose();
  };

  const handlePasteNode = (copiedNode: CopiedNode) => {
    if (!position || !onNodeAdd) {
      console.log('Cannot add node: missing position or onNodeAdd callback');
      onClose();
      return;
    }

    // Get node metadata from graph
    const nodeMetadata = graph?._metadata?.[copiedNode.type];

    // Even if metadata is missing/renamed, we can try to add it if the system allows
    // But ideally we should warn if type doesn't exist anymore
    if (!nodeMetadata) {
      toast.error(t('nodeAdd.nodeTypeNotFound', { type: copiedNode.type }));
      return;
    }

    onNodeAdd(copiedNode.type, nodeMetadata, {
      worldX: position.worldX,
      worldY: position.worldY
    }, copiedNode.widgets, copiedNode.size, copiedNode.title);

    toast.success(t('nodeAdd.nodePasted'));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md pwa-modal"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 flex items-center justify-center p-4 pwa-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />

            {/* Glassmorphism Header */}
            <div className="relative p-6 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Plus className="w-6 h-6 text-blue-400 drop-shadow-sm" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                    {t('nodeAdd.title')}
                  </h2>
                </div>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>


              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('nodeAdd.searchPlaceholder')}
                  className="pl-10 pr-10 bg-white/50 backdrop-blur-sm border-slate-200/50 dark:bg-slate-800/50 dark:border-slate-600/50 h-10"
                />
                {searchTerm && (
                  <Button
                    onClick={() => setSearchTerm('')}
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Recent Copies Section */}
            {recentNodes.length > 0 && !searchTerm && (
              <div className="flex-shrink-0 px-6 pt-4 pb-2 border-b border-white/5 dark:border-slate-600/5">
                <div className="flex items-center space-x-2 mb-3 text-slate-500 dark:text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Recent Copies</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {recentNodes.map((node) => (
                    <motion.button
                      key={node.id}
                      onClick={() => handlePasteNode(node)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex flex-col text-left p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-all"
                    >
                      <div className="flex items-start justify-between w-full mb-1">
                        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 truncate pr-2">
                          {node.title}
                        </span>
                        <Copy className="w-3 h-3 text-blue-400 flex-shrink-0 mt-1" />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {node.type}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Results Area with Virtual Scrolling */}
            <div className="relative flex-1 overflow-hidden">
              <ScrollArea ref={scrollAreaRef} className="h-full">
                {filteredNodes.length === 0 ? (
                  <div className="text-center py-12">
                    <Hash className="w-12 h-12 text-slate-400 mx-auto mb-4 opacity-50" />
                    <p className="text-slate-600 dark:text-slate-400 text-lg">
                      {nodeTypes.length === 0
                        ? t('nodeAdd.noNodeTypes')
                        : t('nodeAdd.noMatchingNodes', { query: searchTerm })
                      }
                    </p>
                  </div>
                ) : (
                  <div className="p-6 space-y-3" style={{ width: '100%', maxWidth: '100%' }}>
                    {visibleNodes.map((node, index) => (
                      <motion.div
                        key={node.name}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.2 }}
                        onClick={() => handleNodeSelect(node)}
                        className="group relative p-4 bg-white/30 dark:bg-slate-700/20 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-slate-600/20 cursor-pointer transition-all duration-200 hover:bg-white/40 dark:hover:bg-slate-600/30 hover:border-white/30 dark:hover:border-slate-500/30 hover:scale-[1.01] hover:shadow-lg hover:shadow-slate-900/10"
                        style={{
                          width: '100% !important',
                          maxWidth: '100% !important',
                          minWidth: '0 !important',
                          flex: 'none !important',
                          flexShrink: '0 !important',
                          flexGrow: '0 !important',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          display: 'block'
                        }}
                      >
                        {/* Hover gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/5 to-purple-400/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                        <div className="relative" style={{
                          display: 'table',
                          width: '100%',
                          maxWidth: '100%',
                          tableLayout: 'fixed',
                          overflow: 'hidden'
                        }}>
                          {/* Icon */}
                          <div style={{
                            display: 'table-cell',
                            width: '50px',
                            verticalAlign: 'middle'
                          }}>
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                              <Hash className="w-5 h-5 text-white" />
                            </div>
                          </div>

                          {/* Content */}
                          <div style={{
                            display: 'table-cell',
                            verticalAlign: 'middle',
                            paddingLeft: '6px',
                            paddingRight: '32px',
                            overflow: 'hidden'
                          }}>
                            <h3 className="font-semibold text-slate-900 dark:text-white text-base mb-1" style={{
                              overflow: 'hidden',
                              wordWrap: 'break-word',
                              wordBreak: 'break-word',
                              hyphens: 'auto',
                              whiteSpace: 'normal'
                            }}>
                              {node.display_name}
                            </h3>
                            <Badge
                              variant="secondary"
                              className="text-xs bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border border-white/30 dark:border-slate-600/30 backdrop-blur-sm mb-2"
                            >
                              {node.name}
                            </Badge>
                            {node.description && node.description !== 'No description available' && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed" style={{
                                overflow: 'hidden',
                                wordWrap: 'break-word',
                                wordBreak: 'break-word',
                                hyphens: 'auto',
                                whiteSpace: 'normal'
                              }}>
                                {node.description}
                              </p>
                            )}
                          </div>

                          {/* Arrow indicator */}
                          <div style={{
                            display: 'table-cell',
                            width: '30px',
                            verticalAlign: 'middle',
                            textAlign: 'center'
                          }}>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <Plus className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Load More Indicator */}
                    {displayCount < filteredNodes.length && (
                      <div className="text-center py-4">
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {t('nodeAdd.showingNodes', { count: displayCount, total: filteredNodes.length })}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('nodeAdd.scrollMore')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Footer Info */}
            <div className="relative p-4 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-t border-white/10 dark:border-slate-600/10">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {t('nodeAdd.availableTypes', { count: nodeTypes.length })}
                {searchTerm && (
                  <span className="ml-2">• {t('nodeAdd.matchingSearch', { count: filteredNodes.length })}</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence >
  );
};