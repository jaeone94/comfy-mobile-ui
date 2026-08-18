import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { ArrowLeft, WifiOff, Loader2, CheckCircle, XCircle, Info, Power, Eye, EyeOff, ShieldCheck, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { Label } from '@/components/ui/label';

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
    apiStatus,
    extensionStatus,
    authMode,
    authToken,
    rememberAuthToken,
    errorCode,
    setUrl,
    setAuthMode,
    setAuthToken,
    setRememberAuthToken,
    connect,
    disconnect,
    setError,
    initializeWebSocketListeners
  } = useConnectionStore();

  const [inputUrl, setInputUrl] = useState(url);
  const [inputAuthMode, setInputAuthMode] = useState(authMode);
  const [inputAuthToken, setInputAuthToken] = useState(authToken);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [inputRememberToken, setInputRememberToken] = useState(rememberAuthToken);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  useEffect(() => {
    setInputAuthMode(authMode);
  }, [authMode]);

  useEffect(() => {
    setInputAuthToken(authToken);
  }, [authToken]);

  useEffect(() => {
    setInputRememberToken(rememberAuthToken);
  }, [rememberAuthToken]);

  useEffect(() => {
    const cleanup = initializeWebSocketListeners();
    return cleanup;
  }, [initializeWebSocketListeners]);

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

  const handleConnect = async () => {
    const validation = validateUrl(inputUrl);
    if (!validation.isValid) {
      setError(validation.message || t('serverSettings.validation.format'));
      return;
    }

    if (inputAuthMode === 'comfyui-login' && !inputAuthToken.trim()) {
      setError(t('serverSettings.authentication.tokenRequired'));
      return;
    }

    setUrl(inputUrl);
    setAuthMode(inputAuthMode);
    setRememberAuthToken(inputAuthMode === 'comfyui-login' && inputRememberToken);
    setAuthToken(inputAuthMode === 'comfyui-login' ? inputAuthToken : '');

    try {
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
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
      <div className="absolute inset-0 bg-[#0b0c0f]" />

      {/* Main Scrollable Content Area */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 pwa-header bg-[#0b0c0f]/95 backdrop-blur-xl border-b border-white/[0.08] relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleBackNavigation}
                variant="ghost"
                size="sm"
                className="bg-white/[0.045] border border-white/[0.08] hover:bg-white/[0.08] transition-all h-9 w-9 p-0 flex-shrink-0 rounded-[10px] text-[#c8ccd4]"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-[15px] font-bold text-[#e9ebef] leading-none">
                  {t('serverSettings.title')}
                </h1>
                <p className="font-mono text-[9px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-1">
                  {t('serverSettings.subtitle')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="container mx-auto px-4 py-4 max-w-xl space-y-3">
          {/* Connection Status Card */}
          <div className="border border-white/[0.08] rounded-xl px-3.5" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className="h-11 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#e9ebef]">{t('serverSettings.statusTitle')}</span>
              {isConnected ? (
                <span className="flex items-center gap-[7px] px-2.5 py-[5px] rounded-lg border text-[11.5px] font-semibold" style={{ background: 'rgba(52,199,123,.12)', borderColor: 'rgba(52,199,123,.28)', color: '#4ade80' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                  {t('common.connected')}
                </span>
              ) : (
                <span className="flex items-center gap-[7px] px-2.5 py-[5px] rounded-lg border text-[11.5px] font-semibold" style={{ background: 'rgba(242,85,85,.12)', borderColor: 'rgba(242,85,85,.3)', color: '#f87c7c' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f25555]" />
                  {t('common.disconnected')}
                </span>
              )}
            </div>
            <div className="h-px bg-white/[0.06]" />
            {[
              { label: 'ComfyUI API', status: (isConnected || isConnecting) ? apiStatus : 'idle' },
              { label: t('common.extension'), status: (isConnected || isConnecting) ? extensionStatus : 'idle' }
            ].map((step, idx) => (
              <div key={idx} className="h-10 flex items-center justify-between">
                <span className="text-[12.5px] text-[#9aa3b2]">{step.label}</span>
                <span>
                  {step.status === 'checking' && <Loader2 className="h-4 w-4 text-[#5b8af5] animate-spin" />}
                  {step.status === 'success' && <CheckCircle className="h-4 w-4 text-[#4ade80]" strokeWidth={1.9} />}
                  {step.status === 'failed' && <XCircle className="h-4 w-4 text-[#f87c7c]" strokeWidth={1.9} />}
                  {step.status === 'idle' && <span className="block h-4 w-4 rounded-full border border-white/10" />}
                </span>
              </div>
            ))}
            {error && (
              <div className="mb-3 p-2.5 bg-[#f25555]/10 border border-[#f25555]/25 rounded-lg flex items-start gap-2">
                <XCircle className="h-3.5 w-3.5 text-[#f87c7c] flex-shrink-0 mt-0.5" strokeWidth={1.9} />
                <div className="text-[11.5px] leading-relaxed text-[#f87c7c]">
                  {errorCode === 'authentication_required'
                    ? t('serverSettings.authentication.authRequired')
                    : error}
                </div>
              </div>
            )}
          </div>

          {/* Server Configuration Card */}
          <div className="border border-white/[0.08] rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className="text-[13px] font-semibold text-[#e9ebef] mb-2.5">{t('serverSettings.configTitle')}</div>

            <div className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mb-[7px]">
              {t('serverSettings.urlLabel')}
            </div>
            <Input
              type="url"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                setError(null);
              }}
              placeholder="http://127.0.0.1:8188"
              className="h-[42px] px-3 font-mono text-[13px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#5b8af5]/40 focus-visible:shadow-[0_0_0_3px_rgba(48,105,240,0.1)]"
            />
            <p className="text-[11px] leading-relaxed text-[#66758a] mt-[7px]">
              {t('serverSettings.urlDesc')}
            </p>

            <div className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase mt-3.5 mb-[7px]">
              {t('serverSettings.quickOptions')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {getDefaultUrls().map((defaultUrl) => {
                const active = inputUrl === defaultUrl;
                return (
                  <button
                    key={defaultUrl}
                    onClick={() => {
                      setInputUrl(defaultUrl);
                      setError(null);
                    }}
                    className={`px-[11px] py-2 rounded-lg border font-mono text-[11px] whitespace-nowrap transition-colors ${active
                      ? 'text-[#7ba3f5] border-[#3069f0]/30'
                      : 'text-[#9aa3b2] border-white/[0.08] hover:text-[#c8ccd4]'
                      }`}
                    style={{ background: active ? 'rgba(61,123,253,.1)' : 'rgba(255,255,255,.04)' }}
                  >
                    {defaultUrl}
                  </button>
                );
              })}
            </div>

            <div className="h-px bg-white/[0.06] my-4" />

            <div className="flex items-center gap-2 mb-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#7ba3f5]" strokeWidth={1.8} />
              <div className="text-[13px] font-semibold text-[#e9ebef]">
                {t('serverSettings.authentication.title')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['none', 'comfyui-login'] as const).map((mode) => {
                const active = inputAuthMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setInputAuthMode(mode);
                      setError(null);
                    }}
                    className={`min-h-10 px-3 rounded-[10px] border text-[12px] font-semibold transition-colors ${active
                      ? 'text-[#7ba3f5] border-[#3069f0]/35'
                      : 'text-[#8a919e] border-white/[0.08] hover:text-[#c8ccd4]'
                    }`}
                    style={{ background: active ? 'rgba(61,123,253,.1)' : 'rgba(255,255,255,.035)' }}
                  >
                    {mode === 'none'
                      ? t('serverSettings.authentication.none')
                      : t('serverSettings.authentication.comfyLogin')}
                  </button>
                );
              })}
            </div>

            {inputAuthMode === 'comfyui-login' && (
              <div className="mt-3">
                <Label htmlFor="comfyui-login-token" className="font-mono text-[10px] font-medium text-[#565d6b] tracking-[0.12em] uppercase">
                  {t('serverSettings.authentication.tokenLabel')}
                </Label>
                <div className="relative mt-[7px]">
                  <Input
                    id="comfyui-login-token"
                    type={showAuthToken ? 'text' : 'password'}
                    value={inputAuthToken}
                    onChange={(event) => {
                      setInputAuthToken(event.target.value);
                      setError(null);
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('serverSettings.authentication.tokenPlaceholder')}
                    className="h-[42px] pl-3 pr-11 font-mono text-[12px] bg-white/[0.045] dark:bg-transparent border-white/[0.08] text-[#e9ebef] placeholder:text-[#565d6b] rounded-[10px] focus-visible:ring-0 focus-visible:border-[#5b8af5]/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthToken((visible) => !visible)}
                    aria-label={showAuthToken
                      ? t('serverSettings.authentication.hideToken')
                      : t('serverSettings.authentication.showToken')}
                    className="absolute right-0 top-0 h-[42px] w-11 flex items-center justify-center text-[#66758a] hover:text-[#c8ccd4]"
                  >
                    {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-[#66758a] mt-[7px]">
                  {t('serverSettings.authentication.tokenDesc')}
                </p>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={inputRememberToken}
                  onClick={() => setInputRememberToken((remember) => !remember)}
                  className="mt-3 w-full flex items-start gap-2.5 text-left"
                >
                  <span
                    className={`mt-[1px] h-4 w-4 flex-shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${inputRememberToken
                      ? 'bg-[#3069f0] border-[#3069f0]'
                      : 'border-white/[0.16]'
                    }`}
                  >
                    {inputRememberToken && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[12px] font-medium text-[#c8ccd4]">
                      {t('serverSettings.authentication.rememberLabel')}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-[#66758a] mt-0.5">
                      {t('serverSettings.authentication.rememberDesc')}
                    </span>
                  </span>
                </button>

                <div className="mt-2 p-2.5 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] text-[10.5px] leading-relaxed text-amber-200/65">
                  {inputRememberToken
                    ? t('serverSettings.authentication.persistNotice')
                    : t('serverSettings.authentication.sessionNotice')}
                </div>
              </div>
            )}

            <div className="mt-4">
              {isConnected ? (
                <button
                  onClick={handleDisconnect}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-[10px] border text-[13px] font-semibold transition-colors"
                  style={{ background: 'rgba(242,85,85,.1)', borderColor: 'rgba(242,85,85,.3)', color: '#f87c7c' }}
                >
                  <WifiOff className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  {t('serverSettings.disconnect')}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-[10px] bg-[#3069f0] hover:bg-[#3f78f5] text-white text-[13px] font-semibold transition-colors disabled:opacity-60"
                >
                  {isConnecting ? (
                    <Loader2 className="h-[15px] w-[15px] animate-spin" />
                  ) : (
                    <Power className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  )}
                  {isConnecting ? t('serverSettings.connecting') : t('serverSettings.connect')}
                </button>
              )}
            </div>
          </div>

          {/* Connection Help Card */}
          <div className="border border-white/[0.08] rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Info className="h-3.5 w-3.5 text-[#5b8af5]" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold text-[#e9ebef]">{t('serverSettings.helpTitle')}</span>
            </div>
            <div className="flex flex-col gap-[7px] text-[11.5px] leading-[1.55] text-[#8a919e]">
              <div>· {t('serverSettings.helpList.1')}</div>
              <div>· {t('serverSettings.helpList.2')}</div>
              <div>· {t('serverSettings.helpList.3')}</div>
              <div>· {t('serverSettings.helpList.4')}</div>
              <div>· {t('serverSettings.helpList.5')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerSettings;
