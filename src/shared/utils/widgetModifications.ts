import type { NodeWidgetModifications } from '@/shared/types/widgets/widgetModifications';

export const retainUnsavedWidgetModifications = (
  currentValues: Map<number, NodeWidgetModifications>,
  savedValues: Map<number, NodeWidgetModifications>,
): Map<number, NodeWidgetModifications> => {
  const remainingValues = new Map<number, NodeWidgetModifications>();

  currentValues.forEach((nodeValues, nodeId) => {
    const savedNodeValues = savedValues.get(nodeId);
    const remainingNodeValues: NodeWidgetModifications = {};

    Object.entries(nodeValues).forEach(([paramName, currentValue]) => {
      const wasSaved = savedNodeValues
        && Object.prototype.hasOwnProperty.call(savedNodeValues, paramName)
        && Object.is(savedNodeValues[paramName], currentValue);

      if (!wasSaved) {
        remainingNodeValues[paramName] = currentValue;
      }
    });

    if (Object.keys(remainingNodeValues).length > 0) {
      remainingValues.set(nodeId, remainingNodeValues);
    }
  });

  return remainingValues;
};
