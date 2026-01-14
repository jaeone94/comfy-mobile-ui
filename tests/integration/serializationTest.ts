#!/usr/bin/env npx tsx
/**
 * Serialization Test
 * Tests the consistency of JSON → LiteGraph → JSON conversion
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { loadWorkflowToGraph, serializeGraph } from '../../src/core/services/WorkflowGraphService';
import { testConfig, getTestServerUrl, getTestConnectionTimeout } from '../utils/testConfig';

async function runSerializationTest(serverUrl?: string, workflowFile?: string) {
  const SERVER_URL = serverUrl || getTestServerUrl();
  const timeout = getTestConnectionTimeout();

  // Create timestamped output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(process.cwd(), 'tests', 'output', `serialization-test-${timestamp}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("🔄 Serialization Consistency Test\n");
  console.log("=".repeat(60));
  console.log(`🌐 Server: ${SERVER_URL}`);
  console.log(`📂 Output: ${outputDir}`);
  if (workflowFile) {
    console.log(`📁 Workflow: ${workflowFile}`);
  }

  // Step 1: Check server connectivity
  console.log("\n1️⃣ Checking server connectivity...");
  let serverObjectInfo: any = null;

  try {
    const response = await axios.get(`${SERVER_URL}/object_info`, { timeout });
    console.log(`   ✅ Server connected`);
    console.log(`   Node types available: ${Object.keys(response.data).length}`);
    serverObjectInfo = response.data;
  } catch (error) {
    console.error(`   ❌ Failed to connect to server at ${SERVER_URL}`);
    console.error(`   Please ensure ComfyUI server is running`);
    process.exit(1);
  }

  // Step 2: Load extensions (DISABLED)
  console.log("\n2️⃣ Skipping extension loading (disabled)...");
  // const extensionLoader = getExtensionLoader();
  // extensionLoader.setBaseUrl(SERVER_URL);

  // try {
  //   const extensions = await extensionLoader.loadAllExtensions();
  //   console.log(`   ✅ Loaded ${extensions.length} extensions`);
  // } catch (error) {
  //   console.log(`   ⚠️ Could not load extensions: ${error}`);
  // }

  // Step 3: Load original workflow (A json)
  console.log("\n3️⃣ Loading original workflow (A json)...");

  if (!workflowFile) {
    console.error(`   ❌ No workflow file provided`);
    console.error(`   Please specify a workflow file as argument`);
    return false;
  }

  if (!fs.existsSync(workflowFile)) {
    console.error(`   ❌ Workflow file not found: ${workflowFile}`);
    return false;
  }

  const jsonA = JSON.parse(fs.readFileSync(workflowFile, 'utf-8'));
  console.log(`   ✅ Loaded workflow from ${workflowFile}`);
  console.log(`   📊 Workflow has ${jsonA.nodes?.length || 0} nodes`);

  // Save original workflow for reference
  const originalPath = path.join(outputDir, '00-original-workflow.json');
  fs.writeFileSync(originalPath, JSON.stringify(jsonA, null, 2), 'utf-8');
  console.log(`   💾 Saved original workflow to: ${path.basename(originalPath)}`);

  // Step 4: Convert A json → A LiteGraph
  console.log("\n4️⃣ Converting A json → A LiteGraph...");

  // Suppress warnings
  const originalWarn = console.warn;
  console.warn = () => { };

  const graphA = await loadWorkflowToGraph(jsonA, serverObjectInfo, true, false);

  console.warn = originalWarn;

  console.log(`   ✅ Created A LiteGraph with ${graphA._nodes?.length || 0} nodes`);

  // Debug: Check if properties are loaded correctly
  const debugNode = graphA._nodes?.find(n => n.id === 16);
  if (debugNode) {
    console.log(`   🔍 Debug Node 16 properties:`);
    console.log(`      flags: ${JSON.stringify(debugNode.flags)}`);
    console.log(`      order: ${debugNode.order}`);
    console.log(`      color: ${debugNode.color}`);
    console.log(`      bgcolor: ${debugNode.bgcolor}`);
  }

  // Debug: Check Node 87 specifically (the problematic one)
  const debugNode87 = graphA._nodes?.find(n => n.id === 87);
  if (debugNode87) {
    console.log(`   🔍 Debug Node 87 properties:`);
    console.log(`      type: ${debugNode87.type}`);
    console.log(`      serialize_widgets: ${debugNode87.serialize_widgets}`);
    console.log(`      widgets_values: ${JSON.stringify(debugNode87.widgets_values)}`);
    console.log(`      widgets_values undefined: ${debugNode87.widgets_values === undefined}`);
  }

  // Step 5: Serialize A LiteGraph → B json (using LiteGraph's native serialize)
  console.log("\n5️⃣ Serializing A LiteGraph → B json...");

  console.log(`   🔍 Debug groups before serialize: ${JSON.stringify(graphA.groups?.length || 0)} groups`);
  console.log(`   🔍 Debug internal graph type: ${typeof graphA}`);
  console.log(`   🔍 Debug internal graph constructor: ${graphA?.constructor?.name}`);

  // Use serializeGraph() function
  console.log(`   🔧 Using serializeGraph()`);
  const jsonB = serializeGraph(graphA);

  console.log(`   🔍 Debug groups after serialize: ${JSON.stringify(jsonB.groups?.length || 0)} groups`);

  // Clean up the serialized data (remove LiteGraph internals)
  cleanupSerializedWorkflow(jsonB);

  console.log(`   🔍 Debug groups after cleanup: ${JSON.stringify(jsonB.groups?.length || 0)} groups`);

  // Manually restore top-level metadata from original
  if (jsonA.id) jsonB.id = jsonA.id;
  if (jsonA.revision !== undefined) jsonB.revision = jsonA.revision;
  console.log(`   ✅ Serialized to B json with ${jsonB.nodes.length} nodes`);

  // Save B json for debugging
  const jsonBPath = path.join(outputDir, '01-serialization-b.json');
  fs.writeFileSync(jsonBPath, JSON.stringify(jsonB, null, 2), 'utf-8');
  console.log(`   💾 Saved B json to: ${path.basename(jsonBPath)}`);

  // Step 6: Convert B json → B LiteGraph
  console.log("\n6️⃣ Converting B json → B LiteGraph...");

  console.warn = () => { };
  const graphB = await loadWorkflowToGraph(jsonB, serverObjectInfo, true, false);
  console.warn = originalWarn;

  console.log(`   ✅ Created B LiteGraph with ${graphB._nodes?.length || 0} nodes`);

  // Step 7: Serialize B LiteGraph → C json (using LiteGraph's native serialize)
  console.log("\n7️⃣ Serializing B LiteGraph → C json...");

  const jsonC = serializeGraph(graphB);

  // Clean up the serialized data (remove LiteGraph internals)
  cleanupSerializedWorkflow(jsonC);

  // Manually restore top-level metadata from B
  if (jsonB.id) jsonC.id = jsonB.id;
  if (jsonB.revision !== undefined) jsonC.revision = jsonB.revision;
  console.log(`   ✅ Serialized to C json with ${jsonC.nodes.length} nodes`);

  const jsonCPath = path.join(outputDir, '02-serialization-c.json');
  fs.writeFileSync(jsonCPath, JSON.stringify(jsonC, null, 2), 'utf-8');
  console.log(`   💾 Saved C json to: ${path.basename(jsonCPath)}`);

  // Step 8: Compare A LiteGraph = B LiteGraph
  console.log("\n8️⃣ Comparing A LiteGraph ≟ B LiteGraph...");

  const graphComparison = compareLiteGraphs(graphA, graphB);
  if (graphComparison.identical) {
    console.log(`   ✅ Graphs are identical`);
  } else {
    console.log(`   ❌ Graphs differ:`);
    graphComparison.differences.forEach(diff => {
      console.log(`      - ${diff}`);
    });
  }

  // Step 9: Compare A json ≟ B json ≟ C json
  console.log("\n9️⃣ Comparing JSON consistency...");

  // Compare A json and B json (structural comparison, ignoring formatting)
  const jsonABComparison = compareWorkflowJSON(jsonA, jsonB);
  console.log(`\n   A json ≟ B json:`);
  if (jsonABComparison.identical) {
    console.log(`   ✅ JSONs are structurally identical`);
  } else {
    console.log(`   ❌ JSONs differ:`);
    jsonABComparison.differences.slice(0, 10).forEach(diff => {
      console.log(`      - ${diff}`);
    });
    if (jsonABComparison.differences.length > 10) {
      console.log(`      ... and ${jsonABComparison.differences.length - 10} more differences`);
    }
  }

  // Compare B json and C json
  const jsonBCComparison = compareWorkflowJSON(jsonB, jsonC);
  console.log(`\n   B json ≟ C json:`);
  if (jsonBCComparison.identical) {
    console.log(`   ✅ JSONs are identical`);
  } else {
    console.log(`   ❌ JSONs differ:`);
    jsonBCComparison.differences.slice(0, 10).forEach(diff => {
      console.log(`      - ${diff}`);
    });
    if (jsonBCComparison.differences.length > 10) {
      console.log(`      ... and ${jsonBCComparison.differences.length - 10} more differences`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary:");
  console.log(`   A json nodes: ${jsonA.nodes.length}`);
  console.log(`   B json nodes: ${jsonB.nodes.length}`);
  console.log(`   C json nodes: ${jsonC.nodes.length}`);
  console.log(`   A LiteGraph nodes: ${graphA._nodes?.length || 0}`);
  console.log(`   B LiteGraph nodes: ${graphB._nodes?.length || 0}`);
  console.log(`   Graph consistency: ${graphComparison.identical ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   A→B JSON consistency: ${jsonABComparison.identical ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   B→C JSON consistency: ${jsonBCComparison.identical ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = graphComparison.identical && jsonBCComparison.identical;
  console.log(`\n   Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  // Save test report
  const report = {
    timestamp: new Date().toISOString(),
    workflowFile,
    serverUrl: SERVER_URL,
    outputDirectory: outputDir,
    summary: {
      success: allPassed,
      originalNodes: jsonA.nodes?.length || 0,
      bJsonNodes: jsonB.nodes?.length || 0,
      cJsonNodes: jsonC.nodes?.length || 0,
      aGraphNodes: graphA._nodes?.length || 0,
      bGraphNodes: graphB._nodes?.length || 0
    },
    results: {
      graphConsistency: graphComparison.identical,
      graphDifferences: graphComparison.differences,
      jsonABConsistency: jsonABComparison.identical,
      jsonABDifferences: jsonABComparison.differences.slice(0, 20), // Limit for file size
      jsonBCConsistency: jsonBCComparison.identical,
      jsonBCDifferences: jsonBCComparison.differences.slice(0, 20) // Limit for file size
    }
  };

  const reportPath = path.join(outputDir, '99-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n💾 Test report saved to: ${path.basename(reportPath)}`);
  console.log(`📂 All files saved in: ${outputDir}`);

  return allPassed;
}

/**
 * Clean up serialized workflow (remove LiteGraph internals)
 */
