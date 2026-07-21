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
  style.textContent = EMBED_CSS + LITE_CSS;
  document.head.appendChild(style);
  document.documentElement.classList.add("comfy-mobile-embed");
}

// ---------------------------------------------------------------------------
// Lite nodes — zoom-driven LOD over the Vue node DOM (mobile performance).
// The litegraph canvas sits ABOVE the node DOM and owns all pointer
// interaction and link drawing, so hiding node DOM content cannot break
// selecting/dragging/linking. The selected node stays fully rendered via the
// frontend's own selection marker class — Vue keeps that class in sync
// across re-renders, whereas classes we add ourselves get stripped.
//   LOD0 (zoomed in):  stock rendering
//   LOD1 (mid zoom):   header card — body hidden, legacy-canvas look
//   LOD2 (zoomed out): solid rectangles, zero inner elements
// ---------------------------------------------------------------------------

const LIVE_NODE = ":is(.outline-node-component-outline)"; // FE selection marker

// Lite cards mimic the legacy mobile canvas nodes: node-colored rounded rect
// (r=4), subtle white outline, muted=blue / bypassed=purple at 35% alpha.
// Colors arrive per node as inline --cmu-* vars (see syncLiteNodeStyles).
// Error outline overlay, footers, progress bars and resize handles are all
// hidden while simplified; the header (title strip) survives at LOD1 only.
// Simplified tiers keep every node in the DOM for hit-testing (taps select
// via the node elements, which sit above the canvas) and for the
// DOM-measured slot geometry that link rendering depends on — but they do
// not paint. opacity:0 removes painting while keeping hit-testing; display
// or visibility would break taps and link endpoints. The bridge draws all
// node proxies straight onto the litegraph canvas instead (legacy-style
// immediate mode), so zoom/pan re-rasters no DOM at any lite tier. The
// selected node is exempt and stays a fully live, editable official node.
const LITE_CSS = `
html.cmu-lod1 .lg-node:not(${LIVE_NODE}),
html.cmu-lod2 .lg-node:not(${LIVE_NODE}) {
  opacity: 0 !important;
  filter: none !important;
  touch-action: none !important;
}
/* Only the selected node paints inside the pane, so keep its layer
   permanently promoted — avoids the frontend's 256ms promote/demote
   re-raster thrash on repeated small pinches (useTransformSettling). */
html.cmu-lod1 [data-testid="transform-pane"],
html.cmu-lod2 [data-testid="transform-pane"] {
  will-change: transform !important;
}
`;

let liteEnabled = false;
let liteLod = 0;

function applyLod(tier) {
  if (tier === liteLod) return;
  liteLod = tier;
  const cls = document.documentElement.classList;
  cls.toggle("cmu-lod1", tier === 1);
  cls.toggle("cmu-lod2", tier === 2);
  // Entering LOD2 must paint the canvas proxies; leaving it must erase them
  app.canvas?.setDirty?.(true, true);
  console.log("[MobileBridge] lite nodes LOD ->", tier);
}

// Node proxies, drawn immediate-mode on the litegraph canvas (graph space,
// over links) — the bounded-bitmap pipeline that makes the legacy mobile
// canvas fast. LOD2 draws bare rectangles; LOD1 draws legacy-style cards
// with a darkened title strip, the node title and neutral slot dots.
const LITE_DEFAULT_COLOR = "#374151";

function darkenColor(color, amount) {
  try {
    let h = String(color).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const v = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(v)) return color;
    const f = 1 - amount;
    const r = Math.round(((v >> 16) & 255) * f);
    const g = Math.round(((v >> 8) & 255) * f);
    const b = Math.round((v & 255) * f);
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return color;
  }
}

