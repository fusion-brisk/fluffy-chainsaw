/**
 * Container Structure Cache — кэш структуры контейнеров
 * Строится один раз при старте обработки, используется handlers и image-handlers
 * Цель: избежать повторных рекурсивных обходов дерева
 */

import { Logger } from '../logger';

export interface ContainerStructure {
  textLayers: Map<string, TextNode>;           // name → node
  imageLayers: SceneNode[];                    // fillable nodes (RECTANGLE, ELLIPSE, POLYGON, VECTOR)
  instances: Map<string, InstanceNode>;        // name → instance
  allInstances: InstanceNode[];                // все инстансы в контейнере
  allNodes: Map<string, SceneNode>;            // name → node (первый с таким именем)
  allNodesByName: Map<string, SceneNode[]>;    // name → все ноды с таким именем
  allNodesList: SceneNode[];                   // все ноды для поиска по подстроке
}

// Глобальный кэш структур контейнеров
const containerStructureCache = new Map<string, ContainerStructure>();

// Кэш принадлежности нод к контейнерам (nodeId → containerId)
const nodeToContainerCache = new Map<string, string>();

/**
 * Типы нод, которые могут принимать изображения (fills)
 */
const FILLABLE_TYPES = new Set(['RECTANGLE', 'ELLIPSE', 'POLYGON', 'VECTOR', 'FRAME']);

/**
 * Построение кэша структуры для всех контейнеров
 * Вызывается один раз в snippet-processor после сортировки
 */
export function buildContainerStructureCache(containers: SceneNode[]): void {
  const startTime = Date.now();
  containerStructureCache.clear();
  nodeToContainerCache.clear();
  
  let totalNodes = 0;
  
  for (const container of containers) {
    if (!container || container.removed) continue;
    if (!('findAll' in container)) continue;
    
    const frame = container as FrameNode | InstanceNode;
    const structure: ContainerStructure = {
      textLayers: new Map(),
      imageLayers: [],
      instances: new Map(),
      allInstances: [],
      allNodes: new Map(),
      allNodesByName: new Map(),
      allNodesList: []
    };
    
    // Один findAll для всех детей контейнера
    let allChildren: SceneNode[];
    try {
      allChildren = frame.findAll(() => true);
    } catch (e) {
      Logger.warn(`⚠️ [Cache] Ошибка findAll для ${container.name}: ${e}`);
      continue;
    }
    
    totalNodes += allChildren.length;
    
    for (const node of allChildren) {
      if (node.removed) continue;
      
      const nodeName = node.name;
      
      // Все ноды в контейнере (для поиска по подстроке)
      structure.allNodesList.push(node);
      
      // Индексируем по имени (первый с таким именем)
      if (!structure.allNodes.has(nodeName)) {
        structure.allNodes.set(nodeName, node);
      }
      
      // Все ноды с таким именем
      const existing = structure.allNodesByName.get(nodeName);
      if (existing) {
        existing.push(node);
      } else {
        structure.allNodesByName.set(nodeName, [node]);
      }
      
      // Типизированные коллекции
      if (node.type === 'TEXT') {
        if (!structure.textLayers.has(nodeName)) {
          structure.textLayers.set(nodeName, node as TextNode);
        }
      } else if (node.type === 'INSTANCE') {
        if (!structure.instances.has(nodeName)) {
          structure.instances.set(nodeName, node as InstanceNode);
        }
        structure.allInstances.push(node as InstanceNode);
      }
      
      // Fillable слои для изображений
      if (FILLABLE_TYPES.has(node.type)) {
        structure.imageLayers.push(node);
      }
      
      // Кэш принадлежности
      nodeToContainerCache.set(node.id, container.id);
    }
    
    containerStructureCache.set(container.id, structure);
  }
  
  const elapsed = Date.now() - startTime;
  Logger.info(`📦 [Cache] Построен кэш: ${containers.length} контейнеров, ${totalNodes} нод за ${elapsed}ms`);
}

/**
 * Получить структуру контейнера по ID
 */
export function getContainerStructure(containerId: string): ContainerStructure | undefined {
  return containerStructureCache.get(containerId);
}

/**
 * Найти ноду по имени в конкретном контейнере (O(1) вместо рекурсии)
 */
