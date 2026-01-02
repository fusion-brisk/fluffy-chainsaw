/**
 * Data Assignment — маппинг строк данных на контейнеры Figma
 * 
 * Оптимизация: Single-pass группировка — один findAll по странице
 */

import { Logger } from '../logger';
import { SNIPPET_CONTAINER_NAMES, TEXT_FIELD_NAMES } from '../config';
// Container cache отключен для экономии памяти
// import { getContainerStructure } from '../utils/container-cache';
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

/**
 * Кэш имён контейнеров — заполняется при группировке,
 * используется для определения типа контейнера без figma.getNodeById
 * (который недоступен в режиме documentAccess: dynamic-page)
 */
const containerNamesCache = new Map<string, string>();

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
 * Проверка, является ли узел data-слоем
 * ОПТИМИЗАЦИЯ: Минимальная работа в предикате
 */
function isDataLayer(node: SceneNode): boolean {
  // Быстрый выход для удалённых нод
  if (node.removed) return false;
  
  const name = node.name;
  // Быстрая проверка # (самый частый случай)
  if (name.charCodeAt(0) === 35) return true; // '#' = 35
  
  // Пропускаем явно не-data слои по первому символу
  // Data fields начинаются с заглавной буквы (Organic, Old, Shop, etc.)
  const firstChar = name.charCodeAt(0);
  if (firstChar < 65 || firstChar > 90) return false; // Не A-Z
  
  // Проверяем паттерны только для потенциальных кандидатов
  for (let i = 0; i < DATA_FIELD_PATTERNS.length; i++) {
    if (name.indexOf(DATA_FIELD_PATTERNS[i]) !== -1) return true;
  }
  return false;
}

/** 
 * Быстрая фильтрация data-слоёв в JS (после findAll)
 * Использует Set для O(1) lookup по точному имени
 */
const EXACT_DATA_NAMES = new Set([
  '#OrganicTitle', '#OrganicText', '#OrganicHost', '#OrganicPath', '#OrganicImage',
  '#OrganicPrice', '#OldPrice', '#ShopName', '#FaviconImage', '#ThumbImage',
  '#discount', '#ProductRating', '#ReviewCount', '#ProductURL', '#query',
  '#LabelDiscount_View', '#DiscountPrefix', '#DiscountPercent', '#Fintech_Type',
  '#EPriceGroup_Fintech', '#EPriceGroup_Discount', '#EPriceGroup_OldPrice'
]);

function isDataLayerFast(name: string): boolean {
  // Быстрая проверка точного имени (O(1))
  if (EXACT_DATA_NAMES.has(name)) return true;
  
  // Проверка # в начале
  if (name.charCodeAt(0) === 35) return true;
  
  // Быстрый выход для не A-Z
  const firstChar = name.charCodeAt(0);
  if (firstChar < 65 || firstChar > 90) return false;
  
  // Проверяем паттерны
  for (let i = 0; i < DATA_FIELD_PATTERNS.length; i++) {
    if (name.indexOf(DATA_FIELD_PATTERNS[i]) !== -1) return true;
  }
  return false;
}

/**
 * Найти ID контейнера-предка для слоя с кэшированием
 * Кэширует промежуточные узлы для ускорения поиска siblings
 * 
 * @param node - слой для поиска
 * @param containerIds - Set с ID контейнеров
 * @param ancestorCache - кэш nodeId → containerId (или null если не найден)
 * @returns [containerId, depth] для диагностики
 */
function findAncestorContainerIdCached(
  node: SceneNode,
  containerIds: Set<string>,
  ancestorCache: Map<string, string | null>
): [string | null, number] {
  const pathStack: string[] = [];
  let current: BaseNode | null = node.parent;
  let depth = 0;
  
  while (current) {
    depth++;
    const currentId = current.id;
    
    // Проверяем кэш — если уже видели этот узел, используем результат
    if (ancestorCache.has(currentId)) {
      const cachedResult = ancestorCache.get(currentId)!;
      // Кэшируем весь пройденный путь
      for (const pathId of pathStack) {
        ancestorCache.set(pathId, cachedResult);
      }
      return [cachedResult, depth];
    }
    
    pathStack.push(currentId);
    
    // Проверяем, является ли текущий узел контейнером
    if (containerIds.has(currentId)) {
      // Кэшируем весь путь как ведущий к этому контейнеру
      for (const pathId of pathStack) {
        ancestorCache.set(pathId, currentId);
      }
      return [currentId, depth];
    }
    
    current = current.parent;
  }
  
  // Не нашли контейнер — кэшируем весь путь как null
  for (const pathId of pathStack) {
    ancestorCache.set(pathId, null);
  }
  return [null, depth];
}

