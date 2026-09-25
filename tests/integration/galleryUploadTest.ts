import assert from 'node:assert/strict';
import { uploadGalleryMedia, isGalleryUploadImage, isGalleryUploadVideo } from '../../src/shared/utils/galleryUpload';

const files = ['a.jpg', 'b.png', 'c.webp', 'phone.heic'].map(name => new File(['image'], name, { type: 'image/jpeg' }));
const attempted: string[] = [];
const progress: number[] = [];
let active = 0;
const result = await uploadGalleryMedia(files, async file => {
  active++;
  assert.equal(active, 1, 'Uploads must run sequentially');
  attempted.push(file.name);
  await Promise.resolve();
  active--;
  if (file.name === 'b.png') throw new Error('Network error');
  return { name: file.name, subfolder: 'photos', type: 'input' };
}, state => progress.push(state.completed), new AbortController().signal);
assert.deepEqual(attempted, ['a.jpg', 'b.png', 'c.webp']);
assert.deepEqual(progress, [1, 2, 3, 4]);
assert.equal(result.uploaded, 2);
assert.deepEqual(result.failed, ['b.png']);
assert.deepEqual(result.unsupported, ['phone.heic']);
assert.equal(isGalleryUploadImage(new File(['x'], 'PHOTO.JPG')), true);
assert.equal(isGalleryUploadImage(new File(['x'], 'video.mp4', { type: 'video/mp4' })), false);
const controller = new AbortController();
const cancelledAttempts: string[] = [];
await uploadGalleryMedia(files, async file => {
  cancelledAttempts.push(file.name);
  controller.abort();
  return null;
}, () => assert.fail('No state update after cancellation'), controller.signal);
assert.deepEqual(cancelledAttempts, ['a.jpg']);
const failed = await uploadGalleryMedia(files.slice(0, 1), async () => null, () => {}, new AbortController().signal);
assert.equal(failed.uploaded, 0);
assert.deepEqual(failed.failed, ['a.jpg']);
console.log('PASS: multi-image upload, sequential requests, partial failure, unsupported images, cancellation, null response');

const videos = [new File(['v'], 'phone.MOV', { type: 'video/quicktime' }), new File(['v'], 'clip.mp4', { type: 'video/mp4' }), new File(['i'], 'image.jpg', { type: 'image/jpeg' })];
const videoAttempts: string[] = [];
const videoResult = await uploadGalleryMedia(videos, async file => {
  videoAttempts.push(file.name);
  return { name: file.name, subfolder: '', type: 'input' };
}, () => {}, new AbortController().signal, 'videos');
assert.deepEqual(videoAttempts, ['phone.MOV', 'clip.mp4']);
assert.equal(videoResult.uploaded, 2);
assert.deepEqual(videoResult.unsupported, ['image.jpg']);
assert.equal(isGalleryUploadVideo(new File(['v'], 'clip.m4v')), true);
assert.equal(isGalleryUploadVideo(new File(['v'], 'clip.mkv', { type: 'application/octet-stream' })), true);
console.log('PASS: multiple videos, MOV/MP4/M4V/MKV, video picker rejects images');
