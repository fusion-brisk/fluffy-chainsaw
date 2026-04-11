import type { ComponentTreeNode, EmitterOptions } from './types';

const DEFAULT_OPTIONS: Required<EmitterOptions> = {
  indent: 2,
  rootWrapper: 'fragment',
  includeStyles: true,
  includeTodos: true,
};

/**
 * Generate a JSX string from a ComponentTree.
 * Returns { jsx, imports } ready for copy-paste.
 */
export function emitJSX(
  tree: ComponentTreeNode,
  options?: EmitterOptions,
): { jsx: string; imports: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const importSet = new Map<string, Set<string>>();

  const jsx = renderNode(tree, 0, opts, importSet);

  // Build import statements
  const importLines: string[] = [];
  for (const [path, names] of importSet) {
    const sorted = [...names].sort();
    importLines.push(`import { ${sorted.join(', ')} } from '${path}';`);
  }

  // Wrap
  let wrapped = jsx;
  if (opts.rootWrapper === 'fragment') {
    wrapped = `<>\n${jsx}\n</>`;
  } else if (opts.rootWrapper === 'div') {
    wrapped = `<div>\n${jsx}\n</div>`;
  }

  return {
    jsx: wrapped,
    imports: importLines.join('\n'),
  };
}

function renderNode(
  node: ComponentTreeNode,
  depth: number,
  opts: Required<EmitterOptions>,
  importSet: Map<string, Set<string>>,
): string {
  const pad = ' '.repeat(depth * opts.indent);

  switch (node.kind) {
    case 'component':
      return renderComponent(node, depth, opts, importSet);

    case 'text':
      if (!node.text) return '';
      return `${pad}<span>${escapeJSX(node.text)}</span>`;

    case 'image':
      return `${pad}<img src={/* ${escapeComment(node.imageRef ?? 'TODO')} */} alt="${escapeAttr(node.figmaName)}" />`;

    case 'layout':
      return renderLayout(node, depth, opts, importSet);

    case 'unknown':
      if (opts.includeTodos) {
        return `${pad}{/* TODO: unknown node "${escapeComment(node.figmaName)}" (${escapeComment(node.figmaType)}) */}`;
      }
      return '';

    default:
      return '';
  }
}

function renderComponent(
  node: ComponentTreeNode,
  depth: number,
  opts: Required<EmitterOptions>,
  importSet: Map<string, Set<string>>,
): string {
  const pad = ' '.repeat(depth * opts.indent);
  const mapping = node.mapping!;

  // Track import
  if (!importSet.has(mapping.importPath)) {
    importSet.set(mapping.importPath, new Set());
  }
  importSet.get(mapping.importPath)!.add(mapping.componentName);

  const propsStr = buildPropsString(node.props);

  if (node.children.length === 0) {
    return `${pad}<${mapping.componentName}${propsStr} />`;
  }

  const childrenJSX = node.children
    .map((c) => renderNode(c, depth + 1, opts, importSet))
    .filter(Boolean)
    .join('\n');

  return `${pad}<${mapping.componentName}${propsStr}>\n${childrenJSX}\n${pad}</${mapping.componentName}>`;
}

function renderLayout(
  node: ComponentTreeNode,
  depth: number,
  opts: Required<EmitterOptions>,
  importSet: Map<string, Set<string>>,
): string {
  const pad = ' '.repeat(depth * opts.indent);
  const children = node.children
    .map((c) => renderNode(c, depth + 1, opts, importSet))
    .filter(Boolean);

  if (children.length === 0) return '';

  // Single child without styles — unwrap
  if (children.length === 1 && !opts.includeStyles) {
    return children[0];
  }

  const styleStr =
    opts.includeStyles && node.style && Object.keys(node.style).length > 0
      ? ` style={${JSON.stringify(node.style)}}`
      : '';

  const comment = opts.includeTodos ? ` {/* ${escapeComment(node.figmaName)} */}` : '';

  return `${pad}<div${styleStr}>${comment}\n${children.join('\n')}\n${pad}</div>`;
}

function buildPropsString(props: Record<string, string | boolean | number>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return '';

  const parts = entries.map(([key, value]) => {
    if (typeof value === 'boolean') {
      return value ? ` ${key}` : ` ${key}={false}`;
    }
    if (typeof value === 'number') {
      return ` ${key}={${value}}`;
    }
    return ` ${key}="${escapeAttr(value)}"`;
  });

  return parts.join('');
}

function escapeJSX(s: string): string {
  return s.replace(/[{}<>&]/g, (c) => {
    switch (c) {
      case '{':
        return '&#123;';
      case '}':
        return '&#125;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      default:
        return c;
    }
  });
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

// Sanitize a string for embedding inside a JSX comment.
// Prevents comment termination injection via star-slash sequences.
function escapeComment(s: string): string {
  return s.replace(/\*\//g, '* /');
}
