/**
 * Утилиты для поиска и работы с контейнерами сниппетов
 * Выделено из code.ts для переиспользования
 */

import { SNIPPET_CONTAINER_NAMES } from '../config';
import { Logger } from '../logger';

/**
 * Проверяет, является ли имя узла сниппет-контейнером
 * Поддерживает как точное совпадение ("EShopItem"), так и с суффиксом ("EShopItem 2")
 * 
 * Паттерн: базовое имя может быть с пробелом и числом в конце (копии в Figma)
 * Примеры: "EShopItem", "EShopItem 2", "EShopItem 123", "ESnippet", "ESnippet 5"
 */
function isSnippetContainerName(name: string): boolean {
  // Точное совпадение
  if (SNIPPET_CONTAINER_NAMES.includes(name)) return true;
  
  // Проверяем паттерн "BaseName N" где N — число
  // Убираем суффикс " N" и проверяем базовое имя
  const baseNameMatch = name.match(/^(.+?)\s+\d+$/);
  if (baseNameMatch && baseNameMatch[1]) {
    const baseName = baseNameMatch[1];
    return SNIPPET_CONTAINER_NAMES.includes(baseName);
  }
  
  return false;
}

/**
 * Поиск всех контейнеров сниппетов в заданной области
 * @param scope - 'page' для всей страницы или 'selection' для выделения
 * @returns Массив найденных контейнеров
 */
export function findSnippetContainers(scope: 'page' | 'selection'): SceneNode[] {
  const containers: SceneNode[] = [];

  if (scope === 'page') {
    // Быстрый поиск по всей странице через нативный findAll
    if (figma.currentPage.findAll) {
      const found = figma.currentPage.findAll(n => isSnippetContainerName(n.name));
      Logger.debug(`📦 [findSnippetContainers] page: найдено ${found.length} контейнеров`);
      // Логируем типы найденных контейнеров
      const typeCounts: Record<string, number> = {};
      for (const n of found) {
        const baseName = n.name.replace(/\s+\d+$/, '');
        typeCounts[baseName] = (typeCounts[baseName] || 0) + 1;
      }
      Logger.debug(`📦 [findSnippetContainers] типы: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      return found;
    } else {
      // Fallback для старых версий API
      figma.currentPage.children.forEach(child => {
        if (isSnippetContainerName(child.name)) containers.push(child);
        if ('findAll' in child) {
          containers.push(
            ...(child as SceneNode & ChildrenMixin).findAll(
              (n: SceneNode) => isSnippetContainerName(n.name)
            )
          );
        }
      });
    }
  } else {
    // Поиск в выделении
    const visited = new Set<string>();
    
    for (const node of figma.currentPage.selection) {
      if (node.removed) continue;
      
      // Проверяем сам узел
      if (isSnippetContainerName(node.name) && !visited.has(node.id)) {
        containers.push(node);
        visited.add(node.id);
      }
      
      // Ищем внутри узла
      if ('findAll' in node) {
        const found = (node as SceneNode & ChildrenMixin).findAll(
          (n: SceneNode) => isSnippetContainerName(n.name)
        );
        for (const item of found) {
          if (!visited.has(item.id)) {
            containers.push(item);
            visited.add(item.id);
          }
        }
      }
    }
    
    Logger.debug(`📦 [findSnippetContainers] selection: найдено ${containers.length} контейнеров`);
  }

  return containers;
}

/**
 * Сортировка контейнеров по визуальной позиции (Y → X)
 * Гарантирует соответствие порядка контейнеров в Figma порядку сниппетов в HTML
 * @param containers - Массив контейнеров для сортировки
 * @returns Отсортированный массив (мутирует оригинал)
 */
export function sortContainersByPosition(containers: SceneNode[]): SceneNode[] {
  // Кэшируем позиции ПЕРЕД сортировкой — одно обращение к absoluteTransform на контейнер
  // Это критично, т.к. каждое обращение к absoluteTransform вызывает пересчёт layout в Figma
  const positionCache = new Map<string, { x: number; y: number }>();
  
  for (const c of containers) {
    const x = c.absoluteTransform ? c.absoluteTransform[0][2] : c.x;
    const y = c.absoluteTransform ? c.absoluteTransform[1][2] : c.y;
    positionCache.set(c.id, { x, y });
  }
  
  containers.sort((a, b) => {
    const posA = positionCache.get(a.id)!;
    const posB = positionCache.get(b.id)!;
    // Если разница по Y больше 10px — это разные строки
    if (Math.abs(posA.y - posB.y) > 10) return posA.y - posB.y;
    // Одна строка — сортируем по X
    return posA.x - posB.x;
  });
  return containers;
}

/**
 * Нормализация имени контейнера к базовому типу
 * @param name - Имя контейнера (может содержать суффиксы)
 * @returns Базовое имя типа контейнера
 */
export function normalizeContainerName(name: string): string {
  if (!name) return 'unknown';
  const lower = name.toLowerCase();
  
  // Прямые совпадения
  for (const base of SNIPPET_CONTAINER_NAMES) {
    if (lower === base.toLowerCase()) return base;
  }
  
  // Префиксное совпадение: имя начинается с базового типа
  for (const base of SNIPPET_CONTAINER_NAMES) {
    if (lower.startsWith(base.toLowerCase())) return base;
  }
  
  return name;
}

/**
 * Проверка, является ли узел контейнером сниппета
 * Поддерживает суффиксы копий ("EShopItem 2", "ESnippet 3")
 * @param node - Узел для проверки
 * @returns true если узел является контейнером сниппета
 */
export function isSnippetContainer(node: BaseNode): boolean {
  if (!node || (node as SceneNode).removed) return false;
  if (!('name' in node)) return false;
  return isSnippetContainerName(node.name);
}

/**
 * Находит ближайший контейнер-сниппет для слоя данных
 * Поднимается вверх по дереву от слоя до первого контейнера-сниппета
 * Поддерживает суффиксы копий ("EShopItem 2", "ESnippet 3")
 * 
 * @param layer - Слой данных (или массив слоёв)
 * @param containerKey - ID контейнера (используется как fallback через figma.getNodeById)
 * @returns Найденный контейнер или null
 */
export function findContainerForLayers(
  layers: SceneNode[] | null,
  containerKey?: string
): BaseNode | null {
  // 1. Пробуем найти через parent traversal от слоёв
  if (layers && layers.length > 0) {
    for (const layer of layers) {
      if (layer.removed) continue;
      let current: BaseNode | null = layer.parent;
      while (current) {
        if (isSnippetContainerName(current.name)) {
          return current;
        }
        current = current.parent;
      }
    }
  }
  
  // 2. Fallback: получаем контейнер напрямую по ID
  if (containerKey) {
    try {
      const byId = figma.getNodeById(containerKey);
      if (byId && !byId.removed) {
        return byId as BaseNode;
      }
    } catch (e) {
      // ignore
    }
  }
  
  return null;
}

/**
 * Получает имя контейнера безопасно
 * @param container - Контейнер
 * @returns Имя контейнера или пустая строка
 */
export function getContainerName(container: BaseNode | null): string {
  if (!container) return '';
  return ('name' in container) ? String(container.name) : '';
}

