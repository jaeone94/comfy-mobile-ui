import assert from 'node:assert/strict';
import { ComfyGraph } from '../../src/core/domain/ComfyGraph';
import { ComfyGraphNode } from '../../src/core/domain/ComfyGraphNode';
import { AUTOGROW, DYNAMIC_COMBO, expandDynamicInputs } from '../../src/core/services/DynamicInputService';
import { createExecutionGraph } from '../../src/core/services/WorkflowExecutionService';
import { ConnectionService } from '../../src/services/ConnectionService';
import { convertGraphToAPI } from '../../src/infrastructure/api/ComfyApiFunctions';

// Production code logs graph details; keep test output focused on assertions.
const report = console.log;
console.log = () => {};

const metadata: any = { input: { required: {
  images: [AUTOGROW, { template: { input: { required: { image: ['IMAGE'] } }, prefix: 'image', min: 1, max: 3 } }],
  resize: [DYNAMIC_COMBO, { options: [
    { key: 'dimensions', inputs: { required: { width: ['INT', { default: 512 }], height: ['INT', { default: 768 }] } } },
    { key: 'scale', inputs: { required: { factor: ['FLOAT', { default: 1.5 }], nested: [DYNAMIC_COMBO, { options: [
      { key: 'plain', inputs: { required: { text: ['STRING', { default: 'hello' }] } } },
      { key: 'mask', inputs: { required: { mask: ['MASK'] } } },
    ] }] } } },
  ] }],
  seed: ['INT', { default: 42, control_after_generate: true }],
  suffix: ['STRING', { default: 'after' }],
} }, output: ['IMAGE'], output_name: ['IMAGE'] };

const graph = new ComfyGraph();
const target = new ComfyGraphNode(2, 'DynamicTest', { widgets_values: [] });
target.initializeWidgets([], metadata);
const source = new ComfyGraphNode(1, 'Source');
source.addOutput('image', 'IMAGE');
graph.add(source);
graph.add(target);
assert.deepEqual(target.widgets_values, ['dimensions', 512, 768, 42, 'fixed', 'after']);
assert.deepEqual(target.inputs.filter(i => i.name.startsWith('images.')).map(i => i.name), ['images.image0']);
let workflow = graph.serialize();
const connect = (name: string) => {
  const result = ConnectionService.createConnection(workflow, graph as any, 1, 2, 0, target.inputs.findIndex(i => i.name === name));
  workflow = result.updatedWorkflowJson;
  return result.newLinkId;
};
const first = connect('images.image0');
const second = connect('images.image1');
assert.equal(target.inputs.filter(i => i.name.startsWith('images.')).length, 3);
const third = connect('images.image2');
assert.equal(target.inputs.filter(i => i.name.startsWith('images.')).length, 3, 'max enforced');
ConnectionService.removeConnection(workflow, graph as any, first);
assert.equal(target.inputs[0].link, second, 'remaining row compacts with its link');
assert.equal(target.inputs[1].link, third);
assert.equal(graph._links[second].target_slot, 0);
assert.deepEqual(source.outputs[0].links, [second, third]);
const replacement = connect('images.image0');
assert.equal(target.inputs[1].link, third, 'replacing a link must not compact other rows');
assert.equal(graph._links[second], undefined);
assert.equal(target.inputs[0].link, replacement);

target.setWidgetValue('resize.width', 1024);
target.setWidgetValue('resize', 'scale');
assert.equal(target.getWidget('resize.width'), null);
assert.equal(target.getWidget('resize.factor')?.value, 1.5);
assert.equal(target.getWidget('resize.nested.text')?.value, 'hello');
assert.equal(target.getWidget('suffix')?.value, 'after', 'following widget index must not shift values');
target.setWidgetValue('resize.factor', 2.25);
target.setWidgetValue('resize.nested', 'mask');
assert.equal(target.getWidget('resize.nested.text'), null);
assert.ok(target.inputs.some(i => i.name === 'resize.nested.mask'));
target.setWidgetValue('resize', 'dimensions');
assert.equal(target.getWidget('resize.width')?.value, 1024, 'branch values restored');
target.setWidgetValue('resize', 'scale');
assert.equal(target.getWidget('resize.factor')?.value, 2.25);
assert.equal(target.getWidget('resize.nested')?.value, 'mask');

const saved = graph.serialize();
const reloaded = new ComfyGraph();
reloaded.setMetadata({ DynamicTest: metadata } as any);
await reloaded.configure(saved);
assert.deepEqual(reloaded.getNodeById(2)?.widgets_values, target.widgets_values);
assert.deepEqual(reloaded.getNodeById(2)?.inputs, target.inputs);
const snapshot = createExecutionGraph(graph, new Map([[2, { resize: 'dimensions', 'resize.width': 640 }]]));
assert.equal(snapshot.getNodeById(2)?.getWidget('resize.width')?.value, 640);
assert.equal(target.getWidget('resize')?.value, 'scale', 'execution snapshot must be isolated');
const { apiWorkflow: api } = await convertGraphToAPI(snapshot);
assert.equal(api['2'].inputs.resize, 'dimensions');
assert.equal(api['2'].inputs['resize.width'], 640);
assert.deepEqual(api['2'].inputs['images.image0'], ['1', 0]);
assert.equal(api['2'].inputs['resize.factor'], undefined);
assert.equal(api['2'].inputs.control_after_generate, undefined);

// Removing a selected branch must clean both link endpoints, and must not
// mutate the live graph when that change is made in an execution snapshot.
source.addOutput('mask', 'MASK');
workflow = graph.serialize();
const branchConnection = ConnectionService.createConnection(workflow, graph as any, 1, 2, 1,
  target.inputs.findIndex(i => i.name === 'resize.nested.mask'));
const branchLink = branchConnection.newLinkId;
const branchSnapshot = createExecutionGraph(graph, new Map([[2, { resize: 'dimensions' }]]));
assert.equal(branchSnapshot._links[branchLink], undefined);
assert.deepEqual(branchSnapshot.getNodeById(1)?.outputs[1].links, []);
assert.ok(graph._links[branchLink]);
assert.deepEqual(source.outputs[1].links, [branchLink]);
target.setWidgetValue('resize', 'dimensions');
assert.equal(graph._links[branchLink], undefined);
assert.deepEqual(source.outputs[1].links, []);

// Loading official JSON with no slots for ordinary widgets still consumes
// widget values in schema order and fixes the target slots of later links.
const official = new ComfyGraph();
official.setMetadata({ DynamicTest: metadata } as any);
const officialJson = graph.serialize();
officialJson.nodes.find((node: any) => node.id === 2).inputs = target.inputs.filter(i => !i.widget);
await official.configure(officialJson);
assert.equal(official.getNodeById(2)?.getWidget('suffix')?.value, 'after');

const names = expandDynamicInputs({ input: { optional: { coords: [AUTOGROW, { template: {
  input: { required: { value: ['FLOAT', { forceInput: true }] } }, names: ['x', 'y'], min: 0,
} }] } } }, [{ name: 'coords.x', link: 3 }]);
assert.deepEqual(names.inputs.map(i => i.name), ['coords.x', 'coords.y']);
assert.equal(names.widgets.length, 0, 'autogrow scalars remain sockets');
report('PASS: V3 growth/compaction/max/replacement, nested combo switching, cached values, round-trip, isolated execution and API keys');
