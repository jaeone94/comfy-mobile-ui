/**
 * ComboWidget Component
 * 
 * Handles COMBO type parameters with searchable dropdown interface
 * Similar to LoraFieldRenderer from CustomDynamicWidget
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, Search, X } from 'lucide-react';

// Export supported types for this widget
export const ComboWidgetSupportedTypes = ['COMBO'] as const;
import { ComboWidgetProps } from './types';

export const ComboWidget: React.FC<ComboWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  options,
  widget,
  node
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Handle widget callback execution
  const executeWidgetCallback = (value: any) => {
    if (widget?.callback && node) {
      try {
        widget.callback(value, node as any);
      } catch (error) {
        console.error('Widget callback error:', error);
      }
    }
  };

  // Handle value change with widget callback
  const handleValueChange = (newValue: string | number) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  // Use provided options or fallback to param.possibleValues
  const selectOptions = options || param.possibleValues || [];

  // Update dropdown position and close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };

    const updatePosition = () => {
      if (inputContainerRef.current && isDropdownOpen) {
        const rect = inputContainerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        });
      }
    };

    if (isDropdownOpen) {
      updatePosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isDropdownOpen]);

  // Advanced search with fuzzy matching and scoring
  const getSearchMatches = (options: any[], query: string) => {
    if (!query.trim()) {
      return options.map((option, index) => ({ option, score: 0, originalIndex: index }));
    }

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    const scoredOptions = options.map((option, originalIndex) => {
      const optionText = String(option).toLowerCase();
      let totalScore = 0;

      // 1. Exact match (highest score)
      if (optionText === query.toLowerCase()) {
        totalScore += 1000;
      }

      // 2. Starts with query (high score)
      if (optionText.startsWith(query.toLowerCase())) {
        totalScore += 500;
      }

      // 3. Contains exact query (medium-high score)
      if (optionText.includes(query.toLowerCase())) {
        totalScore += 300;
      }

      // 4. All search terms found (flexible matching)
      const foundTerms = searchTerms.filter(term => optionText.includes(term));
      if (foundTerms.length > 0) {
        // Base score for having matches
        totalScore += foundTerms.length * 50;

        // Bonus for finding all terms
        if (foundTerms.length === searchTerms.length) {
          totalScore += 200;
        }

        // Bonus for term proximity (terms close together)
        if (searchTerms.length > 1) {
          let proximityBonus = 0;
          for (let i = 0; i < searchTerms.length - 1; i++) {
            const term1Index = optionText.indexOf(searchTerms[i]);
            const term2Index = optionText.indexOf(searchTerms[i + 1]);
            if (term1Index !== -1 && term2Index !== -1) {
              const distance = Math.abs(term2Index - term1Index);
              if (distance < 10) proximityBonus += 30;
              else if (distance < 20) proximityBonus += 15;
            }
          }
          totalScore += proximityBonus;
        }

        // Bonus for word boundary matches (more natural)
        searchTerms.forEach(term => {
          const wordBoundaryRegex = new RegExp(`\\b${term}`, 'i');
          if (wordBoundaryRegex.test(optionText)) {
            totalScore += 25;
          }
        });

        // Penalty for length difference (shorter options preferred when scores are similar)
        const lengthPenalty = Math.max(0, optionText.length - query.length) * 0.5;
        totalScore -= lengthPenalty;
      }

      return {
        option,
        score: totalScore,
        originalIndex,
        matchedTerms: foundTerms.length,
        totalTerms: searchTerms.length
      };
    });

    // Filter out non-matches and sort by score (descending)
    return scoredOptions
      .filter(item => item.score > 0)
      .sort((a, b) => {
        // Primary sort: score (descending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Secondary sort: match completeness (more matched terms first)
        if (b.matchedTerms !== a.matchedTerms) {
          return b.matchedTerms - a.matchedTerms;
        }
        // Tertiary sort: original order
        return a.originalIndex - b.originalIndex;
      });
  };

  const searchResults = getSearchMatches(selectOptions, searchQuery);
  const filteredOptions = searchResults.map(result => result.option);

  // Highlight matching text in options
  const highlightMatches = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    let highlightedText = text;

    // Create a map to track all matches
    const matches: { start: number; end: number; }[] = [];

    searchTerms.forEach(term => {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length });
        regex.lastIndex = match.index + 1; // Prevent infinite loops
      }
    });

    if (matches.length === 0) return text;

    // Sort matches by start position and merge overlapping
    matches.sort((a, b) => a.start - b.start);
    const mergedMatches: { start: number; end: number; }[] = [];

    matches.forEach(match => {
      if (mergedMatches.length === 0 || mergedMatches[mergedMatches.length - 1].end < match.start) {
        mergedMatches.push(match);
      } else {
        // Merge overlapping matches
        mergedMatches[mergedMatches.length - 1].end = Math.max(mergedMatches[mergedMatches.length - 1].end, match.end);
      }
    });

    // Build highlighted JSX
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    mergedMatches.forEach((match, index) => {
      // Add text before match
      if (match.start > lastEnd) {
        parts.push(text.slice(lastEnd, match.start));
      }

      // Add highlighted match
      parts.push(
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-600/30 text-slate-900 dark:text-slate-100 font-semibold rounded px-0.5"
        >
          {text.slice(match.start, match.end)}
        </mark>
      );

      lastEnd = match.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      parts.push(text.slice(lastEnd));
    }

    return <>{parts}</>;
  };

  const handleOptionSelection = (optionValue: string | number) => {
    handleValueChange(optionValue);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const clearSelection = () => {
    handleValueChange('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-600 dark:text-slate-400">
        {param.name}
      </label>
      <div className="relative" ref={inputContainerRef}>
        <div className="flex">
          <Input
            type="text"
            value={String(editingValue || '')}
            readOnly
            placeholder="Click dropdown to select option..."
            className="text-lg pr-16 cursor-pointer"
            onClick={() => setIsDropdownOpen(true)}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
            {editingValue && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                onClick={clearSelection}
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Browse options"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Dropdown Portal */}
        {isDropdownOpen && ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="z-[9999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-60 overflow-hidden"
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`
            }}
          >
            {/* Search input */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search options..."
                  className="w-full pl-7 pr-2 py-1 text-sm bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder-slate-400"
                />
              </div>
              {searchQuery && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {filteredOptions.length} match{filteredOptions.length !== 1 ? 'es' : ''} found
                </div>
              )}
            </div>

            {/* Options list */}
            <div className="overflow-y-auto max-h-48">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={String(option)}
                    onClick={() => handleOptionSelection(option)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 border-none outline-none text-sm transition-colors"
                  >
                    <div className="font-medium text-slate-700 dark:text-slate-300">
                      {highlightMatches(String(option), searchQuery)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery ? `No options match "${searchQuery}"` : 'No options available'}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};