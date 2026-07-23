import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const callbacksRef = useRef({ onNodeSelected, onReady, onGraphMutated });
  callbacksRef.current = { onNodeSelected, onReady, onGraphMutated };

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

    return () => {
      offReady();
      offSelection();
      offMutated();
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
    // The bridge already fits after loadGraphData, but the iframe canvas may
    // not have its final dimensions yet on first show. Re-fit once the layout
    // has settled so the workflow always lands centered.
    const fitTimer = setTimeout(() => clientRef.current?.fitView(), 350);
    return () => clearTimeout(fitTimer);
  }, [isReady, workflowJson, workflowKey]);

  return (
    <div className="absolute inset-0">
      <iframe
        ref={iframeRef}
        src={`${serverUrl}/`}
        title="ComfyUI official canvas"
        className="absolute inset-0 h-full w-full border-0 bg-[#0b0c0f]"
        allow="clipboard-read; clipboard-write"
      />
      {!isReady && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          style={{ background: 'rgba(11,12,15,0.85)' }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.08] border-t-[#3069f0]" />
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#565d6b]">Loading official canvas</div>
          <div className="font-mono text-[10px] text-[#565d6b] px-1.5 py-0.5 rounded-[5px] border border-white/10">{serverUrl}</div>
        </div>
      )}
    </div>
  );
};

export default CanvasHost;
