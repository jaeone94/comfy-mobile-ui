/**
 * ComfyGraphNode - ComfyUI-specific graph node implementation
 * Provides complete node functionality for ComfyUI workflows
 */

import type {
  IComfyGraph,
  IComfyGraphNode,
  IComfyWidget,
  IComfySubgraph,
  IComfyNodeInputSlot,
  IComfyNodeOutputSlot,
  INodeFlags,
  INodeProperties,
} from '@/shared/types/app/base'
import type { INodeMetadata } from '@/shared/types/comfy/IComfyMetadata'
import type { NodeConnection, NodeInput, NodeOutput } from '@/shared/types/app/INodeConnection'
import { GraphEventTypes, emit } from './GraphEventSystem'
import { NodeMode } from '@/shared/types/app/enums'
import { graphChangeLogger, createWidgetsValuesProxy } from '@/utils/GraphChangeLogger'
import { createSpecialNodeWidgets, hasSpecialNodeWidgetProcessor } from '@/core/services/SpecialNodeWidgetProcessor'
import WorkflowMappingService from '@/core/services/WorkflowMappingService'

export class ComfyGraphNode implements IComfyGraphNode {
  // Core properties (ComfyGraph compatibility)
  id: number
  type: string
  title?: string
  pos: [number, number]
  size: [number, number]
  flags: INodeFlags
  mode: NodeMode
  order: number
  //graph: IComfyGraph | undefined

  // Visual properties
  color?: string
  bgcolor?: string
  _original_bgcolor?: string

  // Input/Output slots
  inputs: IComfyNodeInputSlot[]
  outputs: IComfyNodeOutputSlot[]

  // ComfyUI-specific properties
  comfyClass: string
  widgets_values?: any
  properties: INodeProperties
  serialize_widgets: boolean // Controls whether widgets should be serialized
  nodeData?: INodeMetadata | undefined // Runtime metadata from server /object_info
  subgraphDefinition?: IComfySubgraph | undefined // Subgraph definition if this node is a subgraph

  // Internal state
  private _widgets: IComfyWidget[]
  private _isExecuting: boolean = false
  private _lastExecutionTime: number = 0
  private _executionId: string | null = null

  constructor(
    id: number,
    type: string,
    comfyNode?: Partial<IComfyGraphNode>
  ) {
    // Initialize core properties
    this.id = id
    this.type = type
    this.comfyClass = (comfyNode as any)?.class_type || type
    // ✅ Only set title if explicitly provided in original data - DO NOT default to type/class
    if (comfyNode?.title !== undefined) {
      this.title = comfyNode.title
    }
    // If no title provided, leave it undefined for perfect ComfyUI compatibility

    // Position and size
    this.pos = [
      comfyNode?.pos?.[0] || 0,
      comfyNode?.pos?.[1] || 0
    ] as [number, number]
    this.size = [
      comfyNode?.size?.[0] || 200,
      comfyNode?.size?.[1] || 100
    ] as [number, number]

    // State
    this.flags = {} as INodeFlags
    this.mode = NodeMode.ALWAYS
    this.order = 0
    //this.graph = undefined

    // Initialize slots
    this.inputs = []
    this.outputs = []

    // ComfyUI properties - preserve exact original structure
    // ✅ Only set widgets_values if it existed in original data - DO NOT default to []
    if (comfyNode && 'widgets_values' in comfyNode) {
      // 🔧 GraphChangeLogger: Wrap widgets_values with logging proxy
      this.widgets_values = createWidgetsValuesProxy(
        comfyNode.widgets_values,
        this.id,
        this.type
      );
      this.serialize_widgets = true
    } else {
      // Leave widgets_values undefined if not in original data
      this.serialize_widgets = false
    }
    this.properties = (comfyNode?.properties ? { ...comfyNode.properties } : {}) as INodeProperties

    // Internal state
    this._widgets = []

    // Initialize from ComfyNode data
    if (comfyNode) {
      this.initializeFromComfyNode(comfyNode)
    }
  }

  // ============================================================================
  // Initialization Methods
  // ============================================================================

  /**
   * Initialize node from ComfyUI node data
   */
  private initializeFromComfyNode(comfyNode: Partial<IComfyGraphNode>): void {
    // Initialize inputs
    if (comfyNode.inputs) {
      this.inputs = comfyNode.inputs.map((input: IComfyNodeInputSlot) => ({
        name: input.name,
        type: input.type,
        link: input.link || null,
        widget: input.widget || null,
        label: input.label,
        localized_name: input.localized_name
      }))
    }

    // Initialize outputs
    if (comfyNode.outputs) {
      this.outputs = comfyNode.outputs.map((output: IComfyNodeOutputSlot) => ({
        name: output.name,
        type: output.type,
        links: output.links || [],
        label: output.label,
        localized_name: output.localized_name
      }))
    }

    // Initialize widgets
    if (comfyNode.widgets_values && comfyNode.widgets_values.length > 0) {
      this.initializeWidgets(comfyNode.widgets_values)
    }

    // Set node mode if specified
    if (typeof comfyNode.mode === 'number') {
      this.mode = comfyNode.mode as NodeMode
    }
  }

