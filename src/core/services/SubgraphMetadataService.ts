import { IObjectInfo, IParameterDefinition } from '@/shared/types/comfy/IComfyObjectInfo';
import { INodeMetadata } from '@/shared/types/comfy/IComfyMetadata';
import { IComfySubgraph } from '@/shared/types/app/base';

/**
 * SubgraphMetadataService
 * 
 * Synthesizes virtual node metadata (ObjectInfo) for subgraph nodes
 * based on their subgraph definitions and proxy widget mappings.
 */
export class SubgraphMetadataService {
    /**
     * Synthesize metadata for a subgraph node
     * @param subgraph - The subgraph definition
     * @param globalObjectInfo - Global metadata for all node types
     * @returns Synthesized INodeMetadata or null
     */
    static synthesizeMetadata(subgraph: IComfySubgraph, globalObjectInfo: IObjectInfo, nodeProperties?: any): INodeMetadata | null {
        if (!subgraph || !subgraph.nodes || !subgraph.inputs) {
            return null;
        }

        // Get proxy widgets from node instance properties (where they are actually defined)
        const proxyWidgets = nodeProperties?.proxyWidgets || [];

        const requiredInputs: Record<string, IParameterDefinition> = {};
        const inputOrder: string[] = [];

        // Process each proxy widget
        proxyWidgets.forEach((pw: [string, string]) => {
            const [targetNodeId, targetWidgetName] = pw;
            let resolvedDef: IParameterDefinition | null = null;

            if (targetNodeId === "-1") {
                // Promoted widget: trace via subgraph inputs
                const widgetName = targetWidgetName;
                const subgraphInput = subgraph.inputs.find(input => input.name === widgetName);

                if (!subgraphInput || !subgraphInput.linkIds || subgraphInput.linkIds.length === 0) {
                    console.warn(`[SubgraphMetadata] Promoted widget "${widgetName}" has no subgraph input or links.`);
                    resolvedDef = [subgraphInput?.type || "STRING", { default: "" }];
                } else {
                    const definitions: IParameterDefinition[] = [];
                    subgraphInput.linkIds.forEach(linkId => {
                        const link = subgraph.links?.find(l => l.id === linkId);
                        if (!link) {
                            console.warn(`[SubgraphMetadata] Link ${linkId} not found in subgraph links.`);
                            return;
                        }

                        const targetNode = subgraph.nodes.find(n => String(n.id) === String(link.target_id));
                        if (!targetNode) {
                            console.warn(`[SubgraphMetadata] Target node ${link.target_id} not found in subgraph nodes.`);
                            return;
                        }

                        const targetNodeMetadata = globalObjectInfo[targetNode.type] as any;
                        if (!targetNodeMetadata) {
                            console.warn(`[SubgraphMetadata] Metadata for internal node type "${targetNode.type}" (ID: ${targetNode.id}) not found in globalObjectInfo.`);
                            return;
                        }

                        const paramDef = this.findParameterDefinition(targetNode, link.target_slot, targetNodeMetadata);
                        if (paramDef) {
                            definitions.push(paramDef);
                        } else {
                            console.warn(`[SubgraphMetadata] Parameter definition for slot ${link.target_slot} not found in node ${targetNode.id} (${targetNode.type}).`);
                        }
                    });

                    if (definitions.length > 0) {
                        resolvedDef = this.resolveBestDefinition(definitions, widgetName);
                    } else if (subgraphInput?.type) {
                        // Tracing failed but we have the type from subgraph input definition
                        console.log(`[SubgraphMetadata] Tracing failed for "${widgetName}", falling back to subgraph input type: ${subgraphInput.type}`);
                        resolvedDef = [subgraphInput.type, { default: "" }];
                    }
                }


                // Revert to using internal widgetName as key to match input slots (fixes duplication)
                // Inject label into options so UI can display it
                if (subgraphInput?.label && resolvedDef) {
                    // Create a deep copy to avoid mutating the shared metadata object
                    // This is critical because multiple widgets may map to the same internal node type definition
                    const config = { ... (resolvedDef[1] || {}) };
                    config.label = subgraphInput.label;
                    resolvedDef = [resolvedDef[0], config] as IParameterDefinition;
                }

                requiredInputs[widgetName] = resolvedDef || ["STRING", { default: "" }];
                inputOrder.push(widgetName);
            } else {
                // Node-specific proxy widget (e.g., ["38", "text"])
                const targetNodeIdStr = String(targetNodeId);
                const internalNode = subgraph.nodes.find(n => String(n.id) === targetNodeIdStr);
                if (internalNode) {
                    const internalMetadata = globalObjectInfo[internalNode.type] as any;
                    if (internalMetadata) {
                        const paramDef = internalMetadata.input?.required?.[targetWidgetName]
                            || internalMetadata.input?.optional?.[targetWidgetName];
                        if (paramDef) {
                            resolvedDef = paramDef;
                            requiredInputs[targetWidgetName] = resolvedDef || ["STRING", { default: "" }];
                            inputOrder.push(targetWidgetName);
                        } else {
                            console.warn(`[SubgraphMetadata] Proxy widget "${targetWidgetName}" not found in node ${targetNodeIdStr} (${internalNode.type}).`);
                        }
                    } else {
                        console.warn(`[SubgraphMetadata] Metadata for internal node type "${internalNode.type}" (ID: ${targetNodeIdStr}) not found.`);
                    }
                } else {
                    console.warn(`[SubgraphMetadata] Internal node ${targetNodeIdStr} not found for proxy widget.`);
                }
            }
        });

        const outputs = subgraph.outputs || [];

        return {
            input: {
                required: requiredInputs,
                optional: {}
            },
            output: outputs.map(o => o.type),
            output_is_list: outputs.map(() => false),
            output_name: outputs.map(o => o.name),
            name: subgraph.name || 'Subgraph',
            display_name: subgraph.name || 'Subgraph',
            description: 'Synthesized Subgraph Metadata',
            category: 'subgraphs'
        } as any;
    }

