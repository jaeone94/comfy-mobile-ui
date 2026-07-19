// Comfy Mobile UI — canvas bridge (lab experiment)
// This file is served by ComfyUI via WEB_DIRECTORY and loaded by the official
// frontend as a regular custom-node extension. It only activates when the
// frontend is embedded by the mobile shell (inside an iframe), or when
// ?mobileBridge=1 is passed for direct debugging.
import { app } from "../../scripts/app.js";

const BRIDGE_SOURCE = "comfy-mobile-bridge";
const SHELL_SOURCE = "comfy-mobile-shell";
const PROTOCOL_VERSION = 1;

function isEmbedded() {
  try {
    if (new URLSearchParams(window.location.search).has("mobileBridge")) return true;
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws -> we are definitely embedded
    return true;
  }
}

// Lab note: targetOrigin is '*' because the shell runs on a different origin
// during development (vite :5173 vs server :8188). Lock this down to the
// shell origin before shipping anything real.
function post(type, payload) {
  try {
    window.parent.postMessage({ source: BRIDGE_SOURCE, type, payload }, "*");
  } catch (e) {
    console.warn("[MobileBridge] postMessage failed", e);
  }
}

function safeClone(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function comboValues(widget, node) {
  let values = widget.options?.values;
  if (typeof values === "function") {
    try {
      values = values(widget, node);
    } catch {
      values = undefined;
    }
  }
  if (!Array.isArray(values)) return undefined;
  return values.slice(0, 500).map((v) => (typeof v === "string" ? v : safeClone(v)));
}

function serializeWidget(widget, node) {
  const options = widget.options ?? {};
  return {
    name: widget.name,
    type: String(widget.type ?? ""),
    value: safeClone(widget.value),
    options: {
      values: comboValues(widget, node),
      min: typeof options.min === "number" ? options.min : undefined,
      max: typeof options.max === "number" ? options.max : undefined,
      step: typeof options.step === "number" ? options.step : undefined,
      precision: typeof options.precision === "number" ? options.precision : undefined,
      multiline: !!options.multiline,
    },
  };
}

function serializeNode(node) {
  if (!node) return null;
  let title = node.type;
  try {
    title = node.getTitle?.() ?? node.title ?? node.type;
  } catch {}
  return {
    id: node.id,
    type: node.type,
    title,
    mode: node.mode ?? 0,
    widgets: (node.widgets ?? [])
      .filter((w) => !w.hidden && w.type !== "converted-widget")
      .map((w) => serializeWidget(w, node)),
    inputs: (node.inputs ?? []).map((i) => ({ name: i.name, type: String(i.type ?? "") })),
    outputs: (node.outputs ?? []).map((o) => ({ name: o.name, type: String(o.type ?? "") })),
    imgs: (node.imgs ?? [])
      .slice(0, 4)
      .map((img) => img?.src)
      .filter(Boolean),
  };
}

function selectedNode() {
  const nodes = Object.values(app.canvas?.selected_nodes ?? {});
  return nodes.length ? nodes[nodes.length - 1] : null;
}

function graphSummary() {
  let workflowName = null;
  try {
    workflowName =
      app.extensionManager?.workflow?.activeWorkflow?.filename ??
      app.extensionManager?.workflow?.activeWorkflow?.path ??
      null;
  } catch {}
  return {
    nodeCount: app.graph?._nodes?.length ?? 0,
    workflowName,
    frontendVersion: window.__COMFYUI_FRONTEND_VERSION__ ?? null,
    protocolVersion: PROTOCOL_VERSION,
  };
}

function respond(requestId, ok, data, error) {
  try {
    window.parent.postMessage(
      { source: BRIDGE_SOURCE, type: "response", requestId, payload: { ok, data, error } },
      "*"
    );
  } catch (e) {
    console.warn("[MobileBridge] respond failed", e);
  }
}

// The shell's workflow must win over the frontend's own session restore,
// which can finish after bridge-ready and replace the graph.
let lastShellWorkflow = null;
let applyingShellWorkflow = false;

async function loadWorkflow({ workflow }) {
  if (!workflow) return;
  lastShellWorkflow = workflow;
  applyingShellWorkflow = true;
  try {
    await app.loadGraphData(workflow);
    // The stored view state may not include the nodes — always fit after load
    fitView();
  } catch (e) {
    console.warn("[MobileBridge] load-workflow failed", e);
  } finally {
    applyingShellWorkflow = false;
  }
}

async function handleGetWorkflow(requestId) {
  try {
    const data = app.graph.serialize();
    respond(requestId, true, safeClone(data));
  } catch (e) {
    respond(requestId, false, undefined, String(e?.message ?? e));
  }
}

async function handleGetPrompt(requestId) {
  try {
    const p = await app.graphToPrompt();
    respond(requestId, true, { workflow: safeClone(p.workflow), output: safeClone(p.output) });
  } catch (e) {
    respond(requestId, false, undefined, String(e?.message ?? e));
  }
}

// Structural graph changes made directly on the official canvas (dragging
// links, moving nodes, ...) — debounced so bursts collapse into one event.
let mutatedTimer = null;
function scheduleGraphMutated() {
  if (mutatedTimer) clearTimeout(mutatedTimer);
  mutatedTimer = setTimeout(() => {
    mutatedTimer = null;
    post("graph-mutated", {});
  }, 400);
}

let lastSentSelectionId = null;
let readySent = false;

function announceReady() {
  if (readySent) return;
  readySent = true;
  post("bridge-ready", graphSummary());
}

function reportSelection() {
  const node = selectedNode();
  lastSentSelectionId = node ? node.id : null;
  post("selection-changed", serializeNode(node));
}

function applyWidgetValue({ nodeId, widgetName, value }) {
  const node = app.graph?.getNodeById?.(nodeId);
  const widget = node?.widgets?.find((w) => w.name === widgetName);
  if (!node || !widget) {
    console.warn("[MobileBridge] widget not found", nodeId, widgetName);
    return;
  }
  widget.value = value;
  try {
    widget.callback?.(widget.value, app.canvas, node);
  } catch (e) {
    console.warn("[MobileBridge] widget callback failed", e);
  }
  node.setDirtyCanvas?.(true, true);
}

function selectNodeById({ nodeId }) {
  const node = app.graph?.getNodeById?.(nodeId);
  if (!node) return;
  try {
    app.canvas.deselectAll?.();
    app.canvas.selectNode?.(node);
    app.canvas.setDirty?.(true, true);
  } catch (e) {
    console.warn("[MobileBridge] select-node failed", e);
  }
  queueMicrotask(reportSelection);
}

function applyNodeMode({ nodeId, mode }) {
  const node = app.graph?.getNodeById?.(nodeId);
  if (!node) return;
  node.mode = mode; // 0 = normal, 2 = mute, 4 = bypass
  node.setDirtyCanvas?.(true, true);
  app.graph?.change?.();
}

async function queuePrompt() {
  try {
    await app.queuePrompt(0, 1);
    post("queue-result", { ok: true });
  } catch (e) {
    post("queue-result", { ok: false, error: String(e?.message ?? e) });
  }
}

function fitView() {
  try {
    app.extensionManager?.command?.execute?.("Canvas.FitView");
  } catch (e) {
    console.warn("[MobileBridge] fit view failed", e);
  }
}

// Hide the desktop chrome so only the litegraph canvas remains visible.
// Selectors verified against frontend 1.48 (new UI); legacy selectors kept
// for older frontends. Additive and harmless when a selector matches nothing.
const EMBED_CSS = `
/* legacy layout (frontend < 1.46-ish) */
.comfyui-body-top,
.comfyui-body-bottom,
.comfyui-body-left,
.comfyui-body-right,
/* workflow tab bar (top) */
.workflow-tabs-container,
/* left icon rail incl. logo */
.side-tool-bar-container,
/* top-center action bar (Run, extensions, ...) */
.actionbar-container,
/* top-left graph breadcrumb */
.subgraph-breadcrumb,
/* minimap (bottom right) */
.minimap-main-container,
/* side panels docked into the canvas splitter (e.g. Workflow Overview) */
.p-splitterpanel.bg-comfy-menu-bg,
/* toasts: version warnings etc. clutter the embed */
.p-toast,
/* frontend modal dialogs (missing models, ...) — the shell owns these flows */
.p-dialog-mask,
.p-drawer-mask,
.p-splitter-gutter {
  display: none !important;
}
/* bottom zoom / minimap toggle button group */
.graph-canvas-panel .p-buttongroup {
  display: none !important;
}
/* floating top-row cards added by other extensions (e.g. devtools) */
.pointer-events-auto.h-12.shadow-interface {
  display: none !important;
}
`;

function injectCss() {
  const style = document.createElement("style");
  style.id = "comfy-mobile-bridge-style";
  style.textContent = EMBED_CSS;
  document.head.appendChild(style);
  document.documentElement.classList.add("comfy-mobile-embed");
}

function handleShellMessage(event) {
  const msg = event.data;
  if (!msg || msg.source !== SHELL_SOURCE) return;
  switch (msg.type) {
    case "get-state":
      post("graph-changed", graphSummary());
      reportSelection();
      break;
    case "load-workflow":
      loadWorkflow(msg.payload ?? {});
      break;
    case "get-workflow":
      handleGetWorkflow(msg.requestId);
      break;
    case "get-prompt":
      handleGetPrompt(msg.requestId);
      break;
    case "set-widget-value":
      applyWidgetValue(msg.payload ?? {});
      break;
    case "set-node-mode":
      applyNodeMode(msg.payload ?? {});
      break;
    case "select-node":
      selectNodeById(msg.payload ?? {});
      break;
    case "queue-prompt":
      queuePrompt();
      break;
    case "fit-view":
      fitView();
      break;
    default:
      break;
  }
}

if (isEmbedded()) {
  app.registerExtension({
    name: "ComfyMobile.CanvasBridge",
    setup() {
      injectCss();
      window.addEventListener("message", handleShellMessage);

      // Primary signal: litegraph selection callback (chain any existing one)
      const canvas = app.canvas;
      if (canvas) {
        const original = canvas.onSelectionChange;
        canvas.onSelectionChange = function (...args) {
          original?.apply(this, args);
          queueMicrotask(reportSelection);
        };
      }

      // Structural change signal for the shell's stale-state handling
      const graph = app.graph;
      if (graph) {
        const originalAfterChange = graph.onAfterChange;
        graph.onAfterChange = function (...args) {
          originalAfterChange?.apply(this, args);
          scheduleGraphMutated();
        };
        const originalConnectionChange = graph.onConnectionChange;
        graph.onConnectionChange = function (...args) {
          originalConnectionChange?.apply(this, args);
          scheduleGraphMutated();
        };
      }

      // Fallback: light polling in case the callback is missed by a
      // frontend version. Only fires when the selected node id changes.
      setInterval(() => {
        const node = selectedNode();
        const id = node ? node.id : null;
        if (id !== lastSentSelectionId) reportSelection();
      }, 600);

      // Announce readiness only after the frontend finished restoring its own
      // session (first afterConfigureGraph), or after a grace period when
      // there is nothing to restore. This keeps the shell's load-workflow
      // from being overwritten by the frontend's async session restore.
      setTimeout(announceReady, 1500);
      console.log("[MobileBridge] active (embedded mode)");
    },
    afterConfigureGraph() {
      announceReady();
      post("graph-changed", graphSummary());
      if (lastShellWorkflow && !applyingShellWorkflow) {
        // The frontend's own restore replaced the shell's workflow — reassert.
        const workflow = lastShellWorkflow;
        setTimeout(() => loadWorkflow({ workflow }), 0);
      }
    },
  });
} else {
  // Desktop / direct visits: do nothing.
}
