/**
 * ComfyGraph - ComfyUI-specific Graph implementation
 * Provides better compatibility with ComfyUI workflows and custom node instances
 * Replaces both LGraph and ComfyGraph with unified naming
 */

import { ComfyGraphNode } from './ComfyGraphNode'
import { ComfyNodeMetadataService } from '@/infrastructure/api/ComfyNodeMetadataService'
import { initializeMobileUIMetadata, getControlAfterGenerate } from '@/shared/utils/workflowMetadata'
import type { IObjectInfo } from '@/shared/types/comfy/IComfyObjectInfo'
import type { 
  IComfyGraphGroup, 
  IComfyGraphConfig, 
  IComfyJson,
  IComfyGraphLink,
  IComfyGraphNode
} from '@/shared/types/app/base'

export class ComfyGraph {  
  id?: string
  revision?: number
  _nodes: ComfyGraphNode[] = []
  _links: Record<number, IComfyGraphLink> = {}
  _groups: IComfyGraphGroup[] = []
  config: IComfyGraphConfig = {}
  extra: Record<string, any> = {}
  last_node_id = 0
  last_link_id = 0
  _metadata: IObjectInfo | null = null // Store metadata passed from outside
  processor?: any // Reference to ComfyGraphProcessor for accessing objectInfo
  
  clear() {
    this._nodes = []
    this._links = {}
    this._groups = []
    this.config = {}
    this.extra = {}
  }
  
  // Allow setting metadata from outside
  setMetadata(metadata: IObjectInfo) {
    this._metadata = metadata;
  }
  
  async configure(data: IComfyJson) {
    // Load extensions first if available
    // const extensionLoader = getExtensionLoader();
    
    // Initialize mobile UI metadata if not present
    data = initializeMobileUIMetadata(data);
    
    // Store metadata separately for serialization
    (this as any)._mobileUIMetadata = data.mobile_ui_metadata;
    
    // Use provided metadata or fetch new
    let objectInfo: IObjectInfo | null = this._metadata;
    
    if (!objectInfo) {
      // Try to fetch object info for accurate widget creation
      try {
        objectInfo = await ComfyNodeMetadataService.fetchObjectInfo();        
      } catch (error) {
        console.warn('Could not fetch object info, using fallback widget creation:', error);
      }
    }
    
    // Set top-level metadata (following LiteGraph spec)
    this.last_node_id = data.last_node_id;
    this.last_link_id = data.last_link_id;
    
    // Preserve config
    this.config = data.config || {};
    
    // Preserve original top-level metadata in extra (but NOT mobile_ui_metadata)
    this.extra = {
      ...data.extra,
      // Preserve original id and revision
      ...(data.id && { id: data.id }),
      ...(data.revision !== undefined && { revision: data.revision })
      // mobile_ui_metadata is stored at root level only, not in extra
    };
    
    // 🔍 ComfyUI workflow format check - nodes is object, convert to array
    let nodesArray: any[] = [];
    if (data.nodes) {
      if (Array.isArray(data.nodes)) {
        nodesArray = data.nodes;
      } else if (typeof data.nodes === 'object') {
        // ComfyUI workflow JSON format: nodes is object
        nodesArray = Object.values(data.nodes);
      }
    }
    
    // Create and configure nodes (following LiteGraph spec)
    this._nodes = await Promise.all(nodesArray.map(async (nodeData: any) => {
      // Create ComfyGraphNode instance (workflow JSON already preprocessed)
      const node = new ComfyGraphNode(
        nodeData.id,
        nodeData.type,
        nodeData
      );
      
      // Critical: Configure ALL node properties (flags, order, colors, etc.)
      // This mimics LiteGraph's node.configure(nodeData)
      if (nodeData.flags) {
        node.flags = Object.assign({}, nodeData.flags);
      }
      if (nodeData.order !== undefined) {
        node.order = nodeData.order;
      }
      if (nodeData.color !== undefined) {
        (node as any).color = nodeData.color;
      }
      if (nodeData.bgcolor !== undefined) {
        (node as any).bgcolor = nodeData.bgcolor;
      }
      if (nodeData.mode !== undefined) {
        node.mode = nodeData.mode;
      }
      if (nodeData.properties) {
        node.properties = Object.assign({}, node.properties || {}, nodeData.properties);
      }
      
      // Critical: Copy ALL original properties including inputs/outputs
      if (nodeData.inputs) {
        node.inputs = nodeData.inputs.map((input: any) => ({...input}));
      }
      if (nodeData.outputs) {
        node.outputs = nodeData.outputs.map((output: any) => ({...output}));
      }
      
      // Get node metadata if available
      let nodeMetadata = null;
      if (objectInfo && objectInfo[nodeData.type]) {
        nodeMetadata = objectInfo[nodeData.type];
      }
      
      
      // Initialize widgets with metadata if available
      if (nodeData.widgets_values) {
        node.initializeWidgets(nodeData.widgets_values, nodeMetadata, data);
      }
      
      // Apply extension hooks for custom node configurations (DISABLED)
      // extensionLoader.applyConfigureHooks(node, nodeData);
      
      return node;
    }))
    
    
    // Process links
    this._links = {}
    if (data.links) {
      for (const link of data.links) {
        if (Array.isArray(link)) {
          const [id, origin_id, origin_slot, target_id, target_slot, type] = link
          this._links[id] = { id, origin_id, origin_slot, target_id, target_slot, type }
        } else {
          this._links[link.id] = link
        }
      }
    }
    
    // Store groups if present, converting Float32Array to regular arrays
    const processedGroups = (data.groups || []).map((group: any) => {
      if (group.bounding) {
        if (group.bounding instanceof Float32Array || 
            group.bounding instanceof Array ||
            typeof group.bounding === 'object') {
          group.bounding = [
            group.bounding[0] || 0, 
            group.bounding[1] || 0,
            group.bounding[2] || 100,
            group.bounding[3] || 100
          ];
        }
      }
      return group;
    })
    
    // Assign groups to this ComfyGraph instance
    this._groups = processedGroups;
    
    this.last_node_id = data.last_node_id || 0
    this.last_link_id = data.last_link_id || 0
    
    console.log('🔧 ComfyUI Graph configured:', {
      nodesCount: this._nodes.length,
      firstNode: this._nodes[0],
      firstNodePos: this._nodes[0]?.pos,
      firstNodeSize: this._nodes[0]?.size,
      firstNodeHasGetWidgets: typeof this._nodes[0]?.getWidgets === 'function',
      firstNodeClassName: this._nodes[0]?.constructor?.name,
      isPosArray: Array.isArray(this._nodes[0]?.pos),
      isSizeArray: Array.isArray(this._nodes[0]?.size),
      nodeKeys: this._nodes[0] ? Object.keys(this._nodes[0]) : [],
      linksCount: Object.keys(this._links).length
    })
  }
  
