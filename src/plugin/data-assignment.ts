/**
 * Data Assignment — маппинг строк данных на контейнеры Figma
 */

import { Logger } from '../logger';
import { SNIPPET_CONTAINER_NAMES, TEXT_FIELD_NAMES } from '../config';
import { LayerDataItem, IMAGE_FIELDS } from '../types';
import { safeGetLayerName, safeGetLayerType } from '../utils/node-search';
import { findContainerForLayers, getContainerName, normalizeContainerName } from '../utils/container-search';
import { CSVRow, ContainerRowAssignment, ProgressCallback } from './types';

/** Список полей данных для поиска в ESnippet-формате */
const DATA_FIELD_PATTERNS = [
  'OrganicTitle', 'OrganicText', 'OrganicHost', 'OrganicPath', 'OrganicImage',
  'OrganicPrice', 'OldPrice', 'ShopName', 'FaviconImage', 'ThumbImage',
  'discount', 'ProductRating', 'ReviewCount', 'ProductURL'
];

const DATA_FIELD_NAMES_SET = new Set(
  DATA_FIELD_PATTERNS.map(p => p.toLowerCase())
);

/** Контейнеры, которые должны обрабатываться даже без data-layers */
const ALWAYS_PROCESS_CONTAINERS = new Set(['EShopItem', 'EOfferItem']);

// Типы и матчинг убраны — используется простое распределение по порядку

/** Нормализация имени поля */
function normalizeFieldName(name: string): string {
  return name ? String(name).trim().toLowerCase() : '';
}

/** Проверка, является ли поле изображением */
function isImageField(fieldName: string): boolean {
  const normalized = normalizeFieldName(fieldName);
  return IMAGE_FIELDS.some(f => normalizeFieldName(f as string) === normalized) ||
         normalized.endsWith('image');
}

/** Извлечение имени поля данных из имени слоя */
function extractDataFieldName(layerName: string): string {
  if (layerName.startsWith('#')) return layerName;
  
  const lowerName = layerName.toLowerCase();
  for (const field of DATA_FIELD_NAMES_SET) {
    if (lowerName.includes(field)) {
      return '#' + field.charAt(0).toUpperCase() + field.slice(1);
    }
  }
  
  return layerName;
}

/**
 * Группировка контейнеров и поиск data-слоёв
 */
export function groupContainersWithDataLayers(
  allContainers: SceneNode[],
  onProgress?: ProgressCallback
): Map<string, SceneNode[]> {
  const snippetGroups = new Map<string, SceneNode[]>();
  const containerIds = new Set(allContainers.map(c => c.id));
  
  let containerIndex = 0;
  const totalContainers = allContainers.length;
  
  for (const container of allContainers) {
    containerIndex++;
    
    if (container.removed) {
      if (onProgress && containerIndex % 3 === 0) {
        const progress = 15 + Math.floor((containerIndex / totalContainers) * 25);
        onProgress(Math.min(40, progress), 100, `Анализ контейнеров: ${containerIndex}/${totalContainers}`, 'grouping');
      }
      continue;
    }
    
    // Поиск data-слоёв внутри контейнера
    let dataLayers: SceneNode[] = [];
    
    if ('findAll' in container) {
      dataLayers = (container as SceneNode & ChildrenMixin).findAll((n: SceneNode) => {
        if (n.name.startsWith('#')) return true;
        
        for (const pattern of DATA_FIELD_PATTERNS) {
          if (n.name.includes(pattern)) return true;
        }
        
        return false;
      });
    }
    
    // Если data layers не найдено — включаем только для ALWAYS_PROCESS_CONTAINERS
    if (dataLayers.length === 0) {
      if (ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
        snippetGroups.set(container.id, []);
      }
      continue;
    }
    
    // Фильтрация: берем только те слои, для которых этот контейнер является БЛИЖАЙШИМ
    const validLayers: SceneNode[] = [];
    
    for (const layer of dataLayers) {
      let isDirectChild = true;
      let currentParent = layer.parent;
      
      while (currentParent && currentParent.id !== container.id) {
        if (containerIds.has(currentParent.id) && SNIPPET_CONTAINER_NAMES.includes(currentParent.name)) {
          isDirectChild = false;
          break;
        }
        currentParent = currentParent.parent;
      }
      
      if (isDirectChild) {
        validLayers.push(layer);
      }
    }
    
    if (validLayers.length > 0) {
      snippetGroups.set(container.id, validLayers);
    } else if (ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
      snippetGroups.set(container.id, []);
    }
    
    // Прогресс
    if (onProgress && (containerIndex % 3 === 0 || containerIndex % Math.max(1, Math.floor(totalContainers / 10)) === 0)) {
      const progress = 15 + Math.floor((containerIndex / totalContainers) * 25);
      onProgress(Math.min(40, progress), 100, `Группировка сниппетов: ${containerIndex}/${totalContainers}`, 'grouping');
    }
  }
  
  return snippetGroups;
}

/**
 * Распределение строк по контейнерам — ЦИКЛИЧЕСКОЕ ПОВТОРЕНИЕ
 * Данные применяются по порядку, при нехватке — повторяются с начала
 */