function cleanupSerializedWorkflow(workflow: any): void {
  // Only remove LiteGraph internal properties - preserve all ComfyUI data
  for (const node of workflow.nodes || []) {
    // ✅ DO NOT remove localized_name - this is legitimate ComfyUI data
    // ✅ DO NOT remove widget properties - this is legitimate ComfyUI data

    // Remove only LiteGraph internal properties
    delete node.comfyClass;
    delete node.serialize_widgets;
    delete node._widgets;
    delete node._isExecuting;
    delete node._lastExecutionTime;
    delete node._eventSystem;
    delete node._executionId;

    // IMPORTANT: Remove runtime-only metadata from serialization
    delete node.nodeData;
    delete node.widgets;

    // ✅ DO NOT convert empty arrays to null - ComfyUI uses [] for unconnected outputs
    // No cleanup needed for output.links - preserve original format
  }

  // Convert links from LiteGraph object format to ComfyUI array format
  if (workflow.links && Array.isArray(workflow.links)) {
    workflow.links = workflow.links.map((link: any) => {
      if (typeof link === 'object' && link.id !== undefined) {
        // Convert object format to array format: [id, origin_id, origin_slot, target_id, target_slot, type]
        return [
          link.id,
          link.origin_id,
          link.origin_slot,
          link.target_id,
          link.target_slot,
          link.type || null
        ];
      }
      // Already in array format, keep as is
      return link;
    });
  }

  // Add metadata if missing
  workflow.extra ??= {};
  workflow.version ??= 0.4;

  // Restore top-level metadata from extra
  if (workflow.extra?.id) {
    workflow.id = workflow.extra.id;
  }
  if (workflow.extra?.revision !== undefined) {
    workflow.revision = workflow.extra.revision;
  }
}

