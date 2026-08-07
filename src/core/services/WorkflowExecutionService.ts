import type { ComfyGraph } from '@/core/domain/ComfyGraph';

export type WidgetModifications = ReadonlyMap<
  number,
  Readonly<Record<string, unknown>>
>;

interface RuntimeWidget {
  name?: string;
  value?: unknown;
  [key: string]: unknown;
}

interface RuntimeExecutionNode {
  id: string | number;
  widgets?: RuntimeWidget[];
  _widgets?: RuntimeWidget[];
  widgets_values?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneWithPrototype = <T extends object>(value: T): T =>
  Object.assign(Object.create(Object.getPrototypeOf(value)), value);

const cloneWidgets = (widgets: RuntimeWidget[] | undefined): RuntimeWidget[] | undefined =>
  widgets?.map(cloneWithPrototype);

const cloneNode = (sourceNode: RuntimeExecutionNode): RuntimeExecutionNode => {
  const clonedNode = cloneWithPrototype(sourceNode);
  const publicWidgets = cloneWidgets(sourceNode.widgets);

  // ComfyGraphNode exposes `widgets` through a getter backed by `_widgets`.
  // Plain graph fixtures may instead own `widgets`, so preserve either shape.
  clonedNode._widgets = cloneWidgets(sourceNode._widgets ?? sourceNode.widgets);
  if (Object.prototype.hasOwnProperty.call(sourceNode, 'widgets')) {
    Object.defineProperty(clonedNode, 'widgets', {
      value: publicWidgets,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  clonedNode.widgets_values = Array.isArray(sourceNode.widgets_values)
    ? [...sourceNode.widgets_values]
    : isRecord(sourceNode.widgets_values)
      ? { ...sourceNode.widgets_values }
      : sourceNode.widgets_values;

  return clonedNode;
};

/**
 * Create an isolated, executable graph snapshot and apply pending widget
 * edits to it. Preserving the graph/node prototypes lets the caller serialize
 * this same snapshot, keeping prompt inputs and output metadata in sync.
 */
export const createExecutionGraph = <TGraph extends ComfyGraph>(
  originalGraph: TGraph,
  modifications: WidgetModifications,
): TGraph => {
  const sourceNodes = originalGraph._nodes as unknown as RuntimeExecutionNode[];
  const executionGraph = Object.assign(
    Object.create(Object.getPrototypeOf(originalGraph)),
    originalGraph,
    {
      _nodes: sourceNodes.map(cloneNode),
      _links: { ...(originalGraph._links ?? {}) },
      _groups: originalGraph._groups ? [...originalGraph._groups] : [],
    },
  ) as TGraph;
  const executionNodes = executionGraph._nodes as unknown as RuntimeExecutionNode[];

  modifications.forEach((nodeModifications, nodeId) => {
    const node = executionNodes.find((candidate) => Number(candidate.id) === nodeId);
    if (!node) {
      console.warn(`[WorkflowExecution] Node ${nodeId} was not found in the execution graph`);
      return;
    }

    Object.entries(nodeModifications).forEach(([parameterName, value]) => {
      let applied = false;

      for (const widgets of [node.widgets, node._widgets]) {
        const widget = widgets?.find((candidate) => candidate.name === parameterName);
        if (widget) {
          widget.value = value;
          applied = true;
        }
      }

      if (isRecord(node.widgets_values)) {
        node.widgets_values[parameterName] = value;
        applied = true;
      } else {
        const widgetList = node.widgets ?? node._widgets;
        const widgetIndex = widgetList?.findIndex((widget) => widget.name === parameterName) ?? -1;

        if (widgetList && widgetIndex >= 0) {
          const widgetValues = Array.isArray(node.widgets_values)
            ? node.widgets_values
            : widgetList.map((widget) => widget.value);
          widgetValues[widgetIndex] = value;
          node.widgets_values = widgetValues;
          applied = true;
        }
      }

      if (!applied) {
        console.warn(
          `[WorkflowExecution] Widget "${parameterName}" was not found on node ${nodeId}`,
        );
      }
    });
  });

  return executionGraph;
};