  /**
   * Initialize widgets from workflow values
   * @param widgetValues - Workflow widget values (array or object)
   * @param nodeMetadata - Optional server metadata for precise widget creation
   * @param workflowMetadata - Optional mobile UI metadata for control_after_generate values
   */
  initializeWidgets(widgetValues: any[] | Record<string, any>, nodeMetadata?: any, workflowMetadata?: any): void {
    this._widgets = []

    // Initialize widgets_values proxy
    if (widgetValues && !this.widgets_values) {
      this.widgets_values = createWidgetsValuesProxy(widgetValues, this.id, this.type);
    }

    // Server metadata available, use it
    if (nodeMetadata?.input?.required) {
      this.initializeFromServerMetadata(widgetValues, nodeMetadata, workflowMetadata);
      return;
    }

    // No server metadata, handle nodes without it
    this.handleNoServerMetadata(widgetValues, nodeMetadata, workflowMetadata);
  }

  /**
   * Initialize widgets using server metadata (most accurate method)
   */
  private initializeFromServerMetadata(widgetValues: any[] | Record<string, any>, nodeMetadata: any, workflowMetadata?: any): void {
    const requiredInputs = nodeMetadata.input.required;
    let valueIndex = 0;

    // Find current node's inputs from workflow metadata (includes preprocessed custom fields)
    const nodeInputs = workflowMetadata?.nodes?.find((n: any) => n.id === this.id)?.inputs || [];

    // Build combined input processing map
    const allInputsToProcess = this.buildInputProcessingMap(requiredInputs, nodeInputs);

    // Process all inputs (server + custom) in correct order
    for (const [inputName, inputData] of allInputsToProcess) {
      const { source, inputSpec, workflowInput } = inputData;

      // we should skip if workflowInput exists but has no widget property (connection slot)
      if (workflowInput && !workflowInput.widget) {
        console.log(`Skipping "${inputName}" - no widget property (connection slot)`);
        continue;
      }

      // FIX: Check if this input is already a connected input slot on the node instance
      // This prevents "re-widgetizing" converted inputs during refresh/re-initialization
      const isExistingInput = this.inputs.some(i => i.name === inputName && !i.widget);
      if (isExistingInput) {
        console.log(`Skipping "${inputName}" - existing input slot detected`);
        continue;
      }

      console.log(`Creating widget for "${inputName}" (${source}) with widget:`, workflowInput?.widget);

      // Process input and create widget
      const result = this.processInput(inputName, inputSpec, widgetValues, valueIndex, workflowInput);
      if (!result) continue;

      const { widget, widgetType } = result;

      // Create widget using custom metadata if available
      console.log(`Created widget for "${inputName}":`, {
        type: widgetType,
        value: widget.value,
        isCustomType: !!WorkflowMappingService.getWidgetDefinitionSync(widgetType)
      });

      const createdWidget = this.createWidget(widget);
      this._widgets.push(createdWidget);

      // Handle dynamic widgets and control_after_generate
      valueIndex = this.handleSpecialWidgetCases(inputName, inputSpec[1], widget, widgetValues, valueIndex, workflowMetadata);

      valueIndex++;
    }

    // Process optional inputs
    this.processOptionalInputs(nodeMetadata.input.optional, widgetValues, valueIndex, nodeInputs);
  }

  /**
   * Build combined map of server inputs and custom fields
   */
  private buildInputProcessingMap(requiredInputs: any, nodeInputs: any[]): Map<string, any> {
    const allInputsToProcess = new Map();

    // Add server metadata inputs
    Object.entries(requiredInputs).forEach(([inputName, inputSpec]) => {
      allInputsToProcess.set(inputName, {
        source: 'server',
        inputSpec,
        workflowInput: nodeInputs.find((inp: any) => inp.name === inputName)
      });
    });

    // Add/override custom fields (priority over server metadata)
    nodeInputs.forEach((input: any) => {
      if (input.widget?.isCustomField) {
        console.log(`🎯 [${this.type}] Custom field "${input.name}" overriding ${allInputsToProcess.has(input.name) ? 'server metadata' : 'adding new field'}`);
        allInputsToProcess.set(input.name, {
          source: 'custom',
          inputSpec: [input.type, {}], // Custom field inputSpec
          workflowInput: input
        });
      }
    });

    return allInputsToProcess;
  }

  /**
   * Process a single input and create widget
   */
  private processInput(inputName: string, inputSpec: any, widgetValues: any[] | Record<string, any>, valueIndex: number, workflowInput?: any): { widget: IComfyWidget, widgetType: string } | null {
    const [inputType, inputConfig] = inputSpec as any;

    // For custom fields, use the widget type from workflowInput (overrides server metadata)
    let widgetType: string;
    if (workflowInput?.widget?.isCustomField && workflowInput?.type) {
      widgetType = workflowInput.type;
      console.log(`  🎨 Custom field "${inputName}" using custom widget type: ${widgetType}`);
    } else {
      // Standard server metadata type determination
      if (Array.isArray(inputType) || inputType === 'COMBO') {
        widgetType = 'COMBO';
      } else {
        // Use ComfyUI native types directly, with semantic enhancement for seed
        switch (inputType.toUpperCase()) {
          case 'INT':
            // Keep semantic enhancement for seed detection
            widgetType = (inputName === 'seed' || inputName === 'noise_seed') ? 'SEED' : 'INT';
            break;
          default:
            widgetType = inputType.toUpperCase();
            break;
        }
      }
    }

    // Create widget
    const widget: IComfyWidget = {
      name: inputName,
      type: widgetType,
      value: Array.isArray(widgetValues) ? widgetValues[valueIndex] : widgetValues[inputName],
      options: {
        ...inputConfig,
        values: Array.isArray(inputType) ? inputType : (inputConfig?.options || inputConfig?.values)
      }
    };

    return { widget, widgetType };
  }

