import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Copy, Download, Loader2, Search, ChevronUp, ChevronDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface JsonViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any;
}

export const JsonViewerModal: React.FC<JsonViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  data
}) => {
  const { t } = useTranslation();
  const [isCopying, setIsCopying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [jsonString, setJsonString] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const preRef = useRef<HTMLPreElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Process JSON data with loading state
  useEffect(() => {
    if (!isOpen || !data) {
      setJsonString('');
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);

    // Use setTimeout to allow UI to update with loading state
    const timer = setTimeout(() => {
      try {
        // Safety check for circular references or massive objects
        const cache = new Set();
        const processed = JSON.stringify(data, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) {
              return '[Circular]';
            }
            cache.add(value);
          }
          return value;
        }, 2);

        setJsonString(processed);
        cache.clear();
      } catch (error) {
        console.error('JSON serialization error:', error);
        setJsonString(JSON.stringify({
          error: t('jsonViewer.failedToSerialize'),
          details: String(error)
        }, null, 2));
      } finally {
        setIsProcessing(false);
      }
    }, 100); // Small delay to show spinner for very fast processing

    return () => clearTimeout(timer);
  }, [data, isOpen]);

  // Search functionality - only when activeSearchQuery changes
  const searchMatches = useMemo(() => {
    if (!activeSearchQuery.trim() || !jsonString) return [];

    const query = activeSearchQuery.toLowerCase();
    const matches: number[] = [];
    let index = 0;

    while (index < jsonString.length) {
      const foundIndex = jsonString.toLowerCase().indexOf(query, index);
      if (foundIndex === -1) break;
      matches.push(foundIndex);
      index = foundIndex + 1;
    }

    return matches;
  }, [activeSearchQuery, jsonString]);

  const highlightedJsonString = useMemo(() => {
    if (!activeSearchQuery.trim() || searchMatches.length === 0 || !jsonString) {
      return jsonString;
    }

    const query = activeSearchQuery;
    let result = '';
    let lastIndex = 0;

    searchMatches.forEach((matchIndex, i) => {
      // Add text before match
      result += jsonString.slice(lastIndex, matchIndex);

      // Add highlighted match
      const isCurrentMatch = i === currentMatchIndex;
      const highlightClass = isCurrentMatch
        ? 'bg-yellow-400 text-black font-semibold'
        : 'bg-yellow-200 text-black';

      result += `<mark class="${highlightClass}">${jsonString.slice(matchIndex, matchIndex + query.length)}</mark>`;
      lastIndex = matchIndex + query.length;
    });

    // Add remaining text
    result += jsonString.slice(lastIndex);
    return result;
  }, [activeSearchQuery, searchMatches, currentMatchIndex, jsonString]);

  // Scroll to current match
  const scrollToCurrentMatch = useCallback(() => {
    if (!preRef.current || searchMatches.length === 0 || !activeSearchQuery) return;

    console.log('🔍 Scrolling to match', currentMatchIndex, 'of', searchMatches.length);

    const preElement = preRef.current;

    // Wait for DOM to update
    requestAnimationFrame(() => {
      const marks = preElement.querySelectorAll('mark');
      console.log('📍 Found marks:', marks.length);

      if (marks.length > 0 && currentMatchIndex < marks.length) {
        const currentMark = marks[currentMatchIndex];
        console.log('🎯 Current mark:', currentMark);

        // Try different scroll methods
        try {
          // Method 1: scrollIntoView
          currentMark.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });

          console.log('✅ Scrolled with scrollIntoView');
        } catch (error) {
          console.log('❌ scrollIntoView failed:', error);

          // Method 2: Calculate and scroll manually
          try {
            const markOffsetTop = currentMark.offsetTop;
            const preHeight = preElement.clientHeight;
            const scrollTop = markOffsetTop - preHeight / 2;

            preElement.scrollTop = Math.max(0, scrollTop);
            console.log('✅ Scrolled manually to:', scrollTop);
          } catch (error2) {
            console.log('❌ Manual scroll failed:', error2);
          }
        }
      }
    });
  }, [currentMatchIndex, searchMatches.length, activeSearchQuery]);

  // Scroll when match index changes or search results update
  useEffect(() => {
    if (searchMatches.length > 0 && activeSearchQuery) {
      console.log('🔄 useEffect triggered - scheduling scroll');
      // Reduce delay for faster response - use different delays for different scenarios
      const delay = searchMatches.length > 0 ? 50 : 200; // Faster for navigation, slower for new search
      const timer = setTimeout(() => {
        console.log('⏰ Timer triggered - calling scroll function');
        scrollToCurrentMatch();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [currentMatchIndex, searchMatches.length, activeSearchQuery, scrollToCurrentMatch]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }
      setActiveSearchQuery('');
      setCurrentMatchIndex(0);
      setIsSearchOpen(false);
    }
  }, [isOpen]);

  const handleCopy = async () => {
    if (!jsonString) return;

    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(jsonString);
      toast.success(t('jsonViewer.copiedToClipboard'));
    } catch (error) {
      toast.error(t('jsonViewer.failedToCopy'));
      console.error('Copy failed:', error);
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownload = () => {
    if (!jsonString) return;

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('jsonViewer.downloadedJson'));
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Search handlers
  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (!isSearchOpen) {
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }
      setActiveSearchQuery('');
      setCurrentMatchIndex(0);
    }
  };


  const handleSearch = useCallback(() => {
    const inputValue = searchInputRef.current?.value || '';
    console.log('🔍 Search triggered with:', inputValue); // Debug log
    if (inputValue.trim()) {
      setActiveSearchQuery(inputValue.trim());
      setCurrentMatchIndex(0);
    } else {
      setActiveSearchQuery('');
      setCurrentMatchIndex(0);
    }
  }, []);

  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    console.log('⬆️ Previous match clicked');
    setCurrentMatchIndex((prev) => {
      const newIndex = prev === 0 ? searchMatches.length - 1 : prev - 1;
      console.log('📍 Moving to match index:', newIndex);
      return newIndex;
    });
  }, [searchMatches.length]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    console.log('⬇️ Next match clicked');
    setCurrentMatchIndex((prev) => {
      const newIndex = prev === searchMatches.length - 1 ? 0 : prev + 1;
      console.log('📍 Moving to match index:', newIndex);
      return newIndex;
    });
  }, [searchMatches.length]);


  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md pwa-modal"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 flex items-center justify-center p-4 pwa-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">
              {/* Gradient Overlay for Enhanced Glass Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
              {/* Glassmorphism Header */}
              <div className="relative p-6 pb-4 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-6 h-6 text-violet-400 drop-shadow-sm" />
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white drop-shadow-sm">
                      {title}
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
                <div>
                  {isProcessing ? (
                    <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('jsonViewer.processingJson')}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {jsonString.split('\n').length} {t('jsonViewer.lines')} • {(new Blob([jsonString]).size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-2">
                  <Button
                    onClick={handleSearchToggle}
                    variant="outline"
                    size="sm"
                    className={`h-8 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full ${isSearchOpen
                      ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                      : 'bg-white/10 dark:bg-slate-700/10 hover:bg-white/20 dark:hover:bg-slate-700/30'
                      }`}
                    disabled={isProcessing}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleDownload}
                    variant="outline"
                    size="sm"
                    className="h-8 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                    disabled={isProcessing}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {t('jsonViewer.download')}
                  </Button>
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className="h-8 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                    disabled={isCopying || isProcessing}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    {isCopying ? t('jsonViewer.copying') : t('jsonViewer.copy')}
                  </Button>
                </div>
              </div>

              {/* Search Panel */}
              <AnimatePresence>
                {isSearchOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="relative border-b border-white/10 dark:border-slate-600/10 p-3 bg-white/5 dark:bg-slate-700/5 backdrop-blur-sm"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 relative flex items-center space-x-2">
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder={t('jsonViewer.searchPlaceholder')}
                          className="flex-1 px-3 py-2 text-sm bg-white/20 dark:bg-slate-800/20 backdrop-blur-sm border border-white/20 dark:border-slate-600/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                          autoFocus
                        />
                        <Button
                          onClick={handleSearch}
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                        >
                          {t('jsonViewer.search')}
                        </Button>
                      </div>

                      {searchMatches.length > 0 && (
                        <>
                          <div className="flex items-center space-x-1 text-sm text-slate-600 dark:text-slate-400 min-w-0">
                            <span className="whitespace-nowrap">
                              {t('jsonViewer.matchCount', { current: currentMatchIndex + 1, total: searchMatches.length })}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1">
                            <Button
                              onClick={handlePreviousMatch}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                              disabled={searchMatches.length === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={handleNextMatch}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full hover:bg-white/20 dark:hover:bg-slate-700/30"
                              disabled={searchMatches.length === 0}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}

                      {activeSearchQuery && searchMatches.length === 0 && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {t('jsonViewer.noMatches', { query: activeSearchQuery })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* JSON Content */}
              <div className="relative flex-1 overflow-hidden">
                {isProcessing ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center space-y-4">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                      <div className="text-sm text-slate-600 dark:text-slate-400 text-center">
                        <p>{t('jsonViewer.processingJson')}</p>
                        <p className="text-xs mt-1 text-slate-500 dark:text-slate-500">
                          {t('jsonViewer.largeDatasets')}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-auto p-6">
                    <pre
                      ref={preRef}
                      className="text-xs font-mono bg-white/10 dark:bg-slate-800/10 backdrop-blur-sm rounded-xl p-4 overflow-auto text-slate-900 dark:text-slate-100 leading-relaxed border border-white/10 dark:border-slate-600/10"
                      dangerouslySetInnerHTML={{
                        __html: activeSearchQuery ? highlightedJsonString : jsonString
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};