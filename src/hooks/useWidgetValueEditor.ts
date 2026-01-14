import { useState } from 'react';
import { graphChangeLogger } from '@/utils/GraphChangeLogger';
import type { NodeWidgetModifications } from '@/shared/types/widgets/widgetModifications';

interface EditingParam {
  nodeId: number;
  paramName: string;
}

interface UseWidgetValueEditorOptions {
  processor?: any; // ComfyGraphProcessor reference
  onEditComplete?: () => void;
}

export const useWidgetValueEditor = (options?: UseWidgetValueEditorOptions) => {
  const [editingParam, setEditingParam] = useState<EditingParam | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);
  // Internal state to track modified widget values - Map<nodeId, NodeWidgetModifications>
  const [modifiedWidgetValues, setModifiedWidgetValues] = useState<Map<number, NodeWidgetModifications>>(new Map());

  // Helper function to get widget value - check local state first, then processor, then original
  const getWidgetValue = (nodeId: number, paramName: string, originalValue: any) => {
    // Check local modified values first
    const nodeValues = modifiedWidgetValues.get(nodeId);
    if (nodeValues && paramName in nodeValues) {
      return nodeValues[paramName];
    }

    if (options?.processor) {
      // Get current value from ComfyGraphProcessor
      const processorValue = options.processor.getWidgetValue?.(nodeId, paramName);
      return processorValue !== undefined ? processorValue : originalValue;
    }
    return originalValue;
  };

  // Start editing a parameter
  const startEditingParam = (nodeId: number, paramName: string, currentValue: any) => {
    setEditingParam({ nodeId, paramName });
    setEditingValue(currentValue);
  };

  // Cancel editing and restore focus/touch behavior
  const cancelEditingParam = () => {
    // Force blur any focused input elements
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setEditingParam(null);
    setEditingValue(null);

    // Force a small delay to ensure DOM updates
    setTimeout(() => {
      // Re-enable touch events on document if they were disabled
      document.body.style.pointerEvents = '';
      document.body.style.touchAction = '';
    }, 100);
  };

  // Save edited parameter value - Enhanced with local state management
  const saveEditingParam = () => {
    if (!editingParam) return;

    // Force blur any focused input elements
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const { nodeId, paramName } = editingParam;

    // Save to local state
    setModifiedWidgetValues(prev => {
      const newMap = new Map(prev);
      const nodeValues = newMap.get(nodeId) || {};
      nodeValues[paramName] = editingValue;
      newMap.set(nodeId, nodeValues);
      return newMap;
    });

    // Also save to ComfyGraphProcessor if available
    if (options?.processor) {
      // 🔧 GraphChangeLogger: This will be caught by ComfyGraphNode.setWidgetValue
      options.processor.setWidgetValue(nodeId, paramName, editingValue);
    } else {
      // 🔧 GraphChangeLogger: Log direct widget value changes when no processor
      graphChangeLogger.logChange({
        nodeId,
        nodeType: 'unknown',
        changeType: 'direct_access',
        path: `widgets_values.${paramName}`,
        oldValue: undefined, // We don't have the old value in this context
        newValue: editingValue,
        source: 'useWidgetValueEditor.saveEditingParam'
      });
    }


    // Clear editing state
    setEditingParam(null);
    setEditingValue(null);

    // Call edit complete callback if provided (for closing panels, etc.)
    if (options?.onEditComplete) {
      options.onEditComplete();
    }

    // Force a small delay to ensure DOM updates
    setTimeout(() => {
      // Re-enable touch events on document if they were disabled
      document.body.style.pointerEvents = '';
      document.body.style.touchAction = '';
    }, 100);
  };

  // Update the editing value during editing
  const updateEditingValue = (value: any) => {
    setEditingValue(value);
  };

  // Set widget value directly (for file uploads, etc.) - Enhanced with local state
  const setWidgetValue = (nodeId: number, paramName: string, value: any) => {
    // Save to local state
    setModifiedWidgetValues(prev => {
      const newMap = new Map(prev);
      const nodeValues: NodeWidgetModifications = newMap.get(nodeId) || {};
      nodeValues[paramName] = value;
      newMap.set(nodeId, nodeValues);
      return newMap;
    });

    // Also save to ComfyGraphProcessor if available
    if (options?.processor) {
      // 🔧 GraphChangeLogger: This will be caught by ComfyGraphNode.setWidgetValue
      options.processor.setWidgetValue(nodeId, paramName, value);
    } else {
      // 🔧 GraphChangeLogger: Log direct widget value changes when no processor
      graphChangeLogger.logChange({
        nodeId,
        nodeType: 'unknown',
        changeType: 'direct_access',
        path: `widgets_values.${paramName}`,
        oldValue: undefined, // We don't have the old value in this context
        newValue: value,
        source: 'useWidgetValueEditor.setWidgetValue'
      });
    }
  };

  // // Set node mode (bypass state) - Store in modifiedWidgetValues
  // const setNodeMode = (nodeId: number, mode: number) => {
  //   // Store node mode in local state using a special key
  //   setModifiedWidgetValues(prev => {
  //     const newMap = new Map(prev);
  //     const nodeValues = newMap.get(nodeId) || {};
  //     nodeValues['_node_mode'] = mode; // Special key for node mode
  //     newMap.set(nodeId, nodeValues);
  //     return newMap;
  //   });

  //   // Log the change
  //   graphChangeLogger.logChange({
  //     nodeId,
  //     nodeType: 'unknown',
  //     changeType: 'node_property',
  //     path: 'mode',
  //     oldValue: undefined, // We don't have the old value in this context
  //     newValue: mode,
  //     source: 'useWidgetValueEditor.setNodeMode'
  //   });

  //   // Also update processor if available (for backward compatibility)
  //   if (options?.processor) {
  //     options.processor.setNodeMode?.(nodeId, mode);
  //   }
  // };

  // // Batch set node modes
  // const setNodeModeBatch = (modifications: { nodeId: number, mode: number }[]) => {
  //   // 1. Update local state in one go
  //   setModifiedWidgetValues(prev => {
  //     const newMap = new Map(prev);
  //     modifications.forEach(({ nodeId, mode }) => {
  //       const nodeValues = newMap.get(nodeId) || {};
  //       nodeValues['_node_mode'] = mode;
  //       newMap.set(nodeId, nodeValues);
  //     });
  //     return newMap;
  //   });

  //   // 2. Log changes
  //   modifications.forEach(({ nodeId, mode }) => {
  //     graphChangeLogger.logChange({
  //       nodeId,
  //       nodeType: 'unknown',
  //       changeType: 'node_property',
  //       path: 'mode',
  //       oldValue: undefined,
  //       newValue: mode,
  //       source: 'useWidgetValueEditor.setNodeModeBatch'
  //     });
  //   });

  //   // 3. Update processor via batch method if available, fallback to loop
  //   if (options?.processor) {
  //     if (options.processor.setNodeModeBatch) {
  //       options.processor.setNodeModeBatch(modifications);
  //     } else {
  //       // Fallback calling singular if batch not supported
  //       modifications.forEach(({ nodeId, mode }) => {
  //         options.processor.setNodeMode?.(nodeId, mode);
  //       });
  //     }
  //   }
  // };

  // Get node mode - check modifiedWidgetValues first, then processor, then original
  const getNodeMode = (nodeId: number, originalMode: number) => {
    // Check local modified values first
    const nodeValues = modifiedWidgetValues.get(nodeId);
    if (nodeValues && '_node_mode' in nodeValues) {
      return nodeValues['_node_mode'];
    }

    if (options?.processor) {
      const processorMode = options.processor.getNodeMode?.(nodeId);
      return processorMode !== undefined ? processorMode : originalMode;
    }
    return originalMode;
  };

  // Clear all modifications (for after saving)
  const clearModifications = () => {
    // Clear local state
    setModifiedWidgetValues(new Map());

    // ComfyGraphProcessor handles its own clearing
    if (options?.processor) {
      options.processor.clearModifications?.();
    }

  };

  // Directly set a modified widget value without going through edit mode
  const setModifiedWidgetValue = (nodeId: number, paramName: string, value: any) => {
    setModifiedWidgetValues(prev => {
      const newMap = new Map(prev);
      const nodeValues = newMap.get(nodeId) || {};
      nodeValues[paramName] = value;
      newMap.set(nodeId, nodeValues);
      return newMap;
    });

    // Also save to ComfyGraphProcessor if available
    if (options?.processor) {
      options.processor.setWidgetValue(nodeId, paramName, value);
    } else {
      // Log direct widget value changes when no processor
      graphChangeLogger.logChange({
        nodeId,
        nodeType: 'unknown',
        changeType: 'direct_access',
        path: `widgets_values.${paramName}`,
        oldValue: undefined,
        newValue: value,
        source: 'useWidgetValueEditor.setModifiedWidgetValue'
      });
    }
  };

  // Check if there are any modifications - check local state first
  const hasModifications = () => {
    // Check if we have any local modifications
    if (modifiedWidgetValues.size > 0) {
      return true;
    }

    if (options?.processor) {
      return options.processor.hasUnsavedChanges?.() || false;
    }
    return false;
  };

  return {
    // State - UI editing state and modifications
    editingParam,
    editingValue,
    modifiedWidgetValues, // Real state now

    // Functions
    getWidgetValue,
    getNodeMode,
    startEditingParam,
    cancelEditingParam,
    saveEditingParam,
    updateEditingValue,
    setWidgetValue,
    // setNodeMode,
    // setNodeModeBatch,
    clearModifications,
    setModifiedWidgetValue,
    hasModifications,

    // Direct state setter for advanced use cases (like snapshot loading)
    setModifiedWidgetValues,
  };
};