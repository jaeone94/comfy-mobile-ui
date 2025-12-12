/**
 * Widget Control Types
 * 
 * Common interfaces and types for widget control components
 */

import { IProcessedParameter } from '@/shared/types/comfy/IComfyObjectInfo';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { IComfyWidget } from '@/shared/types/app/IComfyGraphNode';

export interface BaseWidgetProps {
  /** The parameter being edited */
  param: IProcessedParameter;

  /** Current editing value */
  editingValue: any;

  /** Callback when value changes */
  onValueChange: (value: any) => void;

  /** Optional ComfyGraphNode context */
  node?: ComfyGraphNode;

  /** Optional widget context */
  widget?: IComfyWidget;
}

export interface NumberWidgetProps extends BaseWidgetProps {
  /** Number type: INT, FLOAT, or SEED */
  type: 'INT' | 'FLOAT' | 'SEED';
}

export interface BooleanWidgetProps extends BaseWidgetProps {
  editingValue: boolean;
}

export interface StringWidgetProps extends BaseWidgetProps {
  editingValue: string;
}

export interface ComboWidgetProps extends BaseWidgetProps {
  /** Available options */
  options: (string | number)[];

  /** Current selected value */
  editingValue: string | number;
}

export interface SeedWithControlWidgetProps extends BaseWidgetProps {
  /** Seed value */
  editingValue: number;

  /** Control widget for control_after_generate */
  controlWidget?: IComfyWidget;

  /** Callback for control_after_generate changes */
  onControlAfterGenerateChange?: (nodeId: number, value: string) => void;

  /** Force render counter for UI updates */
  forceRender?: number;

  /** Force render setter */
  setForceRender?: (fn: (prev: number) => number) => void;
}