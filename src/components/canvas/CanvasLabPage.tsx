import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Maximize, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/ui/store/connectionStore';

/**
 * Canvas Lab — experiment for the "hybrid shell" architecture.
 *
 * Embeds the official ComfyUI frontend in an iframe. A tiny bridge extension
 * (comfy-mobile-ui-api-extension/fe/mobileBridge.js) runs inside the iframe,
 * hides the desktop chrome, and exchanges postMessage events with this page:
 * node selection drives a native bottom-sheet "node detail" view, and edits
 * made here are written back into the official graph.
 */

const BRIDGE_SOURCE = 'comfy-mobile-bridge';
const SHELL_SOURCE = 'comfy-mobile-shell';

interface BridgeWidgetOptions {
  values?: unknown[];
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  multiline?: boolean;
}

interface BridgeWidget {
  name: string;
  type: string;
  value: unknown;
  options: BridgeWidgetOptions;
}

interface BridgeNode {
  id: number | string;
  type: string;
  title: string;
  mode: number;
  widgets: BridgeWidget[];
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  imgs: string[];
}

interface GraphSummary {
  nodeCount: number;
  workflowName: string | null;
  frontendVersion: string | null;
}

const MODE_LABELS: { mode: number; label: string }[] = [
  { mode: 0, label: 'Normal' },
  { mode: 2, label: 'Mute' },
  { mode: 4, label: 'Bypass' },
];

