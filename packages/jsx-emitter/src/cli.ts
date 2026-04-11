/**
 * CLI tool: read Figma node JSON and print JSX to stdout.
 *
 * Usage: npx tsx packages/jsx-emitter/src/cli.ts <figma-node.json>
 *
 * Input formats accepted:
 *   1. REST API response: { nodes: { "nodeId": { document: {...} } } }
 *   2. Raw node: { id: "...", name: "...", type: "...", children: [...] }
 */
import * as fs from 'fs';
import { walkTree } from './tree-walker';
import { emitJSX } from './jsx-emitter';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx packages/jsx-emitter/src/cli.ts <node.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));

// Detect format: REST API response vs raw node
let doc: unknown;
if (raw.nodes && typeof raw.nodes === 'object') {
  const nodeId = Object.keys(raw.nodes)[0];
  if (!nodeId) {
    console.error('Error: nodes object is empty');
    process.exit(1);
  }
  doc = raw.nodes[nodeId].document;
} else if (raw.id && raw.type) {
  doc = raw;
} else {
  console.error('Error: unrecognized JSON format. Expected REST API response or raw Figma node.');
  process.exit(1);
}

const tree = walkTree(doc as Parameters<typeof walkTree>[0]);
const { jsx, imports } = emitJSX(tree);

console.log('// --- Imports ---');
console.log(imports || '// (no mapped components found)');
console.log('');
console.log('// --- JSX ---');
console.log(jsx);
