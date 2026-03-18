import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brush, Check, Eraser, Redo2, RotateCcw, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type MaskTool = 'brush' | 'eraser';

interface StrokePoint {
  x: number;
  y: number;
}

interface MaskStroke {
  tool: MaskTool;
  size: number;
  points: StrokePoint[];
}

interface ImageMaskEditorModalProps {
  isOpen: boolean;
  sourceImage: File | Blob | null;
  initialMaskSourceImage?: File | Blob | null;
  sourceLabel?: string;
  isApplying?: boolean;
  onApply: (maskFile: File) => Promise<void> | void;
  onClose: () => void;
}

const MAX_CANVAS_DIMENSION = 1536;
const EXISTING_MASK_ALPHA_THRESHOLD = 250;
const MASK_OVERLAY_ALPHA = 180;
const MIN_VIEW_ZOOM = 1;
const MAX_VIEW_ZOOM = 6;

const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = url;
  });
};

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: MaskStroke) => {
  if (stroke.points.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.size;

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
  }

  const [firstPoint, ...otherPoints] = stroke.points;
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);

  if (otherPoints.length === 0) {
    ctx.lineTo(firstPoint.x + 0.01, firstPoint.y + 0.01);
  } else {
    for (const point of otherPoints) {
      ctx.lineTo(point.x, point.y);
    }
  }

  ctx.stroke();
  ctx.restore();
};

