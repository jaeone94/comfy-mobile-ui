import React, { useLayoutEffect, useRef, useState } from 'react';
import { galleryColumns, galleryWindow } from '@/shared/utils/galleryGrid';

interface VirtualGalleryGridProps<T> {
  items: T[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualGalleryGrid<T>({ items, scrollRef, getKey, renderItem }: VirtualGalleryGridProps<T>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState(() => ({
    ...galleryWindow(items.length, 390, 3, 0, 800), columns: 3,
  }));

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const scroller = scrollRef.current;
    if (!grid || !scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const gridRect = grid.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      const columns = galleryColumns(globalThis.innerWidth);
      const next = { ...galleryWindow(items.length, gridRect.width, columns,
        scrollRect.top - gridRect.top, scroller.clientHeight), columns };
      setWindow(previous => previous.start === next.start && previous.end === next.end &&
        previous.top === next.top && previous.height === next.height && previous.columns === next.columns
        ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(grid);
    observer.observe(scroller);
    const main = grid.closest('main');
    if (main) observer.observe(main);
    scroller.addEventListener('scroll', schedule, { passive: true });
    globalThis.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', schedule);
      globalThis.removeEventListener('resize', schedule);
    };
  }, [items.length, scrollRef]);

  return (
    <div ref={gridRef} data-gallery-grid style={{ position: 'relative', height: window.height }}>
      <div style={{ position: 'absolute', top: window.top, width: '100%', display: 'grid',
        gridTemplateColumns: `repeat(${window.columns}, minmax(0, 1fr))`, gap: 2 }}>
        {items.slice(window.start, window.end).map((item, offset) => (
          <div key={getKey(item)} data-gallery-index={window.start + offset} className="min-w-0">
            {renderItem(item, window.start + offset)}
          </div>
        ))}
      </div>
    </div>
  );
}
