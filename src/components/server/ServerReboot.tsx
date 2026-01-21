import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, RotateCcw, Loader2, CheckCircle, XCircle, Server, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStore } from '@/ui/store/connectionStore';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { globalWebSocketService } from '@/infrastructure/websocket/GlobalWebSocketService';

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

        // Check if watchdog service itself is running (not ComfyUI status)
        const watchdogRunning = data.watchdog?.running;
        const comfyuiResponsive = data.comfyui?.responsive;

        console.log('🔍 Watchdog status analysis:', {
          hasWatchdog: !!data.watchdog,
          watchdogRunning: watchdogRunning,
          comfyuiResponsive: comfyuiResponsive,
          fullResponse: data
        });

        // Watchdog is available if it responds (regardless of ComfyUI status)
        if (data.watchdog !== undefined) {
          return {
            available: true,
            running: watchdogRunning || false,
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

  return (
    <div className="pwa-container flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-orange-50/30 to-red-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="shrink-0 z-50 bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
        {/* Gradient Overlay for Enhanced Glass Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
        <div className="relative flex items-center space-x-4 p-4 z-10">
          <Button
            onClick={() => onBack ? onBack() : navigate('/')}
            variant="outline"
            size="sm"
            className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t('serverReboot.title')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {t('serverReboot.subtitle')}
            </p>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="container mx-auto px-6 py-8 max-w-2xl">
          {/* Server Requirements Check */}
          <div className="mb-6">
            <Card className={`transition-all duration-500 ${isConnected && hasExtension
              ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
              }`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>{t('serverReboot.cardTitle')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isCheckingExtension ? (
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {t('serverReboot.checking')}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Server Connection Status */}
                    <div className="flex items-center space-x-3">
                      {isConnected ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {t('serverReboot.serverStatus')} {isConnected ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">{t('common.connected')}</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">{t('common.disconnected')}</span>
                        )}
                      </span>
                    </div>

                    {/* API Extension Status - Only show when server is connected */}
                    {isConnected && (
                      <div className="flex items-center space-x-3">
                        {hasExtension ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {t('serverReboot.extensionStatus')} {hasExtension ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">{t('common.available')}</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400 font-medium">{t('common.notFound')}</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Server URL Info */}
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <strong>{t('serverReboot.serverUrl')}</strong> {url || t('common.notConfigured')}
                    </div>

                    {/* Status Summary - Show when all is good */}
                    {isConnected && hasExtension && !error && !isRebooting && (
                      <div className="mt-3">
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium text-green-800 dark:text-green-200">
                              {t('serverReboot.ready')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error Messages */}
                    {(!isConnected || !hasExtension || error) && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">{t('serverReboot.issues')}</h4>
                        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                          {!isConnected && <li>• {t('serverReboot.issueConnection')}</li>}
                          {isConnected && !hasExtension && <li>• {t('serverReboot.issueExtension')}</li>}
                          {error && !isRebooting && <li>• {error}</li>}
                        </ul>

                        {!hasExtension && isConnected && (
                          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>To fix:</strong> {t('serverReboot.fixInstall')}
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              {t('serverReboot.path')} <code>ComfyUI/custom_nodes/comfyui-mobile-ui-api-extension/</code>
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Recheck Button */}
                    <div className="flex justify-end mt-4">
                      <Button
                        onClick={() => {
                          connect();
                          checkExtension();
                        }}
                        variant="outline"
                        size="sm"
                        disabled={isCheckingExtension}
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
          </div>

          {/* Watchdog Service - Independent Card */}
          <div className="mb-8">
            <Card className={`transition-all duration-500 ${watchdogStatus.available && watchdogStatus.running
              ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20'
              }`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5" />
                  <span>Watchdog Service</span>
                  <div className="ml-auto flex items-center space-x-2">
                    {watchdogStatus.lastChecked && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t('serverReboot.checkedAgo', { seconds: Math.floor((Date.now() - watchdogStatus.lastChecked) / 1000) })}
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isCheckingWatchdog ? (
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {t('serverReboot.checkingWatchdog')}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Watchdog Service Status */}
                    <div className="flex items-center space-x-3">
                      {watchdogStatus.available && watchdogStatus.running ? (
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                      ) : watchdogStatus.available ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-500" />
                      )}
                      <span className="text-sm">
                        <strong>Watchdog Service:</strong> {
                          watchdogStatus.available && watchdogStatus.running
                            ? <span className="text-blue-600 dark:text-blue-400 font-medium">Active & Running</span>
                            : watchdogStatus.available
                              ? <span className="text-yellow-600 dark:text-yellow-400 font-medium">Available (Stopped)</span>
                              : <span className="text-slate-600 dark:text-slate-400 font-medium">Not Available</span>
                        }
                      </span>
                    </div>

                    {/* ComfyUI Monitoring Status - Only show when watchdog is available */}
                    {watchdogStatus.available && (
                      <div className="flex items-center space-x-3">
                        {watchdogStatus.comfyuiResponsive ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          <strong>{t('serverReboot.monitorStatus')}</strong> {
                            watchdogStatus.comfyuiResponsive
                              ? <span className="text-green-600 dark:text-green-400 font-medium">{t('serverReboot.responsive')}</span>
                              : <span className="text-red-600 dark:text-red-400 font-medium">{t('serverReboot.notResponding')}</span>
                          }
                        </span>
                      </div>
                    )}

                    {/* Restart Capability Info */}
                    <div className={`p-3 border rounded-lg ${watchdogStatus.available
                      ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                      : 'bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800'
                      }`}>
                      <div className="flex items-start space-x-2">
                        {watchdogStatus.available ? (
                          <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-slate-500 mt-0.5" />
                        )}
                        <div>
                          <p className={`text-sm font-medium ${watchdogStatus.available && watchdogStatus.running
                            ? 'text-blue-800 dark:text-blue-200'
                            : 'text-slate-800 dark:text-slate-200'
                            }`}>
                            {
                              watchdogStatus.available && watchdogStatus.running
                                ? t('serverReboot.restartCapability.enhanced')
                                : watchdogStatus.available
                                  ? t('serverReboot.restartCapability.watchdogOnly')
                                  : t('serverReboot.restartCapability.basic')
                            }
                          </p>
                          <p className={`text-xs mt-1 ${watchdogStatus.available && watchdogStatus.running
                            ? 'text-blue-600 dark:text-blue-400'
                            : watchdogStatus.available
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-slate-600 dark:text-slate-400'
                            }`}>
                            {
                              watchdogStatus.available && watchdogStatus.running
                                ? t('serverReboot.restartDesc.enhanced')
                                : watchdogStatus.available
                                  ? t('serverReboot.restartDesc.watchdogOnly')
                                  : t('serverReboot.restartDesc.basic')
                            }
                          </p>
                          {watchdogStatus.available && !watchdogStatus.comfyuiResponsive && (
                            <p className="text-xs mt-1 text-orange-600 dark:text-orange-400">
                              {t('serverReboot.downWarning')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connection Method Info */}
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <div><strong>{t('serverReboot.watchdogTitle')}:</strong> {url ? `${new URL(url).hostname}:9188/status` : 'N/A'}</div>
                    </div>

                    {/* Recheck Watchdog Button */}
                    <div className="flex justify-between mt-4">
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
                      >
                        📋 {t('serverReboot.viewLogs')}
                      </Button>

                      <Button
                        onClick={checkWatchdogStatus}
                        variant="outline"
                        size="sm"
                        disabled={isCheckingWatchdog}
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
          </div>

          {/* Reboot Control */}
          <div className="mb-8 p-6 bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-lg shadow-sm dark:bg-slate-900/70 dark:border-slate-700/50">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {t('serverReboot.controlTitle')}
            </h2>

            {/* Reboot Status */}
            {rebootStatus.phase !== 'idle' && (
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex items-center space-x-3 mb-2">
                  {getStatusIcon(rebootStatus.phase)}
                  <span className={`font-medium ${getStatusColor(rebootStatus.phase)}`}>
                    {rebootStatus.message}
                  </span>
                </div>
                {rebootStatus.details && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                    {rebootStatus.details}
                  </p>
                )}

                {/* Watchdog Logs - Show when available */}
                {rebootStatus.logs && rebootStatus.logs.length > 0 && (
                  <div className="mt-4 ml-8">
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100">
                        {t('serverReboot.recentLogs', { count: rebootStatus.logs.length })}
                      </summary>
                      <div className="mt-2 p-3 bg-slate-900 text-green-400 text-xs font-mono rounded border max-h-64 overflow-y-auto">
                        {rebootStatus.logs.map((log: any, idx: number) => (
                          <div key={idx} className="mb-1">
                            <span className="text-slate-500">[{log.timestamp}]</span>{' '}
                            <span className={`font-bold ${log.level === 'error' ? 'text-red-400' :
                              log.level === 'warning' ? 'text-yellow-400' :
                                log.level === 'success' ? 'text-green-400' :
                                  log.level === 'restart' ? 'text-blue-400' :
                                    log.level === 'api' ? 'text-purple-400' :
                                      'text-slate-400'
                              }`}>
                              [{log.level?.toUpperCase() || 'INFO'}]
                            </span>{' '}
                            <span className="text-slate-200">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('serverReboot.confirmMessage')}
              </p>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 ml-4">
                <li>• {t('serverReboot.confirmList.interrupt')}</li>
                <li>• {t('serverReboot.confirmList.reload')}</li>
                <li>• {t('serverReboot.confirmList.clear')}</li>
                <li>• {t('serverReboot.confirmList.time')}</li>
              </ul>

              <Button
                onClick={handleReboot}
                disabled={!canReboot}
                className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white disabled:from-slate-300 disabled:to-slate-400"
                size="lg"
              >
                {isRebooting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {rebootStatus.phase === 'rebooting' ? 'Rebooting...' :
                      rebootStatus.phase === 'waiting' ? t('serverReboot.waiting') :
                        t('serverReboot.processing')}
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('serverReboot.button')}
                  </>
                )}
              </Button>

              {!canReboot && !isRebooting && (
                <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                  <p>{t('serverReboot.unavailableReasons.title')}</p>
                  <div className="ml-2">
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
          </div>

          {/* Help Information */}
          <div className="p-6 bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-lg shadow-sm dark:bg-slate-900/70 dark:border-slate-700/50">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
              {t('serverReboot.helpTitle')}
            </h3>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>• {t('serverReboot.helpList.1')}</p>
              <p>• {t('serverReboot.helpList.2')}</p>
              <p>• {t('serverReboot.helpList.3')}</p>
              <p>• {t('serverReboot.helpList.4')}</p>
              <p>• {t('serverReboot.helpList.5')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerReboot;