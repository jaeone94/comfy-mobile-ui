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
  revision?: number;
  // ComfyMobileUI extension - NOT part of standard ComfyUI workflow
  // This should be excluded when exporting to standard ComfyUI format
  mobile_ui_metadata?: IMobileUIMetadata;
}

// ComfyMobileUI-specific metadata that extends workflow functionality
// without breaking ComfyUI standard compatibility
export interface IMobileUIMetadata {
  version: string; // Metadata format version for future migrations
  control_after_generate?: Record<number, string>; // nodeId -> control value mapping
  created_by: string; // "ComfyMobileUI"
  [key: string]: any; // Future extensions
}

export interface IComfyJsonNode {
  id: number;
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