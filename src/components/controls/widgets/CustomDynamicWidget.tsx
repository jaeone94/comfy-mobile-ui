/**
 * CustomDynamicWidget Component
 * 
 * Dynamic widget component that renders UI elements based on custom field definitions.
 * Replaces hardcoded widgets like LoraConfigWidget with a flexible, field-driven approach.
 * 
 * Supports field types:
 * - boolean: Switch/toggle component
 * - float: Slider with min/max/step configuration
 * - lora: LoRA file selector with search and browse
 * - string: Text input field
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseWidgetProps } from './types';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { ChevronDown, Search, X } from 'lucide-react';

export interface CustomDynamicWidgetProps extends BaseWidgetProps {
  /** The custom widget type from field definitions */
  customType: string;

  /** Field definitions from custom widget metadata */
  fields: Record<string, any>;

  /** Current widget values as object */
  editingValue: Record<string, any>;
}

// Field renderer components
interface FieldRendererProps {
  fieldName: string;
  fieldConfig: any;
  value: any;
  onChange: (value: any) => void;
}

const BooleanFieldRenderer: React.FC<FieldRendererProps> = ({ fieldName, fieldConfig, value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-slate-600 dark:text-slate-400">
        {fieldConfig.label || fieldName}
      </label>
      <Switch
        checked={Boolean(value)}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-green-600"
      />
    </div>
  );
};

const IntFieldRenderer: React.FC<FieldRendererProps> = ({ fieldName, fieldConfig, value, onChange }) => {
  const { t } = useTranslation();
  const hasMinMax = fieldConfig.min !== undefined && fieldConfig.max !== undefined;
  const min = fieldConfig.min;
  const max = fieldConfig.max;
  const step = fieldConfig.step !== undefined ? fieldConfig.step : 1;
  const currentValue = Number(value) || fieldConfig.default || 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 dark:text-slate-400">
          {fieldConfig.label || fieldName}
        </label>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {currentValue}
        </span>
      </div>

      {hasMinMax ? (
        <>
          {/* Slider mode - when min/max are defined */}
          <div
            className="px-2"
            style={{
              touchAction: 'pan-x pinch-zoom',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              KhtmlUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              userSelect: 'none'
            }}
          >
            <Slider
              value={[currentValue]}
              onValueChange={(values) => onChange(Math.round(values[0]))}
              min={min}
              max={max}
              step={step}
              className="w-full"
              data-slider="true"
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            />
          </div>

          {/* Manual Input with constraints */}
          <Input
            type="number"
            value={String(currentValue)}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            className="text-center text-lg font-medium"
          />
        </>
      ) : (
        <>
          {/* Input-only mode - when min/max are not defined */}
          <Input
            type="number"
            value={String(currentValue)}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            step={step}
            className="text-center text-lg font-medium"
            placeholder={t('node.enterIntegerValue')}
          />
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
            {t('node.defineMinMaxForSlider')}
          </p>
        </>
      )}
    </div>
  );
};

const FloatFieldRenderer: React.FC<FieldRendererProps> = ({ fieldName, fieldConfig, value, onChange }) => {
  const { t } = useTranslation();
  const hasMinMax = fieldConfig.min !== undefined && fieldConfig.max !== undefined;
  const min = fieldConfig.min;
  const max = fieldConfig.max;
  const step = fieldConfig.step !== undefined ? fieldConfig.step : 0.1;
  const currentValue = Number(value) || fieldConfig.default || 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 dark:text-slate-400">
          {fieldConfig.label || fieldName}
        </label>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {currentValue.toFixed(2)}
        </span>
      </div>

      {hasMinMax ? (
        <>
          {/* Slider mode - when min/max are defined */}
          <div
            className="px-2"
            style={{
              touchAction: 'pan-x pinch-zoom',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              KhtmlUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              userSelect: 'none'
            }}
          >
            <Slider
              value={[currentValue]}
              onValueChange={(values) => onChange(Math.round(values[0] * 100) / 100)}
              min={min}
              max={max}
              step={step}
              className="w-full"
              data-slider="true"
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            />
          </div>

          {/* Manual Input with constraints */}
          <Input
            type="number"
            value={String(currentValue)}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            className="text-center text-lg font-medium"
          />
        </>
      ) : (
        <>
          {/* Input-only mode - when min/max are not defined */}
          <Input
            type="number"
            value={String(currentValue)}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            step={step}
            className="text-center text-lg font-medium"
            placeholder={t('node.enterFloatValue')}
          />
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
            {t('node.defineMinMaxForSlider')}
          </p>
        </>
      )}
    </div>
  );
};