// Legacy title font curve: large when zoomed out, small when close
function liteTitleFontSize(scale) {
  const raw = scale >= 0.8 ? 10 : 50 - (scale / 0.8) * 40;
  return Math.max(15, Math.min(60, raw));
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawLiteNodes(ctx) {
  if (liteLod === 0) return;
  const nodes = app.graph?._nodes;
  if (!nodes) return;
  const selected = app.canvas?.selected_nodes ?? {};
  const scale = app.canvas?.ds?.scale ?? 1;
  const fontSize = liteTitleFontSize(scale);
  const titleH = Math.max(30, fontSize + 16);
  ctx.save();
  for (const n of nodes) {
    if (selected[n.id]) continue; // rendered live by the DOM instead
    let x, y, w, h;
    try {
      const b = typeof n.getBounding === "function" ? n.getBounding() : null;
      if (b) {
        x = b[0]; y = b[1]; w = b[2]; h = b[3];
      } else {
        x = n.pos[0];
        y = n.pos[1] - 30;
        w = n.size[0];
        h = n.size[1] + 30;
      }
    } catch {
      continue;
    }
    let color = n.bgcolor || n.color || LITE_DEFAULT_COLOR;
    let alpha = 1;
    if (n.mode === 2) {
      color = "#3b82f6"; // muted — legacy blue
      alpha = 0.35;
    } else if (n.mode === 4) {
      color = "#9333ea"; // bypassed — legacy purple
      alpha = 0.35;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, 4);
    ctx.fill();

    if (liteLod === 1) {
      const stripH = Math.min(titleH, h);
      ctx.fillStyle = darkenColor(color, 0.25);
      ctx.beginPath();
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + w - 4, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + 4);
      ctx.lineTo(x + w, y + stripH);
      ctx.lineTo(x, y + stripH);
      ctx.lineTo(x, y + 4);
      ctx.quadraticCurveTo(x, y, x + 4, y);
      ctx.closePath();
      ctx.fill();
      if (h > stripH) {
        ctx.beginPath();
        ctx.moveTo(x, y + stripH);
        ctx.lineTo(x + w, y + stripH);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      let title = n.type;
      try {
        title = n.getTitle?.() ?? n.title ?? n.type;
      } catch {}
      if (title && w > 40) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
        ctx.font = `500 ${fontSize}px -apple-system, "system-ui", sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(title), x + 10, y + stripH / 2 + 1, Math.max(10, w - 20));
      }
      // Neutral slot dots on the card edges, like the legacy canvas
      try {
        const dot = (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#64748b";
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
        };
        const inputs = n.inputs ?? [];
        for (let i = 0; i < inputs.length; i++) {
          const p = n.getConnectionPos?.(true, i);
          if (p) dot(p[0], p[1]);
        }
        const outputs = n.outputs ?? [];
        for (let i = 0; i < outputs.length; i++) {
          const p = n.getConnectionPos?.(false, i);
          if (p) dot(p[0], p[1]);
        }
      } catch {}
    }

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, 4);
    ctx.stroke();
  }
  ctx.restore();
}

// Hysteresis: enter thresholds are stricter than exit thresholds so pinching
// around a boundary cannot flip tiers back and forth every poll.
function lodForScale(scale, current) {
  const ENTER_FULL = 1.2, EXIT_FULL = 1.05;
  const ENTER_RECT = 0.45, EXIT_RECT = 0.55;
  if (current === 0 && scale >= EXIT_FULL) return 0;
  if (current === 2 && scale <= EXIT_RECT) return 2;
  if (scale >= ENTER_FULL) return 0;
  if (scale < ENTER_RECT) return 2;
  return 1;
}

function updateLod() {
  if (!liteEnabled) {
    applyLod(0);
    return;
  }
  const scale = app.canvas?.ds?.scale ?? 1;
  applyLod(lodForScale(scale, liteLod));
}

function setLiteMode({ enabled }) {
  liteEnabled = !!enabled;
  updateLod();
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
    case "set-lite-mode":
      setLiteMode(msg.payload ?? {});
      break;
    default:
      break;
  }
}

// Mobile performance mode: cheaper litegraph rendering + capped canvas
// resolution. The node canvas is raster (CSS cannot simplify it), but these
// flags cut fill-rate and memory — the usual cause of iOS tab reloads.
// (Vue-node performance experiments removed — the official canvas renders
//  stock. The focused-node modal below requires Nodes 2.0 to be enabled in
//  the frontend settings; it no-ops gracefully in classic mode.)

// Focused-node modal: tapping a node re-styles the official Vue node DOM
// itself into a centered, enlarged, scrollable card (all widgets stay the
// real official widgets — nothing is re-implemented). The TransformPane is a
// transformed ancestor, so position:fixed cannot escape it; instead we
// compute the pane-local translate/scale that lands the node at the screen
// position we want, and re-derive it every frame while focused so background
// pan/zoom cannot drift the card.
// (Focused-node overlay feature removed — replaced by the detail-modal
//  compatibility mode, which reads node data over the bridge instead of
//  showing the official DOM.)



if (isEmbedded()) {
  app.registerExtension({
    name: "ComfyMobile.CanvasBridge",
    setup() {
      injectCss();
      window.addEventListener("message", handleShellMessage);

      // Register the polls FIRST — they are the load-bearing signals and
      // must survive any failure in the optional hook chaining below.

      // Fallback: light polling in case the callback is missed by a
      // frontend version. Only fires when the selected node id changes.
      setInterval(() => {
        try {
          const node = selectedNode();
          const id = node ? node.id : null;
          if (id !== lastSentSelectionId) reportSelection();
        } catch {}
      }, 600);

      // Lite-nodes LOD: zoom changes have no litegraph hook — poll the scale.
      // Tier flips are single class toggles on <html>, so idle polls are free.
      setInterval(() => {
        try {
          updateLod();
        } catch {}
      }, 300);


      // Primary signal: litegraph selection callback (chain any existing one)
      try {
        const canvas = app.canvas;
        if (canvas) {
          const original = canvas.onSelectionChange;
          canvas.onSelectionChange = function (...args) {
            original?.apply(this, args);
            queueMicrotask(reportSelection);
          };
        }
      } catch (e) {
        console.warn("[MobileBridge] selection hook failed", e);
      }

      // Structural change signal for the shell's stale-state handling
      try {
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
      } catch (e) {
        console.warn("[MobileBridge] graph hooks failed", e);
      }

      // Simplified-tier interaction policy: taps select; a single-finger
      // drag that starts on a proxied node PANS the canvas — handed over as
      // a synthetic middle-button drag, which litegraph turns into a pan
      // regardless of what sits under the pointer (and _processNodeClick is
      // a no-op in Vue mode anyway); two fingers become a pinch, synthesized
      // as ctrl+wheel zoom at the midpoint. Node position moves stay
      // impossible here — they belong to the legacy canvas. The selected
      // node keeps official behavior except header drags (no moving).
      try {
        const taken = new Map(); // pointerId -> { x, y, nodeId, down }
        let handover = null; // null | "pan" | "pinch"
        let pinchDist = 0;
        let liveHeaderBlock = false;
        const canvasEl = () =>
          app.canvas?.canvas ?? document.querySelector("canvas.lgraphcanvas");
        const syntheticPointer = (type, e) =>
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            pointerId: e.pointerId,
            pointerType: "mouse",
            isPrimary: true,
            button: type === "pointermove" ? -1 : 1,
            buttons: type === "pointerup" || type === "pointercancel" ? 0 : 4,
          });
        const endPan = (e, cancel) => {
          canvasEl()?.dispatchEvent(
            syntheticPointer(cancel ? "pointercancel" : "pointerup", e)
          );
          handover = null;
        };
        window.addEventListener(
          "pointerdown",
          (e) => {
            liveHeaderBlock = false;
            if (!liteEnabled || liteLod === 0) return;
            const t = e.target;
            if (!(t instanceof Element)) return;
            const nodeEl = t.closest(".lg-node");
            if (!nodeEl) return;
            if (nodeEl.classList.contains("outline-node-component-outline")) {
              // Live node: block header drags (no node moves); widgets and
              // slots keep full official behavior.
              liveHeaderBlock = !!t.closest(
                '.lg-node-header, [data-testid^="node-header"]'
              );
              return;
            }
            e.stopImmediatePropagation();
            e.preventDefault();
            taken.set(e.pointerId, {
              x: e.clientX,
              y: e.clientY,
              nodeId: nodeEl.dataset.nodeId,
              down: e,
            });
            if (taken.size === 2) {
              if (handover === "pan") endPan(e, true);
              handover = "pinch";
              const [p1, p2] = [...taken.values()];
              pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
            }
          },
          true
        );
        window.addEventListener(
          "pointermove",
          (e) => {
            if (liveHeaderBlock) {
              e.stopImmediatePropagation();
              return;
            }
            const rec = taken.get(e.pointerId);
            if (!rec) return;
            if (e.target === canvasEl()) return; // pointer capture re-targeted it
            e.stopImmediatePropagation();
            e.preventDefault();
            rec.x = e.clientX;
            rec.y = e.clientY;
            if (handover === "pinch") {
              const pts = [...taken.values()];
              if (pts.length === 2) {
                const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
                const ratio = d / pinchDist;
                if (Math.abs(ratio - 1) > 0.01) {
                  pinchDist = d;
                  canvasEl()?.dispatchEvent(
                    new WheelEvent("wheel", {
                      bubbles: true,
                      cancelable: true,
                      clientX: (pts[0].x + pts[1].x) / 2,
                      clientY: (pts[0].y + pts[1].y) / 2,
                      deltaY: ratio > 1 ? -60 : 60,
                      ctrlKey: true,
                    })
                  );
                }
              }
              return;
            }
            if (handover !== "pan") {
              const dx = e.clientX - rec.down.clientX;
              const dy = e.clientY - rec.down.clientY;
              if (dx * dx + dy * dy < 64) return; // still a tap
              handover = "pan";
              canvasEl()?.dispatchEvent(syntheticPointer("pointerdown", rec.down));
            }
            canvasEl()?.dispatchEvent(syntheticPointer("pointermove", e));
          },
          true
        );
        const finish = (e, cancel) => {
          liveHeaderBlock = false;
          const rec = taken.get(e.pointerId);
          if (!rec) return;
          taken.delete(e.pointerId);
          if (e.target === canvasEl()) {
            // Pointer capture routed the real event to the canvas already
            if (taken.size === 0) handover = null;
            return;
          }
          e.stopImmediatePropagation();
          if (handover === "pan") {
            endPan(e, cancel);
          } else if (handover === "pinch") {
            if (taken.size === 0) handover = null;
          } else if (!cancel) {
            // Clean tap: select the node through the official path
            selectNodeById({ nodeId: rec.nodeId });
          }
        };
        window.addEventListener("pointerup", (e) => finish(e, false), true);
        window.addEventListener("pointercancel", (e) => finish(e, true), true);
      } catch (e) {
        console.warn("[MobileBridge] interaction policy failed", e);
      }

      // Lite proxy renderer: chain the canvas foreground hook (a null-by-
      // default user hook — unlike prototype methods, chaining it is the
      // supported extension pattern). Internal try keeps any drawing error
      // from ever aborting the frontend's draw loop.
      try {
        const canvas = app.canvas;
        if (canvas) {
          const originalDrawFg = canvas.onDrawForeground;
          canvas.onDrawForeground = function (ctx, area) {
            originalDrawFg?.call(this, ctx, area);
            try {
              drawLiteNodes(ctx);
            } catch {}
          };
        }
      } catch (e) {
        console.warn("[MobileBridge] draw hook failed", e);
      }

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
