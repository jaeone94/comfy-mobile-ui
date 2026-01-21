import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorkflow } from '@/infrastructure/storage/IndexedDBWorkflowService';
import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';
import { WorkflowStackEditor } from '@/components/workflow/WorkflowStackEditor';
import { ComfyGraph } from '@/core/domain/ComfyGraph';
import { loadWorkflowToGraph } from '@/core/services/WorkflowGraphService';
import { useTranslation } from 'react-i18next';

export const WorkflowStackPage: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [graph, setGraph] = useState<ComfyGraph | null>(null);
    const [workflowName, setWorkflowName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            try {
                setLoading(true);
                let workflow = await getWorkflow(id);

                // Fallback: Try numeric ID if not found (IndexedDB keys can be type-sensitive)
                if (!workflow && !isNaN(Number(id))) {
                    console.warn(`[WorkflowStackPage] Workflow not found with string ID "${id}", trying numeric ID...`);
                    // @ts-ignore - getWorkflow expects string but we want to try number key match
                    workflow = await getWorkflow(Number(id) as any);
                }

                if (workflow) {
                    setWorkflowName(workflow.name || '');
                    // Fetch metadata first to ensure widgets can be initialized correctly
                    console.log('📚 [WorkflowStackPage] Fetching node metadata...');
                    const { ComfyNodeMetadataService } = await import('@/infrastructure/api/ComfyNodeMetadataService');
                    const objectInfo = await ComfyNodeMetadataService.fetchObjectInfo();

                    // Create a temporary graph to load the workflow into
                    console.log('📚 [WorkflowStackPage] Configuring graph...');
                    const { ComfyGraph } = await import('@/core/domain/ComfyGraph');
                    const tempGraph = new ComfyGraph();
                    if (workflow.id) tempGraph.id = workflow.id;

                    // Support metadata injection
                    tempGraph.setMetadata(objectInfo);

                    if (workflow.workflow_json) {
                        console.log('📚 [WorkflowStackPage] Using workflow_json');
                        await tempGraph.configure(workflow.workflow_json as any);
                    } else {
                        console.log('📚 [WorkflowStackPage] Using raw workflow object');
                        await tempGraph.configure(workflow as any);
                    }

                    // Re-assign ID after configuration to ensure it's not lost
                    if (workflow.id) tempGraph.id = workflow.id;

                    console.log('📚 [WorkflowStackPage] Graph configured for ID:', tempGraph.id);
                    setGraph(tempGraph);
                }
            } catch (error) {
                console.error("Failed to load workflow for stack view:", error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
                {t('common.loading')}
            </div>
        );
    }

    if (!graph) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
                {t('workflow.loadFailed')}
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-[#0F1012]">
            <WorkflowStackEditor
                graph={graph}
                workflowName={workflowName}
                id={id}
                onClose={() => navigate(`/workflow/${id}`)}
            />
        </div>
    );
};