  serialize(): IComfyJson {
    const links = Object.values(this._links)
    const serialized = {
      id: this.id || '',
      revision: this.revision || 0,
      last_node_id: this.last_node_id,
      last_link_id: this.last_link_id,
      nodes: this._nodes as any,
      links: links.map(link => ([
        link.id,
        link.origin_id,
        link.origin_slot,
        link.target_id,
        link.target_slot,
        link.type
      ])),
      groups: this._groups || [],
      config: this.config || {},
      extra: this.extra || {},
      version: 0.4
    } as IComfyJson;
    
    // mobile_ui_metadata is stored separately at root level
    // Check if we stored it temporarily during configure
    if ((this as any)._mobileUIMetadata) {
      serialized.mobile_ui_metadata = (this as any)._mobileUIMetadata;
    }
    
    return serialized;
  }
  
  computeExecutionOrder(): ComfyGraphNode[] {
    return this._nodes
  }  
  
  getNodeById(id: number): ComfyGraphNode | undefined {
    return this._nodes.find((n: ComfyGraphNode) => n.id === id)
  }
  
  // Interface compatibility methods
  add(node: ComfyGraphNode): void {
    this._nodes.push(node)
  }
  
  remove(node: ComfyGraphNode): void {
    const index = this._nodes.indexOf(node)
    if (index >= 0) {
      this._nodes.splice(index, 1)
    }
  }
  
  findNodesByClass(classType: string): ComfyGraphNode[] {
    return this._nodes.filter(n => n.comfyClass === classType)
  }
  
  findNodesByType(type: string): ComfyGraphNode[] {
    return this._nodes.filter(n => n.type === type)
  }
  
  connect(origin_id: number, origin_slot: number | string, target_id: number, target_slot: number | string): IComfyGraphLink | null {
    const id = ++this.last_link_id
    const link: IComfyGraphLink = {
      id,
      origin_id,
      origin_slot: typeof origin_slot === 'string' ? parseInt(origin_slot) : origin_slot,
      target_id,
      target_slot: typeof target_slot === 'string' ? parseInt(target_slot) : target_slot,
      type: '*'
    }
    this._links[id] = link
    return link
  }
  
  disconnect(link_id: number): boolean {
    if (this._links[link_id]) {
      delete this._links[link_id]
      return true
    }
    return false
  }
  
  runStep(dt?: number): void {
    // Implementation for graph execution step
  }
  
  start(interval?: number): void {
    // Implementation for starting graph execution
  }
  
  stop(): void {
    // Implementation for stopping graph execution
  }
  // Static factory methods for compatibility
  static createComfyGraph(): ComfyGraph {
    return new ComfyGraph()
  }

  static setMetadata(graph: ComfyGraph, metadata: IObjectInfo): ComfyGraph {
    graph.setMetadata(metadata)
    return graph
  }

  static clearGraph(graph: ComfyGraph): ComfyGraph {
    const newGraph = new ComfyGraph()
    // Preserve metadata from original graph
    if (graph._metadata) {
      newGraph._metadata = graph._metadata
    }
    return newGraph
  }

  static async configureGraph(graph: ComfyGraph, data: IComfyJson): Promise<ComfyGraph> {
    await graph.configure(data)
    return graph
  }

  static serializeGraph(graph: ComfyGraph): any {
    return graph.serialize()
  }
}

// Type alias for compatibility
export type ComfyGraphState = ComfyGraph

export default ComfyGraph