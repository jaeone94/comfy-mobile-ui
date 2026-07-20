/**
 * Canvas bridge protocol — shared vocabulary between the mobile shell and
 * the bridge extension (comfy-mobile-ui-api-extension/fe/mobileBridge.js)
 * running inside the official ComfyUI frontend iframe.
 *
 * Keep this file dependency-free: it is the single source of truth for
 * message shapes on the shell side. The bridge is plain JS and mirrors it.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** `source` field of messages sent by the bridge (iframe -> shell). */
export const BRIDGE_SOURCE = 'comfy-mobile-bridge';
/** `source` field of messages sent by the shell (shell -> iframe). */
export const SHELL_SOURCE = 'comfy-mobile-shell';

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface BridgeWidgetOptions {
  values?: unknown[];
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  multiline?: boolean;
}

export interface BridgeWidget {
  name: string;
  type: string;
  value: unknown;
  options: BridgeWidgetOptions;
}

export interface BridgeSlot {
  name: string;
  type: string;
}

/** Serialized snapshot of a litegraph node, produced by the bridge. */
export interface BridgeNode {
  id: number | string;
  type: string;
  title: string;
  mode: number;
  widgets: BridgeWidget[];
  inputs: BridgeSlot[];
  outputs: BridgeSlot[];
  imgs: string[];
}

export interface BridgeGraphSummary {
  nodeCount: number;
  workflowName: string | null;
  frontendVersion: string | null;
  protocolVersion?: number;
}

export interface BridgeQueueResult {
  ok: boolean;
  error?: string;
}

/** Result of the official app.graphToPrompt() inside the iframe. */
export interface BridgePromptData {
  /** Workflow-format JSON (same shape app.graph.serialize() produces). */
  workflow: unknown;
  /** API-format prompt, ready for POST /prompt. */
  output: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Messages: bridge -> shell (events)
// ---------------------------------------------------------------------------

export type BridgeEventMessage =
  | { source: typeof BRIDGE_SOURCE; type: 'bridge-ready'; payload: BridgeGraphSummary }
  | { source: typeof BRIDGE_SOURCE; type: 'graph-changed'; payload: BridgeGraphSummary }
  | { source: typeof BRIDGE_SOURCE; type: 'graph-mutated'; payload: Record<string, never> }
  | { source: typeof BRIDGE_SOURCE; type: 'selection-changed'; payload: BridgeNode | null }
  | { source: typeof BRIDGE_SOURCE; type: 'queue-result'; payload: BridgeQueueResult }
  | { source: typeof BRIDGE_SOURCE; type: 'node-changed'; payload: BridgeNode | null }
  | {
      source: typeof BRIDGE_SOURCE;
      type: 'response';
      requestId: string;
      payload: { ok: boolean; data?: unknown; error?: string };
    };

// ---------------------------------------------------------------------------
// Messages: shell -> bridge (commands)
// ---------------------------------------------------------------------------

export type ShellCommandMessage =
  | { source: typeof SHELL_SOURCE; type: 'get-state' }
  | { source: typeof SHELL_SOURCE; type: 'load-workflow'; payload: { workflow: unknown } }
  | { source: typeof SHELL_SOURCE; type: 'select-node'; payload: { nodeId: number | string } }
  | {
      source: typeof SHELL_SOURCE;
      type: 'set-widget-value';
      payload: { nodeId: number | string; widgetName: string; value: unknown };
    }
  | { source: typeof SHELL_SOURCE; type: 'set-node-mode'; payload: { nodeId: number | string; mode: number } }
  | { source: typeof SHELL_SOURCE; type: 'queue-prompt' }
  | { source: typeof SHELL_SOURCE; type: 'get-node'; requestId: string; payload: { nodeId: number | string } }
  | {
      source: typeof SHELL_SOURCE;
      type: 'trigger-widget';
      payload: { nodeId: number | string; widgetName: string };
    }
  | { source: typeof SHELL_SOURCE; type: 'watch-node'; payload: { nodeId: number | string } }
  | { source: typeof SHELL_SOURCE; type: 'unwatch-node' }
  | { source: typeof SHELL_SOURCE; type: 'fit-view' }
  | { source: typeof SHELL_SOURCE; type: 'get-workflow'; requestId: string }
  | { source: typeof SHELL_SOURCE; type: 'get-prompt'; requestId: string };

export function isBridgeEventMessage(data: unknown): data is BridgeEventMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === BRIDGE_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}
