import assert from 'node:assert/strict';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const localStorageStub = new MemoryStorage();
const sessionStorageStub = new MemoryStorage();
Object.assign(globalThis, {
  localStorage: localStorageStub,
  sessionStorage: sessionStorageStub
});

import {
  applyComfyAuthToAxiosConfig,
  clearComfyAuthToken,
  COMFY_AUTH_TOKEN_KEY_PREFIX,
  configureComfyAuth,
  loadComfyAuthToken,
  normalizeComfyAuthToken,
  saveComfyAuthToken,
  withComfyAuth
} from '../../src/infrastructure/auth/ComfyAuthService';
import type { InternalAxiosRequestConfig } from 'axios';

const token = '$2b$12$qUfJfV942nrMiX77QRVgIuDk1.oyXBP7FYrXVEBqouTk.uP/hiqAK';
assert.equal(normalizeComfyAuthToken(`For direct API calls, use token=${token}`), token);

configureComfyAuth({
  serverUrl: 'https://comfy.example:8188',
  mode: 'comfyui-login',
  token
});

const apiUrl = new URL(withComfyAuth('https://comfy.example:8188/object_info?preview=true'));
assert.equal(apiUrl.searchParams.get('preview'), 'true');
assert.equal(apiUrl.searchParams.get('token'), token);

const websocketUrl = new URL(withComfyAuth('wss://comfy.example:8188/ws?clientId=mobile'));
assert.equal(websocketUrl.searchParams.get('clientId'), 'mobile');
assert.equal(websocketUrl.searchParams.get('token'), token);

assert.equal(
  withComfyAuth('https://launcher.example:9188/api/update/check'),
  'https://launcher.example:9188/api/update/check'
);
assert.equal(
  withComfyAuth('https://comfy.example:9189/object_info'),
  'https://comfy.example:9189/object_info'
);

configureComfyAuth({
  serverUrl: 'https://gateway.example/comfy',
  mode: 'comfyui-login',
  token
});
assert.equal(
  new URL(withComfyAuth('https://gateway.example/comfy/object_info')).searchParams.get('token'),
  token
);
assert.equal(
  withComfyAuth('https://gateway.example/launcher/status'),
  'https://gateway.example/launcher/status'
);
const axiosConfig = applyComfyAuthToAxiosConfig({
  url: '/system_stats',
  baseURL: 'https://gateway.example/comfy',
  headers: {}
} as InternalAxiosRequestConfig);
assert.equal(new URL(axiosConfig.url!).pathname, '/comfy/system_stats');
assert.equal(new URL(axiosConfig.url!).searchParams.get('token'), token);

configureComfyAuth({
  serverUrl: 'https://comfy.example:8188',
  mode: 'none',
  token
});
assert.equal(
  withComfyAuth('https://comfy.example:8188/object_info'),
  'https://comfy.example:8188/object_info'
);

// --- token storage ---
const storageUrl = 'https://comfy.example:8188';
const storageKey = `${COMFY_AUTH_TOKEN_KEY_PREFIX}https://comfy.example:8188`;

// Session-only: stays out of localStorage, so backups never see it.
saveComfyAuthToken(storageUrl, token, false);
assert.equal(sessionStorageStub.getItem(storageKey), token);
assert.equal(localStorageStub.getItem(storageKey), null);
assert.equal(loadComfyAuthToken(storageUrl), token);

// Opting in migrates the token to localStorage and clears the session copy.
saveComfyAuthToken(storageUrl, token, true);
assert.equal(localStorageStub.getItem(storageKey), token);
assert.equal(sessionStorageStub.getItem(storageKey), null);
assert.equal(loadComfyAuthToken(storageUrl), token);

// Opting back out must not leave the token behind on the device.
saveComfyAuthToken(storageUrl, token, false);
assert.equal(localStorageStub.getItem(storageKey), null);
assert.equal(sessionStorageStub.getItem(storageKey), token);

// ws:// URLs resolve to the same origin key as https://.
assert.equal(loadComfyAuthToken('wss://comfy.example:8188/ws'), token);

clearComfyAuthToken(storageUrl);
assert.equal(loadComfyAuthToken(storageUrl), '');

// An empty token clears rather than storing a blank entry.
saveComfyAuthToken(storageUrl, '   ', true);
assert.equal(localStorageStub.getItem(storageKey), null);

console.log('ComfyUI authentication URL and storage tests passed.');
