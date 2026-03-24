/**
 * Layer Search — утилиты поиска заполняемых слоёв
 *
 * Strategy 'image': searches for #OrganicImage first, skips "White BG",
 *   checks minimum dimensions (>20px). Used for image grid panels.
 * Strategy 'simple': finds first node with fills (not TEXT, not removed).
 *   Used for favicons and avatars.
 */

/**
 * Finds a fillable layer inside a node tree.
 */
export function findFillableLayer(
  node: BaseNode,
  strategy: 'image' | 'simple' = 'simple'
): SceneNode | null {
  if (strategy === 'image') {
    return findFillableLayerImage(node as SceneNode);
  }
  return findFillableLayerSimple(node);
}

/**
 * Simple strategy: first node with fills (not TEXT, not removed).
 * Used for favicons and avatars.
 */
function findFillableLayerSimple(node: BaseNode): SceneNode | null {
  if (node.type !== 'TEXT' && 'fills' in node && !node.removed) {
    return node as SceneNode;
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findFillableLayerSimple(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Image strategy: searches for #OrganicImage first, skips "White BG",
 * checks minimum dimensions (>20px). Used for image grid panels.
 */
function findFillableLayerImage(node: SceneNode): SceneNode | null {
  if (!('children' in node)) return null;
  const children = (node as FrameNode).children;

  // Приоритет: слой с именем #OrganicImage
  for (let ci = 0; ci < children.length; ci++) {
    if (children[ci].name === '#OrganicImage' && 'fills' in children[ci]) {
      return children[ci];
    }
  }

  // Fallback: первый fillable слой (пропускаем служебные вроде White BG)
  for (let ci = 0; ci < children.length; ci++) {
    const child = children[ci];
    if (child.removed || child.type === 'TEXT') continue;
    if (child.name === 'White BG') continue;
    if ('fills' in child && 'width' in child) {
      const w = (child as SceneNode & { width: number }).width;
      const h = (child as SceneNode & { height: number }).height;
      if (w > 20 && h > 20) return child;
    }
    const deep = findFillableLayerImage(child);
    if (deep) return deep;
  }
  return null;
}
