import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useConnectionStore } from '@/ui/store/connectionStore';
import {
  CanvasBridgeClient,
  setActiveCanvasBridge,
} from '@/services/bridge/CanvasBridgeClient';
import type { BridgeGraphSummary, BridgeNode } from '@/shared/types/bridge';
import type { IComfyJson } from '@/shared/types/app/IComfyJson';

interface CanvasHostProps {
  /** Workflow to load into the official frontend once the bridge is ready. */
  workflowJson: IComfyJson | null | undefined;
  /** Identity of the workflow (route id); re-sends load-workflow when it changes. */
  workflowKey: string | null | undefined;
  onNodeSelected?: (node: BridgeNode | null) => void;
  onReady?: (summary: BridgeGraphSummary) => void;
  onGraphMutated?: () => void;
  onNodeChanged?: (node: BridgeNode | null) => void;
  onPinSize?: (size: { width: number; height: number }) => void;
  onPortalToggle?: (open: boolean) => void;
}

/**
 * Canvas v2 host: embeds the official ComfyUI frontend (which loads every
 * custom node's frontend extension natively) and exposes it to the editor
 * through the canvas bridge. All surrounding editor UI stays untouched.
 */
export const CanvasHost: React.FC<CanvasHostProps> = ({
  workflowJson,
  workflowKey,
  onNodeSelected,
  onReady,
  onGraphMutated,
  onNodeChanged,
  onPinSize,
  onPortalToggle,
}) => {
  const storedUrl = useConnectionStore((s) => s.url);
  const serverUrl = useMemo(
    () => (storedUrl || 'http://127.0.0.1:8188').replace(/\/$/, ''),
    [storedUrl]
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const clientRef = useRef<CanvasBridgeClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);

  // Keep latest callbacks without re-creating the client
  const callbacksRef = useRef({ onNodeSelected, onReady, onGraphMutated, onNodeChanged, onPinSize, onPortalToggle });
  callbacksRef.current = { onNodeSelected, onReady, onGraphMutated, onNodeChanged, onPinSize, onPortalToggle };

  useEffect(() => {
    const client = new CanvasBridgeClient(serverUrl);
    clientRef.current = client;
    setActiveCanvasBridge(client);
    if (iframeRef.current) client.attach(iframeRef.current);

    const offReady = client.on('ready', (summary) => {
      setIsReady(true);
      loadedKeyRef.current = null; // force (re)load after iframe reloads
      callbacksRef.current.onReady?.(summary);
    });
    const offSelection = client.on('selectionChanged', (node) => {
      callbacksRef.current.onNodeSelected?.(node);
    });
    const offMutated = client.on('graphMutated', () => {
      callbacksRef.current.onGraphMutated?.();
    });
    const offNodeChanged = client.on('nodeChanged', (node) => {
      callbacksRef.current.onNodeChanged?.(node);
    });
    const offPinSize = client.on('pinSize', (size) => {
      callbacksRef.current.onPinSize?.(size);
    });
    const offPortal = client.on('portalToggle', (open) => {
      callbacksRef.current.onPortalToggle?.(open);
    });

    return () => {
      offReady();
      offSelection();
      offMutated();
      offNodeChanged();
      offPinSize();
      offPortal();
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
      setActiveCanvasBridge(null);
    };
  }, [serverUrl]);

  // Push the editor's workflow into the official frontend
  useEffect(() => {
    if (!isReady || !workflowJson || !workflowKey) return;
    if (loadedKeyRef.current === workflowKey) return;
    loadedKeyRef.current = workflowKey;
    clientRef.current?.loadWorkflow(workflowJson);
  }, [isReady, workflowJson, workflowKey]);

  return (
    <div className="absolute inset-0">
      <iframe
        ref={iframeRef}
        src={`${serverUrl}/`}
        title="ComfyUI official canvas"
        className="absolute inset-0 h-full w-full border-0 bg-slate-950"
        allow="clipboard-read; clipboard-write"
      />
      {!isReady && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
          <div className="text-sm text-slate-300">Loading official canvas…</div>
          <div className="text-[11px] text-slate-500">{serverUrl}</div>
        </div>
      )}
    </div>
  );
};

export default CanvasHost;
