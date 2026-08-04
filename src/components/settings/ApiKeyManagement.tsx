import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, KeyRound, Plus, Trash2, Eye, EyeOff, ShieldCheck, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  storeApiKey,
  getAllApiKeys,
  deleteApiKey,
  validateApiKey,
  getApiKey
} from '@/infrastructure/storage/ApiKeyStorageService';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ApiKeyInfo {
  id: string;
  provider: string;
  displayName: string;
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
  maskedKey: string;
}

const SUPPORTED_PROVIDERS = [
  {
    id: 'civitai',
    name: 'Civitai',
    descriptionKey: 'apiKeyManagement.providers.civitai.description',
    helpUrl: 'https://civitai.com/user/account',
    placeholderKey: 'apiKeyManagement.providers.civitai.placeholder'
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    descriptionKey: 'apiKeyManagement.providers.huggingface.description',
    helpUrl: 'https://huggingface.co/settings/tokens',
    placeholderKey: 'apiKeyManagement.providers.huggingface.placeholder'
  },
  {
    id: 'groq',
    name: 'Groq',
    descriptionKey: 'apiKeyManagement.providers.groq.description',
    helpUrl: 'https://console.groq.com/keys',
    placeholderKey: 'apiKeyManagement.providers.groq.placeholder'
  },
  {
    id: 'deepl',
    name: 'DeepL',
    descriptionKey: 'apiKeyManagement.providers.deepl.description',
    helpUrl: 'https://www.deepl.com/your-account/keys',
    placeholderKey: 'apiKeyManagement.providers.deepl.placeholder'
  }
];

