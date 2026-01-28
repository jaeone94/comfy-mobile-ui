import fs from 'fs';
import path from 'path';
import { SubgraphExtractService } from '../../src/core/services/SubgraphExtractService';

async function runTest() {
    const args = process.argv.slice(2);
    const workflowFile = args[0] || 'tests/samples/workflows/1.I2V_SubGraph.json';

    console.log(`🚀 Starting Subgraph Extract Test`);
    console.log(`📁 Input Workflow: ${workflowFile}`);

    if (!fs.existsSync(workflowFile)) {
        console.error(`❌ Error: Workflow file not found: ${workflowFile}`);
        process.exit(1);
    }

    // 1. Load workflow
    const workflowRaw = fs.readFileSync(workflowFile, 'utf-8');
    const workflowJson = JSON.parse(workflowRaw);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(process.cwd(), 'tests', 'output', `subgraph-extract-test-${timestamp}`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save original
    fs.writeFileSync(path.join(outputDir, '01-original.json'), JSON.stringify(workflowJson, null, 2));

    // 2. Execute subgraph extraction
    console.log(`🔄 Extracting subgraphs...`);
    const startTime = Date.now();
    const resultWorkflow = SubgraphExtractService.extractAllSubgraphs(workflowJson);
    const duration = Date.now() - startTime;
    console.log(`✅ Extraction complete in ${duration}ms`);

    // 3. Save result
    fs.writeFileSync(path.join(outputDir, '02-extracted.json'), JSON.stringify(resultWorkflow, null, 2));
    console.log(`💾 Result saved to: ${path.join(outputDir, '02-extracted.json')}`);

    // 4. Simple verification
    const originalSubgraphNodes = workflowJson.nodes.filter((n: any) => {
        const type = String(n.type);
        return type.length === 36 && type.split('-').length === 5;
    });

    const resultSubgraphNodes = resultWorkflow.nodes.filter((n: any) => {
        const type = String(n.type);
        return type.length === 36 && type.split('-').length === 5;
    });

    console.log(`\n📊 Summary:`);
    console.log(`- Original Subgraph Nodes: ${originalSubgraphNodes.length}`);
    console.log(`- Resulting Subgraph Nodes: ${resultSubgraphNodes.length} (Should be 0)`);
    console.log(`- Total Nodes: ${workflowJson.nodes.length} -> ${resultWorkflow.nodes.length}`);
    console.log(`- Total Links: ${workflowJson.links.length} -> ${resultWorkflow.links.length}`);

    const setNodes = resultWorkflow.nodes.filter((n: any) => n.type === 'easy setNode');
    const getNodes = resultWorkflow.nodes.filter((n: any) => n.type === 'easy getNode');
    console.log(`- Easy Set Nodes: ${setNodes.length}`);
    console.log(`- Easy Get Nodes: ${getNodes.length}`);

    // Check for duplicate IDs
    const nodeIds = resultWorkflow.nodes.map((n: any) => n.id);
    const uniqueNodeIds = new Set(nodeIds);
    if (nodeIds.length !== uniqueNodeIds.size) {
        console.error(`❌ Error: Duplicate Node IDs found!`);
    } else {
        console.log(`✅ No duplicate Node IDs found.`);
    }

    const linkIds = resultWorkflow.links.map((l: any) => l[0]);
    const uniqueLinkIds = new Set(linkIds);
    if (linkIds.length !== uniqueLinkIds.size) {
        console.error(`❌ Error: Duplicate Link IDs found!`);
    } else {
        console.log(`✅ No duplicate Link IDs found.`);
    }

    console.log(`\n✨ Test finished successfully!`);
}

runTest().catch(console.error);
