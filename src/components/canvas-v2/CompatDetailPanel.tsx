import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, Puzzle, X } from 'lucide-react';
import CanvasHost from '@/components/canvas-v2/CanvasHost';
import { getActiveCanvasBridge } from '@/services/bridge/CanvasBridgeClient';
import type { BridgeNode } from '@/shared/types/bridge';
import type { IComfyJson } from '@/shared/types/app/IComfyJson';

interface CompatDetailPanelProps {
  /** Panel visibility — the component itself NEVER unmounts (the embedded
   * iframe would reload), it only toggles display. */
  open: boolean;
  nodeId: number | null;
  nodeTitle: string;
  nodeType: string;
  workflowJson: IComfyJson | null | undefined;
  workflowKey: string | null | undefined;
  onClose: () => void;
  onSwitchToLegacy: () => void;
  onGraphMutated?: () => void;
  onNodeChanged?: (node: BridgeNode | null) => void;
}

/**
 * Always-mounted compatibility detail panel. The official-frontend iframe
 * lives INSIDE the panel's layout as a real child, so it follows the modal
 * naturally (no position syncing, no z-index races). The bridge pins the
 * selected node's body DOM to fill the embed box; widget-opened popups
 * temporarily expand the box to fullscreen via a CSS position swap (never a
 * DOM move — that would reload the iframe).
 */
export const CompatDetailPanel: React.FC<CompatDetailPanelProps> = ({
  open,
  nodeId,
  nodeTitle,
  nodeType,
  workflowJson,
  workflowKey,
  onClose,
  onSwitchToLegacy,
  onGraphMutated,
  onNodeChanged,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const [pinSize, setPinSize] = useState<{ width: number; height: number } | null>(null);
  const [portalOpen, setPortalOpen] = useState(false);

  // Pin lifecycle: retry until the (possibly still booting) bridge is ready
  useEffect(() => {
    if (!open || nodeId == null) {
      setPinSize(null);
      setPortalOpen(false);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let pinned = false;
    const tryPin = () => {
      if (cancelled) return;
      const bridge = getActiveCanvasBridge();
      if (bridge?.isReady) {
        bridge.pinNodeBody(nodeId);
        pinned = true;
      } else {
        retry = setTimeout(tryPin, 300);
      }
    };
    tryPin();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (pinned) getActiveCanvasBridge()?.unpinNodeBody();
      setPinSize(null);
      setPortalOpen(false);
    };
  }, [open, nodeId]);

  const areaWidth = areaRef.current?.clientWidth ?? 0;
  const embedHeight = (() => {
    if (!pinSize || !areaWidth) return 260;
    const scale = Math.min(areaWidth / Math.max(1, pinSize.width), 1.4);
    return Math.max(80, Math.round(pinSize.height * scale));
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4 sm:p-6"
      style={{ display: open ? undefined : 'none', pointerEvents: open ? 'auto' : 'none' }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-white/10 px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-white/70">
                ID: {nodeId ?? '—'}
              </span>
              <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/50">
                {nodeType}
              </span>
            </div>
            <h2 className="truncate text-xl font-bold text-white">{nodeTitle}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-sky-400">
              <Puzzle className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Official widgets (compatibility)</span>
            </div>
          </div>
          <button
            onClick={onSwitchToLegacy}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:text-white"
            title="Switch to standard detail view"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:text-white"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — the iframe is a REAL child of this box */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={areaRef}
            style={portalOpen ? undefined : { height: embedHeight }}
            className={
              portalOpen
                ? 'fixed inset-0 z-[120] bg-black/70'
                : 'relative w-full overflow-hidden rounded-xl border border-sky-500/20 bg-slate-900/40'
            }
          >
            <CanvasHost
              workflowJson={workflowJson ?? null}
              workflowKey={workflowKey ?? null}
              onGraphMutated={onGraphMutated}
              onNodeChanged={onNodeChanged}
              onPinSize={setPinSize}
              onPortalToggle={setPortalOpen}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CompatDetailPanel;
