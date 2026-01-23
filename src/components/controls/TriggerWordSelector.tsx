import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Copy, Loader2, Hash, X, ChevronDown, ChevronRight, Layers, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';

interface TriggerWordSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
}

interface TriggerWordsData {
  trigger_words: Record<string, string[]>;
}

interface LoRAInfo {
  name: string;
  size: number;
}

interface LoRAGroup {
  loraName: string;
  triggerWords: string[];
  isExpanded: boolean;
}

const TriggerWordSelector: React.FC<TriggerWordSelectorProps> = ({
  isOpen,
  onClose,
  serverUrl
}) => {
  const { t } = useTranslation();
  const [triggerWordsData, setTriggerWordsData] = useState<TriggerWordsData>({ trigger_words: {} });
  const [loraList, setLoraList] = useState<LoRAInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLoras, setExpandedLoras] = useState<Set<string>>(new Set());
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [copiedWord, setCopiedWord] = useState<string | null>(null);

  // Header State (Always compact for this modal)
  const [isHeaderCompact] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      loadTriggerWords();
    }
  }, [isOpen, serverUrl]);

  // Helper function to clean lora names (remove extensions)
  const cleanLoraName = (loraName: string): string => {
    return loraName.replace(/\.(safetensors|ckpt|pt|pth|bin|pkl)$/i, '');
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const result = document.execCommand('copy');
        document.body.removeChild(textArea);
        return result;
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  };

  const handleCopyTriggerWord = async (triggerWord: string) => {
    const success = await copyToClipboard(triggerWord);
    if (success) {
      setCopiedWord(triggerWord);
      toast.success(t('menu.copiedToClipboard', { word: triggerWord }));
      setTimeout(() => setCopiedWord(null), 2000);
    } else {
      toast.error(t('menu.failedToCopy'));
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent, word: string) => {
    if (touchStartY !== null) {
      const touchEndY = e.changedTouches[0].clientY;
      const touchDistance = Math.abs(touchEndY - touchStartY);
      if (touchDistance < 10) {
        handleCopyTriggerWord(word);
      }
      setTouchStartY(null);
    }
  };

  const loadTriggerWords = async () => {
    if (!serverUrl) return;
    setIsLoading(true);
    try {
      const [triggerWordsResponse, loraListResponse] = await Promise.all([
        ComfyUIService.getTriggerWords(),
        ComfyUIService.getLoraList()
      ]);

      if (triggerWordsResponse.success) {
        setTriggerWordsData(triggerWordsResponse);
      } else {
        toast.error(triggerWordsResponse.error || t('menu.failedToLoadTriggerWords'));
      }

      if (loraListResponse.success) {
        const loraModels = loraListResponse.models || loraListResponse.loras || [];
        const MIN_FILE_SIZE = 1024 * 1024;
        const filteredLoras = loraModels
          .filter(lora => lora.size >= MIN_FILE_SIZE)
          .map(lora => ({
            name: lora.name,
            size: lora.size
          }));
        setLoraList(filteredLoras);
      } else {
        setLoraList([]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error(t('menu.failedToLoadTriggerWords'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTriggerWords();
    }
  }, [isOpen, serverUrl]);

  const filteredGroups = useMemo(() => {
    const groups: LoRAGroup[] = [];
    const query = searchQuery.toLowerCase().trim();
    const validLoraNames = new Set(loraList.map(lora => lora.name));

    Object.entries(triggerWordsData.trigger_words).forEach(([loraName, triggerWords]) => {
      if (!triggerWords || triggerWords.length === 0) return;
      if (!validLoraNames.has(loraName)) return;

      if (query) {
        const loraMatches = loraName.toLowerCase().includes(query);
        const triggerWordMatches = triggerWords.some(word =>
          word.toLowerCase().includes(query)
        );

        if (!loraMatches && !triggerWordMatches) return;

        if (!loraMatches && triggerWordMatches) {
          const matchingWords = triggerWords.filter(word =>
            word.toLowerCase().includes(query)
          );
          groups.push({
            loraName,
            triggerWords: matchingWords,
            isExpanded: expandedLoras.has(loraName)
          });
        } else {
          groups.push({
            loraName,
            triggerWords,
            isExpanded: expandedLoras.has(loraName)
          });
        }
      } else {
        groups.push({
          loraName,
          triggerWords,
          isExpanded: expandedLoras.has(loraName)
        });
      }
    });

    return groups.sort((a, b) => a.loraName.localeCompare(b.loraName));
  }, [triggerWordsData, loraList, searchQuery, expandedLoras]);

  const toggleLoraExpansion = (loraName: string) => {
    const newExpanded = new Set(expandedLoras);
    if (newExpanded.has(loraName)) {
      newExpanded.delete(loraName);
    } else {
      newExpanded.add(loraName);
    }
    setExpandedLoras(newExpanded);
  };

  const expandAll = () => {
    const allLoras = new Set(filteredGroups.map(group => group.loraName));
    setExpandedLoras(allLoras);
  };

  const collapseAll = () => {
    setExpandedLoras(new Set());
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const totalTriggerWords = Object.values(triggerWordsData.trigger_words)
    .reduce((total, words) => total + (words?.length || 0), 0);

  if (!isOpen) return null;

  const baseTitleSize = '1.875rem';

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
                    LORAS
                  </Badge>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                    {t('menu.triggerWords')}
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
                    {t('menu.triggerWords')}
                  </h2>
                </div>
              </div>
            </div>

            {/* Persistent Search & Controls Bar - Slightly detached from header */}
            <div
              className="absolute left-0 w-full z-20 px-4 sm:px-8 top-[68px]"
            >
              <div className="flex flex-col gap-3 bg-[#374151]/80 backdrop-blur-md p-3 rounded-2xl border border-white/5 shadow-lg">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('menu.triggerWordsSearchPlaceholder')}
                    className="w-full bg-black/20 border-white/10 text-xs text-white/90 placeholder:text-white/20 h-9 pl-9 pr-8 rounded-xl focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20 transition-all duration-300 border shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3 text-white/40" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={expandAll}
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-[9px] font-bold uppercase tracking-wider bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5 rounded-lg transition-all"
                  >
                    {t('menu.expandAll')}
                  </Button>
                  <Button
                    onClick={collapseAll}
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-[9px] font-bold uppercase tracking-wider bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5 rounded-lg transition-all"
                  >
                    {t('menu.collapseAll')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Static Top Bumper - Adjusted for fixed header + search bar + gap */}
              <div className="h-[185px] relative pointer-events-none">
                <div ref={sentinelRef} className="absolute top-[10px] left-0 h-px w-full" />
              </div>

              <div className="px-5 pb-6 sm:px-6">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 animate-spin text-white/20" />
                      <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-violet-400/50 animate-pulse" />
                    </div>
                    <p className="text-xs font-medium tracking-wide text-white/40 uppercase">{t('menu.loadingTriggerWords')}</p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-12 rounded-3xl bg-black/20 border border-dashed border-white/10">
                    <Hash className="h-10 w-10 text-white/10 mx-auto mb-3" />
                    <p className="text-white/40 text-sm font-medium">
                      {searchQuery ? t('menu.noTriggerWordsFound') : t('menu.noTriggerWordsAvailable')}
                    </p>
                    {searchQuery && (
                      <Button
                        onClick={clearSearch}
                        variant="ghost"
                        size="sm"
                        className="mt-4 text-xs bg-white/5 hover:bg-white/10 text-white/60 rounded-xl"
                      >
                        {t('menu.clearSearch')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Category Header */}
                    <div className="flex items-center justify-between mb-2 p-1">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-white/50" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                          {t('menu.lorasCount', { count: filteredGroups.length })}
                        </span>
                      </div>
                      <Badge variant="secondary" className="bg-white/5 text-white/40 border-white/5 font-mono text-[9px]">
                        {t('menu.triggerWordsCount', { count: filteredGroups.reduce((acc, g) => acc + g.triggerWords.length, 0) })}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {filteredGroups.map((group) => (
                        <div
                          key={group.loraName}
                          className="group relative rounded-3xl bg-black/10 border border-white/5 hover:bg-black/20 hover:border-white/10 transition-all overflow-hidden"
                        >
                          {/* LoRA Header Card */}
                          <button
                            onClick={() => toggleLoraExpansion(group.loraName)}
                            className="w-full px-5 py-3.5 flex items-center justify-between text-left transition-all"
                          >
                            <div className="flex items-center space-x-4 min-w-0">
                              <div className={`p-1.5 rounded-2xl bg-black/20 border border-white/5 transition-transform duration-300 ${group.isExpanded ? 'rotate-180 bg-violet-500/10 border-violet-500/20' : ''}`}>
                                <ChevronDown className={`w-3.5 h-3.5 ${group.isExpanded ? 'text-violet-400' : 'text-white/40'}`} />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-white/90 text-[12px] tracking-tight line-clamp-2 leading-snug" title={cleanLoraName(group.loraName)}>
                                  {cleanLoraName(group.loraName)}
                                </span>
                                <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider mt-0.5">
                                  {group.triggerWords.length} Words
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center border border-white/10">
                                <ChevronRight className="h-3.5 w-3.5 text-white/40" />
                              </div>
                            </div>
                          </button>

                          {/* Trigger Words Grid */}
                          <AnimatePresence>
                            {group.isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                              >
                                <div className="px-5 pb-5 pt-1 space-y-2">
                                  <div className="grid grid-cols-1 gap-2">
                                    {group.triggerWords.map((word, index) => {
                                      const isCopied = copiedWord === word;
                                      return (
                                        <motion.div
                                          key={`${group.loraName}-${index}`}
                                          className={`w-full p-4 rounded-2xl transition-all duration-300 relative overflow-hidden group/word flex items-center justify-between border ${isCopied
                                            ? 'bg-green-500/10 border-green-500/30 text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                                            : 'bg-black/20 border-white/5 hover:border-white/10 text-white/60 hover:text-white/90'
                                            }`}
                                        >
                                          <div className="flex flex-col items-start min-w-0 select-text cursor-text">
                                            <span className="text-xs font-mono break-all leading-normal text-left pr-4">
                                              {word}
                                            </span>
                                          </div>

                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyTriggerWord(word);
                                            }}
                                            onTouchStart={handleTouchStart}
                                            onTouchEnd={(e) => {
                                              e.stopPropagation();
                                              handleTouchEnd(e, word);
                                            }}
                                            className={`flex-shrink-0 p-2 rounded-xl transition-all duration-300 relative z-10 
                                            ${isCopied
                                                ? 'bg-green-500/20 scale-110'
                                                : 'bg-white/5 hover:bg-white/10 opacity-40 group-hover/word:opacity-100 hover:scale-110 active:scale-90'
                                              }`}
                                          >
                                            {isCopied ? (
                                              <Sparkles className="h-4 w-4 text-green-400" />
                                            ) : (
                                              <Copy className="h-4 w-4" />
                                            )}
                                          </button>

                                          {/* Copied Flash Effect */}
                                          <AnimatePresence>
                                            {isCopied && (
                                              <motion.div
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1.5 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 bg-green-500/10 pointer-events-none blur-xl"
                                              />
                                            )}
                                          </AnimatePresence>
                                        </motion.div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default TriggerWordSelector;