/**
 * Группировка контейнеров и поиск data-слоёв
 * ОПТИМИЗАЦИЯ v3: Single-pass — один findAll по области поиска
 * 
 * Было: 79 × findAll (по каждому контейнеру) = 19 секунд
 * Стало: 1 × findAll + группировка = ~2-3 секунды
 */
export function groupContainersWithDataLayers(
  allContainers: SceneNode[],
  onProgress?: ProgressCallback,
  searchRoot?: BaseNode
): Map<string, SceneNode[]> {
  const snippetGroups = new Map<string, SceneNode[]>();
  const totalContainers = allContainers.length;
  
  const overallStart = Date.now();
  
  // ОПТИМИЗАЦИЯ: Один проход для создания Set + кэширования имён
  // Было: 2 прохода (map + for loop) = 11.7s
  // Стало: 1 проход = ~6s
  const cacheStart = Date.now();
  const containerIds = new Set<string>();
  for (let i = 0; i < allContainers.length; i++) {
    const container = allContainers[i];
    if (!container.removed) {
      const id = container.id;
      containerIds.add(id);
      containerNamesCache.set(id, container.name);
    }
  }
  const cacheTime = Date.now() - cacheStart;
  
  // Прогресс: начало
  if (onProgress) {
    onProgress(20, 100, `Поиск data-слоёв...`, 'grouping');
  }
  
  // ОПТИМИЗАЦИЯ v5: Один проход с оптимизированным предикатом
  // Ключ: минимизировать обращения к свойствам node (каждое = API call)
  const findAllStart = Date.now();
  let allDataLayers: SceneNode[] = [];
  
  // Определяем область поиска
  const root = searchRoot || figma.currentPage;
  const rootName = 'name' in root ? root.name : 'Page';
  
  if ('findAll' in root) {
    // Один проход с оптимизированным предикатом
    // Читаем node.name ОДИН раз и делаем все проверки
    allDataLayers = (root as PageNode | FrameNode).findAll((node) => {
      if (node.removed) return false;
      
      // Читаем имя ОДИН раз
      const name = node.name;
      
      // Быстрая проверка # (самый частый data-layer)
      if (name.charCodeAt(0) === 35) return true;
      
      // Early exit для не-A-Z (большинство нод)
      const firstChar = name.charCodeAt(0);
      if (firstChar < 65 || firstChar > 90) return false;
      
      // Проверка известных паттернов
      // Используем indexOf вместо includes (чуть быстрее)
      for (let i = 0; i < DATA_FIELD_PATTERNS.length; i++) {
        if (name.indexOf(DATA_FIELD_PATTERNS[i]) !== -1) return true;
      }
      return false;
    });
  }
  
  const findAllTime = Date.now() - findAllStart;
  
  // === ДИАГНОСТИКА: findAll ===
  Logger.info(`📊 [Grouping] findAll на "${rootName}": ${allDataLayers.length} data-слоёв за ${findAllTime}ms`);
  
  // Прогресс: findAll завершён
  if (onProgress) {
    onProgress(30, 100, `Найдено ${allDataLayers.length} data-слоёв, группировка...`, 'grouping');
  }
  
  // ОПТИМИЗАЦИЯ: Ancestor cache — кэширует промежуточные узлы
  // Siblings часто имеют общих предков → повторное использование
  const ancestorCache = new Map<string, string | null>();
  
  // Группируем слои по контейнерам-предкам
  const groupStart = Date.now();
  let assignedCount = 0;
  let orphanCount = 0;
  let totalDepth = 0;
  let maxDepth = 0;
  let cacheHits = 0;
  
  for (const layer of allDataLayers) {
    const cacheSize = ancestorCache.size;
    const [containerId, depth] = findAncestorContainerIdCached(layer, containerIds, ancestorCache);
    
    // Если кэш вырос меньше чем на depth, значит были cache hits
    const newEntries = ancestorCache.size - cacheSize;
    if (newEntries < depth) {
      cacheHits += (depth - newEntries);
    }
    
    totalDepth += depth;
    if (depth > maxDepth) maxDepth = depth;
    
    if (containerId) {
      let layers = snippetGroups.get(containerId);
      if (!layers) {
        layers = [];
        snippetGroups.set(containerId, layers);
      }
      layers.push(layer);
      assignedCount++;
    } else {
      orphanCount++;
    }
  }
  
  const groupTime = Date.now() - groupStart;
  const avgDepth = allDataLayers.length > 0 ? (totalDepth / allDataLayers.length).toFixed(1) : '0';
  const hitRate = totalDepth > 0 ? ((cacheHits / totalDepth) * 100).toFixed(0) : '0';
  
  // === ДИАГНОСТИКА: Группировка ===
  Logger.info(`📊 [Grouping] Ancestor traversal: ${assignedCount} слоёв → ${snippetGroups.size} контейнеров за ${groupTime}ms`);
  Logger.info(`📊 [Grouping] Depth stats: avg=${avgDepth}, max=${maxDepth}, orphans=${orphanCount}`);
  Logger.info(`📊 [Grouping] Ancestor cache: ${ancestorCache.size} entries, ${cacheHits} hits (${hitRate}% hit rate)`);
  
  // Добавляем контейнеры без data-layers (EShopItem, EOfferItem)
  let addedEmpty = 0;
  for (const container of allContainers) {
    if (!snippetGroups.has(container.id) && ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
      snippetGroups.set(container.id, []);
      addedEmpty++;
    }
  }
  
  // Прогресс: завершено
  if (onProgress) {
    onProgress(40, 100, `Группировка завершена: ${snippetGroups.size} контейнеров`, 'grouping');
  }
  
  const totalTime = Date.now() - overallStart;
  
  // === ДИАГНОСТИКА: Итог ===
  Logger.info(`📊 [Grouping] ИТОГО: ${totalTime}ms (cache: ${cacheTime}ms, findAll: ${findAllTime}ms, group: ${groupTime}ms)`);
  Logger.info(`📊 [Grouping] Результат: ${snippetGroups.size} групп (${assignedCount} с данными, ${addedEmpty} пустых)`);
  
  return snippetGroups;
}

