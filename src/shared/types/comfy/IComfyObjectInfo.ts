// ComfyUI Node Metadata Type Definitions

// Parameter value types
export type ParameterType =
  | 'INT'
  | 'FLOAT'
  | 'STRING'
  | 'BOOLEAN'
  | 'COMBO'
  | 'IMAGE'
  | 'LATENT'
  | 'CONDITIONING'
  | 'MODEL'
  | 'VAE'
  | 'CLIP'
  | 'CONTROL_NET'
  | 'MASK'
  | string; // For custom types

// Parameter configuration for different types
export interface INumberConfig {
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  round?: number | boolean;
  control_after_generate?: boolean;
}

export interface IStringConfig {
  default?: string;
  multiline?: boolean;
  dynamicPrompts?: boolean;
  control_after_generate?: boolean;
}

export interface IComboConfig {
  default?: string | number;
  control_after_generate?: boolean;
}

export interface IBooleanConfig {
  default?: boolean;
  label_on?: string;
  label_off?: string;
  control_after_generate?: boolean;
}

export interface IImageConfig {
  default?: string;
  control_after_generate?: boolean;
}

// Generic parameter configuration
export type ParameterConfig =
  | INumberConfig
  | IStringConfig
  | IComboConfig
  | IBooleanConfig
  | IImageConfig
  | Record<string, any>;

// Parameter definition (as returned by /object_info)
export interface IParameterDefinition {
  0: ParameterType | string[]; // Type or array of values for COMBO
  1?: ParameterConfig; // Optional configuration
  2?: string; // Optional description
}

// Node input definitions
export interface INodeInputs {
  required?: Record<string, IParameterDefinition>;
  optional?: Record<string, IParameterDefinition>;
  hidden?: Record<string, IParameterDefinition>;
}

// Node output definition
export interface INodeOutput {
  0: ParameterType; // Output type
  1: string; // Output name
  2?: string; // Optional description
}

// Complete node metadata
export interface IComfyNodeMetadata {
  input: INodeInputs;
  output: ParameterType[] | INodeOutput[];
  output_is_list: boolean[];
  output_name: string[];
  name: string;
  display_name: string;
  description: string;
  category: string;
  output_node?: boolean;
  deprecated?: boolean;
  experimental?: boolean;
  input_order?: {
    required?: string[];
    optional?: string[];
  };
}

// Full object_info response
export interface IComfyObjectInfo {
  [nodeType: string]: IComfyNodeMetadata;
}

// Alternative export name for backward compatibility
export type IObjectInfo = IComfyObjectInfo;

// Link information for connected parameters
export interface ILinkInfo {
  sourceNodeId: number;
  sourceNodeType: string;
  sourceNodeTitle?: string;
  sourceOutputName: string;
  sourceOutputIndex: number;
  linkId: number;
}

// Processed parameter info for UI rendering
export interface IProcessedParameter {
  name: string;
  type: ParameterType;
  config: ParameterConfig;
  description?: string;
  required: boolean;
  value?: any;
  possibleValues?: (string | number)[]; // For COMBO type
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    maxLength?: number;
  };
  linkInfo?: ILinkInfo; // Information about connected link
  widgetIndex?: number; // Index of widget in LGraphNode.widgets array
  controlAfterGenerate?: { // For seed widgets with control_after_generate
    enabled: boolean;
    value: string;
    options: string[];
  };
}

// Node with processed parameters
export interface INodeWithMetadata {
  nodeId: number;
  nodeType: string;
  displayName: string;
  category: string;
  inputParameters: IProcessedParameter[]; // Parameters connected by links
  widgetParameters: IProcessedParameter[]; // Parameters with widget values
  parameters: IProcessedParameter[]; // All parameters (for backward compatibility)
  outputs: {
    type: ParameterType;
    name: string;
    description?: string;
  }[];
}

// Alternative export name for backward compatibility
export type INodeMetadata = IComfyNodeMetadata;

// Metadata service response
export interface IMetadataResponse {
  nodes: INodeWithMetadata[];
  missingTypes: string[]; // Node types that couldn't be found in metadata
  errors: string[];
}