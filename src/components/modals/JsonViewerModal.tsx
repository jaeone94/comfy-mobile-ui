import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Download, Loader2, Search, ChevronUp, ChevronDown, FileText, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface JsonViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any;
  isCompact?: boolean;
  downloadFilename?: string;
}

export const JsonViewerModal: React.FC<JsonViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  data,
  isCompact = false,
  downloadFilename
}) => {
  const { t } = useTranslation();
  const [isCopying, setIsCopying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [jsonString, setJsonString] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [isTooLarge, setIsTooLarge] = useState<boolean>(false);
  const [fileSize, setFileSize] = useState<number>(0);

  // Search is always open now
  const isSearchOpen = true;
  const preRef = useRef<HTMLPreElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Process JSON data with loading state
  useEffect(() => {
    if (!isOpen || !data) {
      setJsonString('');
      setIsProcessing(false);
      setIsTooLarge(false);
      setFileSize(0);
      return;
    }

    setIsProcessing(true);

    const timer = setTimeout(() => {
      try {
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

        const bytes = new Blob([processed]).size;
        setFileSize(bytes);

        // 2MB Threshold
        if (bytes > 2 * 1024 * 1024) {
          setIsTooLarge(true);
          setJsonString(''); // Clear to save memory
        } else {
          setIsTooLarge(false);
          setJsonString(processed);
        }
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
    }, 100);

    return () => clearTimeout(timer);
  }, [data, isOpen, t]);

  // Search functionality
  const searchMatches = useMemo(() => {
    if (!activeSearchQuery.trim() || !jsonString || isTooLarge) return [];

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
  }, [activeSearchQuery, jsonString, isTooLarge]);

  const highlightedJsonString = useMemo(() => {
    if (!activeSearchQuery.trim() || searchMatches.length === 0 || !jsonString || isTooLarge) {
      return jsonString;
    }

    const query = activeSearchQuery;
    let result = '';
    let lastIndex = 0;

    searchMatches.forEach((matchIndex, i) => {
      result += jsonString.slice(lastIndex, matchIndex);
      const isCurrentMatch = i === currentMatchIndex;
      const highlightClass = isCurrentMatch
        ? 'bg-yellow-400 text-black font-semibold'
        : 'bg-yellow-200 text-black';

      result += `<mark class="${highlightClass}">${jsonString.slice(matchIndex, matchIndex + query.length)}</mark>`;
      lastIndex = matchIndex + query.length;
    });

    result += jsonString.slice(lastIndex);
    return result;
  }, [activeSearchQuery, searchMatches, currentMatchIndex, jsonString, isTooLarge]);

  // Scroll to current match
  const scrollToCurrentMatch = useCallback(() => {
    if (!preRef.current || searchMatches.length === 0 || !activeSearchQuery) return;

    const preElement = preRef.current;
    requestAnimationFrame(() => {
      const marks = preElement.querySelectorAll('mark');
      if (marks.length > 0 && currentMatchIndex < marks.length) {
        const currentMark = marks[currentMatchIndex];
        try {
          currentMark.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        } catch (error) {
          try {
            const markOffsetTop = (currentMark as HTMLElement).offsetTop;
            const container = scrollContainerRef.current;
            if (container) {
              const scrollTop = markOffsetTop - container.clientHeight / 2;
              container.scrollTop = Math.max(0, scrollTop);
            }
          } catch (error2) {
            console.error('Manual scroll failed:', error2);
          }
        }
      }
    });
  }, [currentMatchIndex, searchMatches.length, activeSearchQuery]);

  useEffect(() => {
    if (searchMatches.length > 0 && activeSearchQuery) {
      const delay = 50;
      const timer = setTimeout(() => {
        scrollToCurrentMatch();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [currentMatchIndex, searchMatches.length, activeSearchQuery, scrollToCurrentMatch]);

  useEffect(() => {
    if (!isOpen) {
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }
      setActiveSearchQuery('');
      setCurrentMatchIndex(0);
    }
  }, [isOpen]);

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

  const handleCopy = async () => {
    if (!jsonString) return;
    setIsCopying(true);
    const success = await copyToClipboard(jsonString);
    if (success) {
      toast.success(t('jsonViewer.copiedToClipboard'));
    } else {
      toast.error(t('jsonViewer.failedToCopy'));
    }
    setIsCopying(false);
  };

  const handleDownload = () => {
    // If it's too large, we need to stringify data again or keep it
    // But since we can't keep jsonString for massive files in memory comfortably,
    // we stringify just for download.
    let contentToDownload = jsonString;
    if (isTooLarge && data) {
      try {
        contentToDownload = JSON.stringify(data, null, 2);
      } catch (e) {
        console.error("Failed to stringify for download", e);
      }
    }

    if (!contentToDownload) return;

    const blob = new Blob([contentToDownload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const finalFilename = downloadFilename
      ? (downloadFilename.endsWith('.json') ? downloadFilename : `${downloadFilename}.json`)
      : `${title.toLowerCase().replace(/\s+/g, '_')}.json`;

    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('jsonViewer.downloadedJson'));
  };

  const handleSearch = useCallback(() => {
    const inputValue = searchInputRef.current?.value || '';
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
    setCurrentMatchIndex((prev) => (prev === 0 ? searchMatches.length - 1 : prev - 1));
  }, [searchMatches.length]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev === searchMatches.length - 1 ? 0 : prev + 1));
  }, [searchMatches.length]);

  const baseTitleSize = '1.875rem';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 sm:p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pwa-modal"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
            className={`relative pwa-modal ${isCompact ? 'w-[92vw] max-w-[360px] h-[78vh] max-h-[440px]' : 'w-[92vw] max-w-2xl h-[78vh]'} pointer-events-auto flex flex-col`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div
              style={{ backgroundColor: '#101217' }}
              className={`relative w-full h-full ${isCompact ? 'rounded-xl' : 'rounded-xl'} shadow-2xl ring-1 ring-white/10 overflow-hidden flex flex-col text-white`}
            >
              <div className="absolute top-0 left-0 w-full z-30 flex items-center justify-between border-b h-11 pl-4 pr-[40px] bg-[#0f1116]/90 backdrop-blur-xl border-white/[0.08]">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex-shrink-0">
                  <button onClick={onClose} className="p-1.5 rounded-lg bg-white/[0.06] text-[#9aa3b2] hover:text-white hover:bg-white/[0.1] transition-all pointer-events-auto">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
                  <h2 className="text-[14px] font-bold text-[#e9ebef] truncate">
                    {title}
                  </h2>
                  <span className="font-mono text-[9px] font-semibold text-[#565d6b] tracking-[0.1em] px-1.5 py-0.5 rounded-md bg-black/20 shrink-0 whitespace-nowrap">
                    {isProcessing ? t('jsonViewer.processingJson') :
                      `${isTooLarge ? 'MASSIVE' : jsonString.split('\n').length}L · ${(fileSize / 1024).toFixed(1)}KB`
                    }
                  </span>
                </div>
              </div>

              <div className="absolute left-0 w-full z-20 px-3 top-[52px]">
                <div className="flex bg-[#101217]/90 backdrop-blur-xl p-1.5 rounded-[10px] border border-white/[0.08] shadow-xl items-center gap-1.5">
                  <div className="relative flex-[2] min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      disabled={isTooLarge}
                      onChange={(e) => { if (!e.target.value) { setActiveSearchQuery(''); setCurrentMatchIndex(0); } }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                      placeholder={isTooLarge ? t('jsonViewer.searchDisabled') : t('jsonViewer.searchPlaceholder')}
                      className={`w-full bg-white/[0.045] border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] h-8 pl-8 pr-8 rounded-lg text-[12px] focus:outline-none focus:border-[#3069f0]/50 transition-all duration-300 border ${isTooLarge ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    {searchMatches.length > 0 && !isTooLarge && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-black/40 rounded-md px-1.5 py-0.5 border border-white/[0.06]">
                        <span className="text-[10px] font-mono text-white/60">
                          {currentMatchIndex + 1}/{searchMatches.length}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-1 shrink-0">
                    <Button
                      onClick={handleCopy}
                      disabled={isCopying || isProcessing || isTooLarge}
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-7 min-w-[32px] px-2 bg-white/[0.04] text-[#8a919e] hover:bg-white/[0.07] hover:text-[#c8ccd4] border border-white/[0.07] rounded-lg transition-all flex items-center justify-center"
                      title={t('jsonViewer.copy')}
                    >
                      {isCopying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline-block ml-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">{t('jsonViewer.copy')}</span>
                    </Button>
                    <Button
                      onClick={handleDownload}
                      disabled={isProcessing}
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-7 min-w-[32px] px-2 bg-white/[0.04] text-[#8a919e] hover:bg-white/[0.07] hover:text-[#c8ccd4] border border-white/[0.07] rounded-lg transition-all flex items-center justify-center"
                      title={t('jsonViewer.download')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline-block ml-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">{t('jsonViewer.download')}</span>
                    </Button>
                  </div>
                </div>
              </div>

              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <div className="h-[104px] relative pointer-events-none" />
                <div className="px-5 pb-6 sm:px-6">
                  {isProcessing ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <div className="relative">
                        <Loader2 className="h-10 w-10 animate-spin text-white/20" />
                        <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-[#5b8af5]/50 animate-pulse" />
                      </div>
                      <p className="text-xs font-medium tracking-wide text-white/40 uppercase">{t('jsonViewer.processingJson')}</p>
                    </div>
                  ) : (
                    <div className="relative group">
                      <div className="absolute -inset-4 bg-gradient-to-br from-[#3069f0]/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      {isTooLarge ? (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl space-y-6">
                          <div className="relative">
                            <div className="absolute -inset-4 bg-amber-500/20 blur-2xl rounded-full" />
                            <AlertTriangle className="h-16 w-16 text-amber-400 relative" />
                          </div>
                          <div className="space-y-2 max-w-sm">
                            <h3 className="text-lg font-bold text-white/90">{t('jsonViewer.tooLargeTitle')}</h3>
                            <p className="text-sm text-white/50 leading-relaxed">
                              {t('jsonViewer.tooLargeDescription', { size: (fileSize / 1024 / 1024).toFixed(1) })}
                            </p>
                          </div>
                          <div className="flex flex-col w-full gap-3 pt-4">
                            <Button onClick={handleDownload} className="h-12 bg-[#3069f0] hover:bg-[#3f78f5] text-white font-bold rounded-[10px] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                              <Download className="w-5 h-5" />
                              {t('jsonViewer.downloadToView')}
                            </Button>
                            <p className="text-[10px] text-white/30 uppercase font-mono tracking-widest">{(fileSize / 1024).toFixed(0)} KB • HUGE DATA</p>
                          </div>
                        </div>
                      ) : (
                        <pre ref={preRef} className="relative text-[10.5px] font-mono bg-[#08090c] rounded-[10px] p-3 overflow-auto text-[#9aa3b2] leading-relaxed border border-white/[0.06]" dangerouslySetInnerHTML={{ __html: activeSearchQuery ? highlightedJsonString : jsonString }} />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {searchMatches.length > 0 && activeSearchQuery && !isTooLarge && (
                  <motion.div initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 20 }} className="absolute bottom-8 right-8 z-50 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5 p-1.5 bg-[#0f1116]/90 backdrop-blur-xl rounded-[10px] border border-white/10 shadow-xl">
                      <Button onClick={handlePreviousMatch} variant="ghost" size="sm" className="w-10 h-10 rounded-lg bg-white/[0.05] text-[#c8ccd4] hover:bg-white/[0.09] hover:text-white border border-white/[0.07] flex items-center justify-center p-0 transition-all active:scale-90">
                        <ChevronUp className="w-6 h-6" />
                      </Button>
                      <div className="h-px bg-white/5 mx-2" />
                      <Button onClick={handleNextMatch} variant="ghost" size="sm" className="w-10 h-10 rounded-lg bg-white/[0.05] text-[#c8ccd4] hover:bg-white/[0.09] hover:text-white border border-white/[0.07] flex items-center justify-center p-0 transition-all active:scale-90">
                        <ChevronDown className="w-6 h-6" />
                      </Button>
                    </div>
                    <motion.div layout className="bg-[#3069f0] text-white font-mono text-[10px] font-bold px-2.5 py-1 rounded-md shadow-lg flex items-center justify-center min-w-[50px] self-center">
                      {currentMatchIndex + 1} / {searchMatches.length}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
