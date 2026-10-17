import { useEffect, useRef, type RefObject } from 'react';
import { galleryRangeSelection, galleryTouchIntent } from '@/shared/utils/galleryGrid';

interface Options {
  enabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  keys: string[];
  selected: Set<string>;
  onChange: (selection: Set<string>) => void;
  topInset: number;
}

/** Horizontal swipes select immediately; vertical swipes retain native scrolling. */
export function useGalleryDragSelection({ enabled, scrollRef, keys, selected, onChange, topInset }: Options) {
  const latest = useRef({ keys, selected, onChange, topInset });
  latest.current = { keys, selected, onChange, topInset };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;
    const selection = window.getSelection();
    if (selection?.anchorNode && scroller.contains(selection.anchorNode)) selection.removeAllRanges();
    let drag: { anchor: number; end: number; x: number; y: number; startX: number; startY: number;
      baseline: Set<string>; active: boolean; pointerId?: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let suppressClickUntil = 0;
    let previousFrame = 0;

    const indexAt = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-gallery-index]');
      return element && scroller.contains(element) ? Number(element.dataset.galleryIndex) : -1;
    };
    const apply = (index: number) => {
      if (!drag || index < 0 || index === drag.end) return;
      drag.end = index;
      latest.current.onChange(galleryRangeSelection(latest.current.keys, drag.baseline, drag.anchor, index));
    };
    const update = (timestamp: number) => {
      frame = 0;
      if (!drag?.active) return;
      const rect = scroller.getBoundingClientRect();
      const top = rect.top + latest.current.topInset + 12;
      const bottom = rect.bottom - 110;
      const edge = 56;
      const velocity = drag.y < top + edge ? -Math.min(1, (top + edge - drag.y) / edge)
        : drag.y > bottom - edge ? Math.min(1, (drag.y - bottom + edge) / edge) : 0;
      const elapsed = previousFrame ? Math.min(32, timestamp - previousFrame) : 16;
      previousFrame = timestamp;
      const before = scroller.scrollTop;
      scroller.scrollTop += velocity * elapsed * 0.65;
      apply(indexAt(drag.x, Math.max(top, Math.min(bottom, drag.y))));
      if (scroller.scrollTop !== before) frame = requestAnimationFrame(update);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const activate = () => {
      if (!drag) return;
      drag.active = true;
      apply(drag.anchor);
      schedule();
    };
    const finish = (commit = true) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = 0;
      if (drag?.active) {
        if (commit) apply(indexAt(drag.x, drag.y));
        suppressClickUntil = Date.now() + 600;
      }
      if (drag?.pointerId !== undefined && scroller.hasPointerCapture(drag.pointerId)) {
        scroller.releasePointerCapture(drag.pointerId);
      }
      drag = null;
    };
    const begin = (x: number, y: number, touch: boolean, pointerId?: number) => {
      finish(false);
      suppressClickUntil = 0;
      const anchor = indexAt(x, y);
      if (anchor < 0) return;
      drag = { anchor, end: -1, x, y, startX: x, startY: y,
        baseline: new Set(latest.current.selected), active: false, pointerId };
      if (touch) timer = setTimeout(activate, 250);
    };
    const move = (x: number, y: number, touch: boolean) => {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      if (!drag.active) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (touch) {
          const intent = galleryTouchIntent(dx, dy);
          if (intent === 'scroll') { finish(false); return; }
          if (intent === 'pending') return;
        } else if (Math.hypot(dx, dy) <= 8) return;
        clearTimeout(timer);
        activate();
        if (drag?.pointerId !== undefined) scroller.setPointerCapture(drag.pointerId);
      }
      if (drag?.active) schedule();
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { finish(false); return; }
      const touch = event.touches[0];
      begin(touch.clientX, touch.clientY, true);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { finish(false); return; }
      // Once a browser has started native scrolling, do not select behind it.
      if (!event.cancelable) { finish(false); return; }
      const touch = event.touches[0];
      move(touch.clientX, touch.clientY, true);
      // Prevent default on the very first horizontal move, not one event later.
      if (drag?.active) event.preventDefault();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.button === 0) begin(event.clientX, event.clientY, false, event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && drag?.pointerId === event.pointerId) move(event.clientX, event.clientY, false);
    };
    const pointerUp = (event: PointerEvent) => { if (event.pointerType !== 'touch') finish(event.type === 'pointerup'); };
    const touchEnd = () => finish();
    const cancel = () => finish(false);
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = 0;
      }
    };
    const blockNativeSelection = (event: Event) => {
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (target?.closest('[data-gallery-index]')) event.preventDefault();
    };
    // Non-passive touchmove lets a horizontal swipe (or held drag) select.
    // Pending/vertical gestures never prevent default, preserving native scroll.
    scroller.addEventListener('touchstart', touchStart, { passive: true });
    scroller.addEventListener('touchmove', touchMove, { passive: false });
    scroller.addEventListener('touchend', touchEnd);
    scroller.addEventListener('touchcancel', cancel);
    scroller.addEventListener('pointerdown', pointerDown);
    scroller.addEventListener('pointermove', pointerMove);
    globalThis.addEventListener('pointerup', pointerUp);
    globalThis.addEventListener('pointercancel', pointerUp);
    globalThis.addEventListener('blur', cancel);
    scroller.addEventListener('click', click, true);
    scroller.addEventListener('contextmenu', blockNativeSelection);
    scroller.addEventListener('selectstart', blockNativeSelection, true);
    scroller.addEventListener('dragstart', blockNativeSelection);
    return () => {
      finish(false);
      scroller.removeEventListener('touchstart', touchStart);
      scroller.removeEventListener('touchmove', touchMove);
      scroller.removeEventListener('touchend', touchEnd);
      scroller.removeEventListener('touchcancel', cancel);
      scroller.removeEventListener('pointerdown', pointerDown);
      scroller.removeEventListener('pointermove', pointerMove);
      globalThis.removeEventListener('pointerup', pointerUp);
      globalThis.removeEventListener('pointercancel', pointerUp);
      globalThis.removeEventListener('blur', cancel);
      scroller.removeEventListener('click', click, true);
      scroller.removeEventListener('contextmenu', blockNativeSelection);
      scroller.removeEventListener('selectstart', blockNativeSelection, true);
      scroller.removeEventListener('dragstart', blockNativeSelection);
    };
  }, [enabled, keys, scrollRef]);
}
