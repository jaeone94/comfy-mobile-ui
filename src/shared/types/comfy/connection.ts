export type ConnectionStepStatus = 'idle' | 'checking' | 'success' | 'failed';

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