import type { IComfyFileInfo } from '@/shared/types/comfy/IComfyFile';

export const galleryFileKey = (file: IComfyFileInfo) => `${file.filename}-${file.subfolder}-${file.type}`;

/** Resolve the gesture before native vertical scrolling can take ownership. */
export function galleryTouchIntent(dx: number, dy: number): 'pending' | 'select' | 'scroll' {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x < 10 && y < 10) return 'pending';
  if (x > y * 1.3) return 'select';
  if (y > x * 1.3 || Math.hypot(x, y) > 24) return 'scroll';
  return 'pending';
}

export function galleryColumns(viewportWidth: number): number {
  return viewportWidth >= 1024 ? 8 : viewportWidth >= 768 ? 6 : viewportWidth >= 640 ? 4 : 3;
}

/** Only rows near the scroll viewport become React elements. */
export function galleryWindow(count: number, width: number, columns: number,
  offset: number, viewportHeight: number, overscan = 3) {
  const gap = 2;
  const rowHeight = Math.max(1, (width - gap * (columns - 1)) / columns) + gap;
  const rows = Math.ceil(count / columns);
  const startRow = Math.min(rows, Math.max(0, Math.floor(offset / rowHeight) - overscan));
  const endRow = Math.min(rows, Math.max(startRow, Math.ceil((offset + viewportHeight) / rowHeight) + overscan));
  return {
    start: Math.min(count, startRow * columns),
    end: Math.min(count, endRow * columns),
    top: startRow * rowHeight,
    height: Math.max(0, rows * rowHeight - gap),
    rowHeight,
  };
}

/** A drag always starts from a snapshot, so reversing restores prior selections. */
export function galleryRangeSelection(keys: string[], baseline: ReadonlySet<string>, anchor: number, end: number) {
  const next = new Set(baseline);
  if (anchor < 0 || end < 0 || anchor >= keys.length || end >= keys.length) return next;
  const select = !baseline.has(keys[anchor]);
  for (let index = Math.min(anchor, end); index <= Math.max(anchor, end); index++) {
    if (select) next.add(keys[index]);
    else next.delete(keys[index]);
  }
  return next;
}
