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
/* ---- Focused-node modal: the official node DOM itself, centered ---- */
html.cmu-node-focus .lg-node[data-node-id]:not(.cmu-focused) {
  opacity: 0.12 !important;
  pointer-events: none !important;
}
.lg-node.cmu-focused {
  transform: translate(var(--cmu-fx), var(--cmu-fy)) scale(var(--cmu-fz)) !important;
  transform-origin: 0 0 !important;
  z-index: 10000 !important;
  box-shadow: 0 16px 56px rgba(0, 0, 0, 0.65) !important;
  border-radius: 14px !important;
  content-visibility: visible !important;
}
.lg-node.cmu-focused [data-testid^="node-body"] {
  max-height: var(--cmu-max-h, 60vh);
  overflow-y: auto !important;
  overscroll-behavior: contain;
}
/* node-attached floating toolbars must not hover over (or close) the card */
html.cmu-node-focus .selection-toolbox,
html.cmu-node-focus [class*="selection-toolbox"],
html.cmu-node-focus [data-testid="selection-toolbox"] {
  display: none !important;
}
/* teleported widget popups (combo/asset pickers) must stack above the card */
html.cmu-node-focus .p-connected-overlay,
html.cmu-node-focus .p-select-overlay,
html.cmu-node-focus .p-multiselect-overlay,
html.cmu-node-focus .p-autocomplete-overlay,
html.cmu-node-focus .p-popover,
html.cmu-node-focus .p-datepicker-panel,
html.cmu-node-focus .p-overlay {
  z-index: 20000 !important;
}
/* Overlay mode (shell-driven focus): the iframe becomes a transparent
   modal layer — only the focused card is visible, the shell's own canvas
   shows through behind it. */