/**
 * Serialize LiteGraph to JSON
 */
function serializeLiteGraph(graph: any): any {
  const nodes: any[] = [];

  // Process nodes
  for (const node of (graph._nodes || [])) {
    const nodeData: any = {
      id: node.id,
      type: node.type,
      pos: Array.isArray(node.pos) ? [...node.pos] : [0, 0],
      size: Array.isArray(node.size) ? [...node.size] : [200, 100],
      flags: node.flags || {},
      order: node.order || 0,
      mode: node.mode || 0,
      inputs: [],
      outputs: [],
      properties: node.properties || {}
    };

    // CRITICAL: Only serialize widgets_values if serialize_widgets is true (ComfyUI logic)
    // ComfyUI frontend preserves the original widgets_values array - never regenerate it
    if (node.serialize_widgets && node.widgets_values !== undefined) {
      // Always use the existing widgets_values array exactly as is
      nodeData.widgets_values = Array.isArray(node.widgets_values) ?
        [...node.widgets_values] :
        node.widgets_values;
    }
    // If serialize_widgets is false/undefined, don't add widgets_values at all

    // Add title if different from type
    if (node.title && node.title !== node.type) {
      nodeData.title = node.title;
    }

    // Add color information if present
    if (node.color) {
      nodeData.color = node.color;
    }
    if (node.bgcolor) {
      nodeData.bgcolor = node.bgcolor;
    }

    // Process inputs
    if (node.inputs) {
      for (const input of node.inputs) {
        nodeData.inputs.push({
          name: input.name,
          type: input.type,
          link: input.link || null,
          widget: input.widget || undefined
        });
      }
    }

    // Process outputs
    if (node.outputs) {
      for (const output of node.outputs) {
        const outputData: any = {
          name: output.name,
          type: output.type,
          links: output.links || [],  // ✅ Preserve [] for empty links - ComfyUI format
          slot_index: output.slot_index !== undefined ? output.slot_index : undefined
        };
        // Remove undefined fields
        if (outputData.slot_index === undefined) delete outputData.slot_index;
        nodeData.outputs.push(outputData);
      }
    }

    nodes.push(nodeData);
  }

  // Process links
  const links: any[] = [];
  if (graph.links) {
    for (const linkId in graph.links) {
      const link = graph.links[linkId];
      if (link) {
        // Convert to array format [id, origin_id, origin_slot, target_id, target_slot, type]
        links.push([
          link.id,
          link.origin_id,
          link.origin_slot,
          link.target_id,
          link.target_slot,
          link.type
        ]);
      }
    }
  }

  // Build the workflow JSON
  const workflow: any = {
    last_node_id: graph.last_node_id || Math.max(...nodes.map(n => n.id), 0),
    last_link_id: graph.last_link_id || links.length,
    nodes,
    links,
    groups: graph.groups || [],
    config: graph.config || {},
    extra: graph.extra || {},
    version: graph.version || 0.4
  };

  // Add optional metadata if present
  if (graph.id) {
    workflow.id = graph.id;
  }
  if (graph.revision !== undefined) {
    workflow.revision = graph.revision;
  }

  return workflow;
}

