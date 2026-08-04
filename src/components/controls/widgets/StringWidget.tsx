/**
 * StringWidget Component
 *
 * Handles STRING type parameters with multi-line text input control
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ClipboardPaste, Copy, KeyRound, Languages, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getAllApiKeys } from '@/infrastructure/storage/ApiKeyStorageService';
import {
  loadTranslationPreferences,
  saveTranslationPreferences,
  translateText,
  TranslationServiceError,
  type TranslationPreferences,
  type TranslationProvider,
  type TranslationSourceLanguage,
  type TranslationTargetLanguage
} from '@/infrastructure/translation/TranslationService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { StringWidgetProps } from './types';

// Export supported types for this widget
export const StringWidgetSupportedTypes = ['STRING'] as const;

const SOURCE_LANGUAGES: TranslationSourceLanguage[] = [
  'auto', 'EN', 'KO', 'JA', 'ZH', 'DE', 'FR', 'ES', 'IT', 'PT', 'RU'
];

const TARGET_LANGUAGES: TranslationTargetLanguage[] = ['EN', 'ZH-HANS'];

export const StringWidget: React.FC<StringWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  widget,
  node
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serverUrl = useConnectionStore((state) => state.url);
  const [showTranslationPanel, setShowTranslationPanel] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationPreferences, setTranslationPreferences] = useState<TranslationPreferences>(loadTranslationPreferences);
  const [availableProviders, setAvailableProviders] = useState<Record<TranslationProvider, boolean>>({
    groq: false,
    deepl: false
  });

  useEffect(() => {
    let cancelled = false;
    getAllApiKeys().then((keys) => {
      if (cancelled) return;
      setAvailableProviders({
        groq: keys.some((key) => key.provider === 'groq' && key.isActive),
        deepl: keys.some((key) => key.provider === 'deepl' && key.isActive)
      });
    });

    return () => {
      cancelled = true;
    };
  }, [showTranslationPanel]);

  const updateTranslationPreferences = (next: Partial<TranslationPreferences>) => {
    setTranslationPreferences((current) => {
      const updated = { ...current, ...next };
      saveTranslationPreferences(updated);
      return updated;
    });
  };

  // Clipboard helper function with fallback
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }

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
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  };

  const pasteFromClipboard = async (): Promise<string | null> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return await navigator.clipboard.readText();
      }
      toast.info(t('node.pasteShortcutTip'));
      return null;
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      toast.info(t('node.pasteShortcutTip'));
      return null;
    }
  };

  const executeWidgetCallback = (value: unknown) => {
    if (widget?.callback && node) {
      try {
        widget.callback(value, node);
      } catch (error) {
        console.error('Widget callback error:', error);
      }
    }
  };

  const handleValueChange = (newValue: string) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(String(editingValue || ''));
    if (success) {
      toast.success(t('node.textCopied'));
    } else {
      toast.error(t('node.failedToCopy'));
    }
  };

  const handlePaste = async () => {
    const pastedText = await pasteFromClipboard();
    if (pastedText !== null) {
      handleValueChange(pastedText);
      toast.success(t('node.textPasted'));
    }
  };

  const handleTranslate = async () => {
    const sourceText = String(editingValue || '');
    if (!sourceText.trim()) {
      toast.error(t('translationWidget.messages.emptyText'));
      return;
    }

    setIsTranslating(true);
    try {
      const result = await translateText({
        text: sourceText,
        serverUrl,
        ...translationPreferences
      });
      handleValueChange(result.text);
      toast.success(t('translationWidget.messages.complete'));
      setShowTranslationPanel(false);
    } catch (error) {
      if (error instanceof TranslationServiceError && error.code === 'missing-key') {
        toast.error(t('translationWidget.messages.missingKey', { provider: providerName }));
        setShowTranslationPanel(true);
      } else if (error instanceof TranslationServiceError && error.code === 'missing-server') {
        toast.error(t('translationWidget.messages.missingServer'));
      } else {
        console.error('Translation failed:', error);
        toast.error(t('translationWidget.messages.failed'));
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const isSecureContext = window.isSecureContext && navigator.clipboard;
  const providerName = translationPreferences.provider === 'groq' ? 'Groq' : 'DeepL';
  const targetShortName = translationPreferences.targetLanguage === 'EN' ? 'EN' : '简中';
  const selectedProviderAvailable = availableProviders[translationPreferences.provider];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <label className="min-w-0 pt-2 text-[12px] font-medium text-[#c8ccd4] truncate">
          {param.label || param.name}
        </label>
        <div className="flex shrink-0 gap-1.5">
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTranslate}
              disabled={isTranslating}
              className="h-8 rounded-r-none border-r-0 border-white/[0.1] px-2 text-xs hover:bg-[#3069f0]/10 hover:text-[#7ba3f5]"
              title={t('translationWidget.translate')}
            >
              {isTranslating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Languages className="mr-1 h-3.5 w-3.5" />}
              <span>{providerName} · {targetShortName}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTranslationPanel((current) => !current)}
              className={`h-8 w-7 rounded-l-none border-white/[0.1] px-0 ${showTranslationPanel ? 'bg-[#3069f0]/15 text-[#7ba3f5] border-[#3069f0]/30' : 'hover:bg-[#3069f0]/10 hover:text-[#7ba3f5]'}`}
              title={t('translationWidget.openSettings')}
              aria-expanded={showTranslationPanel}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showTranslationPanel ? 'rotate-180' : ''}`} />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/50"
            title={t('node.copyToClipboard')}
          >
            <Copy className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">{t('common.copy')}</span>
          </Button>
          {isSecureContext && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePaste}
              className="h-8 px-2 text-xs hover:bg-green-50 dark:hover:bg-green-950/50"
              title={t('node.pasteFromClipboard')}
            >
              <ClipboardPaste className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">{t('common.paste')}</span>
            </Button>
          )}
        </div>
      </div>

      {showTranslationPanel && (
        <div className="rounded-xl border border-white/[0.09] bg-[#111319] p-3 shadow-[0_10px_30px_rgba(0,0,0,.24)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[12.5px] font-semibold text-[#e9ebef]">{t('translationWidget.title')}</p>
              <p className="mt-0.5 text-[10.5px] text-[#66758a]">{t('translationWidget.description')}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTranslationPanel(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#66758a] hover:bg-white/[0.05] hover:text-[#c8ccd4]"
              title={t('translationWidget.close')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="min-w-0">
              <span className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#565d6b]">
                {t('translationWidget.provider')}
              </span>
              <select
                value={translationPreferences.provider}
                onChange={(event) => updateTranslationPreferences({ provider: event.target.value as TranslationProvider })}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#191c23] px-2.5 text-[11.5px] text-[#e9ebef] outline-none focus:border-[#5b8af5]/50"
              >
                <option value="groq">Groq{availableProviders.groq ? '' : ` · ${t('translationWidget.noKey')}`}</option>
                <option value="deepl">DeepL{availableProviders.deepl ? '' : ` · ${t('translationWidget.noKey')}`}</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#565d6b]">
                {t('translationWidget.targetLanguage')}
              </span>
              <select
                value={translationPreferences.targetLanguage}
                onChange={(event) => updateTranslationPreferences({ targetLanguage: event.target.value as TranslationTargetLanguage })}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#191c23] px-2.5 text-[11.5px] text-[#e9ebef] outline-none focus:border-[#5b8af5]/50"
              >
                {TARGET_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{t(`translationWidget.languages.${language}`)}</option>
                ))}
              </select>
            </label>

            <label className="col-span-2 min-w-0">
              <span className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#565d6b]">
                {t('translationWidget.sourceLanguage')}
              </span>
              <select
                value={translationPreferences.sourceLanguage}
                onChange={(event) => updateTranslationPreferences({ sourceLanguage: event.target.value as TranslationSourceLanguage })}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#191c23] px-2.5 text-[11.5px] text-[#e9ebef] outline-none focus:border-[#5b8af5]/50"
              >
                {SOURCE_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{t(`translationWidget.languages.${language}`)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            {selectedProviderAvailable ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[#65b887]">
                <KeyRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{t('translationWidget.keyReady', { provider: providerName })}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/settings/api-keys')}
                className="flex min-w-0 items-center gap-1.5 text-left text-[10.5px] text-[#f2a65a] hover:text-[#ffc17d]"
              >
                <KeyRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{t('translationWidget.addKey', { provider: providerName })}</span>
              </button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleTranslate}
              disabled={isTranslating || !selectedProviderAvailable}
              className="h-8 shrink-0 rounded-lg bg-[#3069f0] px-3 text-[11.5px] text-white hover:bg-[#3f78f5] disabled:opacity-45"
            >
              {isTranslating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Languages className="mr-1.5 h-3.5 w-3.5" />}
              {isTranslating ? t('translationWidget.translating') : t('translationWidget.translate')}
            </Button>
          </div>
        </div>
      )}

      <Textarea
        value={String(editingValue)}
        onChange={(event) => handleValueChange(event.target.value)}
        className="text-[14px] resize-y"
        rows={6}
        placeholder={t('node.enterText')}
      />
    </div>
  );
};
