import { IComfyGraph, IComfyGraphNode, IComfyGraphLink } from '@/shared/types/app/IComfyGraph';

export interface NodeAnalysis {
    id: number;
    level: number;
    parents: number[];
    children: number[];
    isRoot: boolean;
    isOutput: boolean;
    virtualParents?: number[];
}

export interface WorkflowGroupReport {
    id: string;
    startLevel: number;
    maxLevel: number;
    nodeCount: number;
    nodes: Array<{
        id: number;
        title: string;
        type: string;
    }>;
}

export class WorkflowAnalysisService {
    private nodes: Map<number, IComfyGraphNode> = new Map();
    private links: Map<number, IComfyGraphLink> = new Map();
    private analysis: Map<number, NodeAnalysis> = new Map();

    constructor(private graph: IComfyGraph) {
        this.initialize();
    }

    private initialize() {
        // Index Nodes
        this.graph._nodes.forEach(n => {
            this.nodes.set(n.id, n);
            this.analysis.set(n.id, {
                id: n.id,
                level: -1,
                parents: [],
                children: [],
                isRoot: true,
                isOutput: true
            });
        });

        // Index Links
        // Graph links can be an array or object record? Type def says Record<number, IComfyGraphLink>
        // But let's handle array as well just in case, though Type is Record.
        const links = this.graph._links || [];

        // Handle Record or Array
        const linkList = Array.isArray(links)
            ? links
            : Object.values(links);

        linkList.forEach((link: IComfyGraphLink) => {
            if (!link) return;
            this.links.set(link.id, link);

            const parent = this.analysis.get(link.origin_id);
            const child = this.analysis.get(link.target_id);

            if (parent && child) {
                if (!parent.children.includes(child.id)) {
                    parent.children.push(child.id);
                }
                if (!child.parents.includes(parent.id)) {
                    child.parents.push(parent.id);
                }
                parent.isOutput = false;
                child.isRoot = false;
            }
        });

        this.establishVirtualDependencies();
    }

    private establishVirtualDependencies() {
        const setNodes: Map<string, number> = new Map();
        const getNodes: Array<{ id: number, name: string }> = [];

        const SET_NODE_TYPES = ['SetNode', 'easy setNode'];
        const GET_NODE_TYPES = ['GetNode', 'easy getNode'];

        this.nodes.forEach(node => {
            const title = node.title || "";
            // Check for Setters
            if (SET_NODE_TYPES.includes(node.type)) {
                // Extract name - remove arrow and whitespace if present, or use title as is
                const name = title.replace(/[➡️]/g, "").trim();
                if (name) setNodes.set(name, node.id);
            }
            // Check for Getters
            else if (GET_NODE_TYPES.includes(node.type)) {
                const name = title.replace(/[⬅️]/g, "").trim();
                if (name) getNodes.push({ id: node.id, name });
            }
        });

        getNodes.forEach(getter => {
            const setterId = setNodes.get(getter.name);
            if (setterId) {
                const setterNode = this.analysis.get(setterId)!;
                const getterNode = this.analysis.get(getter.id)!;

                if (!setterNode.children.includes(getterNode.id)) {
                    setterNode.children.push(getterNode.id);
                }
                if (!getterNode.parents.includes(setterNode.id)) {
                    getterNode.parents.push(setterNode.id);
                }

                getterNode.isRoot = false;
                setterNode.isOutput = false;

                getterNode.virtualParents = getterNode.virtualParents || [];
                getterNode.virtualParents.push(setterId);
            }
        });
    }

    public calculateLevels(): void {
        const inDegree = new Map<number, number>();
        this.analysis.forEach(node => {
            inDegree.set(node.id, node.parents.length);
        });

        const processingQueue: number[] = [];
        inDegree.forEach((count, id) => {
            if (count === 0) {
                this.analysis.get(id)!.level = 0;
                processingQueue.push(id);
            }
        });

        let processedCount = 0;

        while (processingQueue.length > 0) {
            const currentId = processingQueue.shift()!;
            const currentNode = this.analysis.get(currentId)!;
            processedCount++;

            currentNode.children.forEach(childId => {
                const childNode = this.analysis.get(childId)!;
                const currentDegree = inDegree.get(childId)! - 1;
                inDegree.set(childId, currentDegree);

                if (currentDegree === 0) {
                    let maxParentLevel = 0;
                    childNode.parents.forEach(pId => {
                        const pLevel = this.analysis.get(pId)!.level;
                        if (pLevel > maxParentLevel) maxParentLevel = pLevel;
                    });
                    childNode.level = maxParentLevel + 1;
                    processingQueue.push(childId);
                }
            });
        }
    }

