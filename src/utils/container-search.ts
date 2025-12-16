/**
 * Утилиты для поиска и работы с контейнерами сниппетов
 * Выделено из code.ts для переиспользования
 */

import { SNIPPET_CONTAINER_NAMES } from '../config';

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
      return figma.currentPage.findAll(n => SNIPPET_CONTAINER_NAMES.includes(n.name));
    } else {
      // Fallback для старых версий API
      figma.currentPage.children.forEach(child => {
        if (SNIPPET_CONTAINER_NAMES.includes(child.name)) containers.push(child);
        if ('findAll' in child) {
          containers.push(
            ...(child as SceneNode & ChildrenMixin).findAll(
              (n: SceneNode) => SNIPPET_CONTAINER_NAMES.includes(n.name)
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
      if (SNIPPET_CONTAINER_NAMES.includes(node.name) && !visited.has(node.id)) {
        containers.push(node);
        visited.add(node.id);
      }
      
      // Ищем внутри узла
      if ('findAll' in node) {
        const found = (node as SceneNode & ChildrenMixin).findAll(
          (n: SceneNode) => SNIPPET_CONTAINER_NAMES.includes(n.name)
        );
        for (const item of found) {
          if (!visited.has(item.id)) {
            containers.push(item);
            visited.add(item.id);
          }
        }
      }
    }
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
  containers.sort((a, b) => {
    const ay = a.absoluteTransform ? a.absoluteTransform[1][2] : a.y;
    const by = b.absoluteTransform ? b.absoluteTransform[1][2] : b.y;
    // Если разница по Y больше 10px — это разные строки
    if (Math.abs(ay - by) > 10) return ay - by;
    // Одна строка — сортируем по X
    const ax = a.absoluteTransform ? a.absoluteTransform[0][2] : a.x;
    const bx = b.absoluteTransform ? b.absoluteTransform[0][2] : b.x;
    return ax - bx;
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
 * @param node - Узел для проверки
 * @returns true если узел является контейнером сниппета
 */
export function isSnippetContainer(node: BaseNode): boolean {
  if (!node || (node as SceneNode).removed) return false;
  if (!('name' in node)) return false;
  return SNIPPET_CONTAINER_NAMES.includes(node.name);
}

/**
 * Находит ближайший контейнер-сниппет для слоя данных
 * Поднимается вверх по дереву от слоя до первого контейнера из SNIPPET_CONTAINER_NAMES
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
        if (SNIPPET_CONTAINER_NAMES.includes(current.name)) {
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

