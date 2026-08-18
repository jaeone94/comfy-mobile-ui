import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ComfyAuthMode } from '@/shared/types/comfy/connection';

interface ComfyAuthConfig {
  serverUrl: string;
  mode: ComfyAuthMode;
  token: string;
}

/**
 * Auth tokens are stored per ComfyUI origin. When the user asks to stay signed
 * in on the device the token moves to localStorage, which also makes it part of
 * the browser-data backup; otherwise it lives in sessionStorage and disappears
 * when the tab closes.
 */
export const COMFY_AUTH_TOKEN_KEY_PREFIX = 'comfy-mobile-auth-token:';

let currentConfig: ComfyAuthConfig = {
  serverUrl: '',
  mode: 'none',
  token: ''
};

let axiosInterceptorInstalled = false;

const toHttpProtocol = (protocol: string): string => {
  if (protocol === 'ws:') return 'http:';
  if (protocol === 'wss:') return 'https:';
  return protocol;
};

const getComparableOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    url.protocol = toHttpProtocol(url.protocol);
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * Storage key holding the token for one ComfyUI origin. Exported so callers that
 * need a specific server's token (such as the backup collector) can address it
 * without re-deriving the origin normalization.
 */
export const getComfyAuthTokenStorageKey = (serverUrl: string): string | null => {
  const origin = getComparableOrigin(serverUrl);
  return origin ? `${COMFY_AUTH_TOKEN_KEY_PREFIX}${origin}` : null;
};

const getStorageKey = getComfyAuthTokenStorageKey;

const getStore = (persistent: boolean): Storage | null => {
  try {
    const store = persistent ? localStorage : sessionStorage;
    return typeof store === 'undefined' ? null : store;
  } catch {
    // Storage access can throw when cookies/site data are blocked.
    return null;
  }
};

export const normalizeComfyAuthToken = (value: string): string => {
  const trimmed = value.trim();
  const markerIndex = trimmed.lastIndexOf('token=');
  return markerIndex >= 0
    ? trimmed.slice(markerIndex + 'token='.length).trim().split(/\s+/)[0] || ''
    : trimmed;
};

export const configureComfyAuth = (config: ComfyAuthConfig): void => {
  currentConfig = {
    serverUrl: config.serverUrl.trim().replace(/\/$/, ''),
    mode: config.mode,
    token: normalizeComfyAuthToken(config.token)
  };
};

/**
 * Writes the token to the store matching `remember` and removes it from the
 * other one, so a token never lingers in localStorage after the user opts out.
 */
export const saveComfyAuthToken = (
  serverUrl: string,
  token: string,
  remember: boolean
): void => {
  const key = getStorageKey(serverUrl);
  if (!key) return;

  const normalizedToken = normalizeComfyAuthToken(token);
  getStore(!remember)?.removeItem(key);

  const target = getStore(remember);
  if (!target) return;
  if (normalizedToken) {
    target.setItem(key, normalizedToken);
  } else {
    target.removeItem(key);
  }
};

export const loadComfyAuthToken = (serverUrl: string): string => {
  const key = getStorageKey(serverUrl);
  if (!key) return '';
  return getStore(true)?.getItem(key) || getStore(false)?.getItem(key) || '';
};

export const clearComfyAuthToken = (serverUrl: string): void => {
  const key = getStorageKey(serverUrl);
  if (!key) return;
  getStore(true)?.removeItem(key);
  getStore(false)?.removeItem(key);
};

const shouldAuthenticateUrl = (url: URL): boolean => {
  if (
    currentConfig.mode !== 'comfyui-login' ||
    !currentConfig.token ||
    !currentConfig.serverUrl
  ) {
    return false;
  }

  const targetOrigin = getComparableOrigin(url.toString());
  const serverOrigin = getComparableOrigin(currentConfig.serverUrl);
  if (!targetOrigin || !serverOrigin || targetOrigin !== serverOrigin) return false;

  try {
    const server = new URL(currentConfig.serverUrl);
    const basePath = server.pathname.replace(/\/$/, '') || '/';
    return basePath === '/' || url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
};

/**
 * Adds the ComfyUI-Login API token to requests for the configured ComfyUI
 * origin only. Query authentication is required for browser WebSockets and
 * direct media URLs, which cannot attach a custom Authorization header.
 */
export const withComfyAuth = (value: string, baseUrl?: string): string => {
  if (!value || currentConfig.mode !== 'comfyui-login' || !currentConfig.token) {
    return value;
  }

  try {
    const url = new URL(value, baseUrl || currentConfig.serverUrl || undefined);
    if (!shouldAuthenticateUrl(url)) return value;
    url.searchParams.set('token', currentConfig.token);
    return url.toString();
  } catch {
    return value;
  }
};

export const comfyAuthenticatedFetch = (
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  if (input instanceof Request) {
    const authenticatedUrl = withComfyAuth(input.url);
    return fetch(new Request(authenticatedUrl, input), init);
  }

  return fetch(withComfyAuth(input.toString()), init);
};

export const applyComfyAuthToAxiosConfig = (
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig => {
  if (!config.url) return config;

  const requestUrl = config.baseURL && !/^https?:\/\//i.test(config.url)
    ? `${config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`
    : config.url;
  const authenticatedUrl = withComfyAuth(requestUrl);
  if (authenticatedUrl !== requestUrl) {
    config.url = authenticatedUrl;
    config.baseURL = undefined;
  }
  return config;
};

export const installComfyAuthAxiosInterceptor = (): void => {
  if (axiosInterceptorInstalled) return;
  axios.interceptors.request.use(applyComfyAuthToAxiosConfig);
  axiosInterceptorInstalled = true;
};
