import React, { Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import WorkflowGridItem from '/src/components/workflow/WorkflowGridItem';
import '/src/index.css';
import i18n from '/src/lib/i18n';
import { ComfyFileService } from '/src/infrastructure/api/ComfyFileService';
import { useConnectionStore } from '/src/ui/store/connectionStore';
const baseline = new URLSearchParams(location.search).has('baseline');
await i18n.changeLanguage('en');
const galleryModule = baseline ? '/tests/output/gallery-baseline.tsx' : '/src/components/media/OutputsGallery.tsx';
const { OutputsGallery } = await import(/* @vite-ignore */ galleryModule);
const metrics = (window as any).galleryMetrics = { renders: 0, duration: 0, urlBuilds: 0, canvasBuilds: 0 };
const canvasUrl = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (...args) { metrics.canvasBuilds++; return canvasUrl.apply(this, args); };
const createUrl = ComfyFileService.prototype.createDownloadUrl;
ComfyFileService.prototype.createDownloadUrl = function (...args) { metrics.urlBuilds++; return createUrl.apply(this, args); };
useConnectionStore.setState({ url: location.origin, isConnected: true, hasExtension: true, autoReconnectEnabled: false });
(window as any).notifyWs = () => useConnectionStore.setState({ webSocket: { ...useConnectionStore.getState().webSocket, lastMessageTime: Date.now() } });
function HomeFixture() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState(() => Array.from({ length: 25 }, (_, id) => ({
    id: `workflow-${id}`, name: `Workflow ${id}`, createdAt: new Date(2026, 0, 1), modifiedAt: new Date(2026, 0, 1),
    isValid: true, nodeCount: 1, workflow_json: { nodes: [{ id: 1, type: 'Test', title: 'Test',
      pos: [0, 0], size: [180, 80], inputs: [], outputs: [], properties: {}, flags: {} }], links: [] },
  })));
  return <><h1>MAIN SCREEN</h1><button onClick={() => navigate('/outputs')}>Reopen gallery</button>
    <button onClick={() => setWorkflows(previous => previous.map((workflow, index) => index ? workflow :
      { ...workflow, modifiedAt: new Date(2026, 0, 2) }))}>Update first workflow</button>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {workflows.map(workflow => <WorkflowGridItem key={workflow.id} workflow={workflow as any} onClick={() => {}} onLongPress={() => {}} />)}
    </div></>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/outputs']}>
  <Profiler id="gallery" onRender={(_, _phase, duration) => { metrics.renders++; metrics.duration += duration; }}>
    <Routes><Route path="/outputs" element={<OutputsGallery />} /><Route path="/" element={<HomeFixture />} /></Routes>
  </Profiler>
</MemoryRouter>);
