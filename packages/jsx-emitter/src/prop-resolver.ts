import type { ComponentMapping } from './types';

/**
 * Convert Figma componentProperties into React props via propMap.
 *
 * Figma props arrive as:
 *   { "withButton#123:0": { type: "BOOLEAN", value: true } }
 *
 * Steps:
 * 1. Strip Figma hash suffix (#123:0)
 * 2. Lookup in propMap (figmaPropName -> reactPropName)
 * 3. If no mapping, pass through with camelCase conversion
 * 4. Skip ignored props
 */
export function resolveProps(
  figmaProps: Record<string, { type: string; value: string | boolean }> | undefined,
  mapping: ComponentMapping | undefined,
): Record<string, string | boolean | number> {
  if (!figmaProps) return {};

  const result: Record<string, string | boolean | number> = {};
  const propMap = mapping?.propMap ?? {};
  const ignored = new Set(mapping?.ignoredProps ?? []);

  for (const [rawName, def] of Object.entries(figmaProps)) {
    // Strip Figma hash suffix
    const cleanName = stripHashSuffix(rawName);

    if (ignored.has(cleanName)) continue;

    // Map to React prop name
    const reactName = propMap[cleanName] ?? toCamelCase(cleanName);

    // Convert value by type
    if (def.type === 'BOOLEAN') {
      result[reactName] = def.value as boolean;
    } else if (def.type === 'VARIANT' || def.type === 'TEXT') {
      result[reactName] = def.value as string;
    }
    // INSTANCE_SWAP — skip for now
  }

  return result;
}

/** Strip Figma hash suffix: "withButton#123:0" -> "withButton" */
export function stripHashSuffix(name: string): string {
  return name.replace(/#[^#]+$/, '').trim();
}

/** Convert property name to camelCase: "withButton" stays, "Grid | List Control" -> "gridListControl" */
export function toCamelCase(s: string): string {
  return s
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
    .replace(/[\s_|/-]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}
