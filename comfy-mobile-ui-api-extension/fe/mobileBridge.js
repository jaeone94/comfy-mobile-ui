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

// Outbound messages target the embedding shell's origin. Seeded from the
// referrer (the parent page), then pinned to the first valid shell message's
// origin; other origins are ignored from then on.
let shellOrigin = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
})();

function post(type, payload) {
  try {
    window.parent.postMessage({ source: BRIDGE_SOURCE, type, payload }, shellOrigin);
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

// Graph fingerprint state (structural-change detection). Reset after
// shell-driven loads so a fresh load never reads as a user edit.
let fpLast = null;
let fpDirty = false;

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
    fpLast = null;
    fpDirty = false;
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

// Official-mode queueing runs from the shell, so the frontend's own
// control_after_generate handling never fires — apply it here right before
// serializing. New seeds also mark the canvas dirty (fingerprint poll), so
// the user can persist them with Save.
function applyControlAfterGenerate() {
  try {
    for (const n of app.graph?._nodes ?? []) {
      const widgets = n.widgets ?? [];
      for (let i = 0; i < widgets.length; i++) {
        const w = widgets[i];
        if (w.name !== "control_after_generate" || w.value === "fixed") continue;
        const target = widgets[i - 1];
        if (!target || typeof target.value !== "number") continue;
        const max = Math.min(
          typeof target.options?.max === "number" ? target.options.max : Number.MAX_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER
        );
        const min = typeof target.options?.min === "number" ? target.options.min : 0;
        if (w.value === "randomize") target.value = Math.floor(Math.random() * (max - min)) + min;
        else if (w.value === "increment") target.value = Math.min(target.value + 1, max);
        else if (w.value === "decrement") target.value = Math.max(target.value - 1, min);
        try {
          target.callback?.(target.value, app.canvas, n);
        } catch {}
      }
    }
    app.graph?.setDirtyCanvas?.(true, true);
  } catch (e) {
    console.warn("[MobileBridge] control_after_generate failed", e);
  }
}

async function handleGetPrompt(requestId) {
  try {
    applyControlAfterGenerate();
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
  // Shell-driven loads reconfigure the whole graph; the shell already knows.
  if (applyingShellWorkflow) return;
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
/* ---- Nodes 2.0 (Vue DOM nodes) simplification ---- */
/* Off-screen culling: browser skips layout/paint for nodes outside the
   viewport (the fork mounts every node with no culling). */
.lg-node[data-node-id] {
  content-visibility: auto;
  contain-intrinsic-size: var(--node-width, 220px) var(--node-height, 120px);
  box-shadow: none !important;
  filter: none !important;
}
.lg-node[data-node-id] *,
.lg-node[data-node-id] {
  transition: none !important;
  animation: none !important;
}
/* Zoom LOD (driven by data-cmu-zoom on <html>): when zoomed far out, stop
   painting widget internals — headers/slots keep the graph readable. */
html[data-cmu-zoom="far"] [data-testid="node-widgets"] {
  visibility: hidden !important;
}
html[data-cmu-zoom="far"] .lg-node[data-node-id] {
  font-size: 0 !important;
}
html[data-cmu-zoom="far"] .lg-node-header {
  font-size: 12px !important;
}
/* floating top-row cards added by other extensions (e.g. devtools) */
.pointer-events-auto.h-12.shadow-interface {
  display: none !important;
}
/* top-right overlay column: alert banners ("View details"), toggles */
.mx-1.flex.flex-col.items-end.gap-1 {
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
  if (shellOrigin === "*") shellOrigin = event.origin;
  else if (event.origin !== shellOrigin) return;
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

// Mobile performance mode: cheaper litegraph rendering + capped canvas
// resolution. The node canvas is raster (CSS cannot simplify it), but these
// flags cut fill-rate and memory — the usual cause of iOS tab reloads.
const DPR_CAP = 1.5;
const FPS_IDLE = 30;

// Dynamic link mode: straight normally, hidden while pinching/panning.
// Pinned via defineProperty because the FE re-applies the user's
// LinkRenderMode setting after setup and would overwrite plain assignment.
let cmuLinksMode = 0; // LiteGraph.STRAIGHT_LINK
let cmuFps = 30;

// Force the classic canvas renderer in embeds: Nodes 2.0 mounts every node
// as DOM with no culling — the main mobile perf cost — while the classic
// path benefits from the LOD pins below. NOTE: the FE reads this setting at
// init and offers no non-persistent override, so this writes the user
// setting (shared with desktop for the same ComfyUI user) and reloads once.
async function forceClassicNodes() {
  try {
    if (sessionStorage.getItem("cmuForcedClassic")) return;
    const setting = app.extensionManager?.setting;
    if (!setting?.get || !setting?.set) return;
    if (setting.get("Comfy.VueNodes.Enabled") === true) {
      sessionStorage.setItem("cmuForcedClassic", "1");
      await setting.set("Comfy.VueNodes.Enabled", false);
      location.reload();
    }
  } catch (e) {
    console.warn("[MobileBridge] force classic nodes failed", e);
  }
}

function applyPerformanceMode() {
  const canvas = app.canvas;
  if (!canvas) return;
  const vueMode = !!window.LiteGraph?.vueNodesMode;

  // 1) Cap the canvas backing-store DPR (scoped to resizeCanvas so the rest
  //    of the app keeps the real value). At DPR 3 -> 1.5 this is ~4x less
  //    canvas memory and fill work — the main tab-reload lever.
  try {
    const realDprDesc = { configurable: true, get: () => window.__cmuRealDpr };
    window.__cmuRealDpr = window.devicePixelRatio;
    if (typeof app.resizeCanvas === "function" && !app.__cmuDprWrapped) {
      app.__cmuDprWrapped = true;
      const origResize = app.resizeCanvas.bind(app);
      app.resizeCanvas = function (el) {
        window.__cmuRealDpr = window.devicePixelRatio;
        try {
          Object.defineProperty(window, "devicePixelRatio", {
            configurable: true,
            get: () => Math.min(window.__cmuRealDpr, DPR_CAP),
          });
          return origResize(el);
        } finally {
          Object.defineProperty(window, "devicePixelRatio", realDprDesc);
        }
      };
      window.dispatchEvent(new Event("resize"));
    }
  } catch (e) {
    console.warn("[MobileBridge] DPR cap failed", e);
  }

  // 2) Static cheap-render flags. The FE re-applies user settings AFTER
  //    extension setup (observed for LinkRenderMode, MaximumFps and
  //    MinFontSizeForLOD), so every value it can overwrite is pinned with an
  //    instance-level accessor whose setter is a no-op; the real backing
  //    fields are driven by us directly.
  const setFps = (fps) => {
    cmuFps = fps;
    try {
      canvas._maximumFrameGap = fps > 0 ? 1000 / fps : 0;
    } catch {}
  };
  try {
    canvas.render_shadows = false;
    canvas.render_connection_arrows = false;
    canvas.render_curved_connections = false;
    canvas.set_canvas_dirty_on_mouse_event = false;
    try {
      Object.defineProperty(canvas, "maximumFps", {
        configurable: true,
        get: () => cmuFps,
        set: () => {},
      });
    } catch {}
    setFps(FPS_IDLE);
    try {
      Object.defineProperty(canvas, "links_render_mode", {
        configurable: true,
        get: () => cmuLinksMode,
        set: () => {},
      });
    } catch {
      canvas.links_render_mode = cmuLinksMode;
    }
    // Classic-canvas LOD: _min_font_size_for_lod is the SOURCE the zoom
    // threshold is recomputed from — raising it makes low-quality (which
    // skips text/shadows in this fork's canvas path) engage earlier.
    // 14 => simplified below ~58% zoom on a DPR-3 phone (~71% on DPR-2).
    try {
      Object.defineProperty(canvas, "min_font_size_for_lod", {
        configurable: true,
        get: () => 14,
        set: () => {},
      });
    } catch {}
    canvas._min_font_size_for_lod = 14;
    canvas.updateLowQualityThreshold?.();
  } catch (e) {
    console.warn("[MobileBridge] perf flags failed", e);
  }

  // (Interaction-time hiding of nodes/links was removed by request: content
  //  vanishing mid-gesture read as a bug. Perf now relies on the DPR cap,
  //  the 30fps pin, classic-canvas LOD and the DOM simplification CSS.)

  // 4) Zoom-tier attribute for the CSS DOM-LOD (Vue nodes): below 50% zoom
  //    widget internals stop painting entirely.
  try {
    let lastTier = "";
    const updateZoomTier = () => {
      const scale = canvas.ds?.scale ?? 1;
      const tier = scale < 0.5 ? "far" : "near";
      if (tier !== lastTier) {
        lastTier = tier;
        document.documentElement.dataset.cmuZoom = tier;
      }
    };
    updateZoomTier();
    setInterval(updateZoomTier, 300);
  } catch (e) {
    console.warn("[MobileBridge] zoom tier failed", e);
  }

  canvas.setDirty?.(true, true);
  console.log("[MobileBridge] perf mode active (vueNodes:", vueMode, ")");
}

if (isEmbedded()) {
  app.registerExtension({
    name: "ComfyMobile.CanvasBridge",
    setup() {
      injectCss();
      forceClassicNodes();
      applyPerformanceMode();
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

      // Change catch-all: litegraph fires no hook for node moves (and
      // graph.change() does not call onAfterChange), so poll a cheap
      // fingerprint over structure, positions, modes AND widget values.
      // Emits once, one tick after changes settle — a drag or typing in
      // progress does not spam events.
      setInterval(() => {
        if (applyingShellWorkflow) return;
        const g = app.graph;
        if (!g) return;
        let linkCount = 0;
        try {
          linkCount = typeof g.links?.size === "number" ? g.links.size : Object.keys(g.links ?? {}).length;
        } catch {}
        // 32-bit integer hash — plain Number arithmetic loses low bits once
        // the accumulator exceeds 2^53, which silently swallowed changes.
        let fp = 0;
        const mix = (x) => {
          fp = ((fp * 31) + (x | 0)) | 0;
        };
        mix(g._nodes?.length ?? 0);
        mix(linkCount);
        try {
          for (const n of g._nodes ?? []) {
            mix(Number(n.id));
            mix(n.pos?.[0]);
            mix(n.pos?.[1]);
            mix(n.mode ?? 0);
            for (const w of n.widgets ?? []) {
              const v = w.value;
              const s = typeof v === "string" ? v : v == null ? "" : String(JSON.stringify(v) ?? "");
              for (let i = 0; i < s.length; i++) {
                mix(s.charCodeAt(i));
              }
            }
          }
        } catch {}
        if (fpLast === null) {
          fpLast = fp;
          return;
        }
        if (fp !== fpLast) {
          fpLast = fp;
          fpDirty = true;
        } else if (fpDirty) {
          fpDirty = false;
          scheduleGraphMutated();
        }
      }, 1000);

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
