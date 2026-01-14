import { IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { IComfyObjectInfo } from '@/shared/types/comfy/IComfyObjectInfo';
import { loadAllWorkflows } from '@/infrastructure/storage/WorkflowStorageService';
import { ComfyGraph } from '@/core/domain/ComfyGraph';
import { NodeWidgetModifications } from '@/shared/types/widgets/widgetModifications';

export interface WorkflowSession {
  graph: ComfyGraph;
  modifiedWidgetValues: Map<number, NodeWidgetModifications>;
  subgraphId: string; // null for root
  title: string;
}

interface GlobalState {
  // Workflow
  workflows: IComfyWorkflow[];
  workflow: IComfyWorkflow | null;
  objectInfo: IComfyObjectInfo | null;

  // Session Stack for Subgraphs
  sessionStack: WorkflowSession[];

  // Selected node in workflow
  selectedNodeId: string | null;

  // Actions  
  addWorkflow: (workflow: IComfyWorkflow) => void;
  removeWorkflow: (workflowId: string) => void;
  setWorkflow: (workflow: IComfyWorkflow | null, graphInstance?: ComfyGraph) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // Session Actions
  pushSession: (session: WorkflowSession) => void;
  popSession: () => void;
  jumpToSession: (index: number) => void;
  updateCurrentSessionValues: (values: Map<number, NodeWidgetModifications>) => void;
  syncWorkflow: (workflow: IComfyWorkflow) => void;
  updateWorkflowJson: (workflowJson: any) => void;

  // Graph/Node access functions - workflow based
  getSelectedGraph: () => any | null;
  getSelectedNode: () => any | null;
  getSelectedSubgraphId: () => string | null;
  getNodes: () => any[];
  getLinks: () => any[];
  getGroups: () => any[];

  // Calculated values
  isSelectedWorkflow: () => boolean;
}

export const useGlobalStore = create<GlobalState>()(
  devtools(
    (set, get) => ({
      // Initial state
      workflows: loadAllWorkflows(),
      workflow: null,
      objectInfo: null,
      sessionStack: [],
      selectedNodeId: null,

      // Actions
      addWorkflow: (workflow: IComfyWorkflow) => {
        set((state) => ({
          workflows: [...state.workflows, workflow],
        }));
      },
      removeWorkflow: (workflowId: string) => {
        set((state) => ({
          workflows: state.workflows.filter((workflow) => workflow.id !== workflowId),
        }));
      },
      // Session Actions
      pushSession: (session: WorkflowSession) => {
        set((state) => ({
          sessionStack: [...state.sessionStack, session],
          selectedNodeId: null
        }));
      },
      popSession: () => {
        set((state) => {
          if (state.sessionStack.length <= 1) return state; // Don't pop root

          const poppedSession = state.sessionStack[state.sessionStack.length - 1];
          const parentSession = state.sessionStack[state.sessionStack.length - 2];

          // Persistence: Apply changes to parent
          if (poppedSession.subgraphId && parentSession.graph) {
            // 1. Apply any modified widget values to the graph instance before serializing
            if (poppedSession.modifiedWidgetValues.size > 0) {
              for (const [nodeId, modifications] of poppedSession.modifiedWidgetValues.entries()) {
                const node = poppedSession.graph.getNodeById(nodeId);
                if (node) {
                  // Apply widget modifications
                  // Use setWidgetValue if available (best for consistency/logging), else fallback to direct set
                  for (const [paramName, value] of Object.entries(modifications)) {
                    if ((node as any).setWidgetValue) {
                      (node as any).setWidgetValue(paramName, value);
                    } else {
                      const widgets = (node as any).getWidgets ? (node as any).getWidgets() : [];
                      const widget = widgets.find((w: any) => w.name === paramName);
                      if (widget) {
                        widget.value = value;
                      } else if (node.widgets_values && !Array.isArray(node.widgets_values)) {
                        (node.widgets_values as any)[paramName] = value;
                      }
                    }
                  }
                }
              }
            }

            // 2. Serialize and update parent
            try {
              const serialized = poppedSession.graph.serialize();
              if (parentSession.graph.subgraphs) {
                // IMPORTANT: Ensure subgraphs map exists or use set
                if (!(parentSession.graph.subgraphs instanceof Map)) {
                  parentSession.graph.subgraphs = new Map(Object.entries(parentSession.graph.subgraphs || {}));
                }

                // 🛡️ REFIX: Merge serialized graph with existing definition to preserve metadata (name, inputNode, outputNode)
                const existingDef = parentSession.graph.subgraphs.get(poppedSession.subgraphId);
                const mergedDef = {
                  ...(existingDef || {}),
                  ...serialized,
                  // Ensure name is preserved if serialize() might have missed it or it was explicitly in definition
                  name: serialized.name || (existingDef as any)?.name || poppedSession.title
                };

                parentSession.graph.subgraphs.set(poppedSession.subgraphId, mergedDef as any);
              }
            } catch (e) {
              console.error("Failed to serialize subgraph session", e);
            }
          }

          const newStack = state.sessionStack.slice(0, -1);
          return {
            sessionStack: newStack,
            selectedNodeId: null
          };
        });
      },
      jumpToSession: (index: number) => {
        const state = get();
        if (index < 0 || index >= state.sessionStack.length) return;

        // Recursively pop until we reach the target index to ensure persistence
        const currentLength = state.sessionStack.length;
        const popsNeeded = currentLength - 1 - index;

        if (popsNeeded <= 0) return;

        // Perform sequential pops to trigger persistence logic
        for (let i = 0; i < popsNeeded; i++) {
          get().popSession();
        }
      },
      updateCurrentSessionValues: (values) => {
        set((state) => {
          const stack = [...state.sessionStack];
          const current = stack[stack.length - 1];
          if (current) {
            current.modifiedWidgetValues = values;
          }
          return { sessionStack: stack };
        });
      },
      setWorkflow: (workflow: IComfyWorkflow | null, graphInstance?: ComfyGraph) => {
        // Initialize stack with root session if workflow is set
        let initialStack: WorkflowSession[] = [];
        if (workflow) {
          initialStack = [{
            // Use the provided graph instance (runtime class) or fallback to data-only graph (unsafe for methods)
            graph: (graphInstance || workflow.graph) as ComfyGraph,
            modifiedWidgetValues: new Map(),
            subgraphId: workflow.id,
            title: workflow.name || 'Main Workflow'
          }];
        }
        set({ workflow, sessionStack: initialStack, selectedNodeId: null });
      },
      syncWorkflow: (workflow: IComfyWorkflow) => {
        set({ workflow });
      },
      updateWorkflowJson: (workflowJson: any) => {
        set((state) => {
          if (!state.workflow) return state;
          return {
            workflow: {
              ...state.workflow,
              workflow_json: workflowJson,
              modifiedAt: new Date()
            }
          };
        });
      },

      // Graph/Node access functions - session based
      getSelectedGraph: () => {
        const state = get();
        const currentSession = state.sessionStack[state.sessionStack.length - 1];
        return currentSession?.graph || state.workflow?.graph || null;
      },
      getSelectedSubgraphId: () => {
        const state = get();
        const currentSession = state.sessionStack[state.sessionStack.length - 1];
        return currentSession?.subgraphId || null;
      },
      getSelectedNode: () => {
        const state = get();
        if (!state.workflow?.graph || !state.selectedNodeId) return null;

        const graph = get().getSelectedGraph();
        if (graph?._nodes) {
          return graph._nodes.find((node: any) => node.id?.toString() === state.selectedNodeId) || null;
        }
        return null;
      },
      getNodes: () => {
        const graph = get().getSelectedGraph();
        return graph?._nodes || [];
      },
      getLinks: () => {
        const graph = get().getSelectedGraph();
        if (!graph?._links) return [];

        // _links is Record<number, IComfyGraphLink> type, convert to array
        if (typeof graph._links === 'object' && !Array.isArray(graph._links)) {
          return Object.values(graph._links);
        }
        return graph._links || [];
      },
      getGroups: () => {
        const graph = get().getSelectedGraph();
        return graph?._groups || [];
      },

      // Calculated values
      isSelectedWorkflow: () => {
        return get().workflow !== null;
      },
    }),
    {
      name: 'global-store',
    }
  )
);