export const ImageMaskEditorModal: React.FC<ImageMaskEditorModalProps> = ({
  isOpen,
  sourceImage,
  initialMaskSourceImage = null,
  sourceLabel,
  isApplying = false,
  onApply,
  onClose
}) => {
  const { t } = useTranslation();
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const initialMaskImageDataRef = useRef<ImageData | null>(null);
  const [brushSize, setBrushSize] = useState<number>(36);
  const [tool, setTool] = useState<MaskTool>('brush');
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<MaskStroke[]>([]);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [initialMaskSourceImageUrl, setInitialMaskSourceImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceImageSize, setSourceImageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });
  const [hasInitialMask, setHasInitialMask] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const currentStrokeRef = useRef<MaskStroke | null>(null);
  const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const gestureRef = useRef<{
    active: boolean;
    startDistance: number;
    startZoom: number;
    startMidpoint: { x: number; y: number };
    startOffset: { x: number; y: number };
  }>({
    active: false,
    startDistance: 0,
    startZoom: 1,
    startMidpoint: { x: 0, y: 0 },
    startOffset: { x: 0, y: 0 }
  });

  const clampZoom = useCallback((zoom: number) => {
    return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, zoom));
  }, []);

  const resetView = useCallback(() => {
    setViewZoom(1);
    setViewOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!isOpen || !sourceImage) {
      setSourceImageUrl(null);
      setInitialMaskSourceImageUrl(null);
      loadedImageRef.current = null;
      initialMaskImageDataRef.current = null;
      setSourceImageSize({ width: 0, height: 0 });
      setHasInitialMask(false);
      activePointersRef.current.clear();
      gestureRef.current.active = false;
      resetView();
      return;
    }

    const url = URL.createObjectURL(sourceImage);
    const maskUrl = initialMaskSourceImage ? URL.createObjectURL(initialMaskSourceImage) : null;
    setSourceImageUrl(url);
    setInitialMaskSourceImageUrl(maskUrl);
    return () => {
      URL.revokeObjectURL(url);
      if (maskUrl) {
        URL.revokeObjectURL(maskUrl);
      }
    };
  }, [initialMaskSourceImage, isOpen, resetView, sourceImage]);

  const redrawMaskLayer = useCallback((nextStrokes: MaskStroke[]) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }

    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) {
      return;
    }

    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (initialMaskImageDataRef.current) {
      maskCtx.putImageData(initialMaskImageDataRef.current, 0, 0);
    }
    for (const stroke of nextStrokes) {
      drawStroke(maskCtx, stroke);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !sourceImageUrl) {
      setIsCanvasReady(false);
      return;
    }

    setIsLoadingImage(true);
    setErrorMessage(null);
    let isCancelled = false;

    const initializeCanvas = async () => {
      try {
        const baseImage = await loadImageFromUrl(sourceImageUrl);
        const maskReferenceImage = initialMaskSourceImageUrl && initialMaskSourceImageUrl !== sourceImageUrl
          ? await loadImageFromUrl(initialMaskSourceImageUrl)
          : baseImage;

        if (isCancelled) {
          return;
        }

        loadedImageRef.current = baseImage;
        setSourceImageSize({
          width: baseImage.naturalWidth,
          height: baseImage.naturalHeight
        });

        const longestSide = Math.max(baseImage.naturalWidth, baseImage.naturalHeight, 1);
        const scale = Math.min(1, MAX_CANVAS_DIMENSION / longestSide);
        const canvasWidth = Math.max(1, Math.round(baseImage.naturalWidth * scale));
        const canvasHeight = Math.max(1, Math.round(baseImage.naturalHeight * scale));

        const baseCanvas = baseCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!baseCanvas || !maskCanvas) {
          setIsLoadingImage(false);
          setIsCanvasReady(false);
          setErrorMessage(t('mask.errors.couldNotInitializeCanvas'));
          return;
        }

        baseCanvas.width = canvasWidth;
        baseCanvas.height = canvasHeight;
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;

        const baseCtx = baseCanvas.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');
        if (!baseCtx || !maskCtx) {
          setIsLoadingImage(false);
          setIsCanvasReady(false);
          setErrorMessage(t('mask.errors.couldNotAccessContext'));
          return;
        }

        baseCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        baseCtx.drawImage(baseImage, 0, 0, canvasWidth, canvasHeight);

        const maskReadCanvas = document.createElement('canvas');
        maskReadCanvas.width = canvasWidth;
        maskReadCanvas.height = canvasHeight;
        const maskReadCtx = maskReadCanvas.getContext('2d');
        if (!maskReadCtx) {
          setIsLoadingImage(false);
          setIsCanvasReady(false);
          setErrorMessage(t('mask.errors.maskContextUnavailable'));
          return;
        }

        maskReadCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        maskReadCtx.drawImage(maskReferenceImage, 0, 0, canvasWidth, canvasHeight);

        const sourcePixels = maskReadCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;
        const initialMaskImageData = maskCtx.createImageData(canvasWidth, canvasHeight);
        let existingMaskPixelCount = 0;
        for (let i = 0; i < sourcePixels.length; i += 4) {
          if (sourcePixels[i + 3] < EXISTING_MASK_ALPHA_THRESHOLD) {
            initialMaskImageData.data[i] = 255;
            initialMaskImageData.data[i + 1] = 0;
            initialMaskImageData.data[i + 2] = 0;
            initialMaskImageData.data[i + 3] = MASK_OVERLAY_ALPHA;
            existingMaskPixelCount++;
          }
        }

        initialMaskImageDataRef.current = initialMaskImageData;
        setHasInitialMask(existingMaskPixelCount > 0);
        maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (existingMaskPixelCount > 0) {
          maskCtx.putImageData(initialMaskImageData, 0, 0);
        }

        setStrokes([]);
        setRedoStrokes([]);
        setIsCanvasReady(true);
        setIsLoadingImage(false);
        resetView();
      } catch {
        if (isCancelled) {
          return;
        }

        loadedImageRef.current = null;
        initialMaskImageDataRef.current = null;
        setSourceImageSize({ width: 0, height: 0 });
        setHasInitialMask(false);
        setIsLoadingImage(false);
        setIsCanvasReady(false);
        setErrorMessage(t('mask.errors.failedToLoadSourceImage'));
        activePointersRef.current.clear();
        gestureRef.current.active = false;
        resetView();
      }
    };

    void initializeCanvas();

    return () => {
      isCancelled = true;
    };
  }, [initialMaskSourceImageUrl, isOpen, resetView, sourceImageUrl, t]);

  useEffect(() => {
    if (!isCanvasReady) {
      return;
    }
    redrawMaskLayer(strokes);
  }, [isCanvasReady, strokes, redrawMaskLayer]);

  const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return null;
    }

    const rect = maskCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * maskCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * maskCanvas.height
    };
  }, []);

  const drawPreviewSegment = useCallback((from: StrokePoint, to: StrokePoint, segmentTool: MaskTool, segmentSize: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }

    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) {
      return;
    }

    drawStroke(maskCtx, {
      tool: segmentTool,
      size: segmentSize,
      points: [from, to]
    });
  }, []);

  const finishPointerDraw = useCallback((pointerId: number | null) => {
    if (!isDrawingRef.current || activePointerIdRef.current !== pointerId) {
      return;
    }

    isDrawingRef.current = false;
    activePointerIdRef.current = null;

    const completedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    if (!completedStroke || completedStroke.points.length === 0) {
      return;
    }

    const finalizedStroke: MaskStroke = {
      ...completedStroke,
      points: [...completedStroke.points]
    };

    setStrokes((prev) => [...prev, finalizedStroke]);
    setRedoStrokes([]);
  }, []);

  const getTwoPointerState = () => {
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length < 2) {
      return null;
    }
    const p1 = pointers[0];
    const p2 = pointers[1];
    const dx = p2.clientX - p1.clientX;
    const dy = p2.clientY - p1.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return {
      distance,
      midpoint: {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      }
    };
  };

  const startGestureMode = useCallback(() => {
    const pointerState = getTwoPointerState();
    if (!pointerState) {
      return;
    }

    gestureRef.current = {
      active: true,
      startDistance: Math.max(pointerState.distance, 1),
      startZoom: viewZoom,
      startMidpoint: pointerState.midpoint,
      startOffset: viewOffset
    };
  }, [viewOffset, viewZoom]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCanvasReady || isApplying) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    const pointerCount = activePointersRef.current.size;
    if (pointerCount >= 2) {
      finishPointerDraw(activePointerIdRef.current);
      startGestureMode();
      return;
    }

    const point = toCanvasPoint(event);
    if (!point) {
      return;
    }

    isDrawingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    currentStrokeRef.current = {
      tool,
      size: brushSize,
      points: [point]
    };

    drawPreviewSegment(point, point, tool, brushSize);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY
      });
    }

    if (gestureRef.current.active) {
      const pointerState = getTwoPointerState();
      if (!pointerState) {
        return;
      }

      event.preventDefault();
      const distanceRatio = pointerState.distance / Math.max(gestureRef.current.startDistance, 1);
      const nextZoom = clampZoom(gestureRef.current.startZoom * distanceRatio);
      setViewZoom(nextZoom);
      setViewOffset({
        x: gestureRef.current.startOffset.x + (pointerState.midpoint.x - gestureRef.current.startMidpoint.x),
        y: gestureRef.current.startOffset.y + (pointerState.midpoint.y - gestureRef.current.startMidpoint.y)
      });
      return;
    }

    if (!isDrawingRef.current || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = toCanvasPoint(event);
    if (!point || !currentStrokeRef.current) {
      return;
    }

    event.preventDefault();

    const currentStroke = currentStrokeRef.current;
    const previousPoint = currentStroke.points[currentStroke.points.length - 1];
    currentStroke.points.push(point);

    drawPreviewSegment(previousPoint, point, currentStroke.tool, currentStroke.size);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);
    if (gestureRef.current.active) {
      if (activePointersRef.current.size < 2) {
        gestureRef.current.active = false;
      }
    } else {
      finishPointerDraw(event.pointerId);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (gestureRef.current.active) {
      if (activePointersRef.current.size < 2) {
        gestureRef.current.active = false;
      }
    } else {
      finishPointerDraw(event.pointerId);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const next = [...prev];
      const removedStroke = next.pop();
      if (removedStroke) {
        setRedoStrokes((redoPrev) => [removedStroke, ...redoPrev]);
      }
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStrokes((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const [stroke, ...remaining] = prev;
      setStrokes((strokesPrev) => [...strokesPrev, stroke]);
      return remaining;
    });
  };

  const handleZoomIn = () => {
    setViewZoom((prev) => clampZoom(prev + 0.25));
  };

  const handleZoomOut = () => {
    setViewZoom((prev) => clampZoom(prev - 0.25));
  };

  const handleReset = () => {
    setStrokes([]);
    setRedoStrokes([]);
    setErrorMessage(null);
  };

  const handleClearMask = () => {
    initialMaskImageDataRef.current = null;
    setHasInitialMask(false);
    setStrokes([]);
    setRedoStrokes([]);
    setErrorMessage(null);
    redrawMaskLayer([]);
  };

  const buildMaskFile = useCallback(async (): Promise<File> => {
    const sourceImageElement = loadedImageRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!sourceImageElement || !baseCanvas) {
      throw new Error(t('mask.errors.sourceImageUnavailable'));
    }

    const exportWidth = sourceImageSize.width || sourceImageElement.naturalWidth;
    const exportHeight = sourceImageSize.height || sourceImageElement.naturalHeight;
    if (exportWidth <= 0 || exportHeight <= 0) {
      throw new Error(t('mask.errors.invalidSourceDimensions'));
    }

    const maskBuildCanvas = document.createElement('canvas');
    maskBuildCanvas.width = exportWidth;
    maskBuildCanvas.height = exportHeight;
    const maskBuildCtx = maskBuildCanvas.getContext('2d');
    if (!maskBuildCtx) {
      throw new Error(t('mask.errors.maskContextUnavailable'));
    }

    const scaleX = exportWidth / Math.max(baseCanvas.width, 1);
    const scaleY = exportHeight / Math.max(baseCanvas.height, 1);
    const sizeScale = (scaleX + scaleY) / 2;

    if (initialMaskImageDataRef.current) {
      const initialMaskCanvas = document.createElement('canvas');
      initialMaskCanvas.width = Math.max(baseCanvas.width, 1);
      initialMaskCanvas.height = Math.max(baseCanvas.height, 1);
      const initialMaskCtx = initialMaskCanvas.getContext('2d');
      if (!initialMaskCtx) {
        throw new Error(t('mask.errors.maskContextUnavailable'));
      }
      initialMaskCtx.putImageData(initialMaskImageDataRef.current, 0, 0);
      maskBuildCtx.drawImage(initialMaskCanvas, 0, 0, exportWidth, exportHeight);
    }

    for (const stroke of strokes) {
      const scaledStroke: MaskStroke = {
        tool: stroke.tool,
        size: stroke.size * sizeScale,
        points: stroke.points.map((point) => ({
          x: point.x * scaleX,
          y: point.y * scaleY
        }))
      };
      drawStroke(maskBuildCtx, scaledStroke);
    }

    const maskData = maskBuildCtx.getImageData(0, 0, exportWidth, exportHeight).data;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      throw new Error(t('mask.errors.exportContextUnavailable'));
    }

    exportCtx.clearRect(0, 0, exportWidth, exportHeight);
    exportCtx.drawImage(sourceImageElement, 0, 0, exportWidth, exportHeight);

    const outputImageData = exportCtx.getImageData(0, 0, exportWidth, exportHeight);
    const outputData = outputImageData.data;

    // ComfyUI Load Image derives MASK from alpha channel. Painted areas are made transparent.
    for (let i = 0; i < outputData.length; i += 4) {
      outputData[i + 3] = maskData[i + 3] > 16 ? 0 : 255;
    }

    exportCtx.putImageData(outputImageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      exportCanvas.toBlob((result) => resolve(result), 'image/png');
    });

    if (!blob) {
      throw new Error(t('mask.errors.failedToExport'));
    }

    return new File([blob], `masked_${Date.now()}.png`, { type: 'image/png' });
  }, [sourceImageSize.height, sourceImageSize.width, strokes, t]);

  const handleApplyMask = async () => {
    if (!isCanvasReady || isApplying) {
      return;
    }

    setErrorMessage(null);
    try {
      const maskFile = await buildMaskFile();
      await onApply(maskFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('mask.errors.applyFailed');
      setErrorMessage(message);
    }
  };

  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <div className="fixed inset-0 z-[10010] flex flex-col bg-black/95">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{t('mask.editorTitle')}</h2>
          <p className="truncate text-xs text-white/60">
            {sourceLabel || t('mask.selectedImage')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isApplying}
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <X className="mr-1 h-4 w-4" />
            {t('mask.close')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApplyMask}
            disabled={!isCanvasReady || isLoadingImage || isApplying}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Check className="mr-1 h-4 w-4" />
            {isApplying ? t('mask.applyingMask') : t('mask.applyMask')}
          </Button>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={tool === 'brush' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('brush')}
              className={tool === 'brush' ? 'bg-blue-600 hover:bg-blue-500' : 'border-white/20 bg-transparent text-white hover:bg-white/10'}
            >
              <Brush className="mr-1 h-4 w-4" />
              {t('mask.brush')}
            </Button>
            <Button
              type="button"
              variant={tool === 'eraser' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('eraser')}
              className={tool === 'eraser' ? 'bg-orange-600 hover:bg-orange-500' : 'border-white/20 bg-transparent text-white hover:bg-white/10'}
            >
              <Eraser className="mr-1 h-4 w-4" />
              {t('mask.eraser')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRedo}
              disabled={redoStrokes.length === 0}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={strokes.length === 0 && redoStrokes.length === 0}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t('mask.reset')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearMask}
              disabled={!hasInitialMask && strokes.length === 0 && redoStrokes.length === 0}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <X className="mr-1 h-4 w-4" />
              {t('mask.clearMask')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetView}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              {t('mask.resetView')}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="min-w-[96px] text-xs text-white/80">
              {t('mask.brushSize', { size: Math.round(brushSize) })}
            </span>
            <Slider
              value={[brushSize]}
              min={4}
              max={120}
              step={1}
              onValueChange={(value) => setBrushSize(value[0] ?? brushSize)}
              className="flex-1"
            />
            <span className="min-w-[52px] text-right text-xs text-white/70">
              {Math.round(viewZoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 pb-3">
        <div className="flex h-full w-full items-center justify-center overflow-auto rounded-xl border border-white/10 bg-slate-950/70 p-3">
          {sourceImageUrl ? (
            <div className="relative inline-block max-h-[68vh] max-w-full">
              <div
                className="relative"
                style={{
                  transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${viewZoom})`,
                  transformOrigin: 'center center'
                }}
              >
                <canvas
                  ref={baseCanvasRef}
                  className={`block h-auto max-h-[68vh] max-w-full w-auto rounded-lg transition-opacity ${isCanvasReady ? 'opacity-100' : 'opacity-0'}`}
                />
                <canvas
                  ref={maskCanvasRef}
                  className={`absolute inset-0 h-full w-full touch-none rounded-lg transition-opacity ${isCanvasReady ? 'cursor-crosshair opacity-100' : 'pointer-events-none opacity-0'}`}
                  style={{ touchAction: 'none' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onPointerLeave={handlePointerCancel}
                />
              </div>
              {!isCanvasReady && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                  {isLoadingImage ? t('mask.loadingImage') : t('mask.preparingEditor')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-white/70">{t('mask.selectImageToStart')}</div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="px-3 pb-3">
          <div className="rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-xs text-red-100">
            {errorMessage}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
