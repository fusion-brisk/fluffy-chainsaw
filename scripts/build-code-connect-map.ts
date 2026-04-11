/**
 * build-code-connect-map.ts
 *
 * Combines library inventory with Code Connect data collected from Figma MCP
 * to produce a unified code-connect-map.json for the JSX generator.
 *
 * Inputs:
 *   scripts/output/library-inventory.json — from parse-library-inventory.ts
 *   Hardcoded Code Connect data — collected from Figma MCP get_code_connect_map
 *
 * Output:
 *   scripts/output/code-connect-map.json
 *   scripts/output/code-connect-map.md
 *
 * Usage: npx tsx scripts/build-code-connect-map.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Code Connect data collected from Figma MCP (2026-04-11)
// ---------------------------------------------------------------------------

interface CodeConnectEntry {
  componentName: string;
  importPath: string;
  snippet?: string;
  source: 'code-connect' | 'user-confirmed' | 'inferred';
}

/**
 * Confirmed Code Connect mappings from Figma MCP + user input.
 * Key = Figma component set name (or component name).
 */
const CONFIRMED_CODE_CONNECT: Record<string, CodeConnectEntry> = {
  // --- From Figma MCP get_code_connect_map ---
  ELabelRating: {
    componentName: 'ELabelRating',
    importPath: '@oceania/depot/components/ELabelRating',
    snippet: '<ELabelRating size="xs" view="white" value={4.5}/>',
    source: 'code-connect',
  },
  LabelGroup: {
    componentName: 'LabelGroup',
    importPath: '@oceania/depot/components/LabelGroup',
    source: 'code-connect',
  },
  EPriceBarometer: {
    componentName: 'EPriceBarometer',
    importPath: '@oceania/depot/components/EPriceBarometer',
    snippet: '<EPriceBarometer/>',
    source: 'code-connect',
  },
  EQuote: {
    componentName: 'EQuote',
    importPath: '@oceania/depot/components/EQuote',
    source: 'code-connect',
  },
  Line: {
    componentName: 'Line',
    importPath: '@oceania/depot/components/Line',
    snippet: '<Line weight="regular">Курьер</Line>',
    source: 'code-connect',
  },
  EDeliveryGroup: {
    componentName: 'EDeliveryGroup',
    importPath: '@oceania/depot/components/EDeliveryGroup',
    source: 'code-connect',
  },
  EBnplGroup: {
    componentName: 'EBnplGroup',
    importPath: '@oceania/depot/components/EBnplGroup',
    snippet: '<EBnplGroup items={["Сплит","Долями","МТС Пэй и др."]}/>',
    source: 'code-connect',
  },

  // --- From user (confirmed import statement) ---
  EProductSnippet2: {
    componentName: 'EProductSnippet2',
    importPath: '@oceania/depot/components/EProductSnippet2',
    snippet:
      '<EProductSnippet2 linkProps={{ url: "https://yandex.ru/products/" }} thumbProps={{ images: [] }} />',
    source: 'user-confirmed',
  },
};

/**
 * Figma name → React name overrides.
 * When Figma component name doesn't match the React import exactly.
 */
const FIGMA_TO_REACT_NAME: Record<string, string> = {
  ELabelGroup: 'LabelGroup',
  'Line / Combo': 'LineCombo',
  'Line / EQuote': 'EQuote',
  'Line / Official Shop': 'LineOfficialShop',
  'EProductSpecs, EProductSpecsFull': 'EProductSpecs',
  'InfoCard, Onboarding': 'InfoCard',
  'Control / EProductTabs': 'EProductTabs',
  'Control / Favorite': 'Favorite',
  'Image Gallery / Preview': 'ImageGalleryPreview',
  'Image Gallery': 'ImageGallery',
  'Image Overlay Controller': 'ImageOverlayController',
  'Image Placeholder': 'ImagePlaceholder',
  'Image Ratio': 'ImageRatio',
  'EPrice / Barometer Description': 'EPriceBarometerDescription',
  'ShopInfo-Bnpl': 'ShopInfoBnpl',
  'Empty State': 'EmptyState',
  'Info block': 'InfoBlock',
  '[Beta] / ListItem': 'ListItem',
  'Mini Illustaration': 'MiniIllustration',
};

/**
 * Figma names that are clearly NOT React components
 * (test pages, internal drafts, Russian-named duplicates).
 */