export const ApiKeyManagement: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState('civitai');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [showKeyValue, setShowKeyValue] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const loadApiKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      const keys = await getAllApiKeys();
      setApiKeys(keys as ApiKeyInfo[]);
    } catch (error) {
      console.error('Failed to load API keys:', error);
      toast.error(t('apiKeyManagement.messages.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) {
      toast.error(t('apiKeyManagement.messages.enterKey'));
      return;
    }

    if (!validateApiKey(newKeyProvider, newKeyValue)) {
      toast.error(t('apiKeyManagement.messages.invalidFormat', { provider: SUPPORTED_PROVIDERS.find(p => p.id === newKeyProvider)?.name }));
      return;
    }

    setIsAdding(true);
    try {
      const success = await storeApiKey(
        newKeyProvider,
        newKeyValue.trim(),
        newKeyName.trim() || undefined
      );

      if (success) {
        toast.success(t('apiKeyManagement.messages.added', { provider: SUPPORTED_PROVIDERS.find(p => p.id === newKeyProvider)?.name }));
        setNewKeyValue('');
        setNewKeyName('');
        setShowAddForm(false);
        loadApiKeys();
      } else {
        toast.error(t('apiKeyManagement.messages.storeFailed'));
      }
    } catch (error) {
      console.error('Error adding API key:', error);
      toast.error(t('apiKeyManagement.messages.addFailed'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKey = async (keyId: string, provider: string) => {
    try {
      const success = await deleteApiKey(keyId);
      if (success) {
        toast.success(`${provider} API key deleted`);
        loadApiKeys();
      } else {
        toast.error('Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const handleTestKey = async (provider: string) => {
    try {
      const key = await getApiKey(provider);
      if (key) {
        // For now, just validate the format. Later we can add actual API testing
        const isValid = validateApiKey(provider, key);
        setTestResults(prev => ({ ...prev, [provider]: isValid }));

        if (isValid) {
          toast.success(t('apiKeyManagement.messages.valid', { provider }));
        } else {
          toast.error(t('apiKeyManagement.messages.invalid', { provider }));
        }
      }
    } catch (error) {
      console.error('Error testing API key:', error);
      toast.error(t('apiKeyManagement.messages.testFailed'));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProviderInfo = (providerId: string) => {
    return SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  };

  const handleBack = () => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/', { replace: true });
  };

  return (
    <div className="pwa-container bg-[#0b0c0f] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[#0b0c0f]" />
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <header className="sticky top-0 z-50 pwa-header bg-[#0b0c0f]/95 backdrop-blur-xl border-b border-white/[0.08]">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 shrink-0 rounded-[10px] bg-white/[0.045] border border-white/[0.08] text-[#c8ccd4] hover:bg-white/[0.08] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-[#e9ebef] leading-none truncate">{t('apiKeyManagement.title')}</h1>
                <p className="font-mono text-[9px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-1 truncate">
                  {t('apiKeyManagement.subtitle')}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowAddForm((current) => !current)}
              className="h-9 w-9 p-0 shrink-0 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] text-white active:scale-95"
              title={t('apiKeyManagement.addKey')}
            >
              <Plus className={`h-4 w-4 transition-transform ${showAddForm ? 'rotate-45' : ''}`} strokeWidth={2} />
            </Button>
          </div>
        </header>

        <main className="container mx-auto max-w-xl px-4 py-4 space-y-3">
          <section className="rounded-xl border border-[#34c77b]/20 p-3.5" style={{ background: 'rgba(52,199,123,.07)' }}>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-[#4ade80]" strokeWidth={1.8} />
              <h2 className="text-[13px] font-semibold text-[#d9fbe8]">{t('apiKeyManagement.privacy.title')}</h2>
            </div>
            <p className="text-[11.5px] leading-[1.55] text-[#75a98a]">{t('apiKeyManagement.privacy.localOnlyDesc')}</p>
            <div className="flex items-start gap-2 mt-2 pt-2 border-t border-[#34c77b]/15">
              <AlertTriangle className="h-3.5 w-3.5 text-[#72c994] shrink-0 mt-0.5" strokeWidth={1.8} />
              <p className="text-[11px] leading-[1.5] text-[#75a98a]">{t('apiKeyManagement.privacy.secureDesc')}</p>
            </div>
          </section>

          {showAddForm && (
            <section className="rounded-xl border border-white/[0.08] p-3.5" style={{ background: 'rgba(255,255,255,.025)' }}>
              <div className="flex items-center gap-2 mb-3.5">
                <Plus className="h-4 w-4 text-[#5b8af5]" strokeWidth={1.8} />
                <h2 className="text-[13px] font-semibold text-[#e9ebef]">{t('apiKeyManagement.addForm.title')}</h2>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label htmlFor="provider" className="block font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mb-[7px]">
                    {t('apiKeyManagement.addForm.provider')}
                  </label>
                  <select
                    id="provider"
                    value={newKeyProvider}
                    onChange={(event) => setNewKeyProvider(event.target.value)}
                    className="w-full h-[42px] px-3 rounded-[10px] border border-white/[0.08] bg-[#15171c] text-[13px] text-[#e9ebef] outline-none focus:border-[#5b8af5]/40 focus:shadow-[0_0_0_3px_rgba(48,105,240,0.1)]"
                  >
                    {SUPPORTED_PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name} · {t(provider.descriptionKey)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="displayName" className="block font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mb-[7px]">
                    {t('apiKeyManagement.addForm.displayName')}
                  </label>
                  <Input
                    id="displayName"
                    placeholder={t('apiKeyManagement.addForm.displayNamePlaceholder')}
                    value={newKeyName}
                    onChange={(event) => setNewKeyName(event.target.value)}
                    className="h-[42px] px-3 bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[13px] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#5b8af5]/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-[7px]">
                    <label htmlFor="apiKey" className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase">
                      {t('apiKeyManagement.addForm.apiKey')}
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowKeyValue((current) => !current)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-[#66758a] hover:text-[#c8ccd4] hover:bg-white/[0.05]"
                        title={showKeyValue ? t('apiKeyManagement.addForm.hideKey') : t('apiKeyManagement.addForm.showKey')}
                      >
                        {showKeyValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.open(getProviderInfo(newKeyProvider)?.helpUrl, '_blank', 'noopener,noreferrer')}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-[#66758a] hover:text-[#7ba3f5] hover:bg-white/[0.05]"
                        title={t('apiKeyManagement.addForm.getKey')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <Input
                    id="apiKey"
                    type={showKeyValue ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={getProviderInfo(newKeyProvider) ? t(getProviderInfo(newKeyProvider)!.placeholderKey) : t('apiKeyManagement.addForm.apiKey')}
                    value={newKeyValue}
                    onChange={(event) => setNewKeyValue(event.target.value)}
                    className="h-[42px] px-3 font-mono text-[12px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#5b8af5]/40"
                  />
                  <button
                    type="button"
                    onClick={() => window.open(getProviderInfo(newKeyProvider)?.helpUrl, '_blank', 'noopener,noreferrer')}
                    className="mt-[7px] inline-flex items-center gap-1.5 text-[11px] text-[#5b8af5] hover:text-[#7ba3f5]"
                  >
                    {t('apiKeyManagement.addForm.settings', { name: getProviderInfo(newKeyProvider)?.name })}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewKeyValue('');
                      setNewKeyName('');
                    }}
                    className="h-10 rounded-[10px] border border-white/[0.08] bg-white/[0.035] text-[12.5px] font-semibold text-[#9aa3b2] hover:text-[#c8ccd4]"
                  >
                    {t('apiKeyManagement.addForm.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddKey}
                    disabled={isAdding || !newKeyValue.trim()}
                    className="h-10 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] text-[12.5px] font-semibold text-white disabled:opacity-45 flex items-center justify-center gap-2"
                  >
                    {isAdding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isAdding ? t('apiKeyManagement.addForm.adding') : t('apiKeyManagement.addForm.add')}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-white/[0.08] overflow-hidden" style={{ background: 'rgba(255,255,255,.025)' }}>
            <div className="h-12 px-3.5 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#9a8af0]" strokeWidth={1.8} />
                <h2 className="text-[13px] font-semibold text-[#e9ebef]">{t('apiKeyManagement.storedKeys.title')}</h2>
              </div>
              <span className="min-w-7 h-6 px-2 rounded-lg border border-white/[0.07] bg-white/[0.035] flex items-center justify-center font-mono text-[10.5px] text-[#8a919e]">
                {apiKeys.length}
              </span>
            </div>

            {isLoading ? (
              <div className="py-10 flex flex-col items-center gap-2 text-[#66758a]">
                <Loader2 className="h-5 w-5 animate-spin text-[#5b8af5]" />
                <p className="text-[11.5px]">{t('apiKeyManagement.storedKeys.loading')}</p>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <div className="h-10 w-10 mx-auto rounded-xl border border-white/[0.07] bg-white/[0.035] flex items-center justify-center mb-3">
                  <KeyRound className="h-4 w-4 text-[#66758a]" strokeWidth={1.8} />
                </div>
                <p className="text-[12.5px] font-semibold text-[#9aa3b2]">{t('apiKeyManagement.storedKeys.noKeys')}</p>
                <p className="text-[11px] leading-relaxed text-[#565d6b] mt-1">{t('apiKeyManagement.storedKeys.noKeysDesc')}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {apiKeys.map((apiKey) => {
                  const provider = getProviderInfo(apiKey.provider);
                  const testResult = testResults[apiKey.provider];
                  return (
                    <div key={apiKey.id} className="p-3.5 flex items-center gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-[10px] border border-white/[0.07] bg-white/[0.035] flex items-center justify-center font-mono text-[10px] font-bold text-[#9a8af0] uppercase">
                        {(provider?.name || apiKey.provider).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[12.5px] font-semibold text-[#e9ebef] truncate">{apiKey.displayName}</span>
                          {apiKey.isActive && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-[#34c77b]/20 bg-[#34c77b]/10 text-[9.5px] font-semibold text-[#4ade80]">
                              {t('apiKeyManagement.storedKeys.active')}
                            </span>
                          )}
                          {testResult !== undefined && (
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[9.5px] font-semibold ${testResult ? 'border-[#3069f0]/25 bg-[#3069f0]/10 text-[#7ba3f5]' : 'border-[#f25555]/25 bg-[#f25555]/10 text-[#f87c7c]'}`}>
                              {testResult ? t('apiKeyManagement.storedKeys.valid') : t('apiKeyManagement.storedKeys.invalid')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 min-w-0">
                          <span className="font-mono text-[10.5px] text-[#66758a] truncate">{apiKey.maskedKey}</span>
                          <span className="text-[#3f4652]">·</span>
                          <span className="text-[10px] text-[#565d6b] truncate">{provider?.name || apiKey.provider}</span>
                        </div>
                        <p className="text-[9.5px] text-[#454b57] mt-1 truncate">
                          {t('apiKeyManagement.storedKeys.created', { date: formatDate(apiKey.createdAt) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestKey(apiKey.provider)}
                          className="h-8 w-8 rounded-lg border border-white/[0.07] text-[#66758a] hover:text-[#7ba3f5] hover:bg-white/[0.04] flex items-center justify-center"
                          title={t('apiKeyManagement.storedKeys.test')}
                        >
                          <CheckCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(apiKey.id, apiKey.provider)}
                          className="h-8 w-8 rounded-lg text-[#8f5960] hover:text-[#f87c7c] hover:bg-[#f25555]/10 flex items-center justify-center"
                          title={t('apiKeyManagement.storedKeys.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-white/[0.08] overflow-hidden" style={{ background: 'rgba(255,255,255,.025)' }}>
            <div className="h-12 px-3.5 flex items-center gap-2 border-b border-white/[0.06]">
              <ExternalLink className="h-3.5 w-3.5 text-[#5b8af5]" strokeWidth={1.8} />
              <h2 className="text-[13px] font-semibold text-[#e9ebef]">{t('apiKeyManagement.help.title')}</h2>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {SUPPORTED_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => window.open(provider.helpUrl, '_blank', 'noopener,noreferrer')}
                  className="w-full min-h-[58px] px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.025]"
                >
                  <span className="w-[82px] shrink-0 text-[11.5px] font-semibold text-[#c8ccd4]">{provider.name}</span>
                  <span className="flex-1 text-[10.5px] leading-relaxed text-[#66758a]">{t(provider.descriptionKey)}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#4a5261]" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default ApiKeyManagement;