const CanvasLabPage: React.FC = () => {
  const navigate = useNavigate();
  const storedUrl = useConnectionStore((s) => s.url);
  const serverUrl = useMemo(
    () => (storedUrl || 'http://127.0.0.1:8188').replace(/\/$/, ''),
    [storedUrl]
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [node, setNode] = useState<BridgeNode | null>(null);
  const [sheetDismissed, setSheetDismissed] = useState(false);
  const textDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = useCallback((type: string, payload?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: SHELL_SOURCE, type, payload },
      '*'
    );
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.source !== BRIDGE_SOURCE) return;
      switch (msg.type) {
        case 'bridge-ready':
          setBridgeReady(true);
          setSummary(msg.payload ?? null);
          toast.success('Canvas bridge connected');
          send('get-state');
          break;
        case 'graph-changed':
          setSummary(msg.payload ?? null);
          break;
        case 'selection-changed':
          setNode(msg.payload ?? null);
          setSheetDismissed(false);
          break;
        case 'queue-result':
          if (msg.payload?.ok) toast.success('Prompt queued');
          else toast.error(`Queue failed: ${msg.payload?.error ?? 'unknown error'}`);
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  const updateWidgetLocal = useCallback((widgetName: string, value: unknown) => {
    setNode((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((w) =>
              w.name === widgetName ? { ...w, value } : w
            ),
          }
        : prev
    );
  }, []);

  const sendWidgetValue = useCallback(
    (widgetName: string, value: unknown, debounce = false) => {
      if (!node) return;
      updateWidgetLocal(widgetName, value);
      const dispatch = () =>
        send('set-widget-value', { nodeId: node.id, widgetName, value });
      if (debounce) {
        clearTimeout(textDebounce.current[widgetName]);
        textDebounce.current[widgetName] = setTimeout(dispatch, 300);
      } else {
        dispatch();
      }
    },
    [node, send, updateWidgetLocal]
  );

  const setNodeMode = useCallback(
    (mode: number) => {
      if (!node) return;
      setNode((prev) => (prev ? { ...prev, mode } : prev));
      send('set-node-mode', { nodeId: node.id, mode });
    },
    [node, send]
  );

  const renderWidget = (w: BridgeWidget) => {
    const inputBase =
      'w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500';

    if (Array.isArray(w.options.values)) {
      return (
        <select
          className={inputBase}
          value={String(w.value ?? '')}
          onChange={(e) => sendWidgetValue(w.name, e.target.value)}
        >
          {w.options.values.map((v, i) => (
            <option key={`${String(v)}-${i}`} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      );
    }
    if (w.type === 'number' || w.type === 'slider') {
      return (
        <input
          type="number"
          className={inputBase}
          value={typeof w.value === 'number' ? w.value : Number(w.value ?? 0)}
          min={w.options.min}
          max={w.options.max}
          step={w.options.step ?? 1}
          onChange={(e) => sendWidgetValue(w.name, Number(e.target.value))}
        />
      );
    }
    if (w.type === 'toggle') {
      return (
        <button
          className={`h-7 w-12 rounded-full transition-colors ${
            w.value ? 'bg-sky-500' : 'bg-slate-700'
          }`}
          onClick={() => sendWidgetValue(w.name, !w.value)}
        >
          <span
            className={`block h-5 w-5 rounded-full bg-white transition-transform ${
              w.value ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      );
    }
    if (w.type === 'customtext' || w.options.multiline) {
      return (
        <textarea
          className={`${inputBase} min-h-[84px] resize-y`}
          value={String(w.value ?? '')}
          onChange={(e) => sendWidgetValue(w.name, e.target.value, true)}
        />
      );
    }
    if (w.type === 'text' || w.type === 'string') {
      return (
        <input
          type="text"
          className={inputBase}
          value={String(w.value ?? '')}
          onChange={(e) => sendWidgetValue(w.name, e.target.value, true)}
        />
      );
    }
    return (
      <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400 break-all">
        {w.type}: {JSON.stringify(w.value)}
      </div>
    );
  };

  const sheetVisible = !!node && !sheetDismissed;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-900 border-b border-slate-800 z-20">
        <button
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
          onClick={() => navigate('/')}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100">Canvas Lab</div>
          <div className="text-[11px] text-slate-400 truncate">
            {bridgeReady
              ? `${summary?.workflowName ?? 'workflow'} · ${summary?.nodeCount ?? 0} nodes · FE ${summary?.frontendVersion ?? '?'}`
              : `waiting for bridge… (${serverUrl})`}
          </div>
        </div>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            bridgeReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
          }`}
          title={bridgeReady ? 'Bridge connected' : 'Bridge not connected'}
        />
        <button
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          disabled={!bridgeReady}
          onClick={() => send('fit-view')}
          aria-label="Fit view"
        >
          <Maximize className="w-5 h-5" />
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white"
          disabled={!bridgeReady}
          onClick={() => send('queue-prompt')}
        >
          <Play className="w-4 h-4" />
          Queue
        </button>
      </div>

      {/* Official frontend */}
      <div className="relative flex-1">
        <iframe
          ref={iframeRef}
          src={`${serverUrl}/`}
          title="ComfyUI official frontend"
          className="absolute inset-0 w-full h-full border-0 bg-slate-900"
          allow="clipboard-read; clipboard-write"
        />

        {/* Node detail bottom sheet */}
        <AnimatePresence>
          {sheetVisible && node && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="absolute inset-x-0 bottom-0 z-30 max-h-[62%] flex flex-col rounded-t-2xl border border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl"
            >
              <div className="flex items-start gap-3 px-4 pt-3 pb-2 border-b border-slate-800">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-slate-100 truncate">
                    {node.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    #{node.id} · {node.type}
                  </div>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-slate-700">
                  {MODE_LABELS.map(({ mode, label }) => (
                    <button
                      key={mode}
                      className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        node.mode === mode
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                      onClick={() => setNodeMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
                  onClick={() => setSheetDismissed(true)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {node.imgs.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {node.imgs.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-24 w-24 rounded-lg object-cover border border-slate-700"
                      />
                    ))}
                  </div>
                )}
                {node.widgets.length === 0 && (
                  <div className="text-sm text-slate-400">
                    This node has no editable widgets.
                  </div>
                )}
                {node.widgets.map((w) => (
                  <div key={w.name}>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      {w.name}
                    </label>
                    {renderWidget(w)}
                  </div>
                ))}
                <div className="pb-2 pt-1 text-[11px] text-slate-500">
                  {node.inputs.length} inputs · {node.outputs.length} outputs · edits
                  are applied to the official graph in real time
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CanvasLabPage;
