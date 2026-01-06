import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { useTranslation } from 'react-i18next';

interface VideoPreviewInfo {
  filename: string;
  type: 'input' | 'output' | 'temp';
  subfolder?: string;
  format?: string;
  [key: string]: any;
}

interface VideoPreviewSectionProps {
  videoPreview: VideoPreviewInfo;
  nodeId: number;
  nodeTitle?: string;
  themeOverride?: {
    container?: string;
    text?: string;
    secondaryText?: string;
    border?: string;
  };
}

export const VideoPreviewSection: React.FC<VideoPreviewSectionProps> = ({
  videoPreview,
  nodeId,
  nodeTitle,
  themeOverride
}) => {
  const { t } = useTranslation();
  const { url: serverUrl } = useConnectionStore();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Load video when component mounts
  useEffect(() => {
    loadVideo();
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoPreview.filename]);

  const loadVideo = async () => {
    if (!videoPreview.filename) return;

    setLoading(true);
    setError(null);

    try {
      const fileService = new ComfyFileService(serverUrl || 'http://localhost:8188');


      // Parse filename and subfolder
      let actualFilename: string;
      let subfolder: string = videoPreview.subfolder || '';

      if (videoPreview.filename.includes('/')) {
        const lastSlashIndex = videoPreview.filename.lastIndexOf('/');
        subfolder = videoPreview.filename.substring(0, lastSlashIndex);
        actualFilename = videoPreview.filename.substring(lastSlashIndex + 1);
      } else {
        actualFilename = videoPreview.filename;
      }

      // Try to download the video
      const blob = await fileService.downloadFile({
        filename: actualFilename,
        type: videoPreview.type,
        subfolder: subfolder
      });

      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
      } else {
        throw new Error('Failed to load video file');
      }
    } catch (err) {
      console.error(`❌ Failed to load video for node ${nodeId}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load video');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (newTime: number[]) => {
    if (!videoRef.current) return;
    const time = newTime[0];
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (newVolume: number[]) => {
    if (!videoRef.current) return;
    const vol = newVolume[0];
    videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;

    if (isMuted) {
      videoRef.current.volume = volume > 0 ? volume : 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const resetVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentTime(0);
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;

    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('media.loading')} preview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-start space-x-3">
          <div className="text-red-500 text-sm">❌</div>
          <div>
            <p className="text-red-700 dark:text-red-300 font-medium">{t('media.failedToLoadVideo')}</p>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadVideo}
              className="mt-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950/10"
            >
              {t('media.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className={`text-md font-medium flex items-center space-x-2 ${themeOverride?.text || 'text-slate-700 dark:text-slate-300'}`}>
        <span>🎥</span>
        <span>{t('media.videoPreview')}</span>
        {nodeTitle && (
          <span className="text-sm text-slate-500 dark:text-slate-400">({nodeTitle})</span>
        )}
      </h4>

      <div className={`rounded-lg overflow-hidden border ${themeOverride ? (themeOverride.container || 'bg-black/10 border-white/10') : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        {/* Video Player */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full max-h-64 object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
          />

          {/* Play button overlay when paused */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
              <Button
                size="lg"
                onClick={handlePlayPause}
                className="bg-white bg-opacity-90 hover:bg-opacity-100 text-black rounded-full p-4"
              >
                <Play className="w-8 h-8" />
              </Button>
            </div>
          )}
        </div>

        {/* Video Controls */}
        <div className="p-3 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePlayPause}
                className={themeOverride?.secondaryText || "text-slate-600 dark:text-slate-400"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={resetVideo}
                className={themeOverride?.secondaryText || "text-slate-600 dark:text-slate-400"}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>

              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className={themeOverride?.secondaryText || "text-slate-600 dark:text-slate-400"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>

                <div className="w-16">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.1}
                    onValueChange={handleVolumeChange}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className={themeOverride?.secondaryText || "text-slate-600 dark:text-slate-400"}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Video Info */}
          <div className={`text-xs pt-2 border-t ${themeOverride ? `border-white/10 ${themeOverride.text || ''}` : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}>
            <div className="flex justify-between items-center">
              <span className="truncate max-w-[200px] md:max-w-[300px]" title={videoPreview.filename}>
                {t('media.file')}: {videoPreview.filename}
              </span>
              <span className="flex-shrink-0 ml-2">{t('media.type')}: {videoPreview.type}</span>
            </div>
            {videoPreview.format && (
              <div className="mt-1">{t('media.format')}: {videoPreview.format}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};