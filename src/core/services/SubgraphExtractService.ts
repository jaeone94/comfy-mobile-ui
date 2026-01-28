import { IComfyJson, IComfyJsonNode, IComfySubgraph } from '@/shared/types/app/IComfyJson';

/**
 * SubgraphExtractService
 * Responsible for extracting subgraph nodes within a workflow and flattening them into the main workflow.
 */
export class SubgraphExtractService {
    /**
     * Checks if subgraph nodes exist in the workflow.
     */
    public static hasSubgraphs(workflow: any): boolean {
        if (!workflow?.nodes || !Array.isArray(workflow.nodes)) return false;

        const ids = new Set<string>();
        const process = (sg: any) => {
            if (!sg) return;
            if (Array.isArray(sg)) {
                sg.forEach(s => { if (s?.id) ids.add(s.id); if (s?.name) ids.add(s.name); });
            } else if (typeof sg === 'object') {
                Object.keys(sg).forEach(k => ids.add(k));
                Object.values(sg).forEach((v: any) => { if (v?.id) ids.add(v.id); });
            }
        };

        process(workflow.subgraphs);
        process(workflow.definitions?.subgraphs);

        return workflow.nodes.some((n: any) => ids.has(n.type));
    }

    /**
     * Iterates through all subgraphs in the global workflow and executes extraction.
     * Searches using DFS traversal to ensure parent-child subgraphs are placed physically close to each other.
     */
    public static extractAllSubgraphs(workflowJson: any): any {
        // Deep copy to prevent modification of the original
        let workflow = JSON.parse(JSON.stringify(workflowJson));

        // Calculate the base bottom coordinate of the main workflow
        let maxY = -Infinity;
        let minX = Infinity;
        workflow.nodes.forEach((n: any) => {
            maxY = Math.max(maxY, n.pos[1] + (n.size?.[1] || 100));
            minX = Math.min(minX, n.pos[0]);
        });
        if (maxY === -Infinity) { maxY = 0; minX = 0; }

        let startPos: [number, number] = [minX, maxY + 200];

        // Set initial values for group ID management
        if (!workflow.groups) workflow.groups = [];
        let nextGroupId = (workflow.groups.length > 0) ? Math.max(...workflow.groups.map((g: any) => g.id)) + 1 : 1;

        // Recursively process subgraphs (max depth 10)
        // Manage state shared across the entire process (nextNodeId, nextLinkId, etc.) via the context object to prevent duplicates
        const context = {
            nextGroupId,
            nextNodeId: workflow.last_node_id + 1,
            nextLinkId: workflow.last_link_id + 1
        };

        this.processNodesRecursive(workflow, workflow.nodes, startPos, 'DOWN', 0, 10, context);

        // 3. Cleanup results
        // Remove definition information that is no longer needed since all subgraphs have been extracted
        if (workflow.definitions) {
            delete workflow.definitions;
        }
        if (workflow.subgraphs) {
            delete workflow.subgraphs;
        }

        // Update results
        workflow.last_node_id = context.nextNodeId - 1;
        workflow.last_link_id = context.nextLinkId - 1;

        return workflow;
    }

    /**
     * Iterates through the node list, immediately extracting (DFS) if a subgraph is found, and determines the position.
     */
    private static processNodesRecursive(workflow: any, nodeList: any[], startPos: [number, number], direction: 'DOWN' | 'RIGHT', depth: number, maxDepth: number, context: { nextGroupId: number, nextNodeId: number, nextLinkId: number }): [number, number, number, number] {
        if (depth >= maxDepth) {
            console.error('MAX SUBGRAPH DEPTH REACHED! Possible infinite subgraph recursion.');
            return [startPos[0], startPos[1], startPos[0], startPos[1]];
        }

        let currentPos = [...startPos] as [number, number];
        let totalBBox = [startPos[0], startPos[1], startPos[0], startPos[1]];

        // Extract only subgraph nodes from the current list
        const subNodes = [...nodeList.filter(n => this.isSubgraphNode(n, workflow))];

        for (const subNode of subNodes) {
            // 1. Extract subgraph and retrieve internal nodes
            const result = this.extractSubgraphNode(workflow, subNode, currentPos, context);

            // 2. Recursively check if there are other subgraphs among the extracted internal nodes (DFS)
            const innerStartPos: [number, number] = [result.bbox[2] + 150, result.bbox[1]];
            const nestedBBox = this.processNodesRecursive(workflow, result.newNodes, innerStartPos, 'RIGHT', depth + 1, maxDepth, context);

            // 3. Update total Bounding Box
            totalBBox[2] = Math.max(totalBBox[2], result.bbox[2], nestedBBox[2]);
            totalBBox[3] = Math.max(totalBBox[3], result.bbox[3], nestedBBox[3]);

            // 4. Move coordinates for the next subgraph placement
            if (direction === 'DOWN') {
                currentPos[1] = totalBBox[3] + 200;
            } else {
                currentPos[0] = totalBBox[2] + 150;
            }
        }

        return totalBBox as [number, number, number, number];
    }