const NON_COMPONENT_NAMES = new Set(['Как сейчас', 'TestFintech']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryComponentSet {
  name: string;
  key: string;
  nodeId: string;
  section: string;
  page: string;
  description: string;
  propertyDefinitions: Array<{
    name: string;
    type: string;
    defaultValue: string | boolean;
    options?: string[];
  }>;
  variants: Array<{
    name: string;
    key: string;
    nodeId: string;
    properties: Record<string, string>;
  }>;
}

interface Inventory {
  componentSets: InventoryComponentSet[];
}

interface CodeConnectMapEntry {
  /** Figma component set name */
  figmaName: string;
  /** Figma component set key */
  figmaSetKey: string;
  /** Figma node ID */
  figmaNodeId: string;
  /** Section in Figma library (Organisms, Molecules, Atoms, etc.) */
  section: string;
  /** React component name */
  reactName: string;
  /** Import path */
  importPath: string;
  /** Example JSX snippet */
  snippet?: string;
  /** How we know this mapping */
  source: 'code-connect' | 'user-confirmed' | 'inferred';
  /** Variant property definitions */
  variantProps: Array<{
    name: string;
    type: string;
    defaultValue: string | boolean;
    options?: string[];
  }>;
  /** Boolean property names (toggleable in JSX) */
  booleanProps: string[];
  /** Text property names (string props in JSX) */
  textProps: string[];
  /** Total variant count */
  variantCount: number;
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

function inferReactName(figmaName: string): string {
  // Check overrides first
  if (FIGMA_TO_REACT_NAME[figmaName]) {
    return FIGMA_TO_REACT_NAME[figmaName];
  }

  // Strip known prefixes/patterns
  let name = figmaName;

  // "Graphic / Alfa-Bank" → skip (graphics are not React components)
  // "Icon / Cart" → skip (icons have different import pattern)
  // For regular components, use as-is
  return name;
}

function inferImportPath(reactName: string): string {
  return `@oceania/depot/components/${reactName}`;
}

function isGraphicOrIcon(figmaName: string): boolean {
  return (
    figmaName.startsWith('Graphic /') ||
    figmaName.startsWith('Graphics /') ||
    figmaName.startsWith('Icon /') ||
    figmaName.startsWith('Mini Illustaration') ||
    figmaName === 'SkeletonElement' ||
    NON_COMPONENT_NAMES.has(figmaName)
  );
}

function main() {
  const outDir = path.resolve(__dirname, 'output');

  // Read inventory
  const inventory: Inventory = JSON.parse(
    fs.readFileSync(path.join(outDir, 'library-inventory.json'), 'utf-8'),
  );

  const entries: CodeConnectMapEntry[] = [];

  for (const cs of inventory.componentSets) {
    // Skip graphics/icons — they have different import patterns
    const isGraphic = isGraphicOrIcon(cs.name);

    // Check if we have confirmed Code Connect
    const confirmed =
      CONFIRMED_CODE_CONNECT[cs.name] || CONFIRMED_CODE_CONNECT[inferReactName(cs.name)];

    const reactName = confirmed?.componentName || inferReactName(cs.name);
    const importPath = confirmed?.importPath || inferImportPath(reactName);
    const source: CodeConnectMapEntry['source'] = confirmed ? confirmed.source : 'inferred';

    const variantProps = cs.propertyDefinitions.filter((p) => p.type === 'VARIANT');
    const booleanProps = cs.propertyDefinitions
      .filter((p) => p.type === 'BOOLEAN')
      .map((p) => p.name);
    const textProps = cs.propertyDefinitions.filter((p) => p.type === 'TEXT').map((p) => p.name);

    entries.push({
      figmaName: cs.name,
      figmaSetKey: cs.key,
      figmaNodeId: cs.nodeId,
      section: cs.section,
      reactName,
      importPath: isGraphic ? `(graphic — not a React component)` : importPath,
      snippet: confirmed?.snippet,
      source: isGraphic ? 'inferred' : source,
      variantProps: variantProps.map((p) => ({
        name: p.name,
        type: p.type,
        defaultValue: p.defaultValue,
        options: p.options,
      })),
      booleanProps,
      textProps,
      variantCount: cs.variants.length,
    });
  }

  // Sort: confirmed first, then by section
  entries.sort((a, b) => {
    const sourceOrder = { 'code-connect': 0, 'user-confirmed': 1, inferred: 2 };
    const sa = sourceOrder[a.source];
    const sb = sourceOrder[b.source];
    if (sa !== sb) return sa - sb;
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.figmaName.localeCompare(b.figmaName);
  });

  // Write JSON
  const jsonPath = path.join(outDir, 'code-connect-map.json');
  fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2), 'utf-8');

  // Stats
  const confirmed = entries.filter((e) => e.source !== 'inferred').length;
  const inferred = entries.filter(
    (e) => e.source === 'inferred' && !e.importPath.includes('graphic'),
  ).length;
  const graphics = entries.filter((e) => e.importPath.includes('graphic')).length;

  console.log(
    `Written: ${jsonPath} (${entries.length} total: ${confirmed} confirmed, ${inferred} inferred, ${graphics} graphics)`,
  );

  // Write Markdown
  const mdPath = path.join(outDir, 'code-connect-map.md');
  fs.writeFileSync(mdPath, generateMarkdown(entries), 'utf-8');
  console.log(`Written: ${mdPath}`);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function generateMarkdown(entries: CodeConnectMapEntry[]): string {
  const lines: string[] = [];
  lines.push('# Code Connect Map — DC \u00b7 Ecom \u2192 React');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Import pattern: \`@oceania/depot/components/{ComponentName}\``);
  lines.push('');

  // Summary
  const confirmed = entries.filter((e) => e.source === 'code-connect');
  const userConfirmed = entries.filter((e) => e.source === 'user-confirmed');
  const inferred = entries.filter(
    (e) => e.source === 'inferred' && !e.importPath.includes('graphic'),
  );
  const graphics = entries.filter((e) => e.importPath.includes('graphic'));

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Source | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Code Connect (from Figma) | ${confirmed.length} |`);
  lines.push(`| User confirmed | ${userConfirmed.length} |`);
  lines.push(`| Inferred (need verification) | ${inferred.length} |`);
  lines.push(`| Graphics/Icons (not React components) | ${graphics.length} |`);
  lines.push(`| **Total** | **${entries.length}** |`);
  lines.push('');

  // Confirmed mappings
  lines.push('## Confirmed Mappings');
  lines.push('');
  lines.push('| Figma Name | React Import | Snippet | Source |');
  lines.push('|------------|-------------|---------|--------|');
  for (const e of [...confirmed, ...userConfirmed]) {
    const snippet = e.snippet ? `\`${e.snippet.slice(0, 60)}...\`` : '-';
    lines.push(`| ${e.figmaName} | \`${e.reactName}\` | ${snippet} | ${e.source} |`);
  }
  lines.push('');

  // Inferred by section
  lines.push('## Inferred Mappings (need verification)');
  lines.push('');

  const bySection = new Map<string, CodeConnectMapEntry[]>();
  for (const e of inferred) {
    if (!bySection.has(e.section)) bySection.set(e.section, []);
    bySection.get(e.section)!.push(e);
  }

  for (const [section, sectionEntries] of bySection) {
    lines.push(`### ${section}`);
    lines.push('');
    lines.push('| Figma Name | Inferred React Name | Variant Props | Boolean Props | Text Props |');
    lines.push('|------------|-------------------|---------------|---------------|------------|');
    for (const e of sectionEntries) {
      const vProps =
        e.variantProps.map((p) => `${p.name}(${p.options?.join('|') || '?'})`).join(', ') || '-';
      const bProps = e.booleanProps.join(', ') || '-';
      const tProps = e.textProps.join(', ') || '-';
      lines.push(`| ${e.figmaName} | \`${e.reactName}\` | ${vProps} | ${bProps} | ${tProps} |`);
    }
    lines.push('');
  }

  // Graphics (not mapped)
  lines.push('## Graphics / Icons (not React components)');
  lines.push('');
  lines.push('These are visual assets, not React components. They use a different import pattern.');
  lines.push('');
  lines.push('| Figma Name | Variants |');
  lines.push('|------------|----------|');
  for (const e of graphics) {
    lines.push(`| ${e.figmaName} | ${e.variantCount} |`);
  }
  lines.push('');

  // Full reference
  lines.push('## Full Import Reference');
  lines.push('');
  lines.push('```typescript');
  lines.push('// Confirmed imports (from Code Connect + user)');
  for (const e of [...confirmed, ...userConfirmed]) {
    lines.push(`import { ${e.reactName} } from '${e.importPath}';`);
  }
  lines.push('');
  lines.push('// Inferred imports (verify before use)');
  for (const e of inferred) {
    lines.push(`import { ${e.reactName} } from '${e.importPath}'; // inferred`);
  }
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
main();
