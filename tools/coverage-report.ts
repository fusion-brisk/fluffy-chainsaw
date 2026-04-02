/**
 * Coverage Report — static analysis of field pipeline coverage
 *
 * Scans source files with regex to build a field-level coverage matrix:
 *   CSVFields (declared) -> Extension (parsed) -> Schema+Handlers (used)
 *
 * Output: stdout table + tools/coverage-report.json + docs/COVERAGE.md
 *
 * Usage: npx tsx tools/coverage-report.ts
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'packages/plugin/src');
const EXT = path.join(ROOT, 'packages/extension/src');

// -- Helpers --

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractMatches(content: string, regex: RegExp): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

// -- Source A: CSVFields declarations --

function scanCSVFields(): string[] {
  const content = readFile('packages/plugin/src/types/csv-fields.ts');
  return unique(extractMatches(content, /^\s*'(#[\w_-]+)'/gm));
}

// -- Source B: Extension parsing (content.ts) --

function scanExtensionParsing(): string[] {
  const content = readFile('packages/extension/src/content.ts');
  const fields = extractMatches(content, /row\['(#[\w_-]+)'\]\s*=/g);
  const feedPath = path.join(EXT, 'feed-parser.ts');
  if (fs.existsSync(feedPath)) {
    const feedContent = fs.readFileSync(feedPath, 'utf8');
    fields.push(...extractMatches(feedContent, /row\['(#[\w_-]+)'\]\s*=/g));
  }
  return unique(fields);
}

// -- Source C: Schema field references --

function scanSchemas(): { fields: string[]; perContainer: Record<string, string[]> } {
  const schemaDir = path.join(PLUGIN, 'sandbox/schema');
  const perContainer: Record<string, string[]> = {};
  const allFields: string[] = [];

  for (const file of fs.readdirSync(schemaDir)) {
    if (!file.endsWith('.ts')) continue;
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const fieldNames = extractMatches(content, /fieldName:\s*'(#[\w_-]+)'/g);
    const rowReads = extractMatches(content, /row\['(#[\w_-]+)'\]/g);
    const equalsFields = extractMatches(content, /field:\s*'(#[\w_-]+)'/g);
    const combined = unique([...fieldNames, ...rowReads, ...equalsFields]);
    if (combined.length > 0) {
      perContainer[file.replace('.ts', '')] = combined;
    }
    allFields.push(...combined);
  }
  return { fields: unique(allFields), perContainer };
}

// -- Source D: Handler field references --

function scanHandlers(): { fields: string[]; perHandler: Record<string, string[]> } {
  const handlerDir = path.join(PLUGIN, 'sandbox/handlers');
  const perHandler: Record<string, string[]> = {};
  const allFields: string[] = [];

  for (const file of fs.readdirSync(handlerDir)) {
    if (!file.endsWith('.ts')) continue;
    const content = fs.readFileSync(path.join(handlerDir, file), 'utf8');
    const fields = extractMatches(content, /row\['(#[\w_-]+)'\]/g);
    if (fields.length > 0) {
      perHandler[file.replace('.ts', '')] = unique(fields);
      allFields.push(...fields);
    }
  }
  return { fields: unique(allFields), perHandler };
}

// -- Source E: Component map keys --

interface ComponentKeyInfo {
  name: string;
  key: string;
  isStale: boolean;
}

function scanComponentKeys(): ComponentKeyInfo[] {
  const content = readFile('packages/plugin/src/sandbox/page-builder/component-map.ts');
  const results: ComponentKeyInfo[] = [];
  const blockRegex = /(\w+):\s*\{[^}]*key:\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(content)) !== null) {
    results.push({
      name: m[1],
      key: m[2],
      isStale: m[2] === '' || m[2].includes('TODO'),
    });
  }
  return results;
}

// -- Gap Analysis --

interface Gap {
  type:
    | 'PARSED_NOT_USED'
    | 'DECLARED_NOT_PARSED'
    | 'MAPPED_NOT_DECLARED'
    | 'DEAD_FIELD'
    | 'STALE_KEY';
  field: string;
  detail: string;
}

function analyzeGaps(
  declared: string[],
  parsed: string[],
  schemaFields: string[],
  handlerFields: string[],
  componentKeys: ComponentKeyInfo[],
): Gap[] {
  const gaps: Gap[] = [];
  const used = new Set([...schemaFields, ...handlerFields]);
  const parsedSet = new Set(parsed);
  const declaredSet = new Set(declared);

  const INTERNAL_FIELDS = new Set([
    '#_containerId',
    '#containerType',
    '#serpItemId',
    '#serpItemPosition',
    '#platform',
    '#SnippetType',
    '#ProductURL',
    '#query',
  ]);

  for (const field of parsed) {
    if (!used.has(field) && !INTERNAL_FIELDS.has(field)) {
      gaps.push({
        type: 'PARSED_NOT_USED',
        field,
        detail: 'Extension parses but no schema/handler reads',
      });
    }
  }

  for (const field of declared) {
    if (!parsedSet.has(field) && !INTERNAL_FIELDS.has(field) && !field.startsWith('#Feed_')) {
      gaps.push({
        type: 'DECLARED_NOT_PARSED',
        field,
        detail: 'In CSVFields but extension never sets',
      });
    }
  }

  for (const field of [...schemaFields, ...handlerFields]) {
    if (!declaredSet.has(field)) {
      gaps.push({
        type: 'MAPPED_NOT_DECLARED',
        field,
        detail: 'Schema/handler reads but not in CSVFields',
      });
    }
  }

  for (const field of declared) {
    if (
      !parsedSet.has(field) &&
      !used.has(field) &&
      !INTERNAL_FIELDS.has(field) &&
      !field.startsWith('#Feed_')
    ) {
      gaps.push({ type: 'DEAD_FIELD', field, detail: 'In CSVFields, never parsed, never used' });
    }
  }

  for (const ck of componentKeys) {
    if (ck.isStale) {
      gaps.push({
        type: 'STALE_KEY',
        field: ck.name,
        detail: `Component key empty or TODO: "${ck.key}"`,
      });
    }
  }

  // DEAD_FIELD subsumes DECLARED_NOT_PARSED
  const deadFields = new Set(gaps.filter((g) => g.type === 'DEAD_FIELD').map((g) => g.field));
  return gaps.filter((g) => !(g.type === 'DECLARED_NOT_PARSED' && deadFields.has(g.field)));
}

// -- Markdown Output --

function generateMarkdown(
  declared: string[],
  parsed: string[],
  schemas: ReturnType<typeof scanSchemas>,
  handlers: ReturnType<typeof scanHandlers>,
  componentKeys: ComponentKeyInfo[],
  gaps: Gap[],
): string {
  const lines: string[] = [];
  const now = new Date()
    .toISOString()
    .replace(/T/, ' ')
    .replace(/\.\d+Z/, '');

  lines.push('# Coverage Report (auto-generated)');
  lines.push(`Generated: ${now}\n`);
  lines.push('## Summary\n');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| CSVFields declared | ${declared.length} |`);
  lines.push(`| Extension parses | ${parsed.length} |`);
  lines.push(`| Schema maps | ${schemas.fields.length} |`);
  lines.push(`| Handler reads | ${handlers.fields.length} |`);
  lines.push(
    `| Total used (schema + handlers) | ${new Set([...schemas.fields, ...handlers.fields]).size} |`,
  );
  lines.push(`| Component keys | ${componentKeys.length} |`);
  lines.push(`| Stale keys | ${componentKeys.filter((k) => k.isStale).length} |`);
  lines.push(`| **Gaps** | **${gaps.length}** |`);
  lines.push('');

  lines.push('## Per-Container Schema Coverage\n');
  lines.push('| Container | Schema fields | Handler fields |');
  lines.push('|-----------|--------------|----------------|');
  const allContainers = new Set([
    ...Object.keys(schemas.perContainer),
    ...Object.keys(handlers.perHandler),
  ]);
  for (const name of [...allContainers].sort()) {
    const s = schemas.perContainer[name]?.length || 0;
    const h = handlers.perHandler[name]?.length || 0;
    lines.push(`| ${name} | ${s} | ${h} |`);
  }
  lines.push('');

  const gapTypes: Gap['type'][] = [
    'STALE_KEY',
    'MAPPED_NOT_DECLARED',
    'PARSED_NOT_USED',
    'DEAD_FIELD',
  ];
  for (const type of gapTypes) {
    const typeGaps = gaps.filter((g) => g.type === type);
    if (typeGaps.length === 0) continue;
    lines.push(`## ${type} (${typeGaps.length})\n`);
    for (const g of typeGaps) {
      lines.push(`- \`${g.field}\` — ${g.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// -- Main --

function main(): void {
  console.log('Scanning sources...\n');

  const declared = scanCSVFields();
  const parsed = scanExtensionParsing();
  const schemas = scanSchemas();
  const handlers = scanHandlers();
  const componentKeys = scanComponentKeys();
  const gaps = analyzeGaps(declared, parsed, schemas.fields, handlers.fields, componentKeys);

  const report = {
    generated: new Date().toISOString(),
    counts: {
      declared: declared.length,
      parsed: parsed.length,
      schemaFields: schemas.fields.length,
      handlerFields: handlers.fields.length,
      totalUsed: new Set([...schemas.fields, ...handlers.fields]).size,
      componentKeys: componentKeys.length,
      staleKeys: componentKeys.filter((k) => k.isStale).length,
      gaps: gaps.length,
    },
    gaps,
    perContainer: schemas.perContainer,
    perHandler: handlers.perHandler,
    componentKeys,
  };

  const jsonPath = path.join(ROOT, 'tools/coverage-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const markdown = generateMarkdown(declared, parsed, schemas, handlers, componentKeys, gaps);
  const mdPath = path.join(ROOT, 'docs/COVERAGE.md');
  fs.writeFileSync(mdPath, markdown);

  console.log(`CSVFields declared:  ${declared.length}`);
  console.log(`Extension parses:    ${parsed.length}`);
  console.log(`Schema maps:         ${schemas.fields.length}`);
  console.log(`Handler reads:       ${handlers.fields.length}`);
  console.log(`Total used:          ${new Set([...schemas.fields, ...handlers.fields]).size}`);
  console.log(
    `Component keys:      ${componentKeys.length} (${componentKeys.filter((k) => k.isStale).length} stale)`,
  );
  console.log(`\nGaps found: ${gaps.length}`);

  const byType: Record<string, number> = {};
  for (const g of gaps) {
    byType[g.type] = (byType[g.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nJSON:     ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
}

main();
