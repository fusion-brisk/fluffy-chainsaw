/**
 * tree-to-html — converts a Figma node tree to an HTML string with inline CSS.
 *
 * Scope: sandbox (ES5 via Babel). No Figma API calls — pure transform.
 */

import { nodeToCss, CssNodeProps, FigmaPaint } from './tree-to-css';

export interface HtmlNode extends CssNodeProps {
  id: string;
  name: string;
  type: string;
  characters?: string;
  children?: HtmlNode[];
  fills?: (FigmaPaint & { imageRef?: string })[];
}

export type ImageMap = Record<string, string>;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasImageFill(node: HtmlNode): string | null {
  if (!node.fills) return null;
  for (let i = 0; i < node.fills.length; i++) {
    const fill = node.fills[i];
    if (fill.type === 'IMAGE' && fill.imageRef) {
      return fill.imageRef;
    }
  }
  return null;
}

function buildStyleAttr(css: string): string {
  return css ? ' style="' + css + '"' : '';
}

/**
 * Converts a Figma node tree to an HTML string for visual preview.
 *
 * Rules:
 * - TEXT nodes → `<span style="...">escaped text</span>`
 * - Nodes with IMAGE fill → `<img src="..." alt="name" style="..." />`
 * - Container nodes with children → `<div style="...">recursive children</div>`
 * - Leaf nodes without special treatment → `<!-- name -->`
 *
 * @param node - The Figma node to convert.
 * @param imageMap - Optional map of imageRef → data URI for image fills.
 */
export function nodeToHtml(node: HtmlNode, imageMap?: ImageMap): string {
  const css = nodeToCss(node);
  const styleAttr = buildStyleAttr(css);

  // TEXT node → <span>
  if (node.type === 'TEXT') {
    const text = node.characters !== undefined ? escapeHtml(node.characters) : '';
    return '<span' + styleAttr + '>' + text + '</span>';
  }

  // IMAGE fill → <img>
  const imageRef = hasImageFill(node);
  if (imageRef !== null) {
    const src = imageMap && imageMap[imageRef] ? imageMap[imageRef] : '';
    const altAttr = ' alt="' + escapeHtml(node.name) + '"';
    const srcAttr = ' src="' + src + '"';
    return '<img' + srcAttr + altAttr + styleAttr + ' />';
  }

  // Container with children → <div>
  if (node.children && node.children.length > 0) {
    let inner = '';
    for (let i = 0; i < node.children.length; i++) {
      inner += nodeToHtml(node.children[i], imageMap);
    }
    return '<div' + styleAttr + '>' + inner + '</div>';
  }

  // Leaf node → HTML comment
  return '<!-- ' + node.name + ' -->';
}
