/**
 * Утилиты для поиска узлов в Figma документе
 * Выделено из component-handlers.ts для переиспользования
 */

/**
 * Поиск инстанса по точному имени (рекурсивно)
 */
export function findInstanceByName(node: BaseNode, name: string): InstanceNode | null {
  if (node.type === 'INSTANCE' && node.name === name && !node.removed) {
    return node as InstanceNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findInstanceByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Поиск текстового слоя по точному имени (рекурсивно)
 */
export function findTextLayerByName(node: BaseNode, name: string): TextNode | null {
  if (node.type === 'TEXT' && node.name === name && !node.removed) {
    return node as TextNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findTextLayerByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Поиск первого узла по точному имени (рекурсивно)
 */
export function findFirstNodeByName(node: BaseNode, name: string): BaseNode | null {
  if (!node || (node as SceneNode).removed) return null;
  if ('name' in node && node.name === name && !(node as SceneNode).removed) {
    return node;
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findFirstNodeByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Поиск первого TEXT узла по предикату (рекурсивно)
 */
export function findFirstTextByPredicate(node: BaseNode, predicate: (t: TextNode) => boolean): TextNode | null {
  if (!node || (node as SceneNode).removed) return null;
  if (node.type === 'TEXT' && !node.removed) {
    const t = node as TextNode;
    if (predicate(t)) return t;
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findFirstTextByPredicate(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Поиск группы (GROUP или FRAME) по имени
 */
export function findGroupByName(node: BaseNode, name: string): GroupNode | FrameNode | null {
  if ((node.type === 'GROUP' || node.type === 'FRAME') && node.name === name && !node.removed) {
    return node as GroupNode | FrameNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findGroupByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Поиск всех узлов по точному имени (рекурсивно)
 */
export function findAllNodesByName(node: BaseNode, name: string): SceneNode[] {
  const results: SceneNode[] = [];
  
  if ('name' in node && node.name === name && !node.removed) {
    results.push(node as SceneNode);
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      results.push(...findAllNodesByName(child, name));
    }
  }
  
  return results;
}

/**
 * Поиск всех узлов, содержащих подстроку в имени (рекурсивно)
 */
export function findAllNodesByNameContains(node: BaseNode, needle: string): SceneNode[] {
  const results: SceneNode[] = [];
  if (!node || (node as SceneNode).removed) return results;
  
  try {
    if ('name' in node && typeof node.name === 'string') {
      if (node.name.indexOf(needle) !== -1 && !(node as SceneNode).removed) {
        results.push(node as SceneNode);
      }
    }
  } catch (e) {
    // ignore
  }

  if ('children' in node && node.children) {
    for (const child of node.children) {
      results.push(...findAllNodesByNameContains(child, needle));
    }
  }
  return results;
}

/**
 * Поиск ближайшего предка с указанным именем до stopAt
 */
export function findNearestNamedAncestor(
  node: SceneNode,
  stopAt: BaseNode,
  ancestorName: string
): SceneNode | null {
  let cur: BaseNode | null = node;
  while (cur && cur !== stopAt) {
    const parent = (cur as SceneNode).parent as BaseNode | null;
    if (!parent) break;
    if ('name' in parent && (parent as SceneNode).name === ancestorName && !(parent as SceneNode).removed) {
      return parent as SceneNode;
    }
    cur = parent;
  }
  return null;
}

/**
 * Поиск всех инстансов внутри узла (рекурсивно)
 */
export function findAllInstances(node: BaseNode): InstanceNode[] {
  const out: InstanceNode[] = [];
  if (!node || (node as SceneNode).removed) return out;
  if ((node as SceneNode).type === 'INSTANCE') out.push(node as InstanceNode);
  if ('children' in node && node.children) {
    for (const child of node.children) {
      out.push(...findAllInstances(child));
    }
  }
  return out;
}

/**
 * Получить первое текстовое значение из узла (рекурсивно)
 */
export function findFirstTextValue(node: BaseNode): string {
  try {
    if (!node || (node as SceneNode).removed) return '';
    if (node.type === 'TEXT') {
      const t = node as TextNode;
      return (t.characters || '').trim();
    }
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const v = findFirstTextValue(child);
        if (v) return v;
      }
    }
  } catch (e) {
    // ignore
  }
  return '';
}

/**
 * Безопасная установка текста с автоматической загрузкой шрифта
 */
export async function safeSetTextNode(textNode: TextNode, value: string): Promise<void> {
  try {
    if (!textNode || textNode.removed) return;
    const fontName = textNode.fontName;
    if (fontName && fontName !== figma.mixed && typeof fontName === 'object') {
      await figma.loadFontAsync(fontName as FontName);
    } else if (fontName === figma.mixed) {
      // Берем шрифт первого символа
      const len = (textNode.characters || '').length;
      if (len > 0) {
        const first = textNode.getRangeFontName(0, 1);
        if (first && first !== figma.mixed && typeof first === 'object') {
          await figma.loadFontAsync(first as FontName);
        }
      }
    }
    textNode.characters = value;
  } catch (e) {
    // ignore
  }
}

/**
 * Безопасное получение имени слоя
 */
export function safeGetLayerName(layer: SceneNode): string | null {
  try {
    if (layer.removed) return null;
    return layer.name;
  } catch {
    return null;
  }
}

/**
 * Безопасное получение типа слоя
 */
export function safeGetLayerType(layer: SceneNode): string | null {
  try {
    if (layer.removed) return null;
    return layer.type;
  } catch {
    return null;
  }
}

