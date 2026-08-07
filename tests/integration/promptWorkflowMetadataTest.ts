#!/usr/bin/env npx tsx

import assert from 'node:assert/strict';
import { ComfyGraph } from '../../src/core/domain/ComfyGraph';
import { ComfyGraphNode } from '../../src/core/domain/ComfyGraphNode';
import { createExecutionGraph } from '../../src/core/services/WorkflowExecutionService';
import { buildPromptExtraData } from '../../src/infrastructure/api/ComfyPromptPayload';

const originalGraph = new ComfyGraph();
const sourceNode = new ComfyGraphNode(1, 'TestNode');
sourceNode.addWidget('number', 'seed', 1);
sourceNode.widgets_values = [1];
originalGraph._nodes = [sourceNode];
const executionGraph = createExecutionGraph(
  originalGraph,
  new Map([[1, { seed: 42 }]]),
);

assert.ok(executionGraph instanceof ComfyGraph, 'graph prototype should be preserved');
assert.equal(executionGraph._nodes[0].getWidget('seed')?.value, 42);
assert.equal(executionGraph._nodes[0].widgets_values[0], 42);
assert.equal(executionGraph.serialize().nodes[0].widgets_values[0], 42);
assert.equal(originalGraph._nodes[0].getWidget('seed')?.value, 1, 'source widgets must not be mutated');
assert.equal(originalGraph._nodes[0].widgets_values[0], 1, 'source values must not be mutated');
assert.doesNotThrow(
  () => JSON.stringify(executionGraph.serialize()),
  'serialized execution workflow must be valid JSON metadata',
);

const workflow = { nodes: [{ id: 1, widgets_values: [42] }] };
assert.deepEqual(buildPromptExtraData('auto', workflow), {
  preview_method: 'auto',
  extra_pnginfo: { workflow },
});
assert.deepEqual(buildPromptExtraData('none'), { preview_method: 'none' });
assert.deepEqual(buildPromptExtraData('taesd', 'invalid workflow'), { preview_method: 'taesd' });

console.log('Prompt workflow metadata tests passed');
