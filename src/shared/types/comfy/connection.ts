export type ConnectionStepStatus = 'idle' | 'checking' | 'success' | 'failed';
export type ComfyAuthMode = 'none' | 'comfyui-login';

export interface ConnectionState {
  url: string;
  isConnected: boolean;
  isConnecting: boolean;
  lastPingTime: number | null;
  error: string | null;
  hasExtension: boolean;
  isCheckingExtension: boolean;
  apiStatus: ConnectionStepStatus;
  wsStatus: ConnectionStepStatus;
  extensionStatus: ConnectionStepStatus;
  authMode: ComfyAuthMode;
  authToken: string;
  /** Keep the token in localStorage (and in browser-data backups) instead of the tab session. Defaults on. */
  rememberAuthToken: boolean;
  errorCode: 'authentication_required' | null;
}

export interface ServerInfo {
  version?: string;
  nodeCount?: number;
  features?: string[];
}

export interface ConnectionConfig {
  maxRetries: number;
  retryDelays: number[];
  timeout: number;
}