export function findCachedNodeByName(containerId: string, name: string): SceneNode | undefined {
  const structure = containerStructureCache.get(containerId);
  return structure?.allNodes.get(name);
}

/**
 * Найти все ноды с именем в контейнере
 */
export function findAllCachedNodesByName(containerId: string, name: string): SceneNode[] {
  const structure = containerStructureCache.get(containerId);
  return structure?.allNodesByName.get(name) || [];
}

/**
 * Найти все ноды, содержащие подстроку в имени (линейный поиск по кэшу)
 */
export function findAllCachedNodesByNameContains(containerId: string, needle: string): SceneNode[] {
  const structure = containerStructureCache.get(containerId);
  if (!structure) return [];
  
  const results: SceneNode[] = [];
  for (const node of structure.allNodesList) {
    if (!node.removed && node.name.indexOf(needle) !== -1) {
      results.push(node);
    }
  }
  return results;
}

/**
 * Получить все инстансы в контейнере
 */
export function getAllCachedInstances(containerId: string): InstanceNode[] {
  const structure = containerStructureCache.get(containerId);
  if (!structure) return [];
  // Фильтруем removed
  return structure.allInstances.filter(inst => !inst.removed);
}

/**
 * Найти текстовый слой по имени в контейнере (O(1))
 */
export function findCachedTextLayer(containerId: string, name: string): TextNode | undefined {
  const structure = containerStructureCache.get(containerId);
  return structure?.textLayers.get(name);
}

/**
 * Найти инстанс по имени в контейнере (O(1))
 */
export function findCachedInstance(containerId: string, name: string): InstanceNode | undefined {
  const structure = containerStructureCache.get(containerId);
  return structure?.instances.get(name);
}

/**
 * Получить первый fillable слой для изображения
 */
export function getFirstImageTarget(containerId: string): SceneNode | undefined {
  const structure = containerStructureCache.get(containerId);
  if (!structure || structure.imageLayers.length === 0) return undefined;
  
  // Приоритет: RECTANGLE > ELLIPSE > POLYGON > VECTOR > FRAME
  const priorities: { [key: string]: number } = {
    'RECTANGLE': 0,
    'ELLIPSE': 1,
    'POLYGON': 2,
    'VECTOR': 3,
    'FRAME': 4
  };
  
  // Сортируем по приоритету и возвращаем первый
  const sorted = structure.imageLayers.slice().sort((a, b) => {
    const pa = priorities[a.type] ?? 99;
    const pb = priorities[b.type] ?? 99;
    return pa - pb;
  });
  
  return sorted[0];
}

/**
 * Найти fillable слой по имени в контейнере
 */
export function findImageTargetByName(containerId: string, name: string): SceneNode | undefined {
  const structure = containerStructureCache.get(containerId);
  if (!structure) return undefined;
  
  // Ищем среди imageLayers по имени
  for (const layer of structure.imageLayers) {
    if (layer.name === name && !layer.removed) {
      return layer;
    }
  }
  
  return undefined;
}

/**
 * Получить ID контейнера по ID ноды
 * ОПТИМИЗАЦИЯ: если nodeId это сам контейнер — возвращаем его сразу
 */
export function getContainerIdForNode(nodeId: string): string | undefined {
  // Если это сам контейнер — вернуть его же
  if (containerStructureCache.has(nodeId)) return nodeId;
  return nodeToContainerCache.get(nodeId);
}

/**
 * Очистка кэша (вызывается в конце обработки)
 */
export function clearContainerStructureCache(): void {
  containerStructureCache.clear();
  nodeToContainerCache.clear();
  Logger.debug(`🧹 [Cache] Кэш структуры очищен`);
}

/**
 * Проверка, есть ли кэш для контейнера
 */
export function hasContainerCache(containerId: string): boolean {
  return containerStructureCache.has(containerId);
}

/**
 * Статистика кэша (для отладки)
 */
export function getCacheStats(): { containers: number; totalNodes: number } {
  let totalNodes = 0;
  for (const structure of containerStructureCache.values()) {
    totalNodes += structure.allNodes.size;
  }
  return {
    containers: containerStructureCache.size,
    totalNodes
  };
}