  /**
   * Handle special widget cases: dynamic widgets and control_after_generate
   */
  private handleSpecialWidgetCases(inputName: string, inputConfig: any, widget: IComfyWidget, widgetValues: any[] | Record<string, any>, valueIndex: number, workflowMetadata?: any): number {
    let currentIndex = valueIndex;

    // Handle dynamic widgets based on format selection (e.g., VHS_VideoCombine)
    currentIndex = this.createDynamicWidgets(inputConfig, widget, widgetValues, currentIndex);

    // Handle control_after_generate for seed widgets
    if (inputName === 'seed' || inputName === 'noise_seed') {
      currentIndex = this.createControlAfterGenerateWidget(widgetValues, currentIndex + 1, workflowMetadata);
    }

    return currentIndex;
  }

  /**
   * Create dynamic widgets based on format configuration
   */
  private createDynamicWidgets(inputConfig: any, parentWidget: IComfyWidget, widgetValues: any[] | Record<string, any>, valueIndex: number): number {
    if (!inputConfig?.formats || typeof parentWidget.value !== 'string') {
      return valueIndex;
    }

    const formatKey = parentWidget.value + '.json';
    const dynamicFields = inputConfig.formats[formatKey];

    if (!dynamicFields || !Array.isArray(dynamicFields)) {
      return valueIndex;
    }

    let currentIndex = valueIndex;

    for (const [fieldName, fieldType, fieldConfig] of dynamicFields) {
      let dynamicWidgetType: string;

      if (Array.isArray(fieldType) || fieldType === 'COMBO') {
        dynamicWidgetType = 'COMBO';
      } else {
        // Use ComfyUI native types directly, with semantic enhancement for seed
        switch (fieldType.toUpperCase()) {
          case 'INT':
            // Keep semantic enhancement for seed detection
            dynamicWidgetType = (fieldName === 'seed' || fieldName === 'noise_seed') ? 'SEED' : 'INT';
            break;
          default:
            dynamicWidgetType = fieldType.toUpperCase();
            break;
        }
      }

      const dynamicWidget: IComfyWidget = {
        name: fieldName,
        type: dynamicWidgetType,
        value: Array.isArray(widgetValues) ? widgetValues[currentIndex] : widgetValues[fieldName],
        options: {
          ...fieldConfig,
          values: Array.isArray(fieldType) ? fieldType : (fieldConfig?.options || fieldConfig?.values)
        }
      };

      // Create dynamic widget with custom metadata if applicable
      const createdDynamicWidget = this.createWidget(dynamicWidget);
      this._widgets.push(createdDynamicWidget);
      currentIndex++;
    }

    return currentIndex;
  }

  /**
   * Create control_after_generate widget for seed inputs
   */
  private createControlAfterGenerateWidget(widgetValues: any[] | Record<string, any>, valueIndex: number, workflowMetadata?: any): number {
    // Add control_after_generate widget after seed
    // CRITICAL: Use metadata value first, then fallback to widget_values, then default
    let controlValue = 'fixed'; // Default fallback

    // First priority: Mobile UI metadata
    if (workflowMetadata?.mobile_ui_metadata?.control_after_generate?.[this.id]) {
      controlValue = workflowMetadata.mobile_ui_metadata.control_after_generate[this.id];
    }
    // Second priority: widget_values array (for backward compatibility)
    else if (Array.isArray(widgetValues) && valueIndex < widgetValues.length) {
      const widgetValue = widgetValues[valueIndex];
      if (typeof widgetValue === 'string' &&
        ['fixed', 'increment', 'decrement', 'randomize'].includes(widgetValue)) {
        controlValue = widgetValue;
      }
    }

    const controlWidget: IComfyWidget = {
      name: 'control_after_generate',
      type: 'COMBO',
      value: controlValue,
      options: {
        values: ['fixed', 'increment', 'decrement', 'randomize']
      }
    };

    // Create control widget with custom metadata if applicable
    const createdControlWidget = this.createWidget(controlWidget);
    this._widgets.push(createdControlWidget);

    return valueIndex;
  }

  /**
   * Process optional inputs from server metadata
   */
  private processOptionalInputs(optionalInputs: any, widgetValues: any[] | Record<string, any>, startIndex: number, nodeInputs: any[]): void {
    if (!optionalInputs) return;

    let valueIndex = startIndex;

    for (const [inputName, inputSpec] of Object.entries(optionalInputs)) {
      // Find corresponding workflow input to check if it has widget property
      const workflowInput = nodeInputs.find((inp: any) => inp.name === inputName);

      console.log(`🔍 [${this.type}] Processing optional input "${inputName}": workflowInput =`, workflowInput);

      // Skip if this input doesn't have widget property (it's a connection slot)
      if (!workflowInput?.widget) {
        console.log(`Skipping optional input "${inputName}" - no widget property (connection slot)`);
        continue;
      }

      console.log(`Creating widget for optional input "${inputName}" with widget:`, workflowInput.widget);

      const result = this.processInput(inputName, inputSpec, widgetValues, valueIndex);
      if (!result) continue;

      const { widget } = result;

      // Create optional input widget with custom metadata if applicable
      const createdWidget = this.createWidget(widget);
      this._widgets.push(createdWidget);
      valueIndex++;
    }
  }

