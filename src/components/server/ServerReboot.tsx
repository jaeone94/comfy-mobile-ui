import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RotateCcw, Loader2, CheckCircle, XCircle, Server, AlertCircle, Info, Power } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStore } from '@/ui/store/connectionStore';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';
import { toast } from 'sonner';

interface ServerRebootProps {
  onBack?: () => void;
}

const ServerReboot: React.FC<ServerRebootProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    url,
    isConnected,
    error,
    hasExtension,
    isCheckingExtension,
    connect,
    disconnect,
    checkExtension
  } = useConnectionStore();

  // Component state
  // Extension checking is now handled by connectionStore
  const [isCheckingWatchdog, setIsCheckingWatchdog] = useState(false);
  const [watchdogStatus, setWatchdogStatus] = useState<{
    available: boolean;
    running: boolean;
    restart_requested: boolean;
    restart_delay?: number;
    lastChecked?: number;
    comfyuiResponsive?: boolean;
  }>({ available: false, running: false, restart_requested: false });
  const [isRebooting, setIsRebooting] = useState(false);


  const [rebootStatus, setRebootStatus] = useState<{
    phase: 'idle' | 'rebooting' | 'waiting' | 'success' | 'failed';
    message: string;
    details?: string;
    logs?: any[];
  }>({ phase: 'idle', message: '' });

  // Health check polling
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckStartTime = useRef<number | null>(null);
  const maxHealthCheckDuration = 90000; // 90 seconds

  useEffect(() => {
    if (isConnected) {
      checkExtension();
    }
    // Always check watchdog independently
    checkWatchdogStatus();
  }, [isConnected]);

  useEffect(() => {
    return () => {
      // Cleanup health check on unmount
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
    };
  }, []);

  // Monitor connection state changes during reboot
  useEffect(() => {
    if (isRebooting && rebootStatus.phase === 'waiting' && isConnected) {
      // Connection was restored during waiting phase - this means reboot succeeded
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
      setRebootStatus({
        phase: 'success',
        message: t('serverReboot.rebootSuccess'),
        details: t('serverReboot.connectionRestored')
      });
      setIsRebooting(false);

      // Recheck extension availability
      setTimeout(() => {
        checkExtension();
      }, 1000);
    }
  }, [isConnected, isRebooting, rebootStatus.phase]);

  const checkWatchdogStatus = async () => {
    setIsCheckingWatchdog(true);
    const startTime = Date.now();

    try {
      console.log('🔍 Checking watchdog via direct API only');
      const result = await checkWatchdogDirect();

      console.log('🔍 Watchdog check final result:', result);

      if (result) {
        console.log('✅ Watchdog available and running:', result);
        setWatchdogStatus({
          ...result,
          lastChecked: Date.now()
        });
      } else {
        console.log('❌ Watchdog not available');
        setWatchdogStatus({
          available: false,
          running: false,
          restart_requested: false,
          lastChecked: Date.now()
        });
      }
    } catch (error) {
      console.log('Watchdog check failed:', error);
      setWatchdogStatus({
        available: false,
        running: false,
        restart_requested: false,
        lastChecked: Date.now()
      });
    } finally {
      setIsCheckingWatchdog(false);
      console.log(`🔍 Watchdog check completed in ${Date.now() - startTime}ms`);
    }
  };


  const checkWatchdogDirect = async () => {
    if (!url) return null;

    try {
      const serverUrl = new URL(url);
      const watchdogUrl = `${serverUrl.protocol}//${serverUrl.hostname}:9188/status`;

      console.log('🔍 Direct watchdog check URL:', watchdogUrl);

      const response = await fetch(watchdogUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(10000)
      });

      console.log('🔍 Direct watchdog response status:', response.status, response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Direct watchdog response data:', JSON.stringify(data, null, 2));

        // Check if service is running (support both legacy 'watchdog' and new 'launcher' keys)
        const serviceData = data.launcher || data.watchdog;
        const serviceRunning = serviceData?.running;
        const comfyuiResponsive = data.comfyui?.responsive;

        console.log('🔍 Service status analysis:', {
          hasService: !!serviceData,
          serviceRunning: serviceRunning,
          comfyuiResponsive: comfyuiResponsive,
          fullResponse: data
        });

        // Service is available if either key responds
        if (serviceData !== undefined) {
          return {
            available: true,
            running: serviceRunning || false,
            restart_requested: false,
            restart_delay: 2,
            comfyuiResponsive: comfyuiResponsive || false
          };
        }
      }
    } catch (error) {
      console.log('🔍 Direct watchdog check failed:', error);
    }
    return null;
  };

  const fetchWatchdogLogs = async () => {
    if (!url) return null;

    try {
      const serverUrl = new URL(url);
      const logsUrl = `${serverUrl.protocol}//${serverUrl.hostname}:9188/logs`;

      const response = await fetch(logsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📋 Watchdog logs:', data);
        return data;
      }
    } catch (error) {
      console.log('📋 Failed to fetch watchdog logs:', error);
    }
    return null;
  };

  // Extension checking is now handled by connectionStore

  const startHealthCheck = () => {
    healthCheckStartTime.current = Date.now();

    const checkHealth = async () => {
      const elapsed = Date.now() - (healthCheckStartTime.current ?? 0);
      console.log(`🔍 Health check attempt at ${elapsed}ms`);

      if (elapsed > maxHealthCheckDuration) {
        // Timeout after 90 seconds
        console.log('❌ Health check TIMEOUT after 90 seconds');
        if (healthCheckRef.current) {
          clearInterval(healthCheckRef.current);
          healthCheckRef.current = null;
        }
        setRebootStatus({
          phase: 'failed',
          message: t('serverReboot.timeout'),
          details: t('serverReboot.timeoutDesc')
        });
        setIsRebooting(false);
        return;
      }

      try {
        // First, directly check if server is responding
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // health check timeout 15 seconds - multiple sessions can run simultaneously

        const healthResponse = await fetch(`${url}/system_stats`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (healthResponse.ok) {
          // Step 1: ComfyUI server is responding
          console.log('✅ Health check: ComfyUI server responding');

          // Step 2: Update connection store
          await connect();
          await new Promise(resolve => setTimeout(resolve, 500));

          // Step 3: Check Extension API (required for reboot functionality)
          try {
            const extensionResponse = await fetch(`${url}/comfymobile/api/status`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000) // 10 seconds timeout
            });

            if (extensionResponse.ok) {
              const data = await extensionResponse.json();
              console.log('🔍 Extension API response:', data);

              const extensionAvailable = data.status === 'ok' && data.extension === 'ComfyUI Mobile UI API';

              if (extensionAvailable) {
                // SUCCESS: Both server and extension are working
                console.log('✅ Health check SUCCESS: Both ComfyUI server and Extension API are responding');

                if (healthCheckRef.current) {
                  clearInterval(healthCheckRef.current);
                  healthCheckRef.current = null;
                }

                setRebootStatus({
                  phase: 'success',
                  message: t('serverReboot.rebootSuccess'),
                  details: t('serverReboot.rebootSuccessDesc')
                });
                setIsRebooting(false);
                // Extension status is handled by connectionStore

                // force update connection store
                try {
                  await connect();
                  console.log('✅ Connection store updated after successful health check');

                  // additional extension status check to update UI
                  setTimeout(() => {
                    checkExtension();
                  }, 1000);
                } catch (connectError) {
                  console.error('Failed to update connection store:', connectError);
                }

                return; // success. no need to check further
              } else {
                console.log('⏳ Extension API responded but status not ok:', data);
              }
            } else {
              console.log('⏳ Extension API response not ok:', extensionResponse.status);
            }

            // Extension not ready yet
            console.log('⏳ Health check: Server up, extension not ready yet');
            const remainingSeconds = Math.ceil((maxHealthCheckDuration - elapsed) / 1000);
            setRebootStatus({
              phase: 'waiting',
              message: t('serverReboot.waitingForExtension'),
              details: t('serverReboot.waitingForExtensionDesc', { seconds: remainingSeconds })
            });
            // Extension status is handled by connectionStore

          } catch (extensionError) {
            // Extension check failed - server up but extension not responding
            console.log('⏳ Health check: Server up, extension check failed:', extensionError);
            const remainingSeconds = Math.ceil((maxHealthCheckDuration - elapsed) / 1000);
            setRebootStatus({
              phase: 'waiting',
              message: t('serverReboot.waitingForExtension'),
              details: t('serverReboot.waitingForExtensionDesc2', { seconds: remainingSeconds })
            });
            // Extension status is handled by connectionStore
          }
        } else {
          // Server responded but not healthy yet
          throw new Error('Server not ready');
        }

      } catch (error) {
        // Server still not ready, continue checking
        const remainingSeconds = Math.ceil((maxHealthCheckDuration - elapsed) / 1000);
        setRebootStatus({
          phase: 'waiting',
          message: t('serverReboot.waitingForServer'),
          details: t('serverReboot.checkingHealth', { seconds: remainingSeconds })
        });
      }
    };

    // Start health check immediately, then every 5 seconds
    checkHealth();
    healthCheckRef.current = setInterval(checkHealth, 5000);
  };

  const handleReboot = async () => {
    if (!canReboot) {
      return;
    }

    setIsRebooting(true);

    // reboot method selection
    const useExtension = isConnected && hasExtension;
    const useWatchdogDirect = watchdogStatus.available && watchdogStatus.running;

    let rebootMethod: 'extension' | 'watchdog' | 'none';

    if (useExtension) {
      rebootMethod = 'extension';
    } else if (useWatchdogDirect) {
      rebootMethod = 'watchdog';
    } else {
      rebootMethod = 'none';
      setRebootStatus({
        phase: 'failed',
        message: t('serverReboot.noMethod'),
        details: t('serverReboot.noMethodDesc')
      });
      setIsRebooting(false);
      return;
    }

    setRebootStatus({
      phase: 'rebooting',
      message: t('serverReboot.initiating'),
      details: rebootMethod === 'extension'
        ? t('serverReboot.usingExtension')
        : t('serverReboot.usingWatchdog')
    });

    // immediately set connection status to down when reboot starts
    disconnect();

    // Clear execution state buffer to prevent stale execution state after reboot
    globalWebSocketService.clearExecutionStateBuffer();

    try {
      let success = false;

      if (rebootMethod === 'extension') {
        // Extension reboot method
        const service = ComfyUIService;
        success = await service.rebootServer();

      } else if (rebootMethod === 'watchdog') {
        // Watchdog direct API reboot
        if (!url) {
          throw new Error('No server URL configured');
        }

        const serverUrl = new URL(url);
        const watchdogUrl = `${serverUrl.protocol}//${serverUrl.hostname}:9188/restart`;

        console.log('🔄 Direct watchdog restart:', watchdogUrl);

        const response = await fetch(watchdogUrl, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          mode: 'cors',
          credentials: 'omit',
          signal: AbortSignal.timeout(60000) // 60 seconds timeout (increased to 1 minute)
        });

        if (response.ok) {
          const data = await response.json();
          success = data.success || false;
          console.log('🔄 Watchdog restart response:', data);
        } else {
          console.error('🔄 Watchdog restart failed:', response.status);
          try {
            const errorText = await response.text();
            console.error('🔄 Watchdog restart error response:', errorText);
          } catch (e) {
            console.error('🔄 Could not read error response:', e);
          }
        }
      }

      if (success) {
        const restartDelay = watchdogStatus.restart_delay || 3;

        setRebootStatus({
          phase: 'waiting',
          message: t('serverReboot.restarting'),
          details: rebootMethod === 'extension'
            ? t('serverReboot.extensionInitiated')
            : t('serverReboot.watchdogInitiated', { seconds: restartDelay })
        });

        // connection is already disconnected above

        // Start health check polling after appropriate delay
        const healthCheckDelay = rebootMethod === 'extension'
          ? 5000  // Extension: 5 seconds after reboot
          : (restartDelay + 3) * 1000;  // Watchdog: restart delay + 3 seconds

        setTimeout(() => {
          startHealthCheck();
        }, healthCheckDelay);

      } else {
        setRebootStatus({
          phase: 'failed',
          message: t('serverReboot.failedInitiate'),
          details: t('serverReboot.failedInitiateDesc', { method: rebootMethod })
        });
        setIsRebooting(false);
      }
    } catch (error) {
      console.error('🔄 Reboot request exception:', error);

      // fetch watchdog logs
      const logs = await fetchWatchdogLogs();

      let errorDetails = error instanceof Error ? error.message : 'Unknown error';

      // timeout or AbortError handling
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorDetails = 'Request timeout (60s) - ComfyUI restart may take longer than expected';
        } else if (error.message.includes('fetch')) {
          errorDetails = 'Network error - Check if watchdog service is running';
        }
      }

      setRebootStatus({
        phase: 'failed',
        message: t('serverReboot.requestFailed'),
        details: errorDetails,
        logs: logs?.logs?.slice(-10) || [] // last 10 logs
      });
      setIsRebooting(false);
    }
  };

  const getStatusColor = (phase: string) => {
    switch (phase) {
      case 'success': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      case 'rebooting':
      case 'waiting': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  const getStatusIcon = (phase: string) => {
    switch (phase) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'rebooting':
      case 'waiting': return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default: return <Server className="h-5 w-5 text-slate-500" />;
    }
  };

  // reboot conditions:
  // 1. ComfyUI connected and Extension available (Extension method)
  // 2. or Watchdog available (Watchdog direct API method)
  const canReboot = !isRebooting && (
    (isConnected && hasExtension) ||
    (watchdogStatus.available && watchdogStatus.running)
  );

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
                  {t('serverReboot.title')}
                </h1>
                <p className="text-[11px] text-white/40 mt-1">
                  {t('serverReboot.subtitle')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
          {/* Server Requirements Check */}
          <Card className={`border backdrop-blur-sm shadow-xl ${isConnected && hasExtension
            ? 'border-green-500/20 bg-green-500/5'
            : 'border-amber-500/20 bg-amber-500/5'
            }`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <Server className="h-5 w-5 text-blue-400" />
                <span>{t('serverReboot.cardTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCheckingExtension ? (
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-white/70">
                    {t('serverReboot.checking')}
                  </span>
                </div>
              ) : (
                <>
                  {/* Server Connection Status */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white/70">{t('serverReboot.serverStatus')}</span>
                    {isConnected ? (
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {t('common.connected')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-500/20 text-red-300 border-red-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {t('common.disconnected')}
                      </Badge>
                    )}
                  </div>

                  {/* API Extension Status - Only show when server is connected */}
                  {isConnected && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white/70">{t('serverReboot.extensionStatus')}</span>
                      {hasExtension ? (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('common.available')}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-red-500/20 text-red-300 border-red-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {t('common.notFound')}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Server URL Info */}
                  <div className="text-xs text-white/40 mt-1 p-2 bg-black/20 rounded">
                    <strong>{t('serverReboot.serverUrl')}</strong> <span className="font-mono ml-1">{url || t('common.notConfigured')}</span>
                  </div>

                  {/* Status Summary */}
                  {isConnected && hasExtension && !error && !isRebooting && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-300">
                          {t('serverReboot.ready')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Error Messages */}
                  {(!isConnected || !hasExtension || error) && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-2">
                      <h4 className="text-sm font-medium text-red-300">{t('serverReboot.issues')}</h4>
                      <ul className="text-sm text-red-300/80 space-y-1 list-disc list-inside">
                        {!isConnected && <li>{t('serverReboot.issueConnection')}</li>}
                        {isConnected && !hasExtension && <li>{t('serverReboot.issueExtension')}</li>}
                        {error && !isRebooting && <li>{error}</li>}
                      </ul>

                      {!hasExtension && isConnected && (
                        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                          <p className="text-xs text-blue-300">
                            <strong>To fix:</strong> {t('serverReboot.fixInstall')}
                          </p>
                          <p className="text-xs text-blue-300/80 mt-1 font-mono bg-black/20 p-1 rounded">
                            {t('serverReboot.path')} ComfyUI/custom_nodes/comfyui-mobile-ui-api-extension/
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recheck Button */}
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => {
                        connect();
                        checkExtension();
                      }}
                      variant="outline"
                      size="sm"
                      disabled={isCheckingExtension}
                      className="border-white/10 text-white hover:bg-white/10 hover:text-white bg-white/5"
                    >
                      {isCheckingExtension ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      {t('serverReboot.recheck')}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Watchdog Service - Independent Card */}
          <Card className={`border backdrop-blur-sm shadow-xl ${watchdogStatus.available && watchdogStatus.running
            ? 'border-blue-500/20 bg-blue-500/5'
            : 'border-white/10 bg-black/20'
            }`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-white/90">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                  <span>Watchdog Service</span>
                </div>
                {watchdogStatus.lastChecked && (
                  <span className="text-xs font-normal text-white/40">
                    {t('serverReboot.checkedAgo', { seconds: Math.floor((Date.now() - (watchdogStatus.lastChecked || 0)) / 1000) })}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCheckingWatchdog ? (
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-white/70">
                    {t('serverReboot.checkingWatchdog')}
                  </span>
                </div>
              ) : (
                <>
                  {/* Watchdog Service Status */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white/70">Watchdog Service</span>
                    {watchdogStatus.available && watchdogStatus.running ? (
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active & Running
                      </Badge>
                    ) : watchdogStatus.available ? (
                      <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Available (Stopped)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-white/40 border-white/10">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Available
                      </Badge>
                    )}
                  </div>

                  {/* ComfyUI Monitoring Status */}
                  {watchdogStatus.available && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white/70">{t('serverReboot.monitorStatus')}</span>
                      {watchdogStatus.comfyuiResponsive ? (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('serverReboot.responsive')}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-red-500/20 text-red-300 border-red-500/30">
                          <XCircle className="h-3 w-3 mr-1" />
                          {t('serverReboot.notResponding')}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Restart Capability Info */}
                  <div className={`p-3 border rounded-lg ${watchdogStatus.available
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-white/5 border-white/10'
                    }`}>
                    <div className="flex items-start space-x-3">
                      {watchdogStatus.available ? (
                        <CheckCircle className="h-4 w-4 text-blue-400 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-white/40 mt-0.5" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${watchdogStatus.available && watchdogStatus.running
                          ? 'text-blue-300'
                          : 'text-white/60'
                          }`}>
                          {
                            watchdogStatus.available && watchdogStatus.running
                              ? t('serverReboot.restartCapability.enhanced')
                              : watchdogStatus.available
                                ? t('serverReboot.restartCapability.watchdogOnly')
                                : t('serverReboot.restartCapability.basic')
                          }
                        </p>
                        <p className="text-xs mt-1 text-white/40">
                          {
                            watchdogStatus.available && watchdogStatus.running
                              ? t('serverReboot.restartDesc.enhanced')
                              : watchdogStatus.available
                                ? t('serverReboot.restartDesc.watchdogOnly')
                                : t('serverReboot.restartDesc.basic')
                          }
                        </p>
                        {watchdogStatus.available && !watchdogStatus.comfyuiResponsive && (
                          <p className="text-xs mt-1 text-orange-400">
                            {t('serverReboot.downWarning')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex justify-between pt-2">
                    <Button
                      onClick={async () => {
                        const logs = await fetchWatchdogLogs();
                        if (logs) {
                          setRebootStatus({
                            phase: 'idle',
                            message: '',
                            logs: logs.logs?.slice(-20) || []
                          });
                        }
                      }}
                      variant="ghost"
                      size="sm"
                      disabled={!watchdogStatus.available}
                      className="text-white/60 hover:text-white hover:bg-white/10"
                    >
                      📋 {t('serverReboot.viewLogs')}
                    </Button>

                    <Button
                      onClick={checkWatchdogStatus}
                      variant="outline"
                      size="sm"
                      disabled={isCheckingWatchdog}
                      className="border-white/10 text-white hover:bg-white/10 hover:text-white bg-white/5"
                    >
                      {isCheckingWatchdog ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <AlertCircle className="h-4 w-4 mr-2" />
                      )}
                      {t('serverReboot.checkWatchdog')}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Reboot Control */}
          <Card className="border border-white/5 bg-black/20 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="text-white/90">
                {t('serverReboot.controlTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Reboot Status */}
              {rebootStatus.phase !== 'idle' && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(rebootStatus.phase)}
                    <span className={`font-medium ${getStatusColor(rebootStatus.phase)}`}>
                      {rebootStatus.message}
                    </span>
                  </div>
                  {rebootStatus.details && (
                    <p className="text-sm text-white/60 ml-8">
                      {rebootStatus.details}
                    </p>
                  )}

                  {/* Watchdog Logs */}
                  {rebootStatus.logs && rebootStatus.logs.length > 0 && (
                    <div className="mt-4 ml-8">
                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-white/70 hover:text-white transition-colors">
                          {t('serverReboot.recentLogs', { count: rebootStatus.logs.length })}
                        </summary>
                        <div className="mt-2 p-3 bg-black/50 text-green-400 text-xs font-mono rounded border border-white/10 max-h-64 overflow-y-auto custom-scrollbar">
                          {rebootStatus.logs.map((log: any, idx: number) => (
                            <div key={idx} className="mb-1 break-all">
                              <span className="text-white/40">[{log.timestamp}]</span>{' '}
                              <span className={`font-bold ${log.level === 'error' ? 'text-red-400' :
                                log.level === 'warning' ? 'text-yellow-400' :
                                  log.level === 'success' ? 'text-green-400' :
                                    log.level === 'restart' ? 'text-blue-400' :
                                      log.level === 'api' ? 'text-purple-400' :
                                        'text-white/40'
                                }`}>
                                [{log.level?.toUpperCase() || 'INFO'}]
                              </span>{' '}
                              <span className="text-white/80">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white/80">
                    {t('serverReboot.confirmMessage')}
                  </p>
                  <ul className="text-sm text-white/60 space-y-1 ml-4 list-disc list-outside">
                    <li>{t('serverReboot.confirmList.interrupt')}</li>
                    <li>{t('serverReboot.confirmList.reload')}</li>
                    <li>{t('serverReboot.confirmList.clear')}</li>
                    <li>{t('serverReboot.confirmList.time')}</li>
                  </ul>
                </div>

                <Button
                  onClick={handleReboot}
                  disabled={!canReboot}
                  className="w-full h-12 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRebooting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {rebootStatus.phase === 'rebooting' ? 'Rebooting...' :
                        rebootStatus.phase === 'waiting' ? t('serverReboot.waiting') :
                          t('serverReboot.processing')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-5 w-5 mr-2" />
                      {t('serverReboot.button')}
                    </>
                  )}
                </Button>

                {!canReboot && !isRebooting && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-sm font-medium text-white/70 mb-2">{t('serverReboot.unavailableReasons.title')}</p>
                    <div className="text-sm text-white/50 space-y-1 ml-2">
                      {!(isConnected && hasExtension) &&
                        !(watchdogStatus.available && watchdogStatus.running) && (
                          <p>• {t('serverReboot.unavailableReasons.noService')}</p>
                        )}
                      {!isConnected && !hasExtension && (
                        <p>• {t('serverReboot.unavailableReasons.disconnected')}</p>
                      )}
                      {isConnected && !hasExtension &&
                        !(watchdogStatus.available && watchdogStatus.running) && (
                          <p>• {t('serverReboot.unavailableReasons.noExtension')}</p>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Help Information */}
          <Card className="border border-white/5 bg-black/20 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white/90">
                <Info className="h-5 w-5 text-cyan-400" />
                <span>{t('serverReboot.helpTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/60">
                <p>• {t('serverReboot.helpList.1')}</p>
                <p>• {t('serverReboot.helpList.2')}</p>
                <p>• {t('serverReboot.helpList.3')}</p>
                <p>• {t('serverReboot.helpList.4')}</p>
                <p>• {t('serverReboot.helpList.5')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ServerReboot;