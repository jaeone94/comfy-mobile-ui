import React, { useState, useEffect } from 'react';
import { ArrowLeft, Key, Plus, Trash2, Eye, EyeOff, Shield, Lock, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  storeApiKey,
  getAllApiKeys,
  deleteApiKey,
  validateApiKey,
  getApiKey
} from '@/infrastructure/storage/ApiKeyStorageService';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';

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
    description: 'For downloading models from Civitai',
    helpUrl: 'https://civitai.com/user/account',
    placeholder: 'Enter your Civitai API key (32+ hex characters)'
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    description: 'For downloading models from HuggingFace Hub',
    helpUrl: 'https://huggingface.co/settings/tokens',
    placeholder: 'Enter your HuggingFace token (starts with hf_)'
  }
];

export const ApiKeyManagement: React.FC = () => {
  const { t } = useTranslation();
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

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
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
  };

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
        newKeyValue,
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
    return new Date(dateString).toLocaleDateString('en-US', {
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

  return (
    <div className="pwa-container flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="shrink-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => navigate(-1)}
              variant="ghost"
              size="sm"
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center space-x-2">
              <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t('apiKeyManagement.title')}
              </h1>
            </div>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('apiKeyManagement.addKey')}
          </Button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
          {/* Security Notice */}
          <Card className="border border-green-200/50 dark:border-green-700/50 bg-green-50/50 dark:bg-green-900/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-green-800 dark:text-green-200">
                <Shield className="h-5 w-5" />
                <span>{t('apiKeyManagement.privacy.title')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-green-700 dark:text-green-300">
              <div className="flex items-start space-x-3">
                <Lock className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('apiKeyManagement.privacy.localOnly')}</p>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    {t('apiKeyManagement.privacy.localOnlyDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('apiKeyManagement.privacy.secure')}</p>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    {t('apiKeyManagement.privacy.secureDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Add API Key Form */}
          {showAddForm && (
            <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Plus className="h-5 w-5 text-blue-500" />
                  <span>{t('apiKeyManagement.addForm.title')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">{t('apiKeyManagement.addForm.provider')}</Label>
                  <select
                    id="provider"
                    value={newKeyProvider}
                    onChange={(e) => setNewKeyProvider(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {SUPPORTED_PROVIDERS.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} - {provider.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">{t('apiKeyManagement.addForm.displayName')}</Label>
                  <Input
                    id="displayName"
                    placeholder={t('apiKeyManagement.addForm.displayNamePlaceholder')}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="bg-white dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="apiKey">{t('apiKeyManagement.addForm.apiKey')}</Label>
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKeyValue(!showKeyValue)}
                        className="h-6 w-6 p-0"
                      >
                        {showKeyValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const provider = getProviderInfo(newKeyProvider);
                          if (provider?.helpUrl) {
                            window.open(provider.helpUrl, '_blank');
                          }
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    id="apiKey"
                    type={showKeyValue ? "text" : "password"}
                    placeholder={getProviderInfo(newKeyProvider)?.placeholder || "Enter your API key"}
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="bg-white dark:bg-slate-800 font-mono"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('apiKeyManagement.addForm.getKey')} {' '}
                    <button
                      type="button"
                      onClick={() => {
                        const provider = getProviderInfo(newKeyProvider);
                        if (provider?.helpUrl) {
                          window.open(provider.helpUrl, '_blank');
                        }
                      }}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
                    >
                      {t('apiKeyManagement.addForm.settings', { name: getProviderInfo(newKeyProvider)?.name })}
                    </button>
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewKeyValue('');
                      setNewKeyName('');
                    }}
                  >
                    {t('apiKeyManagement.addForm.cancel')}
                  </Button>
                  <Button
                    onClick={handleAddKey}
                    disabled={isAdding || !newKeyValue.trim()}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {isAdding ? t('apiKeyManagement.addForm.adding') : t('apiKeyManagement.addForm.add')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* API Keys List */}
          <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Key className="h-5 w-5 text-purple-500" />
                  <span>{t('apiKeyManagement.storedKeys.title')}</span>
                </div>
                <Badge variant="secondary">
                  {apiKeys.length} {apiKeys.length === 1 ? 'key' : 'keys'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full mx-auto"></div>
                  <p className="text-slate-500 mt-2">{t('apiKeyManagement.storedKeys.loading')}</p>
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">{t('apiKeyManagement.storedKeys.noKeys')}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                    {t('apiKeyManagement.storedKeys.noKeysDesc')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {apiKeys.map((apiKey) => {
                    const provider = getProviderInfo(apiKey.provider);
                    const testResult = testResults[apiKey.provider];

                    return (
                      <div
                        key={apiKey.id}
                        className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/50 dark:border-slate-700/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <Badge variant="outline" className="capitalize">
                                {provider?.name || apiKey.provider}
                              </Badge>
                              {apiKey.isActive && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {t('apiKeyManagement.storedKeys.active')}
                                </Badge>
                              )}
                              {testResult !== undefined && (
                                <Badge variant={testResult ? "default" : "destructive"}>
                                  {testResult ? "Valid" : "Invalid"}
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {apiKey.displayName}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                              {apiKey.maskedKey}
                            </p>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              {t('apiKeyManagement.storedKeys.created', { date: formatDate(apiKey.createdAt) })}
                              {apiKey.lastUsed && (
                                <span className="ml-4">
                                  {t('apiKeyManagement.storedKeys.lastUsed', { date: formatDate(apiKey.lastUsed) })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestKey(apiKey.provider)}
                              className="h-8 w-8 p-0"
                              title="Test API key"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteKey(apiKey.id, apiKey.provider)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Delete API key"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card className="border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>{t('apiKeyManagement.help.title')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {SUPPORTED_PROVIDERS.map(provider => (
                <div key={provider.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="capitalize">
                      {provider.name}
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {provider.description}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(provider.helpUrl, '_blank')}
                      className="h-auto p-0 mt-1 text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {t('apiKeyManagement.help.getBtn', { name: provider.name })}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyManagement;