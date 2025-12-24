import React, { useState, useEffect } from 'react';
import { Video, AlertCircle, Play } from 'lucide-react';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { useTranslation } from 'react-i18next';

interface VideoPreviewData {
  filename?: string;
  type?: string;
  subfolder?: string;
}

interface InlineVideoPreviewProps {
  videoPreview: VideoPreviewData | string;
  onClick: () => void;
  isFromExecution?: boolean; // true if from workflow execution output
}

export const InlineVideoPreview: React.FC<InlineVideoPreviewProps> = ({
  videoPreview,
  onClick,
  isFromExecution = false
}) => {
  const { t } = useTranslation();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { url: serverUrl } = useConnectionStore();

  useEffect(() => {
    let currentUrl: string | null = null;

    const loadVideo = async () => {
      if (!videoPreview) return;

      setLoading(true);
      setError(null);

      try {
        const serverUrlToUse = serverUrl || 'http://localhost:8188';
        const fileService = new ComfyFileService(serverUrlToUse);

        // Parse filename from videoPreview
        const rawFilename = (typeof videoPreview === 'string' ? videoPreview : videoPreview.filename) || videoPreview;

        if (!rawFilename || typeof rawFilename !== 'string') {
          throw new Error('Invalid filename');
        }

        // Parse filename and subfolder
        let actualFilename: string;
        let subfolder: string = '';

        if (rawFilename.includes('/')) {
          const lastSlashIndex = rawFilename.lastIndexOf('/');
          subfolder = rawFilename.substring(0, lastSlashIndex);
          actualFilename = rawFilename.substring(lastSlashIndex + 1);
        } else {
          actualFilename = rawFilename;
        }

        console.log('📂 [InlineVideoPreview] Parsed:', {
          actualFilename,
          subfolder,
          originalPath: rawFilename,
          isFromExecution
        });

        // Determine the correct type based on context
        let locations: Array<{ type: string; subfolder: string }>;

        if (isFromExecution && typeof videoPreview === 'object' && videoPreview.type) {
          // From execution output - use the type specified in params
          locations = [
            { type: videoPreview.type, subfolder: videoPreview.subfolder || subfolder }
          ];
        } else {
          // From widget parameter - always use 'input'
          locations = [
            { type: 'input', subfolder }
          ];
        }

        let blob: Blob | null = null;
        let successLocation: string | null = null;

        for (const location of locations) {
          const requestUrl = `${serverUrlToUse}/view?filename=${encodeURIComponent(actualFilename)}&type=${location.type}${location.subfolder ? `&subfolder=${encodeURIComponent(location.subfolder)}` : ''}`;

          try {
            blob = await fileService.downloadFile({
              filename: actualFilename,
              type: location.type,
              subfolder: location.subfolder
            });

            if (blob && blob.size > 0) {
              successLocation = `${location.type}/${location.subfolder || '(root)'}`;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          currentUrl = url;
          setVideoUrl(url);
        } else {
          console.error('❌ [InlineVideoPreview] Video not found in any location');
          throw new Error('Video not found');
        }
      } catch (err) {
        console.error('💥 [InlineVideoPreview] Failed to load inline video preview:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadVideo();

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [videoPreview, serverUrl, isFromExecution]);

  if (loading) {
    return (
      <div
        className="w-full h-32 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-purple-300 dark:border-purple-700"
        onClick={onClick}
      >
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-purple-700 dark:text-purple-300">{t('media.loadingVideo')}</p>
        </div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div
        className="w-full h-32 bg-gradient-to-r from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-lg flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-red-300 dark:border-red-700"
        onClick={onClick}
      >
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700 dark:text-red-300">{t('media.failedToLoadVideo')}</p>
          <p className="text-xs text-red-600 dark:text-red-400">{t('media.clickToRetry')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all hover:scale-[1.02] group"
      onClick={onClick}
    >
      <div className="relative">
        <video
          src={videoUrl}
          className="w-full max-h-48 object-contain"
          preload="metadata"
          muted
          playsInline
          controls={false}
          poster=""
          onError={() => setError(t('media.failedToDisplayVideo'))}
          onLoadedMetadata={(e) => {
            const video = e.target as HTMLVideoElement;
            // Set to first frame after metadata loads
            video.currentTime = 0;
          }}
          onCanPlay={(e) => {
            const video = e.target as HTMLVideoElement;
            // Ensure we show the first frame
            if (video.currentTime === 0) {
              video.currentTime = 0.1; // Small offset to ensure frame loads
            }
          }}
          onMouseEnter={(e) => {
            const video = e.target as HTMLVideoElement;
            if (video.duration && !isNaN(video.duration)) {
              video.currentTime = Math.min(video.duration * 0.1, 3); // Show frame at 10% or 3 seconds
            }
          }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="bg-white/90 dark:bg-slate-900/90 rounded-full p-3">
            <Play className="w-6 h-6 text-slate-700 dark:text-slate-300" fill="currentColor" />
          </div>
        </div>
        {/* Video duration overlay */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          <Video className="w-3 h-3 inline mr-1" />
          {t('media.video')}
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
          {typeof videoPreview === 'string' ? videoPreview : (videoPreview.filename || t('media.videoPreview'))}
        </p>
        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
          {t('media.clickToViewFullVideo')}
        </p>
      </div>
    </div>
  );
};
