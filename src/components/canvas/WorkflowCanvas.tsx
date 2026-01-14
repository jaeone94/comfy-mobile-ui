import React from 'react';

interface LongPressState {
  isActive: boolean;
  showProgress: boolean;
  startTime: number;
  startX: number;
  startY: number;
  targetNode?: any | null;
  timeoutId?: NodeJS.Timeout | null;
  progressTimeoutId?: NodeJS.Timeout | null;
}

interface WorkflowCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isDragging: boolean;
  longPressState?: LongPressState | null;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  containerRef,
  canvasRef,
  isDragging,
  longPressState,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onContextMenu,
}) => {
  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-0 right-0 bottom-0 overflow-hidden"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', // Prevent browser touch gestures
        overscrollBehavior: 'none', // Prevent overscroll
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          touchAction: 'none', // Prevent browser touch gestures on canvas
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onContextMenu={onContextMenu}
      />

      {/* Long Press Progress Overlay */}
      {longPressState?.showProgress && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: longPressState.startX - 55,
            top: longPressState.startY - 55,
            width: 110,
            height: 110,
          }}
        >
          {/* Simple progress ring with CSS animation */}
          <div className="absolute inset-0">
            <svg
              width="110"
              height="110"
              className="transform -rotate-90"
              viewBox="0 0 110 110"
            >
              {/* Background ring */}
              <circle
                cx="55"
                cy="55"
                r="45"
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="5"
                fill="none"
              />
              {/* Progress ring with smooth CSS animation */}
              <circle
                cx="55"
                cy="55"
                r="45"
                stroke="#3b82f6"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45}`}
                style={{
                  animation: 'longPressProgress 0.35s linear forwards',
                  filter: 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.6))',
                }}
              />
            </svg>
          </div>

          {/* Center dot */}
          <div
            className="absolute rounded-full bg-blue-500"
            style={{
              left: 55 - 8,
              top: 55 - 8,
              width: 16,
              height: 16,
              boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes longPressProgress {
          from {
            stroke-dashoffset: ${2 * Math.PI * 45};
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
};