  /**
   * Process nodes without server metadata
   */
  private handleNoServerMetadata(widgetValues: any[] | Record<string, any>, nodeMetadata?: any, workflowMetadata?: any): void {
    // Process custom fields for nodes without server metadata
    console.log(`🔍 [${this.type}] No server metadata - processing custom fields...`);
    const nodeInputs = workflowMetadata?.nodes?.find((n: any) => n.id === this.id)?.inputs || [];
    const widgetValuesArray = Array.isArray(widgetValues) ? widgetValues : undefined;
    this.processCustomFields(nodeInputs, undefined, widgetValuesArray);

    // Try special node widget processor for nodes without server metadata
    if (hasSpecialNodeWidgetProcessor(this.type) && Array.isArray(widgetValues)) {
      const specialWidgets = createSpecialNodeWidgets(this.type, widgetValues, nodeMetadata, workflowMetadata);
      if (specialWidgets && specialWidgets.length > 0) {
        // Create special widgets using custom metadata
        const createdSpecialWidgets = specialWidgets.map(widget => this.createWidget(widget));

        // Add special widgets to existing custom field widgets
        this._widgets.push(...createdSpecialWidgets);
        return;
      }
    }

    // If custom field widgets were created, complete
    if (this._widgets.length > 0) {
      console.log(`✅ [${this.type}] Created ${this._widgets.length} custom field widgets`);
      return;
    }
  }



  // ============================================================================
  // Core Node Methods (LiteGraph compatibility)
  // ============================================================================

  /**
   * Clone this node
   */
  clone(): IComfyGraphNode {
    const cloned = new ComfyGraphNode(
      this.id,
      this.type,
      {
        title: this.title,
        pos: [...this.pos],
        size: [...this.size],
        inputs: this.inputs.map(input => ({ ...input })),
        outputs: this.outputs.map(output => ({ ...output })),
        widgets_values: [...this.widgets_values],
        properties: { ...this.properties },
        mode: this.mode
      }
    )

    cloned.flags = this.flags
    cloned.order = this.order

    return cloned
  }

  /**
   * Serialize node to JSON (ComfyUI LiteGraph format)
   */
  serialize(): any {
    const data: any = {
      id: this.id,
      type: this.type,
      pos: [...this.pos],
      size: [...this.size],
      flags: this.flags || {},
      order: this.order,
      mode: this.mode
    }

    // Add optional fields
    if (this.title && this.title !== this.type) {
      data.title = this.title
    }

    // IMPORTANT: ComfyUI uses undefined for missing inputs/outputs, not empty arrays
    // Only add if they exist and have content
    if (this.inputs && this.inputs.length > 0) {
      data.inputs = this.inputs.map(input => ({ ...input }))
    }
    // Don't add empty inputs array

    if (this.outputs && this.outputs.length > 0) {
      data.outputs = this.outputs.map(output => ({ ...output }))
    }
    // Don't add empty outputs array

    if (this.widgets_values && this.widgets_values.length > 0) {
      data.widgets_values = [...this.widgets_values]
    }

    if (this.properties && Object.keys(this.properties).length > 0) {
      data.properties = { ...this.properties }
    }

    // Add color/bgcolor if present (these are stored as direct properties on the node)
    if ((this as any).color !== undefined) {
      data.color = (this as any).color
    }
    if ((this as any).bgcolor !== undefined) {
      data.bgcolor = (this as any).bgcolor
    }

    // IMPORTANT: Explicitly exclude nodeData from serialization
    // nodeData is metadata used only at runtime, not for workflow persistence
    // Note: We don't copy all properties to avoid including nodeData

    return data
  }

