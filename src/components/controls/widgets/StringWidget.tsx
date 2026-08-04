/**
 * StringWidget Component
 *
 * Handles STRING type parameters with multi-line text input control
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ClipboardPaste, Copy, Download, HardDrive, KeyRound, Languages, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getAllApiKeys } from '@/infrastructure/storage/ApiKeyStorageService';
import {
  createTranslationDraftId,
  deleteTranslationDraft,
  getTranslationDraft,
  saveTranslationDraft,
  type TranslationDraft
} from '@/infrastructure/storage/TranslationDraftStorageService';
import {
  getLocalTranslationStatus,
  installLocalTranslationPairs,
  loadTranslationPreferences,
  requiredLocalTranslationPairs,
  saveTranslationPreferences,
  startLocalTranslationEngineInstall,
  translateText,
  TranslationServiceError,
  type LocalTranslationStatus,
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

const TARGET_LANGUAGES: TranslationTargetLanguage[] = [
  'EN', 'ZH-HANS', 'KO', 'JA', 'DE', 'FR', 'ES', 'IT', 'PT', 'RU'
];

type DraftMode = 'source' | 'translated' | null;

export const StringWidget: React.FC<StringWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  widget,
  node
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const serverUrl = useConnectionStore((state) => state.url);
  const [showTranslationPanel, setShowTranslationPanel] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isInstallingLocalPacks, setIsInstallingLocalPacks] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalTranslationStatus | null>(null);
  const [pendingRequiredPairs, setPendingRequiredPairs] = useState<string[]>([]);
  const [translationDraft, setTranslationDraft] = useState<TranslationDraft | null>(null);
  const [draftMode, setDraftMode] = useState<DraftMode>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(true);
  const [translationPreferences, setTranslationPreferences] = useState<TranslationPreferences>(loadTranslationPreferences);
  const [availableProviders, setAvailableProviders] = useState<Record<TranslationProvider, boolean>>({
    groq: false,
    deepl: false,
    argos: false
  });
  const editingValueRef = useRef(editingValue);
  const storageScope = location.pathname || 'unknown-workflow';
  const translationDraftId = useMemo(
    () => node ? createTranslationDraftId(storageScope, node.id, param.name) : null,
    [node, param.name, storageScope]
  );

  useEffect(() => {
    editingValueRef.current = editingValue;
  }, [editingValue]);

  useEffect(() => {
    let cancelled = false;
    setTranslationDraft(null);
    setDraftMode(null);

    if (!translationDraftId) {
      setIsDraftLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsDraftLoading(true);
    getTranslationDraft(translationDraftId).then((draft) => {
      if (cancelled) return;
      setTranslationDraft(draft);
      const currentValue = String(editingValueRef.current ?? '');
      if (draft && currentValue === draft.sourceText) {
        setDraftMode('source');
      } else if (draft && currentValue === draft.translatedText) {
        setDraftMode('translated');
      }
    }).catch((error) => {
      console.error('Failed to load translation source draft:', error);
    }).finally(() => {
      if (!cancelled) setIsDraftLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [translationDraftId]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getAllApiKeys(),
      getLocalTranslationStatus(serverUrl)
    ]).then(([keysResult, localStatusResult]) => {
      if (cancelled) return;
      const keys = keysResult.status === 'fulfilled' ? keysResult.value : [];
      const status = localStatusResult.status === 'fulfilled' ? localStatusResult.value : null;
      setLocalStatus(status);
      setAvailableProviders({
        groq: keys.some((key) => key.provider === 'groq' && key.isActive),
        deepl: keys.some((key) => key.provider === 'deepl' && key.isActive),
        argos: status?.engine_available || false
      });
    });

    return () => {
      cancelled = true;
    };
  }, [serverUrl, showTranslationPanel]);

  useEffect(() => {
    if (localStatus?.engine_install?.state !== 'running') return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      getLocalTranslationStatus(serverUrl).then((status) => {
        if (cancelled) return;
        setLocalStatus(status);
        setAvailableProviders((current) => ({
          ...current,
          argos: status.engine_available
        }));
      }).catch((error) => {
        console.error('Failed to poll local translation installation:', error);
      });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [localStatus?.engine_install?.state, serverUrl]);

  const updateTranslationPreferences = (next: Partial<TranslationPreferences>) => {
    if (next.sourceLanguage || next.targetLanguage) {
      setPendingRequiredPairs([]);
    }
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

  const applyValueChange = (newValue: string) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  const handleValueChange = (newValue: string) => {
    if (draftMode === 'translated' && newValue !== translationDraft?.translatedText) {
      setDraftMode(null);
    }
    applyValueChange(newValue);
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
    const sourceText = draftMode === 'translated' && translationDraft
      ? translationDraft.sourceText
      : String(editingValue || '');
    if (!sourceText.trim()) {
      toast.error(t('translationWidget.messages.emptyText'));
      return;
    }

    if (!translationDraftId || !node) {
      toast.error(t('translationWidget.messages.sourceSaveFailed'));
      return;
    }

    setIsTranslating(true);
    const sourceDraft: TranslationDraft = {
      id: translationDraftId,
      scope: storageScope,
      nodeId: node.id,
      widgetName: param.name,
      sourceText,
      translatedText: translationDraft?.translatedText || '',
      sourceLanguage: translationPreferences.sourceLanguage,
      targetLanguage: translationPreferences.targetLanguage,
      provider: translationPreferences.provider,
      updatedAt: new Date().toISOString()
    };

    try {
      await saveTranslationDraft(sourceDraft);
      setTranslationDraft(sourceDraft);
    } catch (error) {
      console.error('Failed to preserve translation source text:', error);
      toast.error(t('translationWidget.messages.sourceSaveFailed'));
      setIsTranslating(false);
      return;
    }

    try {
      const result = await translateText({
        text: sourceText,
        serverUrl,
        ...translationPreferences
      });

      const completedDraft: TranslationDraft = {
        ...sourceDraft,
        translatedText: result.text,
        updatedAt: new Date().toISOString()
      };
      try {
        await saveTranslationDraft(completedDraft);
      } catch (error) {
        console.error('Failed to save the latest translated value:', error);
      }
      setTranslationDraft(completedDraft);
      setDraftMode('translated');
      applyValueChange(result.text);
      setShowTranslationPanel(false);
    } catch (error) {
      if (error instanceof TranslationServiceError && error.code === 'missing-key') {
        toast.error(t('translationWidget.messages.missingKey', { provider: providerName }));
        setShowTranslationPanel(true);
      } else if (error instanceof TranslationServiceError && error.code === 'missing-server') {
        toast.error(t('translationWidget.messages.missingServer'));
      } else if (error instanceof TranslationServiceError && error.providerCode === 'LANGUAGE_PACK_MISSING') {
        setShowTranslationPanel(true);
        if (translationPreferences.sourceLanguage === 'auto') {
          setPendingRequiredPairs([]);
          toast.error(t('translationWidget.messages.selectSourceForLanguagePack'));
        } else {
          setPendingRequiredPairs(error.requiredPairs);
          toast.error(t('translationWidget.messages.missingLanguagePack'));
        }
      } else if (error instanceof TranslationServiceError && error.providerCode === 'LANGUAGE_UNCERTAIN') {
        setShowTranslationPanel(true);
        toast.error(t('translationWidget.messages.languageUncertain'));
      } else if (error instanceof TranslationServiceError && error.providerCode === 'LOCAL_ENGINE_MISSING') {
        setShowTranslationPanel(true);
        toast.error(t('translationWidget.messages.localEngineMissing'));
      } else {
        console.error('Translation failed:', error);
        toast.error(t('translationWidget.messages.failed'));
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRestoreSource = () => {
    if (!translationDraft) return;
    setDraftMode('source');
    applyValueChange(translationDraft.sourceText);
  };

  const handleShowTranslation = () => {
    if (!translationDraft?.translatedText) return;
    setDraftMode('translated');
    applyValueChange(translationDraft.translatedText);
  };

  const handleDeleteSource = async () => {
    if (!translationDraftId || !window.confirm(t('translationWidget.confirmDeleteSource'))) return;

    try {
      await deleteTranslationDraft(translationDraftId);
      setTranslationDraft(null);
      setDraftMode(null);
      toast.success(t('translationWidget.messages.sourceDeleted'));
    } catch (error) {
      console.error('Failed to delete translation source text:', error);
      toast.error(t('translationWidget.messages.sourceDeleteFailed'));
    }
  };

  const configuredLocalPairs = requiredLocalTranslationPairs(
    translationPreferences.sourceLanguage,
    translationPreferences.targetLanguage
  );
  const localPairsToCheck = translationPreferences.sourceLanguage === 'auto'
    ? []
    : pendingRequiredPairs.length > 0 ? pendingRequiredPairs : configuredLocalPairs;
  const missingLocalPairs = localPairsToCheck.filter(
    (pair) => !localStatus?.installed_pairs.includes(pair)
  );

  const handleInstallLocalPacks = async () => {
    if (missingLocalPairs.length === 0) return;
    setIsInstallingLocalPacks(true);
    try {
      const installedPairs = await installLocalTranslationPairs(serverUrl, missingLocalPairs);
      setLocalStatus((current) => current ? { ...current, installed_pairs: installedPairs } : current);
      setPendingRequiredPairs([]);
      toast.success(t('translationWidget.messages.languagePackInstalled'));
    } catch (error) {
      console.error('Local language-pack installation failed:', error);
      toast.error(t('translationWidget.messages.languagePackInstallFailed'));
    } finally {
      setIsInstallingLocalPacks(false);
    }
  };

  const handleInstallLocalEngine = async () => {
    try {
      const engineInstall = await startLocalTranslationEngineInstall(serverUrl);
      setLocalStatus((current) => current ? { ...current, engine_install: engineInstall } : current);
      toast.info(t('translationWidget.messages.engineInstallStarted'));
    } catch (error) {
      console.error('Local translation engine installation failed to start:', error);
      toast.error(t('translationWidget.messages.engineInstallFailed'));
    }
  };

  const isSecureContext = window.isSecureContext && navigator.clipboard;
  const providerName = translationPreferences.provider === 'groq'
    ? 'Groq'
    : translationPreferences.provider === 'deepl' ? 'DeepL' : 'Argos';
  const targetShortName = translationPreferences.targetLanguage === 'ZH-HANS'
    ? '简中'
    : translationPreferences.targetLanguage;
  const selectedProviderAvailable = availableProviders[translationPreferences.provider];
  const engineInstallState = localStatus?.engine_install?.state || 'idle';
  const isInstallingLocalEngine = engineInstallState === 'running';
  const localEngineNeedsRestart = engineInstallState === 'restart_required';
  const translateActionLabel = draftMode === 'translated'
    ? t('translationWidget.retranslateSource')
    : t('translationWidget.translate');
  const draftStatusLabel = draftMode === 'source'
    ? t('translationWidget.sourceEditing')
    : draftMode === 'translated'
      ? t('translationWidget.translationShown')
      : t('translationWidget.sourceAvailable');

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
              disabled={isTranslating || isDraftLoading}
              className="h-8 rounded-r-none border-r-0 border-white/[0.1] px-2 text-xs hover:bg-[#3069f0]/10 hover:text-[#7ba3f5]"
              title={translateActionLabel}
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
                <option value="argos">Local · Argos{availableProviders.argos ? '' : ` · ${t('translationWidget.engineMissing')}`}</option>
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

          {translationPreferences.provider === 'argos' && !selectedProviderAvailable && (
            <p className="mt-2.5 rounded-lg border border-[#f2a65a]/15 bg-[#f2a65a]/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-[#c79361]">
              {localEngineNeedsRestart
                ? t('translationWidget.localRestartHint')
                : engineInstallState === 'failed'
                  ? t('translationWidget.localInstallFailedHint')
                  : t('translationWidget.localInstallHint')}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            {translationPreferences.provider === 'argos' && !selectedProviderAvailable ? (
              <button
                type="button"
                onClick={handleInstallLocalEngine}
                disabled={isInstallingLocalEngine || localEngineNeedsRestart}
                className="flex min-w-0 items-center gap-1.5 text-left text-[10.5px] text-[#f2a65a] hover:text-[#ffc17d] disabled:opacity-60"
              >
                {isInstallingLocalEngine
                  ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  : <Download className="h-3 w-3 shrink-0" />}
                <span className="truncate">
                  {isInstallingLocalEngine
                    ? t('translationWidget.installingLocalEngine')
                    : localEngineNeedsRestart
                      ? t('translationWidget.restartRequired')
                      : t('translationWidget.installLocalEngine')}
                </span>
              </button>
            ) : translationPreferences.provider === 'argos' && missingLocalPairs.length > 0 ? (
              <button
                type="button"
                onClick={handleInstallLocalPacks}
                disabled={isInstallingLocalPacks}
                className="flex min-w-0 items-center gap-1.5 text-left text-[10.5px] text-[#7ba3f5] hover:text-[#a8c1fa] disabled:opacity-50"
              >
                {isInstallingLocalPacks
                  ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  : <Download className="h-3 w-3 shrink-0" />}
                <span className="truncate">
                  {isInstallingLocalPacks
                    ? t('translationWidget.installingLanguagePack')
                    : t('translationWidget.installLanguagePack', { count: missingLocalPairs.length })}
                </span>
              </button>
            ) : selectedProviderAvailable ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[#65b887]">
                {translationPreferences.provider === 'argos'
                  ? <HardDrive className="h-3 w-3 shrink-0" />
                  : <KeyRound className="h-3 w-3 shrink-0" />}
                <span className="truncate">
                  {translationPreferences.provider === 'argos'
                    ? t('translationWidget.localReady')
                    : t('translationWidget.keyReady', { provider: providerName })}
                </span>
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
              disabled={isTranslating || isDraftLoading || isInstallingLocalPacks || isInstallingLocalEngine || !selectedProviderAvailable || (translationPreferences.provider === 'argos' && missingLocalPairs.length > 0)}
              className="h-8 shrink-0 rounded-lg bg-[#3069f0] px-3 text-[11.5px] text-white hover:bg-[#3f78f5] disabled:opacity-45"
            >
              {isTranslating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Languages className="mr-1.5 h-3.5 w-3.5" />}
              {isTranslating ? t('translationWidget.translating') : translateActionLabel}
            </Button>
          </div>
        </div>
      )}

      {!isDraftLoading && translationDraft && (
        <div className="flex items-center gap-2 rounded-lg border border-[#3069f0]/20 bg-[#3069f0]/[0.07] px-2.5 py-2">
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-[#7ba3f5]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-medium text-[#a8c1fa]">{draftStatusLabel}</p>
            <p className="truncate text-[9.5px] text-[#66758a]">{t('translationWidget.localOnlyHint')}</p>
          </div>
          {draftMode === 'source' && translationDraft.translatedText ? (
            <button
              type="button"
              onClick={handleShowTranslation}
              disabled={isTranslating}
              className="shrink-0 text-[10.5px] font-medium text-[#7ba3f5] hover:text-[#a8c1fa] disabled:opacity-50"
            >
              {t('translationWidget.showTranslation')}
            </button>
          ) : draftMode !== 'source' ? (
            <button
              type="button"
              onClick={handleRestoreSource}
              disabled={isTranslating}
              className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-[#7ba3f5] hover:text-[#a8c1fa] disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              {t('translationWidget.restoreSource')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDeleteSource}
            disabled={isTranslating}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#66758a] hover:bg-white/[0.05] hover:text-[#e16f7a] disabled:opacity-50"
            title={t('translationWidget.deleteSource')}
            aria-label={t('translationWidget.deleteSource')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      <Textarea
        value={String(editingValue)}
        onChange={(event) => handleValueChange(event.target.value)}
        disabled={isTranslating}
        className="text-[14px] resize-y disabled:cursor-wait disabled:opacity-70"
        rows={6}
        placeholder={t('node.enterText')}
      />
    </div>
  );
};