    /**
     * Extracts a single specific subgraph node and integrates it into the main workflow.
     * @returns List of newly created nodes and total Bounding Box
     */
    private static extractSubgraphNode(workflow: any, subgraphNode: any, basePos: [number, number], context: { nextGroupId: number, nextNodeId: number, nextLinkId: number }): { newNodes: any[], bbox: number[] } {
        const subgraphId = subgraphNode.type;

        const subgraphDef = workflow.subgraphs?.find((sg: any) => sg.id === subgraphId) ||
            workflow.definitions?.subgraphs?.find((sg: any) => sg.id === subgraphId);

        if (!subgraphDef) {
            console.warn(`Subgraph definition not found for node ${subgraphNode.id}`);
            workflow.nodes = workflow.nodes.filter((n: any) => n.id !== subgraphNode.id);
            return { newNodes: [], bbox: [basePos[0], basePos[1], basePos[0], basePos[1]] };
        }

        const subgraphTitle = subgraphNode.title || subgraphDef.name || 'Subgraph';
        const subgraphShortId = subgraphId.substring(0, 3);
        const nodeColor = subgraphNode.color || subgraphNode.bgcolor || "#333";
        const subgraphColor = nodeColor;

        // Create placeholder group in the original position
        workflow.groups.push({
            id: context.nextGroupId++,
            title: `[Unpacked] ${subgraphTitle}`,
            bounding: [
                subgraphNode.pos[0] - 10,
                subgraphNode.pos[1] - 40,
                (subgraphNode.size?.[0] || 210) + 20,
                (subgraphNode.size?.[1] || 80) + 50
            ],
            color: subgraphColor,
            font_size: 20,
            flags: {}
        });

        // Remove original subgraph node (before processing ID duplication)
        workflow.nodes = workflow.nodes.filter((n: any) => n.id !== subgraphNode.id);

        const basePosX = basePos[0];
        const basePosY = basePos[1];
        const porterWidth = 80;
        const porterHeight = 30;
        const columnGap = 100;
        const verticalGap = 40;

        // 1. Calculate relative min/max coordinates of internal nodes
        let internalMinX = Infinity, internalMinY = Infinity;
        let internalMaxX = -Infinity, internalMaxY = -Infinity;
        subgraphDef.nodes.forEach((n: any) => {
            if (n.id === -10 || n.id === -20) return;
            internalMinX = Math.min(internalMinX, n.pos[0]);
            internalMinY = Math.min(internalMinY, n.pos[1]);
            internalMaxX = Math.max(internalMaxX, n.pos[0] + (n.size?.[0] || 200));
            internalMaxY = Math.max(internalMaxY, n.pos[1] + (n.size?.[1] || 100));
        });
        if (internalMinX === Infinity) { internalMinX = 0; internalMinY = 0; internalMaxX = 0; internalMaxY = 0; }

        const nodeIdMap = new Map<number | string, number>();
        const newNodes: any[] = [];

        // 2. Place internal nodes (push to the right to secure space for Porter getNode column)
        const contentOffsetX = basePosX + porterWidth + columnGap;
        const contentOffsetY = basePosY;

        subgraphDef.nodes.forEach((oldNode: any) => {
            if (oldNode.id === -10 || oldNode.id === -20) return;
            const newNodeId = context.nextNodeId++;
            const node = JSON.parse(JSON.stringify(oldNode));
            node.id = newNodeId;
            node.pos = [
                node.pos[0] - internalMinX + contentOffsetX,
                node.pos[1] - internalMinY + contentOffsetY
            ];

            // Initialize link info: Prevent original local link IDs from remaining and colliding with global links
            if (node.inputs) node.inputs.forEach((i: any) => { i.link = null; });
            if (node.outputs) node.outputs.forEach((o: any) => { o.links = []; });

            nodeIdMap.set(oldNode.id, newNodeId);
            workflow.nodes.push(node);
            newNodes.push(node);
        });

        // Actual max X coordinate occupied by internal nodes (for Porter setNode placement)
        const actualContentMaxX = (internalMaxX - internalMinX) + contentOffsetX;
        const actualContentMaxY = (internalMaxY - internalMinY) + contentOffsetY;

        // 3. Initialize BBox (including Porter getNode column)
        let maxX = actualContentMaxX;
        let maxY = actualContentMaxY;

        // 4. Process input slots (enhance porter selectivity)
        if (subgraphDef.inputs) {
            subgraphDef.inputs.forEach((inputDef: any, idx: number) => {
                const parentInputSlot = subgraphNode.inputs?.find((i: any) => i.name === inputDef.name);
                const externalLinkId = parentInputSlot?.link;

                // Process only if there are external links (ignore simple widgets)
                if (externalLinkId === undefined || externalLinkId === null) return;

                const varName = `IN_${inputDef.name}_${subgraphShortId}`;

                // 4-1. External setNode (State: collapsed 80x30)
                const setNodeId = context.nextNodeId++;
                const setNode: any = {
                    id: setNodeId,
                    type: "easy setNode",
                    pos: [subgraphNode.pos[0], subgraphNode.pos[1] + (idx * verticalGap)],
                    size: [porterWidth, porterHeight],
                    flags: { collapsed: true },
                    title: `➡️ [Input] ${varName}`,
                    widgets_values: [varName],
                    inputs: [{ name: inputDef.type, type: inputDef.type, link: externalLinkId }],
                    properties: { ue_properties: { version: "7.0.1" } },
                    color: "#223"
                };
                const linkObj = workflow.links.find((l: any) => (Array.isArray(l) ? l[0] === externalLinkId : l.id === externalLinkId));
                if (linkObj) {
                    if (Array.isArray(linkObj)) { linkObj[3] = setNodeId; linkObj[4] = 0; }
                    else { linkObj.target_id = setNodeId; linkObj.target_slot = 0; }
                }
                workflow.nodes.push(setNode);

                // 4-2. Internal Porter getNode (Vertical alignment: fixed at basePosX)
                const porterGetNodeId = context.nextNodeId++;
                const porterGetNode: any = {
                    id: porterGetNodeId,
                    type: "easy getNode",
                    pos: [basePosX, basePosY + (idx * verticalGap)],
                    size: [porterWidth, porterHeight],
                    flags: { collapsed: true },
                    title: `⬅️ [Porter In] ${varName}`,
                    widgets_values: [varName],
                    outputs: [{ name: "*", type: "*", links: [] }],
                    properties: { ue_properties: { version: "7.0.1" } },
                    color: "#223"
                };
                workflow.nodes.push(porterGetNode);
                newNodes.push(porterGetNode);
                nodeIdMap.set(`input_${idx}`, porterGetNodeId);
                maxY = Math.max(maxY, porterGetNode.pos[1] + 40);
            });
        }

        // 5. Process output slots
        if (subgraphDef.outputs) {
            subgraphDef.outputs.forEach((outputDef: any, idx: number) => {
                const parentOutputSlot = subgraphNode.outputs?.find((o: any) => o.name === outputDef.name);
                const hasExternalLinks = (parentOutputSlot?.links && parentOutputSlot.links.length > 0);
                if (!hasExternalLinks) return;

                const varName = `OUT_${outputDef.name}_${subgraphShortId}`;

                // 5-1. Internal Porter setNode (Vertical alignment: fixed at actualContentMaxX + columnGap)
                const porterSetNodeId = context.nextNodeId++;
                const porterSetNode: any = {
                    id: porterSetNodeId,
                    type: "easy setNode",
                    pos: [actualContentMaxX + columnGap, basePosY + (idx * verticalGap)],
                    size: [porterWidth, porterHeight],
                    flags: { collapsed: true },
                    title: `➡️ [Porter Out] ${varName}`,
                    widgets_values: [varName],
                    inputs: [{ name: outputDef.type, type: outputDef.type, link: null }],
                    properties: { ue_properties: { version: "7.0.1" } },
                    color: "#223"
                };
                workflow.nodes.push(porterSetNode);
                newNodes.push(porterSetNode);
                nodeIdMap.set(`output_${idx}`, porterSetNodeId);
                maxX = Math.max(maxX, porterSetNode.pos[0] + porterWidth);
                maxY = Math.max(maxY, porterSetNode.pos[1] + porterHeight);

                // 5-2. External getNode (Placed at the right boundary of the original subgraph node)
                const getNodeId = context.nextNodeId++;
                const sgWidth = subgraphNode.size?.[0] || 210;
                const getNode: any = {
                    id: getNodeId,
                    type: "easy getNode",
                    pos: [subgraphNode.pos[0] + sgWidth - porterWidth, subgraphNode.pos[1] + (idx * verticalGap)],
                    size: [porterWidth, porterHeight],
                    flags: { collapsed: true },
                    title: `⬅️ [Output] ${varName}`,
                    widgets_values: [varName],
                    outputs: [{ name: "*", type: "*", links: [...parentOutputSlot.links] }],
                    properties: { ue_properties: { version: "7.0.1" } },
                    color: "#223"
                };

                // Update source of all external links connected to this slot to this new getNode
                parentOutputSlot.links.forEach((externalLinkId: any) => {
                    const linkObj = workflow.links.find((l: any) => (Array.isArray(l) ? l[0] === externalLinkId : l.id === externalLinkId));
                    if (linkObj) {
                        if (Array.isArray(linkObj)) { linkObj[1] = getNodeId; linkObj[2] = 0; }
                        else { linkObj.origin_id = getNodeId; linkObj.origin_slot = 0; }
                    }
                });
                workflow.nodes.push(getNode);
            });
        }

        // 6. Complex remapping of internal links
        subgraphDef.links.forEach((link: any) => {
            let oldLinkId, originId, originSlot, targetId, targetSlot, type;
            if (Array.isArray(link)) [oldLinkId, originId, originSlot, targetId, targetSlot, type] = link;
            else { oldLinkId = link.id; originId = link.origin_id; originSlot = link.origin_slot; targetId = link.target_id; targetSlot = link.target_slot; type = link.type; }

            let finalOriginId = nodeIdMap.get(originId);
            let finalOriginSlot = originSlot;
            let finalTargetId = nodeIdMap.get(targetId);
            let finalTargetSlot = targetSlot;

            // Virtual Input (-10) -> Connect Porter getNode
            if (originId === -10) { finalOriginId = nodeIdMap.get(`input_${originSlot}`); finalOriginSlot = 0; }
            // Virtual Output (-20) -> Connect Porter setNode
            if (targetId === -20) { finalTargetId = nodeIdMap.get(`output_${targetSlot}`); finalTargetSlot = 0; }

            // Skip link creation if Porter node was not created (skipped due to no external links)
            if (finalOriginId !== undefined && finalTargetId !== undefined) {
                const newLinkId = context.nextLinkId++;
                const originNode = workflow.nodes.find((n: any) => n.id === finalOriginId);
                const targetNode = workflow.nodes.find((n: any) => n.id === finalTargetId);
                if (originNode && targetNode) {
                    const outSlot = originNode.outputs?.[finalOriginSlot];
                    const inSlot = targetNode.inputs?.[finalTargetSlot];
                    if (outSlot) { outSlot.links = outSlot.links || []; outSlot.links.push(newLinkId); }
                    if (inSlot) inSlot.link = newLinkId;
                    workflow.links.push([newLinkId, finalOriginId, finalOriginSlot, finalTargetId, finalTargetSlot, type]);
                }
            }
        });

        // 7. Set group area (Fully include Porter nodes)
        const groupPadding = 60;
        workflow.groups.push({
            id: context.nextGroupId++,
            title: `Subgraph Area: ${subgraphTitle}`,
            bounding: [
                basePosX - groupPadding,
                basePosY - groupPadding - 20,
                (maxX - basePosX) + (groupPadding * 2),
                (maxY - basePosY) + (groupPadding * 2) + 20
            ],
            color: subgraphColor,
            font_size: 24,
            flags: {}
        });

        return { newNodes, bbox: [basePosX, basePosY, maxX, maxY] };
    }

    /**
     * Checks if the node is a subgraph instance node.
     */
    private static isSubgraphNode(node: IComfyJsonNode, workflow: any): boolean {
        const type = String(node.type);
        // Check UUID format (Subgraph definition ID)
        const isUuid = type.length === 36 && (type.split('-').length === 5);
        if (!isUuid) return false;

        // Check if subgraph definition actually exists (in root or definitions)
        const hasDefInRoot = !!workflow.subgraphs?.some((sg: any) => sg.id === type);
        const hasDefInDefs = !!workflow.definitions?.subgraphs?.some((sg: any) => sg.id === type);

        return hasDefInRoot || hasDefInDefs;
    }
}
