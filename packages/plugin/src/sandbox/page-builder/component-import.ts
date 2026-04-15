/**
 * Component Import — импорт и кэширование компонентов из библиотеки DC • ECOM
 */

import { Logger } from '../../logger';

/** Timeout for component loading (ms) */
const IMPORT_TIMEOUT = 15000;

/**
 * Кэш импортированных компонентов
 * Ключ — component key, значение — ComponentNode
 */
const componentCache = new Map<string, ComponentNode>();

/**
 * Очистить кэш компонентов
 */
export function clearComponentCache(): void {
  componentCache.clear();
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Import timeout after ' + IMPORT_TIMEOUT + 'ms'));
      }, IMPORT_TIMEOUT);
    }),
  ]);
}

/**
 * Find a variant in a ComponentSet matching the given props.
 * Falls back to first child if no exact match.
 */
function findVariant(
  componentSet: ComponentSetNode,
  variantProps?: Record<string, string | boolean>,
): ComponentNode | null {
  if (!variantProps) {
    const first = componentSet.children[0] as ComponentNode | undefined;
    return first && first.type === 'COMPONENT' ? first : null;
  }

  for (let i = 0; i < componentSet.children.length; i++) {
    const child = componentSet.children[i];
    if (child.type !== 'COMPONENT') continue;
    const props = (child as ComponentNode).variantProperties;
    if (!props) continue;
    let match = true;
    const keys = Object.keys(variantProps);
    for (let k = 0; k < keys.length; k++) {
      if (props[keys[k]] !== String(variantProps[keys[k]])) {
        match = false;
        break;
      }
    }
    if (match) return child as ComponentNode;
  }

  // Fallback: first variant
  const first = componentSet.children[0] as ComponentNode | undefined;
  return first && first.type === 'COMPONENT' ? first : null;
}

/**
 * Импортировать компонент из библиотеки с кэшированием.
 * Tries importComponentByKeyAsync first (variant key),
 * then importComponentSetByKeyAsync (set key) with variant selection.
 */
export async function loadComponent(
  key: string,
  variantProps?: Record<string, string | boolean>,
): Promise<ComponentNode | null> {
  if (!key) {
    Logger.warn('[PageCreator] Пустой ключ компонента');
    return null;
  }

  const cacheKey = variantProps ? key + ':' + JSON.stringify(variantProps) : key;
  if (componentCache.has(cacheKey)) {
    return componentCache.get(cacheKey)!;
  }

  try {
    const component = await withTimeout(figma.importComponentByKeyAsync(key));
    componentCache.set(cacheKey, component);
    Logger.debug('[PageCreator] Импортирован компонент: ' + component.name + ' (key=' + key + ')');
    return component;
  } catch (_e1) {
    // Fallback: try as ComponentSet key → find variant by props
    try {
      const componentSet = await withTimeout(figma.importComponentSetByKeyAsync(key));
      const variant = findVariant(componentSet, variantProps);
      if (variant) {
        componentCache.set(cacheKey, variant);
        Logger.debug(
          '[PageCreator] Импортирован через ComponentSet: ' +
            variant.name +
            ' (setKey=' +
            key +
            ')',
        );
        return variant;
      }
    } catch (_e2) {
      // Both methods failed
    }
    const msg = _e1 instanceof Error ? _e1.message : String(_e1);
    Logger.error('[PageCreator] Ошибка импорта компонента (key=' + key + '): ' + msg);
    return null;
  }
}

/** Creates a placeholder frame when a library component is missing */
export async function createPlaceholder(
  name: string,
  width: number,
  height: number,
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = '\u26A0 ' + name + ' (component not found)';
  frame.resize(width, height);
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.9 } }];

  const text = figma.createText();
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  } catch {
    try {
      await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    } catch {
      // Last resort: use whatever default font Figma provides
    }
  }
  text.characters = name;
  text.fontSize = 12;
  text.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
  text.x = 8;
  text.y = 8;
  frame.appendChild(text);

  return frame;
}
