import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Image, Video, Clock, FileImage, FileVideo, Check, Loader2 } from 'lucide-react';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';
import { isImageFile, isVideoFile as checkIsVideoFile } from '@/shared/utils/ComfyFileUtils';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { toast } from 'sonner';

interface OutputAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: File) => void;
  allowImages?: boolean;
  allowVideos?: boolean;
}

export const OutputAlbumModal: React.FC<OutputAlbumModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  allowImages = true,
  allowVideos = true
}) => {
  const { t } = useTranslation();
  const { url: serverUrl } = useConnectionStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IComfyFileInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputFiles, setOutputFiles] = useState<{
    outputImages: IComfyFileInfo[];
    outputVideos: IComfyFileInfo[];
    tempImages: IComfyFileInfo[];
    tempVideos: IComfyFileInfo[];
  }>({ outputImages: [], outputVideos: [], tempImages: [], tempVideos: [] });
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<'outputImages' | 'outputVideos' | 'tempImages' | 'tempVideos'>();

  const getFileService = () => {
    const currentUrl = serverUrl || 'http://localhost:8188';
    return new ComfyFileService(currentUrl);
  };

  // Load output files on mount
  useEffect(() => {
    if (isOpen) {
      loadOutputFiles();
    }
  }, [isOpen, serverUrl]);

  const loadOutputFiles = async () => {
    setIsLoading(true);
    try {
      const fileService = getFileService();
      const allFiles = await fileService.listFiles();

      // Filter files by type and folder
      const outputImages = allFiles.images.filter(f => f.type === 'output');
      const outputVideos = allFiles.videos.filter(f => f.type === 'output');
      const tempImages = allFiles.images.filter(f => f.type === 'temp');
      const tempVideos = allFiles.videos.filter(f => f.type === 'temp');

      // Sort by modified date (newest first)
      outputImages.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      outputVideos.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      tempImages.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      tempVideos.sort((a, b) => (b.modified || 0) - (a.modified || 0));

      setOutputFiles({
        outputImages,
        outputVideos,
        tempImages,
        tempVideos
      });

      // Load thumbnails for all images (output and temp)
      const allImages = [...outputImages, ...tempImages];
      loadThumbnails(allImages);

      // Load video thumbnails (look for matching images)
      const allVideos = [...outputVideos, ...tempVideos];
      loadVideoThumbnails(allVideos, allImages);

      console.log('🖼️ Loading thumbnails for:', {
        outputImages: outputImages.length,
        tempImages: tempImages.length,
        totalImages: allImages.length,
        outputVideos: outputVideos.length,
        tempVideos: tempVideos.length,
        totalVideos: allVideos.length
      });
    } catch (error) {
      console.error('Failed to load files:', error);
      toast.error(t('outputAlbum.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadThumbnails = async (images: IComfyFileInfo[]) => {
    const fileService = getFileService();

    // Load thumbnails in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);

      await Promise.all(batch.map(async (file) => {
        try {
          const blob = await fileService.downloadFile({
            filename: file.filename,
            type: file.type,
            subfolder: file.subfolder
          });

          if (blob) {
            const url = URL.createObjectURL(blob);
            const fileKey = file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename;

            // Update thumbnails state by adding to existing map
            setThumbnails(prev => {
              const updated = new Map(prev);
              updated.set(fileKey, url);
              return updated;
            });

          } else {
            console.warn(`⚠️ No blob returned for: ${file.filename}`);
          }
        } catch (error) {
          console.warn('❌ Failed to load thumbnail for:', file.filename, error);
        }
      }));
    }
  };

  const loadVideoThumbnails = async (videos: IComfyFileInfo[], images: IComfyFileInfo[]) => {
    const fileService = getFileService();

    // Find matching image thumbnails for video files
    const findMatchingImageForVideo = (videoFilename: string, videoFile: IComfyFileInfo): IComfyFileInfo | null => {
      // Get video filename without extension
      let videoNameWithoutExt = videoFilename.substring(0, videoFilename.lastIndexOf('.'));

      // Remove -audio suffix if present (e.g., "something-video-audio" -> "something-video")
      if (videoNameWithoutExt.endsWith('-audio')) {
        videoNameWithoutExt = videoNameWithoutExt.substring(0, videoNameWithoutExt.lastIndexOf('-audio'));
      }

      // Look for image with same name but image extension in the same folder type
      const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

      for (const img of images) {
        const imgNameWithoutExt = img.filename.substring(0, img.filename.lastIndexOf('.'));
        const imgExt = img.filename.split('.').pop()?.toLowerCase() || '';

        // Must match name, folder type, and subfolder
        if (imgNameWithoutExt === videoNameWithoutExt &&
          imageExtensions.includes(imgExt) &&
          img.type === videoFile.type &&
          img.subfolder === videoFile.subfolder) {
          return img;
        }
      }

      return null;
    };

    // Load thumbnails for videos with matching images
    const batchSize = 5;
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);

      await Promise.all(batch.map(async (videoFile) => {
        try {
          const matchingImage = findMatchingImageForVideo(videoFile.filename, videoFile);

          if (matchingImage) {
            const blob = await fileService.downloadFile({
              filename: matchingImage.filename,
              type: matchingImage.type,
              subfolder: matchingImage.subfolder
            });

            if (blob) {
              const url = URL.createObjectURL(blob);
              const videoKey = videoFile.subfolder ? `${videoFile.subfolder}/${videoFile.filename}` : videoFile.filename;

              setThumbnails(prev => new Map(prev.set(videoKey, url)));
            }
          } else {
          }
        } catch (error) {
          console.warn('❌ Failed to load video thumbnail for:', videoFile.filename, error);
        }
      }));
    }
  };

  const handleFileSelect = async (file: IComfyFileInfo) => {
    if (isProcessing) return;

    setSelectedFile(file);
    setIsProcessing(true);

    try {
      const fileService = getFileService();

      // Download the file from the appropriate folder (output or temp)
      const blob = await fileService.downloadFile({
        filename: file.filename,
        type: file.type,
        subfolder: file.subfolder
      });

      if (!blob) {
        throw new Error('Failed to download file');
      }

      // Create a new File object from the blob
      const fileExtension = file.filename.split('.').pop() || '';
      const mimeType = isImageFile(file.filename)
        ? `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
        : checkIsVideoFile(file.filename)
          ? `video/${fileExtension}`
          : 'application/octet-stream';

      const newFile = new File([blob], file.filename, { type: mimeType });

      // Pass the file to the parent component
      onSelect(newFile);
      onClose();

      onSelect(newFile);
      onClose();

      toast.success(t('outputAlbum.selected', { filename: file.filename }));
    } catch (error) {
      console.error('Failed to process file:', error);
      toast.error(t('outputAlbum.processFailed'));
    } finally {
      setIsProcessing(false);
      setSelectedFile(null);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return t('outputAlbum.unknownSize');
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return t('outputAlbum.unknownDate');
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('outputAlbum.justNow');
    if (diffMins < 60) return t('outputAlbum.minAgo', { count: diffMins });
    if (diffMins < 1440) return t('outputAlbum.hoursAgo', { count: Math.floor(diffMins / 60) });
    return date.toLocaleDateString();
  };

  const renderFileGrid = (files: IComfyFileInfo[], isVideo: boolean) => {
    if (files.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          {isVideo ? <FileVideo className="w-12 h-12 mb-2" /> : <FileImage className="w-12 h-12 mb-2" />}
          <p>{isVideo ? t('outputAlbum.noVideos') : t('outputAlbum.noImages')}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 p-3">
        {files.map((file) => {
          const fileKey = file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename;
          const thumbnailUrl = thumbnails.get(fileKey);
          const isSelected = selectedFile?.filename === file.filename;
          const isVideoFile = isVideo;

          return (
            <button
              key={fileKey}
              onClick={() => handleFileSelect(file)}
              disabled={isProcessing}
              className={`
                relative group rounded-lg overflow-hidden border-2 transition-all
                ${isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'}
                ${isProcessing && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* Thumbnail or placeholder - Fixed square size */}
              <div className="w-full aspect-square bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                {isVideoFile ? (
                  // Video with thumbnail or placeholder
                  thumbnailUrl ? (
                    <>
                      <div className="w-full h-full flex items-center justify-center p-1">
                        <img
                          src={thumbnailUrl}
                          alt={file.filename}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      {/* Video overlay icon */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/50 rounded-full p-2">
                          <Video className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-400" />
                    </div>
                  )
                ) : thumbnailUrl ? (
                  <div className="w-full h-full flex items-center justify-center p-1">
                    <img
                      src={thumbnailUrl}
                      alt={file.filename}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-8 h-8 text-gray-400" />
                  </div>
                )}

                {/* Selection overlay */}
                {isSelected && (
                  <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                    {isProcessing ? (
                      <Loader2 className="w-8 h-8 animate-spin text-white" />
                    ) : (
                      <Check className="w-8 h-8 text-white" />
                    )}
                  </div>
                )}

                {/* Hover overlay */}
                {!isSelected && !isProcessing && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center p-2">
                      <p className="text-xs font-medium">{t('outputAlbum.clickToSelect')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* File info - Compact */}
              <div className="p-1.5 bg-white dark:bg-gray-900">
                <p className="text-[10px] font-medium truncate leading-tight">{file.filename}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] text-gray-500">{formatFileSize(file.size)}</span>
                  <div className="flex items-center text-[9px] text-gray-500">
                    <Clock className="w-2.5 h-2.5 mr-0.5" />
                    {formatDate(file.modified)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // Determine which tabs to show based on allowed types
  type Tab = {
    key: string;
    label: string;
    files: IComfyFileInfo[];
    isVideo: boolean;
  };
  const availableTabs: Tab[] = [];
  if (allowImages) {
    availableTabs.push(
      { key: 'outputImages', label: t('outputAlbum.outputImages'), files: outputFiles.outputImages, isVideo: false },
      { key: 'tempImages', label: t('outputAlbum.tempImages'), files: outputFiles.tempImages, isVideo: false }
    );
  }
  if (allowVideos) {
    availableTabs.push(
      { key: 'outputVideos', label: t('outputAlbum.outputVideos'), files: outputFiles.outputVideos, isVideo: true },
      { key: 'tempVideos', label: t('outputAlbum.tempVideos'), files: outputFiles.tempVideos, isVideo: true }
    );
  }

  useEffect(() => {
    if (isOpen && availableTabs.length > 0 && !activeTab) {
      let defaultTabKey = 'outputImages'; // Default fallback
      if (allowImages && outputFiles.outputImages.length > 0) {
        defaultTabKey = 'outputImages';
      } else if (allowVideos && outputFiles.outputVideos.length > 0) {
        defaultTabKey = 'outputVideos';
      } else {
        // If preferred tabs are empty, pick the first available one
        defaultTabKey = availableTabs[0].key;
      }
      setActiveTab(defaultTabKey as any);
    }
  }, [isOpen, availableTabs, activeTab, allowImages, allowVideos, outputFiles]);

  return (
    <Dialog open={isOpen} onOpenChange={() => !isProcessing && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="w-5 h-5" />
            {t('outputAlbum.title')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : availableTabs.length > 1 ? (
          <Tabs
            value={activeTab}
            onValueChange={(v: string) => setActiveTab(v as any)}
            className="flex-1"
          >
            <TabsList className="w-full rounded-none border-b grid" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, 1fr)` }}>
              {availableTabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="gap-2 text-xs">
                  {tab.isVideo ? <Video className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                  {tab.label} ({tab.files.length})
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[500px]">
              {availableTabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="m-0">
                  {renderFileGrid(tab.files, tab.isVideo)}
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        ) : availableTabs.length === 1 ? (
          // Single tab - no tabs UI needed
          <ScrollArea className="h-[500px]">
            {renderFileGrid(availableTabs[0].files, availableTabs[0].isVideo)}
          </ScrollArea>
        ) : (
          // No available tabs
          <div className="flex items-center justify-center py-12 text-gray-500">
            <p>{t('outputAlbum.noFilesForType')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};