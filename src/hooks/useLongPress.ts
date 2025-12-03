import { useCallback, useRef, useState } from 'react';

interface LongPressOptions {
    threshold?: number;
    onStart?: () => void;
    onFinish?: () => void;
    onCancel?: () => void;
}

export const useLongPress = (
    onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
    onClick: () => void,
    options: LongPressOptions = {}
) => {
    const { threshold = 500, onStart, onFinish, onCancel } = options;
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressRef = useRef(false);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);

    const start = useCallback(
        (e: React.TouchEvent | React.MouseEvent) => {
            // Prevent default context menu on long press for touch devices
            // We don't call e.preventDefault() here because it might block scrolling
            // Instead we handle it in onContextMenu

            if (onStart) onStart();
            isLongPressRef.current = false;

            if ('touches' in e) {
                startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else {
                startPosRef.current = { x: e.clientX, y: e.clientY };
            }

            timerRef.current = setTimeout(() => {
                isLongPressRef.current = true;
                onLongPress(e);
                if (onFinish) onFinish();
            }, threshold);
        },
        [onLongPress, onStart, onFinish, threshold]
    );

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (onCancel) onCancel();
        startPosRef.current = null;
    }, [onCancel]);

    const handleOnClick = useCallback(
        (e: React.MouseEvent) => {
            if (isLongPressRef.current) {
                // If it was a long press, prevent the click
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            onClick();
        },
        [onClick]
    );

    const handleOnTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }

            // If it wasn't a long press, trigger click manually for touch devices
            // This is because we might need to preventDefault on touchstart to stop iOS context menu
            // but that would stop the click event.
            // However, we are NOT preventing default on touchstart to allow scrolling.
            // So the click event will fire naturally if we don't prevent it.

            if (isLongPressRef.current) {
                e.preventDefault(); // Prevent ghost click
            }
        },
        []
    );

    const handleOnMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!startPosRef.current) return;

        const moveThreshold = 10;
        let x, y;

        if ('touches' in e) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        } else {
            x = e.clientX;
            y = e.clientY;
        }

        const diffX = Math.abs(x - startPosRef.current.x);
        const diffY = Math.abs(y - startPosRef.current.y);

        if (diffX > moveThreshold || diffY > moveThreshold) {
            cancel();
        }
    }, [cancel]);

    return {
        onMouseDown: start,
        onMouseUp: cancel,
        onMouseLeave: cancel,
        onTouchStart: start,
        onTouchEnd: handleOnTouchEnd,
        onTouchMove: handleOnMove,
        onClick: handleOnClick,
        onContextMenu: (e: React.MouseEvent) => {
            // Always prevent context menu on the item to avoid conflicts
            e.preventDefault();
        },
        style: {
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
        } as React.CSSProperties,
    };
};