    /**
     * Create basic metadata for subgraphs with no widgets
     */
    static createEmptyMetadata(subgraph: IComfySubgraph): INodeMetadata {
        const outputs = subgraph.outputs || [];
        return {
            input: { required: {}, optional: {} },
            output: outputs.map(o => o.type),
            output_is_list: outputs.map(() => false),
            output_name: outputs.map(o => o.name),
            name: subgraph.name || 'Subgraph',
            display_name: subgraph.name || 'Subgraph',
            description: 'Empty Subgraph Metadata',
            category: 'subgraphs'
        };
    }

    /**
     * Find parameter definition in target node based on slot index
     */
    private static findParameterDefinition(node: any, slotIndex: number, metadata: any): IParameterDefinition | null {
        // 1. Prefer using the name from the node's inputs array if available (most accurate)
        if (node && node.inputs && node.inputs[slotIndex]) {
            const inputName = node.inputs[slotIndex].name;
            const required = metadata.input?.required || {};
            const optional = metadata.input?.optional || {};

            if (required[inputName]) return required[inputName];
            if (optional[inputName]) return optional[inputName];
        }

        // 2. Fallback to positional logic (legacy/LiteGraph behavior)
        const required = metadata.input?.required || {};
        const optional = metadata.input?.optional || {};

        const requiredNames = metadata.input_order?.required || Object.keys(required);
        const optionalNames = metadata.input_order?.optional || Object.keys(optional);

        if (slotIndex < requiredNames.length) {
            return required[requiredNames[slotIndex]];
        } else if (slotIndex < requiredNames.length + optionalNames.length) {
            return optional[optionalNames[slotIndex - requiredNames.length]];
        }

        return null;
    }

    /**
     * Resolve best parameter definition from multiple candidates
     */
    private static resolveBestDefinition(defs: IParameterDefinition[], _widgetName: string): IParameterDefinition {
        if (defs.length === 0) {
            return ["STRING", { default: "" }];
        }

        if (defs.length === 1) {
            return defs[0];
        }

        const comboDef = defs.find(d => Array.isArray(d[0]));
        if (comboDef) return comboDef;

        const specificDef = defs.find(d => d[0] !== "*");
        if (specificDef) return specificDef;

        return defs[0];
    }
}

export default SubgraphMetadataService;