export function assignRowsToContainers(
  rows: CSVRow[],
  snippetGroups: Map<string, SceneNode[]>
): Map<string, ContainerRowAssignment> {
  const containerRowAssignments = new Map<string, ContainerRowAssignment>();
  
  if (rows.length === 0) {
    Logger.info(`📊 [data-assignment] Нет данных для распределения`);
    return containerRowAssignments;
  }
  
  // Собираем все ключи контейнеров в порядке их появления
  const containerKeys = Array.from(snippetGroups.keys());
  
  Logger.info(`📊 [data-assignment] Циклическое распределение:`);
  Logger.info(`   📄 Строк данных: ${rows.length}`);
  Logger.info(`   📦 Контейнеров: ${containerKeys.length}`);
  
  // Назначаем строки контейнерам по порядку с циклическим повторением
  for (let i = 0; i < containerKeys.length; i++) {
    const containerKey = containerKeys[i];
    const rowIndex = i % rows.length;  // Циклический индекс
    const row = rows[rowIndex];
    
    containerRowAssignments.set(containerKey, { row, rowIndex });
    
    const title = (row['#Title'] || row['#OrganicTitle'] || '').substring(0, 40);
    const cycleNote = i >= rows.length ? ` (цикл ${Math.floor(i / rows.length) + 1})` : '';
    Logger.info(`   ✅ [${i + 1}] ${containerKey} ← строка ${rowIndex + 1}: "${title}..."${cycleNote}`);
  }
  
  if (containerKeys.length > rows.length) {
    const cycles = Math.ceil(containerKeys.length / rows.length);
    Logger.info(`   🔄 Данные использованы ${cycles} раз(а)`);
  }
  
  return containerRowAssignments;
}

/**
 * Создание layerData для обработки
 */
export function createLayerData(
  snippetGroups: Map<string, SceneNode[]>,
  containerRowAssignments: Map<string, ContainerRowAssignment>
): LayerDataItem[] {
  const layerData: LayerDataItem[] = [];
  
  for (const [containerKey, layers] of snippetGroups) {
    const validLayers = layers.filter(layer => !layer.removed);
    if (validLayers.length === 0) continue;
    
    const assignment = containerRowAssignments.get(containerKey);
    if (!assignment) continue;
    
    const { row, rowIndex } = assignment;
    
    // Создаём карту нормализованных ключей
    const rowKeyMap: { [key: string]: string } = {};
    try {
      for (const key in row) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          const value = row[key];
          if (value !== undefined) {
            rowKeyMap[normalizeFieldName(key)] = value;
          }
        }
      }
    } catch (e) { /* ignore */ }
    
    const processedFieldNames = new Set<string>();
    
    for (const layer of validLayers) {
      const rawLayerName = safeGetLayerName(layer);
      if (!rawLayerName) continue;
      
      const fieldName = extractDataFieldName(rawLayerName);
      
      if (processedFieldNames.has(fieldName)) continue;
      processedFieldNames.add(fieldName);
      
      const normName = normalizeFieldName(fieldName);
      const direct = row[fieldName];
      const fallback = rowKeyMap[normName];
      const fieldValue = (direct !== undefined && direct !== null ? direct : fallback);
      
      if (fieldValue === undefined || fieldValue === null || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
        continue;
      }
      
      const layerType = safeGetLayerType(layer);
      if (!layerType) continue;
      
      let isTextLayer = layerType === 'TEXT';
      const isImageLayer = isImageField(fieldName);
      const isShapeLayer = ['RECTANGLE', 'ELLIPSE', 'POLYGON'].includes(layerType);
      
      if (layerType === 'INSTANCE') {
        if (TEXT_FIELD_NAMES.includes(normalizeFieldName(fieldName))) {
          isTextLayer = true;
        }
      }
      
      layerData.push({
        layer,
        rowIndex,
        fieldName,
        fieldValue,
        isImage: isImageLayer,
        isText: isTextLayer,
        isShape: isShapeLayer,
        row
      });
    }
  }
  
  return layerData;
}

/**
 * Подготовка контейнеров для компонентной логики
 */
export function prepareContainersForProcessing(
  snippetGroups: Map<string, SceneNode[]>,
  containerRowAssignments: Map<string, ContainerRowAssignment>
): Map<string, { row: CSVRow | null; container: BaseNode | null }> {
  const containersToProcess = new Map<string, { row: CSVRow | null; container: BaseNode | null }>();
  
  for (const [containerKey, layers] of snippetGroups) {
    const container = findContainerForLayers(layers, containerKey);
    if (!container) continue;
    
    const assignment = containerRowAssignments.get(containerKey);
    let assignedRow = assignment ? assignment.row : null;
    
    // Stub-строка для EShopItem/EOfferItem без назначенной строки
    const containerName = getContainerName(container);
    if (!assignedRow && (containerName === 'EShopItem' || containerName === 'EOfferItem')) {
      assignedRow = {
        '#SnippetType': containerName,
        '#BUTTON': 'true',
        '#ButtonView': containerName === 'EShopItem' ? 'secondary' : 'white',
        '#ButtonType': 'shop'
      };
    }
    
    containersToProcess.set(containerKey, { row: assignedRow, container });
  }
  
  return containersToProcess;
}
