import assert from 'node:assert/strict';
import { getMediaDownloadUrl } from '../../src/shared/utils/mediaDownload';
import { configureComfyAuth } from '../../src/infrastructure/auth/ComfyAuthService';

const original = 'http://server:8188/proxy/view?filename=%ED%95%9C%EA%B8%80.mp4&subfolder=a%2Fb&type=temp&preview=webp&channel=rgb&t=123&token=existing';
const url = new URL(getMediaDownloadUrl(original));
assert.equal(url.pathname, '/proxy/comfymobile/api/files/download');
assert.equal(url.searchParams.get('filename'), '한글.mp4');
assert.equal(url.searchParams.get('subfolder'), 'a/b');
assert.equal(url.searchParams.get('type'), 'temp');
assert.equal(url.searchParams.get('token'), 'existing');
assert.equal(url.searchParams.has('preview'), false);
assert.equal(url.searchParams.has('channel'), false);
assert.equal(url.searchParams.has('t'), false);
assert.equal(new URL(getMediaDownloadUrl('/comfymobile/api/files/view?filename=a.png', 'https://host/app')).pathname,
  '/comfymobile/api/files/download');
assert.equal(getMediaDownloadUrl('blob:https://host/123'), 'blob:https://host/123');
assert.throws(() => getMediaDownloadUrl('javascript:alert(1)'));
assert.throws(() => getMediaDownloadUrl('https://host/view'));
assert.throws(() => getMediaDownloadUrl('https://host/unrelated?filename=x'));
configureComfyAuth({ serverUrl: 'https://host/proxy', mode: 'comfyui-login', token: 'test-token' });
assert.equal(new URL(getMediaDownloadUrl('https://host/proxy/view?filename=x.png')).searchParams.get('token'), 'test-token');
assert.equal(new URL(getMediaDownloadUrl('https://elsewhere/view?filename=x.png')).searchParams.has('token'), false);
configureComfyAuth({ serverUrl: '', mode: 'none', token: '' });
console.log('PASS: download endpoint, original filename/location, proxy prefix, auth, thumbnail stripping and Blob fallback');
