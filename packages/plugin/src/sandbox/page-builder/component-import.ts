/**
 * Component Import — импорт и кэширование компонентов из библиотеки DC • ECOM
 */

import { Logger } from '../../logger';

/** Timeout for component import (ms) */
var IMPORT_TIMEOUT = 15000;

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

/**
 * Импортировать компонент из библиотеки с кэшированием
 */
export async function importComponent(key: string): Promise<ComponentNode | null> {
  if (!key) {
    Logger.warn('[PageCreator] Пустой ключ компонента');
    return null;
  }

  // Проверяем кэш
  if (componentCache.has(key)) {
    return componentCache.get(key)!;
  }

  try {
    const component = await Promise.race([
      figma.importComponentByKeyAsync(key),
      new Promise<never>(function (_, reject) {
        setTimeout(function () { reject(new Error('Import timeout after ' + IMPORT_TIMEOUT + 'ms')); }, IMPORT_TIMEOUT);
      })
    ]);
    componentCache.set(key, component);
    Logger.debug(`[PageCreator] Импортирован компонент: ${component.name} (key=${key})`);
    return component;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.error(`[PageCreator] Ошибка импорта компонента (key=${key}): ${msg}`);
    return null;
  }
}

/** Creates a placeholder frame when a library component is missing */
export async function createPlaceholder(name: string, width: number, height: number): Promise<FrameNode> {
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
