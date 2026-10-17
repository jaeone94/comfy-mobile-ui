import assert from 'node:assert/strict';
import { galleryColumns, galleryRangeSelection, galleryWindow, galleryTouchIntent } from '../../src/shared/utils/galleryGrid';

assert.deepEqual([390, 639, 640, 767, 768, 1023, 1024].map(galleryColumns), [3, 3, 4, 4, 6, 6, 8]);
for (const count of [0, 1, 100, 2000, 10000]) {
  const top = galleryWindow(count, 390, 3, 0, 844);
  assert.ok(top.end - top.start <= 30, 'phone mounts only viewport rows plus overscan');
  const middle = galleryWindow(count, 390, 3, 10000, 844);
  assert.ok(middle.start >= 0 && middle.start <= middle.end && middle.end <= count);
  assert.ok(middle.end - middle.start <= 42);
}
const last = galleryWindow(2000, 390, 3, 86000, 844);
assert.equal(last.end, 2000, 'partial last row is included');
assert.equal(galleryWindow(0, 390, 3, 0, 844).height, 0);
assert.ok(galleryWindow(10, 390, 3, -2000, 844).end === 0, 'grid below viewport and overscan needs no mounted cards');

const keys = Array.from({ length: 10 }, (_, index) => `file-${index}`);
const initial = new Set(['file-0', 'file-9', 'folder:kept']);
const expanded = galleryRangeSelection(keys, initial, 2, 6);
assert.deepEqual([...expanded], ['file-0', 'file-9', 'folder:kept', 'file-2', 'file-3', 'file-4', 'file-5', 'file-6']);
assert.deepEqual([...galleryRangeSelection(keys, initial, 2, 3)], ['file-0', 'file-9', 'folder:kept', 'file-2', 'file-3'],
  'reversing a drag restores items outside its current range');
assert.deepEqual([...galleryRangeSelection(keys, initial, 2, 0)], ['file-0', 'file-9', 'folder:kept', 'file-1', 'file-2']);
assert.deepEqual([...galleryRangeSelection(keys, expanded, 6, 3)], ['file-0', 'file-9', 'folder:kept', 'file-2'],
  'starting on a selected item deselects a range');
assert.deepEqual([...initial], ['file-0', 'file-9', 'folder:kept'], 'selection snapshots stay immutable');
assert.deepEqual(galleryRangeSelection(keys, initial, -1, 4), initial);
assert.equal(galleryTouchIntent(6, 4), 'pending', 'small finger drift should not cancel a held gesture');
assert.equal(galleryTouchIntent(18, 3), 'select', 'horizontal swipe selects without waiting for a hold');
assert.equal(galleryTouchIntent(-18, -3), 'select');
assert.equal(galleryTouchIntent(3, 18), 'scroll');
assert.equal(galleryTouchIntent(11, 10), 'pending', 'ambiguous diagonal waits for a clear direction');
assert.equal(galleryTouchIntent(20, 20), 'scroll', 'large diagonal defaults to scrolling');
console.log('PASS: bounded phone grid for 10,000 items, breakpoints, final row, reversible selection/deselection');