/**
 * Compare two LiteGraph instances
 */
function compareLiteGraphs(graphA: any, graphB: any): { identical: boolean; differences: string[] } {
  const differences: string[] = [];

  // Compare node count
  const nodesA = graphA._nodes || [];
  const nodesB = graphB._nodes || [];

  if (nodesA.length !== nodesB.length) {
    differences.push(`Node count: A has ${nodesA.length}, B has ${nodesB.length}`);
  }

  // Compare each node
  const nodeMapB = new Map(nodesB.map((n: any) => [n.id, n]));

  for (const nodeA of nodesA) {
    const nodeB = nodeMapB.get(nodeA.id);
    if (!nodeB) {
      differences.push(`Node ${nodeA.id} exists in A but not in B`);
      continue;
    }

    // Compare node properties
    if (nodeA.type !== nodeB.type) {
      differences.push(`Node ${nodeA.id} type: A is '${nodeA.type}', B is '${nodeB.type}'`);
    }

    // Compare positions
    if (JSON.stringify(nodeA.pos) !== JSON.stringify(nodeB.pos)) {
      differences.push(`Node ${nodeA.id} position differs`);
    }

    // Compare widgets_values
    if (JSON.stringify(nodeA.widgets_values) !== JSON.stringify(nodeB.widgets_values)) {
      differences.push(`Node ${nodeA.id} widgets_values differ`);
    }

    // Compare widget count
    const widgetsA = nodeA.getWidgets ? nodeA.getWidgets() : [];
    const widgetsB = nodeB.getWidgets ? nodeB.getWidgets() : [];

    if (widgetsA.length !== widgetsB.length) {
      differences.push(`Node ${nodeA.id} widget count: A has ${widgetsA.length}, B has ${widgetsB.length}`);
    }
  }

  // Compare links
  const linksA = Object.keys(graphA.links || {}).length;
  const linksB = Object.keys(graphB.links || {}).length;

  if (linksA !== linksB) {
    differences.push(`Link count: A has ${linksA}, B has ${linksB}`);
  }

  return {
    identical: differences.length === 0,
    differences
  };
}