html.cmu-overlay-mode,
html.cmu-overlay-mode body,
html.cmu-overlay-mode #vue-app,
html.cmu-overlay-mode main,
html.cmu-overlay-mode .comfyui-body,
html.cmu-overlay-mode #graph-canvas-container,
html.cmu-overlay-mode .p-splitter,
html.cmu-overlay-mode .p-splitterpanel,
html.cmu-overlay-mode .graph-canvas-panel {
  background: transparent !important;
}
html.cmu-overlay-mode #graph-canvas-container canvas {
  visibility: hidden !important;
}
html.cmu-overlay-mode .lg-node[data-node-id]:not(.cmu-focused) {
  opacity: 0 !important;
  pointer-events: none !important;
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
    case "focus-node": {
      const ok = nodeFocusApi?.focusById(msg.payload?.nodeId, msg.payload?.overlay !== false);
      if (!ok) console.warn("[MobileBridge] focus-node: node not found", msg.payload?.nodeId);
      break;
    }
    case "unfocus-node":
      nodeFocusApi?.unfocus();
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
let nodeFocusApi = null;

function setupNodeFocusMode() {
  let focused = null;
  let rafId = null;
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let downNode = null;

  const paneTransform = () => {
    const el = document.querySelector('[data-testid="transform-pane"]');
    const t = el?.style?.transform ?? "";
    const scale = /scale3d\(([\d.eE+-]+)/.exec(t);
    const trans = /translate3d\((-?[\d.eE+-]+)px,\s*(-?[\d.eE+-]+)px/.exec(t);
    return {
      z: scale ? Number(scale[1]) : 1,
      tx: trans ? Number(trans[1]) : 0,
      ty: trans ? Number(trans[2]) : 0,
    };
  };

  const updateFocusTransform = () => {
    if (!focused) return;
    try {
      updateFocusTransformInner();
    } catch (e) {
      // Never leave a ghost overlay (dimmed screen with no card): any
      // failure closes cleanly, which also tells the shell to hide.
      console.warn("[MobileBridge] focus transform failed — closing", e);
      unfocusNode();
      return;
    }
    rafId = requestAnimationFrame(updateFocusTransform);
  };

  const updateFocusTransformInner = () => {
    // Vue re-renders can replace the node element mid-focus (e.g. after a
    // drag attempt): re-attach to the fresh element, or close cleanly so
    // the shell never gets stuck showing an empty overlay.
    if (!focused.isConnected) {
      const nodeId = focused.getAttribute("data-node-id");
      const fresh = nodeId
        ? document.querySelector(`.lg-node[data-node-id="${nodeId}"]`)
        : null;
      if (fresh) {
        fresh.classList.add("cmu-focused");
        focused = fresh;
      } else {
        unfocusNode();
        return;
      }
    }
    // Vue's class-binding patches strip externally added classes on
    // re-render (observed after drag attempts) — re-assert every frame.
    if (!focused.classList.contains("cmu-focused")) {
      focused.classList.add("cmu-focused");
    }
    const { z, tx, ty } = paneTransform();
    const width =
      parseFloat(getComputedStyle(focused).getPropertyValue("--node-width")) ||
      focused.offsetWidth ||
      300;
    // Consistent card width regardless of the node's intrinsic width, and
    // vertically near-centered (slightly above true center reads best).
    const cardW = Math.min(window.innerWidth * 0.92, 440);
    const fs = Math.min(cardW / width, 1.6);
    const nodeH = focused.offsetHeight || 400;
    const targetH = Math.min(nodeH * fs, window.innerHeight * 0.72);
    const screenX = (window.innerWidth - width * fs) / 2;
    const screenY = Math.max(16, (window.innerHeight - targetH) * 0.42);
    // pane transform is scale(z) translate(tx,ty): screen = z * (p + t)
    focused.style.setProperty("--cmu-fx", `${screenX / z - tx}px`);
    focused.style.setProperty("--cmu-fy", `${screenY / z - ty}px`);
    focused.style.setProperty("--cmu-fz", `${fs / z}`);
    focused.style.setProperty("--cmu-max-h", `${(window.innerHeight * 0.72) / fs}px`);
  };

  const focusNode = (el) => {
    focused = el;
    el.classList.add("cmu-focused");
    document.documentElement.classList.add("cmu-node-focus");
    updateFocusTransform();
  };

  const unfocusNode = () => {
    if (!focused) return;
    const nodeId = focused.getAttribute("data-node-id");
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    focused.classList.remove("cmu-focused");
    for (const prop of ["--cmu-fx", "--cmu-fy", "--cmu-fz", "--cmu-max-h"]) {
      focused.style.removeProperty(prop);
    }
    document.documentElement.classList.remove("cmu-node-focus");
    const wasOverlay = document.documentElement.classList.contains("cmu-overlay-mode");
    document.documentElement.classList.remove("cmu-overlay-mode");
    focused = null;
    // Tell the shell so it can hide the iframe layer and resync the node
    post("focus-dismissed", { nodeId, overlay: wasOverlay });
  };

  const isInteractive = (t) =>
    !!t?.closest?.(
      'input, textarea, select, button, a, [contenteditable], [role="combobox"], [role="button"], [role="listbox"], [role="option"], [role="slider"], [data-testid="node-widgets"]'
    );

  document.addEventListener(
    "pointerdown",
    (event) => {
      downNode = event.target?.closest?.(".lg-node[data-node-id]") ?? null;
      downX = event.clientX;
      downY = event.clientY;
      downTime = performance.now();
      // The focused card is a modal: dragging it (or starting link drags
      // from its slots) makes no sense and detaches the element via Vue
      // re-renders. Swallow non-widget pointerdowns inside the card.
      if (
        focused &&
        event.target instanceof Element &&
        focused.contains(event.target) &&
        !isInteractive(event.target)
      ) {
        event.stopPropagation();
        // Vue's drag/re-render pipeline strips our pin in ways that cannot
        // be reliably fought — if this turns into a drag, close CLEANLY
        // (clears the dim/overlay and notifies the shell) instead of ever
        // leaving a ghost background.
        const sx = event.clientX;
        const sy = event.clientY;
        const onMove = (ev) => {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) {
            cleanup();
            unfocusNode();
          }
        };
        const onUp = () => cleanup();
        const cleanup = () => {
          document.removeEventListener("pointermove", onMove, true);
          document.removeEventListener("pointerup", onUp, true);
        };
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (focused) {
        const target = event.target;
        // Vue re-renders can detach the tapped element between pointerdown
        // and click — a detached target is NOT an outside tap.
        if (!(target instanceof Element) || !target.isConnected) return;
        // clicks inside the focused card pass through to the real widgets
        if (focused.contains(target)) return;
        // Teleported layers (combo/asset pickers, dialogs, menus) are
        // portaled to <body>, OUTSIDE #vue-app — interacting with them must
        // never dismiss the card. A tap landing on bare body/html (e.g. the
        // hidden-canvas area in overlay mode) IS an outside tap though.
        const bareBackground = target === document.body || target === document.documentElement;
        if (!bareBackground && !target.closest("#vue-app")) return;
        // coordinate fallback: DOM churn aside, a tap landing on the card's
        // rect is never an outside tap
        const rect = focused.getBoundingClientRect();
        if (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        unfocusNode();
        return;
      }
      const node = event.target?.closest?.(".lg-node[data-node-id]");
      if (!node || node !== downNode) return;
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (moved > 8 || performance.now() - downTime > 600) return; // drag, not tap
      event.preventDefault();
      event.stopPropagation();
      focusNode(node);
    },
    true
  );

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") unfocusNode();
  });

  nodeFocusApi = {
    focusById(nodeId, overlay) {
      const el = document.querySelector(`.lg-node[data-node-id="${nodeId}"]`);
      if (!el) return false;
      if (overlay) document.documentElement.classList.add("cmu-overlay-mode");
      focusNode(el);
      return true;
    },
    unfocus: unfocusNode,
  };
}



if (isEmbedded()) {
  app.registerExtension({
    name: "ComfyMobile.CanvasBridge",
    setup() {
      injectCss();
      setupNodeFocusMode();
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
