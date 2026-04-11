import type { FigmaNode, ComponentTreeNode } from './types';
import { resolveComponent } from './component-map';
import { resolveProps } from './prop-resolver';

/**
 * Recursively walk Figma JSON and build a ComponentTree.
 *
 * Decision tree per node:
 *   INSTANCE + mapped  -> kind=component (leaf, no recursion into children)
 *   INSTANCE + unmapped -> kind=layout (recurse into children)
 *   TEXT               -> kind=text
 *   has IMAGE fill     -> kind=image
 *   has children       -> kind=layout
 *   else               -> kind=unknown
 */
export function walkTree(node: FigmaNode): ComponentTreeNode {
  if (node.type === 'INSTANCE') {
    return walkInstance(node);
  }

  if (node.type === 'TEXT') {
    return {
      kind: 'text',
      figmaName: node.name,
      figmaId: node.id,
      figmaType: node.type,
      props: {},
      text: node.characters ?? '',
      children: [],
    };
  }

  const imageFill = node.fills?.find((f) => f.type === 'IMAGE');
  if (imageFill) {
    return {
      kind: 'image',
      figmaName: node.name,
      figmaId: node.id,
      figmaType: node.type,
      props: {},
      imageRef: imageFill.imageRef ?? '',
      children: [],
    };
  }

  if (node.children?.length) {
    return {
      kind: 'layout',
      figmaName: node.name,
      figmaId: node.id,
      figmaType: node.type,
      props: {},
      style: extractLayoutStyle(node),
      children: node.children.map(walkTree),
    };
  }

  return {
    kind: 'unknown',
    figmaName: node.name,
    figmaId: node.id,
    figmaType: node.type,
    props: {},
    children: [],
  };
}

function walkInstance(node: FigmaNode): ComponentTreeNode {
  const mapping = resolveComponent(node.name);

  if (mapping) {
    // Mapped component — leaf node (don't recurse into instance internals)
    return {
      kind: 'component',
      mapping,
      figmaName: node.name,
      figmaId: node.id,
      figmaType: node.type,
      props: resolveProps(node.componentProperties, mapping),
      children: [],
    };
  }

  // Unmapped instance — treat as layout, recurse into children
  return {
    kind: 'layout',
    figmaName: node.name,
    figmaId: node.id,
    figmaType: node.type,
    props: resolveProps(node.componentProperties, undefined),
    style: extractLayoutStyle(node),
    children: (node.children ?? []).map(walkTree),
  };
}

function extractLayoutStyle(node: FigmaNode): Record<string, string | number> {
  const style: Record<string, string | number> = {};

  if (node.layoutMode === 'HORIZONTAL') {
    style.display = 'flex';
    style.flexDirection = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    style.display = 'flex';
    style.flexDirection = 'column';
  }

  if (node.itemSpacing) style.gap = node.itemSpacing;
  if (node.paddingTop) style.paddingTop = node.paddingTop;
  if (node.paddingBottom) style.paddingBottom = node.paddingBottom;
  if (node.paddingLeft) style.paddingLeft = node.paddingLeft;
  if (node.paddingRight) style.paddingRight = node.paddingRight;

  if (node.primaryAxisAlignItems === 'CENTER') style.justifyContent = 'center';
  if (node.primaryAxisAlignItems === 'MAX') style.justifyContent = 'flex-end';
  if (node.primaryAxisAlignItems === 'SPACE_BETWEEN') style.justifyContent = 'space-between';
  if (node.counterAxisAlignItems === 'CENTER') style.alignItems = 'center';
  if (node.counterAxisAlignItems === 'MAX') style.alignItems = 'flex-end';

  return style;
}
