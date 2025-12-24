import React, { useState, useEffect } from 'react';
import { Image, AlertCircle } from 'lucide-react';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { useTranslation } from 'react-i18next';

interface ImagePreviewData {
  filename?: string;
  type?: string;
  subfolder?: string;
}

interface InlineImagePreviewProps {
  imagePreview: ImagePreviewData | string;
  onClick: () => void;
  isFromExecution?: boolean; // true if from workflow execution output
}

export const InlineImagePreview: React.FC<InlineImagePreviewProps> = ({
  imagePreview,
  onClick,
  isFromExecution = false
}) => {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { url: serverUrl } = useConnectionStore();

  useEffect(() => {
    let currentUrl: string | null = null;

    const loadImage = async () => {
      if (!imagePreview) return;

      setLoading(true);
      setError(null);

      try {
        const serverUrlToUse = serverUrl || 'http://localhost:8188';
        const fileService = new ComfyFileService(serverUrlToUse);

        // Parse filename from imagePreview
        const rawFilename = (typeof imagePreview === 'string' ? imagePreview : imagePreview.filename) || imagePreview;

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

        console.log('📂 [InlineImagePreview] Parsed:', {
          actualFilename,
          subfolder,
          originalPath: rawFilename,
          isFromExecution
        });

        // Determine the correct type based on context
        let locations: Array<{ type: string; subfolder: string }>;

        if (isFromExecution && typeof imagePreview === 'object' && imagePreview.type) {
          // From execution output - use the type specified in params
          locations = [
            { type: imagePreview.type, subfolder: imagePreview.subfolder || subfolder }
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
            } else {
            }
          } catch (error) {
            continue;
          }
        }

        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          currentUrl = url;
          setImageUrl(url);
        } else {
          console.error('❌ [InlineImagePreview] Image not found in any location');
          throw new Error('Image not found');
        }
      } catch (err) {
        console.error('💥 [InlineImagePreview] Failed to load inline image preview:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadImage();

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [imagePreview, serverUrl, isFromExecution]);

  if (loading) {
    return (
      <div
        className="w-full h-32 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-blue-300 dark:border-blue-700"
        onClick={onClick}
      >
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-blue-700 dark:text-blue-300">{t('media.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className="w-full h-32 bg-gradient-to-r from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-lg flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-red-300 dark:border-red-700"
        onClick={onClick}
      >
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700 dark:text-red-300">{t('media.failedToLoad')}</p>
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
        <img
          src={imageUrl}
          alt={typeof imagePreview === 'string' ? imagePreview : (imagePreview.filename || t('media.preview'))}
          className="w-full max-h-48 object-contain"
          onError={() => setError(t('media.failedToDisplayImage'))}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="bg-white/90 dark:bg-slate-900/90 rounded-full p-2">
            <Image className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
          {typeof imagePreview === 'string' ? imagePreview : (imagePreview.filename || t('media.preview'))}
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
          {t('media.clickToViewFullSize')}
        </p>
      </div>
    </div>
  );
};