/**
 * Compare inputs or outputs arrays with detailed analysis
 */
function compareInputsOutputs(itemsA: any[], itemsB: any[], type: 'inputs' | 'outputs'): string[] {
  const differences: string[] = [];

  if (!itemsA && !itemsB) return differences;
  if (!itemsA || !itemsB) {
    differences.push(`${type} array existence differs`);
    return differences;
  }

  if (itemsA.length !== itemsB.length) {
    differences.push(`${type} count: ${itemsA.length} vs ${itemsB.length}`);
    return differences;
  }

  for (let i = 0; i < itemsA.length; i++) {
    const itemA = itemsA[i];
    const itemB = itemsB[i];

    // Compare each property
    const keys = new Set([...Object.keys(itemA || {}), ...Object.keys(itemB || {})]);
    for (const key of keys) {
      const valueA = itemA?.[key];
      const valueB = itemB?.[key];

      if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
        differences.push(`${type}[${i}].${key}: ${JSON.stringify(valueA)} vs ${JSON.stringify(valueB)}`);
      }
    }
  }

  return differences;
}

/**
 * Compare all other node properties
 */
function compareNodeProperties(nodeA: any, nodeB: any): string[] {
  const differences: string[] = [];

  // Properties to compare (excluding inputs, outputs, widgets_values which are handled separately)
  const propsToCompare = ['flags', 'order', 'mode', 'color', 'bgcolor', 'title', 'properties', 'pos', 'size'];

  for (const prop of propsToCompare) {
    const valueA = nodeA[prop];
    const valueB = nodeB[prop];

    if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
      differences.push(`${prop}: ${JSON.stringify(valueA)} vs ${JSON.stringify(valueB)}`);
    }
  }

  return differences;
}

/**
 * Compare two workflow JSON objects
 */