/**
 * Старая версия группировки (для сравнения)
 * @deprecated Используйте groupContainersWithDataLayers с searchRoot
 */
export function groupContainersWithDataLayersLegacy(
  allContainers: SceneNode[],
  onProgress?: ProgressCallback
): Map<string, SceneNode[]> {
  const snippetGroups = new Map<string, SceneNode[]>();
  
  let totalDataLayers = 0;
  let containerIndex = 0;
  const totalContainers = allContainers.length;
  
  for (const container of allContainers) {
    containerIndex++;
    
    if (container.removed) continue;
    
    // Кэшируем имя контейнера
    containerNamesCache.set(container.id, container.name);
    
    // Прямой поиск data-слоёв через findAll
    const dataLayers: SceneNode[] = [];
    
    if ('findAll' in container) {
      const found = (container as SceneNode & ChildrenMixin).findAll(isDataLayer);
      dataLayers.push(...found);
    }
    
    totalDataLayers += dataLayers.length;
    
    // Сохраняем результат
    if (dataLayers.length > 0) {
      snippetGroups.set(container.id, dataLayers);
    } else if (ALWAYS_PROCESS_CONTAINERS.has(container.name)) {
      snippetGroups.set(container.id, []);
    }
    
    // Прогресс
    if (onProgress && (containerIndex % 5 === 0 || containerIndex === totalContainers)) {
      const progress = 20 + Math.floor((containerIndex / totalContainers) * 20);
      onProgress(Math.min(40, progress), 100, `Группировка: ${containerIndex}/${totalContainers}`, 'grouping');
    }
  }
  
  Logger.debug(`📊 [Legacy] Найдено ${totalDataLayers} data-слоёв в ${snippetGroups.size} контейнерах`);
  
  return snippetGroups;
}

/**
 * Получить тип контейнера по его ID — использует кэш имён
 * (figma.getNodeById недоступен в режиме documentAccess: dynamic-page)
 */
function getContainerType(containerKey: string): string {
  // Используем кэш имён — он заполняется при группировке контейнеров
  const cachedName = containerNamesCache.get(containerKey);
  
  if (cachedName) {
    const normalized = normalizeContainerName(cachedName);
    Logger.debug(`🔍 [getContainerType] key="${containerKey}" → cachedName="${cachedName}" → "${normalized}"`);
    return normalized;
  }
  
  Logger.warn(`⚠️ [getContainerType] Имя не найдено в кэше: key="${containerKey}"`);
  return 'Unknown';
}

