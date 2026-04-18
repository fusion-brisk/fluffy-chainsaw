/**
 * export-handler — orchestrates walkTree + emitJSX + nodeToHtml + assembleHtml
 * to produce a self-contained HTML export file.
 *
 * Scope: sandbox (ES5 via Babel). No Figma API calls — pure transform.
 */

import { walkTree } from '../../../../../packages/jsx-emitter/src/tree-walker';
import { emitJSX } from '../../../../../packages/jsx-emitter/src/jsx-emitter';
import { nodeToHtml } from './tree-to-html';
import { assembleHtml } from './html-template';
import type { HtmlNode, ImageMap } from './tree-to-html';

export interface ExportHtmlResult {
  /** Complete self-contained HTML document */
  html: string;
  /** Suggested file name, e.g. "MyFrame.html" */
  fileName: string;
}

/**
 * Replaces characters outside [a-zA-Z0-9_\-. ] with a dash.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, '-') + '.html';
}

/**
 * Builds a self-contained HTML export from a Figma node.
 *
 * Steps:
 * 1. walkTree(node)               → ComponentTreeNode
 * 2. emitJSX(tree, options)       → { jsx, imports }
 * 3. nodeToHtml(node, imageMap)   → preview HTML string
 * 4. assembleHtml(...)            → full HTML document
 *
 * @param node     - Figma node (FRAME / INSTANCE / etc.)
 * @param imageMap - Optional map of imageRef → data URI
 */
export function buildExportHtml(node: HtmlNode, imageMap?: ImageMap): ExportHtmlResult {
  // Step 1 — build ComponentTree
  var tree = walkTree(node);

  // Step 2 — emit JSX
  var emitted = emitJSX(tree, {
    rootWrapper: 'none',
    includeStyles: false,
    includeTodos: true,
  });

  // Combine imports + JSX into one code block
  var jsxCode = emitted.imports.length > 0 ? emitted.imports + '\n\n' + emitted.jsx : emitted.jsx;

  // Step 3 — render preview HTML
  var previewHtml = nodeToHtml(node, imageMap);

  // Step 4 — assemble final document
  var html = assembleHtml({
    title: node.name,
    jsxCode: jsxCode,
    previewHtml: previewHtml,
  });

  return {
    html: html,
    fileName: sanitizeFileName(node.name),
  };
}
