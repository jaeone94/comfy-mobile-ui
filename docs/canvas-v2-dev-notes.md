# Canvas v2 (official canvas) — dev notes

Working notes for the hybrid-shell migration: the editor keeps every existing
surface (header, action panels, queue bar, NodeDetailModal, connection mode)
and swaps only the canvas for the official ComfyUI frontend embedded in an
iframe. Custom-node frontend extensions load natively inside the iframe, which
is the whole point of the migration.

Status: first slice merged on `feat/canvas-v2-official-canvas` (2026-07-20),
verified end-to-end in-browser on macOS.

## Architecture

```
WorkflowEditor
├─ officialCanvasEnabled? (canvasV2Store, persisted; "Official canvas β" chip)
│   ├─ true  → CanvasHost (src/components/canvas-v2/CanvasHost.tsx)
│   │          iframe → official FE (server /) + bridge extension inside it
│   └─ false → WorkflowCanvas (legacy custom renderer, unchanged)
├─ NodeDetailModal / connection mode / QuickActionPanel … (unchanged)
```

- **Bridge extension** `comfy-mobile-ui-api-extension/fe/mobileBridge.js`
  (served via `WEB_DIRECTORY = "fe"`). Loaded by the official FE like any
  custom-node extension; activates only inside an iframe (or `?mobileBridge=1`
  for direct debugging). The ONLY code coupled to FE internals — keep it that
  way. Hides desktop chrome via injected CSS (selectors verified on FE 1.48).
- **Shell client** `src/services/bridge/CanvasBridgeClient.ts` — typed
  postMessage channel (protocol v1, `src/shared/types/bridge.ts`): events,
  fire-and-forget commands, request/response with correlation ids.
  `getActiveCanvasBridge()` is the registry cross-cutting code uses to mirror
  edits without prop drilling.
- **Dual-graph mirror strategy**: the editor still loads the workflow into its
  own ComfyGraph (UI model — modal & panels work unchanged). Edits mirror into
  the official graph live (`useWidgetValueEditor` taps + node-mode handlers).
  Execution serializes via the official `graphToPrompt` (bridge `get-prompt` →
  existing `executeWorkflow`, so tracking/WS progress is unchanged). Save
  serializes via the official graph (`get-workflow` → IndexedDB), preserving
  positions/links changed directly on the canvas.
- **Session-restore race**: the FE asynchronously restores its own last
  workflow after startup and can overwrite the shell's `load-workflow`. The
  bridge delays `bridge-ready` until the first `afterConfigureGraph` (or 1.5s
  grace) and reasserts the shell's workflow if an external configure replaces
  it. Don't remove this without re-testing reload persistence.

## Verified end-to-end

Import from server → open editor → toggle β → node select → NodeDetailModal
(with metadata) → widget edit mirrors live onto the official canvas → save →
IndexedDB holds the official serialization → reload restores it. Missing-model
highlights render natively on the canvas.

## Strategy update (2nd slice)

Official-canvas mode is now a PURE official editing surface: the FE owns all
canvas interaction (selection, wiring validity, moves, on-canvas widget
edits) — no selection→modal routing, no legacy mirrors of interactions, and
the right action rail is hidden (queue bar stays). The shell only tracks
dirtiness — the bridge fingerprint now covers widget values too — shows a
Save button, and persists via `get-workflow` (rebuilding the legacy graph
model on save). Switching canvas modes auto-saves pending edits on either
side, so both canvases always resume from the same workflow JSON. Bridge
files are served with `Cache-Control: no-cache` (partitioned browser caches
made stale bridge modules unrecoverable client-side). This supersedes the
earlier connection/reposition-mode rewiring plan — deleted from the backlog.

## Known issues / not yet done

1. ~~Structural edits made on the official canvas reach the editor only via
   save~~ → DONE: the bridge polls a graph fingerprint (nodes/links/pos/mode;
   litegraph fires no hook for node moves) and emits a debounced
   `graph-mutated` once changes settle; the editor pulls `get-workflow` and
   rebuilds its ComfyGraph through the session store (`syncWorkflow`), keeping
   NodeDetailModal/selection fresh. Verified: mode change via bridge →
   exactly one event → resync without errors.
2. Connection mode / reposition mode still operate on the legacy graph only —
   need bridge commands (`connect`, `disconnect`, `set-node-pos`) and rewiring
   of their apply paths.
3. FE top-right notification card ("View details") is still visible in embeds;
   add its selector to the bridge CSS.
4. postMessage targetOrigin is `'*'` in the bridge (shell side already
   origin-checks). Lock to the shell origin before shipping.
5. Subgraph sessions: the shell always loads the ROOT workflow into the iframe.
6. Real queue execution over the v2 path (`get-prompt`) not yet run on a
   machine with the models present.
7. `/canvas-lab` route is the original plumbing experiment — keep for
   debugging, delete before release.

## Dev setup

Either OS: link the extension into ComfyUI, install its Python deps
(`aiofiles` is the critical one), restart ComfyUI with `--enable-cors-header`,
then `npm run dev` and connect the app to the server URL.

- macOS: `ln -s <repo>/comfy-mobile-ui-api-extension ~/ComfyUI/custom_nodes/`
- Windows (no admin needed):
  `mklink /J C:\...\ComfyUI\custom_nodes\comfy-mobile-ui-api-extension C:\...\comfy-mobile-ui\comfy-mobile-ui-api-extension`

Bridge JS edits apply on page refresh; `__init__.py` changes need a server
restart. Sanity checks: `/comfymobile/api/status` returns JSON and
`/extensions/comfy-mobile-ui-api-extension/mobileBridge.js` is served.

Note: automated browsers cannot click inside the cross-origin iframe (real
input works fine). For scripted testing, drive selection via
`iframe.contentWindow.postMessage({source:'comfy-mobile-shell',
type:'select-node', payload:{nodeId}}, '*')`, and prefer running the server
without `--multi-user` so the iframe skips the user-select screen.
