/**
 * ComfyUI Graph Types
 */

export interface IComfyGraph {
  _nodes: IComfyGraphNode[];
  _links: Record<number, IComfyGraphLink>;
  _groups?: IComfyGraphGroup[];
  last_node_id?: number;
  last_link_id?: number;
  config?: IComfyGraphConfig;
  extra?: any;
  version?: number;
}

export interface IComfyGraphNode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  widgets_values?: any[];
  inputs?: IComfyNodeInputSlot[];
  outputs?: IComfyNodeOutputSlot[];
  flags?: INodeFlags;
  order?: number;
  mode?: number;
  title?: string;
  color?: string;
  bgcolor?: string;
  properties?: INodeProperties;
}

export interface IComfyGraphLink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type?: string;
}

export interface IComfyGraphGroup {
  id: number;
  title: string;
  bounding: [number, number, number, number];
  color: string;
  font_size?: number;
}

export interface IComfyGraphConfig {
  links_ontop?: boolean;
  align_to_grid?: boolean;
}

export interface IComfyNodeInputSlot {
  name: string;
  type: string;
  link: number | null;
  widget?: any;
  label?: string;
  localized_name?: string;
}

export interface IComfyNodeOutputSlot {
  name: string;
  type: string;
  links: number[];
  slot_index?: number;
  label?: string;
  localized_name?: string;
}

export interface INodeFlags {
  collapsed?: boolean;
  pinned?: boolean;
  skip?: boolean;
}

export interface INodeProperties {
  [key: string]: any;
}

export interface IComfyWidget {
  name: string;
  type: string;
  value: any;
  options?: any;
  callback?: Function;
  customWidgetDefinition?: {
    fields: Record<string, any>;
  };
}