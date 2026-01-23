import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Wifi, WifiOff, Loader2, Server, TestTube, CheckCircle, XCircle, Info, Save, Power } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ServerSettingsProps {
  onBack?: () => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    url,
    isConnected,
    isConnecting,
    error,
    setUrl,
    connect,
    disconnect,
    setError
  } = useConnectionStore();

  const [inputUrl, setInputUrl] = useState(url);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  const validateUrl = (url: string): { isValid: boolean; message?: string } => {
    if (!url.trim()) {
      return { isValid: false, message: t('serverSettings.validation.required') };
    }

    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, message: t('serverSettings.validation.protocol') };
      }
      return { isValid: true };
    } catch {
      return { isValid: false, message: t('serverSettings.validation.format') };
    }
  };

  const handleUrlChange = (value: string) => {
    setInputUrl(value);
    setTestResult(null);
    setError(null);
  };

  const handleTestConnection = async () => {
    const validation = validateUrl(inputUrl);
    if (!validation.isValid) {
      setTestResult({ success: false, message: validation.message || t('serverSettings.validation.format') });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Temporarily set URL for testing
      setUrl(inputUrl);

      // Test connection
      await connect();

      setTestResult({
        success: true,
        message: t('serverSettings.messages.success')
      });
      toast.success(t('serverSettings.messages.success'));
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('serverSettings.messages.failed')
      });
      // Don't toast error here as we show it in the UI
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const validation = validateUrl(inputUrl);
    if (!validation.isValid) {
      setTestResult({ success: false, message: validation.message || 'Invalid URL' });
      return;
    }

    setUrl(inputUrl);
    setTestResult({
      success: true,
      message: t('serverSettings.messages.saved')
    });
    toast.success(t('serverSettings.messages.saved'));
  };

  const handleConnect = async () => {
    if (inputUrl !== url) {
      handleSave();
    }

    try {
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setTestResult(null);
  };

  const getDefaultUrls = () => [
    'http://127.0.0.1:8188',
    'http://localhost:8188',
    'http://192.168.1.100:8188', // Common local network IP
  ];

  const handleBackNavigation = () => {
    if (onBack) {
      onBack();
    } else {
      sessionStorage.setItem('app-navigation', 'true');
      navigate('/', { replace: true });
    }
  };

  return (
    <div
      className="bg-black transition-colors duration-300 pwa-container"
      style={{
        overflow: 'hidden',
        height: '100dvh',
        maxHeight: '100dvh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      {/* Main Background with Dark Theme */}
      <div className="absolute inset-0 bg-[#374151]" />

      {/* Glassmorphism Background Overlay */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* Main Scrollable Content Area */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 pwa-header bg-[#1e293b] border-b border-white/10 shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleBackNavigation}
                variant="ghost"
                size="sm"
                className="bg-white/10 backdrop-blur-sm border border-white/10 shadow-lg hover:bg-white/20 transition-all duration-300 h-9 w-9 p-0 flex-shrink-0 rounded-lg text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-white/95 leading-none">
                  {t('serverSettings.title')}
                </h1>
                <p className="text-[11px] text-white/40 mt-1">
                  {t('serverSettings.subtitle')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
          {/* Connection Status Card */}
          <Card className="border border-white/5 bg-black/20 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <Server className="h-5 w-5 text-blue-400" />
                <span>{t('serverSettings.statusTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-white/70">{t('common.status')}</span>
                {isConnected ? (
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                    <Wifi className="w-3 h-3 mr-1" />
                    {t('common.connected')}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">
                    <WifiOff className="w-3 h-3 mr-1" />
                    {t('common.disconnected')}
                  </Badge>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-400">
                      {error}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Server Configuration Card */}
          <Card className="border border-white/5 bg-black/20 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <TestTube className="h-5 w-5 text-purple-400" />
                <span>{t('serverSettings.configTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* URL Input */}
              <div className="space-y-2">
                <Label className="text-white/70">
                  {t('serverSettings.urlLabel')}
                </Label>
                <Input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="http://127.0.0.1:8188"
                  className="bg-black/20 border-white/10 text-white/90 placeholder:text-white/20 rounded-xl"
                />
                <p className="text-xs text-white/40">
                  {t('serverSettings.urlDesc')}
                </p>
              </div>

              {/* Quick URL Options */}
              <div className="space-y-2">
                <Label className="text-white/70 block">
                  {t('serverSettings.quickOptions')}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {getDefaultUrls().map((defaultUrl) => (
                    <Button
                      key={defaultUrl}
                      variant="outline"
                      size="sm"
                      onClick={() => handleUrlChange(defaultUrl)}
                      className="text-xs border-white/10 text-white/60 hover:bg-white/10 hover:text-white bg-transparent"
                    >
                      {defaultUrl}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`p-3 rounded-lg border flex items-center space-x-2 ${testResult.success
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting || isConnecting}
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/10 hover:text-white bg-white/5"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  {isTesting ? t('serverSettings.testing') : t('serverSettings.testConnection')}
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={inputUrl === url}
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/10 hover:text-white bg-white/5"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {t('serverSettings.saveUrl')}
                </Button>
              </div>

              {/* Connect/Disconnect Button */}
              <div className="pt-2">
                {isConnected ? (
                  <Button
                    onClick={handleDisconnect}
                    variant="destructive"
                    className="w-full bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  >
                    <WifiOff className="h-4 w-4 mr-2" />
                    {t('serverSettings.disconnect')}
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-900/20"
                  >
                    {isConnecting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Power className="h-4 w-4 mr-2" />
                    )}
                    {isConnecting ? t('serverSettings.connecting') : t('serverSettings.connect')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Connection Help Card */}
          <Card className="border border-white/5 bg-black/20 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <Info className="h-5 w-5 text-cyan-400" />
                <span>{t('serverSettings.helpTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/60">
                <p>• {t('serverSettings.helpList.1')}</p>
                <p>• {t('serverSettings.helpList.2')}</p>
                <p>• {t('serverSettings.helpList.3')}</p>
                <p>• {t('serverSettings.helpList.4')}</p>
                <p>• {t('serverSettings.helpList.5')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ServerSettings;