  /**
   * Configure node from serialized data
   */
  configure(data: any): void {
    if (data.id !== undefined) this.id = data.id
    if (data.type) this.type = data.type
    if (data.class_type) this.comfyClass = data.class_type
    if (data.title) this.title = data.title
    if (data.pos && Array.isArray(data.pos)) this.pos = [data.pos[0] || 0, data.pos[1] || 0]
    if (data.size && Array.isArray(data.size)) this.size = [data.size[0] || 140, data.size[1] || 80]
    if (data.flags !== undefined) this.flags = data.flags
    if (data.mode !== undefined) this.mode = data.mode
    if (data.order !== undefined) this.order = data.order

    // Handle inputs - some nodes may not have inputs
    this.inputs = data.inputs ? data.inputs.map((input: any) => ({ ...input })) : []

    // Handle outputs - some nodes (like SaveImage) may not have outputs
    this.outputs = data.outputs ? data.outputs.map((output: any) => ({ ...output })) : []

    if (data.widgets_values) {
      this.widgets_values = [...data.widgets_values]
      this.initializeWidgets(this.widgets_values)
    }
    if (data.properties) this.properties = { ...data.properties }

    // Emit configuration event
    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      newValue: data
    } as any)
  }

  // ============================================================================
  // Input/Output Management
  // ============================================================================

  /**
   * Add input slot to node
   */
  addInput(name: string, type: string | number, _extraInfo?: any): IComfyNodeInputSlot {
    const input: IComfyNodeInputSlot = {
      name,
      type: String(type),
      link: null
    }

    this.inputs.push(input)

    // Emit event
    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      previousValue: null,
      newValue: input
    } as any)

    return input
  }

  /**
   * Add output slot to node
   */
  addOutput(name: string, type: string | number, _extraInfo?: any): IComfyNodeOutputSlot {
    const output: IComfyNodeOutputSlot = {
      name,
      type: String(type),
      links: []
    }

    this.outputs.push(output)

    // Emit event
    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      previousValue: null,
      newValue: output
    } as any)

    return output
  }

  //getInputLink: (slot) => slot === 0 ? graph.links[1] : null
  getInputLink(slot: number): number | null {
    return this.inputs[slot].link
  }


  /**
   * Remove input by index
   */
  removeInput(index: number): boolean {
    if (index >= 0 && index < this.inputs.length) {
      const removed = this.inputs.splice(index, 1)[0]

      // Emit event
      emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
        node: this,
        previousValue: removed,
        newValue: null
      } as any)

      return true
    }
    return false
  }

  /**
   * Remove output by index
   */
  removeOutput(index: number): boolean {
    if (index >= 0 && index < this.outputs.length) {
      const removed = this.outputs.splice(index, 1)[0]

      // Emit event
      emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
        node: this,
        previousValue: removed,
        newValue: null
      } as any)

      return true
    }
    return false
  }

  /**
   * Get input by name or index
   */
  getInputData(slotIndex: number): any {
    if (slotIndex >= 0 && slotIndex < this.inputs.length) {
      const input = this.inputs[slotIndex]

      // If input has a widget, return widget value  
      if ((input as any).widget && this._widgets[slotIndex]) {
        return this._widgets[slotIndex].value
      }

      // If input has a link, would normally get from connected node
      // For now, return undefined (would be implemented in graph execution)
      return undefined
    }
    return undefined
  }

  /**
   * Set output data
   */
  setOutputData(slotIndex: number, data: any): void {
    if (slotIndex >= 0 && slotIndex < this.outputs.length) {
      // Store output data (would be used in graph execution)
      this.properties[`output_${slotIndex}`] = data
    }
  }

  // ============================================================================
  // Widget Management
  // ============================================================================

  /**
   * Get all widgets
   */
  getWidgets(): IComfyWidget[] {
    return this._widgets ? [...this._widgets] : []
  }

  /**
   * Get widgets (getter property for compatibility)
   */
  get widgets(): IComfyWidget[] {
    return this._widgets ? [...this._widgets] : []
  }

  /**
   * Set widgets (setter property for compatibility)
   */
  set widgets(value: IComfyWidget[]) {
    this._widgets = value || []
  }

  /**
   * Get widget by name
   */
  getWidget(name: string): IComfyWidget | null {
    return this._widgets.find(w => w.name === name) || null
  }

  /**
   * Set widget value
   */
  setWidgetValue(nameOrIndex: string | number, value: any): boolean {
    let widget: IComfyWidget | undefined
    let widgetIndex: number

    if (typeof nameOrIndex === 'string') {
      widgetIndex = this._widgets.findIndex(w => w.name === nameOrIndex)
      widget = this._widgets[widgetIndex]
    } else {
      widgetIndex = nameOrIndex
      widget = this._widgets[widgetIndex]
    }

    if (!widget || widgetIndex === -1) {
      return false
    }

    const previousValue = widget.value
    widget.value = value

    // 🔧 GraphChangeLogger: Log widget value change via setter method
    graphChangeLogger.logChange({
      nodeId: this.id,
      nodeType: this.type,
      changeType: 'setter_method',
      path: `widgets_values[${widgetIndex}] (${widget.name})`,
      oldValue: previousValue,
      newValue: value,
      source: 'ComfyGraphNode.setWidgetValue'
    });

    // Update widgets_values array (logging handled by proxy)
    if (widgetIndex < this.widgets_values.length) {
      this.widgets_values[widgetIndex] = value
    }

    // Emit widget value changed event
    emit(GraphEventTypes.WIDGET_VALUE_CHANGED, {
      node: this as any, // Cast to ComfyNode interface
      widgetName: widget.name,
      previousValue,
      newValue: value,
      widget
    } as any)

    return true
  }

  /**
   * Process custom fields that weren't handled by server metadata
   */
  private processCustomFields(nodeInputs: any[], requiredInputs?: any, widgetValues?: any[]): void {
    const customFields = nodeInputs.filter((input: any) =>
      input.widget?.isCustomField &&
      input.type &&
      (!requiredInputs || !requiredInputs[input.name]) // Not in server metadata
    );

    if (customFields.length > 0) {
      customFields.forEach((input: any) => {
        // Find the widget value for this custom field
        // Custom fields are added to the end of widgets_values array during preprocessing
        const customFieldIndex = this.findCustomFieldValueIndex(input.name, nodeInputs, widgetValues);
        const widgetValue = Array.isArray(widgetValues) && customFieldIndex >= 0
          ? widgetValues[customFieldIndex]
          : null;

        console.log(`Custom field "${input.name}" value index: ${customFieldIndex}, value:`, widgetValue);

        const widget: IComfyWidget = {
          name: input.name,
          type: input.type,
          value: widgetValue,
          options: {}
        };

        console.log(`Creating custom widget for "${input.name}" (${input.type}) with value:`, widgetValue);
        const createdWidget = this.createWidget(widget);
        this._widgets.push(createdWidget);
      });

      console.log(`[${this.type}] Total widgets: ${this._widgets.length}`);
    }
  }

  /**
   * Find the index in widgets_values array for a custom field
   */
  private findCustomFieldValueIndex(fieldName: string, nodeInputs: any[], widgetValues?: any[]): number {
    if (!Array.isArray(widgetValues)) return -1;

    // Count how many widget inputs come before this custom field
    let widgetInputCount = 0;
    for (const input of nodeInputs) {
      if (input.name === fieldName) {
        break;
      }
      // Only count inputs that have widget property (not connection slots)
      if (input.widget) {
        widgetInputCount++;
      }
    }

    return widgetInputCount < widgetValues.length ? widgetInputCount : -1;
  }

  /**
   * Create widget with custom widget type definition metadata if applicable
   */
  private createWidget(widget: IComfyWidget): IComfyWidget {
    // Check if this is a custom widget type
    const customDefinition = WorkflowMappingService.getWidgetDefinitionSync(widget.type);

    console.log(`createWidget: "${widget.name}" (${widget.type})`, {
      hasCustomDefinition: !!customDefinition,
      widgetValue: widget.value,
      widgetOptions: Object.keys(widget.options || {})
    });

    if (customDefinition) {
      console.log(`Enhancing widget "${widget.name}" with custom metadata for type "${widget.type}"`);

      // Inject widget definition metadata
      const enhancedWidget = {
        ...widget,
        customWidgetDefinition: customDefinition,
        options: {
          ...widget.options,
          // Add fields from widget definition
          fields: customDefinition.fields || [],
          tooltip: customDefinition.tooltip,
          // Preserve original options
          ...widget.options
        }
      };

      console.log(`Enhanced widget result:`, {
        name: enhancedWidget.name,
        type: enhancedWidget.type,
        hasCustomDefinition: true,
        fieldsCount: enhancedWidget.options?.fields?.length || 0
      });

      return enhancedWidget;
    }

    console.log(`Standard widget (no enhancement needed)`);
    return widget;
  }

  /**
   * Add widget to node
   */
  addWidget(type: string, name: string, value: any, callback?: Function, options?: any): IComfyWidget {
    const widget: IComfyWidget = {
      name,
      type,
      value,
      callback: callback as any,
      options: options || {}
    }

    // Create widget with custom metadata if applicable
    const createdWidget = this.createWidget(widget);

    this._widgets.push(createdWidget)

    // Ensure widgets_values array is properly wrapped
    if (!this.widgets_values) {
      this.widgets_values = createWidgetsValuesProxy([], this.id, this.type);
    }
    this.widgets_values.push(value)

    // Emit event
    emit(GraphEventTypes.WIDGET_ADDED, {
      node: this,
      widget: createdWidget
    } as any)

    return createdWidget
  }

  // ============================================================================
  // Execution State Management
  // ============================================================================

  /**
   * Check if node is currently executing
   */
  isExecuting(): boolean {
    return this._isExecuting
  }

  /**
   * Set execution state
   */
  setExecuting(executing: boolean, executionId?: string): void {
    const wasExecuting = this._isExecuting
    this._isExecuting = executing
    this._executionId = executionId || null

    if (executing && !wasExecuting) {
      // Started executing
      emit(GraphEventTypes.EXECUTION_NODE_STARTED, {
        nodeId: this.id,
        nodeType: this.type
      } as any)
    } else if (!executing && wasExecuting) {
      // Finished executing
      this._lastExecutionTime = Date.now()
      emit(GraphEventTypes.EXECUTION_NODE_COMPLETED, {
        nodeId: this.id,
        nodeType: this.type
      } as any)
    }
  }

  /**
   * Get last execution time
   */
  getLastExecutionTime(): number {
    return this._lastExecutionTime
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string | null {
    return this._executionId
  }

  // ============================================================================
  // Node State Management
  // ============================================================================

  /**
   * Check if node is muted
   */
  isMuted(): boolean {
    return this.mode === NodeMode.NEVER
  }

  /**
   * Check if node is bypassed
   */
  isBypassed(): boolean {
    return this.mode === NodeMode.BYPASS
  }

  /**
   * Set node mode
   */
  setMode(mode: NodeMode): void {
    const previousMode = this.mode
    this.mode = mode

    // Emit mode changed event
    emit(GraphEventTypes.NODE_MODE_CHANGED, {
      node: this,
      previousValue: previousMode,
      newValue: mode
    } as any)
  }

  /**
   * Set node flag
   */
  setFlag(flag: INodeFlags, value: boolean): void {
    const numFlags = Number(this.flags) || 0
    const numFlag = flag as any as number
    if (value) {
      this.flags = (numFlags | numFlag) as any
    } else {
      this.flags = (numFlags & ~numFlag) as any
    }
  }

  /**
   * Check if node has flag
   */
  hasFlag(flag: INodeFlags): boolean {
    const numFlags = this.flags as any as number
    const numFlag = flag as any as number
    return (numFlags & numFlag) !== 0
  }

  /**
   * Set node position
   */
  setPosition(x: number, y: number): void {
    const previousPos = [...this.pos] as [number, number]
    this.pos = [x, y]

    // Emit position changed event
    emit(GraphEventTypes.NODE_MOVED, {
      node: this,
      previousValue: previousPos,
      newValue: this.pos
    } as any)
  }

  /**
   * Set node size
   */
  setSize(width: number, height: number): void {
    const previousSize = [...this.size] as [number, number]
    this.size = [width, height]

    // Emit size changed event
    emit(GraphEventTypes.NODE_RESIZED, {
      node: this,
      previousValue: previousSize,
      newValue: this.size
    } as any)
  }

  /**
   * Set node title
   */
  setTitle(title: string): void {
    const previousTitle = this.title
    this.title = title

    // Emit title changed event
    emit(GraphEventTypes.NODE_TITLE_CHANGED, {
      node: this,
      previousValue: previousTitle,
      newValue: title
    } as any)
  }

  // ============================================================================
  // Connection and Slot Methods
  // ============================================================================

  /**
   * Check if connection to another node is valid
   */
  isValidConnection(sourceSlot: number, targetNode: ComfyGraphNode, targetSlot: number): boolean {
    // Check if slots exist
    if (sourceSlot >= this.outputs.length || targetSlot >= targetNode.inputs.length) {
      return false
    }

    // Don't allow self-connection
    if (this.id === targetNode.id) {
      return false
    }

    const sourceOutput = this.outputs[sourceSlot]
    const targetInput = targetNode.inputs[targetSlot]

    if (!sourceOutput || !targetInput) {
      return false
    }

    // Check type compatibility
    if (sourceOutput.type !== '*' &&
      targetInput.type !== '*' &&
      sourceOutput.type !== targetInput.type) {
      return false
    }

    // Check if target input is already connected
    if (targetInput.link !== null) {
      return false
    }

    return true
  }

  /**
   * Find input slot by name
   */
  findInputSlot(name: string): number {
    return this.inputs.findIndex(input => input.name === name)
  }

  /**
   * Find output slot by name
   */
  findOutputSlot(name: string): number {
    return this.outputs.findIndex(output => output.name === name)
  }

  /**
   * Find input slot by type
   */
  findInputSlotByType(type: string): number {
    return this.inputs.findIndex(input => input.type === type || input.type === '*')
  }

  /**
   * Find output slot by type
   */
  findOutputSlotByType(type: string): number {
    return this.outputs.findIndex(output => output.type === type || output.type === '*')
  }

  /**
   * Find widget by name
   */
  findWidgetByName(name: string): { widget: IComfyWidget, index: number } | null {
    const index = this._widgets.findIndex(w => w.name === name)
    if (index >= 0) {
      return { widget: this._widgets[index], index }
    }
    return null
  }

  /**
   * Find widget by type
   */
  findWidgetByType(type: string): IComfyWidget[] {
    return this._widgets.filter(w => w.type === type)
  }

  // ============================================================================
  // Node State Management (Extended)
  // ============================================================================

  /**
   * Set collapsed state
   */
  setCollapsed(collapsed: boolean): void {
    const numFlags = this.flags as any as number
    const COLLAPSED = 1 // NodeFlags.COLLAPSED value
    if (collapsed) {
      this.flags = (numFlags | COLLAPSED) as any
    } else {
      this.flags = (numFlags & ~COLLAPSED) as any
    }

    // Emit collapsed state change event
    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      property: 'collapsed',
      previousValue: !collapsed,
      newValue: collapsed
    } as any)
  }

  /**
   * Check if node is collapsed
   */
  isCollapsed(): boolean {
    const numFlags = this.flags as any as number
    const COLLAPSED = 1 // NodeFlags.COLLAPSED value
    return (numFlags & COLLAPSED) !== 0
  }

  /**
   * Set node color
   */
  setColor(color: string): void {
    if (!this.properties) {
      this.properties = {}
    }

    const previousColor = this.properties.color
    this.properties.color = color

    // Emit color change event
    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      property: 'color',
      previousValue: previousColor,
      newValue: color
    } as any)
  }

  /**
   * Get node color
   */
  getColor(): string | undefined {
    return this.properties?.color
  }

  /**
   * Set background color
   */
  setBackgroundColor(color: string): void {
    if (!this.properties) {
      this.properties = {}
    }

    const previousColor = this.properties.bgcolor
    this.properties.bgcolor = color

    emit(GraphEventTypes.NODE_PROPERTY_CHANGED, {
      node: this,
      property: 'bgcolor',
      previousValue: previousColor,
      newValue: color
    } as any)
  }

  /**
   * Get background color
   */
  getBackgroundColor(): string | undefined {
    return this.properties?.bgcolor
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle mouse down event
   */
  onMouseDown(event: MouseEvent, localPos: [number, number]): boolean {
    // Emit mouse down event
    emit(GraphEventTypes.NODE_MOUSE_DOWN, {
      node: this,
      event,
      localPos
    } as any)

    // Mark node as selected
    this.setFlag(2 as any, true) // NodeFlags.SELECTED = 2

    return true // Event handled
  }

  /**
   * Handle mouse up event
   */
  onMouseUp(event: MouseEvent, localPos: [number, number]): boolean {
    // Emit mouse up event
    emit(GraphEventTypes.NODE_MOUSE_UP, {
      node: this,
      event,
      localPos
    } as any)

    return true // Event handled
  }

  /**
   * Handle mouse move event
   */
  onMouseMove(event: MouseEvent, localPos: [number, number]): boolean {
    // Emit mouse move event
    emit(GraphEventTypes.NODE_MOUSE_MOVE, {
      node: this,
      event,
      localPos
    } as any)

    return false // Allow other handlers
  }

  /**
   * Handle double click event
   */
  onDoubleClick(event: MouseEvent, localPos: [number, number]): boolean {
    // Toggle collapsed state on double click
    this.setCollapsed(!this.isCollapsed())

    // Emit double click event
    emit(GraphEventTypes.NODE_DOUBLE_CLICK, {
      node: this,
      event,
      localPos
    } as any)

    return true // Event handled
  }

  // ============================================================================
  // Node Validation
  // ============================================================================

  /**
   * Validate node configuration
   */
  validate(): { isValid: boolean, errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check basic properties
    if (!this.type || this.type.trim() === '') {
      errors.push('Node type is required')
    }

    if (!this.comfyClass || this.comfyClass.trim() === '') {
      errors.push('ComfyUI class type is required')
    }

    if (this.id === undefined || this.id === null) {
      errors.push('Node ID is required')
    }

    // Validate inputs
    this.inputs.forEach((input, index) => {
      if (!input.name || (typeof input.name === 'string' && input.name.trim() === '')) {
        errors.push(`Input ${index} missing name`)
      }
      if (!input.type || (typeof input.type === 'string' && input.type.trim() === '')) {
        errors.push(`Input ${index} missing type`)
      }
    })

    // Validate outputs
    this.outputs.forEach((output, index) => {
      if (!output.name || (typeof output.name === 'string' && output.name.trim() === '')) {
        errors.push(`Output ${index} missing name`)
      }
      if (!output.type || (typeof output.type === 'string' && output.type.trim() === '')) {
        errors.push(`Output ${index} missing type`)
      }
    })

    // Validate widgets
    this._widgets.forEach((widget, index) => {
      if (!widget.name || widget.name.trim() === '') {
        warnings.push(`Widget ${index} missing name`)
      }
      if (!widget.type || widget.type.trim() === '') {
        warnings.push(`Widget ${index} missing type`)
      }
    })

    // Check position and size
    if (this.pos[0] < 0 || this.pos[1] < 0) {
      warnings.push('Node position contains negative values')
    }

    if (this.size[0] <= 0 || this.size[1] <= 0) {
      warnings.push('Node size should be positive')
    }

    // Check widget values length
    if (this.widgets_values.length !== this._widgets.length) {
      warnings.push('Widget values count does not match widget count')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get node bounds
   */
  getBounds(): { x: number, y: number, width: number, height: number } {
    return {
      x: this.pos[0],
      y: this.pos[1],
      width: this.size[0],
      height: this.size[1]
    }
  }

  /**
   * Check if point is inside node bounds
   */
  isPointInside(x: number, y: number): boolean {
    const bounds = this.getBounds()
    return x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
  }

  /**
   * Get node center point
   */
  getCenter(): [number, number] {
    return [
      this.pos[0] + this.size[0] / 2,
      this.pos[1] + this.size[1] / 2
    ]
  }

  /**
   * Convert to ComfyNode format
   */
  toComfyNode(): Partial<IComfyGraphNode> {
    return {
      id: this.id,
      type: this.comfyClass,
      title: this.title,
      pos: [...this.pos],
      size: [...this.size],
      flags: this.flags,
      order: this.order,
      widgets_values: [...this.widgets_values],
      properties: { ...this.properties },
      mode: this.mode,
      //graph: this.graph
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      id: this.id,
      type: this.type,
      comfyClass: this.comfyClass,
      title: this.title,
      pos: this.pos,
      size: this.size,
      mode: this.mode,
      flags: this.flags,
      inputCount: this.inputs.length,
      outputCount: this.outputs.length,
      widgetCount: this._widgets.length,
      isExecuting: this._isExecuting,
      lastExecution: this._lastExecutionTime,
      executionId: this._executionId
    }
  }

  // ============================================================================
  // Connection Methods (Required by base interface)
  // ============================================================================

  connect(_slot: number, _target_node: any, _target_slot: number | string): any {
    // This would normally delegate to the graph's connect method
    // For now, return null as connection is handled at the graph level
    return null
  }

  disconnectInput(slot: number | string): boolean {
    const slotIndex = typeof slot === 'string' ? this.inputs.findIndex(i => i.name === slot) : slot
    if (slotIndex >= 0 && slotIndex < this.inputs.length) {
      this.inputs[slotIndex].link = null
      return true
    }
    return false
  }

  disconnectOutput(slot: number | string, _target_node?: any): boolean {
    const slotIndex = typeof slot === 'string' ? this.outputs.findIndex(o => o.name === slot) : slot
    if (slotIndex >= 0 && slotIndex < this.outputs.length) {
      this.outputs[slotIndex].links = []
      return true
    }
    return false
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create LGraphNode from ComfyUI node data
 */
export function createComfyGraphNode(
  id: number,
  type: string,
  comfyNode?: Partial<IComfyGraphNode>
): ComfyGraphNode {
  return new ComfyGraphNode(id, type, comfyNode)
}

/**
 * Create LGraphNode from serialized data
 */
export function createComfyGraphNodeFromSerialized(data: any): ComfyGraphNode {
  const node = new ComfyGraphNode(data.id, data.type, undefined)
  node.configure(data)
  return node
}

// Backward compatibility exports
export { ComfyGraphNode as LGraphNode }
export { createComfyGraphNode as createLGraphNode }
export { createComfyGraphNodeFromSerialized as createLGraphNodeFromSerialized }

export default ComfyGraphNode