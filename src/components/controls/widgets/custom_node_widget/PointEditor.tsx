import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IComfyGraphNode } from '@/shared/types/app/base';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Label } from '@/components/ui/label';
import { OutputsGallery } from '@/components/media/OutputsGallery';
import { ComfyFileService } from '@/infrastructure/api/ComfyFileService';
import { useConnectionStore } from '@/ui/store/connectionStore';
import { Trash2, Undo, Upload, Image, X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface PointsData {
  positive: Point[];
  negative: Point[];
}

interface PointEditorProps {
  node: IComfyGraphNode;
  onWidgetChange: (widgetName: string, value: any) => void;
  isModified?: boolean;
  modifiedHighlightClasses?: string;
}

type PointMode = 'positive' | 'negative';

export const PointEditor: React.FC<PointEditorProps> = ({
  node,
  onWidgetChange,
  isModified = false,
  modifiedHighlightClasses = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 480, height: 832 });
  const [pointMode, setPointMode] = useState<PointMode>('positive');
  const [points, setPoints] = useState<PointsData>({ positive: [], negative: [] });
  const [pointHistory, setPointHistory] = useState<Array<{ type: PointMode; point: Point }>>([]);
  const [showOutputsGallery, setShowOutputsGallery] = useState(false);
  const { url: serverUrl } = useConnectionStore();

  // Initialize canvas size from node widget values
  useEffect(() => {
    const widgets = (node as any).getWidgets ? (node as any).getWidgets() : [];
    const widthWidget = widgets.find((w: any) => w.name === 'width');
    const heightWidget = widgets.find((w: any) => w.name === 'height');

    const initialWidth = widthWidget?.value || 480;
    const initialHeight = heightWidget?.value || 832;

    setCanvasSize({ width: initialWidth, height: initialHeight });
  }, [node]);

  // Parse existing points from node
  useEffect(() => {
    const widgets = (node as any).getWidgets ? (node as any).getWidgets() : [];
    const pointsStoreWidget = widgets.find((w: any) => w.name === 'points_store');
    if (pointsStoreWidget?.value) {
      try {
        const parsed = JSON.parse(pointsStoreWidget.value);
        if (parsed.positive && parsed.negative) {
          setPoints(parsed);

          // Rebuild history from existing points
          const history: Array<{ type: PointMode; point: Point }> = [];
          parsed.positive.forEach((p: Point) => history.push({ type: 'positive', point: p }));
          parsed.negative.forEach((p: Point) => history.push({ type: 'negative', point: p }));
          setPointHistory(history);
        }
      } catch (error) {
        console.warn('Failed to parse points_store:', error);
      }
    }
  }, [node]);

  // Draw canvas content
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // Draw background image if available (fill entire canvas)
    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, width, height);
    }

    // Draw grid (more visible when no background image)
    if (!backgroundImage) {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      const gridSize = 20;

      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else {
      // Subtle grid over image
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      const gridSize = 20;

      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Draw points
    const pointSize = 8;

    // Draw positive points (green)
    points.positive.forEach(point => {
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    });

    // Draw negative points (red)
    points.negative.forEach(point => {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    });
  }, [backgroundImage, points, canvasSize]);

  // Redraw canvas when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Force redraw when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure canvas is mounted
      const timer = setTimeout(() => {
        drawCanvas();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, drawCanvas]);

  // Handle canvas click to add points
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    const newPoint: Point = { x, y };

    setPoints(prev => ({
      ...prev,
      [pointMode]: [...prev[pointMode], newPoint]
    }));

    setPointHistory(prev => [...prev, { type: pointMode, point: newPoint }]);
  }, [pointMode]);

  // Undo last point
  const handleUndo = useCallback(() => {
    if (pointHistory.length === 0) return;

    const lastAction = pointHistory[pointHistory.length - 1];

    setPoints(prev => ({
      ...prev,
      [lastAction.type]: prev[lastAction.type].slice(0, -1)
    }));

    setPointHistory(prev => prev.slice(0, -1));
  }, [pointHistory]);

  // Clear all points
  const handleClearAll = useCallback(() => {
    setPoints({ positive: [], negative: [] });
    setPointHistory([]);
  }, []);

  // Apply changes to node
  const handleApply = useCallback(() => {
    const pointsStore = JSON.stringify(points);
    const coordinates = JSON.stringify(points.positive);
    const negCoordinates = JSON.stringify(points.negative);

    // Update widget values
    onWidgetChange('points_store', pointsStore);
    onWidgetChange('coordinates', coordinates);
    onWidgetChange('neg_coordinates', negCoordinates);

    // Update canvas dimensions
    onWidgetChange('width', canvasSize.width);
    onWidgetChange('height', canvasSize.height);

    setIsOpen(false);
  }, [points, canvasSize, onWidgetChange]);

  // Handle background image selection from file upload
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const img = document.createElement('img') as HTMLImageElement;
    img.onload = () => {
      setBackgroundImage(img);
      setCanvasSize({ width: img.width, height: img.height });
      // Clear all points when new image is loaded
      setPoints({ positive: [], negative: [] });
      setPointHistory([]);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  // Handle background image selection from OutputsGallery
  const handleOutputsGallerySelect = useCallback(async (filename: string) => {
    try {
      const serverUrlToUse = serverUrl || 'http://localhost:8188';
      const fileService = new ComfyFileService(serverUrlToUse);

      // Parse filename - OutputsGallery may pass subfolder/filename format
      const lastSlashIndex = filename.lastIndexOf('/');
      const actualFilename = lastSlashIndex >= 0 ? filename.substring(lastSlashIndex + 1) : filename;
      const subfolder = lastSlashIndex >= 0 ? filename.substring(0, lastSlashIndex) : '';

      console.log('🎯 [PointEditor] Parsing filename:', {
        originalFilename: filename,
        actualFilename,
        subfolder,
        hasSubfolder: !!subfolder
      });

      // Try different locations like InlineImagePreview does
      const locations = [
        // If we have a subfolder from the filename, try that first in input type
        ...(subfolder ? [{ type: 'input', subfolder }] : []),
        { type: 'output', subfolder: subfolder || '' },
        { type: 'output', subfolder: subfolder || 'comfyui' },
        { type: 'temp', subfolder: subfolder || '' },
        { type: 'input', subfolder: subfolder || '' }
      ];

      let blob: Blob | null = null;

      for (const location of locations) {
        try {
          console.log(`🔍 [PointEditor] Trying location:`, {
            filename: actualFilename,
            type: location.type,
            subfolder: location.subfolder
          });

          blob = await fileService.downloadFile({
            filename: actualFilename,
            type: location.type,
            subfolder: location.subfolder
          });

          if (blob && blob.size > 0) {
            console.log(`✅ [PointEditor] Successfully loaded from ${location.type}/${location.subfolder || '(root)'}`);
            break;
          }
        } catch (error) {
          console.log(`❌ [PointEditor] Failed to load from ${location.type}/${location.subfolder || '(root)'}, trying next location...`);
        }
      }

      if (blob) {
        const img = document.createElement('img') as HTMLImageElement;
        img.onload = () => {
          setBackgroundImage(img);
          setCanvasSize({ width: img.width, height: img.height });
          // Clear all points when new image is loaded
          setPoints({ positive: [], negative: [] });
          setPointHistory([]);
          URL.revokeObjectURL(img.src); // Clean up
        };
        img.onerror = () => {
          console.error('Failed to load image from blob');
          URL.revokeObjectURL(img.src); // Clean up
        };
        img.src = URL.createObjectURL(blob);
      } else {
        console.error('Failed to download image from server');
      }
    } catch (error) {
      console.error('Error loading image from OutputsGallery:', error);
    }

    setShowOutputsGallery(false);
  }, [serverUrl]);

  const { width, height } = canvasSize;

  return (
    <>
      {/* Always show the button - matching other widget styles */}
      <div className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${isModified && modifiedHighlightClasses
          ? modifiedHighlightClasses
          : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/50'
        }`}>
        <div
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Points Editor
            </span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {points.positive.length} positive, {points.negative.length} negative
          </div>
        </div>
      </div>

      {/* Modal - rendered with createPortal to document.body */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900/40 via-blue-900/20 to-purple-900/40 backdrop-blur-md">
          <div className="fixed inset-4 z-[9999] max-h-screen overflow-y-auto">
            <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-600/20 w-full h-full flex flex-col overflow-hidden">

              {/* Header */}
              <div className="relative flex items-center justify-between p-6 bg-white/10 dark:bg-slate-700/10 backdrop-blur-sm border-b border-white/10 dark:border-slate-600/10">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                  Points Editor - {width}x{height}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0 hover:bg-white/20 dark:hover:bg-slate-700/30 text-slate-700 dark:text-slate-200 backdrop-blur-sm border border-white/10 dark:border-slate-600/10 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Background Image Controls */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Background Image</h3>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="bg-image-upload"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('bg-image-upload')?.click()}
                      className="bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 hover:bg-white/50 dark:hover:bg-slate-800/50"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload from Device
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowOutputsGallery(true)}
                      className="bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 hover:bg-white/50 dark:hover:bg-slate-800/50"
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Select from Gallery
                    </Button>

                    {backgroundImage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setBackgroundImage(null);
                          // Reset to initial canvas size
                          const widgets = (node as any).getWidgets ? (node as any).getWidgets() : [];
                          const widthWidget = widgets.find((w: any) => w.name === 'width');
                          const heightWidget = widgets.find((w: any) => w.name === 'height');
                          const initialWidth = widthWidget?.value || 480;
                          const initialHeight = heightWidget?.value || 832;
                          setCanvasSize({ width: initialWidth, height: initialHeight });
                          // Clear all points when image is cleared
                          setPoints({ positive: [], negative: [] });
                          setPointHistory([]);
                        }}
                        className="bg-red-50/80 dark:bg-red-950/40 backdrop-blur border border-red-200/40 dark:border-red-800/40 hover:bg-red-100/80 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Image
                      </Button>
                    )}
                  </div>
                  {backgroundImage && (
                    <div className="text-xs text-muted-foreground">
                      Image loaded: {backgroundImage.width}x{backgroundImage.height}px
                    </div>
                  )}
                </div>

                {/* Point Mode Selection */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Point Mode</h3>
                  <div className="bg-white/30 dark:bg-slate-800/30 backdrop-blur rounded-xl border border-slate-200/40 dark:border-slate-700/40 p-4">
                    <SegmentedControl
                      items={[
                        { value: 'positive', label: 'Positive', color: 'green' },
                        { value: 'negative', label: 'Negative', color: 'red' }
                      ]}
                      value={pointMode}
                      onChange={(value) => setPointMode(value as PointMode)}
                    />
                  </div>
                </div>

                {/* Canvas */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Canvas</h3>
                  <div className="bg-white/30 dark:bg-slate-800/30 backdrop-blur rounded-xl border border-slate-200/40 dark:border-slate-700/40 p-4 flex items-center justify-center">
                    <canvas
                      ref={canvasRef}
                      className="max-w-full max-h-96 cursor-crosshair block rounded-lg"
                      style={{ aspectRatio: `${width}/${height}` }}
                      onClick={handleCanvasClick}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUndo}
                      disabled={pointHistory.length === 0}
                      className="bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 hover:bg-white/50 dark:hover:bg-slate-800/50 disabled:opacity-50"
                    >
                      <Undo className="h-4 w-4 mr-2" />
                      Undo
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearAll}
                      disabled={points.positive.length === 0 && points.negative.length === 0}
                      className="bg-orange-50/80 dark:bg-orange-950/40 backdrop-blur border border-orange-200/40 dark:border-orange-800/40 hover:bg-orange-100/80 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>

                    <div className="flex-1" />

                    <Button
                      variant="outline"
                      onClick={() => setIsOpen(false)}
                      className="bg-white/30 dark:bg-slate-800/30 backdrop-blur border border-slate-200/40 dark:border-slate-700/40 hover:bg-white/50 dark:hover:bg-slate-800/50"
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleApply}
                      className="bg-blue-500/80 dark:bg-blue-600/80 backdrop-blur border border-blue-300/40 dark:border-blue-500/40 hover:bg-blue-600/80 dark:hover:bg-blue-500/80 text-white"
                    >
                      Apply
                    </Button>
                  </div>

                  {/* Status */}
                  <div className="bg-white/20 dark:bg-slate-800/20 backdrop-blur rounded-lg border border-slate-200/30 dark:border-slate-700/30 p-3">
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      Positive: {points.positive.length} points, Negative: {points.negative.length} points
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* OutputsGallery Modal */}
      {showOutputsGallery && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-auto overscroll-contain">
          <OutputsGallery
            isFileSelectionMode={true}
            allowImages={true}
            allowVideos={false}
            onFileSelect={handleOutputsGallerySelect}
            onBackClick={() => setShowOutputsGallery(false)}
            selectionTitle="Select Background Image for Points Editor"
            initialFolder="input"
          />
        </div>,
        document.body
      )}
    </>
  );
};