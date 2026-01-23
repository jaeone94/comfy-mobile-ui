import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Search, X, Plus, Hash, Copy, Clock, Layers, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { NodeClipboardService, CopiedNode } from '@/services/NodeClipboardService';
import { toast } from 'sonner';

interface NodeType {
  name: string;
  display_name: string;
  description: string;
  category: string;
}

interface NodeTreeItem {
  id: string; // full path
  name: string; // display name for this label
  nodes: NodeType[];
  children: NodeTreeItem[];
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
  const [recentNodes, setRecentNodes] = useState<CopiedNode[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const baseTitleSize = '1.875rem';

  // Load recent nodes on mount
  useEffect(() => {
    if (isOpen) {
      setRecentNodes(NodeClipboardService.getNodes());
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
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
        description: metadata.description || 'No description available',
        category: metadata.category || 'uncategorized'
      } as NodeType;
    });
  }, [graph, graph?._metadata]);

  // Build hierarchical node tree
  const nodeTree = useMemo(() => {
    const root: NodeTreeItem[] = [];
    const query = searchTerm.toLowerCase().trim();

    // 1. Filter nodes first
    const filteredNodes = nodeTypes.filter(node => {
      const nameMatch = node.name.toLowerCase().includes(query);
      const displayMatch = node.display_name.toLowerCase().includes(query);
      const catMatch = node.category.toLowerCase().includes(query);
      return !query || nameMatch || displayMatch || catMatch;
    });

    // 2. Build tree
    filteredNodes.forEach(node => {
      const parts = (node.category || 'uncategorized').split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let item = currentLevel.find(i => i.name === part);
        if (!item) {
          item = { id: currentPath, name: part, nodes: [], children: [] };
          currentLevel.push(item);
        }

        if (index === parts.length - 1) {
          item.nodes.push(node);
        }
        currentLevel = item.children;
      });
    });

    // Sort recursively
    const sortTree = (items: NodeTreeItem[]) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
      items.forEach(item => {
        item.nodes.sort((a, b) => a.display_name.localeCompare(b.display_name));
        if (item.children.length > 0) sortTree(item.children);
      });
    };
    sortTree(root);

    return root;
  }, [nodeTypes, searchTerm]);

  const toggleCategoryExpansion = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleNodeSelect = (node: NodeType) => {
    if (!position || !onNodeAdd) {
      console.log('Cannot add node: missing position or onNodeAdd callback');
      onClose();
      return;
    }

    const nodeMetadata = graph?._metadata?.[node.name];
    if (!nodeMetadata) {
      console.error('Node metadata not found for:', node.name);
      return;
    }

    onNodeAdd(node.name, nodeMetadata, {
      worldX: position.worldX,
      worldY: position.worldY
    });

    onClose();
  };

  const handlePasteNode = (copiedNode: CopiedNode) => {
    if (!position || !onNodeAdd) {
      onClose();
      return;
    }

    const nodeMetadata = graph?._metadata?.[copiedNode.type];
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

  // Recursive Item Component
  const TreeItemRenderer = ({ item, level }: { item: NodeTreeItem; level: number }) => {
    const isExpanded = expandedCategories.has(item.id) || !!searchTerm;
    const hasChildren = item.children.length > 0;
    const hasNodes = item.nodes.length > 0;

    return (
      <div className={`mb-3 last:mb-0`}>
        <div
          className="group relative rounded-3xl bg-black/10 border border-white/5 hover:bg-black/20 hover:border-white/10 transition-all overflow-hidden"
          style={{ marginLeft: level > 0 ? `${level * 12}px` : '0' }}
        >
          {/* Header */}
          <button
            onClick={() => toggleCategoryExpansion(item.id)}
            className="w-full px-5 py-3 flex items-center justify-between text-left transition-all"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className={`p-1.5 rounded-xl bg-black/20 border border-white/5 transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-blue-500/10 border-blue-500/20' : ''}`}>
                <ChevronDown className={`w-3 h-3 ${isExpanded ? 'text-blue-400' : 'text-white/40'}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white/90 text-[11px] tracking-tight uppercase line-clamp-1 leading-snug">
                  {item.name}
                </span>
                <span className="text-[8px] font-medium text-white/30 uppercase tracking-wider">
                  {item.nodes.length + item.children.length} Items
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center border border-white/10">
                <ChevronRight className="h-3 w-3 text-white/40" />
              </div>
            </div>
          </button>

          {/* Children / Nodes Area */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="bg-black/5"
              >
                <div className="px-4 pb-4 pt-1 space-y-3">
                  {/* Nodes at this level */}
                  {hasNodes && (
                    <div className="grid grid-cols-1 gap-2">
                      {item.nodes.map((node) => (
                        <button
                          key={node.name}
                          onClick={() => handleNodeSelect(node)}
                          className="w-full p-3 rounded-2xl bg-black/20 border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 text-white/60 hover:text-white/90 transition-all duration-200 flex flex-col items-start text-left group/node"
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="text-[11px] font-bold text-white/80 group-hover/node:text-white transition-colors line-clamp-2 leading-snug">
                              {node.display_name}
                            </span>
                            <Plus className="w-3 h-3 opacity-0 group-hover/node:opacity-100 transition-opacity text-blue-400 flex-shrink-0 ml-2" />
                          </div>
                          {node.description && node.description !== 'No description available' && (
                            <p className="text-[9px] text-white/30 line-clamp-2 leading-relaxed mb-1.5">
                              {node.description}
                            </p>
                          )}
                          <Badge variant="outline" className="text-[7px] px-1.5 py-0 border-white/5 bg-black/20 text-white/20 font-mono uppercase tracking-tighter">
                            {node.name.split('.').pop()}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sub-categories */}
                  {hasChildren && (
                    <div className="space-y-2 mt-2">
                      {item.children.map((child) => (
                        <TreeItemRenderer key={child.id} item={child} level={0} />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="relative w-[90vw] h-[85vh] pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Card */}
          <div
            style={{ backgroundColor: '#374151' }}
            className="relative w-full h-full rounded-[40px] shadow-2xl ring-1 ring-slate-100/10 overflow-hidden flex flex-col text-white"
          >
            {/* Always Compact Sticky Header */}
            <div
              className="absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b min-h-[32px] pt-2 pb-[13px] pl-4 pr-[44px] bg-black/50 backdrop-blur-xl border-white/10"
            >
              {/* Floating Close Button */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex-shrink-0 scale-75">
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all pointer-events-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col justify-center flex-1 min-w-0 pointer-events-none">
                <div className="flex items-center space-x-2 mb-1 scale-90 origin-left">
                  <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-white/80 border-transparent">
                    NODES
                  </Badge>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                    {t('nodeAdd.title')}
                  </span>
                </div>

                <div className="flex items-center min-w-0 h-[13px]">
                  <h2
                    style={{
                      fontSize: baseTitleSize,
                      lineHeight: '1',
                      transform: `scale(${0.8125 / 1.875})`,
                      transformOrigin: 'left center',
                    }}
                    className="font-extrabold tracking-tight leading-tight text-white/95 transition-transform duration-300 will-change-transform truncate pr-4"
                  >
                    {t('nodeAdd.title')}
                  </h2>
                </div>
              </div>
            </div>

            {/* Persistent Search Bar (Simplified) */}
            <div className="absolute left-0 w-full z-20 px-4 sm:px-8 top-[68px]">
              <div className="flex flex-col gap-3 bg-[#374151]/80 backdrop-blur-md p-3 rounded-2xl border border-white/5 shadow-lg">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('nodeAdd.searchPlaceholder')}
                    className="w-full bg-black/20 border-white/10 text-xs text-white/90 placeholder:text-white/20 h-9 pl-9 pr-8 rounded-xl focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20 transition-all duration-300 border shadow-inner"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3 text-white/40" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              <div className="h-[145px]" /> {/* Adjusted top bumper since buttons are gone */}

              <div className="px-5 pb-6 sm:px-6">
                {/* Recent Copies Section */}
                {recentNodes.length > 0 && !searchTerm && (
                  <div className="mb-8 p-4 rounded-3xl bg-blue-500/5 border border-blue-500/10">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <Clock className="w-3.5 h-3.5 text-blue-400/60" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/60">
                        {t('nodeAdd.recentCopies')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recentNodes.slice(0, 6).map((node) => (
                        <button
                          key={node.id}
                          onClick={() => handlePasteNode(node)}
                          className="flex flex-col items-start p-2.5 rounded-xl bg-black/20 border border-white/5 hover:border-blue-400/30 hover:bg-blue-400/5 transition-all group/recent"
                        >
                          <span className="text-[10px] font-bold text-white/70 group-hover/recent:text-blue-400 line-clamp-1 mb-1">
                            {node.title}
                          </span>
                          <span className="text-[8px] font-mono text-white/30 uppercase">
                            {node.type.split('.').pop()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {nodeTree.length === 0 ? (
                  <div className="text-center py-12 rounded-3xl bg-black/20 border border-dashed border-white/10">
                    <Hash className="h-10 w-10 text-white/10 mx-auto mb-3" />
                    <p className="text-white/40 text-[11px] font-medium">
                      {searchTerm ? t('nodeAdd.noMatchingNodes', { query: searchTerm }) : t('nodeAdd.noNodeTypes')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Category Summary */}
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-white/50" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                          {t('workflow.stackViewLabels.nodesByCategory', { count: nodeTree.length })}
                        </span>
                      </div>
                      <Badge variant="secondary" className="bg-white/5 text-white/40 border-white/5 font-mono text-[9px]">
                        {nodeTypes.length} TYPES
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1">
                      {nodeTree.map((item) => (
                        <TreeItemRenderer key={item.id} item={item} level={0} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Status */}
            <div className="px-8 py-4 bg-black/30 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  {nodeTypes.length} Available Nodes
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
