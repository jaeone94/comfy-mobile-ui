/**
 * ExecutionErrorDisplay Component
 * 
 * Displays node-specific execution errors with detailed information
 * and recovery suggestions for ComfyUI workflow execution failures.
 */

import React from 'react';
import { AlertCircle, Info, RefreshCw, Copy, X, Wrench, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { IComfyErrorInfo } from '@/shared/types/comfy/IComfyAPI';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';

// Import Swiper styles
import '@/styles/swiper-custom.css';

interface NodeError {
  nodeId: string;
  nodeType?: string;
  nodeTitle?: string;
  error: IComfyErrorInfo;
}

interface ExecutionErrorDisplayProps {
  errors: NodeError[];
  promptId?: string;
  workflowName?: string;
  onRetry?: () => void;
  onFixNode?: (nodeId: string) => void;
  onClearErrors?: () => void;
  className?: string;
}

// Simplified error categorization to prevent crashes
const categorizeError = (error: any): {
  category: 'missing_input' | 'invalid_parameter' | 'resource' | 'connection' | 'unknown';
  severity: 'critical' | 'warning' | 'info';
  suggestions: string[];
} => {
  try {
    // Get error message safely
    let errorMessage = '';
    
    if (error && typeof error === 'object') {
      // Try different possible message fields
      errorMessage = (error.exception_message || error.message || '').toString().toLowerCase();
    } else if (typeof error === 'string') {
      errorMessage = error.toLowerCase();
    }
    
    // Simple keyword-based categorization
    if (errorMessage.includes('memory') || errorMessage.includes('allocate')) {
      return {
        category: 'resource',
        severity: 'critical',
        suggestions: [
          'Reduce video resolution or frame count',
          'Clear ComfyUI cache and try again',
          'Close other applications to free memory',
          'Try processing smaller segments'
        ]
      };
    }
    
    if (errorMessage.includes('missing') || errorMessage.includes('not found')) {
      return {
        category: 'missing_input',
        severity: 'critical',
        suggestions: [
          'Check if all required inputs are provided',
          'Verify file paths and connections',
          'Ensure previous nodes completed successfully'
        ]
      };
    }
    
    if (errorMessage.includes('invalid') || errorMessage.includes('parameter')) {
      return {
        category: 'invalid_parameter',
        severity: 'critical',
        suggestions: [
          'Check parameter values and ranges',
          'Verify input format matches requirements',
          'Review node documentation'
        ]
      };
    }
    
    // Default fallback
    return {
      category: 'unknown',
      severity: 'critical',
      suggestions: [
        'Check server logs for detailed information',
        'Try restarting the operation',
        'Verify workflow configuration'
      ]
    };
    
  } catch (categorizationError) {
    console.error('Error categorization failed:', categorizationError);
    
    // Ultimate fallback
    return {
      category: 'unknown',
      severity: 'critical',
      suggestions: ['An unexpected error occurred', 'Please check server logs']
    };
  }
};


export const ExecutionErrorDisplay: React.FC<ExecutionErrorDisplayProps> = ({
  errors: originalErrors,
  promptId,
  workflowName,
  onRetry,
  onFixNode,
  onClearErrors,
  className
}) => {
  const [showingTechnicalDetails, setShowingTechnicalDetails] = React.useState<string | null>(null);
  const [currentErrorIndex, setCurrentErrorIndex] = React.useState(0);
  
  console.log('💾 ExecutionErrorDisplay rendered with:', {
    originalErrors,
    promptId,
    workflowName,
    hasErrors: originalErrors?.length > 0
  });
  
  // DEBUG: Log incoming errors structure
  
  // Enhanced validation to ensure we always show something if there's any error data
  if (!originalErrors || originalErrors.length === 0) {
    return null;
  }
  
  // Simplified error filtering - keep almost everything
  const validErrors = originalErrors.filter(error => {
    try {
      // Only filter out completely null/undefined errors
      return error != null;
    } catch (filterError) {
      // If filtering fails, include the error anyway
      return true;
    }
  });

  // Simplified error processing - create fallback if needed
  if (validErrors.length === 0) {
    validErrors.push({
      nodeId: 'no_errors',
      error: {
        type: 'No Error Data',
        message: 'No error information was provided',
        details: `Original error count: ${originalErrors.length}`,
        extra_info: {}
      }
    });
  }

  // Simplified error conversion
  const processedErrors = validErrors.map(error => {
    try {
      // If it's already in the right format, return as-is
      if (error && error.nodeId && error.error) {
        return error;
      }

      // If it's a plain object (server error), wrap it
      if (error && typeof error === 'object') {
        // Check if it already has the right structure
        if ((error as any).exception_message && (error as any).exception_type) {
          // It's a ComfyUI error object
          return {
            nodeId: (error as any).node_id || 'unknown',
            nodeType: (error as any).node_type || 'unknown',
            nodeTitle: (error as any).node_type || 'unknown',
            error: {
              type: (error as any).exception_type,
              message: (error as any).exception_message,
              details: (error as any).traceback?.join('\n') || 'No traceback available',
              extra_info: {
                exception_type: (error as any).exception_type,
                traceback: (error as any).traceback || []
              }
            }
          };
        } else {
          // Generic object - wrap it
          return {
            nodeId: 'unknown',
            error: {
              type: 'Server Error',
              message: 'Error from server',
              details: JSON.stringify(error, null, 2),
              extra_info: {}
            }
          };
        }
      }

      // Fallback for anything else
      return {
        nodeId: 'unknown',
        error: {
          type: 'Unknown Error',
          message: String(error),
          details: JSON.stringify(error, null, 2),
          extra_info: {}
        }
      };
    } catch (processingError) {
      // Ultimate fallback
      return {
        nodeId: 'processing_failed',
        error: {
          type: 'Error Processing Failed',
          message: 'Could not process error data',
          details: String(error),
          extra_info: {}
        }
      };
    }
  });
  
  console.log('🔍 ExecutionErrorDisplay processed:', {
    originalCount: originalErrors.length,
    validCount: validErrors.length,
    processedCount: processedErrors.length,
    processedErrors
  });
  
  
  const showTechnicalDetails = (nodeId: string) => {
    setShowingTechnicalDetails(nodeId);
  };
  
  const hideTechnicalDetails = () => {
    setShowingTechnicalDetails(null);
  };
  
  const copyToClipboard = async (text: string, label: string = 'Error message') => {
    try {
      if (!window.isSecureContext) {
        toast.error('Clipboard access requires HTTPS connection');
        return;
      }
      
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      toast.error('Failed to copy to clipboard');
    }
  };
  
  const handleFixNode = (nodeId: string) => {
    if (onFixNode) {
      onFixNode(nodeId);
      // Close the error display after fixing node
      if (onClearErrors) {
        onClearErrors();
      }
    }
  };
  
  // Simplified and safe error message formatting
  const formatErrorMessage = (nodeError: NodeError): string => {
    try {
      // Handle null/undefined
      if (!nodeError) {
        return 'No error data available';
      }

      // Case 1: Direct ComfyUI error structure (from server)
      if ((nodeError as any).exception_message && (nodeError as any).exception_type) {
        const comfyError = nodeError as any;
        return `${comfyError.exception_type}: ${comfyError.exception_message}`;
      }

      // Case 2: JavaScript Error object
      if (nodeError instanceof Error) {
        return `${nodeError.name || 'Error'}: ${nodeError.message || 'Unknown error'}`;
      }

      // Case 3: Standard wrapped structure { nodeId, error: { ... } }
      if (nodeError.error) {
        const error = nodeError.error;
        
        // Try to extract basic error info safely
        const errorType = error.type || 'Error';
        const errorMessage = error.message || 'Unknown error occurred';
        
        return `${errorType}: ${errorMessage}`;
      }

      // Case 4: Fallback - show as JSON string
      return JSON.stringify(nodeError, null, 2);
      
    } catch (error) {
      // Ultimate fallback - prevent any crashes
      console.error('Error formatting failed:', error);
      return `Error occurred but cannot be displayed safely. Raw type: ${typeof nodeError}`;
    }
  };
  
  // Group errors by severity
  const criticalErrors = processedErrors.filter(e => {
    const { severity } = categorizeError(e.error);
    return severity === 'critical';
  });
  
  const warningErrors = processedErrors.filter(e => {
    const { severity } = categorizeError(e.error);
    return severity === 'warning';
  });

  // Find the error being shown in technical details
  const technicalDetailsError = showingTechnicalDetails 
    ? processedErrors.find(e => e.nodeId === showingTechnicalDetails)
    : null;
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClearErrors) {
      onClearErrors();
    }
  };

  // Swiper instance ref
  const swiperRef = React.useRef<any>(null);

  
  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/60 backdrop-blur-sm pwa-modal"
      onClick={handleBackdropClick}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <AnimatePresence mode="wait">
        {showingTechnicalDetails && technicalDetailsError ? (
        // Technical Details View
        <motion.div
          key="technical-details"
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg max-h-[82vh] overflow-y-auto"
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}
        >
          <div className={cn(
            'bg-[#101217] border border-white/10 rounded-xl shadow-2xl overflow-hidden',
            className
          )}
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}>
            {/* Technical Details Header */}
            <div className="p-4 pb-2.5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={hideTechnicalDetails}
                    className="h-8 w-8 p-0 mr-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h2 className="text-[14px] font-bold text-[#e9ebef]">Raw Details</h2>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#8a919e]">
                      Node: {technicalDetailsError.nodeTitle || technicalDetailsError.nodeId}
                      {technicalDetailsError.nodeType && (
                        <span className="ml-2 text-xs">({technicalDetailsError.nodeType})</span>
                      )}
                    </p>
                  </div>
                </div>
                
                {/* Close Button - Top Right */}
                {onClearErrors && (
                  <Button size="sm" variant="ghost" onClick={onClearErrors} className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            
            {/* Technical Details Content - Raw Details Only */}
            <div 
              className="px-6 pb-6 space-y-3"
              style={{
                touchAction: 'pan-y pinch-zoom',
                overscrollBehaviorX: 'none'
              } as React.CSSProperties}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">Raw Details</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(
                      JSON.stringify(technicalDetailsError.error, null, 2),
                      'Raw details'
                    )}
                    className="h-6 w-6 p-0"
                    title="Copy raw details"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div 
                  className="p-2.5 bg-[#08090c] border border-white/[0.06] rounded-lg max-h-80 overflow-auto"
                  style={{
                    touchAction: 'pan-y pinch-zoom',
                    overscrollBehaviorX: 'none'
                  } as React.CSSProperties}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <pre className="text-xs whitespace-pre-wrap break-words text-white/90">
                    <code>{JSON.stringify(technicalDetailsError.error, null, 2)}</code>
                  </pre>
                </div>
              </div>
              
              {/* Back Button */}
              <div className="flex justify-center pt-3">
                <Button
                  onClick={hideTechnicalDetails}
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-gray-400/50 text-gray-400 hover:text-gray-300 hover:border-gray-300/60 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        // Main Error View  
        <motion.div
          key="error-list"
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg max-h-[82vh]"
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            const target = e.target as HTMLElement;
            
            // Allow swiper touch only in swiper area for multiple errors
            if (processedErrors.length > 1 && target.closest('.error-swiper')) {
              // Allow swiper to handle touch events
              return;
            }
            
            e.stopPropagation();
          }}
        >
          <div className={cn(
            'bg-[#101217] border border-white/10 rounded-xl shadow-2xl',
            processedErrors.length === 1 ? 'overflow-y-auto' : 'overflow-hidden',
            className
          )}
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none',
            maxHeight: '82vh'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            const target = e.target as HTMLElement;
            
            // Allow swiper touch only in swiper area for multiple errors
            if (processedErrors.length > 1 && target.closest('.error-swiper')) {
              // Allow swiper to handle touch events
              return;
            }
            
            e.stopPropagation();
          }}>
            {/* Modal Header */}
            <div 
              className="p-4 pb-2.5"
              style={{
                touchAction: 'pan-y pinch-zoom',
                overscrollBehaviorX: 'none'
              } as React.CSSProperties}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle className={cn('h-5 w-5 mt-0.5', criticalErrors.length > 0 ? 'text-[#f87c7c]' : 'text-[#ffa348]')} />
                  <div>
                    <h2 className="text-[14px] font-bold text-[#e9ebef]">Workflow Execution Failed</h2>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#8a919e]">
                      {workflowName && <span className="font-medium text-[#c8ccd4]">{workflowName}: </span>}
                      {processedErrors.length} {processedErrors.length === 1 ? 'error' : 'errors'} occurred during execution
                      {promptId && (
                        <span className="text-xs text-white/50 ml-2">
                          (ID: {promptId.substring(0, 8)}...)
                        </span>
                      )}
                      {processedErrors.length > 1 && (
                        <span className="text-xs text-white/60 ml-2">
                          ({processedErrors.length} errors - swipe to navigate)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                {/* Close Button - Top Right */}
                {onClearErrors && (
                  <Button size="sm" variant="ghost" onClick={onClearErrors} className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
      
      {/* Error Details - Swiper Carousel */}
      <div 
        className="px-6 pb-6"
        style={{
          touchAction: 'pan-y pinch-zoom',
          overscrollBehaviorX: 'none'
        } as React.CSSProperties}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          
          // Allow swiper touch only in swiper area for multiple errors
          if (processedErrors.length > 1 && target.closest('.error-swiper')) {
            // Allow swiper to handle touch events
            return;
          }
          
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          const target = e.target as HTMLElement;
          
          // Allow swiper touch only in swiper area for multiple errors
          if (processedErrors.length > 1 && target.closest('.error-swiper')) {
            // Allow swiper to handle touch events
            return;
          }
          
          e.stopPropagation();
        }}
      >
        {processedErrors.length === 1 ? (
          // Single error - no swiper needed
          <div className="space-y-2">
            {(() => {
              const nodeError = processedErrors[0];
              const { category, severity, suggestions } = categorizeError(nodeError.error);
              
              return (
                <>
                  {/* Node Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-white">Node: {nodeError.nodeTitle || nodeError.nodeId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {nodeError.nodeType && (
                          <Badge variant="outline" className="text-xs">
                            {nodeError.nodeType}
                          </Badge>
                        )}
                        <Badge 
                          variant={severity === 'critical' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {category.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                    
                    {onFixNode && nodeError.nodeId !== 'system' && nodeError.nodeTitle !== 'system' && (
                      <Button
                        size="sm"
                        onClick={() => handleFixNode(nodeError.nodeId)}
                        className="bg-[#f25555]/[0.1] hover:bg-[#f25555]/[0.18] border border-[#f25555]/30 text-[#f87c7c] transition-all duration-200"
                      >
                        <Wrench className="h-3 w-3 mr-1" />
                        Fix Node
                      </Button>
                    )}
                  </div>

                  {/* Error Message */}
                  <div className="p-2 bg-[#08090c] border border-white/[0.06] rounded-lg relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-[#f87c7c] mb-1">
                          {nodeError.error?.type || 'Error'}
                        </p>
                        <div 
                          className="font-mono text-[10.5px] text-[#9aa3b2] max-h-10 overflow-y-auto pr-8" 
                          style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                        >
                          {formatErrorMessage(nodeError)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(formatErrorMessage(nodeError), 'Error message')}
                        className="absolute top-2 right-2 h-6 w-6 p-0"
                        title="Copy error message"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    {/* Technical Details Button - Bottom Right */}
                    {nodeError.error?.details && String(nodeError.error.details).trim() && (
                      <div className="flex justify-end mt-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs h-6"
                          onClick={() => showTechnicalDetails(nodeError.nodeId)}
                        >
                          Show Raw Details
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="space-y-1 mt-3">
                      <p className="text-[10.5px] font-medium flex items-center gap-1 text-[#c8ccd4]">
                        <Info className="h-3 w-3 text-[#5b8af5]" />
                        Suggested Solutions:
                      </p>
                      <ul className="text-[10.5px] text-[#8a919e] space-y-0.5 ml-4">
                        {suggestions.map((suggestion, i) => (
                          <li key={i} className="list-disc list-outside">
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          // Multiple errors - use swiper
          <div className="w-full">
            <Swiper
              ref={swiperRef}
              modules={[Pagination]}
              spaceBetween={16}
              slidesPerView={1}
              allowTouchMove={true}
              touchStartPreventDefault={false}
              preventClicks={false}
              preventClicksPropagation={false}
              simulateTouch={true}
              touchRatio={1}
              touchAngle={45}
              grabCursor={true}
              resistance={true}
              resistanceRatio={0.85}
              threshold={5}
              pagination={{
                clickable: true,
                dynamicBullets: false,
                hideOnClick: false,
                renderBullet: function (_, className) {
                  return '<span class="' + className + '"></span>';
                }
              }}
              onSlideChange={(swiper) => setCurrentErrorIndex(swiper.activeIndex)}
              className="error-swiper"
              style={{
                width: '100%',
                height: 'auto'
              }}
            >
            {processedErrors.map((nodeError) => {
              const { category, severity } = categorizeError(nodeError.error);
              
              return (
                <SwiperSlide key={nodeError.nodeId}>
                  <div className="space-y-2 px-2 py-1">
                    {/* Node Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-white">Node: {nodeError.nodeTitle || nodeError.nodeId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {nodeError.nodeType && (
                            <Badge variant="outline" className="text-xs">
                              {nodeError.nodeType}
                            </Badge>
                          )}
                          <Badge 
                            variant={severity === 'critical' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {category.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      
                      {onFixNode && nodeError.nodeId !== 'system' && nodeError.nodeTitle !== 'system' && (
                        <Button
                          size="sm"
                          onClick={() => handleFixNode(nodeError.nodeId)}
                          className="bg-[#f25555]/[0.1] hover:bg-[#f25555]/[0.18] border border-[#f25555]/30 text-[#f87c7c] transition-all duration-200"
                        >
                          <Wrench className="h-3 w-3 mr-1" />
                          Fix Node
                        </Button>
                      )}
                    </div>

                    {/* Error Message */}
                    <div className="p-2 bg-[#08090c] border border-white/[0.06] rounded-lg relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11.5px] font-semibold text-[#f87c7c] mb-1">
                            {nodeError.error?.type || 'Error'}
                          </p>
                          <div 
                            className="font-mono text-[10.5px] text-[#9aa3b2] max-h-10 overflow-y-auto pr-8" 
                            style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                          >
                            {formatErrorMessage(nodeError)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(formatErrorMessage(nodeError), 'Error message')}
                          className="absolute top-2 right-2 h-6 w-6 p-0"
                          title="Copy error message"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {/* Technical Details Button - Bottom Right */}
                      {nodeError.error?.details && String(nodeError.error.details).trim() && (
                        <div className="flex justify-end mt-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-6"
                            onClick={() => showTechnicalDetails(nodeError.nodeId)}
                          >
                            Show Raw Details
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                </SwiperSlide>
              );
            })}
            </Swiper>
            
            {/* Suggestions for current error - outside swiper */}
            {(() => {
              const currentError = processedErrors[currentErrorIndex];
              if (!currentError) return null;
              const { suggestions } = categorizeError(currentError.error);
              
              return suggestions.length > 0 && (
                <div className="space-y-1 mt-3">
                  <p className="text-[10.5px] font-medium flex items-center gap-1 text-[#c8ccd4]">
                    <Info className="h-3 w-3 text-[#5b8af5]" />
                    Suggested Solutions:
                  </p>
                  <ul className="text-[10.5px] text-[#8a919e] space-y-0.5 ml-4">
                    {suggestions.map((suggestion, i) => (
                      <li key={i} className="list-disc list-outside">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Compact Footer */}
        <div 
          className="flex items-center justify-between mt-4"
          style={{
            touchAction: 'pan-y pinch-zoom',
            overscrollBehaviorX: 'none'
          } as React.CSSProperties}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}
        >
          {/* Error Summary Stats - Show total stats */}
          {processedErrors.length > 1 && (
            <div className="flex gap-3 text-xs text-white/60">
              {criticalErrors.length > 0 && (
                <span className="flex items-center gap-1">
                  <Badge variant="destructive" className="h-2 w-2 p-0 rounded-full" />
                  {criticalErrors.length} Critical
                </span>
              )}
              {warningErrors.length > 0 && (
                <span className="flex items-center gap-1">
                  <Badge variant="secondary" className="h-2 w-2 p-0 rounded-full" />
                  {warningErrors.length} Warning
                </span>
              )}
            </div>
          )}
          
          {/* Retry Button - Compact */}
          {onRetry && (
            <Button
              onClick={onRetry}
              size="sm"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-green-400/50 text-green-400 hover:text-green-300 hover:border-green-300/60 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          )}
        </div>
            </div>
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};