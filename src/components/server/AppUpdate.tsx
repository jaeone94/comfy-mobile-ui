import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/ui/store/connectionStore';
import {
    Download,
    CheckCircle,
    ArrowLeft,
    RotateCcw,
    AlertCircle,
    Server,
    ExternalLink
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface UpdateInfo {
    has_update: boolean;
    current_version: string;
    latest_version: string;
    release_notes: string;
    asset_url: string;
    error?: string;
}

export const AppUpdate: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { url: serverUrl, remoteVersion, isConnected } = useConnectionStore();

    const [loading, setLoading] = useState(true);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState<string>('');
    const [updateComplete, setUpdateComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Derived Launcher URL (Port 9188)
    const launcherUrl = useMemo(() => {
        if (!serverUrl) return '';
        try {
            const url = new URL(serverUrl);
            return `${url.protocol}//${url.hostname}:9188`;
        } catch (e) {
            return '';
        }
    }, [serverUrl]);

    useEffect(() => {
        if (isConnected) {
            checkUpdate();
        }
    }, [isConnected, launcherUrl]);

    const checkUpdate = async () => {
        if (!launcherUrl) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${launcherUrl}/api/update/check`);
            const data = await response.json();

            if (response.ok) {
                setUpdateInfo(data);
                if (data.error) {
                    setError(data.error);
                }
            } else {
                throw new Error(data.error || 'Failed to check for updates');
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Could not connect to update service');
        } finally {
            setLoading(false);
        }
    };

    const startUpdate = async () => {
        if (!updateInfo?.asset_url || !launcherUrl) return;

        setDownloading(true);
        setDownloadStatus(t('appUpdate.downloading'));
        setProgress(0);
        setError(null);

        try {
            const response = await fetch(`${launcherUrl}/api/update/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset_url: updateInfo.asset_url })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start download');
            }

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${launcherUrl}/api/update/status`);
                    if (statusRes.ok) {
                        const status = await statusRes.json();

                        if (status.status === 'downloading') {
                            setProgress(status.progress);
                            setDownloadStatus(`${t('appUpdate.downloading')} ${status.progress.toFixed(1)}%`);
                        } else if (status.status === 'extracting') {
                            setProgress(100);
                            setDownloadStatus(t('appUpdate.extracting'));
                        } else if (status.status === 'complete' || status.status === 'ready_to_restart') {
                            clearInterval(pollInterval);
                            setDownloading(false);
                            setUpdateComplete(true);
                            setDownloadStatus(t('appUpdate.ready'));
                            toast.success('Update downloaded successfully!');
                        } else if (status.status === 'error') {
                            clearInterval(pollInterval);
                            setDownloading(false);
                            setError(status.error || t('failed'));
                        }
                    }
                } catch (e) {
                    console.error('Polling error:', e);
                }
            }, 1000);

        } catch (err) {
            setDownloading(false);
            setError(err instanceof Error ? err.message : t('failed'));
        }
    };

    const handleRestart = () => {
        navigate('/reboot');
    };

    if (!isConnected) {
        return (
            <div className="bg-black transition-colors duration-300 pwa-container h-[100dvh] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-[#0b0c0f]" />
                <div className="relative z-10 p-4 max-w-md w-full bg-[#101217] rounded-xl border border-white/10 text-center shadow-xl">
                    <Server className="w-12 h-10 mx-auto text-[#565d6b] mb-4" />
                    <h2 className="text-[15px] font-bold text-[#e9ebef] mb-2">ComfyUI Disconnected</h2>
                    <p className="text-[#8a919e] mb-3 text-[12px]">Please connect to a ComfyUI server first to manage updates.</p>
                    <Button onClick={() => navigate(-1)} variant="outline" className="w-full">{t('common.back')}</Button>
                </div>
            </div>
        );
    }

    const isDev = remoteVersion === 'dev' || !remoteVersion;

    return (
        <div
            className="bg-black transition-colors duration-300 pwa-container h-[100dvh] fixed inset-0 overflow-hidden"
            style={{ touchAction: 'none' }}
        >
            <div className="absolute inset-0 bg-[#0b0c0f]" />

            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden safe-area-inset" style={{ touchAction: 'pan-y' }}>
                <header className="sticky top-0 z-50 bg-[#0b0c0f]/95 backdrop-blur-xl border-b border-white/[0.08] p-4">
                    <div className="max-w-2xl mx-auto flex items-center space-x-4">
                        <Button onClick={() => navigate(-1)} variant="outline" size="icon" className="h-9 w-9 bg-white/[0.045] border border-white/[0.08] hover:bg-white/[0.08] rounded-[10px] text-[#c8ccd4]">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-[15px] font-bold text-[#e9ebef]">{t('appUpdate.title')}</h1>
                            <p className="text-xs text-[#71798a]">{t('appUpdate.subtitle')}</p>
                        </div>
                    </div>
                </header>

                <main className="container mx-auto px-4 py-5 max-w-2xl relative">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">

                        <div className="border border-white/[0.08] rounded-xl bg-white/[0.025] p-4 shadow-xl overflow-hidden relative">
                            {/* Version Info Section */}
                            <div className="flex flex-col items-center mb-10 mt-4">
                                <div className="flex items-center space-x-6">
                                    <div className="text-center group">
                                        <p className="text-[10px] text-[#565d6b] uppercase font-bold tracking-widest mb-2">{t('appUpdate.current')}</p>
                                        <div className="relative">
                                            <div className="absolute -inset-1 bg-[#3069f0]/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <Badge variant="outline" className="relative text-[15px] px-4 py-2 font-mono bg-[#101217] border-white/[0.08] shadow-sm">
                                                {remoteVersion || 'dev'}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center py-4">
                                        <div className="w-8 h-[2px] bg-[#3069f0] rounded-full opacity-30" />
                                    </div>

                                    <div className="text-center group">
                                        <p className="text-[10px] text-[#565d6b] uppercase font-bold tracking-widest mb-2">{t('appUpdate.latest')}</p>
                                        <div className="relative">
                                            <div className={`absolute -inset-1 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity ${updateInfo?.has_update ? 'bg-[#3069f0]/20' : 'bg-[#34c77b]/20'}`} />
                                            <Badge className={`relative text-[15px] px-4 py-2 font-mono text-white shadow-lg ${loading ? 'bg-slate-300 dark:bg-slate-700' :
                                                updateInfo?.has_update ? 'bg-[#3069f0]' :
                                                    updateInfo ? 'bg-[#34c77b]' : 'bg-slate-300 dark:bg-slate-700'
                                                }`}>
                                                {loading ? '...' : updateInfo?.latest_version || '?'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status and Action Area */}
                            <div className="space-y-2">
                                <AnimatePresence mode="wait">
                                    {loading ? (
                                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-10">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full border-2 border-white/[0.08] border-t-[#3069f0] animate-spin" />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="w-6 h-6 rounded-full border-2 border-[#3069f0]/20 border-b-[#5b8af5] animate-spin-reverse" />
                                                </div>
                                            </div>
                                            <p className="mt-4 text-[12px] font-medium text-[#71798a] animate-pulse">{t('appUpdate.checking')}</p>
                                        </motion.div>
                                    ) : error ? (
                                        <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-5 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-xl">
                                            <div className="flex items-start space-x-3">
                                                <AlertCircle className="w-5 h-5 text-[#f25555] mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="text-[12px] font-bold text-red-900 dark:text-[#f87c7c]">{t('appUpdate.checkFailed')}</p>
                                                    <p className="text-xs text-red-700 dark:text-red-300/70 mt-1 leading-relaxed">{error}</p>
                                                </div>
                                            </div>
                                            <Button onClick={checkUpdate} variant="outline" size="sm" className="mt-4 w-full h-10 rounded-xl bg-[#f25555]/[0.1] border-[#f25555]/30 text-[#f87c7c] hover:bg-[#f25555]/[0.18]">
                                                {t('appUpdate.tryAgain')}
                                            </Button>
                                        </motion.div>
                                    ) : updateInfo ? (
                                        <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                                            {updateInfo.has_update ? (
                                                <div className="space-y-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-[12px] font-bold text-[#e9ebef]">{t('appUpdate.releaseNotes')}</h3>
                                                        <Badge variant="secondary" className="bg-[#3069f0]/[0.12] text-[#7ba3f5] border border-[#3069f0]/30 px-2 py-0 font-mono text-[9px]">{t('appUpdate.newVersion')}</Badge>
                                                    </div>
                                                    <div className="bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl max-h-60 overflow-y-auto text-[12px] text-[#8a919e] leading-relaxed scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                                                        {updateInfo.release_notes || t('appUpdate.noNotes')}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="py-10 flex flex-col items-center bg-green-50/30 dark:bg-green-950/10 rounded-xl border border-green-100 dark:border-green-900/20">
                                                    <div className="w-10 h-10 rounded-full bg-[#34c77b]/[0.12] border border-[#34c77b]/30 flex items-center justify-center mb-4">
                                                        <CheckCircle className="w-8 h-8 text-green-600 dark:text-[#4ade80]" />
                                                    </div>
                                                    <h3 className="text-[14px] font-bold text-green-800 dark:text-[#4ade80]">{t('appUpdate.upToDate')}</h3>
                                                    <p className="text-[12px] text-green-600 dark:text-[#4ade80]/70">{t('appUpdate.upToDateDesc')}</p>
                                                </div>
                                            )}

                                            {/* Progress / Actions */}
                                            {(downloading || updateComplete) && (
                                                <div className="space-y-2 p-4 bg-[#101217] rounded-xl border border-white/[0.08]">
                                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                                                        <span className="text-[#9a8af0]">{downloadStatus}</span>
                                                        <span className="text-[#565d6b]">{progress.toFixed(0)}%</span>
                                                    </div>
                                                    <Progress value={progress} className="h-1 bg-white/[0.06]" />
                                                </div>
                                            )}

                                            <div className="pt-2">
                                                {updateComplete ? (
                                                    <Button onClick={handleRestart} className="w-full h-10 rounded-xl bg-[#34c77b] hover:bg-[#3fd08a] text-white font-semibold transition-transform active:scale-95">
                                                        <RotateCcw className="w-5 h-5 mr-3" /> {t('appUpdate.finishRestart')}
                                                    </Button>
                                                ) : updateInfo.has_update ? (
                                                    <div className="space-y-2.5">
                                                        <Button
                                                            onClick={startUpdate}
                                                            disabled={downloading || isDev}
                                                            className="w-full h-10 rounded-xl bg-[#3069f0] hover:bg-[#3f78f5] text-white font-semibold shadow-[0_2px_12px_rgba(48,105,240,0.3)] transition-transform active:scale-95 disabled:opacity-50"
                                                        >
                                                            {downloading ? (
                                                                <div className="flex items-center">
                                                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mr-3" />
                                                                    {t('appUpdate.downloading')}
                                                                </div>
                                                            ) : (
                                                                <><Download className="w-5 h-5 mr-3" /> {t('appUpdate.updateTo', { version: updateInfo.latest_version })}</>
                                                            )}
                                                        </Button>
                                                        {isDev && (
                                                            <p className="text-center text-xs text-[#71798a] bg-slate-100 dark:bg-[#101217]/50 p-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.08]">
                                                                {t('appUpdate.devVersionNotice')}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <Button onClick={checkUpdate} variant="outline" className="w-full h-10 rounded-xl border-white/[0.08] text-[#71798a]">
                                                        {t('appUpdate.recheck')}
                                                    </Button>
                                                )}
                                            </div>
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Additional Links Card */}
                        <div className="bg-slate-100/50 dark:bg-[#101217]/40 rounded-xl p-4 border border-white/[0.08] flex items-center justify-between">
                            <div className="flex items-center space-x-3 text-[#8a919e]">
                                <ExternalLink className="w-5 h-5" />
                                <span className="text-[12px] font-medium">GitHub Repository</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open('https://github.com/jaeone94/comfy-mobile-ui', '_blank')}
                                className="text-[#5b8af5] hover:text-blue-600"
                            >
                                {t('common.open')}
                            </Button>
                        </div>

                    </motion.div>
                </main>
            </div>
        </div>
    );
};
