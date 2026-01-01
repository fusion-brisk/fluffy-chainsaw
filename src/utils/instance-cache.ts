/**
 * Deep Cache — кэширование инстансов, TEXT и GROUP нод для ускорения handlers
 *
 * Проблема: Каждый handler вызывает findInstanceByName + findTextNode 3-10 раз,
 * что приводит к ~10000+ рекурсивных обходов на 79 контейнеров.
 *
 * Решение: Один проход по дереву контейнера, кэширование ВСЕХ нод.
 * Lookup по имени — O(1) вместо O(n).
 */

import { Logger } from '../logger';

/**
 * Deep Cache — расширенный кэш с TEXT и GROUP нодами
 */
export interface DeepCache {
  /** Кэш инстансов по имени */
  instances: Map<string, InstanceNode>;
  /** Кэш TEXT нод по имени */
  textNodes: Map<string, TextNode>;
  /** Кэш GROUP/FRAME нод по имени */
  groups: Map<string, FrameNode | GroupNode>;
  /** Все TEXT ноды (для поиска по предикату) */
  allTextNodes: TextNode[];
  /** Статистика */
  stats: {
    nodeCount: number;
    instanceCount: number;
    textCount: number;
    groupCount: number;
    buildTime: number;
  };
}

// Для обратной совместимости
export type InstanceCache = DeepCache;

/**
 * Строит Deep Cache для контейнера за один проход
 *
 * @param container - контейнер для обхода
 * @returns DeepCache с кэшированными нодами
 */
export function buildInstanceCache(container: BaseNode): DeepCache {
  const cache: DeepCache = {
    instances: new Map(),
    textNodes: new Map(),
    groups: new Map(),
    allTextNodes: [],
    stats: {
      nodeCount: 0,
      instanceCount: 0,
      textCount: 0,
      groupCount: 0,
      buildTime: 0,
    },
  };

  const startTime = Date.now();

  const traverse = (node: BaseNode): void => {
    if (!node || (node as SceneNode).removed) return;
    cache.stats.nodeCount++;

    const nodeType = node.type;
    const nodeName = 'name' in node ? node.name : '';

    // Кэшируем INSTANCE ноды
    if (nodeType === 'INSTANCE') {
      const instance = node as InstanceNode;
      if (!cache.instances.has(nodeName)) {
        cache.instances.set(nodeName, instance);
      }
      cache.stats.instanceCount++;
    }

    // Кэшируем TEXT ноды
    if (nodeType === 'TEXT') {
      const textNode = node as TextNode;
      cache.allTextNodes.push(textNode);
      if (!cache.textNodes.has(nodeName)) {
        cache.textNodes.set(nodeName, textNode);
      }
      cache.stats.textCount++;
    }

    // Кэшируем GROUP и FRAME ноды
    if (nodeType === 'GROUP' || nodeType === 'FRAME') {
      const groupNode = node as FrameNode | GroupNode;
      if (!cache.groups.has(nodeName)) {
        cache.groups.set(nodeName, groupNode);
      }
      cache.stats.groupCount++;
    }

    // Рекурсивно обходим детей
    if ('children' in node && node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };

  traverse(container);

  cache.stats.buildTime = Date.now() - startTime;

  if (cache.stats.buildTime > 50) {
    Logger.debug(
      `📦 [DeepCache] Built: ${cache.stats.instanceCount} inst, ${cache.stats.textCount} text, ${cache.stats.groupCount} groups from ${cache.stats.nodeCount} nodes in ${cache.stats.buildTime}ms`
    );
  }

  return cache;
}

// ==================== INSTANCE HELPERS ====================

/**
 * Получает инстанс из кэша по имени
 */
export function getCachedInstance(cache: DeepCache, name: string): InstanceNode | null {
  return cache.instances.get(name) ?? null;
}

/**
 * Получает инстанс из кэша, пробуя несколько вариантов имени
 */
export function getCachedInstanceByNames(
  cache: DeepCache,
  names: string[]
): InstanceNode | null {
  for (const name of names) {
    const instance = cache.instances.get(name);
    if (instance) return instance;
  }
  return null;
}

/**
 * Проверяет, есть ли инстанс с указанным именем в кэше
 */
export function hasCachedInstance(cache: DeepCache, name: string): boolean {
  return cache.instances.has(name);
}

// ==================== TEXT NODE HELPERS ====================

/**
 * Получает TEXT ноду из кэша по имени
 */
export function getCachedTextNode(cache: DeepCache, name: string): TextNode | null {
  return cache.textNodes.get(name) ?? null;
}

/**
 * Получает TEXT ноду из кэша, пробуя несколько вариантов имени
 */
export function getCachedTextNodeByNames(
  cache: DeepCache,
  names: string[]
): TextNode | null {
  for (const name of names) {
    const textNode = cache.textNodes.get(name);
    if (textNode) return textNode;
  }
  return null;
}

/**
 * Ищет TEXT ноду по предикату (используя кэшированный массив)
 * Гораздо быстрее чем рекурсивный поиск
 */
export function findCachedTextByPredicate(
  cache: DeepCache,
  predicate: (node: TextNode) => boolean
): TextNode | null {
  for (const textNode of cache.allTextNodes) {
    if (!textNode.removed && predicate(textNode)) {
      return textNode;
    }
  }
  return null;
}

/**
 * Ищет TEXT ноду, содержащую цифры (для цен)
 */
export function findCachedNumericText(cache: DeepCache): TextNode | null {
  return findCachedTextByPredicate(cache, (node) => /\d/.test(node.characters));
}

/**
 * Ищет TEXT ноду по частичному совпадению имени
 */
export function findCachedTextByNameContains(
  cache: DeepCache,
  substring: string
): TextNode | null {
  const lowerSubstring = substring.toLowerCase();
  return findCachedTextByPredicate(
    cache,
    (node) => node.name.toLowerCase().includes(lowerSubstring)
  );
}

// ==================== GROUP/FRAME HELPERS ====================

/**
 * Получает GROUP/FRAME ноду из кэша по имени
 */
export function getCachedGroup(
  cache: DeepCache,
  name: string
): FrameNode | GroupNode | null {
  return cache.groups.get(name) ?? null;
}

/**
 * Получает GROUP/FRAME ноду из кэша, пробуя несколько вариантов имени
 */
export function getCachedGroupByNames(
  cache: DeepCache,
  names: string[]
): FrameNode | GroupNode | null {
  for (const name of names) {
    const group = cache.groups.get(name);
    if (group) return group;
  }
  return null;
}

// ==================== STATS ====================

/**
 * Получает статистику кэша (для отладки)
 */
export function getCacheStats(cache: DeepCache): {
  size: number;
  instances: number;
  textNodes: number;
  groups: number;
  buildTime: number;
} {
  return {
    size: cache.stats.nodeCount,
    instances: cache.instances.size,
    textNodes: cache.textNodes.size,
    groups: cache.groups.size,
    buildTime: cache.stats.buildTime,
  };
}
