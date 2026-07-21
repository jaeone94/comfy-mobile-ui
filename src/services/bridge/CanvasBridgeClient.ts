import {
  BridgeGraphSummary,
  BridgeNode,
  BridgePromptData,
  BridgeQueueResult,
  isBridgeEventMessage,
  SHELL_SOURCE,
} from '@/shared/types/bridge';
import type { IComfyJson } from '@/shared/types/app/IComfyJson';

interface BridgeEventHandlers {
  ready: (summary: BridgeGraphSummary) => void;
  graphChanged: (summary: BridgeGraphSummary) => void;
  graphMutated: () => void;
  selectionChanged: (node: BridgeNode | null) => void;
  queueResult: (result: BridgeQueueResult) => void;
}

type EventName = keyof BridgeEventHandlers;

const REQUEST_TIMEOUT_MS = 10000;
// Serializing/deserializing a large workflow (e.g. embedded base64 images can
// run to tens of MB) plus the postMessage round-trip can far exceed the
// default; a too-short timeout aborts the request and the save silently fails.
const HEAVY_REQUEST_TIMEOUT_MS = 120000;

/**
 * Shell-side client for the canvas bridge. Owns the postMessage channel to
 * the official-frontend iframe: fire-and-forget commands, request/response
 * calls with correlation ids, and typed events.
 */
export class CanvasBridgeClient {
  private iframe: HTMLIFrameElement | null = null;
  private serverOrigin: string;
  private listeners: { [K in EventName]: Set<BridgeEventHandlers[K]> } = {
    ready: new Set(),
    graphChanged: new Set(),
    graphMutated: new Set(),
    selectionChanged: new Set(),
    queueResult: new Set(),
  };
  private pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private requestSeq = 0;
  private disposed = false;

  public isReady = false;
  public lastSummary: BridgeGraphSummary | null = null;

  constructor(serverUrl: string) {
    this.serverOrigin = new URL(serverUrl).origin;
    window.addEventListener('message', this.handleMessage);
  }

  attach(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('message', this.handleMessage);
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('Bridge disposed'));
    });
    this.pending.clear();
    this.iframe = null;
    if (activeBridge === this) activeBridge = null;
  }

  on<K extends EventName>(event: K, handler: BridgeEventHandlers[K]): () => void {
    this.listeners[event].add(handler);
    return () => this.listeners[event].delete(handler);
  }

  private emit<K extends EventName>(event: K, ...args: Parameters<BridgeEventHandlers[K]>) {
    this.listeners[event].forEach((handler) => {
      try {
        (handler as (...a: Parameters<BridgeEventHandlers[K]>) => void)(...args);
      } catch (e) {
        console.error(`[CanvasBridge] ${event} handler failed`, e);
      }
    });
  }

  private handleMessage = (event: MessageEvent) => {
    if (this.disposed) return;
    // Only accept messages from the embedded frontend's origin
    if (event.origin !== this.serverOrigin) return;
    const msg = event.data;
    if (!isBridgeEventMessage(msg)) return;

    switch (msg.type) {
      case 'bridge-ready':
        this.isReady = true;
        this.lastSummary = msg.payload;
        this.emit('ready', msg.payload);
        break;
      case 'graph-changed':
        this.lastSummary = msg.payload;
        this.emit('graphChanged', msg.payload);
        break;
      case 'graph-mutated':
        this.emit('graphMutated');
        break;
      case 'selection-changed':
        this.emit('selectionChanged', msg.payload);
        break;
      case 'queue-result':
        this.emit('queueResult', msg.payload);
        break;
      case 'response': {
        const entry = this.pending.get(msg.requestId);
        if (!entry) return;
        this.pending.delete(msg.requestId);
        clearTimeout(entry.timer);
        if (msg.payload.ok) entry.resolve(msg.payload.data);
        else entry.reject(new Error(msg.payload.error ?? 'Bridge request failed'));
        break;
      }
    }
  };

  private post(message: Record<string, unknown>) {
    const target = this.iframe?.contentWindow;
    if (!target) {
      console.warn('[CanvasBridge] no iframe attached, dropping message', message.type);
      return;
    }
    target.postMessage({ source: SHELL_SOURCE, ...message }, this.serverOrigin);
  }

  private request<T>(type: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.requestWithPayload<T>(type, undefined, timeoutMs);
  }

  private requestWithPayload<T>(
    type: string,
    payload: unknown,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<T> {
    const requestId = `req-${++this.requestSeq}-${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Bridge request timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (data: unknown) => void, reject, timer });
      this.post(payload === undefined ? { type, requestId } : { type, requestId, payload });
    });
  }

  // -- commands -------------------------------------------------------------

  requestState() {
    this.post({ type: 'get-state' });
  }

  loadWorkflow(workflow: IComfyJson) {
    this.post({ type: 'load-workflow', payload: { workflow } });
  }

  selectNode(nodeId: number | string) {
    this.post({ type: 'select-node', payload: { nodeId } });
  }

  setWidgetValue(nodeId: number | string, widgetName: string, value: unknown) {
    this.post({ type: 'set-widget-value', payload: { nodeId, widgetName, value } });
  }

  setNodeMode(nodeId: number | string, mode: number) {
    this.post({ type: 'set-node-mode', payload: { nodeId, mode } });
  }

  fitView() {
    this.post({ type: 'fit-view' });
  }

  /** Set an official frontend setting (persists per user, applies live). */
  setSetting(id: string, value: unknown) {
    this.post({ type: 'set-setting', payload: { id, value } });
  }

  /** Serialize the official graph (workflow-format JSON). */
  getWorkflow(): Promise<IComfyJson> {
    return this.request<IComfyJson>('get-workflow', HEAVY_REQUEST_TIMEOUT_MS);
  }

  /** Run the official graphToPrompt(): API-format prompt + workflow JSON. */
  getPrompt(): Promise<BridgePromptData> {
    return this.request<BridgePromptData>('get-prompt', HEAVY_REQUEST_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------------------
// Active-bridge registry: lets cross-cutting code (widget editor hook, mode
// handlers) mirror edits into the official graph without prop drilling.
// ---------------------------------------------------------------------------

let activeBridge: CanvasBridgeClient | null = null;

export function setActiveCanvasBridge(bridge: CanvasBridgeClient | null) {
  activeBridge = bridge;
}

export function getActiveCanvasBridge(): CanvasBridgeClient | null {
  return activeBridge;
}
