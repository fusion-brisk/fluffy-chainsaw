/**
 * parse-library-inventory.ts
 *
 * Parses Figma REST API output (component_sets, components, styles, nodes)
 * and produces:
 *   scripts/output/library-inventory.json
 *   scripts/output/library-inventory.md
 *   scripts/output/map-coverage-report.md
 *
 * Usage: npx tsx scripts/parse-library-inventory.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FigmaContainingFrame {
  name: string;
  nodeId: string;
  pageId: string;
  pageName: string;
}

interface FigmaComponentMeta {
  key: string;
  file_key: string;
  node_id: string;
  name: string;
  description: string;
  containing_frame: FigmaContainingFrame;
  created_at: string;
  updated_at: string;
}

interface FigmaStyleMeta {
  key: string;
  file_key: string;
  node_id: string;
  name: string;
  description: string;
  style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
}

interface FigmaNodeChild {
  id: string;
  name: string;
  type: string;
}

interface FigmaPropertyDef {
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  defaultValue: string | boolean;
  variantOptions?: string[];
  preferredValues?: Array<{ type: string; key: string }>;
}

interface FigmaNodeDocument {
  id: string;
  name: string;
  type: string;
  children?: FigmaNodeChild[];
  componentPropertyDefinitions?: Record<string, FigmaPropertyDef>;
}

interface FigmaNodeResponse {
  document: FigmaNodeDocument;
}

interface ParsedProperty {
  name: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  defaultValue: string | boolean;
  options?: string[]; // for VARIANT type
}

interface ParsedVariant {
  name: string;
  key: string;
  nodeId: string;
  properties: Record<string, string>;
}

interface ParsedComponentSet {
  name: string;
  key: string;
  nodeId: string;
  section: string;
  page: string;
  description: string;
  propertyDefinitions: ParsedProperty[];
  variants: ParsedVariant[];
}

interface ParsedStyle {
  name: string;
  key: string;
  nodeId: string;
  styleType: string;
}

interface InventoryOutput {
  fileKey: string;
  libraryName: string;
  exportedAt: string;
  componentSets: ParsedComponentSet[];
  standaloneComponents: Array<{ name: string; key: string; nodeId: string; section: string }>;
  styles: ParsedStyle[];
  summary: {
    totalComponentSets: number;
    totalVariants: number;
    totalStandaloneComponents: number;
    totalStyles: number;
    sections: string[];
    allPropertyNames: string[];
    booleanPropertyNames: string[];
    variantPropertyNames: string[];
    textPropertyNames: string[];
    instanceSwapPropertyNames: string[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  const parts = name.split(',').map((s) => s.trim());
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      props[key] = value;
    }
  }
  return props;
}

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// Strip Figma hash suffixes like "#6083:9" from property names
function cleanPropName(name: string): string {
  return name.replace(/#\d+:\d+$/, '').trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const outDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  // Read API responses
  const setsData = readJson<{ meta: { component_sets: FigmaComponentMeta[] } }>(
    '/tmp/dc-ecom-component-sets.json',
  );
  const compsData = readJson<{ meta: { components: FigmaComponentMeta[] } }>(
    '/tmp/dc-ecom-components.json',
  );
  const stylesData = readJson<{ meta: { styles: FigmaStyleMeta[] } }>('/tmp/dc-ecom-styles.json');
  const nodesData = readJson<{ nodes: Record<string, FigmaNodeResponse> }>(
    '/tmp/dc-ecom-nodes.json',
  );

  const componentSets = setsData.meta.component_sets;
  const allComponents = compsData.meta.components;
  const allStyles = stylesData.meta.styles;
  const nodesMap = nodesData.nodes;

  // Build component key lookup: nodeId → key (from /components endpoint)
  const compKeyByNodeId = new Map<string, string>();
  for (const comp of allComponents) {
    compKeyByNodeId.set(comp.node_id, comp.key);
  }

  // Build parsed component sets using nodes API for parent-child relationships
  const allPropertyNames = new Set<string>();
  const propsByType = {
    BOOLEAN: new Set<string>(),
    VARIANT: new Set<string>(),
    TEXT: new Set<string>(),
    INSTANCE_SWAP: new Set<string>(),
  };

  // Track which component node IDs are variants (belong to a set)
  const variantNodeIds = new Set<string>();

  const parsedSets: ParsedComponentSet[] = componentSets.map((cs) => {
    const nodeData = nodesMap[cs.node_id];
    const doc = nodeData?.document;

    // Extract property definitions from componentPropertyDefinitions
    const propDefs: ParsedProperty[] = [];
    if (doc?.componentPropertyDefinitions) {
      for (const [rawName, def] of Object.entries(doc.componentPropertyDefinitions)) {
        const name = cleanPropName(rawName);
        allPropertyNames.add(name);
        if (def.type in propsByType) {
          propsByType[def.type as keyof typeof propsByType].add(name);
        }
        propDefs.push({
          name,
          type: def.type,
          defaultValue: def.defaultValue,
          options: def.variantOptions,
        });
      }
    }

    // Extract variants from children
    const children = doc?.children || [];
    const variants: ParsedVariant[] = children.map((child) => {
      const key = compKeyByNodeId.get(child.id) || '';
      variantNodeIds.add(child.id);
      const properties = parseVariantName(child.name);
      return {
        name: child.name,
        key,
        nodeId: child.id,
        properties,
      };
    });

    return {
      name: cs.name,
      key: cs.key,
      nodeId: cs.node_id,
      section: cs.containing_frame?.name || 'Unknown',
      page: cs.containing_frame?.pageName || 'Unknown',
      description: cs.description || '',
      propertyDefinitions: propDefs.sort((a, b) => a.name.localeCompare(b.name)),
      variants,
    };
  });

  // Sort sets by section, then name
  parsedSets.sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.name.localeCompare(b.name);
  });

  // Standalone components = those NOT in variantNodeIds and NOT a component set
  const setNodeIds = new Set(componentSets.map((cs) => cs.node_id));
  const standaloneComponents = allComponents
    .filter((c) => !variantNodeIds.has(c.node_id) && !setNodeIds.has(c.node_id))
    .map((c) => ({
      name: c.name,
      key: c.key,
      nodeId: c.node_id,
      section: c.containing_frame?.name || 'Unknown',
    }));

  // Parse styles
  const parsedStyles: ParsedStyle[] = allStyles.map((s) => ({
    name: s.name,
    key: s.key,
    nodeId: s.node_id,
    styleType: s.style_type,
  }));
  parsedStyles.sort((a, b) => a.name.localeCompare(b.name));

  // Summary
  const sections = [...new Set(parsedSets.map((s) => s.section))].sort();
  const totalVariants = parsedSets.reduce((sum, cs) => sum + cs.variants.length, 0);

  const inventory: InventoryOutput = {
    fileKey: 'x8INBftMZ21bme9kwZDu1A',
    libraryName: 'DC \u00b7 Ecom',
    exportedAt: new Date().toISOString(),
    componentSets: parsedSets,
    standaloneComponents,
    styles: parsedStyles,
    summary: {
      totalComponentSets: parsedSets.length,
      totalVariants,
      totalStandaloneComponents: standaloneComponents.length,
      totalStyles: parsedStyles.length,
      sections,
      allPropertyNames: [...allPropertyNames].sort(),
      booleanPropertyNames: [...propsByType.BOOLEAN].sort(),
      variantPropertyNames: [...propsByType.VARIANT].sort(),
      textPropertyNames: [...propsByType.TEXT].sort(),
      instanceSwapPropertyNames: [...propsByType.INSTANCE_SWAP].sort(),
    },
  };

  // Write JSON
  const jsonPath = path.join(outDir, 'library-inventory.json');
  fs.writeFileSync(jsonPath, JSON.stringify(inventory, null, 2), 'utf-8');
  console.log(
    `Written: ${jsonPath} (${parsedSets.length} sets, ${totalVariants} variants, ${standaloneComponents.length} standalone, ${parsedStyles.length} styles)`,
  );

  // Write Markdown
  const mdPath = path.join(outDir, 'library-inventory.md');
  fs.writeFileSync(mdPath, generateMarkdown(inventory), 'utf-8');
  console.log(`Written: ${mdPath}`);

  // Write coverage report
  const reportPath = path.join(outDir, 'map-coverage-report.md');
  fs.writeFileSync(reportPath, generateCoverageReport(inventory), 'utf-8');
  console.log(`Written: ${reportPath}`);
}

// ---------------------------------------------------------------------------
// Markdown generator
// ---------------------------------------------------------------------------

function generateMarkdown(inv: InventoryOutput): string {
  const lines: string[] = [];
  lines.push(`# DC \u00b7 Ecom Library Inventory`);
  lines.push('');
  lines.push(`> Exported: ${inv.exportedAt}`);
  lines.push(`> File key: \`${inv.fileKey}\``);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Component Sets:** ${inv.summary.totalComponentSets}`);
  lines.push(`- **Total Variants:** ${inv.summary.totalVariants}`);
  lines.push(`- **Standalone Components:** ${inv.summary.totalStandaloneComponents}`);
  lines.push(`- **Styles:** ${inv.summary.totalStyles}`);
  lines.push(`- **Sections:** ${inv.summary.sections.join(', ')}`);
  lines.push('');

  lines.push('### Property Types');
  lines.push('');
  lines.push(
    `**Boolean (${inv.summary.booleanPropertyNames.length}):** ${inv.summary.booleanPropertyNames.map((p) => `\`${p}\``).join(', ') || '_none_'}`,
  );
  lines.push('');
  lines.push(
    `**Variant (${inv.summary.variantPropertyNames.length}):** ${inv.summary.variantPropertyNames.map((p) => `\`${p}\``).join(', ') || '_none_'}`,
  );
  lines.push('');
  lines.push(
    `**Text (${inv.summary.textPropertyNames.length}):** ${inv.summary.textPropertyNames.map((p) => `\`${p}\``).join(', ') || '_none_'}`,
  );
  lines.push('');
  lines.push(
    `**Instance Swap (${inv.summary.instanceSwapPropertyNames.length}):** ${inv.summary.instanceSwapPropertyNames.map((p) => `\`${p}\``).join(', ') || '_none_'}`,
  );
  lines.push('');

  // Component sets grouped by section
  lines.push('## Component Sets');
  lines.push('');

  const bySection = new Map<string, typeof inv.componentSets>();
  for (const cs of inv.componentSets) {
    if (!bySection.has(cs.section)) bySection.set(cs.section, []);
    bySection.get(cs.section)!.push(cs);
  }

  for (const [section, sets] of bySection) {
    lines.push(`### ${section}`);
    lines.push('');

    for (const cs of sets) {
      lines.push(`#### ${cs.name}`);
      lines.push('');
      lines.push(`- **Set Key:** \`${cs.key}\``);
      lines.push(`- **Node ID:** \`${cs.nodeId}\``);
      lines.push(`- **Page:** ${cs.page}`);
      if (cs.description) {
        const desc = cs.description.replace(/\n/g, ' ').slice(0, 200);
        lines.push(`- **Description:** ${desc}`);
      }
      lines.push(`- **Variants:** ${cs.variants.length}`);
      lines.push('');

      // Property definitions
      if (cs.propertyDefinitions.length > 0) {
        lines.push('**Properties:**');
        lines.push('');
        lines.push('| Property | Type | Default | Options |');
        lines.push('|----------|------|---------|---------|');
        for (const prop of cs.propertyDefinitions) {
          const defaultStr =
            typeof prop.defaultValue === 'boolean'
              ? String(prop.defaultValue)
              : String(prop.defaultValue).slice(0, 30);
          const optionsStr = prop.options ? prop.options.join(', ') : '-';
          lines.push(`| \`${prop.name}\` | ${prop.type} | ${defaultStr} | ${optionsStr} |`);
        }
        lines.push('');
      }

      // Variants table
      if (cs.variants.length > 0) {
        const variantPropNames = new Set<string>();
        cs.variants.forEach((v) =>
          Object.keys(v.properties).forEach((k) => variantPropNames.add(k)),
        );
        const propArr = [...variantPropNames].sort();

        lines.push('**Variants:**');
        lines.push('');
        lines.push(`| # | Key | ${propArr.join(' | ')} |`);
        lines.push(`|---|-----|${propArr.map(() => '---').join('|')}|`);

        const limit = 20;
        const showVariants = cs.variants.slice(0, limit);
        showVariants.forEach((v, i) => {
          const vals = propArr.map((p) => v.properties[p] || '-');
          lines.push(`| ${i + 1} | \`${v.key.slice(0, 12)}...\` | ${vals.join(' | ')} |`);
        });
        if (cs.variants.length > limit) {
          lines.push(
            `| _...${cs.variants.length - limit} more_ | | ${propArr.map(() => '').join(' | ')} |`,
          );
        }
        lines.push('');
      }
    }
  }

  // Standalone components
  if (inv.standaloneComponents.length > 0) {
    lines.push('## Standalone Components');
    lines.push('');
    lines.push('| # | Name | Key | Section |');
    lines.push('|---|------|-----|---------|');
    inv.standaloneComponents.forEach((c, i) => {
      lines.push(`| ${i + 1} | ${c.name} | \`${c.key.slice(0, 16)}...\` | ${c.section} |`);
    });
    lines.push('');
  }

  // Styles
  lines.push('## Styles');
  lines.push('');
  lines.push('| # | Name | Key | Type |');
  lines.push('|---|------|-----|------|');
  inv.styles.forEach((s, i) => {
    lines.push(`| ${i + 1} | ${s.name} | \`${s.key.slice(0, 16)}...\` | ${s.styleType} |`);
  });
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Coverage report: compare with component-map.ts
// ---------------------------------------------------------------------------

function generateCoverageReport(inv: InventoryOutput): string {
  // Keys used in component-map.ts (extracted statically from code reading)
  const codeKeys: Record<string, { context: string; name: string }> = {
    // SNIPPET_COMPONENT_MAP
    '17bada92cf5316683fa815df4ad6bf6b650acf28': {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'ESnippet (Desktop)',
    },
    fd4c85bc57a4b46b9587247035a5fd01b5df4a91: {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'ESnippet (Touch)',
    },
    ad30904f3637a4c14779a366e56b8d6173bbd78b: {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'EOfferItem (Desktop)',
    },
    '09f5630474c44e6514735edd7202c35adcf27613': {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'EOfferItem (Touch)',
    },
    a209c6636b3fa7c279731ef02c78065632b535c6: {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'EShopItem (Desktop)',
    },
    b1c1848c5454036cc48fdfaea06fcc14cd400980: {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'EShopItem (Touch)',
    },
    f921fc66ed6f56cccf558f7bcacbebcaa97495b7: {
      context: 'SNIPPET_COMPONENT_MAP',
      name: 'EProductSnippet2',
    },
    // LAYOUT_COMPONENT_MAP
    '6cea05769f0320a02cce6ce168573daa75395308': {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Header',
    },
    e8b88751731dfbe91a6951472ae0233f07c5c32a: {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Related',
    },
    '074d6f70fff0d97ec766385cf475ae43b70e9356': {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Pager',
    },
    '613e88ddf7078ead49e2573bae4929880bf3e770': {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Footer (Desktop)',
    },
    b9a5b3a68ea666aae0cb1b0c6f27500fda95d0b6: {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Footer (Touch)',
    },
    b49cc069e0de9428bfa913fd9a504011fafca336: {
      context: 'LAYOUT_COMPONENT_MAP',
      name: 'Title',
    },
    // FILTER_COMPONENTS
    af9d11ebc792f3fb6cef88babe0f092c6b8fd589: {
      context: 'FILTER_COMPONENTS',
      name: 'FilterButton (set)',
    },
    c3162fdf2f6fc1fb2252d14d73288265151d5b51: {
      context: 'FILTER_COMPONENTS',
      name: 'FilterButton (variant)',
    },
    a7ca09ed0f1e27d8b6bb038d6f91fa100f40b1bf: {
      context: 'FILTER_COMPONENTS',
      name: 'QuickFilterButton (set)',
    },
    '3729962e75d05135920ef313930f59ecd45e8bd5': {
      context: 'FILTER_COMPONENTS',
      name: 'QuickFilterButton (variant)',
    },
    // ASIDE_FILTER_COMPONENTS
    cd47767eeadd916860f6c7c0222a63a8f4b3c5b9: {
      context: 'ASIDE_FILTER_COMPONENTS',
      name: 'SectionTitle (set)',
    },
    '9a6666cffa6a4bd51a72be430526e517e33ef8fa': {
      context: 'ASIDE_FILTER_COMPONENTS',
      name: 'EnumFilterItem (set)',
    },
    '5da09ab6d1f513d699940e507379e254dbaf1ea7': {
      context: 'ASIDE_FILTER_COMPONENTS',
      name: 'CategoryItem (set)',
    },
    c3a1d52c5f471c2b55307225ae4350953826c781: {
      context: 'ASIDE_FILTER_COMPONENTS',
      name: 'NumberInput (set)',
    },
    // ETHUMB_CONFIG
    '8faefce0c971aee23cd154f600a4dfa1ae6cb50c': {
      context: 'ETHUMB_CONFIG',
      name: 'EThumb (set)',
    },
    '931437402c9c36ddf674a5680541f1d6eaf9363c': {
      context: 'ETHUMB_CONFIG',
      name: 'EThumb (Manual variant)',
    },
    // PAINT_STYLE_KEYS
    cc3c77fb5e00f762a4950a9fb73a82819c3408b9: {
      context: 'PAINT_STYLE_KEYS',
      name: 'Background/Primary',
    },
    b43d617320789eba79aed9086a546e7cacb2fee8: {
      context: 'PAINT_STYLE_KEYS',
      name: 'Background/Overflow',
    },
  };

  // Build lookup: all library keys (set keys + variant keys)
  const librarySetKeys = new Map(inv.componentSets.map((cs) => [cs.key, cs.name]));
  const libraryVariantKeys = new Map<string, { setName: string; variantName: string }>();
  for (const cs of inv.componentSets) {
    for (const v of cs.variants) {
      libraryVariantKeys.set(v.key, { setName: cs.name, variantName: v.name });
    }
  }

  const lines: string[] = [];
  lines.push('# Component Map Coverage Report');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Library: DC \u00b7 Ecom (\`x8INBftMZ21bme9kwZDu1A\`)`);
  lines.push('');

  // 1. Mapped keys validation
  lines.push('## 1. Code Key Validation');
  lines.push('');
  lines.push('Checking all component keys from `component-map.ts` against the library:');
  lines.push('');
  lines.push('| Status | Code Name | Key (16 chars) | Context | Library Match |');
  lines.push('|--------|-----------|----------------|---------|---------------|');

  let matchCount = 0;
  let staleCount = 0;
  const staleKeys: Array<{ key: string; name: string; context: string }> = [];

  for (const [key, info] of Object.entries(codeKeys)) {
    let status: string;
    let libraryMatch: string;

    if (librarySetKeys.has(key)) {
      status = 'OK';
      libraryMatch = `SET: ${librarySetKeys.get(key)}`;
      matchCount++;
    } else if (libraryVariantKeys.has(key)) {
      status = 'OK';
      const v = libraryVariantKeys.get(key)!;
      libraryMatch = `${v.setName} / ${v.variantName.slice(0, 40)}`;
      matchCount++;
    } else {
      status = 'STALE';
      libraryMatch = '_not found_';
      staleCount++;
      staleKeys.push({ key, name: info.name, context: info.context });
    }

    lines.push(
      `| ${status} | ${info.name} | \`${key.slice(0, 16)}\` | ${info.context} | ${libraryMatch} |`,
    );
  }
  lines.push('');

  // 2. Stale keys detail
  lines.push('## 2. Stale Keys (need update)');
  lines.push('');
  if (staleKeys.length === 0) {
    lines.push('All code keys are valid in the current library. No action needed.');
  } else {
    lines.push(`**${staleKeys.length} keys in code are NOT found in the library:**`);
    lines.push('');
    for (const s of staleKeys) {
      lines.push(`- \`${s.key}\` \u2014 **${s.name}** (${s.context})`);
    }
    lines.push('');
    lines.push(
      '> These keys may have changed after a component was republished. Re-fetch from the library.',
    );
  }
  lines.push('');

  // 3. Unmapped library components
  lines.push('## 3. Unmapped Library Components');
  lines.push('');
  lines.push('Component sets in the library that are NOT referenced in `component-map.ts`:');
  lines.push('');

  const codeKeySet = new Set(Object.keys(codeKeys));
  const unmappedSets = inv.componentSets.filter((cs) => {
    if (codeKeySet.has(cs.key)) return false;
    return !cs.variants.some((v) => codeKeySet.has(v.key));
  });

  if (unmappedSets.length === 0) {
    lines.push('_All library component sets are mapped in code._');
  } else {
    // Group by section
    const unmappedBySection = new Map<string, typeof unmappedSets>();
    for (const cs of unmappedSets) {
      if (!unmappedBySection.has(cs.section)) unmappedBySection.set(cs.section, []);
      unmappedBySection.get(cs.section)!.push(cs);
    }

    for (const [section, sets] of unmappedBySection) {
      lines.push(`### ${section} (${sets.length} unmapped)`);
      lines.push('');
      lines.push('| Name | Set Key (16) | Variants | Properties |');
      lines.push('|------|-------------|----------|------------|');
      for (const cs of sets) {
        const variantProps = cs.propertyDefinitions
          .filter((p) => p.type === 'VARIANT')
          .map((p) => p.name)
          .join(', ');
        lines.push(
          `| ${cs.name} | \`${cs.key.slice(0, 16)}\` | ${cs.variants.length} | ${variantProps || '-'} |`,
        );
      }
      lines.push('');
    }
  }

  // 4. Summary
  lines.push('## 4. Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Library component sets | ${inv.componentSets.length} |`);
  lines.push(`| Library total variants | ${inv.summary.totalVariants} |`);
  lines.push(`| Code keys checked | ${Object.keys(codeKeys).length} |`);
  lines.push(`| Valid keys | ${matchCount} |`);
  lines.push(`| Stale keys | ${staleCount} |`);
  lines.push(`| Unmapped component sets | ${unmappedSets.length} |`);
  lines.push(
    `| Set coverage | ${((1 - unmappedSets.length / inv.componentSets.length) * 100).toFixed(1)}% |`,
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
main();
