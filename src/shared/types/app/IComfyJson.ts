/**
 * ComfyUI JSON Types
 */

export interface IComfyJson {
  last_node_id: number;
  last_link_id: number;
  nodes: IComfyJsonNode[];
  links: any[];
  groups: any[];
  config: any;
  extra: any;
  version: number;
  id?: string;
  name?: string;
  revision?: number;
  // ComfyMobileUI extension - NOT part of standard ComfyUI workflow
  // This should be excluded when exporting to standard ComfyUI format
  mobile_ui_metadata?: IMobileUIMetadata;

  // Subgraph definitions (ComfyUI backend format)
  subgraphs?: IComfySubgraph[];
}

// ComfyMobileUI-specific metadata that extends workflow functionality
// without breaking ComfyUI standard compatibility
export interface IMobileUIMetadata {
  version: string; // Metadata format version for future migrations
  control_after_generate?: Record<string | number, string>; // nodeId -> control value mapping
  created_by: string; // "ComfyMobileUI"
  [key: string]: any; // Future extensions
}

export interface IComfyJsonNode {
  id: number | string;
  type: string;
  pos: [number, number];
  size: [number, number];
  widgets_values?: any[];
  inputs?: any[];
  outputs?: any[];
  flags?: any;
  order?: number;
  mode?: number;
  title?: string;
  color?: string;
  bgcolor?: string;
  properties?: any;
  _meta?: {
    title?: string;
    [key: string]: any;
  };
}

export interface IComfySubgraph {
  id: string; // UUID or potentially other string ID
  nodes: IComfyJsonNode[];
  links: any[]; // Similar link structure as main workflow
  groups?: any[];
  config?: any;
  extra?: any;
  version?: number;
  name?: string;
  properties?: {
    proxyWidgets?: any[];
    [key: string]: any;
  };
  inputNode: IComfyJsonNode; // Virtual input node (id -10 usually)
  outputNode: IComfyJsonNode; // Virtual output node (id -20 usually)
  inputs: IComfySubgraphInput[]; // External inputs definition
  outputs?: IComfySubgraphOutput[]; // External outputs definition
}

export interface IComfySubgraphOutput {
  id: string;
  name: string;
  type: string;
  linkIds: number[];
  localized_name?: string;
  label?: string;
  pos?: [number, number];
}

export interface IComfySubgraphInput {
  id: string;
  name: string;
  type: string;
  linkIds: number[]; // Links connecting to internal nodes
  label?: string;
  localized_name?: string;
  pos?: [number, number];
}