const LoraFieldRenderer: React.FC<FieldRendererProps> = ({ fieldName, fieldConfig, value, onChange }) => {
  const { t } = useTranslation();
  const [loraList, setLoraList] = useState<Array<{
    name: string;
    path: string;
    size: number;
    size_mb: number;
    subfolder?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load LoRA list on component mount
  useEffect(() => {
    const loadLoraList = async () => {
      setIsLoading(true);
      try {
        const response = await ComfyUIService.getLoraList();
        if (response.success) {
          const loraModels = response.models || response.loras || [];
          // Filter out models smaller than 1MB (1,048,576 bytes)
          const MIN_FILE_SIZE = 1024 * 1024; // 1MB in bytes
          const filteredModels = loraModels.filter(lora => lora.size >= MIN_FILE_SIZE);
          setLoraList(filteredModels);
        } else {
          console.error('Failed to load LoRA list:', response.error);
        }
      } catch (error) {
        console.error('Error loading LoRA list:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLoraList();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  // Advanced search with fuzzy matching and scoring for LoRA files
  const getLoraSearchMatches = (loraFiles: any[], query: string) => {
    if (!query.trim()) {
      return loraFiles.map((lora, index) => ({ lora, score: 0, originalIndex: index }));
    }

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    const scoredLoraFiles = loraFiles.map((lora, originalIndex) => {
      const loraName = lora.name.toLowerCase();
      let totalScore = 0;

      // 1. Exact match (highest score)
      if (loraName === query.toLowerCase()) {
        totalScore += 1000;
      }

      // 2. Starts with query (high score)
      if (loraName.startsWith(query.toLowerCase())) {
        totalScore += 500;
      }

      // 3. Contains exact query (medium-high score)
      if (loraName.includes(query.toLowerCase())) {
        totalScore += 300;
      }

      // 4. All search terms found (flexible matching)
      const foundTerms = searchTerms.filter(term => loraName.includes(term));
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
            const term1Index = loraName.indexOf(searchTerms[i]);
            const term2Index = loraName.indexOf(searchTerms[i + 1]);
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
          if (wordBoundaryRegex.test(loraName)) {
            totalScore += 25;
          }
        });

        // Special bonus for LoRA-specific patterns
        searchTerms.forEach(term => {
          // Bonus for matching version numbers
          if (/v\d+/i.test(term) && loraName.includes(term)) {
            totalScore += 40;
          }
          // Bonus for matching file extensions
          if (term.includes('.safetensors') || term.includes('.ckpt')) {
            totalScore += 20;
          }
        });

        // Penalty for length difference (shorter LoRA names preferred when scores are similar)
        const lengthPenalty = Math.max(0, loraName.length - query.length) * 0.3;
        totalScore -= lengthPenalty;
      }

      return {
        lora,
        score: totalScore,
        originalIndex,
        matchedTerms: foundTerms.length,
        totalTerms: searchTerms.length
      };
    });

    // Filter out non-matches and sort by score (descending)
    return scoredLoraFiles
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

  const loraSearchResults = getLoraSearchMatches(loraList, searchQuery);
  const filteredLoraList = loraSearchResults.map(result => result.lora);

  // Highlight matching text in LoRA names
  const highlightLoraMatches = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

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

  const handleLoraSelection = (loraName: string) => {
    onChange(loraName);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const clearLoraSelection = () => {
    onChange('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-600 dark:text-slate-400">
        {fieldConfig.label || fieldName}
      </label>
      <div className="relative" ref={dropdownRef}>
        <div className="flex">
          <Input
            type="text"
            value={value || ''}
            readOnly
            placeholder={isLoading ? t('node.loadingLoras') : t('node.clickToSelectLora')}
            className="text-sm pr-16 cursor-pointer"
            disabled={isLoading}
            onClick={() => setIsDropdownOpen(true)}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
            {value && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                onClick={clearLoraSelection}
                title={t('node.clearSelection')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isLoading}
              title={t('node.browseLoras')}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Dropdown */}
        {isDropdownOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-60 overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('node.searchLorasPlaceholder')}
                  className="w-full pl-7 pr-2 py-1 text-xs bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder-slate-400"
                />
              </div>
            </div>

            {/* LoRA list */}
            <div className="overflow-y-auto max-h-48">
              {filteredLoraList.length > 0 ? (
                filteredLoraList.map((lora) => (
                  <button
                    key={lora.path}
                    onClick={() => handleLoraSelection(lora.name)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 border-none outline-none text-sm"
                  >
                    <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {highlightLoraMatches(lora.name, searchQuery)}
                    </div>
                    {lora.subfolder && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {lora.subfolder}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {lora.size_mb.toFixed(1)} MB
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery ? t('node.noLorasMatch', { query: searchQuery }) : t('node.noLorasFound')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StringFieldRenderer: React.FC<FieldRendererProps> = ({ fieldName, fieldConfig, value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-600 dark:text-slate-400">
        {fieldConfig.label || fieldName}
      </label>
      <Input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fieldConfig.placeholder || t('node.enterValueFor', { name: fieldName })}
        className="text-sm"
      />
    </div>
  );
};

// Field renderer factory
const getFieldRenderer = (fieldType: string): React.FC<FieldRendererProps> => {
  switch (fieldType.toLowerCase()) {
    case 'boolean':
      return BooleanFieldRenderer;
    case 'int':
    case 'integer':
      return IntFieldRenderer;
    case 'float':
    case 'number':
      return FloatFieldRenderer;
    case 'lora':
      return LoraFieldRenderer;
    case 'string':
    default:
      return StringFieldRenderer;
  }
};

export const CustomDynamicWidget: React.FC<CustomDynamicWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  widget,
  node,
  customType,
  fields
}) => {
  const { t } = useTranslation();
  // Determine if this is a single field widget
  const fieldNames = Object.keys(fields);
  const isSingleField = fieldNames.length === 1;
  const singleFieldName = isSingleField ? fieldNames[0] : null;

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
  const handleValueChange = (newValue: any) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  // Handle specific field updates
  const updateField = (fieldName: string, value: any) => {
    if (isSingleField) {
      // For single field widgets, store the value directly (not as an object)
      handleValueChange(value);
    } else {
      // For multi-field widgets, use object structure
      const currentValue = typeof editingValue === 'object' && editingValue !== null
        ? editingValue
        : {};
      const newConfig = { ...currentValue, [fieldName]: value };
      handleValueChange(newConfig);
    }
  };

  // Get field value for rendering
  const getFieldValue = (fieldName: string, fieldConfig: any) => {
    if (isSingleField) {
      // For single field widgets, use editingValue directly
      return editingValue !== undefined ? editingValue : fieldConfig.default;
    } else {
      // For multi-field widgets, access field from object
      const objectValue = typeof editingValue === 'object' && editingValue !== null
        ? editingValue
        : {};
      return objectValue[fieldName] !== undefined
        ? objectValue[fieldName]
        : fieldConfig.default;
    }
  };

  return (
    <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {param.name}
        </h4>
        <Badge variant="outline" className="text-xs">
          {customType}
        </Badge>
      </div>

      {/* Render fields dynamically */}
      {Object.entries(fields).map(([fieldName, fieldConfig]) => {
        const FieldRenderer = getFieldRenderer(fieldConfig.type);
        const fieldValue = getFieldValue(fieldName, fieldConfig);

        return (
          <div key={fieldName}>
            <FieldRenderer
              fieldName={fieldName}
              fieldConfig={fieldConfig}
              value={fieldValue}
              onChange={(value) => updateField(fieldName, value)}
            />
            {fieldConfig.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {fieldConfig.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Export supported types for this widget
export const CustomDynamicWidgetSupportedTypes = ['CUSTOM_DYNAMIC'] as const;