    public analyzeChains(): Map<number, number[]> {
        const chains = new Map<number, number[]>();
        const nodeToChain = new Map<number, number>();

        this.nodes.forEach(node => {
            const chainId = node.id;
            chains.set(chainId, [node.id]);
            nodeToChain.set(node.id, chainId);
        });

        const sortedNodeIds = Array.from(this.analysis.values())
            .sort((a, b) => a.level - b.level)
            .map(n => n.id);

        for (const nodeId of sortedNodeIds) {
            const node = this.analysis.get(nodeId)!;
            const uniqueChildren = [...new Set(node.children)];

            if (uniqueChildren.length !== 1) continue;

            const childId = uniqueChildren[0];
            const childNode = this.analysis.get(childId)!;

            // Backward Merge Strategy
            let dominantParentId = -1;
            let maxParentLevel = -1;

            if (node.parents.length === 0) continue;

            node.parents.forEach(pId => {
                const p = this.analysis.get(pId)!;
                if (p.level > maxParentLevel) {
                    maxParentLevel = p.level;
                    dominantParentId = pId;
                }
            });

            if (dominantParentId === -1) continue;

            const parentNode = this.analysis.get(dominantParentId)!;

            if (node.virtualParents && node.virtualParents.includes(dominantParentId)) {
                continue;
            }

            const uniqueParentOutputs = [...new Set(parentNode.children)];

            if (uniqueParentOutputs.length === 1 && uniqueParentOutputs[0] === nodeId) {
                const parentChainId = nodeToChain.get(dominantParentId)!;
                const myChainId = nodeToChain.get(nodeId)!;

                if (parentChainId !== myChainId) {
                    const parentChain = chains.get(parentChainId)!;
                    const myChain = chains.get(myChainId)!;
                    parentChain.push(...myChain);
                    myChain.forEach(id => nodeToChain.set(id, parentChainId));
                    chains.delete(myChainId);
                }
            } else {
                const originalNode = this.nodes.get(node.id)!;
                if (originalNode.type.includes("setNode") || (originalNode.title && originalNode.title.includes("➡️"))) {
                    const parentChainId = nodeToChain.get(dominantParentId)!;
                    const myChainId = nodeToChain.get(nodeId)!;
                    if (parentChainId !== myChainId) {
                        const parentChain = chains.get(parentChainId)!;
                        const myChain = chains.get(myChainId)!;

                        parentChain.push(...myChain);
                        myChain.forEach(id => nodeToChain.set(id, parentChainId));
                        chains.delete(myChainId);
                    }
                }
            }
        }

        let changed = true;
        while (changed) {
            changed = false;
            const currentChainIds = Array.from(chains.keys());

            for (const chainId of currentChainIds) {
                if (!chains.has(chainId)) continue;
                const chainNodes = chains.get(chainId)!;
                const chainOutputs = new Set<number>();

                chainNodes.forEach(nid => {
                    const n = this.analysis.get(nid)!;
                    n.children.forEach(cid => {
                        if (nodeToChain.get(cid) !== chainId) {
                            chainOutputs.add(cid);
                        }
                    });
                });

                if (chainOutputs.size === 0) continue;

                const targetChainCounts = new Map<number, number>();
                chainOutputs.forEach(cid => {
                    const tChain = nodeToChain.get(cid);
                    if (tChain !== undefined) {
                        targetChainCounts.set(tChain, (targetChainCounts.get(tChain) || 0) + 1);
                    }
                });

                let winnerChainId = -1;
                let maxCount = -1;
                targetChainCounts.forEach((count, tId) => {
                    if (count > maxCount) {
                        maxCount = count;
                        winnerChainId = tId;
                    }
                });

                if (winnerChainId === -1) continue;

                const targetChainNodes = chains.get(winnerChainId)!;
                const hasVirtualbarrier = targetChainNodes.some(nid => {
                    const n = this.analysis.get(nid)!;
                    return n.virtualParents && n.virtualParents.some(vp => chainNodes.includes(vp));
                });

                if (hasVirtualbarrier) continue;

                const targetChain = chains.get(winnerChainId)!;
                targetChain.unshift(...chainNodes);

                chainNodes.forEach(id => nodeToChain.set(id, winnerChainId));
                chains.delete(chainId);
                changed = true;
            }
        }

        return chains;
    }

    public getReport(): WorkflowGroupReport[] {
        this.calculateLevels();
        const chainMap = this.analyzeChains();

        let groupIdCounter = 1;
        const sortedChains = Array.from(chainMap.values()).map(nodeIds => {
            let minLevel = Infinity;
            let maxLevel = -Infinity;

            const nodes = nodeIds.map(id => {
                const n = this.nodes.get(id)!;
                const analysis = this.analysis.get(id)!;

                if (analysis.level < minLevel) minLevel = analysis.level;
                if (analysis.level > maxLevel) maxLevel = analysis.level;

                return {
                    id: n.id,
                    title: n.title || n.type,
                    type: n.type
                };
            });

            return {
                id: `group-${groupIdCounter++}`,
                startLevel: minLevel,
                maxLevel: maxLevel,
                nodeCount: nodes.length,
                nodes
            };
        });

        sortedChains.sort((a, b) => {
            if (a.maxLevel !== b.maxLevel) {
                return a.maxLevel - b.maxLevel;
            }
            if (a.startLevel !== b.startLevel) {
                return a.startLevel - b.startLevel;
            }
            return a.nodeCount - b.nodeCount;
        });

        return sortedChains;
    }
}