/**
 * Распределение строк по контейнерам — ДВЕ ОЧЕРЕДИ
 * 
 * Логика:
 * 1. Каталожные данные (#isCatalogPage=true) — отдельная очередь ТОЛЬКО для ESnippet
 * 2. Товарные данные — общая очередь для ВСЕХ типов контейнеров
 * 
 * Порядок заполнения ESnippet:
 * - Сначала берём из каталожной очереди (пока не закончится)
 * - Потом переключаемся на общую очередь (циклически)
 * 
 * Порядок заполнения других контейнеров:
 * - Только общая очередь (циклически)
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
  
  // Разделяем rows на каталожные (EThumbGroup) и товарные
  const catalogQueue = rows.filter(r => r['#isCatalogPage'] === 'true');
  const productQueue = rows.filter(r => r['#isCatalogPage'] !== 'true');
  
  // Собираем контейнеры в порядке появления
  const containerKeys = Array.from(snippetGroups.keys());
  
  // ДИАГНОСТИКА: первые 3 ключа
  Logger.debug(`🔍 [data-assignment] Первые 3 ключа контейнеров: ${containerKeys.slice(0, 3).join(', ')}`);
  
  // Считаем типы контейнеров для логирования
  let eSnippetCount = 0;
  let otherCount = 0;
  for (const key of containerKeys) {
    const type = getContainerType(key);
    // ДИАГНОСТИКА: логируем все типы
    if (eSnippetCount + otherCount < 3) {
      Logger.debug(`🔍 [data-assignment] Container key="${key}" → type="${type}"`);
    }
    if (type === 'ESnippet' || type === 'Snippet') {
      eSnippetCount++;
    } else {
      otherCount++;
    }
  }
  
  // Статистика по imageType
  const thumbGroupCount = rows.filter(r => r['#imageType'] === 'EThumbGroup').length;
  const thumbGroupWithPrice = productQueue.filter(r => r['#imageType'] === 'EThumbGroup').length;
  
  Logger.info(`📊 [data-assignment] Две очереди:`);
  Logger.info(`   📄 Каталожная очередь: ${catalogQueue.length} (только для ESnippet)`);
  Logger.info(`   📄 Общая очередь: ${productQueue.length} (для всех)`);
  Logger.info(`   🖼️ EThumbGroup всего: ${thumbGroupCount} (каталог: ${catalogQueue.length}, товар: ${thumbGroupWithPrice})`);
  Logger.info(`   📦 ESnippet контейнеров: ${eSnippetCount}`);
  Logger.info(`   📦 Других контейнеров: ${otherCount}`);
  
  // Индексы для очередей
  let catalogUsed = 0;  // Сколько каталожных уже использовано (НЕ циклически!)
  let productIndex = 0; // Индекс в общей очереди (циклически)
  
  // Назначаем данные контейнерам в порядке появления
  for (const containerKey of containerKeys) {
    const containerType = getContainerType(containerKey);
    const isESnippet = containerType === 'ESnippet' || containerType === 'Snippet';
    
    let row: CSVRow | null = null;
    let rowIndex = 0;
    let source = '';
    
    if (isESnippet) {
      // ESnippet: сначала каталожная очередь, потом общая
      if (catalogUsed < catalogQueue.length) {
        // Есть ещё каталожные данные — берём их
        row = catalogQueue[catalogUsed];
        rowIndex = rows.indexOf(row);
        catalogUsed++;
        source = 'каталог';
      } else if (productQueue.length > 0) {
        // Каталожные закончились — берём из общей очереди (циклически)
        const idx = productIndex % productQueue.length;
        row = productQueue[idx];
        rowIndex = rows.indexOf(row);
        productIndex++;
        source = 'товар';
      }
    } else {
      // Не-ESnippet: только общая очередь (циклически)
      if (productQueue.length > 0) {
        const idx = productIndex % productQueue.length;
        row = productQueue[idx];
        rowIndex = rows.indexOf(row);
        productIndex++;
        source = 'товар';
      }
    }
    
    if (row) {
      containerRowAssignments.set(containerKey, { row, rowIndex });
      const title = (row['#Title'] || row['#OrganicTitle'] || '').substring(0, 35);
      const queueInfo = source === 'каталог' ? `каталог ${catalogUsed}/${catalogQueue.length}` : `товар`;
      const imageType = row['#imageType'] || 'N/A';
      const isCatalogPage = row['#isCatalogPage'] || 'N/A';
      Logger.info(`   ✅ ${containerType} ← [${queueInfo}] "${title}..." (imageType=${imageType}, catalog=${isCatalogPage})`);
    } else {
      Logger.warn(`   ⚠️ ${containerType} — нет подходящих данных`);
    }
  }
  
  // Итоговая статистика
  if (catalogQueue.length > 0) {
    Logger.info(`   📊 Использовано каталожных: ${catalogUsed}/${catalogQueue.length}`);
  }
  if (productQueue.length > 0 && productIndex > 0) {
    const cycles = Math.ceil(productIndex / productQueue.length);
    Logger.info(`   📊 Общая очередь: ${productIndex} назначений (${cycles} цикл${cycles > 1 ? 'а/ов' : ''})`);
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
    
    // Добавляем ID контейнера в row для использования кэшем в image-handlers
    row['#_containerId'] = containerKey;
    
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
