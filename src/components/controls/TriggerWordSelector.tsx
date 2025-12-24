import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Copy, Loader2, Hash, X, ChevronDown, ChevronRight } from 'lucide-react';
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

  // Helper function to clean lora names (remove extensions)
  const cleanLoraName = (loraName: string): string => {
    // Remove common model file extensions
    return loraName.replace(/\.(safetensors|ckpt|pt|pth|bin|pkl)$/i, '');
  };

  // Clipboard helper function with fallback (from StringWidget.tsx)
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // using HTTPS
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // HTTP fallback
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
      // Reset copied state after animation
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

      // Only copy if touch distance is minimal (not scrolling)
      if (touchDistance < 10) {
        handleCopyTriggerWord(word);
      }
      setTouchStartY(null);
    }
  };

  // Load trigger words and LoRA list from server
  const loadTriggerWords = async () => {
    if (!serverUrl) return;

    setIsLoading(true);
    try {
      // Load both trigger words and LoRA list in parallel
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

        // Filter LoRAs that are 1MB or larger (1,048,576 bytes)
        const MIN_FILE_SIZE = 1024 * 1024; // 1MB in bytes
        const filteredLoras = loraModels
          .filter(lora => lora.size >= MIN_FILE_SIZE)
          .map(lora => ({
            name: lora.name,
            size: lora.size
          }));

        setLoraList(filteredLoras);
      } else {
        console.warn('Failed to load LoRA list:', loraListResponse.error);
        setLoraList([]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error(t('menu.failedToLoadTriggerWords'));
    } finally {
      setIsLoading(false);
    }
  };

  // Load data when component opens
  useEffect(() => {
    if (isOpen) {
      loadTriggerWords();
    }
  }, [isOpen, serverUrl]);

  // Filter and group trigger words based on search query and LoRA size
  const filteredGroups = useMemo(() => {
    const groups: LoRAGroup[] = [];
    const query = searchQuery.toLowerCase().trim();

    // Create a set for quick LoRA name lookup (only 1MB+ LoRAs)
    const validLoraNames = new Set(loraList.map(lora => lora.name));

    Object.entries(triggerWordsData.trigger_words).forEach(([loraName, triggerWords]) => {
      if (!triggerWords || triggerWords.length === 0) return;

      // Check if this LoRA is in our filtered list (1MB+)
      if (!validLoraNames.has(loraName)) return; // Skip if not found in LoRA list (means it's < 1MB)

      // Filter by search query (LoRA name or trigger word)
      if (query) {
        const loraMatches = loraName.toLowerCase().includes(query);
        const triggerWordMatches = triggerWords.some(word =>
          word.toLowerCase().includes(query)
        );

        if (!loraMatches && !triggerWordMatches) return;

        // If searching, filter trigger words that match
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 pwa-modal flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">
            {/* Gradient Overlay for Enhanced Glass Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
            {/* Glassmorphism Header */}
            <div className="relative p-6 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Hash className="w-6 h-6 text-violet-400 drop-shadow-sm" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                    {t('menu.triggerWords')}
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('menu.triggerWordsSearchPlaceholder')}
                  className="pl-10 pr-10 bg-white/50 backdrop-blur-sm border-slate-200/50 dark:bg-slate-800/50 dark:border-slate-600/50 h-10"
                />
                {searchQuery && (
                  <Button
                    onClick={clearSearch}
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Stats and Controls */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-4">
                  <Badge variant="secondary" className="bg-white/50 dark:bg-slate-800/50">
                    {t('menu.lorasCount', { count: Object.keys(triggerWordsData.trigger_words).length })}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/50 dark:bg-slate-800/50">
                    {t('menu.triggerWordsCount', { count: totalTriggerWords })}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={expandAll}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-slate-600 dark:text-slate-400"
                  >
                    {t('menu.expandAll')}
                  </Button>
                  <Button
                    onClick={collapseAll}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-slate-600 dark:text-slate-400"
                  >
                    {t('menu.collapseAll')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('menu.loadingTriggerWords')}</p>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                  <Hash className="h-8 w-8 text-slate-400" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {searchQuery ? t('menu.noTriggerWordsFound') : t('menu.noTriggerWordsAvailable')}
                  </p>
                  {searchQuery && (
                    <Button
                      onClick={clearSearch}
                      variant="outline"
                      size="sm"
                      className="bg-white/50 dark:bg-slate-800/50"
                    >
                      {t('menu.clearSearch')}
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-3">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.loraName}
                        className="bg-white/30 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/50 overflow-hidden"
                      >
                        {/* LoRA Header */}
                        <button
                          onClick={() => toggleLoraExpansion(group.loraName)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 dark:hover:bg-slate-700/20 transition-colors"
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {group.isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            )}
                            <span
                              className="font-medium text-slate-900 dark:text-slate-100 text-left truncate"
                              title={cleanLoraName(group.loraName)}
                            >
                              {cleanLoraName(group.loraName)}
                            </span>
                          </div>
                          <Badge variant="secondary" className="bg-white/50 dark:bg-slate-800/50 text-xs ml-2 flex-shrink-0">
                            {group.triggerWords.length}
                          </Badge>
                        </button>

                        {/* Trigger Words */}
                        <AnimatePresence>
                          {group.isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-slate-200/50 dark:border-slate-700/50"
                            >
                              <div className="p-4 space-y-2">
                                {group.triggerWords.map((word, index) => {
                                  const isCopied = copiedWord === word;
                                  return (
                                    <motion.button
                                      key={`${group.loraName}-${index}`}
                                      onClick={() => handleCopyTriggerWord(word)}
                                      onTouchStart={handleTouchStart}
                                      onTouchEnd={(e) => handleTouchEnd(e, word)}
                                      className={`w-full p-3 rounded-md transition-all duration-200 cursor-pointer select-none relative overflow-hidden border shadow-sm ${isCopied
                                        ? 'bg-green-500/20 dark:bg-green-400/20 border-green-400/30 dark:border-green-500/30 shadow-green-400/20'
                                        : 'bg-white/20 dark:bg-slate-700/20 hover:bg-white/30 dark:hover:bg-slate-700/30 active:bg-white/40 dark:active:bg-slate-700/40 border-white/20 dark:border-slate-600/20 hover:border-violet-400/30 dark:hover:border-violet-500/30 hover:shadow-md hover:shadow-violet-400/10'
                                        }`}
                                      title={t('node.tapToCopy', { word })}
                                      animate={isCopied ? { scale: [1, 1.02, 1] } : {}}
                                      transition={{ duration: 0.3 }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className={`text-sm font-mono break-words leading-relaxed text-left flex-1 ${isCopied
                                          ? 'text-green-700 dark:text-green-300'
                                          : 'text-slate-700 dark:text-slate-300'
                                          }`}>
                                          {word}
                                        </span>

                                        <div className="ml-2 flex-shrink-0">
                                          <div className={`transition-colors duration-200 ${isCopied
                                            ? 'text-green-500 dark:text-green-400'
                                            : 'text-slate-400 dark:text-slate-500 opacity-40 hover:opacity-80'
                                            }`}>
                                            <Copy className="h-4 w-4" />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Success ripple effect */}
                                      {isCopied && (
                                        <motion.div
                                          initial={{ scale: 0, opacity: 0.5 }}
                                          animate={{ scale: 2, opacity: 0 }}
                                          transition={{ duration: 0.6 }}
                                          className="absolute inset-0 bg-green-400/20 rounded-md pointer-events-none"
                                        />
                                      )}
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default TriggerWordSelector;