function compareWorkflowJSON(jsonA: any, jsonB: any): { identical: boolean; differences: string[] } {
  const differences: string[] = [];

  // Compare node count
  if (jsonA.nodes.length !== jsonB.nodes.length) {
    differences.push(`Node count: A has ${jsonA.nodes.length}, B has ${jsonB.nodes.length}`);
  }

  // Compare each node
  const nodeMapB = new Map(jsonB.nodes.map((n: any) => [n.id, n]));

  for (const nodeA of jsonA.nodes) {
    const nodeB = nodeMapB.get(nodeA.id);
    if (!nodeB) {
      differences.push(`Node ${nodeA.id} exists in A but not in B`);
      continue;
    }

    // Compare essential properties
    if (nodeA.type !== nodeB.type) {
      differences.push(`Node ${nodeA.id} type differs`);
    }

    // Compare widgets_values (handle both array and object formats)
    const widgetsA = JSON.stringify(nodeA.widgets_values);
    const widgetsB = JSON.stringify(nodeB.widgets_values);
    if (widgetsA !== widgetsB) {
      differences.push(`Node ${nodeA.id} (${nodeA.type}) widgets_values differ`);
    }

    // Compare inputs with detailed analysis
    const inputDiffs = compareInputsOutputs(nodeA.inputs, nodeB.inputs, 'inputs');
    if (inputDiffs.length > 0) {
      differences.push(`Node ${nodeA.id} inputs differ: ${inputDiffs.join(', ')}`);
    }

    // Compare outputs with detailed analysis
    const outputDiffs = compareInputsOutputs(nodeA.outputs, nodeB.outputs, 'outputs');
    if (outputDiffs.length > 0) {
      differences.push(`Node ${nodeA.id} outputs differ: ${outputDiffs.join(', ')}`);
    }

    // Compare all other properties
    const propertyDiffs = compareNodeProperties(nodeA, nodeB);
    if (propertyDiffs.length > 0) {
      differences.push(`Node ${nodeA.id} properties differ: ${propertyDiffs.join(', ')}`);
    }
  }

  // Compare links (handle both array and object formats)
  const linksA = jsonA.links || [];
  const linksB = jsonB.links || [];

  if (linksA.length !== linksB.length) {
    differences.push(`Link count: A has ${linksA.length}, B has ${linksB.length}`);
  }

  // Compare subgraphs
  const subgraphsA = (jsonA.subgraphs || jsonA.definitions?.subgraphs || []);
  const subgraphsB = (jsonB.subgraphs || jsonB.definitions?.subgraphs || []);
  if (subgraphsA.length !== subgraphsB.length) {
    differences.push(`Subgraph count: A has ${subgraphsA.length}, B has ${subgraphsB.length}`);
  } else {
    // Basic structural check for each subgraph
    const subgraphMapB = new Map(subgraphsB.map((s: any) => [s.id, s]));
    for (const sA of subgraphsA) {
      if (!subgraphMapB.has(sA.id)) {
        differences.push(`Subgraph ${sA.id} exists in A but not in B`);
      }
    }
  }

  // Compare groups
  const groupsA = jsonA.groups || [];
  const groupsB = jsonB.groups || [];
  if (groupsA.length !== groupsB.length) {
    differences.push(`Group count: A has ${groupsA.length}, B has ${groupsB.length}`);
  }

  return {
    identical: differences.length === 0,
    differences
  };
}

// CLI execution
const main = async () => {
  const args = process.argv.slice(2);

  // Show usage if help requested
  if (args.includes('--help') || args.includes('-h')) {
    console.error('Usage: npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts <workflow-file> [options]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts tests/samples/workflows/sample-workflow.json');
    console.error('  npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts tests/samples/workflows/sample-workflow.json --server http://localhost:8188');
    console.error('');
    console.error('Options:');
    console.error('  --server <url>    ComfyUI server URL (default: from test-config.json)');
    console.error('  --help, -h        Show this help message');
    process.exit(0);
  }

  // Require workflow file as first argument
  if (args.length === 0) {
    console.error('❌ Error: Workflow file is required');
    console.error('Usage: npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts <workflow-file> [options]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts tests/samples/workflows/sample-workflow.json');
    console.error('  npx tsx --tsconfig tsx.config.json tests/integration/serializationTest.ts tests/samples/workflows/sample-workflow.json --server http://localhost:8188');
    process.exit(1);
  }

  // Load test configuration and print it
  testConfig.printConfig();

  // Parse arguments
  const workflowFile = args[0]; // First argument is required workflow file
  let serverUrl: string | undefined = undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--server' && i + 1 < args.length) {
      serverUrl = args[i + 1];
      i++; // Skip next argument
    }
  }

  // Run the test
  try {
    const success = await runSerializationTest(serverUrl, workflowFile);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
};

// Always run main when this file is executed
main().catch(console.error);